// 効果音とBGM。config.sounds にファイルが指定されていればそれを、なければ内蔵のシンセ音を鳴らす。
const Sound = (() => {
  const cfg = window.GAME_CONFIG.sounds || {};
  let ctx = null, master, seGain, bgmGain, noiseBuf;
  const buffers = {};
  const loads = {};
  const state = { se: true, bgm: true, voice: true, volume: 0.8 };
  const voiceCfg = window.GAME_CONFIG.voices || {};
  const BGM_LEVEL = 0.9;
  let voiceGain = null;
  let voiceNow = null; // { src, end }
  const voiceLoads = {};
  const BGM_KEY = { title: 'bgmTitle', menu: 'bgmMenu', game: 'bgmGame', ending: 'bgmEnding' };
  const XF = 0.03; // ループのつなぎ目を重ねる秒数
  let bgm = null; // { name, key, stop() }
  // config では 'path.mp3' でも { src, loopStart, loopEnd } でもOK
  const srcOf = (v) => (typeof v === 'string' ? v : v && v.src);

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // iPhone のマナーモードでも鳴るように（Safari 16.4 以降）
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {}
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = state.volume;
    master.connect(ctx.destination);
    seGain = ctx.createGain();
    seGain.gain.value = 0.9;
    seGain.connect(master);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = BGM_LEVEL;
    bgmGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // 効果音は先に読んでおく。BGM は鳴らすときに読む
    for (const key of Object.keys(cfg)) if (!key.startsWith('bgm')) load(key);
    voiceGain = ctx.createGain();
    voiceGain.gain.value = 1;
    voiceGain.connect(master);
    Object.keys(voiceCfg).forEach(loadVoice);
    // タブを裏にしたら音を止める（電池にもやさしい）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        ctx.suspend();
        if (keepAlive) keepAlive.pause();
      } else {
        ctx.resume().catch(() => {});
        if (keepAlive) keepAlive.play().catch(() => {});
      }
    });
  }

  // iPhone（Safari、LINE などのアプリ内ブラウザも）はマナーモードだと Web Audio が消音になる。
  // ふつうの <audio> で無音を流しておくと「音楽を再生中」あつかいになって、マナーモードでも鳴る。
  let keepAlive = null;
  function silentWav() {
    const n = 8000; // 8kHz・8bit・1秒の無音
    const b = new DataView(new ArrayBuffer(44 + n));
    const str = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); b.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
    b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
    b.setUint32(24, 8000, true); b.setUint32(28, 8000, true); b.setUint16(32, 1, true); b.setUint16(34, 8, true);
    str(36, 'data'); b.setUint32(40, n, true);
    for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }));
  }

  function load(key) {
    const path = srcOf(cfg[key]);
    if (!path) return Promise.resolve(null);
    if (!loads[key]) {
      loads[key] = fetch(path)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((ab) => new Promise((ok, ng) => ctx.decodeAudioData(ab, ok, ng)))
        .then((buf) => (buffers[key] = buf))
        .catch(() => {
          console.warn('音ファイルを読み込めませんでした:', path);
          return null;
        });
    }
    return loads[key];
  }

  // ブラウザは操作があるまで音を出せない。スマホはタッチの「押した瞬間」では許可されず
  // 「離したとき」に許可されるので、鳴るようになるまで操作のたびに呼ぶ。鳴っていれば true
  function unlock() {
    init();
    if (!ctx) return false;
    if (!keepAlive) {
      keepAlive = new Audio(silentWav());
      keepAlive.loop = true;
      keepAlive.setAttribute('playsinline', '');
    }
    if (keepAlive.paused && !document.hidden) keepAlive.play().catch(() => {});
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
      // 古い iPhone は無音を1回鳴らすと起きる
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start(0);
    }
    return ctx.state === 'running';
  }

  function tone(freq, dur, { type = 'square', vol = 0.15, slide = null, delay = 0, out = null } = {}) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out || seGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, { vol = 0.2, freq = 1200, delay = 0, out = null, at = null } = {}) {
    const t = at ?? ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out || seGain);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  const synth = {
    move: () => tone(520, 0.04, { vol: 0.06 }),
    rotate: () => tone(780, 0.05, { vol: 0.07, slide: 980 }),
    land: () => { tone(160, 0.1, { type: 'sine', vol: 0.3, slide: 70 }); noise(0.06, { vol: 0.12, freq: 400 }); },
    pop: (chain = 1) => {
      const base = 440 * Math.pow(2, Math.min(chain - 1, 12) / 6);
      [0, 4, 7, 12].forEach((n, i) => tone(base * Math.pow(2, n / 12), 0.12, { type: 'triangle', vol: 0.22, delay: i * 0.045 }));
      noise(0.15, { vol: 0.1, freq: 2500 });
    },
    allClear: () => [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(523 * Math.pow(2, n / 12), 0.18, { type: 'triangle', vol: 0.2, delay: i * 0.07 })),
    gameOver: () => [0, -3, -6, -10, -13].forEach((n, i) => tone(392 * Math.pow(2, n / 12), 0.3, { type: 'sawtooth', vol: 0.08, delay: i * 0.18 })),
    select: () => tone(660, 0.04, { vol: 0.06 }),
    decide: () => { tone(880, 0.06, { vol: 0.08 }); tone(1320, 0.1, { vol: 0.08, delay: 0.06 }); },
    count: () => tone(660, 0.12, { type: 'triangle', vol: 0.18 }),
    go: () => tone(1320, 0.3, { type: 'triangle', vol: 0.18 }),
  };

  function play(name, arg) {
    if (!state.se || !ctx) return;
    if (buffers[name] && !name.startsWith('bgm')) {
      const s = ctx.createBufferSource();
      s.buffer = buffers[name];
      s.connect(seGain);
      s.start();
    } else if (synth[name]) {
      synth[name](arg);
    }
  }

  // ---------------- 内蔵BGM（ピコピコ） ----------------
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const hz = (s) => {
    const m = /^([A-G])(#?)(\d)$/.exec(s);
    if (!m) return 0;
    return 440 * Math.pow(2, (NOTE[m[1]] + (m[2] ? 1 : 0) + (+m[3] + 1) * 12 - 69) / 12);
  };
  const seq = (s) => s.trim().split(/\s+/).map((t) => (t === '-' ? 0 : t === '.' ? -1 : hz(t)));
  const bassFor = (roots) => roots.flatMap((r) => [r + '2', r + '3', r + '2', r + '3', r + '2', r + '3', r + '2', r + '3']).join(' ');

  const SONGS = {
    title: {
      bpm: 112,
      lead: seq(`
        C5 . E5 G5 . E5 C5 -   D5 . F5 A5 . F5 D5 -   E5 . G5 C6 . B5 A5 G5   F5 E5 D5 . G4 . . -
        A4 . C5 E5 . D5 C5 -   F4 . A4 C5 . B4 A4 -   G4 . B4 D5 . F5 E5 D5   C5 . . . . . . -`),
      bass: seq(bassFor(['C', 'D', 'A', 'G', 'A', 'F', 'G', 'C'])),
      hat: false,
    },
    game: {
      bpm: 150,
      lead: seq(`
        E5 G5 C6 G5 A5 G5 E5 -   F5 A5 D6 A5 G5 F5 D5 -   E5 G5 C6 G5 A5 C6 B5 A5   G5 - E5 - D5 - C5 -
        A4 C5 E5 A5 G5 E5 C5 -   F4 A4 C5 F5 E5 C5 A4 -   D5 F5 A5 D6 C6 A5 F5 D5   B4 D5 G5 B5 G5 . . -`),
      bass: seq(bassFor(['C', 'D', 'C', 'G', 'A', 'F', 'D', 'G'])),
      hat: true,
    },
  };

  function startSynthBgm(name) {
    const song = SONGS[name];
    const step = 60 / song.bpm / 2;
    let i = 0;
    let next = ctx.currentTime + 0.08;
    const voice = (arr, idx, type, vol) => {
      const f = arr[idx % arr.length];
      if (f <= 0) return;
      let len = 1;
      while (arr[(idx + len) % arr.length] === -1 && len < 8) len++;
      tone(f, step * len * 0.9, { type, vol, out: bgmGain, delay: next - ctx.currentTime });
    };
    const timer = setInterval(() => {
      while (next < ctx.currentTime + 0.15) {
        voice(song.lead, i, 'square', 0.07);
        voice(song.bass, i, 'triangle', 0.16);
        if (song.hat && i % 2 === 1) noise(0.03, { vol: 0.05, freq: 8000, out: bgmGain, at: next });
        next += step;
        i++;
      }
    }, 25);
    return () => clearInterval(timer);
  }

  // hooks: { onStart(秒数 or null), onEnd() } … ループしない曲（エンディング）で使う。
  //   鳴らせなかったとき（BGM OFF・読みこみ失敗）は onStart(null) だけ呼ぶ
  function playBgm(name, force = false, hooks = {}) {
    if (!ctx) {
      if (hooks.onStart) hooks.onStart(null);
      return;
    }
    if (!force && bgm && bgm.name === name) return;
    stopBgm();
    const key = BGM_KEY[name];
    const cur = (bgm = { name, key, dead: false, hooks, stop() { this.dead = true; } });
    const once = typeof cfg[key] === 'object' && cfg[key] && cfg[key].loop === false;
    if (!state.bgm || (once && !srcOf(cfg[key]))) {
      if (hooks.onStart) hooks.onStart(null);
      return;
    }
    if (!srcOf(cfg[key])) {
      cur.stop = startSynthBgm(SONGS[name] ? name : 'title');
      return;
    }
    load(key).then((buf) => {
      if (cur.dead) return;
      if (buf) startBuffer(cur, buf, cfg[key]);
      else if (once) hooks.onStart && hooks.onStart(null);
      else cur.stop = startSynthBgm(SONGS[name] ? name : 'title');
      // ほかの曲も裏で読んでおく（エンディングは大きいので、近づいたときだけ）
      Object.entries(BGM_KEY).forEach(([n, k]) => n !== 'ending' && load(k));
    });
  }

  // 前もって読んでおく（エンディングが近いときなど）
  function preloadBgm(name) {
    if (ctx && BGM_KEY[name]) load(BGM_KEY[name]);
  }

  // ファイルのBGMをループ再生。loopStart/loopEnd があれば、つなぎ目を少し重ねて
  // （mp3 でもプチッといわないように）次の回を予約していく
  function startBuffer(cur, buf, val) {
    const out = ctx.createGain();
    out.connect(bgmGain);
    const t0 = ctx.currentTime + 0.05;
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(1, t0 + 0.6);
    const sources = new Set();
    const hasLoop = typeof val === 'object' && val.loopEnd > 0;
    if (typeof val === 'object' && val.loop === false) {
      // ループしない曲：1回だけ鳴らして、終わったら知らせる
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(out);
      s.start(t0);
      s.onended = () => {
        sources.delete(s);
        if (!cur.dead && cur.hooks.onEnd) cur.hooks.onEnd();
      };
      sources.add(s);
      if (cur.hooks.onStart) cur.hooks.onStart(buf.duration);
    } else if (!hasLoop) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.connect(out);
      s.start(t0);
      sources.add(s);
    } else {
      const ls = val.loopStart || 0;
      const le = Math.min(val.loopEnd, buf.duration - XF);
      let at = t0, first = true;
      const queue = () => {
        if (cur.dead) return;
        const s = ctx.createBufferSource();
        s.buffer = buf;
        const g = ctx.createGain();
        s.connect(g).connect(out);
        const offset = first ? 0 : ls;
        const len = le - offset;
        if (!first) {
          g.gain.setValueAtTime(0, at);
          g.gain.linearRampToValueAtTime(1, at + XF);
        }
        g.gain.setValueAtTime(1, at + len);
        g.gain.linearRampToValueAtTime(0, at + len + XF);
        s.start(at, offset, len + XF);
        s.onended = () => {
          sources.delete(s);
          queue();
        };
        sources.add(s);
        at += len;
        first = false;
      };
      queue();
      queue(); // いつも1回ぶん先まで予約しておく
    }
    cur.stop = () => {
      cur.dead = true;
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.35);
      sources.forEach((s) => {
        s.onended = null;
        try { s.stop(t + 0.4); } catch {}
      });
      setTimeout(() => out.disconnect(), 800);
    };
  }

  function stopBgm() {
    if (bgm) bgm.stop();
    bgm = null;
  }

  // ---------------- ボイス ----------------
  function loadVoice(name) {
    const url = voiceCfg[name];
    if (!url || !ctx) return Promise.resolve(null);
    if (!voiceLoads[name]) {
      voiceLoads[name] = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((ab) => new Promise((ok, ng) => ctx.decodeAudioData(ab, ok, ng)))
        .catch(() => {
          console.warn('ボイスを読み込めませんでした:', url);
          return null;
        });
    }
    return voiceLoads[name];
  }

  const hasVoice = (name) => state.voice && !!voiceCfg[name];
  const voicePlaying = () => !!(ctx && voiceNow && ctx.currentTime < voiceNow.end);

  // 声を鳴らす。前の声は止めて、鳴っている間は BGM を少し下げる
  function playVoice(name) {
    if (!ctx || !hasVoice(name)) return;
    loadVoice(name).then((buf) => {
      if (!buf || !state.voice) return;
      if (voiceNow) {
        try { voiceNow.src.stop(); } catch {}
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(voiceGain);
      const t = ctx.currentTime + 0.01;
      src.start(t);
      voiceNow = { src, end: t + buf.duration };
      const g = bgmGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(BGM_LEVEL * 0.45, t + 0.08);
      g.setValueAtTime(BGM_LEVEL * 0.45, t + buf.duration);
      g.linearRampToValueAtTime(BGM_LEVEL, t + buf.duration + 0.4);
    });
  }

  function apply(settings) {
    state.se = settings.se;
    state.voice = settings.voice !== false;
    const bgmChanged = state.bgm !== settings.bgm;
    state.bgm = settings.bgm;
    state.volume = settings.volume;
    if (master) master.gain.value = state.volume;
    if (bgmChanged && bgm) playBgm(bgm.name, true);
  }

  return { unlock, play, playBgm, preloadBgm, stopBgm, apply, playVoice, hasVoice, voicePlaying };
})();
