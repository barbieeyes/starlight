/* 별빛탐정단 — 하늘 렌더러 (Canvas)
   줌·드래그, 대기 섭동에 의한 반짝임(scintillation), 표면 온도에 따른 실제 색,
   가까운 별일수록 크게 움직이는 원근(시차) 효과, 성단·성운·은하의 절차적 렌더링 */
window.Sky = (() => {
const W = 2000, H = 1200;
let cv, ctx, dpr = 1, cw = 0, ch = 0;
let cam = { x: W / 2, y: H / 2, z: 1 }, camT = null;
let sector = 0, objs = [], bg = [], members = [], sprites = {}, band = null;
let selected = null, collected = new Set(), observed = new Set(), hover = null, onPick = () => {}, onZoom = () => {};
let hyper = 0; const hyperDur = 1.3;
const evs = new Map(), floats = [], radarMarks = { ids: [], until: 0 };
const ships = new Map(); // 탐사단 우주선: id -> { nick, me, aim, x, y, ang, ph, col }
const SHIPCOL = ['121,211,232', '255,122,168', '185,162,255', '111,220,155', '255,176,98', '160,200,255'];
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
// 빛 번짐은 색마다 한 번만 그려 두고 복사해서 씀 (매 프레임 그라디언트 생성 X)
const glowCache = new Map();
function glowSprite(col) {
  const key = col.join(','); let c = glowCache.get(key);
  if (!c) { c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(col, 0.42)); gr.addColorStop(0.25, rgba(col, 0.12)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowCache.set(key, c); }
  return c;
}
let lowQ = false, fieldBright = true; // 느린 기기에서 자동으로 켜짐
function drawStar(x, y, m, col, ph, t, boost) {
  const lim = mlim();
  if (m > lim + 0.3) return;
  // 확대하면 더 어두운 별까지 보이지만(lim), 별 크기는 거의 그대로 (sizeLim) → 배경별이 커 보이지 않게
  const sizeLim = 6.4 + 1.1 * Math.log10(cam.z), f = Math.pow(10, -0.4 * (m - sizeLim));
  let a = Math.min(1, 0.25 + Math.max(f, 0.35) * 0.75) * Math.max(0.15, Math.min(1, (lim + 0.3 - m) / 0.8));
  if (f < 1.2 && !boost) { // 어두운 별: 계산을 줄인 빠른 반짝임
    if (lowQ && ph > 0.55) return;
    const tw = reduce ? 1 : 1 + 0.38 * Math.sin(t * (1.7 + ph * 2.3) + ph * 9);
    const r = 0.45 + 0.85 * Math.pow(f, 0.27);
    ctx.globalAlpha = Math.max(0.1, Math.min(1, a * tw)); ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; return;
  }
  // 반짝임: 두 개의 사인파 곱 + 빠른 흔들림
  const amp = reduce ? 0 : (f > 40 ? 0.28 : 0.38);
  const tw = 1 + amp * Math.sin(t * (1.7 + ph * 2.3) + ph * 9) * Math.sin(t * (3.1 + ph) + ph * 4) + (reduce ? 0 : 0.08 * Math.sin(t * 13 + ph * 20));
  let r = Math.min(9, 0.45 + 0.85 * Math.pow(f, 0.27)) * (boost || 1);
  a *= Math.max(0.35, Math.min(1.25, tw));
  r *= 0.92 + 0.08 * tw;
  if (f > 6 && !(lowQ && f < 20)) {
    const g = r * (f > 60 ? 6 : 4);
    ctx.globalAlpha = Math.min(1, a); ctx.drawImage(glowSprite(col), x - g, y - g, g * 2, g * 2); ctx.globalAlpha = 1;
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
    band = makeCanvas(1600); band.height = 960; const g = band.getContext('2d'), r = rng(sec + 5); g.scale(2, 2);
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

// ---------- 초공간 도약 (구역 이동 연출) ----------
let hyperStreaks = [];
function drawHyper(now) {
  const p = (now - hyper) / 1000 / hyperDur;
  if (p >= 1) { hyper = 0; return; }
  if (!hyperStreaks.length) hyperStreaks = Array.from({ length: 140 }, () => ({ a: Math.random() * 6.283, r: Math.random() * 0.25, s: 0.6 + Math.random() * 0.8 }));
  const cx = cw / 2, cy = ch / 2, R = Math.hypot(cw, ch) / 2, speed = Math.sin(Math.min(1, p) * Math.PI);
  ctx.save();
  ctx.fillStyle = `rgba(3,6,14,${0.55 * speed})`; ctx.fillRect(0, 0, cw, ch);
  ctx.lineCap = 'round';
  hyperStreaks.forEach(h => {
    const d0 = (h.r + p * h.s * 1.6) % 1.2, d1 = Math.max(0, d0 - 0.08 - speed * 0.35 * h.s);
    ctx.strokeStyle = `rgba(${h.s > 1 ? '185,215,255' : '255,240,210'},${0.85 * speed})`; ctx.lineWidth = 1 + h.s * 1.4 * speed;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(h.a) * d1 * R, cy + Math.sin(h.a) * d1 * R); ctx.lineTo(cx + Math.cos(h.a) * d0 * R, cy + Math.sin(h.a) * d0 * R); ctx.stroke();
  });
  if (p > 0.45 && p < 0.65) { ctx.fillStyle = `rgba(255,255,255,${(1 - Math.abs(p - 0.55) / 0.1) * 0.35})`; ctx.fillRect(0, 0, cw, ch); }
  ctx.restore();
}

// ---------- 화면 밖 이름 있는 천체 방향 표시 (확대했을 때 길을 잃지 않게) ----------
let arrows = [];
function drawArrows() {
  arrows = [];
  if (cam.z < 1.35) return;
  const m = 26;
  objs.forEach(o => {
    if (o.kind === 'field') return;
    const [wx, wy] = o.kind === 'star' ? objPos(o) : [o.x, o.y], [x, y] = toScreen(wx, wy);
    if (x > 0 && y > 0 && x < cw && y < ch) return;
    const cx = cw / 2, cy = ch / 2, dx = x - cx, dy = y - cy, k = Math.min((cw / 2 - m) / Math.abs(dx || 1e-6), (ch / 2 - m) / Math.abs(dy || 1e-6));
    const ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx), sel = selected === o.id;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
    ctx.fillStyle = sel ? '#f3c35a' : 'rgba(121,211,232,0.85)'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.font = '600 11px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tx = Math.min(cw - 40, Math.max(40, ax - Math.cos(ang) * 22)), ty = Math.min(ch - 12, Math.max(12, ay - Math.sin(ang) * 18));
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,10,23,0.85)'; ctx.strokeText(o.nm, tx, ty); ctx.fillStyle = sel ? '#f3c35a' : '#cfe3f6'; ctx.fillText(o.nm, tx, ty);
    arrows.push({ id: o.id, x: ax, y: ay });
  });
}

// ---------- 이벤트 별 · 레이더 · 떠오르는 글자 ----------
function drawEvents(t) {
  const now = performance.now();
  evs.forEach((e, id) => {
    const age = (now - e.born) / 1000, left = e.life - age;
    if (left <= 0) { evs.delete(id); return; }
    const [x, y] = toScreen(e.x, e.y);
    const pulse = reduce ? 1 : 1 + 0.18 * Math.sin(t * 6), R = 9 * pulse * (e.rar === 'legend' ? 1.4 : e.rar === 'epic' ? 1.2 : 1);
    const fade = left < 3 ? (Math.floor(left * 4) % 2 ? 0.45 : 1) : 1;
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = fade;
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 4); gl.addColorStop(0, e.col + 'cc'); gl.addColorStop(1, e.col + '00');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, R * 4, 0, 6.2832); ctx.fill();
    if (e.rar === 'legend') { for (let i = 0; i < 6; i++) { ctx.strokeStyle = `hsla(${(t * 120 + i * 60) % 360},90%,70%,0.7)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 2.2, i * 1.047 + t * 2, i * 1.047 + t * 2 + 0.7); ctx.stroke(); } }
    ctx.rotate(reduce ? 0 : t * 1.4);
    ctx.fillStyle = '#fff'; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? R * 0.38 : R * 1.25; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    ctx.rotate(reduce ? 0 : -t * 1.4);
    ctx.strokeStyle = e.col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, R * 1.9, -Math.PI / 2, -Math.PI / 2 + 6.2832 * (left / e.life)); ctx.stroke();
    ctx.font = '700 11px "IBM Plex Sans KR", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = e.col;
    ctx.fillText(e.nm + ' ★', 0, R * 2.2 + 4);
    ctx.restore();
  });
}
function drawRadar(t) {
  if (performance.now() > radarMarks.until) return;
  radarMarks.ids.forEach(id => { const o = objs.find(v => v.id === id); if (!o) return;
    const [wx, wy] = o.kind === 'star' ? objPos(o) : [o.x, o.y], [x, y] = toScreen(wx, wy), r = 16 + 10 * ((t * 1.5) % 1);
    ctx.strokeStyle = `rgba(111,220,155,${1 - (t * 1.5) % 1})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r + (o.size ? o.size * scale() * 0.6 : 0), 0, 6.2832); ctx.stroke(); });
}
function drawFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.age += dt; if (f.age > 1.8) { floats.splice(i, 1); continue; }
    const [x, y] = toScreen(f.x, f.y);
    ctx.globalAlpha = Math.min(1, 2 * (1.8 - f.age)); ctx.font = '700 16px "Black Han Sans", "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(3,6,14,0.85)'; ctx.strokeText(f.text, x, y - 20 - f.age * 34); ctx.fillStyle = f.col; ctx.fillText(f.text, x, y - 20 - f.age * 34);
    ctx.globalAlpha = 1;
  }
}

