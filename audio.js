/* 별빛탐정단 — 배경음악·효과음 (Web Audio로 직접 합성, 외부 음원 없음)
   전쟁 북처럼 두두둥 울리는 타악기 + 낮게 깔리는 베이스 반복 + 금관 느낌의 화음 */
window.SQAudio = (() => {
let outNode = null, analyser = null, ac = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
let playing = false, timer = null, nextTime = 0, step = 0;

function ctx() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 1.0;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3.5; comp.attack.value = 0.005; comp.release.value = 0.2;
  // 압축 → 음량 보정 → 리미터 (작은 스피커에서도 또렷하게, 찢어지지 않게)
  const makeup = ac.createGain(); makeup.gain.value = 2.0;
  const lim = ac.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
  master.connect(comp); comp.connect(makeup); makeup.connect(lim); lim.connect(ac.destination); outNode = lim;
  analyser = ac.createAnalyser(); analyser.fftSize = 2048; lim.connect(analyser);
  musicBus = ac.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

// ---------- 악기: 블록버스터 우주전쟁 오케스트라 ----------
// 북은 음높이를 거의 휘지 않게(동양 북 느낌 X), 금관·현악은 낮고 두껍게, 넓은 홀 잔향
let reverb = null, mode = 1;
function makeReverb() {
  const len = ac.sampleRate * 3.2, buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  const cv = ac.createConvolver(); cv.buffer = buf; const wet = ac.createGain(); wet.gain.value = 0.28; cv.connect(wet); wet.connect(musicBus); return cv;
}
function send(node, amt) { const g = ac.createGain(); g.gain.value = amt; node.connect(g); g.connect(reverb); }
function noise(t, dur, type, f, q, vol, out) {
  const n = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noiseBuf; fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(fl); fl.connect(g); g.connect(out); n.start(t); n.stop(t + dur + 0.02); return g;
}
function bassDrum(t, vol) { // 오케스트라 큰북: 둔탁한 '쿵' (소음 기반 + 짧은 저음)
  const b = noise(t, 0.55, 'lowpass', 420, 1.2, vol * 0.9, musicBus); send(b, 0.7);
  const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
  g.gain.setValueAtTime(vol * 0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.5);
  noise(t, 0.03, 'bandpass', 1200, 1, vol * 0.35, musicBus);
}
function snare(t, vol, out) { // 행진 스네어
  const g1 = noise(t, 0.14, 'bandpass', 2400, 0.8, vol, out || musicBus); if (!out) send(g1, 0.35);
  noise(t, 0.05, 'highpass', 5500, 0, vol * 0.5, out || musicBus);
}
function tom(t, f, vol, out) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4); noise(t, 0.2, 'lowpass', 400, 0, vol, out); }
function strings(t, f, dur, vol) { // 현악 스타카토 '다다다다'
  [0, 8, -8].forEach(det => {
    const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    fl.type = 'lowpass'; fl.frequency.value = 1700; fl.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(musicBus); send(g, 0.2); o.start(t); o.stop(t + dur + 0.05);
  });
}
function lowPulse(t, f, dur, vol) { // 저음 현악 펄스 (첼로·베이스)
  const o = ac.createOscillator(), o2 = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
  o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 2.003;
  fl.type = 'lowpass'; fl.frequency.value = 950;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(musicBus); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function braam(t, notes, dur, vol) { // 블록버스터 '브와아앙!'
  notes.forEach(f => [0, 11, -11, 1200].forEach((det, k) => {
    const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(180, t); fl.frequency.exponentialRampToValueAtTime(2600, t + 0.35); fl.frequency.exponentialRampToValueAtTime(350, t + dur);
    const v = vol * (k === 3 ? 0.35 : 1);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.12); g.gain.setValueAtTime(v, t + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(musicBus); send(g, 0.6); o.start(t); o.stop(t + dur + 0.05);
  }));
}
function tremolo(t, freqs, dur, vol) { // 높은 현악 트레몰로 (긴장감)
  freqs.forEach(f => {
    const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = 2400;
    lfo.frequency.value = 11; lg.gain.value = vol * 0.5; lfo.connect(lg); lg.connect(g.gain);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(musicBus); send(g, 0.4); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  });
}
function hornLine(t, f, dur, vol) { // 영웅 금관 멜로디
  [0, 6, -6].forEach(det => {
    const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(600, t); fl.frequency.linearRampToValueAtTime(1800, t + 0.15);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.07); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(musicBus); send(g, 0.5); o.start(t); o.stop(t + dur + 0.05);
  });
}
function bell(t, f, vol, out) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1); o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.1); }

