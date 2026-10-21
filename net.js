/* 별빛탐정단 — 실시간 탐사단 현황 (Supabase) */
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
  if (/does not exist|schema cache|Could not find/.test(m)) return '실시간 현황판이 아직 준비되지 않았어요. 혼자 탐사하기로 시작할 수 있어요.';
  return '연결이 불안정해요. 잠시 후 다시 시도해 주세요.';
}

async function rpc(fn, args) {
  if (!sb) throw new Error('offline');
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
}

// 진행 상황 전송: 순서대로 보내고, 실패하면 잠시 뒤 다시 시도
const queue = []; let sending = false;
async function flush() {
  if (sending || !queue.length) return;
  sending = true;
  while (queue.length) {
    try { await rpc('sq_progress', queue[0]); queue.shift(); }
    catch (e) { sending = false; setTimeout(flush, 4000); return; }
  }
  sending = false;
}

function subscribe(code, onPlayers, onEvents, onStatus) {
  if (!sb) { onStatus(false); return () => {}; }
  let players = new Map(), events = [], alive = true;
  const pushPlayers = () => onPlayers([...players.values()]);
  async function load() {
    const [p, e] = await Promise.all([
      sb.from('sq_players').select('id,nickname,mission,sector,stars,clusters,nebulae,galaxies,hits,finished,updated_at').eq('room_code', code).eq('hidden', false),
      sb.from('sq_events').select('id,player_id,nickname,kind,body,created_at').eq('room_code', code).eq('hidden', false).order('id', { ascending: false }).limit(30),
    ]);
    if (p.error || e.error) { onStatus(false); return; }
    players = new Map(p.data.map(r => [r.id, r])); events = e.data.reverse();
    pushPlayers(); onEvents(events);
  }
  load();
  const ch = sb.channel('sq-' + code)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sq_players', filter: 'room_code=eq.' + code }, payload => {
      if (payload.eventType === 'DELETE' || payload.new.hidden) { players.delete((payload.new || payload.old).id); load(); } else players.set(payload.new.id, payload.new);
      pushPlayers();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sq_events', filter: 'room_code=eq.' + code }, payload => {
      events.push(payload.new); if (events.length > 40) events.shift(); onEvents(events);
    })
    .subscribe(st => onStatus(st === 'SUBSCRIBED'));
  const poll = setInterval(() => { if (alive) load(); }, 15000); // 실시간 연결이 끊겨도 15초마다 새로고침
  return () => { alive = false; clearInterval(poll); sb.removeChannel(ch); };
}

return {
  available: () => !!sb,
  errText,
  createRoom: title => rpc('sq_create_room', { p_title: title }),
  join: (code, nick) => rpc('sq_join', { p_code: code, p_nick: nick }),
  roomTitle: async code => { if (!sb) return null; const { data } = await sb.from('sq_rooms').select('title').eq('code', code).maybeSingle(); return data ? data.title : null; },
  progress(net, s, kind, body) {
    if (!net || !sb) return;
    if (queue.length > 20) queue.splice(0, queue.length - 20);
    queue.push({ p_id: net.id, p_token: net.token, p_mission: s.done, p_sector: s.sector, p_stars: s.stars, p_clusters: s.clusters,
      p_nebulae: s.nebulae, p_galaxies: s.galaxies, p_hits: s.hits, p_finished: !!s.finished, p_kind: kind || null, p_body: body || null });
    flush();
  },
  removePlayer: (code, admin, id) => rpc('sq_remove_player', { p_code: code, p_admin: admin, p_player: id }),
  resetRoom: (code, admin) => rpc('sq_reset_room', { p_code: code, p_admin: admin }),
  subscribe,
};
})();
