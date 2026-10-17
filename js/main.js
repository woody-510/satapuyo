// 画面遷移・メニュー・入力・保存まわり
(() => {
  const CFG = window.GAME_CONFIG;
  const VS = CFG.versus || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---------------- 保存 ----------------
  const store = {
    get(key, def) {
      try {
        const v = localStorage.getItem('satapuyo.' + key);
        return v ? JSON.parse(v) : def;
      } catch {
        return def;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem('satapuyo.' + key, JSON.stringify(val));
      } catch {}
    },
  };
  const settings = Object.assign(
    { colors: 4, speed: 'normal', ghost: true, se: true, bgm: true, voice: true, volume: 90, disabled: [] },
    store.get('settings', {}),
  );
  // ぜんけしアタックは「ac-pre-4」（はいち あり・4しゅるい）のようなキーで、タイムが短い順
  const ranking = Object.assign({ endless: [], time: [] }, store.get('ranking', {}));
  const listOf = (key) => ranking[key] || (ranking[key] = []);
  const acKey = (preset, n) => `ac-${preset ? 'pre' : 'none'}-${n}`;
  const stats = Object.assign({ pops: {} }, store.get('stats', {}));
  // CPU たいせんの きろく（強さごとの連勝数）
  const versusRec = store.get('versus', {});
  const recOf = (lv) => versusRec[lv] || (versusRec[lv] = { streak: 0, best: 0, win: 0, lose: 0 });
  const LEVELS = ['weak', 'normal', 'strong'];
  const LEVEL_NAME = { weak: 'よわい', normal: 'ふつう', strong: 'つよい' };
  function cpuProfile(lv) {
    const p = (VS.cpu && VS.cpu[lv]) || {};
    const f = CFG.faces[(p.face || 1) - 1] || CFG.faces[0];
    return { name: p.name || 'さたろう', src: f.src };
  }
  const saveSettings = () => {
    store.set('settings', settings);
    Sound.apply({ se: settings.se, bgm: settings.bgm, voice: settings.voice, volume: settings.volume / 100 });
  };
  Sound.apply({ se: settings.se, bgm: settings.bgm, voice: settings.voice, volume: settings.volume / 100 });

  // ---------------- 画像 ----------------
  const faceImgs = CFG.faces.map((f) => {
    const img = new Image();
    img.src = f.src;
    return img;
  });
  const loaded = (img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; }));

  document.title = CFG.title;
  $$('img.logo').forEach((img) => {
    img.alt = CFG.title;
    img.onerror = () => {
      const h = document.createElement('h1');
      h.className = img.className + ' logo-text';
      h.textContent = CFG.title;
      img.replaceWith(h);
    };
    img.src = CFG.images.logo;
  });
  $('#field-wrap').style.backgroundImage = `url("${CFG.images.fieldBg}")`;
  $('#ta-seconds').textContent = CFG.timeAttackSeconds;

  // ---------------- 背景（ゆっくり動いて切りかわる） ----------------
  const Bg = (() => {
    const layers = $$('.bg-layer');
    const cache = {};
    let front = 0, timer = null, current = null, list = [], idx = 0;
    const sec = CFG.backgroundSeconds || 12;
    function showImage(src) {
      const img = cache[src] || (cache[src] = Object.assign(new Image(), { src }));
      loaded(img).then(() => {
        if (!img.naturalWidth) return;
        const next = layers[1 - front];
        next.style.backgroundImage = `url("${src}")`;
        next.className = 'bg-layer';
        void next.offsetWidth; // アニメーションを最初から
        next.style.animationDuration = sec + 3 + 's';
        next.className = 'bg-layer show kb' + Math.floor(Math.random() * 4);
        layers[front].classList.remove('show');
        front = 1 - front;
      });
    }
    function set(name) {
      if (name === current) return;
      current = name;
      list = (CFG.backgrounds && CFG.backgrounds[name]) || [];
      clearInterval(timer);
      if (!list.length) return;
      idx = Math.floor(Math.random() * list.length);
      showImage(list[idx]);
      if (list.length > 1) {
        timer = setInterval(() => {
          idx = (idx + 1) % list.length;
          showImage(list[idx]);
        }, sec * 1000);
      }
    }
    const bubbles = $('#bg-bubbles');
    for (let i = 0; i < 12; i++) {
      const s = document.createElement('span');
      const size = 20 + Math.random() * 70;
      s.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;` +
        `--c:${CFG.ringColors[i % CFG.ringColors.length]};--dx:${(Math.random() - 0.5) * 120}px;` +
        `animation-duration:${14 + Math.random() * 14}s;animation-delay:${-Math.random() * 28}s`;
      bubbles.appendChild(s);
    }
    return { set };
  })();

  // ---------------- 画面の拡大を止める ----------------
  // iPhone は user-scalable=no を無視して、ピンチやダブルタップで拡大してしまうので
  ['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    // ボタン以外のところを すばやく2回タップしたとき
    if (e.timeStamp - lastTap < 350 && !e.target.closest('button, input, select, textarea, a, label')) e.preventDefault();
    lastTap = e.timeStamp;
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // ---------------- 画面切りかえ ----------------
  let screen = null;
  let audioReady = false;
  // 画面ごとの曲：タイトルはテーマソング、ゲーム中は激しめ、それ以外は落ちついた曲
  // エンディングは自分で曲を鳴らすので null
  const bgmFor = (name) => (name === 'title' ? 'title' : name === 'game' ? 'game' : name === 'ending' ? null : 'menu');

  function show(name) {
    screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    document.body.dataset.screen = name;
    Bg.set(name === 'game' || name === 'result' ? 'game' : name === 'title' ? 'title' : 'menu');
    if (name === 'menu') refreshMenu();
    if (name === 'ranking') renderRanking();
    if (name === 'gallery') renderGallery();
    if (name === 'settings') renderSettings();
    if (name === 'credits') renderCredits();
    if (name === 'title') renderTitleFaces();
    if (name === 'allclear') renderAllclearSelect();
    if (name === 'versus') renderVersusSelect();
    if (audioReady && bgmFor(name)) Sound.playBgm(bgmFor(name));
    if (name !== 'game') stopLoop();
    focusFirst();
  }

  function focusFirst() {
    const root = $('.screen.active');
    if (!root) return;
    const el = root.querySelector('[autofocus], .start-btn, .menu-btn, button');
    if (el) el.focus({ preventScroll: true });
  }

  // タップ・クリック・キーのたびに音を起こしにいく（スマホは電話などで音が止まることもあるので、ずっと見張る）
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  function unlockAudio() {
    Sound.unlock();
    if (!audioReady) {
      audioReady = true;
      if (bgmFor(screen)) Sound.playBgm(bgmFor(screen));
    }
  }
  GESTURES.forEach((ev) => window.addEventListener(ev, unlockAudio, true));

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      Sound.play('decide');
      show(go.dataset.go);
      return;
    }
    const mode = e.target.closest('[data-mode]');
    if (mode) {
      Sound.play('decide');
      const d = mode.dataset;
      const opts = d.mode === 'allclear' ? { preset: d.preset === '1', n: settings.colors } : d.mode === 'versus' ? { level: d.level } : {};
      startGame(d.mode, opts);
    }
  });

  // タイトル
  function renderTitleFaces() {
    const box = $('#title-faces');
    box.textContent = '';
    const picks = shuffle(CFG.faces.map((_, i) => i)).slice(0, 5);
    picks.forEach((fi, i) => {
      const img = document.createElement('img');
      img.className = 'face-chip';
      img.src = CFG.faces[fi].src;
      img.alt = '';
      img.style.setProperty('--ring', CFG.ringColors[i % CFG.ringColors.length]);
      img.style.animationDelay = i * 0.12 + 's';
      box.appendChild(img);
    });
  }
  // 最初の「タップしてはじめる」：ブラウザは操作があるまで音を出せないので、ここで音を起こす
  const splash = $('#splash');
  function closeSplash() {
    if (!splash.isConnected) return;
    unlockAudio();
    splash.classList.add('closing');
    setTimeout(() => splash.remove(), 400);
    focusFirst();
  }
  splash.addEventListener('click', closeSplash);
  window.addEventListener('keydown', (e) => {
    if (!splash.isConnected || splash.classList.contains('closing')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeSplash();
  }, true);

  $('#screen-title').addEventListener('click', () => {
    if (screen !== 'title') return;
    unlockAudio();
    Sound.play('decide');
    show('menu');
  });

  // メニュー
  function refreshMenu() {
    $('#best-endless').textContent = (ranking.endless[0]?.score || 0).toLocaleString();
    $('#best-time').textContent = (ranking.time[0]?.score || 0).toLocaleString();
    $('#best-versus').textContent = Math.max(0, ...LEVELS.map((lv) => versusRec[lv]?.best || 0));
    $('#btn-ending').hidden = !store.get('endingUnlocked', false);
  }

  // ぜんけしアタックの えらぶ画面
  function renderAllclearSelect() {
    renderSettings();
    for (const [id, preset] of [['#best-ac-pre', true], ['#best-ac-none', false]]) {
      const best = listOf(acKey(preset, settings.colors))[0];
      $(id).textContent = best ? fmtClock(best.time) : '--';
    }
  }

  // CPU たいせんの えらぶ画面
  function renderVersusSelect() {
    $$('.vs-btn').forEach((b) => {
      const lv = b.dataset.level, rec = recOf(lv), prof = cpuProfile(lv);
      $('.vs-face', b).src = prof.src;
      $('.menu-title', b).textContent = `${LEVEL_NAME[lv]} ${prof.name}`;
      $('.vs-rec', b).textContent = `${rec.streak}れんしょう中 / さいこう ${rec.best}`;
    });
  }

  // ---------------- エンディング ----------------
  const logoImg = Object.assign(new Image(), { src: CFG.images.logo });
  function playEnding(onDone) {
    show('ending');
    Ending.play({ canvas: $('#ending-canvas'), faces: faceImgs, logo: logoImg, onDone });
  }
  $('#btn-ending').addEventListener('click', () => {
    Sound.play('decide');
    playEnding(() => show('menu'));
  });
  $('#btn-ending-skip').addEventListener('click', () => Ending.stop());

  // ---------------- ゲーム ----------------
  const canvas = $('#field');
  const nextCanvas = $('#next');
  const fx = $('#fx-layer');
  const oppCanvas = $('#opp-field');
  const oppFx = $('#opp-fx');
  const oppBox = $('#opp-box');
  const gameScreen = $('#screen-game');
  const gameLayout = $('#game-layout');
  const side = $('#side');
  let game = null; // 自分の盤面
  let cpuGame = null; // 対戦相手の盤面
  let vs = null; // 対戦の進行
  let autoLevel = null, autoPlayer = null; // デバッグ用：自分の盤面もCPUに打たせる
  let lastMode = 'endless', lastOpts = {};
  let rafId = 0, lastT = 0;
  const hud = {};

  // ぜんけしアタックの「はいち あり」：プリセットから1つ選んで、色の割り当てと左右をランダムに
  function pickPreset(n) {
    const list = (window.ALLCLEAR_PRESETS || {})[n] || [];
    if (!list.length) return null;
    const { rows } = list[rnd(list.length)];
    const perm = shuffle([...Array(n).keys()]);
    const flip = Math.random() < 0.5;
    const grid = Array.from({ length: 13 }, () => Array(6).fill(-1));
    const top = 13 - rows.length;
    rows.forEach((row, i) => [...row].forEach((ch, x) => {
      if (ch !== '.') grid[top + i][flip ? 5 - x : x] = perm[ch.charCodeAt(0) - 65];
    }));
    return grid;
  }

  // 対戦のとちゅうで やめたら まけ
  function abandonVersus() {
    if (vs && vs.started && !vs.result) recordVersus(vs.level, 'lose');
    vs = null;
    cpuGame = null;
  }

  async function startGame(mode, opts = {}) {
    abandonVersus();
    lastMode = mode;
    lastOpts = opts;
    unlockAudio();
    await Promise.all(faceImgs.map(loaded));
    const n = mode === 'versus' ? VS.colors || 4 : mode === 'allclear' ? opts.n : settings.colors;
    const usable = CFG.faces.map((_, i) => i).filter((i) => faceImgs[i].naturalWidth);
    let pool = usable.filter((i) => !settings.disabled.includes(CFG.faces[i].src));
    if (pool.length < n) pool = pool.concat(shuffle(usable.filter((i) => !pool.includes(i))).slice(0, n - pool.length));
    const chosen = shuffle(pool).slice(0, n);
    while (chosen.length < n) chosen.push(-1);
    // おじゃまぷよは、今回つかわれなかった さたろうから1人（白黒にする）
    const rest = usable.filter((i) => !chosen.includes(i));
    const gi = rest.length ? rest[rnd(rest.length)] : usable[rnd(usable.length)];
    const garbageFace = gi >= 0 ? faceImgs[gi] : null;

    $('#pause-modal').hidden = true;
    fx.textContent = '';
    oppFx.textContent = '';
    gameScreen.dataset.playing = mode; // data-mode だとメニューのボタンと見分けがつかないので別の名前
    $$('[data-modes]', gameScreen).forEach((el) => (el.hidden = !el.dataset.modes.split(' ').includes(mode)));
    if (garbageFace) gameScreen.style.setProperty('--oj-img', `url("${garbageFace.src}")`);
    show('game');
    document.activeElement?.blur();

    const base = {
      faces: chosen.map((i) => (i >= 0 ? faceImgs[i] : null)),
      colors: CFG.ringColors.slice(0, n),
      faceIds: chosen.map((i) => (i >= 0 ? CFG.faces[i].src : null)),
      mode,
      speed: settings.speed,
      garbageFace,
    };
    const v = mode === 'versus' ? new Versus({ n, level: opts.level, cfg: VS }) : null;
    let me = null, opp = null;
    if (v) {
      opp = new PuyoGame({
        ...base,
        canvas: oppCanvas,
        nextCanvas: null,
        ghost: false,
        quiet: true,
        pairSource: (i) => v.pair(i),
        callbacks: {
          banner: (text, kind) => banner(text, kind, oppFx),
          chain: (c, src, pos) => chainFx(c, src, pos, oppFx, opp.cs, false),
          end() {},
          link: (gain) => v.link(opp, gain),
          chainDone: (c, cleared) => v.chainDone(opp, c, cleared),
          over: (reason) => v.over(opp, reason),
        },
      });
      const prof = cpuProfile(opts.level);
      $('#opp-face').src = prof.src;
      $('#opp-name').textContent = prof.name;
      $('#opp-level').textContent = LEVEL_NAME[opts.level];
      $('#hud-streak').textContent = recOf(opts.level).streak;
    }
    if (mode === 'allclear' && opts.preset && !opts.grid) opts.grid = pickPreset(n); // リトライは同じ配置で
    me = new PuyoGame({
      ...base,
      canvas,
      nextCanvas,
      ghost: settings.ghost,
      initialGrid: mode === 'allclear' && opts.preset ? opts.grid : null,
      pairSource: v ? (i) => v.pair(i) : null,
      callbacks: {
        banner,
        chain: (c, src, pos) => chainFx(c, src, pos),
        end: finishGame,
        // 連鎖が終わったら「again」、ゲームが終わったら「are you」
        chainEnd: (c) => c >= (CFG.voiceChainMin || 2) && Sound.playVoice('chain'),
        over: (reason) => {
          Sound.playVoice('end');
          if (v) v.over(me, reason);
        },
        link: v ? (gain) => v.link(me, gain) : null,
        chainDone: v ? (c, cleared) => v.chainDone(me, c, cleared) : null,
      },
    });
    if (v) v.attach(me, opp);
    game = me;
    cpuGame = opp;
    vs = v;
    autoPlayer = autoLevel ? new CpuPlayer(me, autoLevel, opp) : null;
    Sound.playVoice('start'); // ゲーム開始の「my f」
    cutinTimer = nextCutin();
    Object.assign(hud, { score: -1, shown: 0, chain: -1, max: -1, time: '', level: -1, warn: null, left: -1 });
    $('#hud-time-label').textContent = mode === 'time' ? 'のこり' : 'TIME';
    for (const el of [$('#ojama-me'), $('#ojama-cpu')]) {
      el.textContent = '';
      el.dataset.n = '0';
    }
    layout();
    startLoop();
  }

  function startLoop() {
    cancelAnimationFrame(rafId);
    lastT = performance.now();
    const loop = (t) => {
      rafId = requestAnimationFrame(loop);
      const dt = (t - lastT) / 1000;
      lastT = t;
      if (!game) return;
      if (autoPlayer) autoPlayer.update(dt);
      if (vs) vs.update(dt);
      else game.update(dt);
      if (!game) return; // 終わってリザルトへ行った
      game.render();
      if (cpuGame) cpuGame.render();
      updateHud();
      tickCutin(dt);
      // エンディングが近づいたら、曲を前もって読んでおく
      const min = CFG.ending && CFG.ending.minScore;
      if (min && !endingPreloaded && game.mode === 'endless' && game.score >= min * 0.7) {
        endingPreloaded = true;
        Sound.preloadBgm('ending');
      }
    };
    rafId = requestAnimationFrame(loop);
  }

  // ゲーム中にたまに「with y」のカットイン（ほかの声とは重ねない）
  let cutinTimer = 0;
  let endingPreloaded = false;
  function nextCutin() {
    const [a, b] = CFG.voiceCutinSeconds || [25, 50];
    return a + Math.random() * (b - a);
  }
  function tickCutin(dt) {
    if (!Sound.hasVoice('cutin') || game.paused || game.done || game.phase === 'ready' || game.phase === 'over') return;
    cutinTimer -= Math.min(dt, 0.1);
    if (cutinTimer > 0) return;
    if (game.phase !== 'fall' || Sound.voicePlaying() || $('.cutin', fx)) {
      cutinTimer = 1.5; // 連鎖中などは少し待ってからもう一度
      return;
    }
    cutinTimer = nextCutin();
    Sound.playVoice('cutin');
    const faces = game.faceIds.filter(Boolean);
    showCutin(faces[Math.floor(Math.random() * faces.length)], '♪');
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // ぜんけしアタックのタイム（1/100秒まで）
  const fmtClock = (s) => `${fmtTime(s)}.${String(Math.floor((s % 1) * 100)).padStart(2, '0')}`;

  function updateHud() {
    if (hud.shown !== game.score) {
      hud.shown += Math.ceil((game.score - hud.shown) * 0.25);
      $('#hud-score').textContent = hud.shown.toLocaleString();
    }
    const chain = game.chain || game.lastChain;
    if (hud.chain !== chain) $('#hud-chain').textContent = hud.chain = chain;
    if (hud.max !== game.maxChain) $('#hud-max').textContent = hud.max = game.maxChain;
    if (hud.level !== game.level) $('#hud-level').textContent = (hud.level = game.level) + 1;
    const t = game.mode === 'time' ? fmtTime(Math.ceil(game.timeLeft)) : game.mode === 'allclear' ? fmtClock(game.elapsed) : fmtTime(game.elapsed);
    if (hud.time !== t) $('#hud-time').textContent = hud.time = t;
    const warn = game.mode === 'time' && game.timeLeft <= 10 && game.timeLeft > 0;
    if (hud.warn !== warn) $('#hud-time').classList.toggle('warn', (hud.warn = warn));
    if (game.mode === 'allclear') {
      let left = 0;
      for (const row of game.grid) for (const c of row) if (c && !c.pop && !c.out) left++;
      if (hud.left !== left) $('#hud-left').textContent = hud.left = left;
    }
    if (cpuGame) {
      renderOjama($('#ojama-me'), game.ojama.ready + game.ojama.wait);
      renderOjama($('#ojama-cpu'), cpuGame.ojama.ready + cpuGame.ojama.wait);
    }
  }

  // おじゃまぷよの予告マーク（本家と同じく、大きい単位から最大6こ）
  const OJAMA_UNITS = [[720, 'crown'], [360, 'moon'], [180, 'star'], [30, 'rock'], [6, 'big'], [1, 'small']];
  function renderOjama(el, n) {
    if (el.dataset.n === String(n)) return;
    el.dataset.n = n;
    el.textContent = '';
    let left = n;
    for (const [unit, kind] of OJAMA_UNITS) {
      while (left >= unit && el.childElementCount < 6) {
        left -= unit;
        const s = document.createElement('span');
        s.className = 'oj ' + kind;
        el.appendChild(s);
      }
    }
  }

  function layout() {
    if (!game) return;
    const pad = $('#touch-pad');
    const padH = pad.offsetHeight ? pad.offsetHeight + 10 : 0;
    const availH = window.innerHeight - 16 - padH - 8;
    const availW = window.innerWidth - 16 - 8;
    let cs, wide = false;
    if (cpuGame) {
      // 対戦：横に余裕があれば相手を右どなりに大きめに、なければ右の列に小さく
      const narrow = Math.min(availH / 13, availW / 9.45, 64);
      const wideCs = Math.min(availH / 13, availW / 13.4, 64);
      wide = wideCs >= narrow * 0.9;
      cs = wide ? wideCs : narrow;
    } else {
      cs = Math.min(availH / 12, availW / 8.9, 64);
    }
    gameScreen.classList.toggle('wide', wide);
    if (wide) gameLayout.appendChild(oppBox);
    else $('.next-box', side).after(oppBox);
    const apply = (c) => {
      gameScreen.style.setProperty('--cs', c + 'px');
      game.resize(c);
      if (cpuGame) {
        const oc = wide ? Math.floor(c * 0.62) : Math.floor((side.clientWidth - 6) / 6);
        oppBox.style.setProperty('--cs', oc + 'px');
        cpuGame.resize(oc);
      }
    };
    cs = Math.max(cpuGame ? 14 : 18, Math.floor(cs));
    apply(cs);
    // 対戦は右の列が長くなるので、画面からはみ出すときは少しずつ小さくする
    while (cpuGame && cs > 14 && (gameLayout.offsetHeight > availH || gameLayout.offsetWidth > availW + 8)) apply(--cs);
  }
  window.addEventListener('resize', layout);

  // 演出
  function banner(text, kind, layer = fx) {
    $$('.banner', layer).forEach((b) => b.remove());
    const el = document.createElement('div');
    el.className = 'banner ' + kind;
    el.textContent = text;
    if (!kind.startsWith('over')) el.addEventListener('animationend', () => el.remove());
    layer.appendChild(el);
  }

  const CHAIN_COLORS = ['#ffffff', '#ffe066', '#7cf29c', '#7cc4ff', '#ff9bd2', '#ffb35c', '#ff6b6b'];
  function chainFx(n, faceSrc, pos, layer = fx, cs = game ? game.cs : 30, cutin = true) {
    const el = document.createElement('div');
    el.className = 'chain-pop';
    const margin = cs * 1.7;
    el.style.left = Math.min(Math.max(pos.x, margin), layer.clientWidth - margin) + 'px';
    el.style.top = pos.y + 'px';
    el.style.setProperty('--k', Math.min(1 + (n - 1) * 0.15, 2));
    el.style.setProperty('--chain-color', CHAIN_COLORS[Math.min(n - 1, CHAIN_COLORS.length - 1)]);
    if (faceSrc) {
      const img = document.createElement('img');
      img.src = faceSrc;
      img.alt = '';
      el.appendChild(img);
    }
    const label = document.createElement('span');
    label.textContent = n + 'れんさ!';
    el.appendChild(label);
    el.addEventListener('animationend', () => el.remove());
    layer.appendChild(el);

    if (cutin && n >= 4 && faceSrc) showCutin(faceSrc, n >= 7 ? 'ばよえ〜ん!!' : n + 'れんさ!!');
  }

  function showCutin(faceSrc, text) {
    $$('.cutin', fx).forEach((c) => c.remove());
    const cut = document.createElement('div');
    cut.className = 'cutin';
    if (faceSrc) {
      const img = document.createElement('img');
      img.src = faceSrc;
      img.alt = '';
      cut.appendChild(img);
    }
    const txt = document.createElement('span');
    txt.textContent = text;
    cut.appendChild(txt);
    cut.addEventListener('animationend', () => cut.remove());
    fx.appendChild(cut);
  }

  // ---------------- 入力 ----------------
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'hard', KeyW: 'hard', Space: 'hard',
    KeyX: 'rotR', KeyK: 'rotR',
    KeyZ: 'rotL', KeyJ: 'rotL',
  };
  const HOLD = ['left', 'right', 'down'];

  function releaseAll() {
    if (!game) return;
    HOLD.forEach((k) => game.held[k] && game.setHeld(k, false));
    $$('#touch-pad .on').forEach((b) => b.classList.remove('on'));
  }

  window.addEventListener('keydown', (e) => {
    if (screen === 'ending') {
      if (e.code === 'Escape') Ending.stop();
      return;
    }
    const paused = !$('#pause-modal').hidden;
    if (screen === 'game' && game) {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        setPause(!game.paused);
        return;
      }
      if (!paused) {
        const act = KEYMAP[e.code];
        if (!act) return;
        e.preventDefault();
        if (e.repeat) return;
        if (HOLD.includes(act)) game.setHeld(act, true);
        else game.press(act);
        return;
      }
    }
    menuKeys(e);
  });

  window.addEventListener('keyup', (e) => {
    const act = KEYMAP[e.code];
    if (game && HOLD.includes(act)) game.setHeld(act, false);
  });
  window.addEventListener('blur', releaseAll);

  $$('#touch-pad button').forEach((btn) => {
    const act = btn.dataset.act;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      btn.classList.add('on');
      if (!game || game.paused) return;
      if (HOLD.includes(act)) game.setHeld(act, true);
      else game.press(act);
    });
    const up = () => {
      btn.classList.remove('on');
      if (game && HOLD.includes(act)) game.setHeld(act, false);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // メニューのキーボード操作（↑↓で選ぶ、Enterで決定、Escでもどる）
  function menuKeys(e) {
    const tag = e.target.tagName;
    const typing = tag === 'INPUT' && e.target.type !== 'range';
    if (e.code === 'Escape' && !typing) {
      const back = $('.screen.active')?.dataset.back;
      if (back) {
        Sound.play('select');
        show(back);
      }
      return;
    }
    const vertical = e.code === 'ArrowUp' || e.code === 'ArrowDown';
    const horizontal = e.code === 'ArrowLeft' || e.code === 'ArrowRight';
    if (!vertical && !horizontal) return;
    if (typing || (tag === 'INPUT' && horizontal)) return;
    const root = !$('#pause-modal').hidden ? $('#pause-modal') : $('.screen.active');
    if (!root) return;
    const items = $$('button, input, a[href]', root).filter((el) => el.offsetParent !== null && !el.disabled);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    const step = e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1;
    const next = items[(i + step + items.length) % items.length];
    next.focus();
    Sound.play('select');
  }

  // ---------------- ポーズ ----------------
  function setPause(on) {
    if (!game || game.done || game.phase === 'over') return;
    game.paused = on;
    if (cpuGame) cpuGame.paused = on;
    releaseAll();
    $('#pause-modal').hidden = !on;
    if (on) $('#btn-resume').focus();
  }
  $('#btn-pause').addEventListener('click', () => setPause(true));
  $('#btn-resume').addEventListener('click', () => setPause(false));
  $('#btn-restart').addEventListener('click', () => {
    Sound.play('decide');
    startGame(lastMode, lastOpts);
  });
  $('#btn-quit').addEventListener('click', () => {
    Sound.play('decide');
    abandonVersus();
    game = null;
    $('#pause-modal').hidden = true;
    show('menu');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'game') setPause(true);
  });

  // ---------------- リザルト ----------------
  let pending = null;
  let lastEntryId = null;
  const MODE_NAME = { endless: 'とことんモード', time: 'タイムアタック' };
  const acName = (preset, n) => `ぜんけしアタック（${preset ? 'はいち あり' : 'はいち なし'}・${n}しゅるい）`;

  // ゲームが終わったら：とことんモードで規定の点数以上ならエンディング → リザルト
  function finishGame(r) {
    const mode = game.mode, v = vs;
    game = null;
    cpuGame = null;
    vs = null;
    if (mode === 'versus') return showVersusResult(r, v);
    if (mode === 'allclear') return showAllclearResult(r, lastOpts);
    const min = CFG.ending && CFG.ending.minScore;
    if (mode === 'endless' && min && r.score >= min) {
      store.set('endingUnlocked', true);
      playEnding(() => showResult(r, mode));
    } else {
      showResult(r, mode);
    }
  }

  function addPopStats(r) {
    for (const [src, c] of Object.entries(r.popStats)) stats.pops[src] = (stats.pops[src] || 0) + c;
    store.set('stats', stats);
  }

  function topFace(r) {
    const top = Object.entries(r.popStats).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : CFG.faces[rnd(CFG.faces.length)].src;
  }

  // リザルト画面の中身をうめる（big は大きく出す数字や文字）
  function fillResult({ title, mode, big, unit, l1, v1, l2, v2, face, retry = 'もういちど', retryNew = false }) {
    $('#result-title').textContent = title;
    $('#result-mode').textContent = mode;
    $('#result-score').textContent = big;
    $('.result-score').classList.toggle('text', typeof big === 'string' && !/^[\d:.,]+$/.test(big));
    $('#result-unit').textContent = unit;
    $('#result-l1').textContent = l1;
    $('#result-chain').textContent = v1;
    $('#result-l2').textContent = l2;
    $('#result-pieces').textContent = v2;
    $('#result-face').src = face;
    $('#retry-label').textContent = retry;
    $('#btn-retry-new').hidden = !retryNew;
  }

  // ランクインしたら名前を入れてもらう
  function showRankin(pos) {
    $('#rankin').hidden = !pending;
    if (pending) {
      $('#rankin-pos').textContent = pos + 1;
      $('#name-input').value = store.get('name', '');
      $('#name-form').hidden = false;
    }
    show('result');
    if (pending) $('#name-input').focus();
  }

  function showResult(r, mode) {
    addPopStats(r);
    fillResult({
      title: r.reason === 'timeup' ? 'タイムアップ！' : 'ばたんきゅ〜',
      mode: MODE_NAME[mode],
      big: r.score.toLocaleString(),
      unit: 'てん',
      l1: 'さいだい れんさ', v1: r.maxChain,
      l2: 'おとした数', v2: r.pieces,
      face: topFace(r),
    });
    const list = listOf(mode);
    const pos = list.filter((e) => e.score >= r.score).length;
    pending = r.score > 0 && pos < 10 ? { key: mode, score: r.score, chain: r.maxChain } : null;
    showRankin(pos);
  }

  // ぜんけしアタック：成功ならタイムでランキング、失敗ならゲームオーバー画面からリトライ
  function showAllclearResult(r, opts) {
    addPopStats(r);
    const ok = r.reason === 'clear';
    fillResult({
      title: ok ? 'ぜんけし せいこう！' : 'しっぱい…',
      mode: acName(opts.preset, opts.n),
      big: ok ? fmtClock(r.time) : 'ばたんきゅ〜',
      unit: '',
      l1: 'さいだい れんさ', v1: r.maxChain,
      l2: 'おとした数', v2: r.pieces,
      face: topFace(r),
      retry: 'リトライ',
      retryNew: opts.preset,
    });
    const key = acKey(opts.preset, opts.n);
    const list = listOf(key);
    const pos = list.filter((e) => e.time <= r.time).length;
    pending = ok && pos < 10 ? { key, time: r.time, chain: r.maxChain, pieces: r.pieces } : null;
    showRankin(pos);
  }

  function recordVersus(lv, result) {
    const rec = recOf(lv);
    if (result === 'win') {
      rec.streak++;
      rec.win++;
      rec.best = Math.max(rec.best, rec.streak);
    } else if (result === 'lose') {
      rec.streak = 0;
      rec.lose++;
    }
    store.set('versus', versusRec);
    return rec;
  }

  function showVersusResult(r, v) {
    addPopStats(r);
    const result = v.result || 'lose';
    const rec = recordVersus(v.level, result);
    fillResult({
      title: { win: 'かち！', lose: 'まけ…', draw: 'ひきわけ' }[result],
      mode: `CPU たいせん（${LEVEL_NAME[v.level]}）`,
      big: rec.streak,
      unit: 'れんしょう',
      l1: 'さいだい れんさ', v1: r.maxChain,
      l2: 'さいこう れんしょう', v2: rec.best,
      face: cpuProfile(v.level).src,
    });
    pending = null;
    showRankin(0);
  }

  $('#name-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pending) return;
    const name = $('#name-input').value.trim().slice(0, 10) || 'ななし';
    store.set('name', name);
    lastEntryId = Date.now();
    const byTime = pending.time != null;
    const list = listOf(pending.key);
    const entry = { id: lastEntryId, name, chain: pending.chain, date: lastEntryId };
    if (byTime) Object.assign(entry, { time: pending.time, pieces: pending.pieces });
    else entry.score = pending.score;
    list.push(entry);
    list.sort(byTime ? (a, b) => a.time - b.time : (a, b) => b.score - a.score);
    ranking[pending.key] = list.slice(0, 10);
    store.set('ranking', ranking);
    const ac = /^ac-(pre|none)-(\d)$/.exec(pending.key);
    if (ac) {
      rankTab = 'allclear';
      rankAc.preset = ac[1];
      rankAc.n = +ac[2];
    } else rankTab = pending.key;
    pending = null;
    Sound.play('decide');
    show('ranking');
  });

  $('#btn-retry').addEventListener('click', () => {
    Sound.play('decide');
    startGame(lastMode, lastOpts);
  });
  $('#btn-retry-new').addEventListener('click', () => {
    Sound.play('decide');
    startGame(lastMode, { ...lastOpts, grid: null });
  });

  // ---------------- ランキング ----------------
  let rankTab = 'endless';
  const rankAc = { preset: 'pre', n: settings.colors };
  const rankKey = () => (rankTab === 'allclear' ? `ac-${rankAc.preset}-${rankAc.n}` : rankTab);
  const rankName = () => (rankTab === 'allclear' ? acName(rankAc.preset === 'pre', rankAc.n) : MODE_NAME[rankTab]);

  function rankRow(posContent, name, subText, ptsText, cls = '') {
    const li = document.createElement('li');
    if (cls) li.className = cls;
    const pos = document.createElement('span');
    pos.className = 'pos';
    pos.append(posContent);
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = name;
    const sub = document.createElement('small');
    sub.textContent = subText;
    who.appendChild(sub);
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = ptsText;
    li.append(pos, who, pts);
    return li;
  }

  function renderRanking() {
    $$('#rank-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === rankTab));
    $('#rank-sub').hidden = rankTab !== 'allclear';
    $$('#rank-sub .seg').forEach((seg) => {
      $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.val === String(rankAc[seg.dataset.sub])));
    });
    const ol = $('#rank-list');
    ol.textContent = '';
    if (rankTab === 'versus') {
      // 強さごとの連勝数
      for (const lv of LEVELS) {
        const rec = recOf(lv), prof = cpuProfile(lv);
        const img = document.createElement('img');
        img.className = 'rank-face';
        img.src = prof.src;
        img.alt = '';
        const li = rankRow(img, LEVEL_NAME[lv], `かち ${rec.win} / まけ ${rec.lose}`, `いま ${rec.streak} / さいこう ${rec.best}`);
        li.querySelector('.pts').classList.add('small');
        ol.appendChild(li);
      }
      return;
    }
    const list = listOf(rankKey());
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'まだ きろくがないよ';
      ol.appendChild(li);
      return;
    }
    list.forEach((e, i) => {
      const d = new Date(e.date);
      const day = `${d.getMonth() + 1}/${d.getDate()}`;
      const byTime = e.time != null;
      ol.appendChild(rankRow(
        String(i + 1),
        e.name,
        byTime ? `${day}  ${e.pieces}て・さいだい${e.chain}れんさ` : `${day}  さいだい${e.chain}れんさ`,
        byTime ? fmtClock(e.time) : e.score.toLocaleString(),
        e.id === lastEntryId ? 'me' : '',
      ));
    });
  }
  $$('#rank-tabs button').forEach((b) => b.addEventListener('click', () => {
    rankTab = b.dataset.tab;
    Sound.play('select');
    renderRanking();
  }));
  $$('#rank-sub .seg').forEach((seg) => {
    $$('button', seg).forEach((b) => b.addEventListener('click', () => {
      const k = seg.dataset.sub;
      rankAc[k] = k === 'n' ? +b.dataset.val : b.dataset.val;
      Sound.play('select');
      renderRanking();
    }));
  });
  $('#btn-rank-reset').addEventListener('click', () => {
    if (rankTab === 'versus') {
      if (!Object.keys(versusRec).length) return;
      if (!confirm('CPU たいせんの きろく（れんしょう）をけしますか？')) return;
      for (const k of Object.keys(versusRec)) delete versusRec[k];
      store.set('versus', versusRec);
      renderRanking();
      return;
    }
    const key = rankKey();
    if (!listOf(key).length) return;
    if (!confirm(`${rankName()}のランキングをけしますか？`)) return;
    ranking[key] = [];
    store.set('ranking', ranking);
    renderRanking();
  });

  // ---------------- ずかん ----------------
  function renderGallery() {
    const box = $('#gallery');
    box.textContent = '';
    CFG.faces.forEach((f) => {
      const off = settings.disabled.includes(f.src);
      const card = document.createElement('button');
      card.className = 'g-card' + (off ? ' off' : '');
      const img = document.createElement('img');
      img.src = f.src;
      img.alt = '';
      img.loading = 'lazy';
      const name = document.createElement('span');
      name.className = 'g-name';
      name.textContent = f.name;
      const count = document.createElement('span');
      count.className = 'g-count';
      count.textContent = `けした数 ${(stats.pops[f.src] || 0).toLocaleString()}`;
      const flag = document.createElement('span');
      flag.className = 'g-flag';
      flag.textContent = off ? 'OFF' : 'ON';
      card.append(img, name, count, flag);
      card.addEventListener('click', () => {
        const nowOff = !settings.disabled.includes(f.src);
        settings.disabled = nowOff ? [...settings.disabled, f.src] : settings.disabled.filter((s) => s !== f.src);
        saveSettings();
        card.classList.toggle('off', nowOff);
        flag.textContent = nowOff ? 'OFF' : 'ON';
        Sound.play('select');
      });
      box.appendChild(card);
    });
  }
  $('#btn-all-on').addEventListener('click', () => {
    settings.disabled = [];
    saveSettings();
    Sound.play('decide');
    renderGallery();
  });

  // ---------------- おんがく（クレジット） ----------------
  function renderCredits() {
    const c = CFG.credits;
    if (!c) return;
    $('#credits-lead').textContent = c.lead;
    const list = $('#credit-list');
    list.textContent = '';
    for (const p of c.plugins) {
      const card = document.createElement('div');
      card.className = 'credit-card';
      const head = document.createElement('div');
      head.className = 'credit-head';
      const role = document.createElement('span');
      role.className = 'credit-role';
      role.textContent = p.role;
      const name = document.createElement('b');
      name.textContent = p.name;
      head.append(role, name);
      const desc = document.createElement('p');
      desc.textContent = p.desc;
      const link = document.createElement('a');
      link.className = 'credit-link';
      link.href = p.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'BOOTH で見る ↗';
      card.append(head, desc, link);
      list.appendChild(card);
    }
    const links = $('#credit-links');
    links.textContent = '';
    for (const l of c.links || []) {
      const a = document.createElement('a');
      a.className = 'big-link ' + (l.kind || '');
      a.href = l.url;
      a.target = '_blank';
      a.rel = 'noopener';
      const t = document.createElement('span');
      t.className = 'big-link-title';
      t.textContent = l.label + ' ↗';
      const sub = document.createElement('span');
      sub.className = 'big-link-sub';
      sub.textContent = l.sub || '';
      a.append(t, sub);
      links.appendChild(a);
    }
  }

  // ---------------- せってい ----------------
  function renderSettings() {
    $$('.seg[data-key]').forEach((seg) => {
      const key = seg.dataset.key;
      $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.val === String(settings[key])));
    });
    $('#volume').value = settings.volume;
  }
  $$('.seg[data-key]').forEach((seg) => {
    const key = seg.dataset.key;
    $$('button', seg).forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.val;
      settings[key] = key === 'colors' ? +v : v === 'true' ? true : v === 'false' ? false : v;
      saveSettings();
      renderSettings();
      if (screen === 'allclear') renderAllclearSelect(); // ベストタイムは しゅるいごと
      Sound.play('select');
    }));
  });
  $('#volume').addEventListener('input', (e) => {
    settings.volume = +e.target.value;
    saveSettings();
  });
  $('#volume').addEventListener('change', () => Sound.play('decide'));

  // デバッグ用（ブラウザのコンソールから __satapuyo.game で中身を見られる）
  // __satapuyo.autoplay('strong') で、次のゲームから自分の盤面もCPUが打つ（動作確認用。null で元にもどる）
  window.__satapuyo = {
    get game() { return game; },
    get cpu() { return cpuGame; },
    get vs() { return vs; },
    ending: () => playEnding(() => show('menu')),
    autoplay(level = 'strong') {
      autoLevel = level;
      autoPlayer = level && game ? new CpuPlayer(game, level, cpuGame) : null;
    },
  };

  show('title');
})();
