/* Naomi & Elias — scroll-driven wedding hero.
   The hero flies a live 3D scene (scene.js: plan view -> down onto the couple) on a canvas,
   swaps headlines along the way, then folds the picture into an arch frame that scrolls off into the page. */
(() => {
  const html = document.documentElement;
  html.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (v, a, b) => clamp((v - a) / (b - a));
  const smooth = (t) => t * t * (3 - 2 * t);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  }
  /* progress of a tall section through the viewport: 0 when its top hits the top, 1 when its bottom hits the bottom */
  const pinProgress = (el) => {
    const r = el.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - innerHeight));
  };
  /* progress of a normal section crossing the viewport: 0 entering from below, 1 leaving at the top */
  const passProgress = (el) => {
    const r = el.getBoundingClientRect();
    return clamp((innerHeight - r.top) / (innerHeight + r.height));
  };

  /* ---------- 01 flight ---------- */
  const flight = $('.flight');
  const canvas = $('.flight__canvas');
  const frame = $('.flight__frame');
  const sign = $('.flight__sign');
  const linesBox = $('.lines');
  const ring = $('.ring');
  const arc = $('.ring__arc');
  const ringLabel = $('.ring__label');
  const lines = $$('.line').map((el) => ({ el, from: +el.dataset.from, to: +el.dataset.to }));
  const FLIGHT_END = 0.86;            // the circle around the couple finishes, facing them, just as the picture folds into the arch
  const U_END = 1;                    // the camera path in scene.js ends after one full circle around the couple
  let shown = -1;                     // eased camera position, 0 = overhead .. 1 = eye level

  const updateFlight = () => {
    const p = pinProgress(flight);
    // linear: the easing (overhead -> aerial settle -> eye level) lives in the camera path in scene.js
    const target = ramp(p, 0, FLIGHT_END) * U_END;
    shown = shown < 0 || reduce ? target : lerp(shown, target, 0.14);
    if (Math.abs(shown - target) < 0.0001) shown = target;
    if (window.flight3d) window.flight3d.set(shown);

    // hand-off: the full-bleed picture folds into an arch-shaped frame on the paper background
    const t = smooth(ramp(p, 0.8, 0.97));
    const W = innerWidth, H = frame.clientHeight;
    const h = H * 0.64, w = Math.min(h * 0.82, W * 0.84);
    const top = (H * 0.45 - h / 2) * t, bottom = (H - (H * 0.45 + h / 2)) * t, side = ((W - w) / 2) * t;
    const r = (w / 2) * t, r2 = 6 * t;
    frame.style.clipPath = t > 0
      ? `inset(${top.toFixed(1)}px ${side.toFixed(1)}px ${bottom.toFixed(1)}px ${side.toFixed(1)}px round ${r.toFixed(1)}px ${r.toFixed(1)}px ${r2.toFixed(1)}px ${r2.toFixed(1)}px)`
      : 'none';
    frame.style.setProperty('--veil', (1 - t).toFixed(3));
    canvas.style.transform = `scale(${(1 + t * 0.03).toFixed(4)})`;
    sign.style.opacity = ramp(p, 0.9, 0.98).toFixed(3);
    linesBox.style.opacity = (1 - ramp(p, 0.8, 0.83)).toFixed(3);   // white headline shadows would show on the paper

    for (const l of lines) {
      l.el.classList.toggle('is-on', p >= l.from && p < l.to);
      l.el.classList.toggle('is-past', p >= l.to);
    }
    arc.style.strokeDashoffset = (100 - p * 100).toFixed(2);
    ringLabel.style.opacity = p < 0.02 ? 1 : 0;
    ring.style.opacity = (1 - ramp(p, 0.74, 0.8)).toFixed(3);
  };

  /* ---------- countdown + rsvp ---------- */
  const cd = $('[data-countdown]');
  if (cd) cd.textContent = Math.max(0, Math.ceil((new Date(2027, 5, 12) - new Date()) / 864e5));
  const form = $('.form'), status = $('.form__status');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const mail = form.elements.email;
    if (!name || !mail.value || !mail.validity.valid) { status.textContent = 'Please add your name and a valid email.'; return; }
    status.textContent = `Thank you, ${name}. This is a placeholder site, so nothing was sent.`;
  });

  /* ---------- section image drift ---------- */
  const cardImgs = $$('.arch img, .day__img img, .place__img img, .details__img img');
  const updateCards = () => {
    for (const im of cardImgs) {
      const r = im.parentElement.getBoundingClientRect();
      if (r.bottom < -100 || r.top > innerHeight + 100) continue;
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      im.style.transform = `translate3d(0, ${(p * -5).toFixed(2)}%, 0)`;
    }
  };

  /* ---------- chrome: rail label + compact mark ---------- */
  const railNum = $('.rail__num'), railText = $('.rail__text');
  const sections = $$('[data-rail]');
  const darkBands = $$('.place');
  const menu = $('.menu');
  let railKey = '';
  const updateChrome = () => {
    html.classList.toggle('is-scrolled', scrollY > innerHeight * 0.5);
    // top bar colour: white over the hero picture, the dark venue band and the open menu; ink on paper
    const overPhoto = pinProgress(flight) < 0.86 && flight.getBoundingClientRect().bottom > 60;
    let dark = overPhoto || !menu.hidden;
    if (!dark) for (const d of darkBands) { const r = d.getBoundingClientRect(); if (r.top <= 44 && r.bottom > 44) { dark = true; break; } }
    html.classList.toggle('on-dark', dark);
    html.classList.toggle('over-photo', overPhoto && menu.hidden);
    const mid = innerHeight * 0.6;
    let cur = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= mid) cur = s;
    if (cur.dataset.rail !== railKey) {
      railKey = cur.dataset.rail;
      const [n, t] = railKey.split('|');
      railNum.textContent = n; railText.textContent = t;
    }
  };

  /* ---------- reveals ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e, k) => {
      if (!e.isIntersecting) return;
      e.target.style.transitionDelay = `${k * 0.09}s`;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  $$('.reveal').forEach((el) => io.observe(el));

  /* ---------- menu ---------- */
  const btn = $('.menu-btn');
  const setMenu = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    $('.menu-btn__label').textContent = open ? 'Close' : 'Menu';
    if (open) { menu.hidden = false; requestAnimationFrame(() => menu.classList.add('is-open')); lenis && lenis.stop(); }
    else { menu.classList.remove('is-open'); setTimeout(() => { menu.hidden = true; }, 450); lenis && lenis.start(); }
  };
  btn.addEventListener('click', () => setMenu(btn.getAttribute('aria-expanded') !== 'true'));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const t = $(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    if (!menu.hidden) setMenu(false);
    if (lenis) lenis.scrollTo(t, { duration: 1.6 }); else t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }));

  /* ---------- loop ---------- */
  const tick = (time) => {
    if (lenis) lenis.raf(time);
    updateFlight();
    updateCards();
    updateChrome();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
