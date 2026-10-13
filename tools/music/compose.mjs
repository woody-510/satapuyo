// さたぷよ BGM を作るスクリプト（シンセも作曲もこの中にぜんぶ入っている）
//
//   node tools/music/compose.mjs              → 3曲ぜんぶ作る
//   node tools/music/compose.mjs title game   → 指定した曲だけ
//
// 必要なもの: Node.js 18 以上 / ffmpeg（PATH に通っていること）
// できあがり: assets/sound/bgm_title.mp3, bgm_menu.mp3, bgm_game.mp3
//
// ループのしくみ：曲を3回ぶん続けて鳴らして、2回目だけを切り出す（前の回の残響が乗るので
// つなぎ目で音が切れない）。ファイルの後ろに少し余分をつけておき、ゲーム側では
// loopStart〜loopEnd（js/config.js）の間をくり返す。mp3 の頭の無音がどれだけあってもずれない。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'assets', 'sound');
const SR = 44100;
const TAIL = 0.3; // ループの後ろにつけ足す秒数
const LOOP_START = 0.1; // ゲーム側のループ開始位置（秒）
const PRE = SR; // 先頭の余白（人間っぽいズレで前に出る音のため）
const TAU = Math.PI * 2;

// ---------------- 小物 ----------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash01(n) {
  let x = (n * 0x9e3779b1) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x / 4294967296;
}
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error('音名がおかしい: ' + n);
  return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const panGains = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

// "C5 . E5 - G5" → 音の並び。「.」はのばす、「-」は休み
function seq(str, step = 0.5, start = 0) {
  const toks = str.trim().split(/\s+/);
  const out = [];
  toks.forEach((tk, i) => {
    if (tk === '.' || tk === '-') return;
    let len = 1;
    while (toks[i + len] === '.') len++;
    out.push({ beat: start + i * step, len: len * step, note: midi(tk) });
  });
  return out;
}

// コードの構成音（C を 0 とした半音）
const CHORD = {
  C: [0, 4, 7], Dm: [2, 5, 9], Dm7: [2, 5, 9, 12], Em: [4, 7, 11], E: [4, 8, 11],
  F: [5, 9, 12], G: [7, 11, 14], Am: [9, 12, 16],
};
const rootOf = (name) => CHORD[name][0] % 12;

// ---------------- フィルター・発振 ----------------
class Biquad {
  constructor(type, f, q = 0.707) {
    this.type = type;
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(f, q);
  }
  set(f, q = this.q) {
    this.q = q;
    const w = (TAU * Math.min(Math.max(f, 10), SR * 0.45)) / SR;
    const cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (this.type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (this.type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; } // bp
    const a0 = 1 + al;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0; this.a2 = (1 - al) / a0;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const osc = {
  sine: (ph) => Math.sin(TAU * ph),
  tri: (ph) => 1 - 4 * Math.abs(ph - 0.5),
  // ファミコン風の16段階の三角波
  nestri: (ph) => Math.round((1 - 4 * Math.abs(ph - 0.5) + 1) * 7.5) / 7.5 - 1,
  saw: (ph, dt) => 2 * ph - 1 - blep(ph, dt),
  pulse: (ph, dt, duty) => {
    let v = ph < duty ? 1 : -1;
    v += blep(ph, dt);
    let t2 = ph - duty;
    if (t2 < 0) t2 += 1;
    return v - blep(t2, dt);
  },
};

// ファミコン風ノイズ（15bit LFSR）
class Lfsr {
  constructor(short = false) { this.reg = 1; this.short = short; this.acc = 0; this.out = 1; }
  next(rate) {
    this.acc += rate / SR;
    while (this.acc >= 1) {
      this.acc -= 1;
      const bit = (this.reg ^ (this.reg >> (this.short ? 6 : 1))) & 1;
      this.reg = (this.reg >> 1) | (bit << 14);
      this.out = this.reg & 1 ? -1 : 1;
    }
    return this.out;
  }
}

// ---------------- 楽器 ----------------
// どの楽器も (L, R, s0, opts, rand) で、s0 サンプル目から書きこむ
function add(L, R, i, v, gl, gr) {
  if (i < 0 || i >= L.length) return;
  L[i] += v * gl;
  R[i] += v * gr;
}

function synth(L, R, s0, o, rand) {
  const {
    freq, dur, wave = 'saw', duty = 0.5, vel = 0.5, pan = 0, a = 0.005, d = 0.3, s = 0.7, r = 0.08,
    vib = 0, vibRate = 5.5, vibDelay = 0.2, unison = 1, detune = 0, filter = null, arp = null, arpRate = 20,
    pitchDrop = 0, pitchDecay = 0.03, drive = 0,
  } = o;
  const n = Math.ceil((dur + r) * SR);
  const [gl, gr] = panGains(pan);
  const phases = Array.from({ length: unison }, () => (unison > 1 ? rand() : 0));
  const ratios = Array.from({ length: unison }, (_, k) =>
    unison > 1 ? Math.pow(2, ((k / (unison - 1) - 0.5) * 2 * detune) / 1200) : 1);
  const flt = filter ? new Biquad(filter.type || 'lp', filter.cutoff, filter.q || 0.8) : null;
  let relLevel = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env;
    if (t < a) env = t / a;
    else if (t < dur) env = s + (1 - s) * Math.exp(-(t - a) / d);
    else {
      if (!relLevel) relLevel = s + (1 - s) * Math.exp(-(dur - a) / d);
      env = relLevel * (1 - (t - dur) / r);
    }
    if (env <= 0) continue;
    let f = freq;
    if (arp) f = hz(arp[Math.floor(t * arpRate) % arp.length]);
    if (vib && t > vibDelay) f *= Math.pow(2, (vib * Math.sin(TAU * vibRate * (t - vibDelay)) * Math.min(1, (t - vibDelay) * 4)) / 12);
    if (pitchDrop) f *= Math.pow(2, (pitchDrop * Math.exp(-t / pitchDecay)) / 12);
    let v = 0;
    for (let k = 0; k < unison; k++) {
      const dt = (f * ratios[k]) / SR;
      phases[k] += dt;
      if (phases[k] >= 1) phases[k] -= 1;
      v += osc[wave](phases[k], dt, duty);
    }
    v /= Math.sqrt(unison);
    if (flt) {
      if ((i & 31) === 0) flt.set(filter.cutoff * (1 + (filter.env || 0) * Math.exp(-t / (filter.decay || 0.1))));
      v = flt.p(v);
    }
    if (drive) v = Math.tanh(v * drive) / Math.tanh(drive);
    add(L, R, s0 + i, v * env * vel, gl, gr);
  }
}

// エレピ（FM）
function epiano(L, R, s0, o, rand) {
  const { freq, dur, vel = 0.5, pan = 0, wobble = null } = o;
  const n = Math.ceil((dur + 0.5) * SR);
  const [gl, gr] = panGains(pan);
  let cp = rand(), mp = cp;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = (t < 0.003 ? t / 0.003 : 1) * Math.exp(-t / 1.8);
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / 0.5);
    const f = freq * (wobble ? wobble(s0 + i) : 1);
    cp += f / SR; mp += f / SR;
    const idx = 1.3 * Math.exp(-t / 0.4) + 0.35 * vel;
    let v = Math.sin(TAU * cp + idx * Math.sin(TAU * mp));
    v += 0.12 * vel * Math.sin(TAU * mp * 14) * Math.exp(-t / 0.03); // 叩いた瞬間のキラッ
    add(L, R, s0 + i, v * env * vel, gl, gr);
  }
}

