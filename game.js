/* 별빛탐정단: 우주 원정 — 게임 진행 */
(() => {
const { MISSIONS, SECTORS, TOOLS, WARPS, STARS, starWrong, isHot, isCool, QPTS, TEAMS, BASE_TEAMS, teamName, shipIcon, teamText } = SQ;
const tm = i => TEAMS[i] || TEAMS[0];
const COLORS = { '청색':'#8fb4ff','청백색':'#b6ccff','백색':'#f4f6ff','황백색':'#fff0c4','황색':'#ffd970','주황색':'#ffb062','적색':'#ff7a5c' };
const REWARD_KEY = { '성단':'clusters', '성운':'nebulae', '은하':'galaxies' };
const KEY = 'sq2-state';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = n => (n < 0 ? '−' + Math.abs(n).toFixed(1) : n.toFixed(1));
const fmtSh = n => String(+n.toFixed(3)) + '″';

function fresh() { return { col:{}, last:null, started:false, mi:0, phase:'intro', en:MISSIONS[0].energy, sel:null, obs:{}, wrong:0, res:[], stars:0, clusters:0, nebulae:0, galaxies:0, hits:0, done:0, finished:false, net:null, msg:null, warpDone:[], memDone:[], lastAttack:0, bonus:0, items:[], boostUntil:0, streak:0 }; }
let S = fresh();
try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v.mi === 'number' && v.mi < MISSIONS.length) S = { ...fresh(), ...v }; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const M = () => MISSIONS[S.mi];
const SEC = () => SECTORS[M().sector];
const objOf = id => SEC().objs.find(o => o.id === id);
const sync = (kind, body) => SQNet.progress(S.net, { ...S, sector: M().sector }, kind, body);

// ---------- sky ----------
let curSector = -1;
Sky.init($('sky'), { onPick: pick, onZoom: z => { $('zl').textContent = '×' + z.toFixed(1); } });
$('zin').onclick = () => Sky.zoom(1.5); $('zout').onclick = () => Sky.zoom(1 / 1.5); $('zreset').onclick = () => Sky.reset();
function ensureSector() { const sec = M().sector; if (sec !== curSector) { const first = curSector < 0; curSector = sec; Sky.setSector(sec); if (!first) Sky.hyperspace(); } }

function pick(id) {
  if (id.startsWith('ship:')) { openShip(id.slice(5)); return; }
  if (id.startsWith('ev:')) { if (S.phase === 'play') grabEvent(id.slice(3)); return; }
  if (S.phase !== 'play') return;
  const o = objOf(id); if (!o) return;
  if (M().collect) { collect(o); return; }
  if (o.kind === 'field') return;
  S.sel = id; S.msg = null; save(); SQAudio.sfx('pick'); SQNet.aim(S.net, M().sector, id); render(); }

// ---------- actions ----------
// 관측 에너지는 시간이 지나면 저절로 참 (10초에 1) → 에너지가 없어서 찍는 일이 없게
const REGEN_S = 10, LOCK_S = 8;
setInterval(() => {
  if (!S.started || S.phase !== 'play' || S.finished) return;
  const cap = M().energy, now = Date.now();
  if (S.en >= cap) { S.regenAt = 0; paintRegen(); return; }
  if (!S.regenAt) S.regenAt = now + REGEN_S * 1000;
  if (now >= S.regenAt) { S.en++; S.regenAt = S.en < cap ? now + REGEN_S * 1000 : 0; save(); render(); }
  paintRegen();
  const lb = $('accuse'); if (lb) { const l = Math.ceil(((S.lockUntil || 0) - now) / 1000); lb.disabled = l > 0; lb.textContent = l > 0 ? `망원경 재정렬 중… ${l}초` : lb.dataset.label; }
}, 1000);
function paintRegen() { const el = $('regen'); if (!el) return; const l = S.regenAt ? Math.max(0, Math.ceil((S.regenAt - Date.now()) / 1000)) : 0; el.textContent = l ? `+1까지 ${l}초` : '가득'; }
const REC = { '눈속임의 범인': ['abs'], '마지막 증인, 태양': ['spec', 'abs'], '공 모양의 별 무리': ['shape', 'count'], '스스로 빛나는 구름': ['nspec'], '우리은하를 닮은 은하': ['struct'], '매끈한 은하': ['struct', 'gshape'] };
const bolts = n => '⚡'.repeat(n);
function toolsFor() { return M().collect ? [] : M().sector === 0 ? M().tools : SEC().tools; }
function measure(tid) {
  const o = objOf(S.sel), t = TOOLS[tid], key = t.key || tid;
  const ob = S.obs[o.id] || (S.obs[o.id] = {});
  if (ob[key]) return;
  if (S.en < t.cost) { const w = Math.max(1, Math.ceil(((S.regenAt || Date.now()) - Date.now()) / 1000)); S.msg = { bad:true, t:`⚡ 에너지 충전 중이에요. 약 ${w + (t.cost - S.en - 1) * REGEN_S}초 뒤 측정할 수 있어요. 그동안 수첩의 값을 비교해 보세요!` }; render(); return; }
  S.en -= t.cost; ob[key] = true; S.msg = null; save(); SQAudio.sfx('measure'); render();
}
function accuse() {
  const m = M(), o = objOf(S.sel);
  if (Date.now() < (S.lockUntil || 0)) return;
  if (S.sel === m.target) { S.phase = 'quiz'; save(); render(); showQuiz(); return; }
  S.wrong++; S.lockUntil = Date.now() + LOCK_S * 1000; SQAudio.sfx('wrong');
  const tip = m.sector === 0 ? starWrong(S.mi, o, S.obs[o.id] || {}, fmt, fmtSh) : m.wrong;
  S.msg = { bad:true, t:`${o.nm}은(는) 아니야! 이 미션 별점 −1, ${LOCK_S}초 동안 망원경 재정렬. ${tip}` }; save(); render();
}

function collect(o) {
  const m = M(), list = S.col[S.mi] || (S.col[S.mi] = []);
  S.sel = o.id; SQNet.aim(S.net, m.sector, o.id);
  if (Date.now() < (S.lockUntil || 0)) { toast('망원경이 흔들리는 중이에요. 잠깐만 기다려요!'); return; }
  if (list.includes(o.id)) { S.last = { id:o.id, ok:true, again:true }; save(); render(); return; }
  const ok = m.collect === 'hot' ? isHot(o) : isCool(o);
  if (ok) {
    list.push(o.id); S.last = { id:o.id, ok:true }; SQAudio.sfx('measure'); S.streak++;
    if (S.streak >= 3) { const p = addPoints(20, null); Sky.floatText(o.x, o.y, `${S.streak}연속! +${p}P`, '#6fdc9b'); }
    if (list.length >= m.need) { S.phase = 'quiz'; save(); render(); showQuiz(); return; }
  } else {
    S.wrong++; S.last = { id:o.id, ok:false }; SQAudio.sfx('wrong'); S.streak = 0; S.lockUntil = Date.now() + 3000;
  }
  save(); render();
}

// ---------- 장면 전환 연출 ----------
function banner(sub, title) {
  const b = $('banner'); $('bsub').textContent = sub; $('btitle').textContent = title;
  b.classList.remove('play'); void b.offsetWidth; b.classList.add('play');
}
function flash(color) { const f = $('flash'); f.style.background = `radial-gradient(ellipse at center, ${color}, transparent 70%)`; f.classList.remove('play'); void f.offsetWidth; f.classList.add('play'); }

// ---------- render ----------
function bump(id, cls) { const el = $(id); el.classList.remove('bump', 'lose'); void el.offsetWidth; el.classList.add(cls); }
function render() {
  ensureSector();
  const m = M(), sec = SEC();
  Sky.setSelected(S.sel);
  Sky.setCollected(new Set(m.collect ? (S.col[S.mi] || []) : []));
  Sky.setFieldBright(!!m.collect && !S.finished);
  Sky.setObserved(new Set(Object.keys(S.obs).filter(id => sec.objs.some(o => o.id === id))));
  $('who').innerHTML = S.net ? `<span class="whoteam">${shipIcon(tm(S.net.team || 0).col, 18)}${teamName(S.net.team || 0)}</span> · <b>${esc(S.net.nickname)}</b> · 방 ${esc(S.net.code)}` : '혼자 탐사 중';
  $('en').textContent = S.en;
  $('cells').innerHTML = Array.from({ length: m.energy }, (_, i) => `<i class="${i < S.en ? '' : 'off'}"></i>`).join('');
  ['clusters', 'nebulae', 'galaxies'].forEach(k => $(k).textContent = S[k]);
  paintScore();
  renderRoute(); renderHud(); renderPanel(); renderBook(); renderShips();
}

function renderRoute() {
  let h = `<div class="routelbl"><b>원정 경로</b><span>미션 ${Math.min(S.done + 1, MISSIONS.length)} / ${MISSIONS.length}</span></div>`;
  SECTORS.forEach((sec, si) => {
    const ms = MISSIONS.map((m, i) => [m, i]).filter(([m]) => m.sector === si);
    const now = M().sector === si && !S.finished;
    h += `<div class="leg ${now ? 'now' : ''}"><span class="nm">${si + 1}. ${sec.nm}</span><div class="dots">${ms.map(([m, i]) =>
      `<span class="${i < S.done ? 'done' : i === S.mi && !S.finished ? 'cur' : ''}" title="${esc(m.title)}">${i < S.done ? '✓' : m.code}</span>` + (MEMS.some(x => x.after === i) ? `<span class="mem ${S.memDone.includes(i) ? 'done' : ''}" title="기억력 테스트">🧠</span>` : '')).join('')}</div></div>`;
    const w = WARPS.find(w => w.from === si);
    if (w) h += `<div class="warp ${S.done > w.after ? 'done' : ''}" title="${esc(w.title)}">☄<br>워프</div>`;
  });
  $('route').innerHTML = h;
}
function renderHud() {
  const m = M();
  $('hud').innerHTML = S.finished
    ? `<div class="mt"><span class="num">EXPEDITION COMPLETE</span><span class="ttl">원정 완료!</span></div><div class="goal">하늘을 자유롭게 둘러보세요.</div>`
    : `<div class="mt"><span class="num">MISSION ${m.code} / ${MISSIONS.length} · ${esc(SEC().nm)}</span><span class="ttl">${esc(m.title)}</span></div>
       <div class="goal">찾을 것: <b style="color:var(--amber)">${esc(m.goal)}</b></div>
       <div class="how">방법: ${esc(m.how)}</div>
       <div class="chips">${m.chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>`;
}

function renderPanel() {
  const m = M(), p = $('panel');
  if (S.finished) { p.innerHTML = `<div class="eyebrow">원정 완료</div><p class="empty">모든 미션을 해결했어요! 하늘을 확대해서 성단과 은하를 다시 살펴보세요.</p><button class="go" id="again2">처음부터 다시 탐사</button>`; $('again2').onclick = restart; return; }
  const hint = `<details class="hint2"><summary>관측소장의 힌트</summary><p style="margin:6px 0 0">${esc(m.hint)}</p></details>`;
  if (m.collect) {
    const list = S.col[S.mi] || [], n = list.length, L = S.last, lo = L && L.id ? objOf(L.id) : null;
    const word = m.collect === 'hot' ? '표면 온도가 높은 별' : '표면 온도가 낮은 별';
    let res = '<p class="empty">하늘의 별을 눌러 보세요. 맞으면 초록 동그라미가 생겨요.</p>';
    if (L && L.reset) res = '<div class="msg bad" role="status">에너지가 바닥났어요! 모은 별이 사라졌어요. 처음부터 다시 모아 보세요.</div>';
    else if (lo) res = `<div class="ro"><div class="k">${L.again ? '이미 모은 별' : L.ok ? '수집 성공!' : '이 별은 아니에요 · 3초 동안 망원경 흔들림'}</div>
      <div class="v" style="color:${COLORS[lo.c]}">● ${lo.c} · 약 ${lo.T.toLocaleString()} K</div>
      <div class="note">${L.ok ? `${word}이 맞아요.` : `${word}이 아니에요. ${m.collect === 'hot' ? '더 파란 별을 찾아보세요.' : '더 붉은 별을 찾아보세요.'}`}</div></div>`;
    p.innerHTML = `<div class="eyebrow">별 수집 · ${esc(SEC().nm)}</div>
      <h3>${word} <span style="font-family:var(--f-mono);color:var(--amber)">${n} / ${m.need}</span></h3>
      <div class="bar10">${Array.from({ length: m.need }, (_, i) => { const so = list[i] && objOf(list[i]); return `<i style="${so ? `background:${COLORS[so.c]};box-shadow:0 0 8px ${COLORS[so.c]}` : ''}"></i>`; }).join('')}</div>
      ${res}${hint}`;
    return;
  }
  if (!S.sel) { p.innerHTML = `<div class="eyebrow">망원경 대기 중</div><p class="empty">① 하늘에서 <b>이름이 있는 천체</b>를 눌러 망원경을 맞춰요.<br>② 관측 장비 버튼으로 측정해요 (⚡ 하나 = 에너지 1).<br>③ 정답이다 싶으면 <b>지목하기</b>!<br><span class="muted">확대했을 때 화면 가장자리의 ▶ 표시를 누르면 그 천체로 이동해요. 친구 우주선을 누르면 공격·대결·도움을 할 수 있어요.</span></p>${hint}`; return; }
  const o = objOf(S.sel), ob = S.obs[o.id] || {};
  const list = (m.sector === 0 ? ['mag', 'spec', 'plx', 'abs'] : SEC().tools).map(tid => {
    const t = TOOLS[tid], key = t.key || tid, on = toolsFor().includes(tid), done = !!ob[key];
    const rec = on && !done && (REC[m.title] || []).includes(tid);
    const cost = !on ? `<span class="tc off">${tid === 'abs' ? 'MISSION 02부터' : '사용 불가'}</span>` : done ? '<span class="tc ok">✓ 측정 완료</span>' : `<span class="tc" aria-label="에너지 ${t.cost}">${bolts(t.cost)}</span>`;
    return `<button class="tool ${done ? 'done' : ''} ${rec ? 'rec' : ''}" data-t="${tid}" ${!on || done ? 'disabled' : ''}>${rec ? '<span class="recb">추천</span>' : ''}<span class="t"><span class="ric">${TOOL_IC[tid] || ''}</span>${t.name}</span><span class="c">${t.what}</span>${cost}</button>`;
  }).join('');
  const dot = o.kind === 'star' ? (ob.spec ? COLORS[o.c] : '#c9d2e6') : '#c9d2e6';
  p.innerHTML = `<div class="eyebrow">망원경 고정 · ${esc(SEC().nm)}</div>
    <h3><span class="dot" style="color:${dot}"></span>${esc(o.nm)}</h3>
    <div class="row"><button class="linkbtn" id="zoomto">이 천체로 확대해서 보기</button></div>
    <div class="eyebrow" style="color:var(--muted)">관측 장비 · 눌러서 측정 (⚡ = 쓰는 에너지)</div>
    <div class="tools">${list}</div>
    <div class="readouts">${o.kind === 'star' ? starReadouts(o, ob) : textReadouts(o, ob)}</div>
    ${S.msg ? `<div class="msg ${S.msg.bad ? 'bad' : ''}" role="status">${esc(S.msg.t)}</div>` : ''}
    <button class="accuse" id="accuse" data-label="이 천체가 맞다! ${esc(o.nm)} 지목하기" ${Date.now() < (S.lockUntil || 0) ? 'disabled' : ''}>${Date.now() < (S.lockUntil || 0) ? '망원경 재정렬 중…' : `이 천체가 맞다! ${esc(o.nm)} 지목하기`}</button>${hint}`;
  p.querySelectorAll('.tool').forEach(b => b.onclick = () => measure(b.dataset.t));
  $('accuse').onclick = accuse; $('zoomto').onclick = () => Sky.focus(o.id);
}

const TOOL_IC = { mag:'🔆', spec:'🌈', plx:'📸', abs:'🎯', shape:'🔭', count:'🔢', color:'🎨', loc:'🗺', photo:'📷', nspec:'🌈', back:'🌌', gshape:'🔭', struct:'🧩', dist:'📏' };
function textReadouts(o, ob) {
  const sec = SEC(); let h = '';
  sec.tools.forEach(tid => { const t = TOOLS[tid], key = t.key || tid; if (ob[key]) h += `<div class="ro"><div class="k"><span class="ric">${TOOL_IC[tid] || ''}</span>${t.name} · ${t.what}</div><div class="vt">${esc(o.info[key])}</div></div>`; });
  return h || '<p class="empty">↑ 위의 관측 장비 버튼을 눌러 이 천체를 측정해 보세요. <b style="color:var(--amber)">추천</b> 표시가 있는 장비부터 써 보면 좋아요.</p>';
}
// 측정 결과: 계기판처럼 크게 (SVG 1단위 ≈ 1px, 글자 13~16px)
function starReadouts(s, o) {
  let h = ''; const col = COLORS[s.c], T = 'font-family="IBM Plex Sans KR, Malgun Gothic, sans-serif"';
  if (o.mag) {
    const X = v => 24 + (v + 2) / 10 * 332, x = X(s.m);
    h += `<div class="ro big"><div class="k"><span class="ric">🔆</span>광도계 · 겉보기 등급 (지구에서 보이는 밝기)</div>
      <div class="v">${fmt(s.m)}<small>등급</small></div>
      <svg viewBox="0 0 380 92" role="img" aria-label="겉보기 등급 ${fmt(s.m)}">
        <defs><linearGradient id="mg" x1="0" x2="1"><stop offset="0" stop-color="#fff6d8"/><stop offset=".55" stop-color="#7c86a8"/><stop offset="1" stop-color="#1b2645"/></linearGradient></defs>
        <rect x="24" y="30" width="332" height="16" rx="8" fill="url(#mg)"/>
        ${[-2,0,2,4,6,8].map(v => `<line x1="${X(v)}" y1="46" x2="${X(v)}" y2="54" stroke="#8d9bbb"/><text x="${X(v)}" y="70" font-size="14" fill="#c9d2e6" text-anchor="middle" ${T}>${v < 0 ? '−' + (-v) : v}</text>`).join('')}
        <text x="24" y="88" font-size="13" fill="#f3c35a" ${T}>← 밝게 보임</text><text x="356" y="88" font-size="13" fill="#8d9bbb" text-anchor="end" ${T}>어둡게 보임 →</text>
        <path d="M${x - 9} 8 h18 l-9 14 z" fill="#f3c35a"/><line x1="${x}" y1="20" x2="${x}" y2="50" stroke="#f3c35a" stroke-width="3"/>
      </svg></div>`;
  }
  if (o.spec) {
    const cls = [['청색', 30000], ['청백색', 15000], ['백색', 9500], ['황백색', 6800], ['황색', 5800], ['주황색', 4500], ['적색', 3000]];
    const idx = cls.findIndex(c => c[0] === s.c), CX = i => 30 + i * 53;
    h += `<div class="ro big"><div class="k"><span class="ric">🌈</span>분광기 · 색과 표면 온도</div>
      <div class="v" style="color:${col}"><span class="swatch" style="background:${col};box-shadow:0 0 18px ${col}"></span>${s.c}<small>약 ${s.T.toLocaleString()} K</small></div>
      <svg viewBox="0 0 380 96" role="img" aria-label="${s.c}, 표면 온도 약 ${s.T} K">
        <text x="8" y="16" font-size="13" fill="#ff9a8a" ${T}>뜨거움</text><text x="372" y="16" font-size="13" fill="#8fb4ff" text-anchor="end" ${T}>차가움</text>
        <line x1="30" y1="42" x2="348" y2="42" stroke="#26375c" stroke-width="2"/>
        ${cls.map((c, i) => `<circle cx="${CX(i)}" cy="42" r="${i === idx ? 15 : 10}" fill="${COLORS[c[0]]}" ${i === idx ? `stroke="#fff" stroke-width="3"` : 'opacity=".85"'}/>
          <text x="${CX(i)}" y="76" font-size="${i === idx ? 14 : 12}" fill="${i === idx ? '#fff' : '#8d9bbb'}" font-weight="${i === idx ? 700 : 400}" text-anchor="middle" ${T}>${c[0]}</text>`).join('')}
        <text x="8" y="16" font-size="0">.</text>
      </svg>
      <div class="note">왼쪽(파란색)으로 갈수록 표면 온도가 높아요. 하얀 테두리가 이 별이에요.</div></div>`;
  }
  if (o.plx) {
    const amp = Math.min(95, 28 + s.sh * 70);
    h += `<div class="ro big"><div class="k"><span class="ric">📸</span>시차 관측 · 1월과 7월 사진 겹쳐 보기</div>
      <div class="v">${fmtSh(s.sh)}<small>움직임 → 연주시차는 ${fmtSh(s.sh / 2)}</small></div>
      <svg viewBox="0 0 380 120" role="img" aria-label="1월과 7월 사이 ${fmtSh(s.sh)} 움직임">
        <rect width="380" height="120" rx="8" fill="#050a17"/>
        <g fill="#9fb0d6"><circle cx="40" cy="24" r="2"/><circle cx="330" cy="96" r="2"/><circle cx="280" cy="20" r="1.6"/><circle cx="90" cy="98" r="1.6"/><circle cx="352" cy="40" r="1.4"/></g>
        <circle cx="${190 - amp}" cy="58" r="9" fill="${col}" opacity=".4"/><text x="${190 - amp}" y="88" font-size="14" fill="#79d3e8" text-anchor="middle" ${T}>1월</text>
        <circle cx="${190 + amp}" cy="58" r="9" fill="${col}"><animate attributeName="cx" values="${190 - amp};${190 + amp};${190 - amp}" dur="2.4s" repeatCount="indefinite"/></circle>
        <text x="${190 + amp}" y="88" font-size="14" fill="#ff7aa8" text-anchor="middle" ${T}>7월</text>
        <path d="M${190 - amp + 12} 40 H${190 + amp - 12}" stroke="#f3c35a" stroke-width="2" marker-end="url(#ar)" marker-start="url(#ar2)"/>
        <defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#f3c35a"/></marker><marker id="ar2" markerWidth="8" markerHeight="8" refX="2" refY="4" orient="auto"><path d="M8 0 L0 4 L8 8 z" fill="#f3c35a"/></marker></defs>
        <text x="190" y="32" font-size="14" fill="#f3c35a" text-anchor="middle" font-weight="700" ${T}>${fmtSh(s.sh)}</text>
      </svg>
      <div class="note">많이 움직일수록 가까운 별이에요. 거리(pc) = 1 ÷ 연주시차(″)</div></div>`;
  }
  if (o.abs) {
    const rr = m => Math.max(4, (7.6 - m) * 2.4 + 3), dir = s.M < s.m ? 'far' : s.M > s.m ? 'near' : 'same';
    h += `<div class="ro big"><div class="k"><span class="ric">🎯</span>10pc 시뮬레이터 · 모든 별을 10 pc에 놓고 비교</div>
      <div class="v">${fmt(s.M)}<small>절대 등급 (실제 밝기)</small></div>
      <svg viewBox="0 0 380 120" role="img" aria-label="겉보기 ${fmt(s.m)}등급에서 절대 ${fmt(s.M)}등급">
        <rect width="380" height="120" rx="8" fill="#050a17"/>
        <circle cx="80" cy="52" r="${rr(s.m) * 2.6}" fill="${col}" opacity=".18"/><circle cx="80" cy="52" r="${rr(s.m)}" fill="${col}"/>
        <text x="80" y="102" font-size="14" fill="#c9d2e6" text-anchor="middle" ${T}>지금 보이는 밝기</text><text x="80" y="117" font-size="13" fill="#8d9bbb" text-anchor="middle" ${T}>${fmt(s.m)}등급</text>
        <path d="M150 52 H226" stroke="#79d3e8" stroke-width="2.5" stroke-dasharray="6 5"/><path d="M226 45 l12 7 l-12 7 z" fill="#79d3e8"/>
        <circle cx="300" cy="52" r="${rr(s.M) * 2.6}" fill="${col}" opacity=".22"/><circle cx="300" cy="52" r="${rr(s.M)}" fill="${col}"/>
        <text x="300" y="102" font-size="14" fill="#fff" text-anchor="middle" font-weight="700" ${T}>10 pc에 놓으면</text><text x="300" y="117" font-size="13" fill="#f3c35a" text-anchor="middle" ${T}>${fmt(s.M)}등급</text>
      </svg>
      <div class="note big">${dir === 'far' ? '10 pc로 가져오니 <b>더 밝아져요</b> → 이 별은 10 pc보다 <b>멀리</b> 있어요.' : dir === 'near' ? '10 pc로 보내니 <b>더 어두워져요</b> → 이 별은 10 pc보다 <b>가까이</b> 있어요.' : '밝기가 <b>그대로</b>예요 → 이 별은 이미 <b>10 pc</b>에 있어요.'}</div></div>`;
  }
  if (o.mag && o.abs) {
    const X = v => 70 + (Math.max(-6, Math.min(8, v)) + 6) / 14 * 280, bar = (y, v, c, lb) => `<text x="8" y="${y + 13}" font-size="13" fill="#c9d2e6" ${T}>${lb}</text><rect x="70" y="${y}" width="${Math.max(4, 350 - X(v))}" height="18" rx="4" fill="${c}" transform="translate(${X(v) - 70} 0)"/><text x="${X(v) - 6}" y="${y + 14}" font-size="13" fill="#fff" text-anchor="end" font-weight="700" ${T}>${fmt(v)}</text>`;
    h += `<div class="ro big"><div class="k"><span class="ric">⚖️</span>두 등급 나란히 비교 (막대가 길수록 밝아요)</div>
      <svg viewBox="0 0 380 84" role="img" aria-label="겉보기 ${fmt(s.m)}등급, 절대 ${fmt(s.M)}등급">
        ${bar(10, s.m, '#7c86a8', '겉보기')}${bar(44, s.M, '#f3c35a', '절대')}
      </svg>
      <div class="note big">${s.M < s.m ? '절대 등급 숫자가 더 작아요 → <b>진짜로는 보이는 것보다 더 밝은 별</b>, 멀리 있어서 어둡게 보였던 거예요.' : s.M > s.m ? '절대 등급 숫자가 더 커요 → 가까이 있어서 <b>실제보다 밝게 보이는 별</b>이에요.' : '두 등급이 같아요 → 딱 10 pc에 있는 별이에요.'}</div></div>`;
  }
  return h || '<p class="empty">↑ 위의 관측 장비 버튼을 눌러 이 천체를 측정해 보세요. <b style="color:var(--amber)">추천</b> 표시가 있는 장비부터 써 보면 좋아요.</p>';
}

function cellFor(o, key) {
  const ob = S.obs[o.id] || {}; if (!ob[key]) return '<span class="q">?</span>';
  if (o.kind !== 'star') return esc(o.info[key]);
  if (key === 'mag') return fmt(o.m);
  if (key === 'spec') return `<span style="color:${COLORS[o.c]}">●</span> ${o.c} · ${o.T.toLocaleString()} K`;
  if (key === 'plx') return fmtSh(o.sh);
  if (key === 'abs') return fmt(o.M);
}
function renderBook() {
  const sec = SEC(), mm = M();
  if (mm.collect && !S.finished) {
    const list = S.col[S.mi] || [];
    $('booksec').textContent = '· 수집한 별';
    $('thead').innerHTML = '<tr><th>번호</th><th>색</th><th>표면 온도</th></tr>';
    $('tbody').innerHTML = list.length ? list.map((id, i) => { const o = objOf(id); return `<tr><td>${i + 1}</td><td><span style="color:${COLORS[o.c]}">●</span> ${o.c}</td><td class="num">약 ${o.T.toLocaleString()} K</td></tr>`; }).join('')
      : '<tr><td colspan="3" class="muted" style="font-weight:400">아직 모은 별이 없어요. 모은 별의 색과 온도가 여기에 쌓여요.</td></tr>';
    return;
  }
  $('booksec').textContent = '· ' + sec.nm;
  $('thead').innerHTML = `<tr><th>${sec.id === 0 ? '별' : '천체'}</th>${sec.cols.map(c => `<th>${c[1]}</th>`).join('')}</tr>`;
  const rows = sec.objs.filter(o => S.obs[o.id]);
  $('tbody').innerHTML = rows.length ? rows.map(o => `<tr class="pick ${S.sel === o.id ? 'cur' : ''}" data-id="${o.id}"><td>${esc(o.nm)}</td>${sec.cols.map(c => `<td class="${sec.id === 0 ? 'num' : ''}">${cellFor(o, c[0])}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${sec.cols.length + 1}" class="muted" style="font-weight:400">아직 관측한 천체가 없어요. 측정한 값이 여기에 쌓여요.</td></tr>`;
  $('tbody').querySelectorAll('tr.pick').forEach(tr => tr.onclick = () => { pick(tr.dataset.id); Sky.focus(tr.dataset.id); });
}

// ---------- overlays ----------
const ov = $('ov'), card = $('card');
const avatar = '<div class="av"><svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11" fill="none" stroke="#79d3e8" stroke-width="1.5"/><path d="M14 3v6M14 19v6M3 14h6M19 14h6" stroke="#79d3e8" stroke-width="1.5"/><circle cx="14" cy="14" r="2.5" fill="#f3c35a"/></svg></div>';
function open(html, wide) { card.className = 'card' + (wide ? ' wide' : ''); card.innerHTML = html; ov.hidden = false; const f = card.querySelector('input, button'); if (f) f.focus(); }
function close() { ov.hidden = true; }

function showJoin() {
  const qs = new URLSearchParams(location.search), preset = (qs.get('code') || '').replace(/\D/g, '').slice(0, 4);
  open(`<div class="eyebrow">3학년 과학 · 별과 우주</div><div class="logo big"><span class="l1">SONGRYE</span><span class="l2">STARLIGHT BATTLE</span></div>
    <p>어느 밤, 우주 관측소의 지도에서 별과 성단, 성운, 은하가 하나둘 사라졌다. 별빛탐정단은 태양 이웃에서 출발해 점점 먼 우주로 나아가며 사라진 천체를 찾아야 한다. 이벤트 별을 낚아채고, 친구 탐사선과 배틀하며 탐사 점수 1위에 도전하라!</p>
    <div class="joinrow">
      <div class="field fcode"><label for="jcode">방 코드 (4자리)</label><input class="code" id="jcode" inputmode="numeric" maxlength="4" autocomplete="off" value="${preset}"></div>
      <div class="field fnick"><label for="jnick">내 이름 · 우주선 위에 표시돼요</label><input id="jnick" maxlength="12" autocomplete="off" placeholder="예: 3반 이정연"></div>
    </div>
    <div class="field"><label id="tlbl">우리 팀 우주선 고르기 · 같은 팀끼리는 공격할 수 없고, 점수가 합쳐져요 <button type="button" class="linkbtn" id="autot">🎲 자동 배정</button></label>
      <div class="teams" id="teams" role="radiogroup" aria-labelledby="tlbl"></div>
      <div class="palette" id="palette" hidden><div class="pl">새 팀 색 고르기</div><div class="pcols" id="pcols"></div></div></div>
    <div class="err" id="jerr" role="alert"></div>
    <div class="row"><button class="go" id="jgo">탐사선 탑승</button><button class="ghost" id="jsolo">혼자 탐사하기</button></div>
    <p class="muted" style="font-size:13px">선생님이신가요? <a href="board.html" style="color:var(--cyan)">선생님 현황판 (비밀번호 필요)</a></p>`);
  if (preset) $('jnick').focus();
  let team = -1, counts = {};
  const shown = new Set(Array.from({ length: BASE_TEAMS }, (_, i) => i));
  // 팀 쏠림 막기: 반에 6명 이상 들어오면, 가장 적은 팀보다 2명 이상 많은 팀은 잠깐 잠금
  const total = () => Object.values(counts).reduce((a, b) => a + b, 0);
  const minCount = () => Math.min(...[...shown].map(i => counts[i] || 0));
  const isFull = i => total() >= 6 && (counts[i] || 0) >= minCount() + 2;
  const drawTeams = () => {
    const ids = [...shown].sort((x, y) => x - y), more = TEAMS.length - shown.size;
    $('teams').innerHTML = ids.map(i => { const n = counts[i] || 0, full = isFull(i) && i !== team;
      return `<button type="button" class="teamb ${full ? 'full' : ''}" role="radio" aria-checked="${i === team}" aria-label="${teamName(i)} ${n}명${full ? ', 인원이 많아 잠김' : ''}" data-t="${i}" style="--tc:${TEAMS[i].col}" ${full ? 'disabled' : ''}>${shipIcon(TEAMS[i].col, 40)}<b>${TEAMS[i].nm}</b><span class="tcnt">${full ? '인원 많음' : n + '명'}</span></button>`; }).join('')
      + (more ? `<button type="button" class="teamb addt" id="addt" aria-expanded="${!$('palette').hidden}"><span class="plus">＋</span><b>팀 추가</b></button>` : '');
    $('teams').querySelectorAll('.teamb[data-t]').forEach(b => b.onclick = () => pickTeam(+b.dataset.t));
    if (more) $('addt').onclick = () => { const p = $('palette'); p.hidden = !p.hidden; drawPalette(); drawTeams(); if (!p.hidden) p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  };
  const drawPalette = () => {
    $('pcols').innerHTML = TEAMS.map((t, i) => shown.has(i) ? '' : `<button type="button" class="pcol" data-t="${i}" style="--tc:${t.col}" aria-label="${teamName(i)} 추가">${shipIcon(t.col, 30)}<span>${t.nm}</span></button>`).join('');
    $('pcols').querySelectorAll('.pcol').forEach(b => b.onclick = () => { shown.add(+b.dataset.t); $('palette').hidden = true; pickTeam(+b.dataset.t); });
  };
  const pickTeam = i => { team = i; $('jerr').textContent = ''; drawTeams(); SQAudio.sfx('pick'); };
  drawTeams();
  $('autot').onclick = () => { const ids = [...shown].filter(i => !isFull(i)), lo = Math.min(...ids.map(i => counts[i] || 0)), cand = ids.filter(i => (counts[i] || 0) === lo); pickTeam(cand[Math.floor(Math.random() * cand.length)]); toast(`${teamName(team)}으로 정했어요!`); };
  // 방 코드를 다 쓰면, 친구들이 이미 추가해 둔 팀도 자동으로 보여 줌
  // 방 코드를 다 쓰면 팀별 인원을 보여 주고(5초마다 새로 고침), 친구들이 이미 추가해 둔 팀도 자동으로 보여 줌
  const peekRoom = async () => {
    if (!$('teams')) { clearInterval(peekT); return; }
    const c = $('jcode').value.replace(/\D/g, ''); if (c.length !== 4) { counts = {}; drawTeams(); return; }
    counts = await SQNet.roomTeams(c); if (!$('teams')) return;
    Object.keys(counts).map(Number).forEach(i => { if (i >= 0 && i < TEAMS.length) shown.add(i); });
    drawTeams(); if (!$('palette').hidden) drawPalette();
  };
  const peekT = setInterval(peekRoom, 5000);
  $('jcode').addEventListener('input', () => { const c = $('jcode').value.replace(/\D/g, ''); if (c.length === 4 || c.length === 3) peekRoom(); }); peekRoom();
  const go = async () => {
    const code = $('jcode').value.replace(/\D/g, ''), nick = $('jnick').value.trim();
    if (code.length !== 4) { $('jerr').textContent = '4자리 방 코드를 입력해 주세요.'; return; }
    if (!nick) { $('jerr').textContent = '닉네임을 입력해 주세요.'; return; }
    if (team < 0) { $('jerr').textContent = '팀을 골라 주세요. 고르기 어려우면 🎲 자동 배정!'; return; }
    $('jgo').disabled = true; $('jerr').textContent = '';
    try { const r = await SQNet.join(code, nick, team); if (!r || !r.id || !r.token) throw new Error('join'); const got = typeof r.team === 'number' ? r.team : team; S.net = { id:r.id, token:r.token, nickname:r.nickname, code, team: got };
      if (r.resumed) { clearInterval(peekT); resumeFrom(r); return; }
      clearInterval(peekT); startGame(); if (got !== team) toast(`서버가 아직 ${teamName(team)}을 지원하지 않아 ${teamName(got)}으로 탑승했어요. 선생님께 알려 주세요.`, 'bad'); }
    catch (e) { $('jerr').textContent = SQNet.errText(e); $('jgo').disabled = false; }
  };
  $('jgo').onclick = go; $('jnick').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('jsolo').onclick = () => { clearInterval(peekT); S.net = null; startGame(); };
}
// 같은 방에 같은 이름으로 다시 들어오면 서버 기록에서 이어 하기 (학생 피드백: 다시 들어오면 기록이 두 개 생김)
function resumeFrom(r) {
  const net = S.net, done = Math.max(0, Math.min(r.mission || 0, MISSIONS.length));
  S = fresh(); S.net = net; S.started = true; S.tut = 'done'; S.tut2 = 'done';
  Object.assign(S, { done, stars: r.stars || 0, clusters: r.clusters || 0, nebulae: r.nebulae || 0, galaxies: r.galaxies || 0, hits: r.hits || 0, bonus: r.bonus || 0 });
  S.res = Array.from({ length: done }, () => 0);
  S.memDone = MEMS.filter(x => x.after < done).map(x => x.after); S.warpDone = WARPS.filter(w => w.after < done).map(w => w.after);
  connectCrew();
  if (r.finished || done >= MISSIONS.length) { S.mi = MISSIONS.length - 1; S.finished = true; S.phase = 'end'; save(); render(); showEnd(); toast(`${r.nickname} 탐정의 기록을 찾았어요! 이미 원정을 완료했어요.`); return; }
  S.mi = done; S.en = M().energy; S.phase = 'intro'; save(); SQNet.aim(S.net, M().sector, null); render(); showIntro();
  toast(`${r.nickname} 탐정의 기록을 찾았어요! 미션 ${M().code}부터 이어서 탐사해요.`);
}
function startGame() { S.started = true; S.phase = 'intro'; save(); connectCrew(); SQNet.aim(S.net, M().sector, null); render(); showIntro(); }

const PARALLAX_SVG = `<svg viewBox="0 0 520 190" role="img" aria-label="1월과 7월에 지구 위치가 달라 가까운 별이 배경별에 대해 움직여 보이는 원리" style="width:100%;height:auto;background:#050a17;border:1px solid var(--line);border-radius:8px">
  <g fill="#9fb0d6"><circle cx="40" cy="22" r="1.6"/><circle cx="130" cy="16" r="1.4"/><circle cx="300" cy="24" r="1.6"/><circle cx="420" cy="14" r="1.4"/><circle cx="490" cy="30" r="1.5"/></g>
  <text x="260" y="14" fill="#8d9bbb" font-size="11" text-anchor="middle">아주 먼 배경별 (거의 안 움직임)</text>
  <line x1="160" y1="150" x2="245" y2="62" stroke="#79d3e8" stroke-dasharray="4 4"/><line x1="360" y1="150" x2="245" y2="62" stroke="#ff7aa8" stroke-dasharray="4 4"/>
  <line x1="245" y1="62" x2="315" y2="28" stroke="#79d3e8" stroke-opacity=".5"/><line x1="245" y1="62" x2="190" y2="28" stroke="#ff7aa8" stroke-opacity=".5"/>
  <circle cx="245" cy="62" r="6" fill="#ffb062"/><text x="258" y="66" fill="#ffb062" font-size="12">가까운 별</text>
  <circle cx="315" cy="30" r="4" fill="#ffb062" opacity=".55"/><text x="322" y="44" fill="#79d3e8" font-size="11">1월에 보인 위치</text>
  <circle cx="190" cy="30" r="4" fill="#ffb062" opacity=".55"/><text x="120" y="44" fill="#ff7aa8" font-size="11">7월에 보인 위치</text>
  <ellipse cx="260" cy="155" rx="100" ry="18" fill="none" stroke="#26375c"/><circle cx="260" cy="155" r="9" fill="#f3c35a"/><text x="260" y="182" fill="#8d9bbb" font-size="11" text-anchor="middle">태양</text>
  <circle cx="160" cy="150" r="6" fill="#4d8bff"/><text x="160" y="176" fill="#79d3e8" font-size="11" text-anchor="middle">1월 지구</text>
  <circle cx="360" cy="150" r="6" fill="#4d8bff"/><text x="360" y="176" fill="#ff7aa8" font-size="11" text-anchor="middle">7월 지구</text>
</svg>`;
// 학생 피드백 "절대 등급과 겉보기 등급 비교가 어렵다" → 같은 전구를 가까이·멀리 둔 그림 + 핵심 정리
const MAG_CARD = `<div class="magcard"><div class="eyebrow" style="color:var(--amber)">잠깐! 개념 정리 · 겉보기 등급 vs 절대 등급</div>
  <svg viewBox="0 0 520 150" role="img" aria-label="같은 전구라도 가까이 있으면 밝게, 멀리 있으면 어둡게 보인다" style="width:100%;height:auto">
    <defs><radialGradient id="glw"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#f3c35a" stop-opacity=".55"/><stop offset="1" stop-color="#f3c35a" stop-opacity="0"/></radialGradient></defs>
    <rect width="520" height="150" rx="10" fill="#050a17"/>
    <circle cx="40" cy="70" r="13" fill="#4d8bff"/><text x="40" y="104" font-size="12" fill="#8d9bbb" text-anchor="middle">나(지구)</text>
    <circle cx="140" cy="70" r="46" fill="url(#glw)"/><circle cx="140" cy="70" r="11" fill="#fff8e0"/><text x="140" y="134" font-size="13" fill="#f3c35a" text-anchor="middle">가까운 전구 → 밝게 보임</text>
    <line x1="58" y1="70" x2="120" y2="70" stroke="#26375c" stroke-dasharray="4 4"/><line x1="160" y1="70" x2="430" y2="70" stroke="#26375c" stroke-dasharray="4 4"/>
    <circle cx="450" cy="70" r="16" fill="url(#glw)"/><circle cx="450" cy="70" r="4" fill="#fff8e0"/><text x="450" y="134" font-size="13" fill="#8d9bbb" text-anchor="middle">멀리 있는 같은 전구 → 어둡게 보임</text>
    <text x="300" y="30" font-size="13" fill="#c9d2e6" text-anchor="middle">전구의 진짜 밝기는 같아요!</text>
  </svg>
  <div class="magdef"><div><b>겉보기 등급</b><span>지구에서 <u>보이는</u> 밝기 · 거리에 따라 달라져요</span></div><div><b>절대 등급</b><span>모든 별을 <u>10 pc</u>에 놓았을 때 밝기 · 별의 <u>진짜</u> 밝기</span></div><div><b>숫자가 작을수록</b><span>더 밝아요! −1등급 &gt; 0등급 &gt; 1등급 &gt; 2등급 …</span></div></div></div>`;
function showIntro() {
  SQAudio.setMode(0);
  const m = M(), sec = SEC(), first = MISSIONS.findIndex(x => x.sector === m.sector) === S.mi;
  open(`<div class="eyebrow">${first ? `SECTOR ${m.sector + 1} · ${sec.en}` : `MISSION ${m.code} / ${MISSIONS.length}`}</div>
    <h2>${first ? esc(sec.nm) + ' 도착' : esc(m.title)}</h2>
    ${first ? `<p class="muted">${esc(sec.story)}</p><div class="eyebrow" style="color:var(--amber)">MISSION ${m.code} · ${esc(m.title)}</div>` : ''}
    <div class="chief">${avatar}<div><div class="who">관측소장</div><p>${esc(m.intro)}</p></div></div>
    ${m.diagram === 'parallax' ? PARALLAX_SVG : ''}${m.title === '눈속임의 범인' ? MAG_CARD : ''}
    <p class="target">찾아야 할 천체: <b>${esc(m.goal)}</b><br><span style="font-size:13px;color:var(--muted)">관측 에너지 ${m.energy}${m.collect ? ' · 틀리면 3초 동안 망원경이 흔들려요 (별점에도 반영)' : ' · 장비: ' + toolsFor().map(t => TOOLS[t].name).join(', ')}${m.reward ? ` · 성공하면 ${m.reward} 획득` : ''}</span></p>
    <button class="go" id="start">관측 시작</button>`);
  $('start').onclick = () => { SQAudio.setMode(1); S.phase = 'play'; save(); close(); render(); banner(`MISSION ${m.code}`, m.title); SQAudio.sfx('warp'); const hd = $('hud'); hd.classList.remove('pop'); void hd.offsetWidth; hd.classList.add('pop'); $('sky').focus({ preventScroll: true }); maybeTut(); };
}

function showQuiz() {
  SQAudio.setMode(0);
  const m = M(), o = m.target ? objOf(m.target) : null;
  S.qLvl = S.qLvl || {}; S.qAns = S.qAns || {};
  // 1) 천체를 찾은 순간 별·보상을 확정 (새로고침해도 두 번 받지 않음)
  if (S.res[S.mi] == null) {
    const got = Math.max(1, 3 - (m.collect ? Math.floor(S.wrong / 2) : S.wrong));
    S.res[S.mi] = got; S.stars += got; S.done = S.mi + 1;
    if (boostOn()) addPoints(got * 100, null);
    S.perfect = S.perfect || {}; if (S.wrong === 0) S.perfect[S.mi] = addPoints(100, null);
    if (m.reward) S[REWARD_KEY[m.reward]]++;
    if (S.mi === MISSIONS.length - 1) S.finished = true;
    save(); render(); bump('m-pts', 'bump'); if (m.reward) bump('m-' + REWARD_KEY[m.reward], 'bump'); SQAudio.sfx('ok'); flash('rgba(243,195,90,.55)');
    sync('solve', `MISSION ${m.code} 해결 ★${got}${m.reward ? ` · ${m.reward} '${o.nm}' 획득` : ''}`);
  }
  const got = S.res[S.mi], perfect = (S.perfect || {})[S.mi] || 0;
  const head = `<div class="eyebrow">MISSION ${m.code} · ${o ? '발견!' : '수집 완료!'}</div><h2>${o ? esc(o.nm) + '을(를) 찾았다!' : esc(m.title) + ' 성공!'}</h2><p>${esc(m.ok)}</p>
    <div class="row"><span class="stars3">${'★'.repeat(got)}<span class="off">${'★'.repeat(3 - got)}</span></span>
    <span class="chip" style="font-size:13px;color:var(--amber)">+${(got * 100 + (m.reward ? REWARD_P[m.reward] : 0)).toLocaleString()}P</span>
    ${m.reward ? `<span class="chip" style="font-size:13px">+ ${m.reward} 1</span>` : ''}${perfect ? `<span class="chip" style="font-size:13px;color:var(--good)">PERFECT +${perfect}P</span>` : ''}</div>`;
  const ans = S.qAns[S.mi], lvl = S.qLvl[S.mi];
  if (ans) return quizResult(head, m, ans);
  if (!lvl) {
    open(`${head}<div class="explain"><b>보너스 증명 질문</b> · 난이도를 고르세요. <b style="color:var(--bad)">기회는 한 번뿐!</b></div>
      <div class="lvls">${['하', '중', '상'].map(L => `<button class="lvl l${L}" data-l="${L}"><b>${L}</b><span>+${QPTS[L]}P</span><em>${L === '하' ? '기본 개념' : L === '중' ? '이유 설명' : '계산·비교'}</em></button>`).join('')}</div>`);
    card.querySelectorAll('.lvl').forEach(b => b.onclick = () => { S.qLvl[S.mi] = b.dataset.l; save(); SQAudio.sfx('pick'); showQuiz(); });
    return;
  }
  const z = m.q3[lvl], order = shuffled(z.opts.map((_, i) => i), S.mi * 7 + lvl.charCodeAt(0));
  open(`${head}<div class="explain"><b>증명 질문 · ${lvl}</b> (+${QPTS[lvl]}P · 기회 한 번)<br>${esc(z.q)}</div>
    <div class="opts">${order.map(i => `<button class="opt" data-i="${i}">${esc(z.opts[i])}</button>`).join('')}</div>`);
  card.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const ok = +b.dataset.i === z.a, pts = ok ? addPoints(QPTS[lvl], null) : 0;
    S.qAns[S.mi] = { lvl, ok, pick: +b.dataset.i, pts }; S.phase = 'solved'; save(); render();
    SQAudio.sfx(ok ? 'ok' : 'wrong'); if (ok) bump('m-pts', 'bump');
    if (ok && lvl === '상') sync('quiz', `🎯 MISSION ${m.code} 상 난이도 정답! +${pts}P`);
    else sync();
    quizResult(head, m, S.qAns[S.mi]);
  });
}
function shuffled(a, seed) { const r = rngOf(seed + 11); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// 학생 피드백 "틀리면 다시 기회를" → 해설을 본 뒤 같은 미션의 다른 난이도 문제로 한 번 재도전 (점수 절반)
const RETRY_LVL = { '상': '중', '중': '하', '하': '중' };
function quizBlock(z, lvl, a, tag) {
  return `<div class="explain"><b>${tag} · ${lvl}</b><br>${esc(z.q)}</div>
    <div class="opts">${z.opts.map((t, i) => `<button class="opt ${i === z.a ? 'right' : i === a.pick ? 'wrong' : ''}" disabled>${esc(t)}</button>`).join('')}</div>
    <div class="msg ${a.ok ? '' : 'bad'}" style="${a.ok ? 'color:var(--good)' : ''}">${a.ok ? `정답! +${a.pts}P` : '아쉽게 틀렸어요.'}</div>
    <div class="explain">${esc(z.ex)}</div>`;
}
function retryQuiz(head, m, ans) {
  const lvl = RETRY_LVL[ans.lvl], z = m.q3[lvl], half = Math.round(QPTS[lvl] / 2), order = shuffled(z.opts.map((_, i) => i), S.mi * 13 + lvl.charCodeAt(0));
  open(`${head}<div class="explain"><b>🔁 재도전 · ${lvl}</b> (+${half}P · 점수 절반 · 마지막 기회)<br>${esc(z.q)}</div>
    <div class="opts">${order.map(i => `<button class="opt" data-i="${i}">${esc(z.opts[i])}</button>`).join('')}</div>`);
  card.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    const ok = +b.dataset.i === z.a, pts = ok ? addPoints(half, null) : 0;
    ans.retry = { lvl, ok, pick: +b.dataset.i, pts }; save(); render();
    SQAudio.sfx(ok ? 'ok' : 'wrong'); if (ok) bump('m-pts', 'bump'); sync();
    quizResult(head, m, ans);
  });
}
function quizResult(head, m, ans) {
  const z = m.q3[ans.lvl], R = ans.retry;
  open(`${head}${quizBlock(z, ans.lvl, ans, '증명 질문')}
    ${R ? quizBlock(m.q3[R.lvl], R.lvl, R, '🔁 재도전') : !ans.ok ? `<div class="explain">해설을 읽었나요? <b>다른 문제로 한 번 더</b> 도전할 수 있어요 (점수 절반).</div><button class="ghost" id="retry">🔁 재도전하기 (+${Math.round(QPTS[RETRY_LVL[ans.lvl]] / 2)}P)</button>` : ''}
    <button class="go" id="next">${S.finished ? '원정 보고서 보기' : MEMS.some(x => x.after === S.mi) ? '보안 잠금 해제하기' : WARPS.some(w => w.after === S.mi) ? '워프 준비!' : '다음 미션으로'}</button>`);
  $('next').onclick = next; $('next').focus();
  if ($('retry')) $('retry').onclick = () => retryQuiz(head, m, ans);
}

