/* 별빛탐정단 — 하늘 렌더러 (Canvas)
   줌·드래그, 대기 섭동에 의한 반짝임(scintillation), 표면 온도에 따른 실제 색,
   가까운 별일수록 크게 움직이는 원근(시차) 효과, 성단·성운·은하의 절차적 렌더링 */
window.Sky = (() => {
const W = 2000, H = 1200;
let cv, ctx, dpr = 1, cw = 0, ch = 0;
let cam = { x: W / 2, y: H / 2, z: 1 }, camT = null;
let sector = 0, objs = [], bg = [], members = [], sprites = {}, band = null;
let selected = null, observed = new Set(), hover = null, onPick = () => {}, onZoom = () => {};
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- utilities ----------
function rng(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; }
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
// 흑체 온도 → RGB (Tanner Helland 근사), 약간 채도 보정
const colorCache = new Map();
function kelvin(T) {
  const key = Math.round(T / 100);
  if (colorCache.has(key)) return colorCache.get(key);
  const t = T / 100; let r, g, b;
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const cl = v => Math.max(0, Math.min(255, v));
  r = cl(r); g = cl(g); b = cl(b);
  const avg = (r + g + b) / 3, k = 1.35; // 채도 강조 (스텔라리움 색 표현에 가깝게)
  const out = [cl(avg + (r - avg) * k), cl(avg + (g - avg) * k), cl(avg + (b - avg) * k)].map(Math.round);
  colorCache.set(key, out); return out;
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// ---------- camera ----------
function baseScale() { return Math.max(cw / W, ch / H); }
function scale() { return baseScale() * cam.z; }
function clampCam(c) {
  const s = baseScale() * c.z, hw = cw / 2 / s, hh = ch / 2 / s;
  c.x = Math.min(W - hw, Math.max(hw, c.x)); c.y = Math.min(H - hh, Math.max(hh, c.y));
  if (hw * 2 > W) c.x = W / 2; if (hh * 2 > H) c.y = H / 2;
  return c;
}
function parallaxShift(o) { return o.d ? (cam.x - W / 2) * 0.14 / o.d : 0; }
function toScreen(x, y) { const s = scale(); return [(x - cam.x) * s + cw / 2, (y - cam.y) * s + ch / 2]; }
function toWorld(sx, sy) { const s = scale(); return [(sx - cw / 2) / s + cam.x, (sy - ch / 2) / s + cam.y]; }
function objPos(o) { return [o.x - parallaxShift(o), o.y]; }
function mlim() { return 6.4 + 4.6 * Math.log10(cam.z); }

// ---------- star drawing ----------
function drawStar(x, y, m, col, ph, t, boost) {
  const lim = mlim();
  if (m > lim + 0.3) return;
  const f = Math.pow(10, -0.4 * (m - lim));
  // 반짝임: 두 개의 사인파 곱 + 빠른 흔들림. 밝을수록, 낮게 깜빡이도록
  const amp = reduce ? 0 : (f > 40 ? 0.28 : 0.38);
  const tw = 1 + amp * Math.sin(t * (1.7 + ph * 2.3) + ph * 9) * Math.sin(t * (3.1 + ph) + ph * 4) + (reduce ? 0 : 0.08 * Math.sin(t * 13 + ph * 20));
  let r = Math.min(9, 0.45 + 0.85 * Math.pow(f, 0.27)) * (boost || 1);
  let a = Math.min(1, 0.25 + f * 0.75) * Math.max(0.15, Math.min(1, (lim + 0.3 - m) / 0.8));
  a *= Math.max(0.35, Math.min(1.25, tw));
  r *= 0.92 + 0.08 * tw;
  if (f > 6) {
    const g = r * (f > 60 ? 6 : 4);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, g);
    gr.addColorStop(0, rgba(col, 0.42 * a)); gr.addColorStop(0.25, rgba(col, 0.12 * a)); gr.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, g, 0, 6.2832); ctx.fill();
  }
  if (f > 120) { // 밝은 별: 회절 십자 빛줄기
    const L = r * 7 * (0.85 + 0.15 * tw);
    ctx.strokeStyle = rgba(col, 0.28 * a); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
  }
  if (r < 0.9) { ctx.fillStyle = rgba(col, a); ctx.fillRect(x - r, y - r, r * 2, r * 2); return; }
  ctx.fillStyle = rgba(col, a); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  if (r > 1.6) { ctx.fillStyle = `rgba(255,255,255,${0.75 * a})`; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 6.2832); ctx.fill(); }
}

