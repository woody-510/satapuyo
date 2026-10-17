// CPU対戦：ふたつの盤面のあいだで おじゃまぷよ をやりとりする（ぷよぷよ通のルール）
//   ・連鎖の点数 ÷ 70（レート）がおじゃまの数。あまりの点数は次に持ちこす
//   ・自分に来ている予告ぷよは、自分の連鎖で相殺できる
//   ・相手の連鎖中に送られたおじゃまは、相手の連鎖が終わってから「次に降る」になる
//   ・ぷよを置いて連鎖が終わったときに、最大30個（5段）ずつ降る
//   ・ぜんけしすると、次の連鎖に 2100点ぶん（30個）上乗せ
//   ・マージンタイムをすぎると、16秒ごとにレートが下がって おじゃまが増える
//   ・ふたりに同じ順番のぷよが来る（最初の2手は3色だけ）
(() => {
  class Versus {
    constructor({ n, level, cfg = {} }) {
      this.n = n;
      this.level = level;
      this.rate = cfg.targetPoint || 70;
      this.margin = cfg.marginTime ?? 96;
      this.pairs = [];
      this.time = 0;
      this.result = null; // 'win' | 'lose' | 'draw'（プレイヤーから見て）
      this.dead = new Set();
      this.me = null;
      this.cpu = null;
      this.ai = null;
      this.side = new Map();
    }

    attach(me, cpu) {
      this.me = me;
      this.cpu = cpu;
      for (const g of [me, cpu]) this.side.set(g, { carry: 0, allClear: false });
      this.ai = new CpuPlayer(cpu, this.level, me);
    }

    rival(g) {
      return g === this.me ? this.cpu : this.me;
    }

    pair(i) {
      while (this.pairs.length <= i) {
        const k = this.pairs.length < 2 ? Math.min(3, this.n) : this.n;
        this.pairs.push([Math.floor(Math.random() * k), Math.floor(Math.random() * k)]);
      }
      return this.pairs[i].slice();
    }

    targetPoint() {
      const over = this.time - this.margin;
      if (over < 0) return this.rate;
      return Math.max(1, Math.floor(this.rate * Math.pow(0.75, Math.floor(over / 16) + 1)));
    }

    // 連鎖の1回ごと：点数をおじゃまに変えて、まず自分への予告と相殺、のこりを相手へ
    link(g, gain) {
      const s = this.side.get(g), target = this.targetPoint();
      s.carry += gain;
      if (s.allClear) {
        s.carry += 2100;
        s.allClear = false;
      }
      let n = Math.floor(s.carry / target);
      s.carry -= n * target;
      const o = g.ojama;
      const a = Math.min(n, o.ready);
      o.ready -= a;
      n -= a;
      const b = Math.min(n, o.wait);
      o.wait -= b;
      n -= b;
      if (n > 0) this.rival(g).ojama.wait += n;
    }

    // 連鎖が終わったら、相手に送ったぶんが「次に降る」になる
    chainDone(g, chain, cleared) {
      if (cleared) this.side.get(g).allClear = true;
      const o = this.rival(g).ojama;
      o.ready += o.wait;
      o.wait = 0;
    }

    over(g, reason) {
      if (reason === 'gameover') this.dead.add(g);
    }

    get started() {
      return this.time > 0;
    }

    setPaused(on) {
      this.me.paused = on;
      this.cpu.paused = on;
    }

    update(dt) {
      if (!this.result && !this.me.paused && this.me.phase !== 'ready') this.time += Math.min(dt, 0.05);
      this.me.update(dt);
      this.ai.update(dt);
      this.cpu.update(dt);
      if (!this.result && this.dead.size) {
        const meDead = this.dead.has(this.me), cpuDead = this.dead.has(this.cpu);
        this.result = meDead && cpuDead ? 'draw' : meDead ? 'lose' : 'win';
        if (!meDead) this.me.finish('win');
        if (!cpuDead) this.cpu.finish('win');
      }
    }
  }

  window.Versus = Versus;
})();
