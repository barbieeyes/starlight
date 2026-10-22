/* 별빛탐정단 — 탐사단 서버 연결 (Supabase)
   실시간 구독 대신 '한 번의 요청으로 방 전체 상태 가져오기'를 3초마다 반복한다.
   무료 플랜 실시간 메시지 한도(초당 100개)에 걸려 끊기는 일을 원천적으로 막기 위한 설계. */
window.SQNet = (() => {
const URL = 'https://uxzhlvulknngihjrddul.supabase.co';
const KEY = 'sb_publishable_OiYlf2nZg0iyGeDhSevJeQ_ZWB7k4wH';
let sb = null;
try { if (window.supabase) sb = window.supabase.createClient(URL, KEY, { auth: { persistSession: false } }); } catch (e) { sb = null; }

function errText(e) {
  const m = (e && (e.message || e.details || '')) + '';
  if (/room/.test(m)) return '방 코드를 찾을 수 없어요. 선생님이 알려 준 4자리 숫자를 다시 확인해 주세요.';
  if (/nickname/.test(m)) return '닉네임을 입력해 주세요.';
  if (/full/.test(m)) return '이 탐사방은 정원(80명)이 찼어요.';
  if (/does not exist|schema cache|Could not find/.test(m)) return '서버 설정이 아직 끝나지 않았어요. 혼자 탐사하기로 시작할 수 있어요.';
  return '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';
}

// 요청마다 8초 제한 시간 (학교 와이파이가 멈춰도 화면이 굳지 않게)
async function rpc(fn, args) {
  if (!sb) throw new Error('offline');
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const { data, error } = await sb.rpc(fn, args).abortSignal(ctrl.signal);
    if (error) throw error;
    return data;
  } finally { clearTimeout(t); }
}

// 진행 상황 전송: 마지막 상태만 보내되, 소식(이벤트)은 하나도 빠뜨리지 않음
let latest = null; const notes = []; let sending = false, retry = null;
async function flush() {
  if (sending || (!latest && !notes.length)) return;
  sending = true;
  try {
    while (latest || notes.length) {
      const note = notes[0] || null, base = latest || note.base;
      await rpc('sq_progress2', { ...base, p_kind: note ? note.kind : null, p_body: note ? note.body : null });
      if (note) notes.shift();
      if (latest === base) latest = null;
    }
  } catch (e) { clearTimeout(retry); retry = setTimeout(flush, 4000); }
  sending = false;
}

// 방 상태 가져오기 (players / 새 events / 내 duels)
function subscribe(code, me, on) {
  if (!sb) { on.status(false); return { stop() {}, fast() {}, now() {} }; }
  let since = 0, chatSince = 0, v2 = true, alive = true, timer = null, fastUntil = 0, fails = 0, busy = false;
  async function tick() {
    if (!alive) return;
    if (document.hidden && Date.now() > fastUntil) { schedule(6000); return; } // 다른 탭을 보고 있으면 천천히
    if (busy) { schedule(1000); return; }
    busy = true;
    try {
      // 채팅까지 한 번에 받기 (서버 패치 전이면 예전 방식)
      let s;
      if (v2) { try { s = await rpc('sq_state2', { p_code: code, p_since: since, p_me: me || null, p_chat_since: chatSince }); } catch (e) { if (/sq_state2|schema cache|Could not find/.test((e && e.message) || '')) v2 = false; else throw e; } }
      if (!v2) s = await rpc('sq_state', { p_code: code, p_since: since, p_me: me || null });
      fails = 0; on.status(true);
      // 화면 갱신 중 오류가 나도 연결 실패로 취급하지 않고, 다음 갱신은 계속되게 따로 감쌈
      try { on.players(s.players || []); } catch (err) { console.error('[players]', err); }
      if (s.events && s.events.length) { since = Math.max(since, ...s.events.map(e => e.id)); try { on.events(s.events); } catch (err) { console.error('[events]', err); } }
      try { if (on.duels) on.duels(s.duels || []); } catch (err) { console.error('[duels]', err); }
      if (v2 && on.chat) { const c = s.chat || []; if (c.length) chatSince = Math.max(chatSince, ...c.map(m => m.id)); try { on.chat(c, { on: s.chat_on !== false, muted: s.muted_until || null }); } catch (err) { console.error('[chat]', err); } }
    } catch (e) { fails++; on.status(false); }
    busy = false;
    schedule(Date.now() < fastUntil ? 1000 : Math.min(8000, 3000 * Math.pow(1.4, Math.min(fails, 3))));
  }
  function schedule(ms) { clearTimeout(timer); if (alive) timer = setTimeout(tick, ms + Math.random() * 400); }
  const vis = () => { if (!document.hidden && alive) { fails = 0; schedule(50); } };
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('online', vis);
  tick();
  return {
    stop() { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', vis); },
    fast(ms) { fastUntil = Math.max(fastUntil, Date.now() + (ms || 30000)); schedule(300); },
    now() { schedule(50); },
  };
}

return {
  available: () => !!sb,
  errText,
  createRoom: title => rpc('sq_create_room', { p_title: title }),
  // 같은 방·같은 이름이면 기록을 이어 받음 (서버 패치 전이면 예전 방식으로 새로 입장)
  join: async (code, nick, team) => { try { return await rpc('sq_join3', { p_code: code, p_nick: nick, p_team: team }); } catch (e) { if (/sq_join3|schema cache|Could not find/.test((e && e.message) || '')) return rpc('sq_join2', { p_code: code, p_nick: nick, p_team: team }); throw e; } },
  chatSend: (net, scope, body) => rpc('sq_chat_send', { p_id: net.id, p_token: net.token, p_scope: scope, p_body: body }),
  chatFeed: (code, admin, since) => rpc('sq_chat_feed', { p_code: code, p_admin: admin, p_since: since || 0 }),
  chatSet: (code, admin, on) => rpc('sq_chat_set', { p_code: code, p_admin: admin, p_on: on }),
  chatHide: (code, admin, id) => rpc('sq_chat_hide', { p_code: code, p_admin: admin, p_msg: id }),
  mute: (code, admin, player, minutes) => rpc('sq_mute', { p_code: code, p_admin: admin, p_player: player, p_minutes: minutes }),
  claimAdmin: (code, pass) => rpc('sq_claim_admin', { p_code: code, p_pass: pass }),
  renameRoom: (code, admin, title) => rpc('sq_rename_room', { p_code: code, p_admin: admin, p_title: title }),
  players: async code => { const s = await rpc('sq_state', { p_code: code, p_since: 2147483647, p_me: null }); return (s && s.players) || []; },
  gift: (net, target) => rpc('sq_gift', { p_id: net.id, p_token: net.token, p_target: target }),
  // 이 방에서 이미 쓰고 있는 팀 번호들 (입장 화면에서 친구가 추가한 팀을 보여 주려고)
  // 이 방의 팀별 인원 { 팀번호: 명 } (입장 화면에서 팀 쏠림을 막고, 친구가 추가한 팀을 보여 주려고)
  roomTeams: async code => { if (!sb) return {}; try { const s = await rpc('sq_state', { p_code: code, p_since: 2147483647, p_me: null }); const c = {}; (s && s.players || []).forEach(p => { c[p.team || 0] = (c[p.team || 0] || 0) + 1; }); return c; } catch (e) { return {}; } },
  roomTitle: async code => { if (!sb) return null; try { const { data } = await sb.from('sq_rooms').select('title').eq('code', code).maybeSingle(); return data ? data.title : null; } catch (e) { return null; } },
  progress(net, s, kind, body) {
    if (!net || !sb) return;
    const base = { p_id: net.id, p_token: net.token, p_mission: s.done, p_sector: s.sector, p_stars: s.stars, p_clusters: s.clusters,
      p_nebulae: s.nebulae, p_galaxies: s.galaxies, p_hits: s.hits, p_bonus: s.bonus || 0, p_finished: !!s.finished };
    latest = base;
    if (kind && body) { if (notes.length > 15) notes.shift(); notes.push({ kind, body, base }); }
    flush();
  },
  // 조준한 천체 알리기 (1.5초에 한 번, 마지막 값만)
  aim: (() => { let next = null, t = null; return (net, sector, id) => {
    if (!net || !sb) return;
    next = { p_id: net.id, p_token: net.token, p_sector: sector, p_aim: id || null };
    if (t) return;
    t = setTimeout(async function go() { const a = next; next = null; try { await rpc('sq_aim', a); } catch (e) {} t = next ? setTimeout(go, 1500) : null; }, 200);
  }; })(),
  shield: net => rpc('sq_shield', { p_id: net.id, p_token: net.token }),
  attack: (net, target) => rpc('sq_attack', { p_id: net.id, p_token: net.token, p_target: target }),
  duelNew: (net, target) => rpc('sq_duel_new', { p_id: net.id, p_token: net.token, p_target: target }),
  duelReply: (net, duel, accept) => rpc('sq_duel_reply', { p_id: net.id, p_token: net.token, p_duel: duel, p_accept: accept }),
  duelSubmit: (net, duel, score, ms) => rpc('sq_duel_submit', { p_id: net.id, p_token: net.token, p_duel: duel, p_score: score, p_ms: ms }),
  removePlayer: (code, admin, id) => rpc('sq_remove_player', { p_code: code, p_admin: admin, p_player: id }),
  resetRoom: (code, admin) => rpc('sq_reset_room', { p_code: code, p_admin: admin }),
  subscribe,
};
})();
