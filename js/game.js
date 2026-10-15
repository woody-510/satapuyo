// ぷよぷよ本体：盤面・操作・連鎖・描画
const COLS = 6;
const ROWS = 13; // y=0 は見えない13段目。y=1..12 が画面に見える
const TAU = Math.PI * 2;
const OFFS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // 子ぷよの位置（上・右・下・左）
const CHAIN_BONUS = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
const COLOR_BONUS = [0, 3, 6, 12, 24];
const groupBonus = (n) => (n >= 11 ? 10 : [0, 0, 0, 0, 0, 2, 3, 4, 5, 6, 7][n]);

const GRAVITY_BASE = { slow: 1.1, normal: 1.8, fast: 3.2 }; // マス/秒
const SOFT_SPEED = 26;
const LOCK_DELAY = 0.5;
const POP_TIME = 0.55;
const DAS_DELAY = 0.15;
const DAS_RATE = 0.045;
const PUYO_SCALE = 0.9; // マスに対するぷよの大きさ（すき間につながりの帯が見える）

class PuyoGame {
  constructor({ canvas, nextCanvas, faces, colors, faceIds, mode, speed, ghost, callbacks }) {
    this.canvas = canvas;
    this.nextCanvas = nextCanvas;
    this.ctx = canvas.getContext('2d');
    this.nctx = nextCanvas.getContext('2d');
    this.faces = faces; // 種類ごとの Image
    this.colors = colors; // 種類ごとの枠の色
    this.faceIds = faceIds; // 種類ごとの config.faces の番号（統計用）
    this.n = faces.length;
    this.mode = mode;
    this.speed = speed;
    this.ghost = ghost;
    this.cb = callbacks;

    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.queue = [];
    this.score = 0;
    this.chain = 0;
    this.lastChain = 0;
    this.maxChain = 0;
    this.pieces = 0;
    this.level = 0;
    this.totalTime = mode === 'time' ? window.GAME_CONFIG.timeAttackSeconds : 0;
    this.timeLeft = this.totalTime;
    this.elapsed = 0;
    this.timeUp = false;
    this.phase = 'ready';
    this.phaseT = 0;
    this.goShown = false;
    this.pair = null;
    this.held = { left: false, right: false, down: false };
    this.das = { dir: 0, t: 0, r: 0 };
    this.particles = [];
    this.shake = 0;
    this.paused = false;
    this.done = false;
    this.quickTurn = 0;
    this.popStats = {};
    this.cs = 32;
    this.dpr = 1;
    this.sprites = [];
    while (this.queue.length < 3) this.queue.push(this.randomPair());
    this.cb.banner('READY?', 'ready');
  }

  // ---------------- サイズ・スプライト ----------------
  resize(cs) {
    this.cs = cs;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const d = this.dpr;
    this.canvas.width = Math.round(COLS * cs * d);
    this.canvas.height = Math.round(12 * cs * d);
    this.canvas.style.width = COLS * cs + 'px';
    this.canvas.style.height = 12 * cs + 'px';
    const nw = cs * 2.3, nh = cs * 3.6;
    this.nextCanvas.width = Math.round(nw * d);
    this.nextCanvas.height = Math.round(nh * d);
    this.nextCanvas.style.width = nw + 'px';
    this.nextCanvas.style.height = nh + 'px';
    const size = Math.round(cs * d);
    this.sprites = this.faces.map((img, t) => PuyoGame.makeSprite(img, this.colors[t], size));
    this.drawNext();
  }