// ---------- 악보: 4/4, BPM 104, 16분음표 16칸. D단조 i – VI – iv – V (Dm – B♭ – Gm – A) ----------
// mode 0 = 긴장(설명·퀴즈) · 1 = 전투(관측 중) · 2 = 클라이맥스(워프·대결·완료)
const BPM = 104, STEP = 60 / BPM / 4, BAR = 16;
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
const ROOT  = [50, 46, 43, 45];                       // D3, B♭2, G2, A2
const THIRD = [3, 4, 3, 4];                           // 단3·장3 (A는 장화음 → 긴장)
const OST = [0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 3, 0]; // 다다다다 다다'다'다 다다'다'다 다다'다'다
const HORN = [[0, 74, 6], [6, 81, 2], [8, 82, 4], [12, 81, 4]]; // [16분 위치, 음, 길이] D5 A5 B♭5 A5
function schedule() {
  while (nextTime < ac.currentTime + 0.2) {
    const bar = Math.floor(step / BAR), s = step % BAR, t = nextTime, ch = bar % 4, r = ROOT[ch], last = ch === 3;
    // 현악 오스티나토 (항상)
    strings(t, hz(r + 12 + OST[s]), STEP * 0.85, (s % 4 === 0 ? 0.1 : 0.065) * (mode === 0 ? 0.85 : 1));
    // 저음 펄스: 8분음표
    if (s % 2 === 0) lowPulse(t, hz(r - 12 + (r < 47 ? 12 : 0)), STEP * 1.7, mode === 0 ? 0.12 : 0.15);
    // 브와아앙: 4마디마다 (모드 0에서도 가끔)
    if (s === 0 && ch === 0 && (mode > 0 || bar % 8 === 0)) braam(t, [hz(r - 12), hz(r - 5), hz(r)], STEP * 14, mode === 2 ? 0.11 : 0.085);
    // 큰북 · 스네어 (전투 이상)
    if (mode >= 1) {
      if (s === 0 || s === 8 || (s === 6 && bar % 2)) bassDrum(t, s === 0 ? 0.9 : 0.65);
      if (s === 4 || s === 12) snare(t, 0.2);
      if (last && s >= 8) { snare(t, 0.1 + (s - 8) * 0.025); if (s % 2 === 0) bassDrum(t, 0.5); }   // 마디 끝 몰아치기
    } else if (s === 0) bassDrum(t, 0.5);
    // 높은 트레몰로 (긴장감)
    if (s === 0 && mode >= 1) tremolo(t, [hz(r + 24), hz(r + 24 + THIRD[ch])], STEP * BAR, 0.02);
    // 클라이맥스: 영웅 금관 멜로디 + 화음 금관
    if (mode === 2) {
      if (bar % 2 === 0) HORN.forEach(([k, n, d]) => { if (k === s) hornLine(t, hz(n - 12), STEP * d, 0.07); });
      if (s === 0) braam(t, [hz(r), hz(r + THIRD[ch]), hz(r + 7)], STEP * 15, 0.03);
    }
    nextTime += STEP; step++;
  }
}

function start() {
  if (!ctx()) return false;
  ac.resume();
  if (!reverb) reverb = makeReverb();
  if (playing) return true;
  playing = true; step = 0; nextTime = ac.currentTime + 0.05;
  musicBus.gain.cancelScheduledValues(ac.currentTime); musicBus.gain.setTargetAtTime(0.85, ac.currentTime, 0.4);
  timer = setInterval(schedule, 25); schedule();
  return true;
}
function stop() {
  if (!ac || !playing) return;
  playing = false; clearInterval(timer);
  musicBus.gain.setTargetAtTime(0, ac.currentTime, 0.2);
}
function setMode(m) { mode = Math.max(0, Math.min(2, m)); }

// ---------- 효과음 ----------
function sfx(kind) {
  if (!ctx() || ac.state !== 'running') return;
  const t = ac.currentTime + 0.01;
  if (kind === 'measure') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.08); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.2); }
  if (kind === 'pick') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = 660; g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.12); }
  if (kind === 'wrong') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.setValueAtTime(180, t); o.frequency.linearRampToValueAtTime(120, t + 0.3); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.4); }
  if (kind === 'ok') [72, 76, 79, 84].forEach((n, i) => { const o = ac.createOscillator(), g = ac.createGain(), tt = t + i * 0.09; o.type = 'sawtooth'; o.frequency.value = hz(n); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.16, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.001, tt + (i === 3 ? 0.7 : 0.2)); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500; o.connect(f); f.connect(g); g.connect(sfxBus); o.start(tt); o.stop(tt + 0.8); });
  if (kind === 'hit') { tom(t, 70, 1, sfxBus); snare(t, 0.6, sfxBus); }
  if (kind === 'warp') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(900, t + 1.2); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + 1.3); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.4); }
}

return {
  start, stop, sfx, setMode,
  get playing() { return playing; },
  level() { if (!analyser) return 0; const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); },
  state() { return ac ? ac.state : 'none'; },
  capture() { if (!ctx()) return null; const d = ac.createMediaStreamDestination(); outNode.connect(d); return d.stream; },
  unlock() { if (ctx() && ac.state !== 'running') ac.resume(); },
};
})();