// ---------- scene generation ----------
function genBackground(sec) {
  const r = rng(1000 + sec * 77);
  const n = sec === 3 ? 700 : 2800; bg = [];
  for (let i = 0; i < n; i++) {
    let x = r() * W, y = r() * H;
    if (sec < 3 && r() < 0.45) { // 은하수 띠에 별이 더 많이
      x = r() * W; y = H * 0.55 + gauss(r) * 150 - (x - W / 2) * 0.18;
    }
    const m = 4.2 + 7.2 * Math.pow(r(), 0.33);
    const T = r() < 0.12 ? 9000 + r() * 16000 : 3000 + r() * 4500;
    bg.push({ x, y, m, c: kelvin(T), ph: r() });
  }
  if (sec === 2) { // 암흑 성운 뒤가 원래 별이 빽빽한 곳임을 보이도록 주변을 조밀하게
    const n3 = SQ.NEBULAE.find(o => o.id === 'n3');
    for (let i = 0; i < 900; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * n3.size * 2.1;
      bg.push({ x: n3.x + Math.cos(a) * d, y: n3.y + Math.sin(a) * d * 0.8, m: 6 + r() * 5, c: kelvin(3500 + r() * 6000), ph: r() });
    }
  }
}
function genMembers(sec) {
  members = [];
  if (sec !== 1 && sec !== 2) return;
  objs.forEach(o => {
    const r = rng(o.seed * 131);
    const add = (x, y, m, T) => members.push({ x, y, m, c: kelvin(T), ph: r(), owner: o.id });
    if (o.kind === 'open') {
      for (let i = 0; i < 230; i++) { const a = r() * 6.28, d = Math.pow(r(), 0.7) * o.size; add(o.x + Math.cos(a) * d + gauss(r) * 12, o.y + Math.sin(a) * d * 0.85, 5.6 + r() * 4.2, r() < 0.7 ? 11000 + r() * 16000 : 7000 + r() * 3000); }
      for (let i = 0; i < 12; i++) { const a = r() * 6.28, d = r() * o.size * 0.8; add(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 3.2 + r() * 1.6, 14000 + r() * 12000); }
    } else if (o.kind === 'globular') {
      for (let i = 0; i < 4200; i++) { const a = r() * 6.28, d = o.size * 0.16 * Math.tan(Math.pow(r(), 1.15) * 1.42); if (d > o.size * 1.3) continue; add(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 8.2 + r() * 3.6, r() < 0.82 ? 3400 + r() * 1800 : 5200 + r() * 1500); }
    } else if (o.kind === 'binary') {
      add(o.x - 9, o.y + 2, 4.2, 9000); add(o.x + 9, o.y - 3, 5.0, 5800);
    } else if (o.kind === 'giant') {
      add(o.x, o.y, 2.6, 4100);
    } else if (o.kind === 'emission') {
      for (let i = 0; i < 6; i++) add(o.x + gauss(r) * o.size * 0.18, o.y + gauss(r) * o.size * 0.14, 5 + r() * 1.5, 25000 + r() * 10000);
    } else if (o.kind === 'reflection') {
      add(o.x, o.y, 3.0, 13000);
    } else if (o.kind === 'cluster') {
      for (let i = 0; i < 40; i++) { const a = r() * 6.28, d = Math.pow(r(), 0.8) * o.size; add(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 6 + r() * 3.5, 12000 + r() * 15000); }
    }
  });
}

function makeCanvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }
function blob(g, x, y, rad, col, a) { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.fill(); }