function next() {
  if (S.finished) { S.phase = 'end'; save(); showEnd(); return; }
  const mg = MEMS.find(x => x.after === S.mi);
  if (mg && !S.memDone.includes(S.mi)) { S.phase = 'memory'; save(); showMemory(mg); return; }
  const w = WARPS.find(w => w.after === S.mi);
  if (w && !S.warpDone.includes(S.mi)) { S.phase = 'warp'; save(); showWarp(w); return; }
  advance();
}
function advance() {
  endTut(false);
  const prev = M().sector;
  S.mi++; S.en = M().energy; S.wrong = 0; S.sel = null; S.msg = null; S.phase = 'intro'; save(); SQNet.aim(S.net, M().sector, null); render();
  if (M().sector !== prev) { banner(`SECTOR ${M().sector + 1} · ${SEC().en}`, SEC().nm + ' 진입'); SQAudio.sfx('warp'); setTimeout(showIntro, 1700); }
  else showIntro();
}

function showEnd() {
  SQAudio.setMode(2); flash('rgba(243,195,90,.5)');
  const P = myPoints(), tr = tierOf(P), list = sortCrew(crewPlayers), rank = S.net ? list.findIndex(p => p.id === S.net.id) + 1 : 0;
  open(`<div class="eyebrow">EXPEDITION COMPLETE</div><h2>우주 원정 완료!</h2>
    <div class="endtier"><span class="tier big t${tr.i}">${tr.nm}</span><b>${P.toLocaleString()} P</b>${rank ? `<span class="muted">탐사단 ${list.length}명 중 ${rank}위</span>` : ''}</div>
    <div class="chief">${avatar}<div><div class="who">관측소장</div><p>태양 이웃의 별에서 시작해 성단, 성운, 그리고 외부 은하까지 다녀왔구나. 별의 밝기는 거리 때문에 속기 쉽고, 우주의 천체는 모양과 빛으로 정체를 드러내지. 훌륭한 탐정이야!</p></div></div>
    <div class="rep">
      <div><span>별 ${myTotal()}개 × 100 (공격·대결 ${myDelta() >= 0 ? '+' : ''}${myDelta()}, 소행성 −${S.hits})</span><b>${(myTotal() * 100).toLocaleString()}P</b></div>
      <div><span>성단 ${S.clusters} · 성운 ${S.nebulae} (×300) · 은하 ${S.galaxies} (×500)</span><b>${((S.clusters + S.nebulae) * 300 + S.galaxies * 500).toLocaleString()}P</b></div>
      <div><span>이벤트 별 · 보너스</span><b>${(S.bonus || 0).toLocaleString()}P</b></div>
    </div>
    <div class="row"><button class="go" id="stay">하늘 둘러보기</button><button class="ghost" id="again">처음부터 다시 탐사</button></div>`);
  $('stay').onclick = () => { close(); render(); }; $('again').onclick = restart;
}
function restart() { const net = S.net; S = fresh(); S.net = net; S.started = true; save(); sync('join', '처음부터 다시 출발했습니다'); render(); showIntro(); }

