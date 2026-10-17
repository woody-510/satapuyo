// CPU対戦の思考：置ける場所を盤面のコピーで全部ためして、いちばん良さそうな所に置く
//   よわい … 同じ色をくっつけるだけ（連鎖は考えない）
//   ふつう … 連鎖をねらうけど 2〜3れんさ くらいで撃つ
//   つよい … 次のぷよまで先読みして 4〜7れんさ を組み立ててから撃つ
(() => {
  const W = 6, H = 13; // game.js と同じ（y=0 は見えない13段目）
  const EMPTY = -1, GARB = -2;
  const OFFS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const CHAIN_BONUS = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
  const COLOR_BONUS = [0, 3, 6, 12, 24];
  const groupBonus = (n) => (n >= 11 ? 10 : [0, 0, 0, 0, 0, 2, 3, 4, 5, 6, 7][n]);
  const rnd = (n) => Math.floor(Math.random() * n);

  // ---------------- 盤面シミュレーション（Int8Array。-1=空, -2=おじゃま, 0〜=色） ----------------
  const seen = new Uint8Array(W * H);
  const mark = new Uint8Array(W * H);
  const stack = new Int16Array(W * H);
  const cells = new Int16Array(W * H);

  function fromGrid(grid) {
    const b = new Int8Array(W * H).fill(EMPTY);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = grid[y][x];
        if (c) b[y * W + x] = c.t < 0 ? GARB : c.t;
      }
    }
    return b;
  }

  // その列で次にぷよが入るマスの y（いっぱいなら -1）
  function topY(b, x) {
    for (let y = H - 1; y >= 0; y--) if (b[y * W + x] === EMPTY) return y;
    return -1;
  }
  const heightOf = (b, x) => H - 1 - topY(b, x);
  const dead = (b) => b[W + 2] !== EMPTY; // 3列目の12段目（バツ印）がうまったら負け

  function settle(b) {
    for (let x = 0; x < W; x++) {
      let w = H - 1;
      for (let y = H - 1; y >= 0; y--) {
        const v = b[y * W + x];
        if (v === EMPTY) continue;
        if (y !== w) {
          b[w * W + x] = v;
          b[y * W + x] = EMPTY;
        }
        w--;
      }
    }
  }

  // 連鎖を最後まで進める（b は書きかわる）。点数の計算は game.js と同じ
  function chain(b) {
    let n = 0, score = 0;
    for (;;) {
      seen.fill(0);
      mark.fill(0);
      let count = 0, bonus = 0, colors = 0;
      for (let i = W; i < W * H; i++) {
        const t = b[i];
        if (t < 0 || seen[i]) continue;
        let sp = 0, k = 0;
        stack[sp++] = i;
        seen[i] = 1;
        while (sp) {
          const j = stack[--sp];
          cells[k++] = j;
          const x = j % W;
          if (x > 0 && !seen[j - 1] && b[j - 1] === t) { seen[j - 1] = 1; stack[sp++] = j - 1; }
          if (x < W - 1 && !seen[j + 1] && b[j + 1] === t) { seen[j + 1] = 1; stack[sp++] = j + 1; }
          if (j >= 2 * W && !seen[j - W] && b[j - W] === t) { seen[j - W] = 1; stack[sp++] = j - W; }
          if (j + W < W * H && !seen[j + W] && b[j + W] === t) { seen[j + W] = 1; stack[sp++] = j + W; }
        }
        if (k >= 4) {
          count += k;
          bonus += groupBonus(k);
          colors |= 1 << t;
          for (let m = 0; m < k; m++) mark[cells[m]] = 1;
        }
      }
      if (!count) break;
      n++;
      // となりのおじゃまも消える
      for (let i = W; i < W * H; i++) {
        if (mark[i] !== 1) continue;
        const x = i % W;
        if (x > 0 && b[i - 1] === GARB) mark[i - 1] = 2;
        if (x < W - 1 && b[i + 1] === GARB) mark[i + 1] = 2;
        if (i >= 2 * W && b[i - W] === GARB) mark[i - W] = 2;
        if (i + W < W * H && b[i + W] === GARB) mark[i + W] = 2;
      }
      for (let i = 0; i < W * H; i++) if (mark[i]) b[i] = EMPTY;
      let nc = 0;
      for (let m = colors; m; m &= m - 1) nc++;
      bonus += CHAIN_BONUS[Math.min(n - 1, CHAIN_BONUS.length - 1)] + COLOR_BONUS[nc - 1];
      score += count * 10 * Math.min(Math.max(bonus, 1), 999);
      settle(b);
    }
    let allClear = n > 0;
    if (allClear) for (let i = 0; i < W * H; i++) if (b[i] !== EMPTY) { allClear = false; break; }
    return { chain: n, score, allClear };
  }

  // 出てくる位置（3列目）から横に動いて行ける列。12段目までうまった列はこえられない
  function reach(b) {
    const ok = [false, false, false, false, false, false];
    if (b[W + 2] !== EMPTY || b[2] !== EMPTY) return ok;
    ok[2] = true;
    for (let x = 1; x >= 0 && b[W + x] === EMPTY; x--) ok[x] = true;
    for (let x = 3; x < W && b[W + x] === EMPTY; x++) ok[x] = true;
    return ok;
  }

  // 置き方の一覧 [x, r]（同じ色のペアは向きが重なるので半分）
  function placements(b, a, c) {
    const ok = reach(b), out = [];
    for (let x = 0; x < W; x++) {
      if (!ok[x]) continue;
      for (let r = 0; r < 4; r++) {
        if (a === c && r >= 2) continue;
        const cx = x + OFFS[r][0];
        if (cx < 0 || cx >= W || !ok[cx]) continue;
        out.push([x, r]);
      }
    }
    return out;
  }

  // ペアを置いた盤面（連鎖はまだ）。a が軸、c が子
  function place(b, x, r, a, c) {
    const nb = b.slice();
    const dx = OFFS[r][0], dy = OFFS[r][1];
    if (dx === 0) {
      const top = topY(nb, x);
      if (top >= 0) nb[top * W + x] = dy > 0 ? c : a;
      if (top >= 1) nb[(top - 1) * W + x] = dy > 0 ? a : c;
    } else {
      let t = topY(nb, x);
      if (t >= 0) nb[t * W + x] = a;
      t = topY(nb, x + dx);
      if (t >= 0) nb[t * W + x + dx] = c;
    }
    return nb;
  }

  // 「あと1〜2個おいたら何れんさ起きるか」の最大（連鎖の種がどれだけ育っているか）
  function potential(b, n) {
    let best = 0, triggers = 0;
    for (let x = 0; x < W; x++) {
      const top = topY(b, x);
      if (top < 1) continue;
      const i = top * W + x;
      for (let c = 0; c < n; c++) {
        // となりに同じ色がない所に置いても消えない
        if (!((x > 0 && b[i - 1] === c) || (x < W - 1 && b[i + 1] === c) || (top < H - 1 && b[i + W] === c))) continue;
        let nb = b.slice();
        nb[i] = c;
        let r = chain(nb);
        if (!r.chain && top >= 2) {
          nb = b.slice();
          nb[i] = c;
          nb[i - W] = c;
          r = chain(nb);
        }
        if (r.chain > best) best = r.chain;
        if (r.chain >= 2) triggers++;
      }
    }
    return { chain: best, triggers };
  }

  function features(b) {
    let conn = 0, count = 0;
    for (let i = W; i < W * H; i++) {
      const t = b[i];
      if (t === EMPTY) continue;
      count++;
      if (t < 0) continue;
      if (i % W < W - 1 && b[i + 1] === t) conn++;
      if (i + W < W * H && b[i + W] === t) conn++;
    }
    const h = [];
    for (let x = 0; x < W; x++) h.push(heightOf(b, x));
    return { conn, count, h };
  }

  // 高く積みすぎない。3列目（バツ印の列）はとくに低く
  function heightPenalty(h, safe) {
    let p = 0;
    for (let x = 0; x < W; x++) if (h[x] > safe) p += (h[x] - safe) * (h[x] - safe) * 40;
    if (h[2] > safe - 1) p += (h[2] - safe + 1) * 1500;
    return p;
  }

  function bumpPenalty(h) {
    let p = 0;
    for (let x = 0; x < W - 1; x++) {
      const d = Math.abs(h[x] - h[x + 1]);
      if (d > 3) p += (d - 3) * (d - 3) * 60;
    }
    return p;
  }

  // ---------------- 強さごとの考え方 ----------------
  const LEVELS = {
    // think: 置き場所を決めるまでの秒数, step: ボタンを押す間かく, fumble: わざと2番目以下を選ぶ確率
    weak: { think: [0.9, 1.4], step: 0.22, drop: 'slow', fumble: 0.25 },
    normal: { think: [0.6, 1.0], step: 0.14, drop: 'soft', fumble: 0.08 },
    strong: { think: [0.45, 0.75], step: 0.1, drop: 'soft', fumble: 0 },
  };

  class CpuBrain {
    constructor(level, n) {
      this.level = level;
      this.n = n;
      this.reroll();
    }

    // 何れんさ組んだら撃つか（撃つたびに選びなおす）
    reroll() {
      this.target = this.level === 'strong' ? [4, 5, 5, 6, 6, 7][rnd(6)] : this.level === 'normal' ? 2 + rnd(2) : 1;
    }

    // st: { b: 盤面, cur: [軸, 子], next: [軸, 子], threat: 自分に来るおじゃまの数, rivalDanger: 相手がつみあがりそう }
    // ジェネレーター：重い「つよい」は1手ごとに yield して、1フレームで考えすぎないようにする
    *think(st) {
      const L = this.level;
      const f0 = features(st.b);
      const urgent = Math.max(...f0.h) >= 10 || f0.h[2] >= 9 || st.threat >= (L === 'strong' ? 12 : 6);
      const target = st.rivalDanger ? Math.min(this.target, 2) : this.target;
      const moves = placements(st.b, st.cur[0], st.cur[1]);
      if (!moves.length) return null;
      const scored = [];
      for (const [x, r] of moves) {
        const b1 = place(st.b, x, r, st.cur[0], st.cur[1]);
        const res = chain(b1);
        let v;
        if (dead(b1)) v = -1e9;
        else if (L === 'weak') v = this.evalWeak(b1, res);
        else if (L === 'normal') v = this.evalNormal(b1, res, target, urgent);
        else v = yield* this.evalStrong(b1, res, target, urgent, st);
        scored.push({ x, r, v, chain: res.chain });
      }
      scored.sort((p, q) => q.v - p.v);
      let pick = scored[0];
      if (Math.random() < LEVELS[L].fumble) {
        const ok = scored.slice(0, 4).filter((s) => s.v > -1e8);
        if (ok.length) pick = ok[rnd(ok.length)];
      }
      return pick;
    }

    evalWeak(b, res) {
      const f = features(b);
      let v = f.conn * 40 - heightPenalty(f.h, 7) + Math.random() * 300;
      if (res.chain) v += 2500 + res.chain * 500;
      return v;
    }

    evalNormal(b, res, target, urgent) {
      const f = features(b);
      let v = f.conn * 25 - heightPenalty(f.h, 8) + Math.random() * 250;
      if (res.chain) v += res.chain >= target || urgent ? 6000 + res.score / 5 : res.chain === 1 ? 300 : 1200;
      else v += Math.min(potential(b, this.n).chain, 3) * 600;
      return v;
    }

    // 撃ったときの値うち。目標に届かない小さい連鎖は、組んだ形がくずれるのでマイナス
    fireValue(res, target, urgent) {
      if (res.chain >= target || urgent) return 1e6 + res.score + (res.allClear ? 5e5 : 0);
      return res.chain === 1 ? -800 : -2500;
    }

    staticStrong(b, target) {
      const f = features(b);
      const pot = potential(b, this.n);
      let v = pot.chain * 1000 + Math.min(pot.triggers, 6) * 50 + f.conn * 30 - heightPenalty(f.h, 9) - bumpPenalty(f.h);
      if (pot.chain >= target) v += 2000;
      return v;
    }

    *evalStrong(b1, r1, target, urgent, st) {
      let base = 0;
      if (r1.chain) {
        base = this.fireValue(r1, target, urgent);
        if (base > 0) return base; // 撃ちどき
      }
      // 次のぷよの置き方まで考える
      let best = -1e9;
      for (const [x, r] of placements(b1, st.next[0], st.next[1])) {
        const b2 = place(b1, x, r, st.next[0], st.next[1]);
        const r2 = chain(b2);
        if (dead(b2)) continue;
        let v = this.staticStrong(b2, target);
        if (r2.chain) {
          const fire = this.fireValue(r2, target, urgent);
          v = fire > 0 ? fire * 0.5 : v + fire;
        }
        if (v > best) best = v;
      }
      yield;
      return base + best;
    }
  }

  // ---------------- ボタン操作 ----------------
  // 置き場所を決めたら、人と同じように回転・移動のボタンを押して運ぶ
  class CpuPlayer {
    constructor(game, level, rival = null) {
      this.game = game;
      this.rival = rival;
      this.level = level;
      this.cfg = LEVELS[level] || LEVELS.normal;
      this.brain = new CpuBrain(level, game.n);
      this.pair = null;
      this.task = null;
      this.plan = null;
      this.wait = 0;
      this.stuck = 0;
    }

    state() {
      const g = this.game, p = g.pair;
      let rivalDanger = false;
      if (this.rival) {
        const h = features(fromGrid(this.rival.grid)).h;
        rivalDanger = h[2] >= 10 || Math.max(...h) >= 12;
      }
      return {
        b: fromGrid(g.grid),
        cur: [p.a, p.b],
        next: g.queue[0],
        threat: g.ojama.ready + g.ojama.wait,
        rivalDanger,
      };
    }

    update(dt) {
      const g = this.game;
      if (g.paused || g.done || g.phase !== 'fall' || !g.pair) {
        if (g.held.down) g.setHeld('down', false);
        return;
      }
      if (g.pair !== this.pair) {
        // 新しいぷよが出てきた
        this.pair = g.pair;
        this.plan = null;
        this.stuck = 0;
        this.arrived = false;
        if (g.held.down) g.setHeld('down', false);
        const [lo, hi] = this.cfg.think;
        this.wait = lo + Math.random() * (hi - lo);
        this.task = this.brain.think(this.state());
      }
      if (this.task) {
        const end = performance.now() + 4;
        for (;;) {
          const s = this.task.next();
          if (s.done) {
            this.task = null;
            this.plan = s.value || { x: 2, r: 0, chain: 0 };
            if (this.plan.chain) this.brain.reroll();
            break;
          }
          if (performance.now() > end) break;
        }
      }
      this.wait -= dt;
      if (!this.plan || this.wait > 0) return;
      this.wait = this.cfg.step;
      this.act();
    }

    act() {
      const g = this.game, p = g.pair, plan = this.plan;
      if (p.r !== plan.r) {
        const before = p.r;
        g.press((plan.r - p.r + 4) % 4 === 3 ? 'rotL' : 'rotR');
        if (p.r === before && ++this.stuck > 3) plan.r = p.r; // 回れないときはあきらめる
        return;
      }
      if (p.x !== plan.x) {
        if (!g.move(plan.x > p.x ? 1 : -1) && ++this.stuck > 3) plan.x = p.x;
        return;
      }
      // 置き場所の上についた
      if (this.cfg.drop === 'hard') g.press('hard');
      else if (this.cfg.drop === 'soft' || this.arrived) g.setHeld('down', true);
      else {
        this.arrived = true; // よわいは少しだけ自然に落としてから
        this.wait = 0.35;
      }
    }
  }

  const Sim = { fromGrid, topY, heightOf, dead, chain, placements, place, potential, features, W, H, EMPTY, GARB };
  if (typeof window !== 'undefined') Object.assign(window, { CpuPlayer, CpuBrain, PuyoSim: Sim });
  if (typeof module === 'object' && module.exports) module.exports = { Sim, CpuBrain, CpuPlayer, LEVELS };
})();