// ---------- 탐사단 우주선 ----------
function shipTarget(sh, t) {
  const o = sh.aim && objs.find(v => v.id === sh.aim);
  if (o) {
    const [ox, oy] = o.kind === 'star' ? objPos(o) : [o.x, o.y];
    const R = (o.kind === 'star' ? 46 : o.size * 0.75) + sh.ph * 26, a = t * (0.35 + sh.ph * 0.3) + sh.ph * 6.283;
    return [ox + Math.cos(a) * R, oy + Math.sin(a) * R * 0.75];
  }
  // 아직 조준하지 않은 탐사선: 출발 지점(왼쪽 아래) 근처를 천천히 순항
  const a = t * 0.25 + sh.ph * 6.283;
  return [760 + sh.ph * 560 + Math.cos(a) * 40, H - 170 - sh.ph * 110 + Math.sin(a * 2) * 22];
}
function drawShips(t, dt) {
  const many = ships.size > 14, boxes = [];
  ships.forEach(sh => {
    const [tx, ty] = shipTarget(sh, t);
    if (sh.x == null) { sh.x = tx - 200; sh.y = ty + 80; }
    const k = Math.min(1, dt * 1.6), vx = (tx - sh.x) * k, vy = (ty - sh.y) * k;
    sh.x += vx; sh.y += vy;
    if (Math.abs(vx) + Math.abs(vy) > 0.05) sh.ang += (((Math.atan2(vy, vx) - sh.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 0.18;
    const [x, y] = toScreen(sh.x, sh.y);
    sh.lx = null;
    if (x < -30 || y < -30 || x > cw + 30 || y > ch + 30) return;
    const s = sh.me ? 13 : 10, col = sh.col;
    ctx.save(); ctx.translate(x, y); ctx.rotate(sh.ang);
    const fl = s * (1.1 + (reduce ? 0 : Math.random() * 0.7));
    const gr = ctx.createLinearGradient(-s * 0.6, 0, -s * 0.6 - fl, 0);
    gr.addColorStop(0, `rgba(${col},0.85)`); gr.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-s * 0.6, -s * 0.28); ctx.lineTo(-s * 0.6 - fl, 0); ctx.lineTo(-s * 0.6, s * 0.28); ctx.fill();
    ctx.fillStyle = '#e8eef9'; ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, -s * 0.62); ctx.lineTo(-s * 0.35, 0); ctx.lineTo(-s * 0.7, s * 0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgb(${col})`; ctx.beginPath(); ctx.arc(s * 0.15, 0, s * 0.22, 0, 6.2832); ctx.fill();
    ctx.restore();
    if (sh.me) { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, s + 4, 0, 6.2832); ctx.stroke(); }
    if (sh.shield) { ctx.strokeStyle = 'rgba(121,211,232,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, s + 6, 0, 6.2832); ctx.stroke(); }
    if (hover === 'ship:' + sh.key) { ctx.strokeStyle = 'rgba(243,195,90,0.9)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, s + 9, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
    sh.lx = x; sh.ly = y - s - 3; sh.ls = s;
  });
  // 이름표: 내 이름은 항상, 친구 이름은 겹치지 않을 때만
  const order = [...ships.values()].filter(sh => sh.lx != null).sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));
  order.forEach(sh => {
    const x = sh.lx, y = sh.ly, col = sh.col;
    if (x < -30 || y < -30 || x > cw + 30 || y > ch + 30) return;
    ctx.font = `${sh.me ? 700 : 500} ${sh.me ? 12 : many ? 10 : 11}px "IBM Plex Sans KR", "Malgun Gothic", sans-serif`;
    const label = sh.me && sh.nick !== '내 탐사선' ? sh.nick + ' (나)' : sh.nick, w = ctx.measureText(label).width + 4, box = [x - w / 2, y - 13, x + w / 2, y];
    if (!sh.me && boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
    boxes.push(box);
    {
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,10,23,0.8)'; ctx.strokeText(label, x, y); ctx.fillStyle = sh.me ? '#ffffff' : `rgba(${col},0.95)`; ctx.fillText(label, x, y);
    }
  });
}

// ---------- 움직이지 않는 층: 시점이 바뀔 때만 다시 그림 ----------
const layerA = { c: null, key: '' }, layerB = { c: null, key: '' };
function blitLayer(L, draw) {
  const key = [cam.x.toFixed(2), cam.y.toFixed(2), cam.z.toFixed(4), cw, ch, dpr, sector].join('|');
  if (!L.c) L.c = document.createElement('canvas');
  if (L.key !== key) {
    if (L.c.width !== cv.width || L.c.height !== cv.height) { L.c.width = cv.width; L.c.height = cv.height; }
    const g = L.c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch); draw(g); L.key = key;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(L.c, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function drawLayerA(g) {
  const sg = g.createLinearGradient(0, 0, 0, ch);
  if (sector === 3) { sg.addColorStop(0, '#02030a'); sg.addColorStop(1, '#05040f'); } else { sg.addColorStop(0, '#040814'); sg.addColorStop(1, '#0a1024'); }
  g.fillStyle = sg; g.fillRect(0, 0, cw, ch);
  if (band) { const s = scale(), [x0, y0] = toScreen(0, 0); g.globalAlpha = Math.max(0.15, 0.9 / Math.pow(cam.z, 0.85)); g.imageSmoothingQuality = 'high'; g.drawImage(band, x0, y0, W * s, H * s); g.globalAlpha = 1; }
}
function drawLayerB(g) {
  const s = scale();
  objs.forEach(o => {
    const sp = sprites[o.id]; if (!sp) return;
    const [x, y] = toScreen(o.x, o.y), R = o.size * s * (o.kind === 'globular' ? 1.1 : o.kind.match(/emission|reflection|dark/) ? 1.6 : 1.25);
    if (x + R < 0 || y + R < 0 || x - R > cw || y - R > ch) return;
    g.save(); g.translate(x, y);
    if (o.rot) g.rotate(o.rot);
    if (o.tilt) g.scale(1, o.tilt);
    g.globalAlpha = o.kind === 'globular' ? Math.max(0.25, 1 - (cam.z - 1) * 0.12) : 1; // 확대하면 개별 별로 분해되어 보임
    g.globalCompositeOperation = o.kind === 'dark' ? 'source-over' : 'lighter';
    g.drawImage(sp, -R, -R, R * 2, R * 2);
    g.restore();
  });
}

// ---------- render ----------
let t0 = performance.now(), lastNow = performance.now(); const perf = { n: 0, t: performance.now() };
function frame(now) {
  requestAnimationFrame(frame);
  if (!ctx) return;
  if (camT) { // 부드러운 카메라 이동
    cam.x += (camT.x - cam.x) * 0.14; cam.y += (camT.y - cam.y) * 0.14; cam.z += (camT.z - cam.z) * 0.14;
    if (Math.abs(camT.z - cam.z) < 0.002 && Math.abs(camT.x - cam.x) < 0.3 && Math.abs(camT.y - cam.y) < 0.3) { cam = { ...camT }; camT = null; }
    clampCam(cam); onZoom(cam.z);
  }
  const t = (now - t0) / 1000, s = scale(), dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  blitLayer(layerA, drawLayerA);
  // 2초마다 프레임 속도를 재서 느리면 저사양 모드로 (다시 빨라지면 해제)
  perf.n++; if (now - perf.t > 2000) { const fps = perf.n * 1000 / (now - perf.t); if (fps < 32) lowQ = true; else if (fps > 52) lowQ = false; perf.n = 0; perf.t = now; }


  const pad = 40;
  const vis = (x, y) => x > -pad && y > -pad && x < cw + pad && y < ch + pad;
  // 배경
  for (const b of bg) {
    const [x, y] = toScreen(b.x, b.y); if (!vis(x, y)) continue;
    if (b.gal) { ctx.save(); ctx.translate(x, y); ctx.rotate(b.rot); ctx.scale(1, b.e); const rr = b.s * Math.sqrt(cam.z); const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rr); gr.addColorStop(0, `rgba(255,235,210,${b.a})`); gr.addColorStop(1, 'rgba(255,235,210,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.2832); ctx.fill(); ctx.restore(); continue; }
    drawStar(x, y, b.m, b.c, b.ph, t);
  }
  blitLayer(layerB, drawLayerB);
  // 성단·성운 구성 별
  for (const b of members) { const [x, y] = toScreen(b.x, b.y); if (vis(x, y)) drawStar(x, y, b.m, b.c, b.ph, t); }
  // 별 구역 주요 별
  objs.forEach(o => {
    if (o.kind !== 'star' && o.kind !== 'field') return;
    const [wx, wy] = objPos(o), [x, y] = toScreen(wx, wy);
    if (!vis(x, y)) return;
    drawStar(x, y, o.kind === 'field' && !fieldBright ? o.m + 1.6 : Math.min(o.m, mlim() - 0.6), o.col || (o.col = kelvin(o.T)), (o.x % 97) / 97, t, o.kind === 'field' ? (fieldBright ? 1.05 : 0) : 1.15);
  });
  // 라벨·조준선
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  objs.forEach(o => {
    const [wx, wy] = o.kind === 'star' ? objPos(o) : [o.x, o.y], [x, y] = toScreen(wx, wy);
    if (!vis(x, y)) return;
    if (collected.has(o.id)) { ctx.strokeStyle = 'rgba(111,220,155,0.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.2832); ctx.stroke(); }
    if (o.kind === 'field') { if (hover === o.id) { ctx.strokeStyle = 'rgba(121,211,232,0.6)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(x, y, 14, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); } return; }
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
  drawEvents(t);
  drawRadar(t);
  drawArrows();
  if (hyper) drawHyper(now);
  drawShips(t, dt);
  drawFloats(dt);
}

function focusObj(id) { const o = objs.find(v => v.id === id); if (!o) return; const z = Math.max(cam.z, o.kind === 'star' || o.kind === 'field' ? 2.2 : 2.6); camT = clampCam({ x: o.x, y: o.y, z: Math.min(6, z) }); }

// ---------- 우주 커서: 토성(기본) · 조준경(누를 수 있는 것 위) · 혜성(끌기) ----------
const CUR = (svg, x, y, fb) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${x} ${y}, ${fb}`;
const C_PLANET = CUR('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><ellipse cx="16" cy="16" rx="14" ry="5" fill="none" stroke="#f3c35a" stroke-width="2" transform="rotate(-20 16 16)"/><circle cx="16" cy="16" r="7" fill="#e9b864" stroke="#1b1404" stroke-width="1"/><circle cx="16" cy="16" r="1.4" fill="#1b1404"/></svg>', 16, 16, 'crosshair');
const C_AIM = CUR('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="10" fill="none" stroke="#79d3e8" stroke-width="2"/><path d="M16 1v8M16 23v8M1 16h8M23 16h8" stroke="#79d3e8" stroke-width="2"/><circle cx="16" cy="16" r="2" fill="#f3c35a"/></svg>', 16, 16, 'pointer');
const C_COMET = CUR('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#79d3e8" stop-opacity="0"/><stop offset="1" stop-color="#79d3e8"/></linearGradient></defs><path d="M2 30 L20 12 L24 16 Z" fill="url(#g)"/><circle cx="23" cy="9" r="6" fill="#fff" stroke="#79d3e8" stroke-width="2"/></svg>', 23, 9, 'grabbing');

// ---------- input ----------
const ptrs = new Map(); let drag = null, pinch = null;
function pickAt(sx, sy) {
  let best = null, bd = 1e9; const s = scale();
  arrows.forEach(a => { const d = Math.hypot(a.x - sx, a.y - sy); if (d < 22 && d < bd) { bd = d; best = 'goto:' + a.id; } });
  if (best) return best;
  evs.forEach((e, id) => { const [x, y] = toScreen(e.x, e.y), d = Math.hypot(x - sx, y - sy); if (d < 30 && d < bd) { bd = d; best = 'ev:' + id; } });
  if (best) return best;
  ships.forEach((sh, id) => { if (sh.me || sh.x == null) return; const [x, y] = toScreen(sh.x, sh.y), d = Math.hypot(x - sx, y - sy); if (d < 20 && d < bd) { bd = d; best = 'ship:' + id; } });
  if (best) return best;
  objs.forEach(o => {
    const [wx, wy] = o.kind === 'star' ? objPos(o) : [o.x, o.y], [x, y] = toScreen(wx, wy);
    const lim = o.kind === 'star' ? 28 : o.kind === 'field' ? 18 : Math.max(30, o.size * s * 0.9);
    const d = Math.hypot(x - sx, y - sy); if (d < lim && d < bd) { bd = d; best = o.id; }
  });
  return best;
}
function zoomAt(sx, sy, factor) {
  const [wx, wy] = toWorld(sx, sy);
  const z = Math.min(6, Math.max(1, (camT ? camT.z : cam.z) * factor));
  cam.z = z; const s = scale();
  cam.x = wx - (sx - cw / 2) / s; cam.y = wy - (sy - ch / 2) / s; camT = null; clampCam(cam); onZoom(cam.z);
}
function bind() {
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: cam.x, cy: cam.y, moved: false };
    if (ptrs.size === 2) { const p = [...ptrs.values()]; pinch = { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), z: cam.z }; drag = null; } });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) { hover = pickAt(e.offsetX, e.offsetY); cv.style.cursor = hover ? C_AIM : C_PLANET; return; }
    ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pinch && ptrs.size === 2) { const p = [...ptrs.values()]; const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      const mx = (p[0][0] + p[1][0]) / 2, my = (p[0][1] + p[1][1]) / 2; zoomAt(mx, my, (pinch.z * d / pinch.d) / cam.z); return; }
    if (drag) { const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (drag.moved) { const s = scale(); cam.x = drag.cx - dx / s; cam.y = drag.cy - dy / s; camT = null; clampCam(cam); cv.style.cursor = C_COMET; } }
  });
  const up = e => { const wasDrag = drag && drag.moved; ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && !wasDrag && ptrs.size === 0) { const id = pickAt(e.offsetX, e.offsetY); if (id && id.startsWith('goto:')) focusObj(id.slice(5)); else if (id) onPick(id); }
    if (ptrs.size === 0) drag = null; cv.style.cursor = C_PLANET; };
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
  init(canvas, opts) { cv = canvas; cv.style.cursor = C_PLANET; ctx = cv.getContext('2d'); onPick = opts.onPick; onZoom = opts.onZoom || onZoom; bind(); resize(); requestAnimationFrame(frame); },
  setSector(sec) { sector = sec; objs = SQ.SECTORS[sec].objs; genBackground(sec); genMembers(sec); genSprites(sec); cam = clampCam({ x: W / 2, y: H / 2, z: 1 }); camT = null; selected = null; ships.forEach(sh => { sh.x = null; }); evs.clear(); layerA.key = layerB.key = ''; onZoom(1); },
  setSelected(id) { selected = id; },
  setObserved(set) { observed = set; },
  setFieldBright(v) { fieldBright = !!v; },
  hyperspace() { if (!reduce) { hyper = performance.now(); hyperStreaks = []; } },
  arrowList() { return arrows.slice(); },
  worldToScreen(x, y) { return toScreen(x, y); },
  shipPos(id) { const s = ships.get(id); return s && s.x != null ? toScreen(s.x, s.y) : null; },
  setCollected(set) { collected = set; },
  zoom(f) { zoomAt(cw / 2, ch / 2, f); },
  reset() { camT = clampCam({ x: W / 2, y: H / 2, z: 1 }); },
  focus(id) { focusObj(id); },
  addEvent(e) { evs.set(e.id, { ...e, born: performance.now() }); },
  takeEvent(id) { const e = evs.get(id); evs.delete(id); return e; },
  floatText(x, y, text, col) { floats.push({ x, y, text, col: col || '#f3c35a', age: 0 }); if (floats.length > 12) floats.shift(); },
  radar(ids, secs) { radarMarks.ids = ids; radarMarks.until = performance.now() + secs * 1000; },
  setShips(list) {
    const keep = new Set();
    list.forEach((p, i) => {
      keep.add(p.id);
      const sh = ships.get(p.id) || { ang: 0, ph: ([...String(p.id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 9973, 7) % 100) / 100, col: SHIPCOL[i % SHIPCOL.length] };
      sh.nick = p.nick; sh.me = !!p.me; sh.aim = p.aim; sh.shield = !!p.shield; sh.key = p.id; if (p.col) sh.col = p.col; ships.set(p.id, sh);
    });
    [...ships.keys()].forEach(id => { if (!keep.has(id)) ships.delete(id); });
  },
  kelvin,
};
})();