// ---------- 소행성대 워프 ----------
function showWarp(w) {
  SQAudio.setMode(2);
  open(`<div class="eyebrow">WARP · 소행성대 통과</div><h2>${esc(w.title)}</h2><p>${esc(w.text)}</p>
    <canvas class="warpcv" id="wcv" tabindex="0" aria-label="소행성 피하기. 위아래 화살표나 드래그로 조종"></canvas>
    <div class="warpbar"><span>남은 거리 <b id="wt">${w.secs}</b>초</span><span>충돌 <b id="wh">0</b>회</span><span>별 <b id="ws">${S.stars}</b></span></div>
    <p class="muted" style="font-size:13px">마우스·손가락으로 탐사선을 위아래로 끌거나, ↑↓ 키로 조종하세요.</p>
    <button class="go" id="wgo">워프 시작</button>`, true);
  const cv = $('wcv'), g = cv.getContext('2d');
  let W2 = 0, H2 = 0, dpr = Math.min(2, devicePixelRatio || 1);
  const fit = () => { const r = cv.getBoundingClientRect(); W2 = r.width; H2 = r.height; cv.width = W2 * dpr; cv.height = H2 * dpr; };
  fit();
  const ship = { y: 0.5, ty: 0.5 }, keys = {};
  let rocks = [], streaks = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: 0.3 + Math.random() })), t = 0, hits = 0, inv = 0, running = false, last = 0, spawn = 0, raf = 0, shake = 0;
  const setY = e => { const r = cv.getBoundingClientRect(); ship.ty = Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / r.height)); };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); setY(e); }; cv.onpointermove = e => { if (e.buttons || e.pointerType !== 'mouse') setY(e); else setY(e); };
  cv.onkeydown = e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { keys[e.key] = true; e.preventDefault(); } };
  cv.onkeyup = e => { keys[e.key] = false; };
  function rock() { const r = (0.035 + Math.random() * 0.05); const n = 9, v = Array.from({ length: n }, (_, i) => 0.75 + Math.random() * 0.35);
    return { x: 1.1, y: 0.05 + Math.random() * 0.9, r, vx: (0.32 + Math.random() * 0.25) * w.speed, vy: (Math.random() - 0.5) * 0.06, rot: 0, sp: (Math.random() - 0.5) * 3, v }; }
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = shake > 0 ? (Math.random() - 0.5) * 8 : 0;
    g.fillStyle = '#02040b'; g.fillRect(0, 0, W2, H2); g.save(); g.translate(sx, 0);
    streaks.forEach(s => { g.strokeStyle = `rgba(160,190,255,${0.25 + s.s * 0.4})`; g.lineWidth = s.s; g.beginPath(); g.moveTo(s.x * W2, s.y * H2); g.lineTo(s.x * W2 + 18 * s.s * w.speed, s.y * H2); g.stroke(); });
    rocks.forEach(k => { g.save(); g.translate(k.x * W2, k.y * H2); g.rotate(k.rot); const R = k.r * H2;
      g.beginPath(); k.v.forEach((m, i) => { const a = i / k.v.length * 6.283; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * R * m, Math.sin(a) * R * m); }); g.closePath();
      const gr = g.createRadialGradient(-R * .3, -R * .3, 1, 0, 0, R); gr.addColorStop(0, '#8b7d6b'); gr.addColorStop(1, '#3a332c'); g.fillStyle = gr; g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(R * .25, R * .1, R * .22, 0, 6.28); g.fill(); g.restore(); });
    const x = W2 * 0.14, y = ship.y * H2, s = H2 * 0.05;
    if (!(inv > 0 && Math.floor(inv * 10) % 2)) {
      g.fillStyle = 'rgba(121,211,232,.35)'; g.beginPath(); g.ellipse(x - s * 1.6, y, s * 1.2 + Math.random() * 4, s * 0.35, 0, 0, 6.28); g.fill();
      g.fillStyle = '#e3e9f6'; g.beginPath(); g.moveTo(x + s * 1.4, y); g.lineTo(x - s, y - s * 0.75); g.lineTo(x - s * 0.6, y); g.lineTo(x - s, y + s * 0.75); g.closePath(); g.fill();
      g.fillStyle = '#f3c35a'; g.beginPath(); g.arc(x + s * 0.2, y, s * 0.28, 0, 6.28); g.fill();
    }
    g.restore();
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (running) {
      t += dt; spawn -= dt; if (inv > 0) inv -= dt; if (shake > 0) shake -= dt;
      if (keys.ArrowUp) ship.ty = Math.max(0.05, ship.ty - dt * 1.1); if (keys.ArrowDown) ship.ty = Math.min(0.95, ship.ty + dt * 1.1);
      ship.y += (ship.ty - ship.y) * Math.min(1, dt * 9);
      if (spawn <= 0 && t < w.secs - 1.2) { rocks.push(rock()); spawn = Math.max(0.28, (0.95 - t / w.secs * 0.5) / w.speed); }
      const aspect = W2 / H2;
      rocks.forEach(k => { k.x -= k.vx * dt; k.y += k.vy * dt; k.rot += k.sp * dt;
        const dx = (k.x - 0.14) * aspect, dy = k.y - ship.y;
        if (!k.hit && inv <= 0 && Math.hypot(dx, dy) < k.r * 0.85 + 0.035) { k.hit = true; hits++; inv = 1.2; shake = 0.35; SQAudio.sfx('hit');
          S.hits++; if (S.stars > 0) S.stars--; save(); $('wh').textContent = hits; $('ws').textContent = S.stars; bump('m-pts', 'lose'); paintScore(); sync(); } });
      rocks = rocks.filter(k => k.x > -0.2);
      streaks.forEach(s => { s.x -= dt * s.s * 0.9 * w.speed; if (s.x < -0.05) { s.x = 1.05; s.y = Math.random(); } });
      $('wt').textContent = Math.max(0, Math.ceil(w.secs - t));
      if (t >= w.secs) { running = false; finish(); }
    }
    draw(); raf = requestAnimationFrame(loop);
  }
  function finish() {
    cancelAnimationFrame(raf);
    S.warpDone.push(S.mi); save();
    sync('warp', `${w.title} 통과 · 충돌 ${hits}회${hits ? ` (별 −${hits})` : ' · 무사 통과!'}`);
    const go = $('wgo'); go.disabled = false; go.textContent = `${SECTORS[w.to].nm}(으)로 진입`;
    go.insertAdjacentHTML('beforebegin', `<div class="explain">${hits ? `소행성과 ${hits}번 부딪혀 별을 ${hits}개까지 잃었어. 다음 구역에서 되찾자!` : '한 번도 부딪히지 않았어! 완벽한 조종이야.'}</div>`);
    go.onclick = () => { close(); advance(); };
  }
  $('wgo').onclick = () => { $('wgo').disabled = true; $('wgo').textContent = '워프 중…'; running = true; last = performance.now(); SQAudio.sfx('warp'); cv.focus(); };
  raf = requestAnimationFrame(loop);
}