function genSprites(sec) {
  sprites = {};
  objs.forEach(o => {
    const N = 640, c = makeCanvas(N), g = c.getContext('2d'), r = rng(o.seed * 977), C = N / 2;
    if (o.kind === 'globular') { // 분해되지 않은 성단 빛
      blob(g, C, C, C * 0.55, '255,214,160', 0.55); blob(g, C, C, C * 0.22, '255,236,200', 0.7);
    } else if (o.kind === 'emission') {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 70; i++) blob(g, C + gauss(r) * C * 0.28, C + gauss(r) * C * 0.22, C * (0.12 + r() * 0.3), r() < 0.8 ? '232,52,86' : '255,120,150', 0.08 + r() * 0.07);
      for (let i = 0; i < 12; i++) blob(g, C + gauss(r) * C * 0.15, C + gauss(r) * C * 0.12, C * (0.05 + r() * 0.1), '255,190,200', 0.12);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9; i++) blob(g, C + gauss(r) * C * 0.3, C + gauss(r) * C * 0.25, C * (0.05 + r() * 0.1), '0,0,0', 0.45);
    } else if (o.kind === 'reflection') {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 55; i++) blob(g, C + gauss(r) * C * 0.22, C + gauss(r) * C * 0.25, C * (0.1 + r() * 0.28), r() < 0.7 ? '90,140,255' : '150,190,255', 0.06 + r() * 0.06);
    } else if (o.kind === 'dark') {
      for (let i = 0; i < 46; i++) blob(g, C + gauss(r) * C * 0.2, C + gauss(r) * C * 0.16, C * (0.12 + r() * 0.24), '4,6,12', 0.5 + r() * 0.3);
      g.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 18; i++) blob(g, C + gauss(r) * C * 0.35, C + gauss(r) * C * 0.3, C * 0.2, '60,34,24', 0.12);
    } else if (o.kind === 'elliptical') {
      const gr = g.createRadialGradient(C, C, 0, C, C, C * 0.95);
      gr.addColorStop(0, 'rgba(255,240,215,0.95)'); gr.addColorStop(0.08, 'rgba(255,225,185,0.7)'); gr.addColorStop(0.3, 'rgba(240,200,150,0.28)'); gr.addColorStop(0.65, 'rgba(220,180,140,0.07)'); gr.addColorStop(1, 'rgba(220,180,140,0)');
      g.fillStyle = gr; g.fillRect(0, 0, N, N);
    } else if (o.kind === 'spiral' || o.kind === 'barred') {
      const barred = o.kind === 'barred';
      g.globalCompositeOperation = 'lighter';
      blob(g, C, C, C * 0.85, '120,140,200', 0.12);
      const R0 = barred ? C * 0.3 : C * 0.08;
      for (let arm = 0; arm < 2; arm++) {
        for (let i = 0; i < 4200; i++) {
          const t = r() * 3.4, th = t + arm * Math.PI, rad = R0 * Math.exp(0.42 * t);
          if (rad > C * 0.92) continue;
          const sp = 4 + rad * 0.06;
          const x = C + Math.cos(th) * rad + gauss(r) * sp, y = C + Math.sin(th) * rad + gauss(r) * sp;
          const hot = r() < 0.06;
          g.fillStyle = hot ? 'rgba(255,120,170,0.55)' : r() < 0.6 ? 'rgba(170,200,255,0.35)' : 'rgba(235,235,255,0.3)';
          g.fillRect(x, y, hot ? 2.6 : 1.6, hot ? 2.6 : 1.6);
        }
      }
      if (barred) { g.save(); g.translate(C, C); g.scale(1, 0.24); blob(g, 0, 0, R0 * 1.15, '255,226,180', 0.55); g.restore(); }
      blob(g, C, C, C * (barred ? 0.16 : 0.2), '255,228,185', 0.85); blob(g, C, C, C * 0.06, '255,248,230', 0.9);
      if (o.tilt < 0.4) { g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(10,8,8,0.75)'; g.fillRect(C * 0.12, C - 6, N - C * 0.24, 12); }
    } else if (o.kind === 'irregular') {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) blob(g, C + gauss(r) * C * 0.3, C + gauss(r) * C * 0.22, C * (0.06 + r() * 0.18), r() < 0.5 ? '160,190,255' : '220,215,255', 0.12 + r() * 0.1);
      for (let i = 0; i < 1400; i++) { g.fillStyle = r() < 0.08 ? 'rgba(255,130,170,0.5)' : 'rgba(200,215,255,0.32)'; g.fillRect(C + gauss(r) * C * 0.28, C + gauss(r) * C * 0.2, 1.6, 1.6); }
    }
    sprites[o.id] = c;
  });
  // 은하수 띠
  if (sec < 3) {
    band = makeCanvas(800); band.height = 480; const g = band.getContext('2d'), r = rng(sec + 5);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 160; i++) { const x = r() * 800; blob(g, x, 480 * 0.55 + gauss(r) * 45 - (x - 400) * 0.18, 30 + r() * 70, r() < 0.7 ? '120,135,190' : '170,150,140', 0.035); }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) { const x = r() * 800; blob(g, x, 480 * 0.55 + gauss(r) * 18 - (x - 400) * 0.18, 10 + r() * 30, '0,0,0', 0.4); }
  } else {
    band = null;
    // 아주 먼 배경 은하들
    const r = rng(404);
    for (let i = 0; i < 140; i++) bg.push({ gal: true, x: r() * W, y: r() * H, s: 2 + r() * 5, rot: r() * 3, e: 0.3 + r() * 0.7, a: 0.15 + r() * 0.3 });
  }
}