// ベル（FM）
function bell(L, R, s0, o) {
  const { freq, dur, vel = 0.4, pan = 0 } = o;
  const n = Math.ceil((dur + 1.5) * SR);
  const [gl, gr] = panGains(pan);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = (t < 0.002 ? t / 0.002 : 1) * Math.exp(-t / 0.9);
    if (t > dur + 1.2) env *= Math.max(0, 1 - (t - dur - 1.2) / 0.3);
    const v = Math.sin(TAU * freq * t + 1.6 * Math.exp(-t / 0.5) * Math.sin(TAU * freq * 3.5 * t));
    add(L, R, s0 + i, v * env * vel, gl, gr);
  }
}

// ---- ドラム ----
function kick(L, R, s0, o, rand) {
  const { vel = 1, f0 = 150, f1 = 48, pdecay = 0.035, decay = 0.3, click = 0.3, drive = 1.6, len = 0.6 } = o;
  const n = Math.ceil(len * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (f1 + (f0 - f1) * Math.exp(-t / pdecay)) / SR;
    let v = Math.sin(TAU * ph) * Math.exp(-t / decay) * Math.min(1, t / 0.0015 + 0.2);
    v += click * (rand() * 2 - 1) * Math.exp(-t / 0.002);
    v = Math.tanh(v * drive) / Math.tanh(drive);
    if (t > len - 0.05) v *= (len - t) / 0.05;
    add(L, R, s0 + i, v * vel, 0.707, 0.707);
  }
}

function snare(L, R, s0, o, rand) {
  const { vel = 0.6, tone = 190, toneDecay = 0.05, noiseDecay = 0.13, hp = 1000, lp = 9000, pan = 0, len = 0.4 } = o;
  const n = Math.ceil(len * SR);
  const h = new Biquad('hp', hp), l = new Biquad('lp', lp);
  const [gl, gr] = panGains(pan);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (tone * (1 + 0.5 * Math.exp(-t / 0.01))) / SR;
    let v = 0.6 * Math.sin(TAU * ph) * Math.exp(-t / toneDecay);
    v += l.p(h.p(rand() * 2 - 1)) * Math.exp(-t / noiseDecay);
    if (t > len - 0.03) v *= (len - t) / 0.03;
    add(L, R, s0 + i, v * vel, gl, gr);
  }
}

function clap(L, R, s0, o, rand) {
  const { vel = 0.5, pan = 0 } = o;
  const n = Math.ceil(0.35 * SR);
  const f = new Biquad('bp', 1300, 1.2);
  const [gl, gr] = panGains(pan);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = Math.exp(-t / 0.11);
    for (const b of [0, 0.011, 0.022]) if (t >= b && t < b + 0.01) env = Math.max(env, Math.exp(-(t - b) / 0.004) * 1.4);
    if (t > 0.3) env *= (0.35 - t) / 0.05;
    add(L, R, s0 + i, f.p(rand() * 2 - 1) * env * vel * 2, gl, gr);
  }
}

function hat(L, R, s0, o, rand) {
  const { vel = 0.3, decay = 0.035, pan = 0, hp = 7000, len = null } = o;
  const total = len || decay * 6;
  const n = Math.ceil(total * SR);
  const h = new Biquad('hp', hp), b = new Biquad('bp', 10000, 0.8);
  const [gl, gr] = panGains(pan);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const x = rand() * 2 - 1;
    let env = Math.exp(-t / decay);
    if (t > total - 0.01) env *= Math.max(0, (total - t) / 0.01);
    add(L, R, s0 + i, (h.p(x) * 0.7 + b.p(x) * 0.5) * env * vel, gl, gr);
  }
}

// ノイズのシェイカー：ゆっくり立ち上がって「シャッ」
function shaker(L, R, s0, o, rand) {
  const { vel = 0.2, pan = 0, center = 7000, attack = 0.012, decay = 0.045 } = o;
  const n = Math.ceil((attack + decay * 5) * SR);
  const b = new Biquad('bp', center, 1.1), h = new Biquad('hp', 4000);
  const [gl, gr] = panGains(pan);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = t < attack ? (t / attack) ** 2 : Math.exp(-(t - attack) / decay);
    add(L, R, s0 + i, h.p(b.p(rand() * 2 - 1)) * env * vel * 2.2, gl, gr);
  }
}