// ---------- 탐사단 우주선 ----------
function renderShips() {
  const sec = M().sector, meId = S.net ? S.net.id : 'me';
  const others = crewPlayers.filter(p => p.id !== meId && p.sector === sec && !p.finished).map(p => ({ id: p.id, nick: p.nickname, aim: p.aim, col: tm(p.team || 0).rgb, shield: p.shield_until && new Date(p.shield_until) > new Date() }));
  Sky.setShips(others.concat([{ id: meId, nick: S.net ? S.net.nickname : '내 탐사선', me: true, aim: S.sel, col: S.net ? tm(S.net.team || 0).rgb : '243,195,90' }]));
  const far = {}; crewPlayers.forEach(p => { if (p.id !== meId && (p.sector !== sec || p.finished)) { const k = p.finished ? '원정 완료' : SECTORS[p.sector] ? SECTORS[p.sector].nm : '?'; far[k] = (far[k] || 0) + 1; } });
  const txt = Object.entries(far).map(([k, n]) => `${k} ${n}명`).join(' · ');
  const el = $('farcrew'); el.hidden = !txt; el.textContent = txt ? '다른 구역 탐사선: ' + txt : '';
}

// ---------- 탐사단 현황 ----------
let crewSub = null, crewPlayers = [], feedEv = [];
function connectCrew() {
  if (crewSub) { crewSub.stop(); crewSub = null; }
  chatReset();
  if (!S.net) { $('crew').innerHTML = '<p class="empty">혼자 탐사 중이에요. 방 코드로 참가하면 친구들의 탐사 현황이 실시간으로 보여요.</p>'; $('feed').innerHTML = ''; $('live').className = 'live off'; $('live').textContent = 'SOLO'; return; }
  $('crew').innerHTML = '<p class="empty">현황을 불러오는 중…</p>';
  crewSub = SQNet.subscribe(S.net.code, S.net.id, {
    players: ps => { crewPlayers = ps; renderCrew(); renderShips(); paintScore(); },
    events: ev => { feedEv = feedEv.concat(ev).slice(-40); renderFeed(ev); },
    duels: ds => ds.slice().reverse().forEach(onDuel),
    chat: onChat,
    status: ok => { $('live').className = 'live' + (ok ? '' : ' off'); $('live').textContent = ok ? 'LIVE' : '재연결 중'; },
  });
}
function sortCrew(ps) { return [...ps].sort((a, b) => (b.points || 0) - (a.points || 0) || b.mission - a.mission || new Date(a.updated_at) - new Date(b.updated_at)); }
function renderCrew() {
  const list = sortCrew(crewPlayers), meIdx = list.findIndex(p => p.id === S.net.id);
  let show = list.slice(0, 8); if (meIdx >= 8) show = show.concat([list[meIdx]]);
  const teams = TEAMS.map((t, i) => ({ i, t, n: 0, p: 0 })); crewPlayers.forEach(p => { const x = teams[p.team || 0] || teams[0]; x.n++; x.p += p.points || 0; });
  const tl = teams.filter(x => x.n).sort((a, b) => b.p - a.p), top = tl.length ? tl[0].p || 1 : 1;
  const teamHtml = `<div class="teamrank">${tl.map((x, k) => `<div class="tr ${x.i === (S.net.team || 0) ? 'mine' : ''}" style="--tc:${x.t.col}"><span class="k">${k + 1}</span><span class="tn">${shipIcon(x.t.col, 18)}${teamName(x.i)} <em>${x.n}명</em></span><span class="tp">${x.p.toLocaleString()}P</span><i style="width:${x.p / top * 100}%"></i></div>`).join('')}</div>`;
  $('crew').innerHTML = teamHtml + `<ol class="rank">${show.map(p => { const i = list.indexOf(p), tr = tierOf(p.points || 0);
    return `<li class="${p.id === S.net.id ? 'me' : ''}"><span class="pos">${i + 1}</span><div style="min-width:0"><div class="nm">${shipIcon(tm(p.team || 0).col, 15)}<span class="tier t${tr.i}">${tr.nm}</span> ${esc(p.nickname)}${p.finished ? ' 🏁' : ''}</div><div class="bar"><i style="width:${p.mission / MISSIONS.length * 100}%"></i></div></div>
      <span class="got"><b>${(p.points || 0).toLocaleString()}P</b></span></li>`; }).join('')}</ol>
    <p class="muted" style="font-size:12px;margin:8px 0 0">${list.length}명 탐사 중 · 순위는 탐사 점수 순</p>`;
}
let seenEv = null;
function renderFeed(ev) {
  if (S.net) {
    const maxId = ev.reduce((a, e) => Math.max(a, e.id), 0);
    if (seenEv !== null) ev.filter(e => e.id > seenEv && e.target === S.net.id && e.kind === 'attack').forEach(e => {
      SQAudio.sfx('hit'); bump('m-pts', 'lose'); toast(`⚡ ${e.nickname} 탐정이 내 별 1개를 빼앗아 갔어요! 60초 동안 보호막이 생겨요.`, 'bad');
    });
    S.gifts = S.gifts || [];
    ev.filter(e => e.kind === 'gift' && e.target === S.net.id && !S.gifts.includes(e.id)).forEach(e => {
      S.gifts.push(e.id); if (S.gifts.length > 60) S.gifts.shift();
      if (seenEv === null && Date.now() - new Date(e.created_at) > 120000) return;
      S.en += 2; save(); render(); SQAudio.sfx('measure'); toast(`🤝 팀원 ${e.nickname} 탐정이 에너지 2를 보내 줬어요!`);
    });
    if (seenEv !== null) ev.filter(e => e.id > seenEv && e.kind === 'legend' && e.player_id !== S.net.id).forEach(e => toast(`${e.nickname} 탐정: ${teamText(e.body)}`, 'legend'));
    if (seenEv !== null) ev.filter(e => e.id > seenEv && KF_KINDS[e.kind]).slice(-4).forEach(killFeed);
    seenEv = Math.max(seenEv || 0, maxId);
  }
  $('feed').innerHTML = feedEv.slice(-8).reverse().map(e => `<li class="${e.kind}"><b>${esc(e.nickname)}</b> <span>${esc(teamText(e.body))}</span></li>`).join('');
}



