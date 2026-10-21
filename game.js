/* 별빛탐정단: 우주 원정 — 게임 진행 */
(() => {
const { MISSIONS, SECTORS, TOOLS, WARPS, STARS, starWrong } = SQ;
const COLORS = { '청색':'#8fb4ff','청백색':'#b6ccff','백색':'#f4f6ff','황백색':'#fff0c4','황색':'#ffd970','주황색':'#ffb062','적색':'#ff7a5c' };
const REWARD_KEY = { '성단':'clusters', '성운':'nebulae', '은하':'galaxies' };
const KEY = 'sq2-state';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmt = n => (n < 0 ? '−' + Math.abs(n).toFixed(1) : n.toFixed(1));
const fmtSh = n => (Math.round(n * 100) % 10 ? n.toFixed(2) : n.toFixed(1)) + '″';

function fresh() { return { started:false, mi:0, phase:'intro', en:MISSIONS[0].energy, sel:null, obs:{}, wrong:0, res:[], stars:0, clusters:0, nebulae:0, galaxies:0, hits:0, done:0, finished:false, net:null, msg:null, warpDone:[] }; }
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
function ensureSector() { const sec = M().sector; if (sec !== curSector) { curSector = sec; Sky.setSector(sec); } }

function pick(id) { if (S.phase !== 'play') return; S.sel = id; S.msg = null; save(); render(); }

// ---------- actions ----------
function toolsFor() { return M().sector === 0 ? M().tools : SEC().tools; }
function measure(tid) {
  const o = objOf(S.sel), t = TOOLS[tid], key = t.key || tid;
  const ob = S.obs[o.id] || (S.obs[o.id] = {});
  if (ob[key]) return;
  if (S.en < t.cost) { S.msg = { bad:true, t:'관측 에너지가 부족해요. 지금까지 모은 단서로 추리해 보세요!' }; render(); return; }
  S.en -= t.cost; ob[key] = true; S.msg = null; save(); render();
}
function accuse() {
  const m = M(), o = objOf(S.sel);
  if (S.sel === m.target) { S.phase = 'quiz'; save(); render(); showQuiz(); return; }
  S.wrong++; S.en = Math.max(0, S.en - 1);
  const tip = m.sector === 0 ? starWrong(S.mi, o, S.obs[o.id] || {}, fmt, fmtSh) : m.wrong;
  S.msg = { bad:true, t:`${o.nm}은(는) 아니야! (에너지 −1) ${tip}` }; save(); render();
}

// ---------- render ----------
function bump(id, cls) { const el = $(id); el.classList.remove('bump', 'lose'); void el.offsetWidth; el.classList.add(cls); }
function render() {
  ensureSector();
  const m = M(), sec = SEC();
  Sky.setSelected(S.sel);
  Sky.setObserved(new Set(Object.keys(S.obs).filter(id => sec.objs.some(o => o.id === id))));
  $('who').innerHTML = S.net ? `탐정 <b>${esc(S.net.nickname)}</b> · 방 ${esc(S.net.code)}` : '혼자 탐사 중';
  $('en').textContent = S.en;
  $('cells').innerHTML = Array.from({ length: m.energy }, (_, i) => `<i class="${i < S.en ? '' : 'off'}"></i>`).join('');
  ['stars', 'clusters', 'nebulae', 'galaxies'].forEach(k => $(k).textContent = S[k]);
  renderRoute(); renderHud(); renderPanel(); renderBook();
}

function renderRoute() {
  let h = '';
  SECTORS.forEach((sec, si) => {
    const ms = MISSIONS.map((m, i) => [m, i]).filter(([m]) => m.sector === si);
    const now = M().sector === si && !S.finished;
    h += `<div class="leg ${now ? 'now' : ''}"><span class="nm">${si + 1}. ${sec.nm}</span><div class="dots">${ms.map(([m, i]) =>
      `<span class="${i < S.done ? 'done' : i === S.mi && !S.finished ? 'cur' : ''}" title="${esc(m.title)}">${i < S.done ? '✓' : m.code}</span>`).join('')}</div></div>`;
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
       <div class="chips">${m.chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>`;
}

function renderPanel() {
  const m = M(), p = $('panel');
  if (S.finished) { p.innerHTML = `<div class="eyebrow">원정 완료</div><p class="empty">모든 미션을 해결했어요! 하늘을 확대해서 성단과 은하를 다시 살펴보세요.</p><button class="go" id="again2">처음부터 다시 탐사</button>`; $('again2').onclick = restart; return; }
  const hint = `<details class="hint2"><summary>관측소장의 힌트</summary><p style="margin:6px 0 0">${esc(m.hint)}</p></details>`;
  if (!S.sel) { p.innerHTML = `<div class="eyebrow">망원경 대기 중</div><p class="empty">하늘에서 천체를 눌러 망원경을 맞추세요. 확대하면 실제 모습과 색이 더 잘 보여요. 장비를 쓸 때마다 관측 에너지가 줄고, 한 번 잰 값은 수첩에 남아요.</p>${hint}`; return; }
  const o = objOf(S.sel), ob = S.obs[o.id] || {};
  const list = (m.sector === 0 ? ['mag', 'spec', 'plx', 'abs'] : SEC().tools).map(tid => {
    const t = TOOLS[tid], key = t.key || tid, on = toolsFor().includes(tid), done = !!ob[key];
    const sub = !on ? (tid === 'abs' ? 'MISSION 03부터' : '고장') : done ? '측정 완료' : `에너지 ${t.cost}`;
    return `<button class="tool ${done ? 'done' : ''}" data-t="${tid}" ${!on || done ? 'disabled' : ''}><span class="t">${t.name}</span><span class="c">${t.what} · ${sub}</span></button>`;
  }).join('');
  const dot = o.kind === 'star' ? (ob.spec ? COLORS[o.c] : '#c9d2e6') : '#c9d2e6';
  p.innerHTML = `<div class="eyebrow">망원경 고정 · ${esc(SEC().nm)}</div>
    <h3><span class="dot" style="color:${dot}"></span>${esc(o.nm)}</h3>
    <div class="row"><button class="linkbtn" id="zoomto">이 천체로 확대해서 보기</button></div>
    <div class="tools">${list}</div>
    <div class="readouts">${o.kind === 'star' ? starReadouts(o, ob) : textReadouts(o, ob)}</div>
    ${S.msg ? `<div class="msg ${S.msg.bad ? 'bad' : ''}" role="status">${esc(S.msg.t)}</div>` : ''}
    <button class="accuse" id="accuse">이 천체가 맞다! ${esc(o.nm)} 지목하기</button>${hint}`;
  p.querySelectorAll('.tool').forEach(b => b.onclick = () => measure(b.dataset.t));
  $('accuse').onclick = accuse; $('zoomto').onclick = () => Sky.focus(o.id);
}

function textReadouts(o, ob) {
  const sec = SEC(); let h = '';
  sec.tools.forEach(tid => { const t = TOOLS[tid], key = t.key || tid; if (ob[key]) h += `<div class="ro"><div class="k">${t.name} · ${t.what}</div><div class="vt">${esc(o.info[key])}</div></div>`; });
  return h || '<p class="empty">장비를 골라 측정해 보세요.</p>';
}
function starReadouts(s, o) {
  let h = ''; const col = COLORS[s.c];
  if (o.mag) {
    const x = 20 + ((s.m + 2) / 10) * 260;
    h += `<div class="ro"><div class="k">광도계 · 겉보기 등급</div><div class="v">${fmt(s.m)} 등급</div>
      <svg viewBox="0 0 300 34" aria-hidden="true"><defs><linearGradient id="mg" x1="0" x2="1"><stop offset="0" stop-color="#fff6d8"/><stop offset="1" stop-color="#1b2645"/></linearGradient></defs>
      <rect x="20" y="8" width="260" height="8" rx="4" fill="url(#mg)"/>
      ${[-2,0,2,4,6,8].map(v => `<text x="${20 + (v + 2) / 10 * 260}" y="31" font-size="9" fill="#8d9bbb" text-anchor="middle">${v < 0 ? '−' + (-v) : v}</text>`).join('')}
      <line x1="${x}" y1="3" x2="${x}" y2="19" stroke="#f3c35a" stroke-width="2.5"/></svg>
      <div class="note">왼쪽(숫자 작음)일수록 지구에서 밝게 보여요.</div></div>`;
  }
  if (o.spec) {
    const peak = 2.898e6 / s.T, px = 20 + Math.min(1, Math.max(0, (peak - 380) / 370)) * 260;
    h += `<div class="ro"><div class="k">분광기 · 색과 표면 온도</div><div class="v" style="color:${col}">${s.c} · 약 ${s.T.toLocaleString()} K</div>
      <svg viewBox="0 0 300 30" aria-hidden="true"><defs><linearGradient id="sp" x1="0" x2="1"><stop offset="0" stop-color="#7a4dff"/><stop offset=".2" stop-color="#3d7bff"/><stop offset=".4" stop-color="#3fd28a"/><stop offset=".6" stop-color="#f4e04d"/><stop offset=".8" stop-color="#ff9a3c"/><stop offset="1" stop-color="#e2342b"/></linearGradient></defs>
      <rect x="20" y="6" width="260" height="12" rx="3" fill="url(#sp)"/><line x1="${px}" y1="2" x2="${px}" y2="22" stroke="#fff" stroke-width="2.5"/>
      <text x="20" y="29" font-size="8.5" fill="#8d9bbb">뜨거움</text><text x="280" y="29" font-size="8.5" fill="#8d9bbb" text-anchor="end">차가움</text></svg>
      <div class="note">흰 선은 가장 세게 내는 빛의 위치예요. 왼쪽(파랑)일수록 표면 온도가 높아요.</div></div>`;
  }
  if (o.plx) {
    const amp = Math.min(34, 6 + s.sh * 28);
    h += `<div class="ro"><div class="k">시차 관측 · 1월과 7월 사진 비교</div><div class="v">최대 위치 변화 ${fmtSh(s.sh)}</div>
      <svg viewBox="0 0 300 70" aria-hidden="true"><rect width="300" height="70" rx="6" fill="#050a17"/>
      <circle cx="40" cy="18" r="1.6" fill="#9fb0d6"/><circle cx="250" cy="50" r="1.6" fill="#9fb0d6"/><circle cx="200" cy="14" r="1.4" fill="#9fb0d6"/><circle cx="90" cy="56" r="1.3" fill="#9fb0d6"/>
      <circle cx="${150 - amp}" cy="36" r="5" fill="${col}" opacity=".35"/><circle cx="${150 + amp}" cy="36" r="5" fill="${col}">
      <animate attributeName="cx" values="${150 - amp};${150 + amp};${150 - amp}" dur="2.4s" repeatCount="indefinite"/></circle>
      <text x="${150 - amp}" y="62" font-size="9" fill="#8d9bbb" text-anchor="middle">1월</text><text x="${150 + amp}" y="62" font-size="9" fill="#8d9bbb" text-anchor="middle">7월</text></svg>
      <div class="note">연주시차는 이 값의 ½이에요. 직접 계산해서 거리를 구해 보세요.</div></div>`;
  }
  if (o.abs) {
    const rr = m => Math.max(1.8, (7.6 - m) * 1.15 + 1.2);
    h += `<div class="ro"><div class="k">10pc 시뮬레이터 · 10 pc로 옮겼을 때</div><div class="v">절대 등급 ${fmt(s.M)}</div>
      <svg viewBox="0 0 300 60" aria-hidden="true"><rect width="300" height="60" rx="6" fill="#050a17"/>
      <circle cx="70" cy="28" r="${rr(s.m) * 1.4}" fill="${col}" opacity=".9"/><text x="70" y="55" font-size="9" fill="#8d9bbb" text-anchor="middle">지금 보이는 밝기</text>
      <path d="M118 28 h60" stroke="#79d3e8" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M178 24 l7 4 l-7 4 z" fill="#79d3e8"/>
      <circle cx="230" cy="28" r="${rr(s.M) * 1.4}" fill="${col}"/><text x="230" y="55" font-size="9" fill="#8d9bbb" text-anchor="middle">10 pc에 놓으면</text></svg>
      <div class="note">${s.M < s.m ? '10 pc로 가져오면 더 밝아져요 → 10 pc보다 멀리 있어요.' : s.M > s.m ? '10 pc로 보내면 더 어두워져요 → 10 pc보다 가까이 있어요.' : '밝기가 변하지 않아요 → 이미 10 pc에 있어요.'}</div></div>`;
  }
  return h || '<p class="empty">장비를 골라 측정해 보세요.</p>';
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
  const sec = SEC();
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
  open(`<div class="eyebrow">STARLIGHT DETECTIVES · 별과 우주</div><h2>별빛탐정단: 우주 원정</h2>
    <p>어느 밤, 우주 관측소의 지도에서 별과 성단, 성운, 은하가 하나둘 사라졌다. 탐정단은 태양 이웃에서 출발해 점점 먼 우주로 나아가며 사라진 천체를 찾아야 한다. 단, 구역 사이 소행성대에서 부딪히면 모은 별을 잃는다!</p>
    <div class="row" style="align-items:flex-end">
      <div class="field"><label for="jcode">방 코드 (4자리)</label><input class="code" id="jcode" inputmode="numeric" maxlength="4" autocomplete="off" value="${preset}"></div>
      <div class="field" style="flex:1;min-width:160px"><label for="jnick">닉네임 (12자까지)</label><input id="jnick" maxlength="12" autocomplete="off" placeholder="예: 3반 별사냥꾼"></div>
    </div>
    <div class="err" id="jerr" role="alert"></div>
    <div class="row"><button class="go" id="jgo">탐사선 탑승</button><button class="ghost" id="jsolo">혼자 탐사하기</button></div>
    <p class="muted" style="font-size:13px">선생님이신가요? <a href="board.html?new=1" style="color:var(--cyan)">탐사방 만들기 · 현황판</a></p>`);
  if (preset) $('jnick').focus();
  const go = async () => {
    const code = $('jcode').value.replace(/\D/g, ''), nick = $('jnick').value.trim();
    if (code.length !== 4) { $('jerr').textContent = '4자리 방 코드를 입력해 주세요.'; return; }
    if (!nick) { $('jerr').textContent = '닉네임을 입력해 주세요.'; return; }
    $('jgo').disabled = true; $('jerr').textContent = '';
    try { const r = await SQNet.join(code, nick); S.net = { id:r.id, token:r.token, nickname:r.nickname, code }; startGame(); }
    catch (e) { $('jerr').textContent = SQNet.errText(e); $('jgo').disabled = false; }
  };
  $('jgo').onclick = go; $('jnick').onkeydown = e => { if (e.key === 'Enter') go(); };
  $('jsolo').onclick = () => { S.net = null; startGame(); };
}
function startGame() { S.started = true; S.phase = 'intro'; save(); connectCrew(); render(); showIntro(); }

function showIntro() {
  const m = M(), sec = SEC(), first = MISSIONS.findIndex(x => x.sector === m.sector) === S.mi;
  open(`<div class="eyebrow">${first ? `SECTOR ${m.sector + 1} · ${sec.en}` : `MISSION ${m.code} / ${MISSIONS.length}`}</div>
    <h2>${first ? esc(sec.nm) + ' 도착' : esc(m.title)}</h2>
    ${first ? `<p class="muted">${esc(sec.story)}</p><div class="eyebrow" style="color:var(--amber)">MISSION ${m.code} · ${esc(m.title)}</div>` : ''}
    <div class="chief">${avatar}<div><div class="who">관측소장</div><p>${esc(m.intro)}</p></div></div>
    <p class="target">찾아야 할 천체: <b>${esc(m.goal)}</b><br><span style="font-size:13px;color:var(--muted)">관측 에너지 ${m.energy} · 장비: ${toolsFor().map(t => TOOLS[t].name).join(', ')}${m.reward ? ` · 성공하면 ${m.reward} 획득` : ''}</span></p>
    <button class="go" id="start">관측 시작</button>`);
  $('start').onclick = () => { S.phase = 'play'; save(); close(); render(); $('sky').focus({ preventScroll: true }); };
}

function showQuiz() {
  const m = M(), z = m.quiz, o = objOf(m.target);
  open(`<div class="eyebrow">MISSION ${m.code} · 발견!</div><h2>${esc(o.nm)}을(를) 찾았다!</h2><p>${esc(m.ok)}</p>
    <div class="explain"><b>증명 질문</b><br>${esc(z.q)}</div>
    <div class="opts">${z.opts.map((t, i) => `<button class="opt" data-i="${i}">${esc(t)}</button>`).join('')}</div><div id="qfb"></div>`);
  let tries = 0;
  card.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    tries++;
    if (+b.dataset.i !== z.a) { b.classList.add('wrong'); b.disabled = true; $('qfb').innerHTML = '<div class="msg bad">다시 생각해 봐! 수첩에 적힌 값을 떠올려 보자.</div>'; return; }
    b.classList.add('right'); card.querySelectorAll('.opt').forEach(x => x.disabled = true);
    const got = Math.max(1, 3 - S.wrong - (tries > 1 ? 1 : 0));
    S.res[S.mi] = got; S.stars += got; S.done = S.mi + 1;
    let rewardTxt = '';
    if (m.reward) { S[REWARD_KEY[m.reward]]++; rewardTxt = ` · ${m.reward} '${o.nm}' 획득`; }
    if (S.mi === MISSIONS.length - 1) S.finished = true;
    S.phase = 'solved'; save(); render();
    bump('m-stars', 'bump'); if (m.reward) bump('m-' + REWARD_KEY[m.reward], 'bump');
    sync('solve', `MISSION ${m.code} 해결 ★${got}${rewardTxt}`);
    $('qfb').innerHTML = `<div class="explain">${esc(z.ex)}</div>
      <div class="row" style="margin-top:10px"><span class="stars3">${'★'.repeat(got)}<span class="off">${'★'.repeat(3 - got)}</span></span>
      ${m.reward ? `<span class="chip" style="font-size:13px">+ ${m.reward} 1</span>` : ''}</div>
      <button class="go" id="next" style="margin-top:12px">${S.finished ? '원정 보고서 보기' : WARPS.some(w => w.after === S.mi) ? '워프 준비!' : '다음 미션으로'}</button>`;
    $('next').onclick = next; $('next').focus();
  });
}

function next() {
  if (S.finished) { S.phase = 'end'; save(); showEnd(); return; }
  const w = WARPS.find(w => w.after === S.mi);
  if (w && !S.warpDone.includes(S.mi)) { S.phase = 'warp'; save(); showWarp(w); return; }
  advance();
}
function advance() { S.mi++; S.en = M().energy; S.wrong = 0; S.sel = null; S.msg = null; S.phase = 'intro'; save(); render(); showIntro(); }

function showEnd() {
  const tot = S.res.reduce((a, b) => a + (b || 0), 0);
  const rank = S.stars >= 32 ? '수석 우주 탐정' : S.stars >= 26 ? '정예 우주 탐정' : S.stars >= 18 ? '우주 탐정' : '견습 탐정';
  open(`<div class="eyebrow">EXPEDITION COMPLETE</div><h2>우주 원정 완료!</h2>
    <div class="chief">${avatar}<div><div class="who">관측소장</div><p>태양 이웃의 별에서 시작해 성단, 성운, 그리고 외부 은하까지 다녀왔구나. 별의 밝기는 거리 때문에 속기 쉽고, 우주의 천체는 모양과 빛으로 정체를 드러내지. 훌륭한 탐정이야!</p></div></div>
    <div class="rep">
      <div><span>획득한 별 (미션 ${tot}개 − 소행성 충돌 ${S.hits}회)</span><b style="color:var(--amber)">${S.stars}</b></div>
      <div><span>성단 · 성운 · 은하</span><b>${S.clusters} · ${S.nebulae} · ${S.galaxies}</b></div>
      <div><span>탐정 등급</span><b style="color:var(--amber)">${rank}</b></div>
    </div>
    <div class="row"><button class="go" id="stay">하늘 둘러보기</button><button class="ghost" id="again">처음부터 다시 탐사</button></div>`);
  $('stay').onclick = () => { close(); render(); }; $('again').onclick = restart;
}
function restart() { const net = S.net; S = fresh(); S.net = net; S.started = true; save(); sync('join', '처음부터 다시 출발했습니다'); render(); showIntro(); }

// ---------- 소행성대 워프 ----------
function showWarp(w) {
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
        if (!k.hit && inv <= 0 && Math.hypot(dx, dy) < k.r * 0.85 + 0.035) { k.hit = true; hits++; inv = 1.2; shake = 0.35;
          S.hits++; if (S.stars > 0) S.stars--; save(); $('wh').textContent = hits; $('ws').textContent = S.stars; bump('m-stars', 'lose'); $('stars').textContent = S.stars; sync(); } });
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
  $('wgo').onclick = () => { $('wgo').disabled = true; $('wgo').textContent = '워프 중…'; running = true; last = performance.now(); cv.focus(); };
  raf = requestAnimationFrame(loop);
}

// ---------- 탐사단 현황 ----------
let stopCrew = null, crewPlayers = [];
function connectCrew() {
  if (stopCrew) stopCrew();
  if (!S.net) { $('crew').innerHTML = '<p class="empty">혼자 탐사 중이에요. 방 코드로 참가하면 친구들의 탐사 현황이 실시간으로 보여요.</p>'; $('feed').innerHTML = ''; $('live').className = 'live off'; $('live').textContent = 'SOLO'; return; }
  $('crew').innerHTML = '<p class="empty">현황을 불러오는 중…</p>';
  stopCrew = SQNet.subscribe(S.net.code, ps => { crewPlayers = ps; renderCrew(); }, renderFeed,
    ok => { $('live').className = 'live' + (ok ? '' : ' off'); $('live').textContent = ok ? 'LIVE' : 'OFFLINE'; });
}
function sortCrew(ps) { return [...ps].sort((a, b) => b.mission - a.mission || b.stars - a.stars || new Date(a.updated_at) - new Date(b.updated_at)); }
function renderCrew() {
  const list = sortCrew(crewPlayers), meIdx = list.findIndex(p => p.id === S.net.id);
  let show = list.slice(0, 8); if (meIdx >= 8) show = show.concat([list[meIdx]]);
  $('crew').innerHTML = `<ol class="rank">${show.map(p => { const i = list.indexOf(p);
    return `<li class="${p.id === S.net.id ? 'me' : ''}"><span class="pos">${i + 1}</span><div style="min-width:0"><div class="nm">${esc(p.nickname)}${p.finished ? ' 🏁' : ''}</div><div class="bar"><i style="width:${p.mission / MISSIONS.length * 100}%"></i></div></div>
      <span class="got"><b>★${p.stars}</b> · ${p.clusters}·${p.nebulae}·${p.galaxies}</span></li>`; }).join('')}</ol>
    <p class="muted" style="font-size:12px;margin:8px 0 0">${list.length}명 탐사 중 · 숫자는 별 · 성단·성운·은하 · <a href="board.html?code=${esc(S.net.code)}" target="_blank" rel="noopener" style="color:var(--cyan)">전체 현황판 크게 보기</a></p>`;
}
function renderFeed(ev) {
  $('feed').innerHTML = ev.slice(-8).reverse().map(e => `<li class="${e.kind}"><b>${esc(e.nickname)}</b> <span>${esc(e.body)}</span></li>`).join('');
}

// ---------- boot ----------
render();
if (!S.started) showJoin();
else {
  connectCrew();
  if (S.phase === 'intro') showIntro();
  else if (S.phase === 'quiz') showQuiz();
  else if (S.phase === 'solved') next();
  else if (S.phase === 'warp') { const w = WARPS.find(w => w.after === S.mi); if (w && !S.warpDone.includes(S.mi)) showWarp(w); else advance(); }
  else if (S.phase === 'end') showEnd();
}
})();