function crash(L, R, s0, o, rand) {
  const { vel = 0.3, len = 1.6 } = o;
  const n = Math.ceil(len * SR);
  const h = new Biquad('hp', 3500);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = Math.exp(-t / 0.55) * Math.min(1, t / 0.002);
    if (t > len - 0.1) env *= (len - t) / 0.1;
    const xl = h.p(rand() * 2 - 1);
    add(L, R, s0 + i, xl * env * vel, 0.8 + 0.2 * rand(), 0.8 + 0.2 * rand());
  }
}

// ノイズがだんだん上がっていく（盛り上げ用）
function riser(L, R, s0, o, rand) {
  const { dur, vel = 0.25 } = o;
  const n = Math.ceil(dur * SR);
  const b = new Biquad('bp', 400, 1.4);
  for (let i = 0; i < n; i++) {
    const t = i / SR, k = t / dur;
    if ((i & 31) === 0) b.set(400 * Math.pow(25, k), 1.4);
    const env = k * k * (k > 0.97 ? (1 - k) / 0.03 : 1);
    const v = b.p(rand() * 2 - 1) * env * vel * 3;
    add(L, R, s0 + i, v, 0.5 + 0.5 * Math.sin(k * 20), 0.5 + 0.5 * Math.cos(k * 20));
  }
}

// タム（フィル用）
function tom(L, R, s0, o, rand) {
  const { vel = 0.5, f = 140, pan = 0 } = o;
  const n = Math.ceil(0.45 * SR);
  const [gl, gr] = panGains(pan);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (f * (1 + 0.7 * Math.exp(-t / 0.02)) * (1 - 0.2 * t)) / SR;
    let v = Math.sin(TAU * ph) * Math.exp(-t / 0.17) + 0.35 * (rand() * 2 - 1) * Math.exp(-t / 0.015);
    v = Math.tanh(v * 1.8) / Math.tanh(1.8);
    if (t > 0.4) v *= (0.45 - t) / 0.05;
    add(L, R, s0 + i, v * vel, gl, gr);
  }
}

// ドーン（盛り上がりの頭に入れる低音）
function boom(L, R, s0, o) {
  const { vel = 0.6 } = o;
  const n = Math.ceil(1.4 * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (32 + 60 * Math.exp(-t / 0.12)) / SR;
    let v = Math.sin(TAU * ph) * Math.exp(-t / 0.6) * Math.min(1, t / 0.003);
    if (t > 1.3) v *= (1.4 - t) / 0.1;
    add(L, R, s0 + i, Math.tanh(v * 1.5) * vel, 0.707, 0.707);
  }
}

// ファミコン風ドラム
function chipKick(L, R, s0, o) {
  const { vel = 0.6 } = o;
  const n = Math.ceil(0.13 * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (55 + 260 * Math.exp(-t / 0.025)) / SR;
    add(L, R, s0 + i, osc.nestri(ph % 1) * vel * (1 - t / 0.13), 0.707, 0.707);
  }
}
function chipNoise(L, R, s0, o) {
  const { vel = 0.3, rate = 14000, decay = 0.08, short = false, len = 0.25, pan = 0, tone = 0 } = o;
  const n = Math.ceil(len * SR);
  const lf = new Lfsr(short);
  const [gl, gr] = panGains(pan);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = lf.next(rate) * Math.exp(-t / decay);
    if (tone) { ph += tone / SR; v += 0.6 * osc.nestri(ph % 1) * Math.exp(-t / 0.03); }
    if (t > len - 0.01) v *= (len - t) / 0.01;
    add(L, R, s0 + i, v * vel, gl, gr);
  }
}

// ---------------- エフェクト ----------------
class Comb {
  constructor(n) { this.b = new Float32Array(n); this.i = 0; this.st = 0; }
  p(x, fb, damp) {
    const y = this.b[this.i];
    this.st = y * (1 - damp) + this.st * damp;
    this.b[this.i] = x + this.st * fb;
    if (++this.i >= this.b.length) this.i = 0;
    return y;
  }
}
class AllPass {
  constructor(n) { this.b = new Float32Array(n); this.i = 0; }
  p(x) {
    const b = this.b[this.i];
    this.b[this.i] = x + b * 0.5;
    if (++this.i >= this.b.length) this.i = 0;
    return b - x;
  }
}
function reverb(inL, inR, { room = 0.82, damp = 0.3 } = {}) {
  const C = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], A = [556, 441, 341, 225];
  const cl = C.map((n) => new Comb(n)), cr = C.map((n) => new Comb(n + 23));
  const al = A.map((n) => new AllPass(n)), ar = A.map((n) => new AllPass(n + 23));
  const n = inL.length, oL = new Float32Array(n), oR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (inL[i] + inR[i]) * 0.015;
    let l = 0, r = 0;
    for (let k = 0; k < 8; k++) { l += cl[k].p(x, room, damp); r += cr[k].p(x, room, damp); }
    for (let k = 0; k < 4; k++) { l = al[k].p(l); r = ar[k].p(r); }
    oL[i] = l; oR[i] = r;
  }
  return [oL, oR];
}
function pingpong(inL, inR, { time, fb = 0.35, lp = 4500 }) {
  const d = Math.round(time * SR);
  const bl = new Float32Array(d), br = new Float32Array(d);
  const fl = new Biquad('lp', lp), fr = new Biquad('lp', lp);
  const n = inL.length, oL = new Float32Array(n), oR = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const dl = bl[j], dr = br[j];
    oL[i] = dl; oR[i] = dr;
    bl[j] = (inL[i] + inR[i]) * 0.5 + fr.p(dr) * fb;
    br[j] = fl.p(dl) * fb;
    if (++j >= d) j = 0;
  }
  return [oL, oR];
}