// ---------- 킬피드: 공격·대결·선물·전설·아이템 성공을 하늘 위에 바로 알림 ----------
const KF_KINDS = { attack: 'hit', duel: 'duel', gift: 'gift', legend: 'legend', item: 'item', quiz: 'quiz' };
function killFeed(e) {
  const box = $('kfeed'); if (!box) return;
  const p = crewPlayers.find(x => x.id === e.player_id), col = tm(p ? p.team || 0 : 0).col, mine = S.net && e.player_id === S.net.id, hitMe = S.net && e.target === S.net.id;
  const li = document.createElement('div');
  li.className = 'kf ' + KF_KINDS[e.kind] + (mine ? ' mine' : '') + (hitMe ? ' me' : '');
  li.style.setProperty('--tc', col);
  li.innerHTML = `<b>${esc(e.nickname)}</b> <span>${esc(teamText(e.body))}</span>`;
  box.prepend(li);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => { li.classList.add('out'); setTimeout(() => li.remove(), 500); }, 6500);
}

// ---------- 채팅 (전체 · 우리 팀) ----------
const CHAT_QUICK = ['🤝 에너지 보내줘!', '⚔ 같이 공격하자!', '🛡 도와줘!', '🔍 정답 어디야?', '👍 나이스!', '🔥 가자!', 'GG'];
const CH = { all: [], team: [], tab: 'all', open: false, unread: { all: 0, team: 0 }, on: true, muted: null, first: true, ids: new Set(), sending: false };
function chatReset() {
  CH.all = []; CH.team = []; CH.unread = { all: 0, team: 0 }; CH.first = true; CH.ids.clear(); CH.on = true; CH.muted = null;
  const dock = $('chatdock'); if (!dock) return;
  dock.hidden = !S.net; if (!S.net) chatOpen(false);
  chatPaint();
}
function chatOpen(v) {
  CH.open = v; $('chatbox').hidden = !v; $('chatbtn').setAttribute('aria-expanded', v);
  if (v) { CH.unread[CH.tab] = 0; chatPaint(); setTimeout(() => { const l = $('chatlist'); l.scrollTop = l.scrollHeight; if (matchMedia('(pointer:fine)').matches) $('chatin').focus(); }, 30); }
  else chatPaint();
}
function onChat(list, st) {
  CH.on = st.on; CH.muted = st.muted && new Date(st.muted) > new Date() ? new Date(st.muted) : null;
  let got = false;
  list.forEach(m => {
    if (CH.ids.has(m.id)) return; CH.ids.add(m.id); got = true;
    const arr = CH[m.scope === 'team' ? 'team' : 'all']; arr.push(m); if (arr.length > 60) arr.shift();
    const mine = S.net && m.player_id === S.net.id;
    if (CH.first || Date.now() - new Date(m.created_at) > 30000) return;
    Sky.say(m.player_id, m.body);
    if (!mine) {
      const tab = m.scope === 'team' ? 'team' : 'all';
      if (!CH.open || CH.tab !== tab) CH.unread[tab]++;
      if (!CH.open) chatPeek(m);
      SQAudio.sfx('pick');
    }
  });
  CH.first = false;
  if (got || true) chatPaint();
}
let chatPeekT = null;
function chatPeek(m) {
  const el = $('chatpeek'); if (!el) return;
  el.innerHTML = `${m.scope === 'team' ? '<em>팀</em>' : ''}<b style="color:${tm(m.team || 0).col}">${esc(m.nickname)}</b> ${esc(m.body)}`;
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(chatPeekT); chatPeekT = setTimeout(() => { el.hidden = true; }, 4500);
}
function chatTime(t) { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; }
function chatPaint() {
  const dock = $('chatdock'); if (!dock || dock.hidden) return;
  const n = CH.unread.all + CH.unread.team, badge = $('chatbadge');
  badge.textContent = n > 9 ? '9+' : n; badge.hidden = !n;
  if (!CH.open) return;
  const myTeam = S.net ? S.net.team || 0 : 0, t = tm(myTeam);
  $('chattabs').innerHTML = `<button data-t="all" aria-pressed="${CH.tab === 'all'}">전체${CH.unread.all && CH.tab !== 'all' ? ` <i>${CH.unread.all}</i>` : ''}</button>
    <button data-t="team" aria-pressed="${CH.tab === 'team'}" style="--tc:${t.col}">${shipIcon(t.col, 14)} 우리 팀${CH.unread.team && CH.tab !== 'team' ? ` <i>${CH.unread.team}</i>` : ''}</button>`;
  $('chattabs').querySelectorAll('button').forEach(b => b.onclick = () => { CH.tab = b.dataset.t; CH.unread[CH.tab] = 0; chatPaint(); const l = $('chatlist'); l.scrollTop = l.scrollHeight; });
  const l = $('chatlist'), atEnd = l.scrollHeight - l.scrollTop - l.clientHeight < 40, arr = CH[CH.tab];
  l.innerHTML = arr.length ? arr.map(m => { const me = S.net && m.player_id === S.net.id;
    return `<li class="${me ? 'me' : ''}" style="--tc:${tm(m.team || 0).col}"><button class="cn" data-p="${esc(m.player_id || '')}" ${me ? 'disabled' : ''}>${shipIcon(tm(m.team || 0).col, 13)}${esc(m.nickname)}</button><span class="cb">${esc(m.body)}</span><time>${chatTime(m.created_at)}</time></li>`; }).join('')
    : `<li class="empty">${CH.tab === 'team' ? '우리 팀만 보는 작전 채팅이에요. 다른 팀은 못 봐요 🤫' : '방 전체 친구들과 이야기해요. 고운 말만! 💬'}</li>`;
  l.querySelectorAll('button.cn').forEach(b => b.onclick = () => { if (b.dataset.p) { chatOpen(false); openShip(b.dataset.p); } });
  if (atEnd) l.scrollTop = l.scrollHeight;
  const inp = $('chatin'), off = !CH.on, mu = CH.muted && CH.muted > new Date();
  inp.disabled = off || mu; $('chatsend').disabled = off || mu;
  $('chatquick').querySelectorAll('button').forEach(b => b.disabled = off || mu);
  inp.placeholder = off ? '선생님이 채팅을 잠시 껐어요' : mu ? `채팅 금지 중 · ${Math.ceil((CH.muted - new Date()) / 1000)}초 남음` : CH.tab === 'team' ? '우리 팀에게 작전 보내기…' : '모두에게 말하기… (60자)';
}
function chatNote(msg, bad) { const el = $('chatnote'); el.textContent = msg; el.className = 'cnote' + (bad ? ' bad' : ''); el.hidden = !msg; clearTimeout(el._t); if (msg) el._t = setTimeout(() => { el.hidden = true; }, 5000); }
async function chatSend(body) {
  body = (body || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!body || !S.net || CH.sending) return;
  CH.sending = true; $('chatsend').disabled = true;
  let r; try { r = await SQNet.chatSend(S.net, CH.tab, body); } catch (e) { r = { ok: false, reason: 'net' }; }
  CH.sending = false; $('chatsend').disabled = false;
  if (r && r.ok) { $('chatin').value = ''; $('chatcnt').textContent = '0/60'; chatNote(''); Sky.say(S.net.id, body); if (crewSub) { crewSub.fast(20000); crewSub.now(); } return; }
  const why = r && r.reason;
  if (why === 'bad') { SQAudio.sfx('wrong'); if (r.muted) { CH.muted = new Date(Date.now() + (r.wait || 180) * 1000); chatNote('🚫 고운 말을 쓰지 않아 3분 동안 채팅이 금지됐어요.', true); } else chatNote(`🚫 그 말은 보낼 수 없어요. 고운 말로 바꿔 주세요! (${r.left}번 더 쓰면 3분 채팅 금지)`, true); }
  else if (why === 'fast') chatNote('⏳ 너무 빨라요! 잠깐 쉬었다가 보내 주세요.', true);
  else if (why === 'muted') { CH.muted = new Date(Date.now() + (r.wait || 60) * 1000); chatNote(`🔇 채팅 금지 중이에요 (${r.wait}초 남음)`, true); }
  else if (why === 'off') { CH.on = false; chatNote('선생님이 채팅을 잠시 껐어요.', true); }
  else chatNote('연결이 불안정해요. 잠시 후 다시 보내 주세요.', true);
  chatPaint();
}
function bindChat() {
  if (!$('chatdock')) return;
  $('chatbtn').onclick = () => chatOpen(!CH.open);
  $('chatx').onclick = () => chatOpen(false);
  $('chatpeek').onclick = () => { $('chatpeek').hidden = true; chatOpen(true); };
  $('chatquick').innerHTML = CHAT_QUICK.map(q => `<button type="button">${esc(q)}</button>`).join('');
  $('chatquick').querySelectorAll('button').forEach(b => b.onclick = () => chatSend(b.textContent));
  const inp = $('chatin');
  inp.oninput = () => { $('chatcnt').textContent = `${inp.value.length}/60`; };
  $('chatform').onsubmit = ev => { ev.preventDefault(); chatSend(inp.value); };
  inp.addEventListener('keydown', ev => ev.stopPropagation()); // 입력 중 게임 단축키 막기
  setInterval(() => { if (CH.open && CH.muted) { if (CH.muted <= new Date()) CH.muted = null; chatPaint(); } }, 1000);
}