// ---------- render ----------
let t0 = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (!ctx) return;
  if (camT) { // 부드러운 카메라 이동
    cam.x += (camT.x - cam.x) * 0.14; cam.y += (camT.y - cam.y) * 0.14; cam.z += (camT.z - cam.z) * 0.14;
    if (Math.abs(camT.z - cam.z) < 0.002 && Math.abs(camT.x - cam.x) < 0.3 && Math.abs(camT.y - cam.y) < 0.3) { cam = { ...camT }; camT = null; }
    clampCam(cam); onZoom(cam.z);
  }
  const t = (now - t0) / 1000, s = scale();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sky = ctx.createLinearGradient(0, 0, 0, ch);
  if (sector === 3) { sky.addColorStop(0, '#02030a'); sky.addColorStop(1, '#05040f'); }
  else { sky.addColorStop(0, '#040814'); sky.addColorStop(1, '#0a1024'); }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch);

  if (band) { const [x0, y0] = toScreen(0, 0); ctx.globalAlpha = 0.9; ctx.drawImage(band, x0, y0, W * s, H * s); ctx.globalAlpha = 1; }

  const pad = 40;
  const vis = (x, y) => x > -pad && y > -pad && x < cw + pad && y < ch + pad;
  // 배경
  for (const b of bg) {
    const [x, y] = toScreen(b.x, b.y); if (!vis(x, y)) continue;
    if (b.gal) { ctx.save(); ctx.translate(x, y); ctx.rotate(b.rot); ctx.scale(1, b.e); const rr = b.s * Math.sqrt(cam.z); const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); gr.addColorStop(0, `rgba(255,235,210,${b.a})`); gr.addColorStop(1, 'rgba(255,235,210,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.2832); ctx.fill(); ctx.restore(); continue; }
    drawStar(x, y, b.m, b.c, b.ph, t);
  }
  // 확장 천체 스프라이트
  objs.forEach(o => {
    const sp = sprites[o.id]; if (!sp) return;
    const [x, y] = toScreen(o.x, o.y), R = o.size * s * (o.kind === 'globular' ? 1.1 : o.kind.match(/emission|reflection|dark/) ? 1.6 : 1.25);
    if (x + R < 0 || y + R < 0 || x - R > cw || y - R > ch) return;
    ctx.save(); ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.tilt) ctx.scale(1, o.tilt);
    let a = 1;
    if (o.kind === 'globular') a = Math.max(0.25, 1 - (cam.z - 1) * 0.12); // 확대하면 개별 별로 분해되어 보임
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = o.kind === 'dark' ? 'source-over' : 'lighter';
    ctx.drawImage(sp, -R, -R, R * 2, R * 2);
    ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  });
  // 성단·성운 구성 별
  for (const b of members) { const [x, y] = toScreen(b.x, b.y); if (vis(x, y)) drawStar(x, y, b.m, b.c, b.ph, t); }
  // 별 구역 주요 별
  objs.forEach(o => {
    if (o.kind !== 'star') return;
    const [wx, wy] = objPos(o), [x, y] = toScreen(wx, wy);
    if (!vis(x, y)) return;
    drawStar(x, y, Math.min(o.m, mlim() - 0.6), o.col || (o.col = kelvin(o.T)), (o.x % 97) / 97, t, 1.15);
  });
  // 라벨·조준선
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  objs.forEach(o => {
    const [wx, wy] = o.kind === 'star' ? objPos(o) : [o.x, o.y], [x, y] = toScreen(wx, wy);
    if (!vis(x, y)) return;
    const rad = o.kind === 'star' ? 14 : Math.max(18, o.size * s * 0.8);
    const sel = selected === o.id, hov = hover === o.id, seen = observed.has(o.id);
    if (sel || hov) {
      ctx.save(); ctx.translate(x, y); if (sel && !reduce) ctx.rotate(t * 0.6);
      ctx.strokeStyle = sel ? 'rgba(121,211,232,0.95)' : 'rgba(121,211,232,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.arc(0, 0, rad + 6, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]);
      if (sel) for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(rad + 10, 0); ctx.lineTo(rad + 18, 0); ctx.stroke(); }
      ctx.restore();
    }
    ctx.font = `${sel ? 700 : 500} 13px "IBM Plex Sans KR", "Malgun Gothic", sans-serif`;
    ctx.fillStyle = sel ? '#f3c35a' : seen ? '#e3e9f6' : 'rgba(170,184,214,0.8)';
    ctx.fillText(o.nm + (seen && !sel ? ' ✓' : ''), x, y + rad + 10);
  });
}

