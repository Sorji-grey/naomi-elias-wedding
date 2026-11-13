/* Naomi & Elias — the live courtyard.
   Loads the Blender scene (scene/courtyard.glb) and draws it in real time on the hero canvas.
   main.js owns scroll; it calls window.flight3d.set(u) with u = 0 (overhead) … 1 (eye level with the couple).
   Look: clear afternoon sun from the south-east, long soft shadows, sky light from the same HDR the scene was lit with in Blender. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import WebGL from 'three/addons/capabilities/WebGL.js';

const html = document.documentElement;
const canvas = document.querySelector('.flight__canvas');
const frame = document.querySelector('.flight__frame');
const label = document.querySelector('.ring__label');

/* ---------- camera path: the same keys the Blender camera was baked from ---------- */
const KEYS = {
  u:    [0, 0.08, 0.26, 0.4, 1.0],
  th:   [90, 88, 62, 48, 46],            // elevation above the horizon, degrees: it stays an aerial view
  d:    [46, 45, 30, 17, 16],            // distance to the couple, metres: it never comes closer than this
  pz:   [0, 0, 0.4, 0.9, 1.0],           // height the camera looks at
  phi:  [-20, -19, -10, 0, 360],         // swing around the couple, degrees: one full circle once it has come down
  lens: [35, 35, 32, 28, 28],
};
const CENTRE = [1.0, -4.5];              // where the couple stand (Blender x, y)
/* monotone cubic (PCHIP) so nothing overshoots between keys */
const pchip = (xs, ys) => {
  const n = xs.length, h = [], del = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; del[i] = (ys[i + 1] - ys[i]) / h[i]; }
  for (let i = 1; i < n - 1; i++) {
    if (del[i - 1] * del[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]);
  }
  const end = (h0, h1, d0, d1) => {
    let v = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(v) !== Math.sign(d0)) v = 0; else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(v) > 3 * Math.abs(d0)) v = 3 * d0;
    return v;
  };
  m[0] = end(h[0], h[1], del[0], del[1]);
  m[n - 1] = end(h[n - 2], h[n - 3], del[n - 2], del[n - 3]);
  return (x) => {
    x = Math.min(xs[n - 1], Math.max(xs[0], x));
    let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
};
const path = Object.fromEntries(Object.entries(KEYS).filter(([k]) => k !== 'u').map(([k, v]) => [k, pchip(KEYS.u, v)]));