// ---------------- 曲の入れもの ----------------
class Song {
  constructor(name, { bpm, bars, transpose = 0, swing = 0, target = -16, masterLp = 0, masterDrive = 1 }) {
    // ループの長さは 44.1kHz でも 48kHz でもきっちり整数サンプルになるよう 147 の倍数にそろえる
    const loopS = Math.round((bars * 4 * 60 * SR) / bpm / 147) * 147;
    Object.assign(this, { name, bars, transpose, swing, target, masterLp, masterDrive, loopS });
    this.spb = loopS / SR / (bars * 4);
    this.bpm = 60 / this.spb;
    this.loop = loopS / SR;
    this.total = PRE + loopS * 3 + SR * 3;
    this.buses = new Map();
    this.events = [];
    this.kicks = [];
  }
  bus(name, opts = {}) {
    this.buses.set(name, { L: new Float32Array(this.total), R: new Float32Array(this.total), ...opts });
  }
  sec(beat) {
    const q = beat * 4;
    if (this.swing && Math.abs(q - Math.round(q)) < 1e-6 && Math.round(q) % 2 === 1) beat += this.swing * 0.25;
    return beat * this.spb;
  }
  // 楽器の音を予約する
  play(bus, beat, fn, opts = {}, lenBeats = 0) {
    const ev = { bus, beat, fn, opts: { ...opts }, human: opts.human || 0 };
    if (lenBeats) ev.opts.dur = this.sec(beat + lenBeats) - this.sec(beat);
    this.events.push(ev);
    if (fn === kick && opts.side !== false) this.kicks.push(beat);
    return ev;
  }
  note(bus, beat, lenBeats, note, opts = {}, fn = synth) {
    return this.play(bus, beat, fn, { ...opts, freq: hz(midi(note) + this.transpose) }, lenBeats);
  }
  // 1ループの中で同じ位置なら同じ値（ループのつなぎ目でゆらぎがとぎれない）
  loopPhase(sample) {
    const s = (((sample - PRE) % this.loopS) + this.loopS) % this.loopS;
    return s / this.loopS;
  }

  render() {
    const t0 = Date.now();
    this.events.forEach((ev, idx) => {
      const bus = this.buses.get(ev.bus);
      for (let k = 0; k < 3; k++) {
        const rand = rng(idx * 7919 + 17);
        const jitter = ev.human ? (rand() - 0.5) * 2 * ev.human : 0;
        const s0 = PRE + k * this.loopS + Math.round((this.sec(ev.beat) + jitter) * SR);
        ev.fn(bus.L, bus.R, s0, ev.opts, rand);
      }
    });

    // サイドチェイン（キックのたびに音量を下げる）
    const duck = new Float32Array(this.total).fill(1);
    for (const b of this.kicks) {
      for (let k = 0; k < 3; k++) {
        const s0 = PRE + k * this.loopS + Math.round(this.sec(b) * SR);
        for (let i = 0; i < 0.4 * SR; i++) {
          const t = i / SR;
          const c = Math.min(1, t / 0.004) * Math.exp(-t / 0.1);
          const j = s0 + i;
          if (j < this.total) duck[j] = Math.min(duck[j], 1 - c);
        }
      }
    }

    const mL = new Float32Array(this.total), mR = new Float32Array(this.total);
    const rvL = new Float32Array(this.total), rvR = new Float32Array(this.total);
    const dlL = new Float32Array(this.total), dlR = new Float32Array(this.total);
    for (const bus of this.buses.values()) {
      const { L, R, gain = 1, lp, hp, duckAmt = 0, drive = 0, rev = 0, dly = 0 } = bus;
      const fl = lp && [new Biquad('lp', lp), new Biquad('lp', lp)];
      const fh = hp && [new Biquad('hp', hp), new Biquad('hp', hp)];
      for (let i = 0; i < this.total; i++) {
        let l = L[i], r = R[i];
        if (fh) { l = fh[0].p(l); r = fh[1].p(r); }
        if (fl) { l = fl[0].p(l); r = fl[1].p(r); }
        if (drive) { l = Math.tanh(l * drive) / drive; r = Math.tanh(r * drive) / drive; }
        const g = gain * (duckAmt ? 1 - duckAmt * (1 - duck[i]) : 1);
        l *= g; r *= g;
        mL[i] += l; mR[i] += r;
        if (rev) { rvL[i] += l * rev; rvR[i] += r * rev; }
        if (dly) { dlL[i] += l * dly; dlR[i] += r * dly; }
      }
    }
    if (this.delay) {
      const [oL, oR] = pingpong(dlL, dlR, { ...this.delay, time: this.delay.beats * this.spb });
      for (let i = 0; i < this.total; i++) { mL[i] += oL[i]; mR[i] += oR[i]; rvL[i] += oL[i] * 0.3; rvR[i] += oR[i] * 0.3; }
    }
    const [eL, eR] = reverb(rvL, rvR, this.reverb || {});
    for (let i = 0; i < this.total; i++) { mL[i] += eL[i]; mR[i] += eR[i]; }

    // 仕上げ
    if (this.masterLp) {
      const a = new Biquad('lp', this.masterLp), b = new Biquad('lp', this.masterLp);
      for (let i = 0; i < this.total; i++) { mL[i] = a.p(mL[i]); mR[i] = b.p(mR[i]); }
    }
    const from = PRE + this.loopS;
    const to = from + this.loopS + Math.round(TAIL * SR);
    const outL = mL.slice(from, to), outR = mR.slice(from, to);
    let sum = 0;
    for (let i = 0; i < this.loopS; i++) sum += outL[i] ** 2 + outR[i] ** 2;
    const rms = Math.sqrt(sum / (this.loopS * 2));
    const g = Math.pow(10, this.target / 20) / rms;
    const k = this.masterDrive;
    let peak = 0;
    for (let i = 0; i < outL.length; i++) {
      outL[i] = Math.tanh(outL[i] * g * k) / k;
      outR[i] = Math.tanh(outR[i] * g * k) / k;
      peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
    }
    const lim = Math.min(1, 0.89 / peak);
    for (let i = 0; i < outL.length; i++) { outL[i] *= lim; outR[i] *= lim; }
    console.log(`  ${this.name}: ${this.bpm.toFixed(2)} BPM / ${this.bars}小節 / ループ ${this.loop.toFixed(4)}秒（${((Date.now() - t0) / 1000).toFixed(1)}秒で生成）`);
    return [outL, outR];
  }
}