  static makeSprite(img, color, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = size / 2;
    const ring = Math.max(2, size * 0.085);
    g.beginPath();
    g.arc(r, r, r - 0.5, 0, TAU);
    g.fillStyle = color;
    g.fill();
    g.save();
    g.beginPath();
    g.arc(r, r, r - ring, 0, TAU);
    g.clip();
    if (img && img.complete && img.naturalWidth) {
      // サイズがバラバラでも中央を正方形に切り抜く
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
      g.drawImage(img, sx, sy, s, s, ring, ring, size - ring * 2, size - ring * 2);
      g.globalAlpha = 0.14;
      g.fillStyle = color;
      g.fillRect(0, 0, size, size);
      g.globalAlpha = 1;
    } else {
      // 画像が読めなかったときは普通のぷよ
      g.fillStyle = color;
      g.fillRect(0, 0, size, size);
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(r * 0.7, r * 0.9, r * 0.2, r * 0.28, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(r * 1.3, r * 0.9, r * 0.2, r * 0.28, 0, 0, TAU); g.fill();
      g.fillStyle = '#222';
      g.beginPath(); g.arc(r * 0.74, r * 0.98, r * 0.1, 0, TAU); g.fill();
      g.beginPath(); g.arc(r * 1.26, r * 0.98, r * 0.1, 0, TAU); g.fill();
    }
    const shade = g.createRadialGradient(r * 0.75, r * 0.6, r * 0.2, r, r, r);
    shade.addColorStop(0, 'rgba(255,255,255,0)');
    shade.addColorStop(0.75, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = shade;
    g.fillRect(0, 0, size, size);
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(r * 0.58, r * 0.42, r * 0.22, r * 0.12, -0.6, 0, TAU);
    g.fill();
    g.lineWidth = Math.max(1, size * 0.02);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.arc(r, r, r - g.lineWidth / 2, 0, TAU);
    g.stroke();
    return c;
  }

  // ---------------- 入力 ----------------
  setHeld(key, on) {
    this.held[key] = on;
    if (key === 'left' || key === 'right') {
      const dir = key === 'left' ? -1 : 1;
      if (on) {
        this.das = { dir, t: 0, r: 0 };
        if (this.canControl()) this.move(dir);
      } else if (this.das.dir === dir) {
        const other = this.held.left ? -1 : this.held.right ? 1 : 0;
        this.das = { dir: other, t: 0, r: 0 };
      }
    }
  }

  press(action) {
    if (!this.canControl()) return;
    if (action === 'rotR') this.rotate(1);
    else if (action === 'rotL') this.rotate(-1);
    else if (action === 'hard') this.hardDrop();
  }

  canControl() {
    return this.phase === 'fall' && this.pair && !this.paused && !this.done;
  }

  // ---------------- ルール ----------------
  randomPair() {
    return [Math.floor(Math.random() * this.n), Math.floor(Math.random() * this.n)];
  }

  cellFree(x, y) {
    if (x < 0 || x >= COLS || y >= ROWS || y < -1) return false;
    return y < 0 || !this.grid[y][x];
  }

  canPlace(x, y, r) {
    const [dx, dy] = OFFS[r];
    return this.cellFree(x, y) && this.cellFree(x + dx, y + dy);
  }

  gravity() {
    return Math.min(GRAVITY_BASE[this.speed] * (1 + this.level * 0.15), 16);
  }

  spawn() {
    while (this.queue.length < 3) this.queue.push(this.randomPair());
    const [a, b] = this.queue.shift();
    this.queue.push(this.randomPair());
    this.level = this.mode === 'time' ? Math.floor((this.totalTime - this.timeLeft) / 20) : Math.floor(this.pieces / 25);
    if (!this.canPlace(2, 1, 0)) return this.finish('gameover');
    this.pair = { x: 2, y: 1, r: 0, a, b, fall: 0, lock: 0, resets: 0, vx: 2, ang: 0, vang: 0 };
    this.phase = 'fall';
    this.phaseT = 0;
    this.drawNext();
  }

  grounded() {
    const p = this.pair;
    return !this.canPlace(p.x, p.y + 1, p.r);
  }

  touchLock() {
    const p = this.pair;
    if (this.grounded() && p.resets < 12) {
      p.lock = 0;
      p.resets++;
    }
  }

  move(dir) {
    const p = this.pair;
    if (this.canPlace(p.x + dir, p.y, p.r)) {
      p.x += dir;
      Sound.play('move');
      this.touchLock();
      return true;
    }
    return false;
  }

  rotate(dir) {
    const p = this.pair;
    const tryRot = (nr) => {
      if (this.canPlace(p.x, p.y, nr)) return [p.x, p.y];
      const [dx, dy] = OFFS[nr];
      if (this.canPlace(p.x - dx, p.y - dy, nr)) return [p.x - dx, p.y - dy]; // 壁・床キック
      return null;
    };
    let nr = (p.r + dir + 4) % 4;
    let pos = tryRot(nr);
    let turn = dir * 90;
    if (!pos && this.quickTurn > 0) {
      // 狭いところでは2回押しで上下入れ替え
      nr = (p.r + 2) % 4;
      pos = tryRot(nr);
      turn = dir * 180;
    }
    if (!pos) {
      this.quickTurn = 0.35;
      return;
    }
    this.quickTurn = 0;
    [p.x, p.y] = pos;
    p.r = nr;
    p.ang += turn;
    if (p.fall > 0 && this.grounded()) p.fall = 0;
    Sound.play('rotate');
    this.touchLock();
  }

  hardDrop() {
    const p = this.pair;
    while (this.canPlace(p.x, p.y + 1, p.r)) {
      p.y++;
      this.score += 1;
    }
    p.fall = 0;
    this.lockPair();
  }

  lockPair() {
    const p = this.pair;
    const [dx, dy] = OFFS[p.r];
    for (const [x, y, t] of [[p.x, p.y, p.a], [p.x + dx, p.y + dy, p.b]]) {
      if (y >= 0) this.grid[y][x] = { t, dy: 0, vy: 0, land: 0, pop: false };
    }
    this.pair = null;
    this.pieces++;
    Sound.play('land');
    this.applyGravity();
  }

  applyGravity() {
    for (let x = 0; x < COLS; x++) {
      let write = ROWS - 1;
      for (let y = ROWS - 1; y >= 0; y--) {
        const c = this.grid[y][x];
        if (!c) continue;
        if (y !== write) {
          this.grid[write][x] = c;
          this.grid[y][x] = null;
          c.dy = y - write;
          c.vy = 3;
          c.land = null;
        }
        write--;
      }
    }
    this.phase = 'settle';
    this.phaseT = 0;
  }

  findGroups() {
    const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const groups = [];
    for (let y = 1; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = this.grid[y][x];
        if (!c || seen[y][x]) continue;
        const group = [];
        const stack = [[x, y]];
        seen[y][x] = true;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          group.push([cx, cy]);
          for (const [dx, dy] of OFFS) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || nx >= COLS || ny < 1 || ny >= ROWS || seen[ny][nx]) continue;
            const n = this.grid[ny][nx];
            if (n && n.t === c.t) {
              seen[ny][nx] = true;
              stack.push([nx, ny]);
            }
          }
        }
        if (group.length >= 4) groups.push({ t: c.t, cells: group });
      }
    }
    return groups;
  }

  resolve() {
    const groups = this.findGroups();
    if (groups.length) {
      this.chain++;
      this.lastChain = this.chain;
      this.maxChain = Math.max(this.maxChain, this.chain);
      let count = 0, bonus = CHAIN_BONUS[Math.min(this.chain - 1, CHAIN_BONUS.length - 1)];
      const types = new Set();
      let sx = 0, sy = 0;
      for (const g of groups) {
        count += g.cells.length;
        types.add(g.t);
        bonus += groupBonus(g.cells.length);
        for (const [x, y] of g.cells) {
          this.grid[y][x].pop = true;
          sx += x;
          sy += y;
        }
      }
      bonus += COLOR_BONUS[types.size - 1];
      const gain = count * 10 * Math.min(Math.max(bonus, 1), 999);
      this.score += gain;
      const cs = this.cs;
      Sound.play('pop', this.chain);
      if (this.chain >= 3) this.shake = Math.min(0.15 + this.chain * 0.05, 0.6);
      this.cb.chain(this.chain, this.faceIds[groups[0].t], {
        x: (sx / count + 0.5) * cs,
        y: (sy / count - 0.5) * cs,
      }, gain);
      this.phase = 'pop';
      this.phaseT = 0;
      return;
    }
    if (this.chain > 0 && this.grid.every((row) => row.every((c) => !c))) {
      this.score += 2100;
      Sound.play('allClear');
      this.cb.banner('ぜんけし!!', 'allclear');
    }
    if (this.chain > 0 && this.cb.chainEnd) this.cb.chainEnd(this.chain);
    this.chain = 0;
    if (this.grid[1][2]) return this.finish('gameover');
    if (this.timeUp) return this.finish('timeup');
    this.spawn();
  }

  removePopped() {
    const cs = this.cs;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = this.grid[y][x];
        if (!c || !c.pop) continue;
        const id = this.faceIds[c.t];
        this.popStats[id] = (this.popStats[id] || 0) + 1;
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * TAU, sp = (2 + Math.random() * 4) * cs;
          this.particles.push({
            x: (x + 0.5) * cs, y: (y - 0.5) * cs,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - cs * 2,
            life: 0.5 + Math.random() * 0.4, age: 0,
            r: cs * (0.06 + Math.random() * 0.08), color: this.colors[c.t],
          });
        }
        this.grid[y][x] = null;
      }
    }
    this.applyGravity();
  }

  finish(reason) {
    this.pair = null;
    this.phase = 'over';
    this.phaseT = 0;
    this.reason = reason;
    // 終わりのボイスがあるときは、効果音を重ねない
    const voice = Sound.hasVoice('end');
    if (reason === 'gameover') {
      if (!voice) Sound.play('gameOver');
      this.cb.banner('ばたんきゅ〜', 'over');
      for (const row of this.grid) for (const c of row) if (c) { c.vy = -3 - Math.random() * 4; c.out = true; }
    } else {
      if (!voice) Sound.play('allClear');
      this.cb.banner('TIME UP!', 'over');
    }
    if (this.cb.over) this.cb.over(reason);
  }

  // ---------------- 毎フレーム ----------------
  update(dt) {
    if (this.paused || this.done) return;
    dt = Math.min(dt, 0.05);
    this.phaseT += dt;
    if (this.quickTurn > 0) this.quickTurn -= dt;

    if (this.phase !== 'ready' && this.phase !== 'over') {
      this.elapsed += dt;
      if (this.mode === 'time' && !this.timeUp) {
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.timeLeft === 0) {
          this.timeUp = true;
          if (this.phase === 'fall') this.finish('timeup');
        }
      }
    }

    switch (this.phase) {
      case 'ready':
        if (!this.goShown && this.phaseT > 1.0) {
          this.goShown = true;
          Sound.play('go');
          this.cb.banner('GO!', 'go');
        }
        if (this.phaseT > 1.5) this.spawn();
        break;
      case 'fall':
        this.updatePair(dt);
        break;
      case 'settle':
        this.updateSettle(dt);
        break;
      case 'pop':
        if (this.phaseT >= POP_TIME) this.removePopped();
        break;
      case 'over':
        for (const row of this.grid) for (const c of row) if (c && c.out) { c.vy += 40 * dt; c.dy += c.vy * dt; }
        if (this.phaseT > 2.0 && !this.done) {
          this.done = true;
          this.cb.end({
            score: this.score, maxChain: this.maxChain, pieces: this.pieces,
            reason: this.reason, popStats: this.popStats,
          });
        }
        break;
    }

    for (const row of this.grid) for (const c of row) if (c && c.land !== null) { c.land += dt; if (c.land > 0.25) c.land = null; }
    for (const p of this.particles) { p.age += dt; p.vy += this.cs * 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.particles = this.particles.filter((p) => p.age < p.life);
    this.shake = Math.max(0, this.shake - dt);
  }

  updatePair(dt) {
    const p = this.pair;
    const heldDir = this.das.dir;
    if (heldDir && this.held[heldDir < 0 ? 'left' : 'right']) {
      this.das.t += dt;
      if (this.das.t >= DAS_DELAY) {
        this.das.r += dt;
        while (this.das.r >= DAS_RATE) {
          this.das.r -= DAS_RATE;
          if (!this.move(heldDir)) break;
        }
      }
    }
    if (!this.grounded()) {
      const soft = this.held.down;
      p.fall += (soft ? SOFT_SPEED : this.gravity()) * dt;
      p.lock = 0;
      while (p.fall >= 1) {
        if (this.canPlace(p.x, p.y + 1, p.r)) {
          p.y++;
          p.fall -= 1;
          if (soft) this.score += 1;
        } else {
          p.fall = 0;
          break;
        }
      }
    } else {
      p.fall = 0;
      p.lock += dt * (this.held.down ? 5 : 1);
      if (p.lock >= LOCK_DELAY) return this.lockPair();
    }
    p.vx += (p.x - p.vx) * Math.min(1, dt * 28);
    p.vang += (p.ang - p.vang) * Math.min(1, dt * 26);
  }

  updateSettle(dt) {
    let moving = false, landed = false;
    for (const row of this.grid) {
      for (const c of row) {
        if (!c || c.dy >= 0) continue;
        c.vy += 75 * dt;
        c.dy += c.vy * dt;
        if (c.dy >= 0) {
          c.dy = 0;
          c.vy = 0;
          c.land = 0;
          landed = true;
        } else moving = true;
      }
    }
    if (landed) Sound.play('land');
    if (!moving) this.resolve();
  }

  // ---------------- 描画 ----------------
  render() {
    const g = this.ctx, cs = this.cs, d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, COLS * cs, 12 * cs);
    if (this.shake > 0) g.translate((Math.random() - 0.5) * cs * this.shake, (Math.random() - 0.5) * cs * this.shake);

    // 窒息点のバツ印
    g.save();
    g.strokeStyle = 'rgba(255,80,110,0.55)';
    g.lineWidth = cs * 0.1;
    g.lineCap = 'round';
    const m = cs * 0.28;
    g.beginPath();
    g.moveTo(2 * cs + m, m); g.lineTo(3 * cs - m, cs - m);
    g.moveTo(3 * cs - m, m); g.lineTo(2 * cs + m, cs - m);
    g.stroke();
    g.restore();

    // 同じ種類どうしのつながり
    g.lineCap = 'round';
    g.lineWidth = cs * 0.5;
    for (let y = 1; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = this.grid[y][x];
        if (!this.linkable(c)) continue;
        for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
          const n = this.grid[ny]?.[nx];
          if (!this.linkable(n) || n.t !== c.t) continue;
          g.strokeStyle = this.colors[c.t];
          g.beginPath();
          g.moveTo((x + 0.5) * cs, (y - 0.5) * cs);
          g.lineTo((nx + 0.5) * cs, (ny - 0.5) * cs);
          g.stroke();
        }
      }
    }

    // 積まれたぷよ
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = this.grid[y][x];
        if (c) this.drawCell(g, c, x, y);
      }
    }

    // 落下位置ガイド
    if (this.ghost && this.pair && this.phase === 'fall') this.drawGhost(g);

    // 操作中のぷよ
    if (this.pair) {
      const p = this.pair;
      const px = (p.vx + 0.5) * cs, py = (p.y + p.fall - 0.5) * cs;
      const a = (p.vang * Math.PI) / 180;
      const cx = px + Math.sin(a) * cs, cy = py - Math.cos(a) * cs;
      const s = cs * PUYO_SCALE;
      g.drawImage(this.sprites[p.b], cx - s / 2, cy - s / 2, s, s);
      g.drawImage(this.sprites[p.a], px - s / 2, py - s / 2, s, s);
      // 軸ぷよはキラッと
      g.save();
      g.globalAlpha = 0.45 + 0.35 * Math.sin(performance.now() / 120);
      g.strokeStyle = '#fff';
      g.lineWidth = cs * 0.08;
      g.beginPath();
      g.arc(px, py, s * 0.47, 0, TAU);
      g.stroke();
      g.restore();
    }

    for (const p of this.particles) {
      g.globalAlpha = 1 - p.age / p.life;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  linkable(c) {
    return c && c.dy === 0 && !c.pop && !c.out;
  }

  drawCell(g, c, x, y) {
    const cs = this.cs;
    const cx = (x + 0.5) * cs;
    const cy = (y - 0.5 + c.dy) * cs;
    let sx = 1, sy = 1, alpha = 1, flash = false;
    if (c.land !== null) {
      const k = 1 - c.land / 0.25;
      sx = 1 + 0.16 * k;
      sy = 1 - 0.16 * k;
    }
    if (c.pop) {
      const t = this.phaseT / POP_TIME;
      if (t < 0.6) flash = Math.floor(this.phaseT / 0.07) % 2 === 0;
      else {
        const k = (t - 0.6) / 0.4;
        sx = sy = 1 + k * 0.5;
        alpha = 1 - k;
      }
    }
    if (c.out) alpha = Math.max(0, 1 - this.phaseT / 1.8);
    const size = cs * PUYO_SCALE;
    const w = size * sx, h = size * sy;
    g.globalAlpha = alpha;
    // 着地のつぶれは下端基準、消えるときは中心基準
    g.drawImage(this.sprites[c.t], cx - w / 2, c.pop ? cy - h / 2 : cy + size / 2 - h, w, h);
    if (flash) {
      g.globalAlpha = 0.7;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(cx, cy, size * 0.48, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  drawGhost(g) {
    const p = this.pair, cs = this.cs;
    const [dx, dy] = OFFS[p.r];
    const top = (x) => {
      for (let y = 0; y < ROWS; y++) if (this.grid[y][x]) return y - 1;
      return ROWS - 1;
    };
    let spots;
    if (dx === 0) {
      const land = top(p.x);
      const lower = dy > 0 ? p.b : p.a, upper = dy > 0 ? p.a : p.b;
      spots = [[p.x, land, lower], [p.x, land - 1, upper]];
    } else {
      spots = [[p.x, top(p.x), p.a], [p.x + dx, top(p.x + dx), p.b]];
    }
    for (const [x, y, t] of spots) {
      if (y < 1) continue;
      g.globalAlpha = 0.75;
      g.fillStyle = this.colors[t];
      g.strokeStyle = '#fff';
      g.lineWidth = cs * 0.05;
      g.beginPath();
      g.arc((x + 0.5) * cs, (y - 0.5) * cs, cs * 0.17, 0, TAU);
      g.fill();
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  drawNext() {
    const g = this.nctx, cs = this.cs, d = this.dpr;
    if (!this.sprites.length) return;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, cs * 2.3, cs * 3.6);
    const [a1, b1] = this.queue[0];
    const [a2, b2] = this.queue[1];
    const s2 = cs * 0.78;
    g.drawImage(this.sprites[b1], cs * 0.1, cs * 0.15, cs, cs);
    g.drawImage(this.sprites[a1], cs * 0.1, cs * 1.15, cs, cs);
    g.drawImage(this.sprites[b2], cs * 1.35, cs * 1.4, s2, s2);
    g.drawImage(this.sprites[a2], cs * 1.35, cs * 1.4 + s2, s2, s2);
  }
}