// ---------- 탐사 점수 · 티어 ----------
const REWARD_P = { '성단': 300, '성운': 300, '은하': 500 };
const TIERS = [['브론즈', 0], ['실버', 1000], ['골드', 2000], ['플래티넘', 3000], ['다이아', 4000], ['마스터', 5000], ['챌린저', 6000]];
function tierOf(p) { let i = 0; TIERS.forEach((t, k) => { if (p >= t[1]) i = k; }); return { i, nm: TIERS[i][0], next: TIERS[i + 1] ? TIERS[i + 1][1] : null, base: TIERS[i][1] }; }
function myPoints() { return myTotal() * 100 + (S.clusters + S.nebulae) * 300 + S.galaxies * 500 + (S.bonus || 0); }
function boostOn() { return Date.now() < (S.boostUntil || 0); }
function addPoints(n, label) { const v = n * (boostOn() ? 2 : 1); S.bonus = Math.min(30000, (S.bonus || 0) + v); return v; }
let lastTier = -1;
function paintScore() {
  const P = myPoints(), tr = tierOf(P);
  $('pts').textContent = P.toLocaleString();
  $('tierb').textContent = tr.nm; $('tierb').className = 'tier t' + tr.i;
  $('tierbar').style.width = tr.next ? Math.min(100, (P - tr.base) / (tr.next - tr.base) * 100) + '%' : '100%';
  $('stars').textContent = myTotal();
  if (lastTier >= 0 && tr.i > lastTier) { toast(`티어 승급! ${tr.nm} 달성 🎉`, 'legend'); SQAudio.sfx('ok'); }
  lastTier = tr.i;
  const b = $('boostb'); const left = Math.ceil(((S.boostUntil || 0) - Date.now()) / 1000);
  b.hidden = left <= 0; if (left > 0) b.textContent = `점수 2배 ${left}초`;
}
setInterval(() => { if (boostOn() || !$('boostb').hidden) paintScore(); }, 1000);

// ---------- 이벤트 별 · 아이템 ----------
const RAR = [
  { k: 'common', nm: '일반', p: 50, w: 55, col: '#79d3e8' },
  { k: 'rare', nm: '희귀', p: 150, w: 28, col: '#b9a2ff', item: 0.3 },
  { k: 'epic', nm: '영웅', p: 100, w: 13, col: '#ffb062', item: 1 },
  { k: 'legend', nm: '전설', p: 500, w: 4, col: '#ff7aa8', item: 1 },
];
const ITEMS = {
  energy: { nm: '에너지 충전', ic: '⚡', d: '관측 에너지 +4' },
  shield: { nm: '보호막', ic: '🛡', d: '90초 동안 공격을 막아요' },
  boost: { nm: '점수 2배', ic: '✖2', d: '60초 동안 얻는 점수 2배' },
  radar: { nm: '레이더', ic: '📡', d: '6초 동안 정답 천체 위치 표시' },
};
let evSeq = 0, evTimer = null;
function scheduleEventStar(first) {
  clearTimeout(evTimer);
  evTimer = setTimeout(() => {
    if (S.phase === 'play' && !document.hidden && ov.hidden) spawnEventStar();
    scheduleEventStar(false);
  }, (first ? 12 : 22 + Math.random() * 20) * 1000);
}
function spawnEventStar() {
  let r = Math.random() * 100, rar = RAR[0]; for (const x of RAR) { if (r < x.w) { rar = x; break; } r -= x.w; }
  const x = 140 + Math.random() * 1720, y = 140 + Math.random() * 920;
  Sky.addEvent({ id: 'e' + (++evSeq), x, y, rar: rar.k, col: rar.col, nm: rar.nm, life: rar.k === 'legend' ? 10 : 14 });
  if (rar.k === 'legend' || rar.k === 'epic') { SQAudio.sfx('warp'); toast(`${rar.nm} 이벤트 별 출현! 하늘을 살펴보세요`, rar.k === 'legend' ? 'legend' : ''); }
}
function grabEvent(id) {
  const e = Sky.takeEvent(id); if (!e) return;
  const rar = RAR.find(x => x.k === e.rar), got = addPoints(rar.p, null);
  let msg = `+${got}P`;
  if (rar.item && Math.random() < rar.item) {
    const keys = Object.keys(ITEMS), it = keys[Math.floor(Math.random() * keys.length)];
    if (S.items.length < 3) { S.items.push(it); msg += ` · ${ITEMS[it].nm}`; } else msg += ' · 가방이 가득 찼어요';
  }
  Sky.floatText(e.x, e.y, `${rar.nm}! ${msg}`, rar.col); if (rar.k === 'legend' || rar.k === 'epic') flash(rar.k === 'legend' ? 'rgba(255,122,168,.45)' : 'rgba(255,176,98,.4)');
  SQAudio.sfx(rar.k === 'common' ? 'measure' : 'ok'); bump('m-pts', 'bump');
  save(); paintScore(); renderItems();
  sync(rar.k === 'legend' || rar.k === 'epic' ? 'legend' : null, rar.k === 'legend' || rar.k === 'epic' ? `${rar.k === 'legend' ? '🌈 전설' : '🔶 영웅'} 이벤트 별 획득! ${msg}` : null);
}
function renderItems() {
  const box = $('items');
  box.innerHTML = Array.from({ length: 3 }, (_, i) => { const it = S.items[i];
    return it ? `<button class="item" data-i="${i}" title="${ITEMS[it].nm}: ${ITEMS[it].d}"><span class="ic">${ITEMS[it].ic}</span><span class="nm">${ITEMS[it].nm}</span></button>` : '<span class="item empty" aria-hidden="true"></span>'; }).join('');
  box.querySelectorAll('button.item').forEach(b => b.onclick = () => useItem(+b.dataset.i));
}
async function useItem(i) {
  const it = S.items[i]; if (!it) return;
  if (it === 'energy') { if (S.phase !== 'play') { toast('관측 중일 때 쓸 수 있어요.'); return; } S.en = Math.min(M().energy + 6, S.en + 4); toast('⚡ 관측 에너지 +4'); }
  if (it === 'boost') { S.boostUntil = Math.max(Date.now(), S.boostUntil || 0) + 60000; toast('✖2 60초 동안 얻는 점수 2배!', 'legend'); }
  if (it === 'shield') { if (!S.net) { toast('혼자 탐사 중에는 보호막이 필요 없어요.'); return; } try { await SQNet.shield(S.net); toast('🛡 90초 동안 공격을 막아요'); } catch (e) { toast('연결이 불안정해요. 잠시 후 다시 써 보세요.', 'bad'); return; } }
  if (it === 'radar') {
    if (S.phase !== 'play') { toast('관측 중일 때 쓸 수 있어요.'); return; }
    const m = M(); let ids = [];
    if (m.collect) { const have = S.col[S.mi] || []; ids = SEC().objs.filter(o => (m.collect === 'hot' ? isHot(o) : isCool(o)) && !have.includes(o.id)).slice(0, 3).map(o => o.id); }
    else ids = [m.target];
    Sky.radar(ids, 6); toast('📡 레이더 작동! 6초 동안 표시돼요');
  }
  SQAudio.sfx('measure'); S.items.splice(i, 1); save(); render(); renderItems();
  const IT_SAY = { energy: '⚡ 에너지 충전 아이템 사용! 관측 에너지 +4', boost: '✖2 점수 2배 아이템 발동! 60초 동안 점수 2배', shield: '🛡 보호막 아이템 발동! 90초 동안 공격 무적', radar: '📡 레이더 아이템 발동! 정답 위치 탐지 중' };
  sync('item', IT_SAY[it]);
}

// ---------- 별 합계 (미션으로 모은 별 + 공격·대결로 얻고 잃은 별) ----------
function meRow() { return S.net ? crewPlayers.find(p => p.id === S.net.id) : null; }
function myDelta() { const r = meRow(); return r ? (r.delta || 0) : 0; }
function myTotal() { return Math.max(0, S.stars + myDelta()); }

// ---------- 알림 ----------
let toastT = null;
function toast(msg, kind) {
  const el = $('toast'); el.textContent = msg; el.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastT); toastT = setTimeout(() => { el.className = 'toast'; }, 4200);
}
const ov2 = $('ov2'), card2 = $('card2');
function open2(html) { card2.innerHTML = html; ov2.hidden = false; const f = card2.querySelector('button'); if (f) f.focus(); }
function close2() { ov2.hidden = true; }