// ---------- input ----------
const ptrs = new Map(); let drag = null, pinch = null;
function pickAt(sx, sy) {
  let best = null, bd = 1e9; const s = scale();
  objs.forEach(o => {
    const [wx, wy] = o.kind === 'star' ? objPos(o) : [o.x, o.y], [x, y] = toScreen(wx, wy);
    const lim = o.kind === 'star' ? 28 : Math.max(30, o.size * s * 0.9);
    const d = Math.hypot(x - sx, y - sy); if (d < lim && d < bd) { bd = d; best = o.id; }
  });
  return best;
}
function zoomAt(sx, sy, factor) {
  const [wx, wy] = toWorld(sx, sy);
  const z = Math.min(9, Math.max(1, (camT ? camT.z : cam.z) * factor));
  cam.z = z; const s = scale();
  cam.x = wx - (sx - cw / 2) / s; cam.y = wy - (sy - ch / 2) / s; camT = null; clampCam(cam); onZoom(cam.z);
}
function bind() {
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: cam.x, cy: cam.y, moved: false };
    if (ptrs.size === 2) { const p = [...ptrs.values()]; pinch = { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), z: cam.z }; drag = null; } });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) { hover = pickAt(e.offsetX, e.offsetY); cv.style.cursor = hover ? 'pointer' : 'grab'; return; }
    ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pinch && ptrs.size === 2) { const p = [...ptrs.values()]; const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      const mx = (p[0][0] + p[1][0]) / 2, my = (p[0][1] + p[1][1]) / 2; zoomAt(mx, my, (pinch.z * d / pinch.d) / cam.z); return; }
    if (drag) { const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (drag.moved) { const s = scale(); cam.x = drag.cx - dx / s; cam.y = drag.cy - dy / s; camT = null; clampCam(cam); cv.style.cursor = 'grabbing'; } }
  });
  const up = e => { const wasDrag = drag && drag.moved; ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && !wasDrag && ptrs.size === 0) { const id = pickAt(e.offsetX, e.offsetY); if (id) onPick(id); }
    if (ptrs.size === 0) drag = null; cv.style.cursor = 'grab'; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.addEventListener('dblclick', e => zoomAt(e.offsetX, e.offsetY, 1.8));
  cv.addEventListener('keydown', e => {
    const step = 60 / scale();
    if (e.key === '+' || e.key === '=') zoomAt(cw / 2, ch / 2, 1.3);
    else if (e.key === '-') zoomAt(cw / 2, ch / 2, 1 / 1.3);
    else if (e.key.startsWith('Arrow')) { cam.x += e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0; cam.y += e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0; clampCam(cam); }
    else return; e.preventDefault();
  });
  new ResizeObserver(resize).observe(cv);
}
function resize() {
  const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = r.width; ch = r.height; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); clampCam(cam);
}

return {
  init(canvas, opts) { cv = canvas; ctx = cv.getContext('2d'); onPick = opts.onPick; onZoom = opts.onZoom || onZoom; bind(); resize(); requestAnimationFrame(frame); },
  setSector(sec) { sector = sec; objs = SQ.SECTORS[sec].objs; genBackground(sec); genMembers(sec); genSprites(sec); cam = clampCam({ x: W / 2, y: H / 2, z: 1 }); camT = null; selected = null; onZoom(1); },
  setSelected(id) { selected = id; },
  setObserved(set) { observed = set; },
  zoom(f) { zoomAt(cw / 2, ch / 2, f); },
  reset() { camT = clampCam({ x: W / 2, y: H / 2, z: 1 }); },
  focus(id) { const o = objs.find(v => v.id === id); if (!o) return; const z = Math.max(cam.z, o.kind === 'star' ? 2.2 : 2.6); camT = clampCam({ x: o.x, y: o.y, z }); },
  kelvin,
};
})();
