// オンラインランキング（Supabase の REST API を fetch で直接たたく）
//   config.js の online.url と online.key が入っているときだけ使う。入っていなければ enabled = false
//   テーブルと関数の作り方は tools/online/setup.sql
//   ・点数は「プレイヤーごと・モードごとのベスト」だけを残す（同じ人で埋まらないように）
//   ・送るのに失敗したら（電波がないなど）、とっておいて次に送りなおす
const Online = (() => {
  const cfg = (window.GAME_CONFIG && window.GAME_CONFIG.online) || {};
  const enabled = !!(cfg.url && cfg.key);
  const base = enabled ? cfg.url.replace(/\/+$/, '') + '/rest/v1' : '';
  const QUEUE_KEY = 'satapuyo.onlineQueue';

  // タイムで競うモード（ぜんけしアタック）は小さいほうがえらい
  const lowerIsBetter = (mode) => mode.startsWith('ac-');

  function headers(extra) {
    const h = { apikey: cfg.key, 'Content-Type': 'application/json', ...extra };
    // 昔の形式のキー（JWT）は Authorization にも入れる。新しい sb_publishable_ のキーは apikey だけ
    if (!cfg.key.startsWith('sb_')) h.Authorization = 'Bearer ' + cfg.key;
    return h;
  }

  async function req(path, opts = {}) {
    if (!enabled) throw new Error('online disabled');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(base + path, { ...opts, headers: headers(opts.headers), signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  function loadQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveQueue(q) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    } catch {}
  }

  async function send(entry) {
    await req('/rpc/submit_score', {
      method: 'POST',
      body: JSON.stringify({
        p_secret: entry.secret,
        p_public: entry.publicId,
        p_mode: entry.mode,
        p_name: entry.name,
        p_value: entry.value,
        p_chain: entry.chain || 0,
      }),
    });
  }

  // 送る。失敗したら モードごとに いちばん良い記録だけ とっておく
  async function submit(entry) {
    if (!enabled) return false;
    try {
      await send(entry);
      return true;
    } catch {
      const q = loadQueue();
      const old = q[entry.mode];
      const better = !old || (lowerIsBetter(entry.mode) ? entry.value < old.value : entry.value > old.value);
      if (better) q[entry.mode] = entry;
      saveQueue(q);
      return false;
    }
  }

  // とっておいた記録を送りなおす（起動したときなど）
  async function flush() {
    if (!enabled) return;
    const q = loadQueue();
    for (const [mode, entry] of Object.entries(q)) {
      try {
        await send(entry);
        delete q[mode];
      } catch {
        break;
      }
    }
    saveQueue(q);
  }

  // モードの上位（ふつうは100人）
  async function top(mode, limit = 100) {
    const order = lowerIsBetter(mode) ? 'value.asc' : 'value.desc';
    const res = await req(`/scores?select=public_id,name,value,chain,updated_at&mode=eq.${encodeURIComponent(mode)}&order=${order},updated_at.asc&limit=${limit}`);
    return res.json();
  }

  // この記録が何位にあたるか（自分以外で これより良い人の数 + 1）
  async function rankOf(mode, value, publicId) {
    const op = lowerIsBetter(mode) ? 'lt' : 'gt';
    const res = await req(`/scores?select=public_id&mode=eq.${encodeURIComponent(mode)}&value=${op}.${value}&public_id=neq.${publicId}`, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact' },
    });
    const m = /\/(\d+)$/.exec(res.headers.get('content-range') || '');
    return m ? +m[1] + 1 : null;
  }

  // 名前を変えたら、これまでの記録の名前も変える
  async function rename(secret, name) {
    if (!enabled) return false;
    try {
      await req('/rpc/rename_player', { method: 'POST', body: JSON.stringify({ p_secret: secret, p_name: name }) });
      return true;
    } catch {
      return false;
    }
  }

  return { enabled, lowerIsBetter, submit, flush, top, rankOf, rename };
})();