const start = () => {
  const mobile = matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.AgXToneMapping;           // the Blender scene was graded with AgX
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;                 // redrawn only when the walkers move

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfd3e6);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 700);

  // sun: direction, colour and strength copied from the Blender sun lamp (already converted to y-up)
  const SUN = new THREE.Vector3(0.8405, 0.5003, 0.208).normalize();
  const target = new THREE.Vector3(CENTRE[0], 0, -CENTRE[1]);
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.93, 0.82), 4.2);
  sun.position.copy(target).addScaledVector(SUN, 140);
  sun.target.position.copy(target);
  sun.castShadow = true;
  const S = 40;                                          // half-width of the shadowed area, metres
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 50, far: 240 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.setScalar(mobile ? 2048 : 4096);
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.03; sun.shadow.radius = 1.5;
  scene.add(sun, sun.target);

  /* ---------- loading ---------- */
  const manager = new THREE.LoadingManager();
  let glbShare = 0;
  const showProgress = () => { if (label) label.textContent = `Loading ${Math.round(glbShare * 100)}%`; };
  showProgress();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyReady = new HDRLoader(manager).setDataType(THREE.FloatType).loadAsync('scene/sky.hdr').then((tex) => {
    // The panorama contains the sun itself. Left in, its light would arrive as shadowless ambient light and wash
    // the shadows out, so cut the sun disc down to sky brightness and hand that energy to the (shadow-casting) sun lamp.
    const px = tex.image.data, W = tex.image.width, H = tex.image.height, CAP = 6;
    let moved = 0;
    for (let y = 0; y < H; y++) {
      const solid = Math.sin(((y + 0.5) / H) * Math.PI) * (Math.PI / H) * (2 * Math.PI / W);   // steradians per pixel
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        if (lum > CAP) {
          const k = CAP / lum;
          moved += (lum - CAP) * solid;
          px[i] *= k; px[i + 1] *= k; px[i + 2] *= k;
        }
      }
    }
    tex.needsUpdate = true;
    sun.intensity += moved * 0.55;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = tex;
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    scene.backgroundIntensity = 0.55; scene.environmentIntensity = 0.55;   // world strength in Blender
    pmrem.dispose();
  });

  let mixer = null, duration = 0;
  const draco = new DRACOLoader(manager).setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/draco/gltf/');
  const glbReady = new GLTFLoader(manager).setDRACOLoader(draco).loadAsync('scene/courtyard.glb', (e) => {
    if (e.total) { glbShare = e.loaded / e.total; showProgress(); }
  }).then((gltf) => {
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const seen = new Set();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      let solid = true;
      for (const m of mats) {
        if (/_leaves$/.test(m.name)) {                   // foliage cards: cut-out, both sides
          if (!seen.has(m)) { m.alphaTest = 0.42; m.transparent = false; m.depthWrite = true; m.side = THREE.DoubleSide; m.alphaToCoverage = true; }
        } else if (m.opacity < 1 || m.transparent) {     // balcony glass, veil
          if (!seen.has(m)) { m.transparent = true; m.depthWrite = false; m.side = THREE.DoubleSide; }
          solid = false;
        } else if (m.name === 'W_Glass') {
          if (!seen.has(m)) { m.color.setRGB(0.42, 0.47, 0.52); m.metalness = 0.92; m.roughness = 0.06; }
        }
        if (!seen.has(m) && m.map) m.map.anisotropy = Math.min(8, maxAniso);
        seen.add(m);
      }
      o.castShadow = solid; o.receiveShadow = solid;
    });
    scene.add(gltf.scene);
    if (gltf.animations.length) {                        // the people walking: baked clips, scrubbed together by scroll
      mixer = new THREE.AnimationMixer(gltf.scene);
      for (const c of gltf.animations) { mixer.clipAction(c).play(); duration = Math.max(duration, c.duration); }
    }
    draco.dispose();
  });

  /* ---------- camera + render on demand ---------- */
  let u = 0, drawnU = -1, needs = true, ready = false;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const pivot = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3();
  const place = () => {
    const th = THREE.MathUtils.degToRad(path.th(u)), ph = THREE.MathUtils.degToRad(path.phi(u));
    const d = path.d(u), lens = path.lens(u);
    // Blender (x, y, z) -> three (x, z, -y)
    pivot.set(CENTRE[0], path.pz(u), -CENTRE[1]);
    camera.position.set(
      pivot.x + d * Math.cos(th) * Math.sin(ph),
      pivot.y + d * Math.sin(th),
      pivot.z + d * Math.cos(th) * Math.cos(ph));
    camera.up.set(-Math.sin(th) * Math.sin(ph), Math.cos(th), -Math.sin(th) * Math.cos(ph));   // stays valid looking straight down
    camera.lookAt(pivot);
    // a little parallax from the pointer
    right.setFromMatrixColumn(camera.matrixWorld, 0); upv.setFromMatrixColumn(camera.matrixWorld, 1);
    camera.position.addScaledVector(right, pointer.x * d * 0.018).addScaledVector(upv, -pointer.y * d * 0.012);
    camera.lookAt(pivot);
    // 36 mm sensor; on screens narrower than 16:9 keep the height of the 16:9 picture
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(18 / lens / Math.max(camera.aspect, 16 / 9)));
    camera.updateProjectionMatrix();
  };
  const resize = () => {
    const w = frame.clientWidth, h = frame.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    needs = true;
  };
  addEventListener('resize', resize);
  resize();

  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    addEventListener('pointermove', (e) => {
      pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  let onScreen = true;
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; if (onScreen) needs = true; }).observe(frame);

  renderer.setAnimationLoop(() => {
    if (!ready || !onScreen || document.hidden) return;
    const dx = pointer.tx - pointer.x, dy = pointer.ty - pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.0015) { pointer.x += dx * 0.06; pointer.y += dy * 0.06; needs = true; }
    if (!needs) return;
    if (u !== drawnU) {
      if (mixer) { mixer.setTime(Math.min(duration * u, duration - 1e-3)); renderer.shadowMap.needsUpdate = true; }
      drawnU = u;
    }
    place();
    renderer.render(scene, camera);
    needs = false;
  });

  Promise.all([skyReady, glbReady]).then(() => {
    renderer.shadowMap.needsUpdate = true;
    ready = true; needs = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      html.classList.add('has-canvas');                  // hides the poster picture
      if (label) label.textContent = 'Scroll';
    }));
  }).catch((err) => {
    console.error('Courtyard scene failed to load', err);
    if (label) label.textContent = 'Scroll';
  });

  window.flight3d = {
    set(v) { if (v !== u) { u = v; needs = true; } },
    renderer, scene, camera,
  };
};

if (canvas && WebGL.isWebGL2Available()) start();
else if (label) label.textContent = 'Scroll';