// ===================================================================
//  タイトル：8bit チップチューンのテーマソング（D メジャー / 140 BPM / 16小節）
// ===================================================================
function titleSong() {
  const s = new Song('title', { bpm: 140, bars: 16, transpose: 2, target: -15.5, masterDrive: 1.1 });
  s.bus('lead', { gain: 1, rev: 0.12, dly: 0.2 });
  s.bus('arp', { gain: 1, rev: 0.1 });
  s.bus('bass', { gain: 1 });
  s.bus('drums', { gain: 1, rev: 0.06 });
  s.delay = { beats: 0.75, fb: 0.3, lp: 3500 };
  s.reverb = { room: 0.78, damp: 0.35 };

  const chords = ['C', 'Em', 'F', 'G', 'C', 'Em', ['F', 'G'], 'C', 'Am', 'F', 'C', 'G', 'Am', 'F', ['Dm7', 'G'], 'G'];
  const melodyA = [
    'C5 . E5 G5 . E5 G5 C6', 'B5 . . G5 . E5 . -', 'A5 . C6 A5 . F5 A5 C6', 'B5 . . . G5 . - -',
    'C6 . B5 C6 . G5 E5 G5', 'B5 . A5 G5 . E5 . -', 'A5 . G5 F5 G5 . F5 D5', 'C5 . . . - - G4 -',
  ];
  const melodyB = [
    'A4 . C5 E5 . A5 . G5', 'F5 . . E5 F5 . A5 .', 'G5 . E5 . C5 . E5 G5', 'G5 . F5 . D5 . . -',
    'A5 . G5 A5 . C6 . A5', 'F5 . A5 . C6 . D6 .', 'D6 . C6 . B5 . A5 .', 'B5 . . . G5 . D5 -',
  ];
  const lead = { wave: 'pulse', duty: 0.25, vel: 0.26, a: 0.004, d: 0.25, s: 0.65, r: 0.03, vib: 0.2, vibRate: 6, vibDelay: 0.14 };
  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  const thirdBelow = (m) => {
    const oct = Math.floor(m / 12), pc = m % 12;
    let i = SCALE.indexOf(pc);
    if (i < 0) return m - 3;
    i -= 2;
    let o = oct;
    if (i < 0) { i += 7; o--; }
    return o * 12 + SCALE[i];
  };

  [...melodyA, ...melodyB].forEach((bar, b) => {
    for (const n of seq(bar, 0.5, b * 4)) {
      s.note('lead', n.beat, n.len, n.note, lead);
      if (b >= 8) s.note('arp', n.beat, n.len, thirdBelow(n.note), { ...lead, duty: 0.5, vel: 0.08, vib: 0, pan: 0.4 });
    }
  });

  chords.forEach((c, b) => {
    const parts = Array.isArray(c) ? c : [c];
    parts.forEach((name, h) => {
      const beats = 4 / parts.length;
      const base = b * 4 + h * beats;
      // ピロピロ和音（1拍ごとに鳴らしなおす）
      const tones = CHORD[name].map((x) => 60 + x);
      const arp = [...tones, tones[0] + 12].map((m) => m + s.transpose);
      for (let k = 0; k < beats; k++) {
        s.play('arp', base + k, synth, { freq: 0, arp, arpRate: 24, wave: 'pulse', duty: 0.125, vel: 0.07, a: 0.002, d: 0.15, s: 0.35, r: 0.03, pan: -0.4 }, 0.9);
      }
      // ベース（三角波でオクターブを行き来）
      const root = 36 + rootOf(name);
      for (let k = 0; k < beats * 2; k++) {
        const pattern = b < 8 ? [0, 12] : [0, 12, 7, 12];
        const m = root + pattern[k % pattern.length];
        s.note('bass', base + k * 0.5, 0.42, m, { wave: 'nestri', vel: 0.42, a: 0.002, d: 1, s: 1, r: 0.02 });
      }
    });
  });

  for (let b = 0; b < 16; b++) {
    const B = b * 4;
    const kicks = b < 8 ? [0, 2] : [0, 1.5, 2];
    kicks.forEach((k) => s.play('drums', B + k, chipKick, { vel: 0.5 }));
    if (b === 7 || b === 15) {
      [1, 2.5, 3, 3.25, 3.5, 3.75].forEach((k, i) => s.play('drums', B + k, chipNoise, { vel: 0.16 + i * 0.02, rate: 11000, decay: 0.08, tone: 210 }));
    } else {
      [1, 3].forEach((k) => s.play('drums', B + k, chipNoise, { vel: 0.22, rate: 11000, decay: 0.09, tone: 210 }));
    }
    const step = b < 8 ? 0.5 : 0.25;
    for (let k = 0; k < 4; k += step) {
      const acc = k % 1 === 0 ? 1 : 0.6;
      s.play('drums', B + k, chipNoise, { vel: 0.07 * acc, rate: 40000, decay: 0.02, short: true, len: 0.06, pan: 0.25 });
    }
    if (b === 0 || b === 8) s.play('drums', B, chipNoise, { vel: 0.12, rate: 30000, decay: 0.5, len: 1.2 });
  }
  return s;
}

