// 画面遷移・メニュー・入力・保存まわり
(() => {
  const CFG = window.GAME_CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
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
    { colors: 4, speed: 'normal', ghost: true, se: true, bgm: true, volume: 70, disabled: [] },
    store.get('settings', {}),
  );
  const ranking = Object.assign({ endless: [], time: [] }, store.get('ranking', {}));
  const stats = Object.assign({ pops: {} }, store.get('stats', {}));
  const saveSettings = () => {
    store.set('settings', settings);
    Sound.apply({ se: settings.se, bgm: settings.bgm, volume: settings.volume / 100 });
  };
  Sound.apply({ se: settings.se, bgm: settings.bgm, volume: settings.volume / 100 });

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

  // ---------------- 画面切りかえ ----------------
  let screen = null;
  let audioReady = false;
  // 画面ごとの曲：タイトルはテーマソング、ゲーム中は激しめ、それ以外は落ちついた曲
  const bgmFor = (name) => (name === 'title' ? 'title' : name === 'game' ? 'game' : 'menu');

  function show(name) {
    screen = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    document.body.dataset.screen = name;
    Bg.set(name === 'game' || name === 'result' ? 'game' : name === 'title' ? 'title' : 'menu');
    if (name === 'menu') refreshMenu();
    if (name === 'ranking') renderRanking();
    if (name === 'gallery') renderGallery();
    if (name === 'settings') renderSettings();
    if (name === 'title') renderTitleFaces();
    if (audioReady) Sound.playBgm(bgmFor(name));
    if (name !== 'game') stopLoop();
    focusFirst();
  }

  function focusFirst() {
    const root = $('.screen.active');
    if (!root) return;
    const el = root.querySelector('[autofocus], .start-btn, .menu-btn, button');
    if (el) el.focus({ preventScroll: true });
  }

  function unlockAudio() {
    if (audioReady) return;
    audioReady = true;
    Sound.unlock();
    Sound.playBgm(bgmFor(screen));
  }
  window.addEventListener('pointerdown', unlockAudio, { once: false });
  window.addEventListener('keydown', unlockAudio, { once: false });

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
      startGame(mode.dataset.mode);
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
  }

  // ---------------- ゲーム ----------------
  const canvas = $('#field');
  const nextCanvas = $('#next');
  const fx = $('#fx-layer');
  const gameScreen = $('#screen-game');
  let game = null;
  let lastMode = 'endless';
  let rafId = 0, lastT = 0;
  const hud = {};

  async function startGame(mode) {
    lastMode = mode;
    unlockAudio();
    await Promise.all(faceImgs.map(loaded));
    const n = settings.colors;
    const usable = CFG.faces.map((_, i) => i).filter((i) => faceImgs[i].naturalWidth);
    let pool = usable.filter((i) => !settings.disabled.includes(CFG.faces[i].src));
    if (pool.length < n) pool = pool.concat(shuffle(usable.filter((i) => !pool.includes(i))).slice(0, n - pool.length));
    const chosen = shuffle(pool).slice(0, n);
    while (chosen.length < n) chosen.push(-1);

    $('#pause-modal').hidden = true;
    fx.textContent = '';
    show('game');
    document.activeElement?.blur();
    game = new PuyoGame({
      canvas,
      nextCanvas,
      faces: chosen.map((i) => (i >= 0 ? faceImgs[i] : null)),
      colors: CFG.ringColors.slice(0, n),
      faceIds: chosen.map((i) => (i >= 0 ? CFG.faces[i].src : null)),
      mode,
      speed: settings.speed,
      ghost: settings.ghost,
      callbacks: { banner, chain: chainFx, end: showResult },
    });
    Object.assign(hud, { score: -1, shown: 0, chain: -1, max: -1, time: '', level: -1, warn: null });
    $('#hud-time-label').textContent = mode === 'time' ? 'のこり' : 'TIME';
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
      game.update(dt);
      game.render();
      updateHud();
    };
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function updateHud() {
    if (hud.shown !== game.score) {
      hud.shown += Math.ceil((game.score - hud.shown) * 0.25);
      $('#hud-score').textContent = hud.shown.toLocaleString();
    }
    const chain = game.chain || game.lastChain;
    if (hud.chain !== chain) $('#hud-chain').textContent = hud.chain = chain;
    if (hud.max !== game.maxChain) $('#hud-max').textContent = hud.max = game.maxChain;
    if (hud.level !== game.level) $('#hud-level').textContent = (hud.level = game.level) + 1;
    const t = game.mode === 'time' ? fmtTime(Math.ceil(game.timeLeft)) : fmtTime(game.elapsed);
    if (hud.time !== t) $('#hud-time').textContent = hud.time = t;
    const warn = game.mode === 'time' && game.timeLeft <= 10 && game.timeLeft > 0;
    if (hud.warn !== warn) $('#hud-time').classList.toggle('warn', (hud.warn = warn));
  }

  function layout() {
    if (!game) return;
    const pad = $('#touch-pad');
    const padH = pad.offsetHeight ? pad.offsetHeight + 10 : 0;
    const availH = window.innerHeight - 16 - padH - 8;
    const availW = window.innerWidth - 16 - 8;
    const cs = Math.max(18, Math.floor(Math.min(availH / 12, availW / 8.9, 64)));
    gameScreen.style.setProperty('--cs', cs + 'px');
    game.resize(cs);
  }
  window.addEventListener('resize', layout);

  // 演出
  function banner(text, kind) {
    $$('.banner', fx).forEach((b) => b.remove());
    const el = document.createElement('div');
    el.className = 'banner ' + kind;
    el.textContent = text;
    if (kind !== 'over') el.addEventListener('animationend', () => el.remove());
    fx.appendChild(el);
  }

  const CHAIN_COLORS = ['#ffffff', '#ffe066', '#7cf29c', '#7cc4ff', '#ff9bd2', '#ffb35c', '#ff6b6b'];
  function chainFx(n, faceSrc, pos) {
    const el = document.createElement('div');
    el.className = 'chain-pop';
    const margin = (game ? game.cs : 30) * 1.7;
    el.style.left = Math.min(Math.max(pos.x, margin), fx.clientWidth - margin) + 'px';
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
    fx.appendChild(el);

    if (n >= 4 && faceSrc) {
      $$('.cutin', fx).forEach((c) => c.remove());
      const cut = document.createElement('div');
      cut.className = 'cutin';
      const img = document.createElement('img');
      img.src = faceSrc;
      img.alt = '';
      const txt = document.createElement('span');
      txt.textContent = n >= 7 ? 'ばよえ〜ん!!' : n + 'れんさ!!';
      cut.append(img, txt);
      cut.addEventListener('animationend', () => cut.remove());
      fx.appendChild(cut);
    }
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
    const items = $$('button, input', root).filter((el) => el.offsetParent !== null && !el.disabled);
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
    releaseAll();
    $('#pause-modal').hidden = !on;
    if (on) $('#btn-resume').focus();
  }
  $('#btn-pause').addEventListener('click', () => setPause(true));
  $('#btn-resume').addEventListener('click', () => setPause(false));
  $('#btn-restart').addEventListener('click', () => {
    Sound.play('decide');
    startGame(lastMode);
  });
  $('#btn-quit').addEventListener('click', () => {
    Sound.play('decide');
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

  function showResult(r) {
    const mode = game.mode;
    game = null;
    for (const [src, c] of Object.entries(r.popStats)) stats.pops[src] = (stats.pops[src] || 0) + c;
    store.set('stats', stats);

    $('#result-title').textContent = r.reason === 'timeup' ? 'タイムアップ！' : 'ばたんきゅ〜';
    $('#result-mode').textContent = MODE_NAME[mode];
    $('#result-score').textContent = r.score.toLocaleString();
    $('#result-chain').textContent = r.maxChain;
    $('#result-pieces').textContent = r.pieces;
    const top = Object.entries(r.popStats).sort((a, b) => b[1] - a[1])[0];
    $('#result-face').src = top ? top[0] : CFG.faces[Math.floor(Math.random() * CFG.faces.length)].src;

    const list = ranking[mode];
    const pos = list.filter((e) => e.score >= r.score).length;
    pending = r.score > 0 && pos < 10 ? { mode, score: r.score, chain: r.maxChain } : null;
    $('#rankin').hidden = !pending;
    if (pending) {
      $('#rankin-pos').textContent = pos + 1;
      $('#name-input').value = store.get('name', '');
      $('#name-form').hidden = false;
    }
    show('result');
    if (pending) $('#name-input').focus();
  }

  $('#name-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pending) return;
    const name = $('#name-input').value.trim().slice(0, 10) || 'ななし';
    store.set('name', name);
    lastEntryId = Date.now();
    const list = ranking[pending.mode];
    list.push({ id: lastEntryId, name, score: pending.score, chain: pending.chain, date: lastEntryId });
    list.sort((a, b) => b.score - a.score);
    ranking[pending.mode] = list.slice(0, 10);
    store.set('ranking', ranking);
    rankTab = pending.mode;
    pending = null;
    Sound.play('decide');
    show('ranking');
  });

  $('#btn-retry').addEventListener('click', () => {
    Sound.play('decide');
    startGame(lastMode);
  });

  // ---------------- ランキング ----------------
  let rankTab = 'endless';
  function renderRanking() {
    $$('#rank-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === rankTab));
    const ol = $('#rank-list');
    ol.textContent = '';
    const list = ranking[rankTab];
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'まだ きろくがないよ';
      ol.appendChild(li);
      return;
    }
    list.forEach((e, i) => {
      const li = document.createElement('li');
      if (e.id === lastEntryId) li.className = 'me';
      const pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = i + 1;
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = e.name;
      const sub = document.createElement('small');
      const d = new Date(e.date);
      sub.textContent = `${d.getMonth() + 1}/${d.getDate()}  さいだい${e.chain}れんさ`;
      who.appendChild(sub);
      const pts = document.createElement('span');
      pts.className = 'pts';
      pts.textContent = e.score.toLocaleString();
      li.append(pos, who, pts);
      ol.appendChild(li);
    });
  }
  $$('#rank-tabs button').forEach((b) => b.addEventListener('click', () => {
    rankTab = b.dataset.tab;
    Sound.play('select');
    renderRanking();
  }));
  $('#btn-rank-reset').addEventListener('click', () => {
    if (!ranking[rankTab].length) return;
    if (!confirm(`${MODE_NAME[rankTab]}のランキングをけしますか？`)) return;
    ranking[rankTab] = [];
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

  // ---------------- せってい ----------------
  function renderSettings() {
    $$('.seg').forEach((seg) => {
      const key = seg.dataset.key;
      $$('button', seg).forEach((b) => b.classList.toggle('active', b.dataset.val === String(settings[key])));
    });
    $('#volume').value = settings.volume;
  }
  $$('.seg').forEach((seg) => {
    const key = seg.dataset.key;
    $$('button', seg).forEach((b) => b.addEventListener('click', () => {
      const v = b.dataset.val;
      settings[key] = key === 'colors' ? +v : v === 'true' ? true : v === 'false' ? false : v;
      saveSettings();
      renderSettings();
      Sound.play('select');
    }));
  });
  $('#volume').addEventListener('input', (e) => {
    settings.volume = +e.target.value;
    saveSettings();
  });
  $('#volume').addEventListener('change', () => Sound.play('decide'));

  // デバッグ用（ブラウザのコンソールから __satapuyo.game で中身を見られる）
  window.__satapuyo = { get game() { return game; } };

  show('title');
})();
