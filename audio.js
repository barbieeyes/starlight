/* 별빛탐정단 — 배경음악·효과음 (Web Audio로 직접 합성, 외부 음원 없음)
   전쟁 북처럼 두두둥 울리는 타악기 + 낮게 깔리는 베이스 반복 + 금관 느낌의 화음 */
window.SQAudio = (() => {
let ac = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
let playing = false, timer = null, nextTime = 0, step = 0;
const BPM = 112, STEP = 60 / BPM / 4; // 16분음표 길이

function ctx() {
  if (ac) return ac;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ac = new AC();
  master = ac.createGain(); master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ac.destination);
  musicBus = ac.createGain(); musicBus.gain.value = 0; musicBus.connect(master);
  sfxBus = ac.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

// ---------- 악기 ----------
function drum(t, f, decay, vol, out) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f * 2.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + decay + 0.05);
  const n = ac.createBufferSource(), nf = ac.createBiquadFilter(), ng = ac.createGain();
  n.buffer = noiseBuf; nf.type = 'lowpass'; nf.frequency.value = f * 9;
  ng.gain.setValueAtTime(vol * 0.35, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  n.connect(nf); nf.connect(ng); ng.connect(out); n.start(t); n.stop(t + 0.1);
}
function snare(t, vol, out) {
  const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  n.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
  n.connect(f); f.connect(g); g.connect(out); n.start(t); n.stop(t + 0.13);
}
function bass(t, f, dur, vol, out) {
  const o = ac.createOscillator(), o2 = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
  o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = f; o2.frequency.value = f / 2;
  fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(180, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(fl); o2.connect(fl); fl.connect(g); g.connect(out); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function brass(t, freqs, dur, vol, out) {
  freqs.forEach(f => [0, 4, -5].forEach(det => {
    const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(400, t); fl.frequency.linearRampToValueAtTime(1500, t + 0.35); fl.frequency.linearRampToValueAtTime(700, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.3); g.gain.setValueAtTime(vol, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }));
}

// ---------- 악보 ----------
// K: 큰북(두웅)  T: 중간 북(둥)  t: 높은 북(두)  s: 작은북  r: 작은북 굴림(뚜루루)
const DRUMS = [
  'K..T K..T K.TT K...',
  'K..T K..T KTKT rrrr',
  'K..T K..T K.TT K.tt',
  'K.K. TTtt rrrr K.K.',
].map(s => s.replace(/ /g, ''));
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
const ROOTS = [38, 38, 34, 36, 38, 38, 41, 36];           // D, D, Bb, C, D, D, F, C (D 단조)
const CHORDS = [[62, 65, 69], [58, 62, 65], [60, 64, 67], [62, 65, 69]]; // Dm, Bb, C, Dm
const BASSPAT = [0, 0, 12, 0, 0, 0, 12, 7];               // 8분음표마다 근음 기준 반음

function schedule() {
  while (nextTime < ac.currentTime + 0.15) {
    const bar = Math.floor(step / 16), s = step % 16, pat = DRUMS[bar % 4][s];
    const t = nextTime;
    if (pat === 'K') drum(t, 48, 0.55, 0.95, musicBus);
    if (pat === 'T') drum(t, 82, 0.32, 0.7, musicBus);
    if (pat === 't') drum(t, 130, 0.22, 0.55, musicBus);
    if (pat === 's') snare(t, 0.35, musicBus);
    if (pat === 'r') { snare(t, 0.22, musicBus); snare(t + STEP / 2, 0.28, musicBus); }
    if (s % 2 === 0) { const root = ROOTS[bar % 8]; bass(t, hz(root + BASSPAT[s / 2]), STEP * 1.6, 0.22, musicBus); }
    if (s === 0 && bar % 2 === 0) brass(t, CHORDS[(bar / 2) % 4].map(hz), STEP * 30, 0.035, musicBus);
    nextTime += STEP; step++;
  }
}

function start() {
  if (!ctx()) return false;
  ac.resume();
  if (playing) return true;
  playing = true; step = 0; nextTime = ac.currentTime + 0.05;
  musicBus.gain.cancelScheduledValues(ac.currentTime); musicBus.gain.setTargetAtTime(0.42, ac.currentTime, 0.4);
  timer = setInterval(schedule, 25); schedule();
  return true;
}
function stop() {
  if (!ac || !playing) return;
  playing = false; clearInterval(timer);
  musicBus.gain.setTargetAtTime(0, ac.currentTime, 0.15);
}

// ---------- 효과음 ----------
function sfx(kind) {
  if (!ctx() || ac.state !== 'running') return;
  const t = ac.currentTime + 0.01;
  if (kind === 'measure') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.08); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.2); }
  if (kind === 'pick') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = 660; g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.12); }
  if (kind === 'wrong') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.setValueAtTime(180, t); o.frequency.linearRampToValueAtTime(120, t + 0.3); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.4); }
  if (kind === 'ok') [72, 76, 79, 84].forEach((n, i) => { const o = ac.createOscillator(), g = ac.createGain(), tt = t + i * 0.09; o.type = 'sawtooth'; o.frequency.value = hz(n); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.16, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.001, tt + (i === 3 ? 0.7 : 0.2)); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500; o.connect(f); f.connect(g); g.connect(sfxBus); o.start(tt); o.stop(tt + 0.8); });
  if (kind === 'hit') { drum(t, 40, 0.6, 1, sfxBus); snare(t, 0.6, sfxBus); }
  if (kind === 'warp') { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(900, t + 1.2); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + 1.3); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 1.4); }
}

return {
  start, stop, sfx,
  get playing() { return playing; },
  unlock() { if (ctx() && ac.state !== 'running') ac.resume(); },
};
})();