// ===================================================================
//  メニュー：ローファイ・ヒップホップ（F メジャー / 80 BPM / 16小節）
// ===================================================================
function menuSong() {
  const s = new Song('menu', { bpm: 80, bars: 16, swing: 0.3, target: -17.5, masterLp: 9000, masterDrive: 1.2 });
  s.bus('keys', { gain: 1, lp: 4800, rev: 0.22, drive: 1.3 });
  s.bus('bass', { gain: 1, lp: 700 });
  s.bus('drums', { gain: 1, lp: 7000, rev: 0.08, drive: 1.4 });
  s.bus('bell', { gain: 1, rev: 0.3, dly: 0.22, lp: 6000 });
  s.bus('vinyl', { gain: 1, lp: 6000 });
  s.delay = { beats: 0.75, fb: 0.35, lp: 3000 };
  s.reverb = { room: 0.85, damp: 0.45 };

  // テープのゆらぎ（1ループで4往復）
  const wobble = (sample) => Math.pow(2, (7 * Math.sin(TAU * 4 * s.loopPhase(sample))) / 1200);

  // [拍, 長さ, ボイシング, ベース]
  const bars = [
    [[0, 4, ['A3', 'C4', 'E4', 'G4'], 'F2']],
    [[0, 2, ['G3', 'B3', 'D4', 'E4'], 'E2'], [2, 2, ['G3', 'C#4', 'E4', 'A4'], 'A2']],
    [[0, 4, ['F3', 'A3', 'C4', 'E4'], 'D2']],
    [[0, 2, ['Eb3', 'G3', 'Bb3', 'D4'], 'C2'], [2, 2, ['Eb3', 'A3', 'C4', 'F4'], 'F2']],
    [[0, 4, ['A3', 'C4', 'D4', 'F4'], 'Bb1']],
    [[0, 4, ['G3', 'A3', 'C4', 'E4'], 'A1']],
    [[0, 4, ['F3', 'A3', 'Bb3', 'D4'], 'G1']],
    [[0, 4, ['Bb3', 'D4', 'F4', 'G4'], 'C2']],
  ];
  for (let b = 0; b < 16; b++) {
    const B = b * 4;
    for (const [at, len, voicing, root] of bars[b % 8]) {
      // エレピ：下から少しずつずらして弾く
      const hits = len === 4 ? [[0, 2.5, 0.5], [2.75, 1.1, 0.32]] : [[0, 1.6, 0.48]];
      for (const [o, l, v] of hits) {
        voicing.forEach((n, i) => s.note('keys', B + at + o, l, n, { vel: v * (0.9 + 0.1 * (i % 2)), pan: -0.3 + i * 0.2, wobble, human: 0.012 + i * 0.006 }, epiano));
      }
      // ベース
      const pat = len === 4 ? [[0, 1.4, 0], [1.75, 0.25, 0], [2.5, 1, 7], [3.5, 0.4, 12]] : [[0, 1.4, 0], [1.5, 0.4, 0]];
      for (const [o, l, iv] of pat) {
        s.note('bass', B + at + o, l, midi(root) + iv, { wave: 'tri', vel: 0.55, a: 0.01, d: 0.5, s: 0.6, r: 0.08, human: 0.008 });
      }
    }
    // ドラム（ブーンバップ）
    const kicks = b % 2 ? [0, 1.75, 2.5] : [0, 2.5];
    kicks.forEach((k, i) => s.play('drums', B + k, kick, { vel: i === 1 ? 0.45 : 0.75, f0: 110, f1: 46, decay: 0.28, click: 0.1, drive: 1.2, side: false, human: 0.006 }));
    [1, 3].forEach((k) => s.play('drums', B + k, snare, { vel: 0.42, tone: 180, lp: 4200, hp: 900, noiseDecay: 0.11, human: 0.01 }));
    for (let k = 0; k < 4; k += 0.5) s.play('drums', B + k, hat, { vel: k % 1 === 0 ? 0.13 : 0.07, decay: 0.028, hp: 6500, pan: 0.2, human: 0.006 });
    // ノイズのシェイカー（16分）
    for (let k = 0; k < 4; k += 0.25) {
      const pos = Math.round((k % 1) * 4);
      s.play('drums', B + k, shaker, { vel: [0.08, 0.035, 0.06, 0.04][pos], center: 6200, decay: 0.04, pan: -0.25, human: 0.005 });
    }
  }
  // 後半はベルのメロディ
  const bellLine = [
    '- - C5 . A5 . G5 .', 'E5 . . . - - - -', '- - D5 . F5 . A5 .', 'G5 . . . F5 . Eb5 .',
    'D5 . . . - - F5 .', 'E5 . C5 . - - A4 .', 'Bb4 . . . D5 . F5 .', 'G5 . . . . . - -',
  ];
  bellLine.forEach((bar, i) => {
    for (const n of seq(bar, 0.5, (8 + i) * 4)) s.note('bell', n.beat, n.len, n.note, { vel: 0.2, pan: 0.15, human: 0.01 }, bell);
  });
  // レコードのプチプチとサー音（ループ位置で決まるので、つなぎ目でとぎれない）
  s.play('vinyl', 0, (L, R, s0) => {
    const hiss = new Biquad('bp', 3000, 0.5);
    for (let i = s0; i < s0 + s.loopS; i++) {
      const pos = Math.round(s.loopPhase(i) * s.loopS);
      let v = hiss.p(hash01(pos) * 2 - 1) * 0.012;
      if (hash01(pos + 99991) < 0.0006) v += (hash01(pos + 7) - 0.5) * 0.35;
      add(L, R, i, v, 0.7, 0.7);
    }
  });
  return s;
}