// ---------- 빠른 문제 (공격·대결 공용) ----------
function rngOf(seed) { let s = (seed % 2147483646) + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
const TEMP = [['청색', 30000], ['청백색', 15000], ['백색', 9500], ['황백색', 6800], ['황색', 5800], ['주황색', 4500], ['적색', 3000]];
const FACTS = [
  ['방출 성운은 스스로 빛을 낸다.', true], ['반사 성운은 스스로 빛을 낸다.', false], ['암흑 성운은 뒤쪽 별빛을 가린다.', true],
  ['구상 성단에는 나이가 많은 붉은 별이 많다.', true], ['산개 성단은 수십만 개의 별이 공 모양으로 모여 있다.', false],
  ['태양계는 우리은하의 중심에 있다.', false], ['우리은하는 막대 나선 은하이다.', true], ['타원 은하에는 나선팔이 있다.', false],
  ['절대 등급은 별을 10 pc 거리에 두었을 때의 밝기이다.', true], ['등급 숫자가 클수록 더 밝은 별이다.', false],
  ['표면 온도가 높은 별일수록 붉은색을 띤다.', false], ['연주시차가 클수록 가까운 별이다.', true],
];
function makeQ(r) {
  const pick = a => a[Math.floor(r() * a.length)], shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const type = Math.floor(r() * 5);
  if (type === 0) { let a = pick(TEMP), b = pick(TEMP); while (b === a) b = pick(TEMP); const hot = a[1] > b[1] ? a : b;
    return { q: '표면 온도가 더 높은 별은?', opts: shuf([a[0] + ' 별', b[0] + ' 별']), ans: hot[0] + ' 별' }; }
  if (type === 1 || type === 3) { const pool = [-1.5, -0.5, 0.5, 1.0, 2.0, 3.5, 4.8, 6.0]; let a = pick(pool), b = pick(pool); while (b === a) b = pick(pool);
    const f = n => (n < 0 ? '−' + Math.abs(n) : n) + '등급', kind = type === 1 ? '겉보기 등급' : '절대 등급';
    return { q: type === 1 ? `지구에서 더 밝게 보이는 별은? (${kind})` : `실제로 더 밝은 별은? (${kind})`, opts: shuf([f(a), f(b)]), ans: f(Math.min(a, b)) }; }
  if (type === 2) { const p = pick([0.1, 0.2, 0.25, 0.5, 1]); const d = 1 / p;
    const opts = shuf([...new Set([d, p, d * 2, d / 2 === d ? d + 1 : d / 2, 10 * p])].slice(0, 4).map(x => +x.toFixed(2) + ' pc'));
    return { q: `연주시차가 ${p}″인 별까지의 거리는?`, opts, ans: +d.toFixed(2) + ' pc' }; }
  const [s, tf] = pick(FACTS);
  return { q: s, opts: ['맞다', '아니다'], ans: tf ? '맞다' : '아니다' };
}

// ---------- 다른 탐사선 누르기 ----------
function openShip(pid) {
  if (!S.net) return;
  const p = crewPlayers.find(x => x.id === pid); if (!p) return;
  const tot = Math.max(0, p.stars + (p.delta || 0));
  const shield = p.shield_until && new Date(p.shield_until) > new Date();
  const cd = Math.max(0, Math.ceil((S.lastAttack + 40000 - Date.now()) / 1000));
  const mate = (p.team || 0) === (S.net.team || 0);
  if (mate) return openMate(p, tot);
  const canAtk = S.phase === 'play' && S.en >= 3 && !shield && tot > 0 && cd === 0;
  const why = S.phase !== 'play' ? '관측 중일 때만 공격할 수 있어요.' : shield ? '보호막이 켜져 있어요. 잠시 뒤에 다시 시도해요.' : tot <= 0 ? '빼앗을 별이 없어요.' : cd ? `공격 장비 충전 중 (${cd}초)` : S.en < 3 ? '관측 에너지가 3 이상 필요해요.' : '빠른 문제 1개를 맞히면 별 1개를 빼앗아요. 틀리면 에너지만 줄어요.';
  open2(`<div class="eyebrow" style="color:${tm(p.team || 0).col}">상대 팀 · ${shipIcon(tm(p.team || 0).col, 18)} ${teamName(p.team || 0)}</div><h2 style="font-size:24px">${esc(p.nickname)} 탐정</h2>
    <div class="rep"><div><span>가진 별</span><b style="color:var(--amber)">★ ${tot}</b></div><div><span>진행</span><b>미션 ${Math.min(p.mission + 1, MISSIONS.length)} / ${MISSIONS.length}</b></div>${shield ? '<div><span>상태</span><b style="color:var(--cyan)">보호막 켜짐</b></div>' : ''}</div>
    <div class="pvp">
      <button class="pvpbtn atk" id="atk" ${canAtk ? '' : 'disabled'}><b>⚡ 별 뺏기 공격</b><span>관측 에너지 3 사용</span></button>
      <button class="pvpbtn duel" id="duel"><b>⚔ 스피드 대결 신청</b><span>5문제 먼저 많이 맞히면 별 1개</span></button>
    </div>
    <p class="muted" style="font-size:13px;margin:0">${esc(why)}</p>
    <button class="ghost" id="x2">닫기</button>`);
  $('x2').onclick = close2;
  $('atk').onclick = () => attackFlow(p);
  $('duel').onclick = () => duelRequest(p);
}

function openMate(p, tot) {
  const cd = Math.max(0, Math.ceil(((S.lastGift || 0) + 20000 - Date.now()) / 1000));
  const can = S.phase === 'play' && S.en >= 3 && cd === 0;
  const why = S.phase !== 'play' ? '관측 중일 때만 보낼 수 있어요.' : cd ? `다시 보낼 수 있을 때까지 ${cd}초` : S.en < 3 ? '내 에너지가 3 이상 있어야 보낼 수 있어요.' : '내 에너지 2를 팀원에게 보내요. 팀원이 미션을 더 빨리 깨면 팀 점수가 올라가요!';
  open2(`<div class="eyebrow" style="color:${tm(p.team || 0).col}">우리 팀 · ${shipIcon(tm(p.team || 0).col, 18)} ${teamName(p.team || 0)}</div><h2 style="font-size:24px">${esc(p.nickname)} 탐정</h2>
    <div class="rep"><div><span>탐사 점수</span><b style="color:var(--amber)">${(p.points || 0).toLocaleString()}P</b></div><div><span>진행</span><b>미션 ${Math.min(p.mission + 1, MISSIONS.length)} / ${MISSIONS.length}</b></div></div>
    <button class="pvpbtn gift" id="gift" ${can ? '' : 'disabled'}><b>🤝 에너지 2 보내기</b><span>같은 팀끼리는 공격·대결 대신 서로 도와요</span></button>
    <p class="muted" style="font-size:13px;margin:0">${esc(why)}</p>
    <button class="ghost" id="x2">닫기</button>`);
  $('x2').onclick = close2;
  $('gift').onclick = async () => {
    $('gift').disabled = true; S.en -= 2; save(); render();
    let r; try { r = await SQNet.gift(S.net, p.id); } catch (e) { r = { ok: false, reason: 'net' }; }
    if (r && r.ok) { S.lastGift = Date.now(); save(); SQAudio.sfx('ok'); toast(`🤝 ${p.nickname} 탐정에게 에너지 2를 보냈어요!`); close2(); }
    else { S.en += 2; save(); render(); toast(r && r.reason === 'cooldown' ? `잠시 후 다시 보낼 수 있어요 (${r.wait}초)` : '보내지 못했어요. 에너지는 돌려받았어요.', 'bad'); close2(); }
  };
}
function attackFlow(p) {
  S.en -= 3; save(); render();
  const q = makeQ(rngOf(Date.now() % 100000)); let left = 8, done = false;
  open2(`<div class="eyebrow">⚡ 공격 · ${esc(p.nickname)}</div><h2 style="font-size:22px">${esc(q.q)}</h2>
    <div class="timer"><i id="tbar" style="width:100%"></i></div>
    <div class="opts">${q.opts.map(o => `<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div><div id="afb"></div>`);
  const tick = setInterval(() => { left -= 0.1; const b = $('tbar'); if (b) b.style.width = Math.max(0, left / 8 * 100) + '%'; if (left <= 0) finish(null); }, 100);
  card2.querySelectorAll('.opt').forEach(b => b.onclick = () => finish(b));
  async function finish(btn) {
    if (done) return; done = true; clearInterval(tick);
    card2.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (x.dataset.v === q.ans) x.classList.add('right'); });
    const ok = btn && btn.dataset.v === q.ans;
    if (!ok) { if (btn) btn.classList.add('wrong'); SQAudio.sfx('wrong'); $('afb').innerHTML = `<div class="msg bad">${btn ? '틀렸어요!' : '시간 초과!'} 공격 실패. 정답은 ‘${esc(q.ans)}’</div><button class="ghost" id="x2">닫기</button>`; $('x2').onclick = close2; return; }
    $('afb').innerHTML = '<div class="msg">정답! 별을 빼앗는 중…</div>';
    let r; try { r = await SQNet.attack(S.net, p.id); } catch (e) { r = { ok: false, reason: 'net' }; }
    if (r && r.ok) { S.lastAttack = Date.now(); save(); if (crewSub) crewSub.now(); SQAudio.sfx('ok'); bump('m-pts', 'bump'); $('afb').innerHTML = `<div class="msg" style="color:var(--good)">⚡ ${esc(p.nickname)} 탐정의 별 1개를 빼앗았어요!</div><button class="go" id="x2">관측으로 돌아가기</button>`; }
    else {
      S.en += 3; if (r && r.reason === 'cooldown') S.lastAttack = Date.now() - (40 - (r.wait || 40)) * 1000; save(); render();
      const why = { team: '같은 팀은 공격할 수 없어요.', shield: '상대에게 보호막이 생겼어요.', empty: '상대에게 남은 별이 없어요.', cooldown: `공격 장비 충전 중이에요 (${r.wait}초).`, net: '연결이 불안정해요.' }[r && r.reason] || '공격할 수 없어요.';
      $('afb').innerHTML = `<div class="msg bad">${why} 에너지는 돌려받았어요.</div><button class="ghost" id="x2">닫기</button>`;
    }
    $('x2').onclick = close2;
  }
}

// ---------- 스피드 대결 ----------
const duelSeen = new Set(); let duelBusy = false, pendingTimer = null;
async function duelRequest(p) {
  let r; try { r = await SQNet.duelNew(S.net, p.id); } catch (e) { r = { ok: false }; }
  if (!r || !r.ok) { open2(`<h2 style="font-size:22px">대결을 신청할 수 없어요</h2><p>${r && r.reason === 'busy' ? '나나 상대가 이미 다른 대결 중이에요.' : r && r.reason === 'team' ? '같은 팀과는 대결할 수 없어요.' : '잠시 후 다시 시도해 주세요.'}</p><button class="ghost" id="x2">닫기</button>`); $('x2').onclick = close2; return; }
  duelBusy = true; if (crewSub) crewSub.fast(60000);
  open2(`<div class="eyebrow">⚔ 스피드 대결</div><h2 style="font-size:22px">${esc(p.nickname)} 탐정에게 신청했어요</h2><p class="muted">상대가 수락하면 바로 시작해요…</p><div class="timer"><i id="wbar" style="width:100%"></i></div>`);
  let w = 20; clearInterval(pendingTimer);
  pendingTimer = setInterval(() => { w -= 0.2; const b = $('wbar'); if (b) b.style.width = Math.max(0, w / 20 * 100) + '%'; if (w <= 0) { clearInterval(pendingTimer); duelBusy = false; close2(); toast(`${p.nickname} 탐정이 응답하지 않았어요.`); } }, 200);
}
function onDuel(d) {
  const me = S.net.id, iamA = d.a === me, other = iamA ? d.b_nick : d.a_nick, key = d.id + ':' + d.status;
  if (duelSeen.has(key)) return; duelSeen.add(key);
  if (d.status === 'pending' && !iamA) {
    if (duelBusy || ['warp', 'memory'].includes(S.phase) || Date.now() - new Date(d.created_at) > 30000) { SQNet.duelReply(S.net, d.id, false).catch(() => {}); return; }
    duelBusy = true; SQAudio.sfx('pick');
    open2(`<div class="eyebrow">⚔ 대결 신청 도착!</div><h2 style="font-size:24px">${esc(other)} 탐정이 스피드 대결을 신청했어요</h2>
      <p>별·성단·성운·은하 문제 5개를 누가 더 많이, 더 빨리 맞히는지 겨뤄요. 이기면 상대의 별 1개를 가져와요!</p>
      <div class="timer"><i id="ibar" style="width:100%"></i></div>
      <div class="row"><button class="go" id="acc">수락</button><button class="ghost" id="dec">거절</button></div>`);
    let w = 15; const t = setInterval(() => { w -= 0.2; const b = $('ibar'); if (b) b.style.width = Math.max(0, w / 15 * 100) + '%'; if (w <= 0) reply(false); }, 200);
    const reply = ok => { clearInterval(t); if (crewSub) crewSub.fast(90000); SQNet.duelReply(S.net, d.id, ok).catch(() => {}); if (!ok) { duelBusy = false; close2(); } else { open2('<h2 style="font-size:22px">대결 준비 중…</h2>'); setTimeout(() => { if (!duelSeen.has(d.id + ':active')) { duelBusy = false; close2(); toast('대결을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'); } }, 15000); } };
    $('acc').onclick = () => reply(true); $('dec').onclick = () => reply(false);
    return;
  }
  if (d.status === 'declined' && iamA) { clearInterval(pendingTimer); duelBusy = false; close2(); toast(`${other} 탐정이 대결을 거절했어요.`); return; }
  if (d.status === 'active') { clearInterval(pendingTimer); playDuel(d, other); return; }
  if (d.status === 'done') { showDuelResult(d, iamA, other); }
}
function playDuel(d, other) {
  SQAudio.setMode(2);
  duelBusy = true;
  const r = rngOf(d.seed), qs = Array.from({ length: 5 }, () => makeQ(r));
  let i = 0, score = 0, left = 40; const t0 = Date.now(); let over = false;
  SQAudio.sfx('warp');
  const tick = setInterval(() => { left -= 0.1; const b = $('dbar'); if (b) b.style.width = Math.max(0, left / 40 * 100) + '%'; if (left <= 0) end(); }, 100);
  function show() {
    const q = qs[i];
    open2(`<div class="eyebrow">⚔ VS ${esc(other)} · 문제 ${i + 1} / 5 · 맞힌 개수 ${score}</div><h2 style="font-size:22px">${esc(q.q)}</h2>
      <div class="timer"><i id="dbar" style="width:${left / 40 * 100}%"></i></div>
      <div class="opts">${q.opts.map(o => `<button class="opt" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`);
    card2.querySelectorAll('.opt').forEach(b => b.onclick = () => {
      const ok = b.dataset.v === q.ans; if (ok) score++; b.classList.add(ok ? 'right' : 'wrong'); SQAudio.sfx(ok ? 'measure' : 'wrong');
      card2.querySelectorAll('.opt').forEach(x => x.disabled = true);
      setTimeout(() => { i++; if (i >= qs.length) end(); else show(); }, 350);
    });
  }
  function end() {
    if (over) return; over = true; clearInterval(tick);
    SQNet.duelSubmit(S.net, d.id, score, Date.now() - t0).catch(() => {}); if (crewSub) crewSub.fast(60000);
    open2(`<div class="eyebrow">⚔ 대결 완료</div><h2 style="font-size:22px">5문제 중 ${score}문제 정답!</h2><p class="muted">${esc(other)} 탐정의 결과를 기다리는 중…</p><button class="ghost" id="x2">닫고 기다리기</button>`);
    $('x2').onclick = close2;
    // 상대가 창을 닫아 결과가 안 오면 60초 뒤 대결을 정리 (다음 대결 신청을 막지 않게)
    setTimeout(() => { if (!duelSeen.has(d.id + ':done')) { duelBusy = false; toast(`${other} 탐정의 응답이 없어 대결이 끝났어요. 별은 그대로예요.`); if (!ov2.hidden && card2.textContent.includes('기다리는 중')) close2(); } }, 60000);
  }
  show();
}
function showDuelResult(d, iamA, other) {
  SQAudio.setMode(S.phase === 'play' ? 1 : 0);
  duelBusy = false;
  const my = iamA ? d.a_score : d.b_score, their = iamA ? d.b_score : d.a_score;
  const win = d.winner === S.net.id, draw = !d.winner;
  SQAudio.sfx(win ? 'ok' : draw ? 'measure' : 'hit');
  if (win) bump('m-pts', 'bump'); else if (!draw) bump('m-pts', 'lose');
  open2(`<div class="eyebrow">⚔ 대결 결과</div><h2>${win ? '승리! 별 1개 획득' : draw ? '무승부!' : '아쉽게 졌어요'}</h2>
    <div class="rep"><div><span>나</span><b>${my}문제</b></div><div><span>${esc(other)}</span><b>${their}문제</b></div></div>
    <p class="muted" style="font-size:13px;margin:0">${draw ? '맞힌 개수와 시간이 같아 별은 그대로예요.' : win ? '맞힌 개수가 같으면 더 빨리 끝낸 사람이 이겨요.' : '다음 대결에서 되찾아 오자!'}</p>
    <button class="go" id="x2">관측으로 돌아가기</button>`);
  $('x2').onclick = close2;
}

// ---------- 기억력 테스트 (보안 잠금 해제) ----------
const MEMS = [
  { after: 1, title: '관측소 보안 잠금', text: '다음 장비를 쓰려면 관측소 보안 잠금을 풀어야 해! 별의 색과 표면 온도가 짝을 이루는 카드를 모두 찾아라. 70초 안에 성공하면 별 2개!',
    pairs: [['청색 별', '약 30,000 K'], ['청백색 별', '약 15,000 K'], ['백색 별', '약 9,500 K'], ['황색 별', '약 5,800 K'], ['주황색 별', '약 4,500 K'], ['적색 별', '약 3,000 K']] },
  { after: 4, title: '은하 관문 암호', text: '외부 은하로 가는 관문이 잠겨 있어! 천체와 그 특징이 짝을 이루는 카드를 모두 찾아라. 70초 안에 성공하면 별 2개!',
    pairs: [['구상 성단', '공 모양, 늙은 붉은 별'], ['산개 성단', '엉성한 무리, 젊은 파란 별'], ['방출 성운', '스스로 빛을 냄'], ['반사 성운', '별빛을 반사'], ['암흑 성운', '뒤쪽 별빛을 가림'], ['타원 은하', '나선팔이 없음']] },
].map(m => ({ ...m, after: Math.min(m.after, MISSIONS.length - 2) }));
function showMemory(mg) {
  SQAudio.setMode(0);
  const r = rngOf(Date.now() % 100000);
  const cards = []; mg.pairs.forEach((p, k) => { cards.push({ k, t: p[0], a: true }); cards.push({ k, t: p[1], a: false }); });
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  open(`<div class="eyebrow">🧠 기억력 테스트</div><h2>${esc(mg.title)}</h2><p>${esc(mg.text)}</p>
    <div class="warpbar"><span>남은 시간 <b id="mt">70</b>초</span><span>찾은 짝 <b id="mf">0</b> / ${mg.pairs.length}</span></div>
    <div class="memgrid" id="mgrid">${cards.map((c, i) => `<button class="mcard" data-i="${i}" disabled><span class="back">?</span><span class="face ${c.a ? 'a' : 'b'}">${esc(c.t)}</span></button>`).join('')}</div>
    <button class="go" id="mgo">시작 (5초 동안 카드 공개)</button>`, true);
  let found = 0, open1 = null, lock = false, left = 70, tick = null, done = false;
  const els = [...$('mgrid').querySelectorAll('.mcard')];
  $('mgo').onclick = () => {
    $('mgo').disabled = true; els.forEach(e => e.classList.add('up')); let peek = 5; $('mgo').textContent = `외우는 중… ${peek}`;
    const pk = setInterval(() => { peek--; $('mgo').textContent = `외우는 중… ${peek}`; if (peek <= 0) { clearInterval(pk); els.forEach(e => { e.classList.remove('up'); e.disabled = false; }); $('mgo').hidden = true; startClock(); } }, 1000);
  };
  function startClock() { tick = setInterval(() => { left--; $('mt').textContent = left; if (left <= 0) finish(false); }, 1000); }
  els.forEach(e => e.onclick = () => {
    if (lock || done || e.classList.contains('up')) return;
    e.classList.add('up'); SQAudio.sfx('pick');
    if (!open1) { open1 = e; return; }
    const a = cards[+open1.dataset.i], b = cards[+e.dataset.i];
    if (a.k === b.k) { open1.classList.add('got'); e.classList.add('got'); open1.disabled = e.disabled = true; open1 = null; found++; $('mf').textContent = found; SQAudio.sfx('measure'); if (found === mg.pairs.length) finish(true); }
    else { lock = true; const o = open1; open1 = null; SQAudio.sfx('wrong'); setTimeout(() => { o.classList.remove('up'); e.classList.remove('up'); lock = false; }, 750); }
  });
  function finish(ok) {
    if (done) return; done = true; clearInterval(tick);
    S.memDone.push(S.mi);
    if (ok) { S.stars += 2; if (boostOn()) addPoints(200, null); bump('m-pts', 'bump'); SQAudio.sfx('ok'); }
    save(); render(); sync('memory', ok ? `🧠 ${mg.title} 해제! 별 +2` : `🧠 ${mg.title} 시간 초과`);
    const go = $('mgo'); go.hidden = false; go.disabled = false; go.textContent = '계속하기';
    go.insertAdjacentHTML('beforebegin', `<div class="explain">${ok ? `${70 - left}초 만에 모두 찾았어! 별 2개(+200P) 획득!` : '시간이 다 됐어. 짝을 다시 보며 기억해 두자!'}</div>`);
    els.forEach(e => { e.classList.add('up'); e.disabled = true; });
    go.onclick = () => { close(); next(); };
  }
}

// ---------- 나가기 ----------
$('exit').onclick = () => {
  open2(`<div class="eyebrow">나가기</div><h2 style="font-size:22px">탐사를 그만하고 처음 화면으로 갈까요?</h2>
    <p class="muted">${S.net ? '현황판에 남은 점수는 그대로 남아요. 다시 들어오면 새 탐사선으로 시작해요.' : '혼자 탐사한 기록이 지워져요.'}</p>
    <div class="row"><button class="go" id="exitYes">처음 화면으로</button><button class="ghost" id="exitNo">계속 탐사하기</button></div>`);
  $('exitNo').onclick = close2;
  $('exitYes').onclick = () => { endTut(false); if (crewSub) { crewSub.stop(); crewSub = null; } crewPlayers = []; feedEv = []; seenEv = null; S = fresh(); save(); close2(); close(); render(); connectCrew(); showJoin(); };
};

// ---------- 소리 ----------
let musicWanted = true; try { musicWanted = localStorage.getItem('sq-music') !== '0'; } catch (e) {} // 기본 ON (직접 끈 사람만 OFF)
function paintSound() { const b = $('snd'); $('sndtx').textContent = SQAudio.playing ? '음악 ON' : '음악 OFF'; b.setAttribute('aria-label', SQAudio.playing ? '음악 끄기' : '음악 켜기'); b.setAttribute('aria-pressed', SQAudio.playing ? 'true' : 'false'); }
$('snd').onclick = () => { if (SQAudio.playing) { SQAudio.stop(); musicWanted = false; } else { SQAudio.start(); musicWanted = true; } try { localStorage.setItem('sq-music', musicWanted ? '1' : '0'); } catch (e) {} paintSound(); };
// 브라우저는 사용자가 화면을 한 번 누르거나 키를 눌러야 소리를 허락함 → 첫 터치·클릭·키 입력 순간 바로 음악 시작
function firstTouch(e) { if (e && e.target && e.target.closest && e.target.closest('#snd')) { cleanupFirst(); return; } SQAudio.unlock(); if (musicWanted && !SQAudio.playing) { SQAudio.start(); paintSound(); } cleanupFirst(); }
function cleanupFirst() { ['pointerdown', 'keydown', 'touchend'].forEach(k => document.removeEventListener(k, firstTouch, true)); }
['pointerdown', 'keydown', 'touchend'].forEach(k => document.addEventListener(k, firstTouch, true));
paintSound();

// ---------- 튜토리얼 (따라 하기 · 언제든 건너뛰기) ----------
// 학생 피드백: "처음에 어떻게 하는지 모르겠다", "내 위치가 어디인지 모르겠다" → 첫 미션에서 한 단계씩 직접 해 보며 익힘
const TUT_BASIC = [
  { sel: '#sky', t: '① 하늘 확대하고 움직이기', x: '마우스 <b>휠을 굴리거나</b> 두 손가락을 <b>벌려서 확대</b>해 보세요. 확대한 뒤에는 하늘을 <b>끌어서</b> 움직일 수 있어요.', act: '확대해 보세요 👆', done: c => Sky.view().moved },
  { sel: '.zoombar', t: '② 확대 · 축소 버튼', x: '<b>＋ −</b> 버튼으로도 확대할 수 있어요. <b>⟲</b>를 누르면 처음 화면으로 돌아와요.' },
  { sel: '#findme', t: '③ 내 우주선 찾기 📍', x: '내가 어디 있는지 모르겠으면 이 버튼! 화면이 <b>내 우주선</b>으로 날아가요. 지금 눌러 보세요.', act: '📍를 눌러 보세요', done: c => c.findme },
  { sel: '#mini', t: '④ 전체 지도 🗺', x: '하늘 전체를 작게 보여 줘요. <b>네모 칸</b> = 지금 보고 있는 곳, <b>빛나는 점</b> = 나, <b>작은 점</b> = 친구들. 지도를 누르면 그곳으로 이동해요.' },
  { sel: '#hud', t: '⑤ 미션 창', x: '여기에 <b>찾아야 할 것</b>과 <b>방법</b>이 적혀 있어요. 막히면 오른쪽 패널의 <b>관측소장의 힌트</b>를 눌러요.' },
  { sel: '#sky', t: '⑥ 별 모으기', x: '이제 <b>파랗게 빛나는 별</b>을 하나 눌러 보세요! 맞으면 <b style="color:var(--good)">초록 동그라미</b>가 생겨요. 잘 안 보이면 확대!', act: '파란 별을 눌러 보세요', done: c => (S.col[S.mi] || []).length >= 1 },
  { sel: '.hudbar', t: '⑦ 점수와 에너지', x: '<b>점수(P)</b>가 오를수록 티어가 올라가요. <b>⚡ 번개</b>는 관측 에너지로, 10초마다 1씩 저절로 차요.' },
  { sel: '#crew', t: '⑧ 친구와 배틀', x: '하늘의 <b>친구 우주선을 누르면</b> 별 뺏기 공격·스피드 대결! <b>같은 팀</b>은 에너지를 보내 도와요. 여기서 <b>팀 순위</b>를 확인해요.', scroll: true },
];
const TUT_MEASURE = [
  { sel: '#sky', t: '① 망원경 맞추기', x: '이번 미션은 <b>이름이 있는 별</b>을 눌러 망원경을 맞추는 거예요. 아무 이름 있는 별이나 눌러 보세요.', act: '이름 있는 별을 눌러 보세요', done: c => !!S.sel },
  { sel: '.tools', t: '② 관측 장비로 측정', x: '장비 버튼을 누르면 측정돼요. <b>⚡ 개수만큼</b> 에너지를 써요. <b style="color:var(--amber)">추천</b> 표시가 있는 장비부터!', act: '장비 하나를 눌러 보세요', done: c => Object.values(S.obs).some(o => Object.keys(o).length) },
  { sel: '.readouts', t: '③ 측정 결과 읽기', x: '결과가 그림으로 크게 나오고, 아래 <b>탐사 수첩</b>에도 쌓여요. 여러 별을 재서 <b>비교</b>해 보세요.' },
  { sel: '#accuse', t: '④ 지목하기', x: '증거가 모이면 <b>지목하기</b>! 틀리면 <b>8초 동안</b> 다시 못 누르고 별점이 깎여요. <b>찍지 말고 증거로!</b>' },
];
let tut = null;
function startTut(steps, key) {
  endTut(false);
  const box = document.createElement('div'); box.id = 'coach';
  box.innerHTML = '<div class="hole"></div><div class="bubble" role="dialog" aria-live="polite"><div class="tstep"></div><b class="tt"></b><p class="tx"></p><div class="tact"></div><div class="row"><button class="ghost" id="tutskip">튜토리얼 건너뛰기</button><button class="go" id="tutnext">다음 →</button></div></div>';
  document.body.appendChild(box);
  tut = { steps, key, i: -1, box, flags: {}, timer: null };
  $('tutskip').onclick = () => endTut(true);
  $('tutnext').onclick = () => tutGo(tut.i + 1);
  tut.timer = setInterval(tutTick, 250);
  tutGo(0);
}
function tutGo(i) {
  if (!tut) return;
  if (i >= tut.steps.length) { endTut(false, true); return; }
  tut.i = i; tut.flags = {}; tut.t0 = Date.now();
  const st = tut.steps[i], el = document.querySelector(st.sel);
  if (st.scroll && el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  else if (i && tut.steps[i - 1].scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  if (st.done) Sky.markView();
  tut.box.querySelector('.tstep').textContent = `튜토리얼 ${i + 1} / ${tut.steps.length}`;
  tut.box.querySelector('.tt').textContent = st.t;
  tut.box.querySelector('.tx').innerHTML = st.x;
  tut.box.querySelector('.tact').innerHTML = st.act ? `<span class="pulse">${st.act}</span>` : '';
  $('tutnext').textContent = i === tut.steps.length - 1 ? '시작하기 🚀' : st.done ? '건너뛰고 다음 →' : '다음 →';
  $('tutnext').classList.toggle('ghost', !!st.done); $('tutnext').classList.toggle('go', !st.done);
  tutTick();
}
function tutTick() {
  if (!tut) return;
  const st = tut.steps[tut.i], el = document.querySelector(st.sel), hole = tut.box.querySelector('.hole'), bub = tut.box.querySelector('.bubble');
  const hideNow = !ov.hidden || !ov2.hidden || !el || S.phase !== 'play';
  tut.box.style.display = hideNow ? 'none' : '';
  if (hideNow) return;
  const r = el.getBoundingClientRect(), pad = 6;
  Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
  const vw = innerWidth, vh = innerHeight, bw = Math.min(360, vw - 24);
  bub.style.width = bw + 'px';
  const bh = bub.offsetHeight || 160;
  let top = r.bottom + 14, left = Math.min(Math.max(12, r.left), vw - bw - 12);
  if (top + bh > vh - 8) top = r.top - bh - 14;
  if (top < 8) { top = Math.max(8, vh - bh - 12); left = Math.min(Math.max(12, r.right - bw), vw - bw - 12); }
  if (r.height > vh * 0.55 || vw < 700) { top = vh - bh - 12; left = (vw - bw) / 2; }
  Object.assign(bub.style, { top: top + 'px', left: left + 'px' });
  if (st.done && Date.now() - tut.t0 > 400 && st.done(tut.flags)) { SQAudio.sfx('measure'); tutGo(tut.i + 1); }
}
function endTut(skipped, finished) {
  if (!tut) return;
  clearInterval(tut.timer); tut.box.remove();
  const key = tut.key; tut = null;
  if (key) { S[key] = skipped ? 'skip' : 'done'; save(); }
  if (finished) toast(key === 'tut' ? '튜토리얼 끝! 남은 파란 별도 모아 보세요 🚀' : '이제 증거를 모아 범인을 찾아라! 🔍');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function maybeTut() {
  const m = M();
  if (S.mi === 0 && !S.tut) setTimeout(() => { if (S.phase === 'play' && S.mi === 0) startTut(TUT_BASIC, 'tut'); }, 2300);
  else if (m.target && m.sector === 0 && !S.tut2) setTimeout(() => { if (S.phase === 'play' && M().target) startTut(TUT_MEASURE, 'tut2'); }, 2300);
}
$('help').onclick = () => { if (S.phase !== 'play') { toast('관측 중일 때 튜토리얼을 볼 수 있어요.'); return; } startTut(M().target ? TUT_MEASURE : TUT_BASIC, null); };
$('findme').onclick = () => { Sky.focusMe(); if (tut) tut.flags.findme = true; SQAudio.sfx('pick'); };
$('mapbtn').onclick = () => { const mm = $('mini'); mm.hidden = !mm.hidden; $('mapbtn').setAttribute('aria-pressed', String(!mm.hidden)); try { localStorage.setItem('sq-mini', mm.hidden ? '0' : '1'); } catch (e) {} };
try { if (localStorage.getItem('sq-mini') === '0') { $('mini').hidden = true; $('mapbtn').setAttribute('aria-pressed', 'false'); } } catch (e) {}
Sky.attachMinimap($('mini'));

window.SQGame = { openShip, onDuel: d => onDuel(d), spawnEventStar, startTut: () => startTut(TUT_BASIC, null), endTut: () => endTut(true) };
renderItems(); scheduleEventStar(true); bindChat();
// ---------- boot ----------
if (S.phase === 'play') SQAudio.setMode(1);
render();
if (!S.started) showJoin();
else {
  connectCrew();
  if (S.phase === 'intro') showIntro();
  else if (S.phase === 'quiz') showQuiz();
  else if (S.phase === 'solved') showQuiz();
  else if (S.phase === 'warp') { const w = WARPS.find(w => w.after === S.mi); if (w && !S.warpDone.includes(S.mi)) showWarp(w); else advance(); }
  else if (S.phase === 'memory') { const mg = MEMS.find(x => x.after === S.mi); if (mg && !S.memDone.includes(S.mi)) showMemory(mg); else next(); }
  else if (S.phase === 'end') showEnd();
}
})();
