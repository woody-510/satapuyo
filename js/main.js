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
  // くみて：何人目の相手か（1から）で顔と名前がきまる
  function kumiteProfile(stage) {
    const order = (CFG.kumite && CFG.kumite.order) || CFG.faces.map((_, i) => i + 1);
    const f = CFG.faces[(order[(stage - 1) % order.length] || 1) - 1] || CFG.faces[0];
    return { name: f.name, src: f.src };
  }
  const kumiteRec = Object.assign({ best: 0, runs: 0 }, store.get('kumite', {}));
  const achieved = store.get('achievements', {}); // じっせきID -> かいじょした日時

  // プレイヤー（オンラインランキング用）。secret は この端末だけが知っている合言葉、publicId は ランキングで自分の行を見つける用
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  }));
  const player = store.get('player', null) || { secret: uuid(), publicId: uuid() };
  store.set('player', player);
  const playerName = () => store.get('name', '') || 'ななし';
  Online.flush(); // 前に送れなかった記録があれば送る
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
  $('#opp-field-wrap').style.backgroundImage = `url("${CFG.images.fieldBg}")`;

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
    if (name === 'achievements') renderAchievements();
    if (audioReady && bgmFor(name)) Sound.playBgm(bgmFor(name));
    if (name !== 'game') stopLoop();
    focusFirst();
    if (name === 'menu') askNameIfNeeded();
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
      const opts = d.mode === 'allclear' ? { preset: d.preset === '1', n: settings.colors }
        : d.mode === 'versus' ? { level: d.level }
        : d.mode === 'kumite' ? { stage: 1, wins: 0, maxChain: 0 } : {};
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
    $('#best-kumite').textContent = kumiteRec.best;
    $('#ach-count').textContent = Object.keys(achieved).length;
    $('#ach-total').textContent = ACHIEVEMENTS.length;
    $('#btn-ending').hidden = !store.get('endingUnlocked', false);
  }

  // はじめて開いたときだけ名前を聞く（あとから せってい で変えられる）
  function askNameIfNeeded() {
    if (store.get('name', '')) return;
    $('#name-modal').hidden = false;
    $('#first-name').focus();
  }
  $('#first-name-form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.set('name', $('#first-name').value.trim().slice(0, 10) || 'ななし');
    $('#name-modal').hidden = true;
    Sound.play('decide');
    focusFirst();
  });

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
    if (!stats.endingSeen) {
      stats.endingSeen = true;
      store.set('stats', stats);
      checkAchievements({ mode: 'ending' });
    }
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

  // 対戦のとちゅうで やめたら まけ（くみては そこまでの かちぬき人数で記録）
  function abandonVersus() {
    if (vs && vs.started && !vs.result) {
      if (lastMode === 'kumite') endKumite(lastOpts, null);
      else recordVersus(vs.level, 'lose');
    }
    vs = null;
    cpuGame = null;
  }

  async function startGame(mode, opts = {}) {
    abandonVersus();
    lastMode = mode;
    lastOpts = opts;
    unlockAudio();
    await Promise.all(faceImgs.map(loaded));
    const isVs = mode === 'versus' || mode === 'kumite';
    const n = isVs ? VS.colors || 4 : mode === 'allclear' ? opts.n : settings.colors;
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
    $('#kumite-modal').hidden = true;
    gameScreen.dataset.playing = isVs ? 'versus' : mode; // data-mode だとメニューのボタンと見分けがつかないので別の名前
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
    const level = mode === 'kumite' ? kumiteLevel(opts.stage) : opts.level;
    const v = isVs ? new Versus({ n, level, cfg: VS }) : null;
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
      const kumite = mode === 'kumite';
      const prof = kumite ? kumiteProfile(opts.stage) : cpuProfile(opts.level);
      $('#opp-face').src = prof.src;
      $('#opp-name').textContent = prof.name;
      $('#opp-level').textContent = kumite ? `${opts.stage}にんめ` : LEVEL_NAME[opts.level];
      $('#hud-streak-label').textContent = kumite ? 'かちぬき' : 'れんしょう';
      $('#hud-streak').textContent = kumite ? opts.wins : recOf(opts.level).streak;
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
      checkHeld();
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
    let cs, wide = false, wideOpp = 0;
    if (cpuGame) {
      // 対戦：横に余裕があれば 左に自分・右に相手（同じ大きさまで）、なければ相手は右の列に小さく
      const narrow = Math.min(availH / 13, availW / 9.45, 64);
      const wideCs = Math.min(availH / 13, availW / 13, 64);
      wide = wideCs >= narrow * 0.9;
      cs = wide ? wideCs : narrow;
      if (wide) wideOpp = (c) => Math.min(c, Math.floor((availW - c * 9.4 - 24) / 6));
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
        const oc = wide ? wideOpp(c) : Math.floor((side.clientWidth - 6) / 6);
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
  // いま押されているもの：スマホのボタンは指（pointerId）ごと、キーボードは act ごとに覚えておく。
  // 離した合図を取りこぼしても押しっぱなしにならないよう、毎フレーム「本当に押されているか」を見なおす
  const padPointers = new Map(); // pointerId -> { btn, act }
  const keyHeld = new Set();
  const isHeld = (act) => keyHeld.has(act) || [...padPointers.values()].some((p) => p.act === act);

  function padRelease(id) {
    const p = padPointers.get(id);
    if (!p) return;
    padPointers.delete(id);
    if (![...padPointers.values()].some((q) => q.btn === p.btn)) p.btn.classList.remove('on');
    if (game && HOLD.includes(p.act) && !isHeld(p.act)) game.setHeld(p.act, false);
  }

  function releaseAll() {
    padPointers.clear();
    keyHeld.clear();
    $$('#touch-pad .on').forEach((b) => b.classList.remove('on'));
    if (game) HOLD.forEach((k) => game.held[k] && game.setHeld(k, false));
  }

  // 押されていないのに押しっぱなしになっていたら離す（デバッグの自動操作中はしない）
  function checkHeld() {
    if (!game || autoPlayer) return;
    for (const act of HOLD) if (game.held[act] && !isHeld(act)) game.setHeld(act, false);
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
        if (HOLD.includes(act)) {
          keyHeld.add(act);
          game.setHeld(act, true);
        } else game.press(act);
        return;
      }
    }
    menuKeys(e);
  });

  window.addEventListener('keyup', (e) => {
    const act = KEYMAP[e.code];
    if (!HOLD.includes(act)) return;
    keyHeld.delete(act);
    if (game && !isHeld(act)) game.setHeld(act, false);
  });
  window.addEventListener('blur', releaseAll);
  window.addEventListener('pagehide', releaseAll);

  $$('#touch-pad button').forEach((btn) => {
    const act = btn.dataset.act;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        btn.setPointerCapture?.(e.pointerId);
      } catch {} // 指がもう離れていた などで失敗しても、ボタンは効くように
      padPointers.set(e.pointerId, { btn, act });
      btn.classList.add('on');
      if (!game || game.paused) return;
      if (HOLD.includes(act)) game.setHeld(act, true);
      else game.press(act);
    });
    const up = (e) => padRelease(e.pointerId);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  // ボタンの外で指を離したときや、通知などで操作がとぎれたときも離した扱いに
  window.addEventListener('pointerup', (e) => padRelease(e.pointerId), true);
  window.addEventListener('pointercancel', (e) => padRelease(e.pointerId), true);
  const allFingersUp = (e) => {
    if (e.touches.length) return;
    for (const id of [...padPointers.keys()]) padRelease(id);
  };
  window.addEventListener('touchend', allFingersUp, true);
  window.addEventListener('touchcancel', allFingersUp, true);

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
  // くみての「さいしょから」は1人目から
  const freshOpts = () => (lastMode === 'kumite' ? { stage: 1, wins: 0, maxChain: 0 } : lastOpts);
  $('#btn-restart').addEventListener('click', () => {
    Sound.play('decide');
    startGame(lastMode, freshOpts());
  });
  $('#btn-quit').addEventListener('click', () => {
    Sound.play('decide');
    abandonVersus();
    game = null;
    $('#pause-modal').hidden = true;
    show('menu');
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    releaseAll();
    if (screen === 'game') setPause(true);
  });

  // ---------------- リザルト ----------------
  let lastEntryId = null;
  let lastShare = null; // シェアする中身
  const MODE_NAME = { endless: 'とことんモード', time: 'タイムアタック', kumite: 'くみて' };
  const acName = (preset, n) => `ぜんけしアタック（${preset ? 'はいち あり' : 'はいち なし'}・${n}しゅるい）`;
  const isTimeKey = (key) => key.startsWith('ac-');

  // ゲームが終わったら：とことんモードで規定の点数以上ならエンディング → リザルト
  function finishGame(r) {
    const mode = lastMode, v = vs;
    const sent = v ? v.sentBy(v.me) : 0;
    game = null;
    cpuGame = null;
    vs = null;
    addPopStats(r);
    if (mode === 'versus') return showVersusResult(r, v, sent);
    if (mode === 'kumite') return kumiteNext(r, v, sent);
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
    stats.plays = (stats.plays || 0) + 1;
    store.set('stats', stats);
  }

  function topFace(r) {
    const top = Object.entries(r.popStats).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : CFG.faces[rnd(CFG.faces.length)].src;
  }
  const topFaces = (r) => Object.entries(r.popStats).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([src]) => src);

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
    $('#rank-status').hidden = true;
    $('#rank-status').textContent = '';
  }

  // 記録を自動でランキングにのせる（この端末のトップ10 と、ぜんこく）。名前は せってい の名前
  function recordScore(key, value, extra = {}) {
    const byTime = isTimeKey(key);
    const list = listOf(key);
    lastEntryId = Date.now();
    const entry = { id: lastEntryId, name: playerName(), date: lastEntryId, chain: extra.chain || 0, ...extra };
    if (byTime) entry.time = value;
    else entry.score = value;
    list.push(entry);
    list.sort(byTime ? (a, b) => a.time - b.time : (a, b) => b.score - a.score);
    ranking[key] = list.slice(0, 10);
    store.set('ranking', ranking);
    const pos = ranking[key].findIndex((e) => e.id === lastEntryId);
    showRankStatus(key, value, pos, extra.chain || 0);
  }

  // リザルトの「じぶん ○い / ぜんこく ○い」
  function showRankStatus(key, value, pos, chain) {
    const box = $('#rank-status');
    box.textContent = '';
    box.hidden = false;
    const local = document.createElement('span');
    local.textContent = pos === 0 ? 'じぶんベスト こうしん！' : pos > 0 ? `じぶんの きろく ${pos + 1}い` : 'じぶんの トップ10 には とどかず';
    box.appendChild(local);
    if (!Online.enabled) return;
    const net = document.createElement('span');
    net.className = 'net';
    net.textContent = 'ぜんこく ランキングに そうしん中…';
    box.appendChild(net);
    const share = lastShare;
    (async () => {
      const ok = await Online.submit({ secret: player.secret, publicId: player.publicId, mode: key, name: playerName(), value, chain });
      if (!ok) {
        net.textContent = 'つながらなかった（つぎに おくりなおすね）';
        return;
      }
      delete onlineCache[key];
      try {
        const rank = await Online.rankOf(key, value, player.publicId);
        net.textContent = rank ? `ぜんこく ${rank}い！` : 'ぜんこく ランキングに のせたよ';
        if (share && rank) share.rank = rank;
      } catch {
        net.textContent = 'ぜんこく ランキングに のせたよ';
      }
    })();
  }

  // じっせきの判定に使う、これまでの合計
  function checkAchievements(e) {
    const s = {
      versus: versusRec,
      totalPops: Object.values(stats.pops).reduce((a, b) => a + b, 0),
      facesPopped: CFG.faces.filter((f) => stats.pops[f.src] > 0).length,
      facesTotal: CFG.faces.length,
      plays: stats.plays || 0,
      endingSeen: !!stats.endingSeen,
    };
    const got = [];
    for (const a of ACHIEVEMENTS) {
      if (achieved[a.id]) continue;
      let ok = false;
      try {
        ok = a.test(e, s);
      } catch {}
      if (ok) {
        achieved[a.id] = Date.now();
        got.push(a);
      }
    }
    if (!got.length) return;
    store.set('achievements', achieved);
    got.forEach((a, i) => setTimeout(() => toast('🏆 じっせき かいじょ！', a.name), 400 + i * 900));
  }
  const gameEvent = (mode, r, extra = {}) => ({
    mode, score: r.score, maxChain: r.maxChain, reason: r.reason, time: r.time, pieces: r.pieces, allClears: r.allClears || 0, ...extra,
  });

  function showResult(r, mode) {
    const secs = CFG.timeAttackSeconds;
    fillResult({
      title: r.reason === 'timeup' ? 'タイムアップ！' : 'ばたんきゅ〜',
      mode: MODE_NAME[mode],
      big: r.score.toLocaleString(),
      unit: 'てん',
      l1: 'さいだい れんさ', v1: r.maxChain,
      l2: 'おとした数', v2: r.pieces,
      face: topFace(r),
    });
    lastShare = {
      line: mode === 'time'
        ? `さたぷよ タイムアタック${secs}びょうで ${r.score.toLocaleString()}てん！（さいだい${r.maxChain}れんさ）`
        : `さたぷよ とことんモードで ${r.score.toLocaleString()}てん！（さいだい${r.maxChain}れんさ）`,
      mode: MODE_NAME[mode], big: r.score.toLocaleString(), unit: 'てん', sub: `さいだい ${r.maxChain}れんさ`,
      face: topFace(r), faces: topFaces(r),
    };
    if (r.score > 0) recordScore(mode, r.score, { chain: r.maxChain });
    show('result');
    checkAchievements(gameEvent(mode, r));
  }

  // ぜんけしアタック：成功ならタイムでランキング、失敗ならゲームオーバー画面からリトライ
  function showAllclearResult(r, opts) {
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
    lastShare = {
      line: ok
        ? `さたぷよ ${acName(opts.preset, opts.n)}を ${fmtClock(r.time)} で クリア！`
        : `さたぷよ ${acName(opts.preset, opts.n)}に ちょうせん中…（さいだい${r.maxChain}れんさ）`,
      mode: acName(opts.preset, opts.n), big: ok ? fmtClock(r.time) : 'ちょうせん中', unit: '', sub: `さいだい ${r.maxChain}れんさ / ${r.pieces}て`,
      face: topFace(r), faces: topFaces(r),
    };
    if (ok) recordScore(acKey(opts.preset, opts.n), r.time, { chain: r.maxChain, pieces: r.pieces });
    show('result');
    checkAchievements(gameEvent('allclear', r, { preset: opts.preset, n: opts.n }));
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

  function showVersusResult(r, v, sent) {
    const result = v.result || 'lose';
    const rec = recordVersus(v.level, result);
    const prof = cpuProfile(v.level);
    fillResult({
      title: { win: 'かち！', lose: 'まけ…', draw: 'ひきわけ' }[result],
      mode: `CPU たいせん（${LEVEL_NAME[v.level]}）`,
      big: rec.streak,
      unit: 'れんしょう',
      l1: 'さいだい れんさ', v1: r.maxChain,
      l2: 'さいこう れんしょう', v2: rec.best,
      face: prof.src,
    });
    const vsName = `${LEVEL_NAME[v.level]} ${prof.name}`;
    lastShare = {
      line: result === 'win'
        ? `さたぷよ CPU たいせんで「${vsName}」に かった！（${rec.streak}れんしょう中）`
        : `さたぷよ CPU たいせんで「${vsName}」に まけた…つぎは かつ！`,
      mode: `CPU たいせん（${LEVEL_NAME[v.level]}）`,
      big: result === 'win' ? String(rec.streak) : 'まけ…', unit: result === 'win' ? 'れんしょう' : '',
      sub: `さいだい ${r.maxChain}れんさ`, face: prof.src, faces: topFaces(r),
    };
    show('result');
    checkAchievements(gameEvent('versus', r, { result, level: v.level, sent }));
  }

  // ---------------- くみて ----------------
  // 勝ったら次の相手、ひきわけなら同じ相手ともう一度、負けたらおわり
  function kumiteNext(r, v, sent) {
    const result = v.result || 'lose';
    const opts = { ...lastOpts, maxChain: Math.max(lastOpts.maxChain || 0, r.maxChain) };
    if (result === 'lose') return endKumite(opts, r);
    const next = result === 'win' ? { ...opts, stage: opts.stage + 1, wins: opts.wins + 1 } : opts;
    checkAchievements(gameEvent('kumite', r, { kumiteWins: next.wins, sent }));
    lastOpts = next;
    const prof = kumiteProfile(next.stage);
    $('#kumite-title').textContent = result === 'win' ? `${next.wins}にんぬき！` : 'ひきわけ';
    $('#kumite-sub').textContent = result === 'win' ? 'つぎの あいては…' : 'もういちど おなじ あいてと';
    $('#kumite-face').src = prof.src;
    $('#kumite-stage').textContent = `${next.stage}にんめ`;
    $('#kumite-name').textContent = prof.name;
    $('#kumite-modal').hidden = false;
    $('#btn-kumite-next').focus();
  }
  $('#btn-kumite-next').addEventListener('click', () => {
    Sound.play('decide');
    $('#kumite-modal').hidden = true;
    startGame('kumite', lastOpts);
  });
  $('#btn-kumite-stop').addEventListener('click', () => {
    Sound.play('decide');
    $('#kumite-modal').hidden = true;
    endKumite(lastOpts, null, true);
  });

  // くみての おわり：かちぬいた人数を記録。r が null で quit でもなければ（メニューへ などで）画面は出さない
  function endKumite(opts, r, quit = false) {
    const wins = opts.wins;
    kumiteRec.runs++;
    kumiteRec.best = Math.max(kumiteRec.best, wins);
    store.set('kumite', kumiteRec);
    if (!r && !quit) {
      if (wins > 0) recordScore('kumite', wins, { chain: opts.maxChain || 0 });
      return;
    }
    const prof = kumiteProfile(opts.stage);
    fillResult({
      title: quit ? 'くみて おわり' : 'まけ…',
      mode: quit ? `くみて（${wins}にん かちぬいて やめた）` : `くみて（${opts.stage}にんめ ${prof.name} に まけ）`,
      big: wins,
      unit: 'にんぬき',
      l1: 'さいだい れんさ', v1: opts.maxChain || 0,
      l2: 'さいこう', v2: `${kumiteRec.best}にん`,
      face: prof.src,
    });
    lastShare = {
      line: `さたぷよ くみてで ${wins}にんぬき！（さいだい${opts.maxChain || 0}れんさ）`,
      mode: 'くみて（かちぬき戦）', big: String(wins), unit: 'にんぬき', sub: `さいだい ${opts.maxChain || 0}れんさ`,
      face: prof.src, faces: r ? topFaces(r) : [],
    };
    if (wins > 0) recordScore('kumite', wins, { chain: opts.maxChain || 0 });
    show('result');
  }

  $('#btn-retry').addEventListener('click', () => {
    Sound.play('decide');
    startGame(lastMode, freshOpts());
  });
  $('#btn-retry-new').addEventListener('click', () => {
    Sound.play('decide');
    startGame(lastMode, { ...lastOpts, grid: null });
  });

  // ---------------- シェア ----------------
  const imgOf = (src) => faceImgs[CFG.faces.findIndex((f) => f.src === src)] || Object.assign(new Image(), { src });
  let shareFile = null, shareUrl = '';

  function setShareLinks() {
    const L = Share.links($('#share-text').value);
    $('#share-x').href = L.x;
    $('#share-line').href = L.line;
    $('#share-threads').href = L.threads;
    $('#share-bsky').href = L.bsky;
    $('#share-fb').href = L.fb;
  }

  async function openShare() {
    const s = lastShare;
    if (!s) return;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const rank = s.rank ? `ぜんこく ${s.rank}い！` : '';
    const c = Share.card({
      mode: s.mode, big: s.big, unit: s.unit, sub: [s.sub, rank].filter(Boolean).join('  '),
      face: imgOf(s.face), faces: (s.faces || []).map(imgOf), logo: logoImg,
    });
    shareUrl = c.toDataURL('image/png');
    $('#share-image').src = shareUrl;
    $('#share-text').value = Share.fullText([s.line, rank].filter(Boolean).join(' '));
    setShareLinks();
    shareFile = null;
    $('#share-native').hidden = !navigator.share;
    c.toBlob((blob) => {
      if (blob && window.File) shareFile = new File([blob], 'satapuyo.png', { type: 'image/png' });
    }, 'image/png');
    $('#share-modal').hidden = false;
    $('#share-close').focus();
  }
  $('#btn-share').addEventListener('click', () => {
    Sound.play('decide');
    openShare();
  });
  $('#share-text').addEventListener('input', setShareLinks);
  $('#share-native').addEventListener('click', async () => {
    const data = { text: $('#share-text').value };
    if (shareFile && navigator.canShare && navigator.canShare({ files: [shareFile] })) data.files = [shareFile];
    try {
      await navigator.share(data);
    } catch {}
  });
  $('#share-copy').addEventListener('click', () => copyText($('#share-text').value, 'ぶんしょうを コピーしたよ'));
  $('#share-save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = shareUrl;
    a.download = 'satapuyo.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  $('#share-close').addEventListener('click', () => {
    $('#share-modal').hidden = true;
    focusFirst();
  });

  async function copyText(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      toast('📋', done);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      if (ok) toast('📋', done);
      else prompt('この ぶんしょうを コピーしてね', text);
    }
  }

  // ちょっとした おしらせ（じっせき かいじょ・コピーしたよ など）
  function toast(title, text) {
    const el = document.createElement('div');
    el.className = 'toast';
    const b = document.createElement('b');
    b.textContent = title;
    const s = document.createElement('span');
    s.textContent = text;
    el.append(b, s);
    $('#toast-layer').appendChild(el);
    if (title.startsWith('🏆')) Sound.play('decide');
    setTimeout(() => el.remove(), 3200);
  }

  // ---------------- ランキング ----------------
  let rankTab = 'endless';
  let rankScope = Online.enabled ? 'online' : 'local';
  let rankCpu = 'kumite';
  const rankAc = { preset: 'pre', n: settings.colors };
  const onlineCache = {}; // key -> { at, rows }
  let rankReq = 0;
  const rankKey = () => (rankTab === 'allclear' ? `ac-${rankAc.preset}-${rankAc.n}` : rankTab === 'cpu' ? rankCpu : rankTab);
  const rankName = () => (rankTab === 'allclear' ? acName(rankAc.preset === 'pre', rankAc.n) : MODE_NAME[rankKey()]);
  const fmtValue = (key, v) => (isTimeKey(key) ? fmtClock(v) : key === 'kumite' ? `${v}にんぬき` : Math.round(v).toLocaleString());
  const fmtDay = (t) => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

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

  function rankMessage(text) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = text;
    $('#rank-list').appendChild(li);
  }

  function renderRanking() {
    $$('#rank-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === rankTab));
    $('#rank-sub').hidden = rankTab !== 'allclear';
    $('#rank-cpu').hidden = rankTab !== 'cpu';
    const subVal = { scope: rankScope, preset: rankAc.preset, n: rankAc.n, cpu: rankCpu };
    $$('#screen-ranking .seg[data-sub]').forEach((seg) => {
      $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.val === String(subVal[seg.dataset.sub])));
    });
    const key = rankKey();
    const versusTab = key === 'versus';
    const online = Online.enabled && !versusTab && rankScope === 'online';
    $('#rank-scope').hidden = !Online.enabled || versusTab;
    $('#btn-rank-reset').hidden = online;
    const note = $('#rank-note');
    note.hidden = Online.enabled || versusTab;
    note.textContent = 'ぜんこく ランキングは じゅんびちゅう。いまは この たんまつの きろく（トップ10）だけ。';
    const ol = $('#rank-list');
    ol.textContent = '';
    ol.classList.toggle('long', online);
    if (versusTab) {
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
    if (online) return renderOnline(key);
    const list = listOf(key);
    if (!list.length) return rankMessage('まだ きろくがないよ');
    list.forEach((e, i) => {
      const byTime = e.time != null;
      ol.appendChild(rankRow(
        String(i + 1),
        e.name,
        byTime ? `${fmtDay(e.date)}  ${e.pieces}て・さいだい${e.chain}れんさ` : `${fmtDay(e.date)}  さいだい${e.chain}れんさ`,
        fmtValue(key, byTime ? e.time : e.score),
        e.id === lastEntryId ? 'me' : '',
      ));
    });
  }

  // ぜんこく（100いまで）。30秒は よみなおさない
  async function renderOnline(key) {
    const id = ++rankReq;
    const cached = onlineCache[key];
    let rows = cached && Date.now() - cached.at < 30000 ? cached.rows : null;
    if (!rows) {
      rankMessage('よみこみちゅう…');
      try {
        rows = await Online.top(key, 100);
        onlineCache[key] = { at: Date.now(), rows };
      } catch {
        if (id !== rankReq) return;
        $('#rank-list').textContent = '';
        return rankMessage('つながらなかった。あとで もういちど ためしてね');
      }
    }
    if (id !== rankReq || screen !== 'ranking') return;
    const ol = $('#rank-list');
    ol.textContent = '';
    if (!rows.length) return rankMessage('まだ だれも のっていないよ');
    rows.forEach((e, i) => {
      ol.appendChild(rankRow(
        String(i + 1),
        e.name,
        `${fmtDay(e.updated_at)}  さいだい${e.chain}れんさ`,
        fmtValue(key, e.value),
        e.public_id === player.publicId ? 'me' : '',
      ));
    });
    // 自分の行が見えるように（リストの中だけ スクロール。画面ごと動かさない）
    const me = ol.querySelector('.me');
    ol.scrollTop = me ? me.offsetTop - ol.clientHeight / 2 + me.offsetHeight / 2 : 0;
  }

  $$('#rank-tabs button').forEach((b) => b.addEventListener('click', () => {
    rankTab = b.dataset.tab;
    Sound.play('select');
    renderRanking();
  }));
  $$('#screen-ranking .seg[data-sub]').forEach((seg) => {
    $$('button', seg).forEach((b) => b.addEventListener('click', () => {
      const k = seg.dataset.sub, v = b.dataset.val;
      if (k === 'scope') rankScope = v;
      else if (k === 'cpu') rankCpu = v;
      else rankAc[k] = k === 'n' ? +v : v;
      Sound.play('select');
      renderRanking();
    }));
  });
  $('#btn-rank-reset').addEventListener('click', () => {
    if (rankKey() === 'versus') {
      if (!Object.keys(versusRec).length) return;
      if (!confirm('CPU たいせんの きろく（れんしょう）をけしますか？')) return;
      for (const k of Object.keys(versusRec)) delete versusRec[k];
      store.set('versus', versusRec);
      renderRanking();
      return;
    }
    const key = rankKey();
    if (!listOf(key).length) return;
    if (!confirm(`${rankName()}の じぶんの きろくを けしますか？（ぜんこくランキングは けえません）`)) return;
    ranking[key] = [];
    store.set('ranking', ranking);
    renderRanking();
  });

  // ---------------- じっせき ----------------
  function renderAchievements() {
    const box = $('#ach-list');
    box.textContent = '';
    $('#ach-count2').textContent = Object.keys(achieved).length;
    $('#ach-total2').textContent = ACHIEVEMENTS.length;
    for (const a of ACHIEVEMENTS) {
      const at = achieved[a.id];
      const card = document.createElement('div');
      card.className = 'ach' + (at ? ' got' : '');
      const icon = document.createElement('span');
      icon.className = 'ach-icon';
      icon.textContent = at ? '🏆' : '🔒';
      const body = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = a.name;
      const desc = document.createElement('small');
      desc.textContent = at ? `${a.desc}（${fmtDay(at)}）` : a.desc;
      body.append(name, desc);
      card.append(icon, body);
      box.appendChild(card);
    }
  }

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
    $('#settings-name').value = store.get('name', '');
  }

  // なまえを かえる（ぜんこくランキングの名前も かわる）
  $('#settings-name-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#settings-name').value.trim().slice(0, 10) || 'ななし';
    store.set('name', name);
    $('#settings-name').value = name;
    $('#settings-name').blur();
    Sound.play('decide');
    toast('✏️', `なまえを「${name}」に したよ`);
    for (const k of Object.keys(onlineCache)) delete onlineCache[k];
    await Online.rename(player.secret, name);
  });

  // データの ひきつぎ：この端末の きろく（satapuyo. で始まる保存）を ぜんぶ1つの文字列にする
  function exportCode() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('satapuyo.')) data[k] = localStorage.getItem(k);
    }
    let bin = '';
    new TextEncoder().encode(JSON.stringify(data)).forEach((b) => (bin += String.fromCharCode(b)));
    return 'SATAPUYO1:' + btoa(bin);
  }
  function importCode(code) {
    const m = /^SATAPUYO1:([A-Za-z0-9+/=]+)$/.exec(code.replace(/\s+/g, ''));
    if (!m) throw new Error('bad code');
    const bin = atob(m[1]);
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    for (const [k, v] of Object.entries(data)) if (k.startsWith('satapuyo.') && typeof v === 'string') localStorage.setItem(k, v);
  }
  $('#btn-export').addEventListener('click', () => {
    Sound.play('decide');
    copyText(exportCode(), 'ひきつぎコードを コピーしたよ。あたらしい たんまつで「コードを いれる」に はりつけてね');
  });
  $('#btn-import').addEventListener('click', () => {
    const code = prompt('ひきつぎコードを はりつけてね（いまの きろくは うわがき されるよ）');
    if (!code) return;
    try {
      importCode(code);
      alert('ひきつぎ できたよ！ さいよみこみ するね');
      location.reload();
    } catch {
      alert('コードが ちがうみたい。もういちど コピーしなおしてね');
    }
  });
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