// ===================================================================
//  ゲーム中：エレクトロ・ダンス（A マイナー / 160 BPM / 32小節）
//  A：ドラム・ベース・刻み・アルペジオ → B：メロディ・パッド・スタブ → C：展開して盛り上げ → D：全部のせ
// ===================================================================
function gameSong() {
  const s = new Song('game', { bpm: 160, bars: 32, target: -13.2, masterDrive: 1.7 });
  s.bus('kick', { gain: 1 });
  s.bus('drums', { gain: 1, rev: 0.05, drive: 1.2 });
  s.bus('bass', { gain: 1, duckAmt: 0.6, drive: 1.4 });
  s.bus('gtr', { gain: 1, duckAmt: 0.35, lp: 4200, hp: 110 });
  s.bus('arp', { gain: 1, duckAmt: 0.35, dly: 0.2, rev: 0.1, hp: 300 });
  s.bus('stab', { gain: 1, duckAmt: 0.5, rev: 0.12, hp: 300 });
  s.bus('pad', { gain: 1, duckAmt: 0.8, rev: 0.18, hp: 250 });
  s.bus('lead', { gain: 1, rev: 0.14, dly: 0.15 });
  s.bus('fx', { gain: 1, rev: 0.3 });
  s.delay = { beats: 0.75, fb: 0.32, lp: 5000 };
  s.reverb = { room: 0.8, damp: 0.3 };

  const loopChords = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'];
  const chords = [...loopChords, ...loopChords, 'Dm', 'Em', 'F', 'G', 'Dm', 'Em', 'F', 'E', ...loopChords];
  const section = (b) => (b < 8 ? 'A' : b < 16 ? 'B' : b < 24 ? 'C' : 'D');
  const BUILD = [22, 23];
  const fillBar = (b) => b === 7 || b === 15 || b === 31;

  const melody = [
    'A5 . . E5 A5 . C6 .', 'C6 . A5 . F5 . A5 C6', 'G5 . . E5 G5 . C6 .', 'B5 . A5 . G5 . D5 .',
    'E5 . A5 . C6 . E6 .', 'F6 . E6 . C6 . A5 .', 'G5 . C6 . E6 . G6 .', 'D6 . . . B5 . G5 .',
  ];
  const melodyC = [
    'F5 . . . A5 . . .', 'G5 . . . B5 . . .', 'A5 . . . C6 . . .', 'B5 . . . D6 . . .',
    'D6 . . . C6 . A5 .', 'B5 . . . G5 . E5 .', 'A5 . . . . . . .', 'G#5 . . . B5 . . .',
  ];
  const lead = { wave: 'saw', unison: 3, detune: 12, vel: 0.18, a: 0.004, d: 0.2, s: 0.8, r: 0.05, vib: 0.18, vibRate: 5.5, vibDelay: 0.16, filter: { cutoff: 3200, env: 1.2, decay: 0.15 } };
  const bassSaw = { wave: 'saw', unison: 2, detune: 14, vel: 0.36, a: 0.002, d: 0.07, s: 0.5, r: 0.03, filter: { cutoff: 360, env: 6, decay: 0.07, q: 1.4 }, drive: 2.2 };
  const bassSub = { wave: 'sine', vel: 0.32, a: 0.002, d: 1, s: 1, r: 0.03 };

  chords.forEach((name, b) => {
    const B = b * 4, sec = section(b);
    const tones = CHORD[name];
    const root = 33 + ((rootOf(name) - 9 + 12) % 12); // A1 から上
    const lastBuild = b === BUILD[1];

    // ベース：A/B は頭をあけて転がす、C/D は16分で押しっぱなし（キックで息をする）
    const bassPat = sec === 'A' || sec === 'B' ? [[0.25, 0], [0.5, 12], [0.75, 0]] : [[0, 0], [0.25, 0], [0.5, 12], [0.75, 0]];
    for (let k = 0; k < (lastBuild ? 2 : 4); k++) {
      for (const [o, iv] of bassPat) {
        s.note('bass', B + k + o, 0.2, root + iv, bassSaw);
        s.note('bass', B + k + o, 0.2, root + iv, bassSub);
      }
    }

    // ひずんだ刻み（パワーコードのブリッジミュート）。C はのばして壮大に
    const gRoot = 40 + ((rootOf(name) - 4 + 12) % 12); // E2 から上
    const power = [gRoot, gRoot + 7, gRoot + 12];
    const gtr = { wave: 'saw', unison: 2, detune: 8, a: 0.002, r: 0.04, drive: 6, filter: { cutoff: 2600 } };
    if (sec === 'C' && !BUILD.includes(b)) {
      power.forEach((m, i) => s.note('gtr', B, 4, m, { ...gtr, vel: 0.075, d: 1.5, s: 0.8, pan: [-0.6, 0.6, 0][i] }));
    } else if (!BUILD.includes(b)) {
      for (let k = 0; k < 8; k++) {
        const accent = k === 0 || k === 3 || k === 6;
        power.forEach((m, i) => s.note('gtr', B + k * 0.5, accent ? 0.4 : 0.22, m, { ...gtr, vel: (accent ? 0.075 : 0.05) * (sec === 'A' ? 0.8 : 1), d: 0.06, s: 0.25, pan: [-0.6, 0.6, 0][i] }));
      }
    }

    // ピコピコのアルペジオ（16分）
    const arpTones = [...tones.map((x) => 60 + x), 72 + tones[0]];
    const order = sec === 'D' ? [0, 1, 2, 3, 2, 3, 1, 3] : [0, 1, 2, 3, 1, 2, 3, 2];
    for (let k = 0; k < 16; k++) {
      if (lastBuild && k >= 8) break;
      s.note('arp', B + k * 0.25, 0.22, arpTones[order[k % 8]], { wave: 'pulse', duty: 0.3, vel: sec === 'A' ? 0.13 : 0.1, a: 0.001, d: 0.09, s: 0.15, r: 0.04, filter: { cutoff: 1800, env: 2.5, decay: 0.07 }, pan: k % 2 ? 0.4 : -0.4 });
    }

    // うら拍のシンセ・スタブ（B と D）
    if (sec === 'B' || sec === 'D') {
      for (let k = 0; k < 4; k++) {
        tones.forEach((x, i) => s.note('stab', B + k + 0.5, 0.2, 72 + x, { wave: 'saw', unison: 5, detune: 20, vel: 0.05, a: 0.002, d: 0.08, s: 0.3, r: 0.05, filter: { cutoff: 4500, env: 1, decay: 0.05 }, pan: [-0.4, 0.4, 0][i] }));
      }
    }

    // パッド（キックで息をする）
    if (sec !== 'A') {
      tones.forEach((x, i) => s.note('pad', B, 4, 60 + x - (i === 0 ? 12 : 0), { wave: 'saw', unison: 5, detune: 18, vel: sec === 'C' ? 0.08 : 0.065, a: 0.03, d: 1, s: 0.9, r: 0.2, filter: { cutoff: 3200 }, pan: [-0.5, 0, 0.5][i % 3] }));
    }
  });

  // リード
  const putLead = (lines, fromBar, opts, shift = 0) => lines.forEach((bar, i) => {
    for (const n of seq(bar, 0.5, (fromBar + i) * 4)) s.note('lead', n.beat, n.len, n.note + shift, opts);
  });
  putLead(melody, 8, lead);
  putLead(melodyC, 16, { ...lead, vel: 0.16, filter: { cutoff: 2400, env: 0.6, decay: 0.3 } });
  putLead(melody, 24, { ...lead, unison: 5, detune: 18, vel: 0.19, filter: { cutoff: 4200, env: 1, decay: 0.15 } });
  putLead(melody, 24, { ...lead, wave: 'pulse', duty: 0.5, unison: 1, vel: 0.06, vib: 0, pan: 0.3 }, 12);

  // ドラム
  for (let b = 0; b < 32; b++) {
    const B = b * 4, sec = section(b);
    const kickBeats = b === BUILD[1] ? [0, 1] : [0, 1, 2, 3];
    kickBeats.forEach((k) => s.play('kick', B + k, kick, { vel: 1, f0: 210, f1: 52, decay: 0.24, click: 0.5, drive: 2.2 }));

    if (BUILD.includes(b)) {
      // スネアロール：8分 → 16分 → 32分
      const hits = [];
      if (b === BUILD[0]) for (let k = 0; k < 4; k += 0.5) hits.push(k);
      else {
        for (let k = 0; k < 2; k += 0.25) hits.push(k);
        for (let k = 2; k < 4; k += 0.125) hits.push(k);
      }
      for (const k of hits) {
        const prog = (b - BUILD[0] + k / 4) / 2;
        s.play('drums', B + k, snare, { vel: 0.15 + prog * 0.5, tone: 200 + prog * 80, noiseDecay: 0.08, hp: 1200 });
      }
    } else {
      const snares = fillBar(b) ? [1] : [1, 3];
      snares.forEach((k) => {
        s.play('drums', B + k, snare, { vel: 0.52, tone: 200, noiseDecay: 0.13, hp: 1000 });
        s.play('drums', B + k, clap, { vel: 0.42 });
      });
      // ゴーストノート（小さいスネアで細かく）
      if (sec === 'C' || sec === 'D') [0.75, 2.25, 3.75].forEach((k) => s.play('drums', B + k, snare, { vel: 0.09, tone: 220, noiseDecay: 0.05, hp: 1500 }));
      // タムのフィル
      if (fillBar(b)) [220, 180, 145, 110].forEach((f, i) => s.play('drums', B + 3 + i * 0.25, tom, { vel: 0.55, f, pan: 0.5 - i * 0.33 }));
    }
    // ハイハット：うら拍のオープン、D は16分のクローズも
    for (let k = 0; k < 4; k++) s.play('drums', B + k + 0.5, hat, { vel: 0.15, decay: 0.12, len: 0.3, pan: 0.2 });
    if (sec === 'D') for (let k = 0.25; k < 4; k += 0.5) s.play('drums', B + k, hat, { vel: 0.07, decay: 0.025, pan: 0.35 });
    // ノイズのシェイカー（16分）
    for (let k = 0; k < 4; k += 0.25) {
      const pos = Math.round((k % 1) * 4);
      s.play('drums', B + k, shaker, { vel: [0.06, 0.04, 0.07, 0.045][pos] * (sec === 'A' ? 1 : 1.25), center: 8500, decay: 0.03, pan: -0.3 });
    }
    // シンバル：B と D は4小節ごと、それ以外はセクションの頭
    if (((sec === 'B' || sec === 'D') && b % 4 === 0) || b % 8 === 0) s.play('fx', B, crash, { vel: 0.24 });
    if (b === 8 || b === 24) s.play('kick', B, boom, { vel: 0.55 });
  }
  s.play('fx', BUILD[0] * 4, riser, { vel: 0.16 }, 8);
  return s;
}

