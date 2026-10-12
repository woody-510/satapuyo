// 効果音とBGM。config.sounds にファイルが指定されていればそれを、なければ内蔵のシンセ音を鳴らす。
const Sound = (() => {
  const cfg = window.GAME_CONFIG.sounds || {};
  let ctx = null, master, seGain, bgmGain, noiseBuf;
  const buffers = {};
  const state = { se: true, bgm: true, volume: 0.8 };
  let bgm = null; // { name, stop() }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = state.volume;
    master.connect(ctx.destination);
    seGain = ctx.createGain();
    seGain.gain.value = 0.9;
    seGain.connect(master);
    bgmGain = ctx.createGain();
    bgmGain.gain.value = 0.45;
    bgmGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const [key, path] of Object.entries(cfg)) {
      if (!path) continue;
      fetch(path)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => {
          buffers[key] = buf;
          if (bgm && bgm.key === key) playBgm(bgm.name, true);
        })
        .catch(() => console.warn('音ファイルを読み込めませんでした:', path));
    }
  }

  // ブラウザは操作があるまで音を出せないので、最初のクリック/キーで起こす
  function unlock() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
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
    if (buffers[name]) {
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

  function playBgm(name, force = false) {
    if (!ctx) return;
    const key = name === 'title' ? 'bgmTitle' : 'bgmGame';
    if (!force && bgm && bgm.name === name) return;
    stopBgm();
    if (!state.bgm) { bgm = { name, key, stop() {} }; return; }
    if (buffers[key]) {
      const s = ctx.createBufferSource();
      s.buffer = buffers[key];
      s.loop = true;
      s.connect(bgmGain);
      s.start();
      bgm = { name, key, stop: () => s.stop() };
    } else {
      bgm = { name, key, stop: startSynthBgm(name) };
    }
  }

  function stopBgm() {
    if (bgm) bgm.stop();
    bgm = null;
  }

  function apply(settings) {
    state.se = settings.se;
    const bgmChanged = state.bgm !== settings.bgm;
    state.bgm = settings.bgm;
    state.volume = settings.volume;
    if (master) master.gain.value = state.volume;
    if (bgmChanged && bgm) playBgm(bgm.name, true);
  }

  return { unlock, play, playBgm, stopBgm, apply };
})();