// ---------------- 書き出し ----------------
function writeWav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

const SONGS = { title: titleSong, menu: menuSong, game: gameSong };
const pick = process.argv.slice(2).filter((a) => SONGS[a]);
const names = pick.length ? pick : Object.keys(SONGS);
fs.mkdirSync(OUT_DIR, { recursive: true });
console.log('BGM を作っています…');
const loops = {};
for (const name of names) {
  const song = SONGS[name]();
  const [L, R] = song.render();
  const wav = path.join(os.tmpdir(), `satapuyo_${name}.wav`);
  const mp3 = path.join(OUT_DIR, `bgm_${name}.mp3`);
  writeWav(wav, L, R);
  if (process.env.KEEP_WAV) fs.copyFileSync(wav, path.join(OUT_DIR, `bgm_${name}.wav`));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', mp3]);
  fs.unlinkSync(wav);
  loops[name] = { loopStart: LOOP_START, loopEnd: +(LOOP_START + song.loop).toFixed(6) };
  console.log(`    → ${path.relative(ROOT, mp3)}  (${(fs.statSync(mp3).size / 1024).toFixed(0)} KB)`);
}
console.log('\njs/config.js の sounds に書くループ位置:');
for (const [name, l] of Object.entries(loops)) console.log(`  bgm${name[0].toUpperCase() + name.slice(1)}: { src: 'assets/sound/bgm_${name}.mp3', loopStart: ${l.loopStart}, loopEnd: ${l.loopEnd} },`);
