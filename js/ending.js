// エンディング（エンドロール）
// 文字は下から上へ流れ、うしろを飛行機や車に乗った大小さまざまなさたろうが左から右へ横切る。
// draw(t) は「t 秒の時点の絵」を毎回いちから描く（乗り物の出かたは決まった乱数で前もって決めてある）。
// そのため、ゲームの中で流すときも、動画（mp4）に書き出すときも、同じ絵になる。
const Ending = (() => {
  const CFG = window.GAME_CONFIG;
  const E = CFG.ending || {};
  const TAU = Math.PI * 2;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (c1, c2, k) => {
    const a = hex(c1), b = hex(c2);
    return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',')})`;
  };
  // 時間で色を変える（朝 → 夕方 → 夜）
  function keyframes(list, p) {
    for (let i = 0; i < list.length - 1; i++) {
      const [p0, c0] = list[i], [p1, c1] = list[i + 1];
      if (p <= p1) return mix(c0, c1, clamp((p - p0) / (p1 - p0)));
    }
    return list[list.length - 1][1];
  }
  const SKY_TOP = [[0, '#4fb8ff'], [0.45, '#6aa8ff'], [0.62, '#ff8fb1'], [0.8, '#3b2a7a'], [1, '#0b1033']];
  const SKY_BOTTOM = [[0, '#c9f0ff'], [0.45, '#d8ecff'], [0.62, '#ffd28a'], [0.8, '#ff9a76'], [1, '#2b2f77']];
  const HILL_FAR = [[0, '#8fd18a'], [0.6, '#c98a7a'], [0.85, '#4a3a6e'], [1, '#1c1d45']];
  const HILL_NEAR = [[0, '#5fb562'], [0.6, '#a86a5e'], [0.85, '#3a2d5c'], [1, '#14153a']];
  const ROAD = [[0, '#55596b'], [0.7, '#4a4560'], [1, '#22233a']];

  // ---------------- 準備 ----------------
  // faces: Image の配列、duration: 秒
  function makeScene(faceImages, duration) {
    const colors = CFG.ringColors;
    const sprites = faceImages.map((img, i) => PuyoGame.makeSprite(img, colors[i % colors.length], 192));
    const r = rng(20261015);
    const vehicles = [];
    const pick = (list) => {
      const total = list.reduce((s, [, w]) => s + w, 0);
      let x = r() * total;
      for (const [v, w] of list) if ((x -= w) < 0) return v;
      return list[0][0];
    };
    const TYPES = [['plane', 3], ['car', 3], ['jet', 1.4], ['balloon', 1.1], ['bus', 0.9], ['heli', 1]];
    const PALETTE = ['#ff4d6d', '#ffffff', '#4d9bff', '#ffc93f', '#2fd47a', '#b06bff', '#ff8a3d'];
    const face = () => Math.floor(r() * sprites.length);
    for (let t0 = -14; t0 < duration; t0 += 0.75 + r() * 1.1) {
      const type = pick(TYPES);
      const v = { type, t0, face: face(), faces: [face(), face(), face()], color: PALETTE[Math.floor(r() * PALETTE.length)], color2: PALETTE[Math.floor(r() * PALETTE.length)], phase: r() * TAU };
      if (type === 'car' || type === 'bus') {
        const near = r() < 0.5;
        v.scale = near ? 0.95 + r() * 0.35 : 0.55 + r() * 0.2;
        v.y = near ? 0.955 : 0.872;
        v.speed = (type === 'bus' ? 0.07 : 0.1) * v.scale * (0.85 + r() * 0.3);
      } else {
        v.scale = 0.32 + r() * 1.0;
        v.y = lerp(0.12, 0.62, r()) * (1.15 - v.scale * 0.25);
        v.speed = { plane: 0.1, jet: 0.17, balloon: 0.04, heli: 0.08 }[type] * (0.5 + v.scale * 0.6) * (0.85 + r() * 0.3);
      }
      vehicles.push(v);
    }
    // テトリスみたいに、ときどきロケットが打ち上がる
    for (let t0 = 18; t0 < duration - 10; t0 += 26 + r() * 10) {
      vehicles.push({ type: 'rocket', t0, face: face(), scale: 0.7 + r() * 0.5, x0: 0.05 + r() * 0.35, color: '#ffffff', color2: PALETTE[Math.floor(r() * 4)], phase: 0 });
    }
    // 旗を引っぱる飛行機
    for (const k of [0.13, 0.6]) {
      vehicles.push({ type: 'banner', t0: duration * k, face: face(), scale: 1, y: 0.16, speed: 0.075, color: '#ffffff', color2: '#ff4d6d', phase: 0 });
    }
    vehicles.sort((a, b) => a.scale - b.scale);
    const clouds = Array.from({ length: 12 }, (_, i) => ({ x: r() * 1.4, y: 0.06 + r() * 0.45, s: 0.5 + r() * 1.2, v: 0.004 + r() * 0.012, far: i < 6 }));
    const stars = Array.from({ length: 90 }, () => ({ x: r(), y: r() * 0.7, s: 0.5 + r() * 1.5, ph: r() * TAU }));
    // tail：曲が終わってから暗くなるまで（ここで最後のボイスが鳴る）
    return { duration, tail: E.tail || 0, sprites, vehicles, clouds, stars, faceImages, layoutFor: null, roll: null };
  }

  // ---------------- 文字（エンドロール） ----------------
  // W×H の画面に合わせて、流す文字の並びを決める
  function layoutRoll(scene, g, W, H) {
    const base = Math.max(14, Math.min(H / 30, W / 26));
    const col = Math.min(W * 0.86, base * 26);
    const items = [];
    let y = 0;
    const font = (size, weight = 800) => `${weight} ${size}px 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif`;
    // 幅に合わせて折り返す（文中の改行でも改行できる）。
    // 「だ。」だけが次の行に落ちないよう、行の長さがそろう幅で折り返しなおす
    const wrap = (text, size, width, weight) => {
      g.font = font(size, weight);
      const greedy = (para, w) => {
        const out = [];
        let line = '';
        for (const ch of para) {
          if (g.measureText(line + ch).width > w && line) {
            if ('、。」』）！？…ー'.includes(ch)) { line += ch; continue; }
            out.push(line);
            line = ch;
          } else line += ch;
        }
        if (line) out.push(line);
        return out;
      };
      const lines = [];
      for (const para of text.split('\n')) {
        let out = greedy(para, width);
        if (out.length > 1) {
          const even = greedy(para, Math.min(width, (g.measureText(para).width / out.length) * 1.08));
          if (even.length === out.length) out = even;
        }
        lines.push(...out);
      }
      return lines;
    };
    const gap = (k) => (y += base * k);
    const push = (item, h) => { items.push({ ...item, y }); y += h; };

    gap(0);
    push({ kind: 'logo', size: Math.min(col, base * 22) }, Math.min(col, base * 22) * 0.34);
    gap(4);
    push({ kind: 'head', text: 'STAFF', size: base * 1.4 }, base * 2.6);
    for (const s of E.staff || []) {
      push({ kind: 'role', text: s.role, size: base * 0.8 }, base * 1.3);
      for (const n of s.names) push({ kind: 'name', text: n, size: base * 1.15 }, base * 1.7);
      gap(1.4);
    }
    gap(3);
    push({ kind: 'head', text: 'CAST', size: base * 1.4 }, base * 2.8);
    const faceSize = base * 3.6;
    const textW = col - faceSize - base * 1.2;
    CFG.faces.forEach((f, i) => {
      const lines = wrap(`「${f.comment || ''}」`, base * 0.82, textW, 500);
      const h = Math.max(faceSize, base * 1.25 + base * 1.0 + lines.length * base * 1.2);
      push({ kind: 'cast', face: i, name: f.name, role: f.role || '', lines, size: base, faceSize, textW }, h + base * 1.6);
    });
    gap(3);
    for (const s of E.thanks || []) {
      push({ kind: 'role', text: s.role, size: base * 0.8 }, base * 1.3);
      for (const n of s.names) push({ kind: 'name', text: n, size: base * 1.15 }, base * 1.7);
    }
    gap(6);
    if (E.lastWords) {
      const lw = E.lastWords;
      const lines = wrap(lw.text, base * 1.05, col * 0.92, 800);
      const fs = base * 6;
      push({ kind: 'last', face: (lw.face || 1) - 1, lines, by: lw.by, size: base, fs }, fs + base * 1.2 + lines.length * base * 1.5 + base * 1.6);
    }
    gap(4);
    push({ kind: 'finale', text: E.finale || 'THANK YOU FOR PLAYING', size: base * 1.7 }, base * 2.4);
    const finale = items[items.length - 1];
    scene.roll = { items, base, col, height: y, finaleCenter: finale.y + base * 1.2, font };
    scene.layoutFor = `${W}x${H}`;
  }

  // 文字の位置：はじめは画面の下、最後の THANK YOU が真ん中に来たら止まる
  function rollTop(scene, H, t) {
    const T0 = 1.5, T1 = Math.max(T0 + 10, scene.duration - 9);
    const k = clamp((t - T0) / (T1 - T0));
    return lerp(H * 1.02, H / 2 - scene.roll.finaleCenter, k);
  }

  function drawRoll(scene, g, W, H, t) {
    const R = scene.roll;
    const top = rollTop(scene, H, t);
    const cx = W / 2;
    // 文字のうしろを少しだけ暗くして読みやすく
    const bandW = R.col + R.base * 3;
    const grad = g.createLinearGradient(cx - bandW / 2, 0, cx + bandW / 2, 0);
    grad.addColorStop(0, 'rgba(10,8,30,0)');
    grad.addColorStop(0.22, 'rgba(10,8,30,0.38)');
    grad.addColorStop(0.78, 'rgba(10,8,30,0.38)');
    grad.addColorStop(1, 'rgba(10,8,30,0)');
    g.fillStyle = grad;
    g.fillRect(cx - bandW / 2, 0, bandW, H);

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const text = (str, x, y, size, color = '#fff', weight = 800, align = 'center') => {
      g.font = R.font(size, weight);
      g.textAlign = align;
      g.lineWidth = Math.max(2, size * 0.16);
      g.strokeStyle = 'rgba(20,10,40,0.85)';
      g.strokeText(str, x, y);
      g.fillStyle = color;
      g.fillText(str, x, y);
    };
    for (const it of R.items) {
      const y = top + it.y;
      if (y > H + R.base * 12 || y < -R.base * 14) continue;
      if (it.kind === 'logo') {
        const img = scene.logo;
        if (img && img.complete && img.naturalWidth) {
          const w = it.size, h = (w * img.naturalHeight) / img.naturalWidth;
          g.drawImage(img, cx - w / 2, y, w, h);
        } else text(CFG.title, cx, y + it.size * 0.17, it.size * 0.2);
      } else if (it.kind === 'head') {
        text(it.text, cx, y + it.size / 2, it.size, '#ffd23f', 900);
      } else if (it.kind === 'role') {
        text(it.text, cx, y + it.size / 2, it.size, '#9fe3ff', 800);
      } else if (it.kind === 'name') {
        text(it.text, cx, y + it.size / 2, it.size, '#ffffff', 900);
      } else if (it.kind === 'cast') {
        const left = cx - R.col / 2;
        const sp = scene.sprites[it.face % scene.sprites.length];
        g.drawImage(sp, left, y, it.faceSize, it.faceSize);
        const tx = left + it.faceSize + it.size * 1.2;
        text(it.name, tx, y + it.size * 0.6, it.size * 1.05, '#ffffff', 900, 'left');
        text(it.role, tx, y + it.size * 1.75, it.size * 0.72, '#ffd23f', 800, 'left');
        it.lines.forEach((ln, i) => text(ln, tx, y + it.size * 2.9 + i * it.size * 1.2, it.size * 0.82, '#f2ecff', 500, 'left'));
      } else if (it.kind === 'last') {
        const sp = scene.sprites[it.face % scene.sprites.length];
        g.drawImage(sp, cx - it.fs / 2, y, it.fs, it.fs);
        it.lines.forEach((ln, i) => text(ln, cx, y + it.fs + it.size * 1.3 + i * it.size * 1.5, it.size * 1.05, '#ffffff', 800));
        if (it.by) text('— ' + it.by, cx, y + it.fs + it.size * 1.3 + it.lines.length * it.size * 1.5 + it.size * 0.4, it.size * 0.8, '#ffd23f', 800);
      } else if (it.kind === 'finale') {
        text(it.text, cx, y + it.size * 0.6, it.size, '#ffffff', 900);
      }
    }
    g.textAlign = 'left';
  }

  // ---------------- 背景 ----------------
  function drawBackground(scene, g, W, H, t) {
    const p = clamp(t / scene.duration);
    const sky = g.createLinearGradient(0, 0, 0, H * 0.85);
    sky.addColorStop(0, keyframes(SKY_TOP, p));
    sky.addColorStop(1, keyframes(SKY_BOTTOM, p));
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    // 星（夜になると出てくる）
    const night = clamp((p - 0.72) / 0.2);
    if (night > 0) {
      for (const s of scene.stars) {
        g.globalAlpha = night * (0.55 + 0.45 * Math.sin(t * 2 + s.ph));
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(s.x * W, s.y * H, s.s * (H / 700), 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // 太陽が沈んで、月がのぼる
    const sunK = clamp(p / 0.78);
    if (sunK < 1) {
      const sx = W * lerp(0.12, 0.88, sunK), sy = H * lerp(0.14, 0.86, sunK * sunK);
      const sr = H * 0.07;
      const glow = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 3);
      glow.addColorStop(0, 'rgba(255,230,150,0.55)');
      glow.addColorStop(1, 'rgba(255,230,150,0)');
      g.fillStyle = glow;
      g.fillRect(sx - sr * 3, sy - sr * 3, sr * 6, sr * 6);
      g.fillStyle = mix('#fff3b0', '#ff7a45', clamp((p - 0.4) / 0.4));
      g.beginPath();
      g.arc(sx, sy, sr, 0, TAU);
      g.fill();
    }
    const moonK = clamp((p - 0.74) / 0.2);
    if (moonK > 0) {
      const mx = W * 0.8, my = H * lerp(0.5, 0.16, moonK), mr = H * 0.05;
      g.globalAlpha = moonK;
      g.fillStyle = '#fff8d6';
      g.beginPath();
      g.arc(mx, my, mr, 0, TAU);
      g.fill();
      g.fillStyle = keyframes(SKY_TOP, p);
      g.beginPath();
      g.arc(mx + mr * 0.4, my - mr * 0.2, mr * 0.85, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
    }
    // 雲（遠いもの）
    drawClouds(scene, g, W, H, t, p, true);
    // 丘
    const hill = (color, baseY, amp, f1, f2) => {
      g.fillStyle = keyframes(color, p);
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += W / 60) {
        const k = x / W;
        g.lineTo(x, H * (baseY - amp * (Math.sin(k * f1 + 1.3) * 0.6 + Math.sin(k * f2 + 0.4) * 0.4)));
      }
      g.lineTo(W, H);
      g.closePath();
      g.fill();
    };
    hill(HILL_FAR, 0.74, 0.07, 7, 13);
    hill(HILL_NEAR, 0.8, 0.045, 5, 11);
  }

  function drawClouds(scene, g, W, H, t, p, far) {
    const shade = mix('#ffffff', '#6a5a9a', clamp((p - 0.6) / 0.35));
    for (const c of scene.clouds) {
      if (c.far !== far) continue;
      const x = (((c.x + c.v * t) % 1.4) + 1.4) % 1.4 - 0.2;
      const cx = x * W, cy = c.y * H, s = c.s * H * 0.05;
      g.globalAlpha = far ? 0.55 : 0.85;
      g.fillStyle = shade;
      g.beginPath();
      g.arc(cx, cy, s, 0, TAU);
      g.arc(cx + s * 0.9, cy + s * 0.2, s * 0.8, 0, TAU);
      g.arc(cx - s * 0.9, cy + s * 0.25, s * 0.7, 0, TAU);
      g.arc(cx + s * 0.2, cy - s * 0.45, s * 0.7, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function drawRoad(scene, g, W, H, t, p) {
    const top = H * 0.83;
    g.fillStyle = keyframes(ROAD, p);
    g.fillRect(0, top, W, H - top);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, top, W, H * 0.008);
    g.fillStyle = mix('#fff1a8', '#c9b45a', p);
    const dash = W / 14;
    for (let x = 0; x < W + dash; x += dash) g.fillRect(x, H * 0.913, dash * 0.55, H * 0.007);
  }

  // ---------------- 乗り物 ----------------
  function shade(c, k) {
    const [r, gg, b] = hex(c);
    const f = (v) => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255));
    return `rgb(${f(r)},${f(gg)},${f(b)})`;
  }
  function faceAt(g, sprite, x, y, r) {
    g.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  }
  function wheel(g, x, y, r, ang) {
    g.fillStyle = '#2a2a33';
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = '#c9c9d6';
    g.beginPath(); g.arc(x, y, r * 0.45, 0, TAU); g.fill();
    g.strokeStyle = '#2a2a33';
    g.lineWidth = r * 0.15;
    g.beginPath();
    g.moveTo(x + Math.cos(ang) * r * 0.45, y + Math.sin(ang) * r * 0.45);
    g.lineTo(x - Math.cos(ang) * r * 0.45, y - Math.sin(ang) * r * 0.45);
    g.stroke();
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const DRAW = {
    plane(g, S, v, sp, t) {
      g.fillStyle = v.color;
      g.beginPath(); g.ellipse(0, 0, S * 0.95, S * 0.3, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-S * 0.62, -S * 0.08); g.lineTo(-S * 0.98, -S * 0.52); g.lineTo(-S * 0.78, -S * 0.52); g.lineTo(-S * 0.4, -S * 0.12); g.closePath(); g.fill();
      g.fillStyle = v.color2;
      g.fillRect(-S * 0.7, -S * 0.04, S * 1.4, S * 0.08);
      faceAt(g, sp, S * 0.12, -S * 0.36, S * 0.3);
      g.fillStyle = shade(v.color, -0.25);
      g.beginPath(); g.ellipse(-S * 0.05, S * 0.14, S * 0.46, S * 0.12, -0.12, 0, TAU); g.fill();
      g.fillStyle = '#e6e6ee';
      g.beginPath(); g.arc(S * 0.95, 0, S * 0.11, 0, TAU); g.fill();
      g.fillStyle = 'rgba(40,40,50,0.55)';
      g.beginPath(); g.ellipse(S * 1.02, 0, S * 0.04, S * (0.1 + 0.32 * Math.abs(Math.sin(t * 37 + v.phase))), 0, 0, TAU); g.fill();
    },
    jet(g, S, v, sp, t) {
      const trail = g.createLinearGradient(-S * 0.9, 0, -S * 4.5, 0);
      trail.addColorStop(0, 'rgba(255,255,255,0.7)');
      trail.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = trail;
      g.lineWidth = S * 0.1;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(-S * 0.9, -S * 0.02); g.lineTo(-S * 4.5, -S * 0.02); g.stroke();
      g.fillStyle = '#f4f6fb';
      g.beginPath(); g.ellipse(0, 0, S * 1.1, S * 0.2, 0, 0, TAU); g.fill();
      g.fillStyle = v.color2;
      g.beginPath(); g.moveTo(-S * 0.75, -S * 0.12); g.lineTo(-S * 1.08, -S * 0.55); g.lineTo(-S * 0.9, -S * 0.55); g.lineTo(-S * 0.5, -S * 0.14); g.closePath(); g.fill();
      g.fillStyle = shade(v.color2, -0.2);
      g.beginPath(); g.moveTo(S * 0.15, S * 0.05); g.lineTo(-S * 0.5, S * 0.58); g.lineTo(-S * 0.32, S * 0.58); g.lineTo(S * 0.35, S * 0.05); g.closePath(); g.fill();
      g.save();
      g.beginPath(); g.arc(S * 0.62, -S * 0.04, S * 0.17, 0, TAU); g.clip();
      faceAt(g, sp, S * 0.62, -S * 0.04, S * 0.2);
      g.restore();
      g.strokeStyle = shade(v.color2, -0.3);
      g.lineWidth = S * 0.04;
      g.beginPath(); g.arc(S * 0.62, -S * 0.04, S * 0.17, 0, TAU); g.stroke();
    },
    heli(g, S, v, sp, t) {
      g.strokeStyle = '#333';
      g.lineWidth = S * 0.06;
      g.beginPath(); g.moveTo(-S * 0.25, S * 0.42); g.lineTo(S * 0.45, S * 0.42); g.stroke();
      g.beginPath(); g.moveTo(-S * 0.1, S * 0.3); g.lineTo(-S * 0.15, S * 0.42); g.moveTo(S * 0.3, S * 0.3); g.lineTo(S * 0.35, S * 0.42); g.stroke();
      g.fillStyle = v.color;
      g.fillRect(-S * 1.1, -S * 0.06, S * 0.8, S * 0.1);
      g.beginPath(); g.ellipse(S * 0.1, 0, S * 0.5, S * 0.34, 0, 0, TAU); g.fill();
      g.save();
      g.beginPath(); g.ellipse(S * 0.28, -S * 0.04, S * 0.25, S * 0.22, 0, 0, TAU); g.clip();
      g.fillStyle = '#bfe6ff'; g.fillRect(0, -S * 0.3, S * 0.6, S * 0.5);
      faceAt(g, sp, S * 0.3, -S * 0.02, S * 0.22);
      g.restore();
      g.fillStyle = '#333';
      g.fillRect(S * 0.05, -S * 0.42, S * 0.08, S * 0.1);
      const w = S * 0.95 * Math.abs(Math.cos(t * 25 + v.phase));
      g.fillStyle = 'rgba(40,40,50,0.6)';
      g.beginPath(); g.ellipse(S * 0.09, -S * 0.44, w + S * 0.05, S * 0.035, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(-S * 1.1, 0, S * 0.04, S * 0.2 * Math.abs(Math.sin(t * 30)), 0, 0, TAU); g.fill();
    },
    balloon(g, S, v, sp, t) {
      const R = S * 0.78, cy = -S * 0.62;
      g.save();
      g.beginPath(); g.arc(0, cy, R, 0, TAU); g.clip();
      for (let i = -4; i <= 4; i++) {
        g.fillStyle = i % 2 ? v.color : v.color2;
        g.beginPath(); g.ellipse(i * R * 0.32, cy, R * 0.18, R * 1.05, 0, 0, TAU); g.fill();
      }
      g.restore();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath(); g.ellipse(-R * 0.35, cy - R * 0.4, R * 0.18, R * 0.3, -0.5, 0, TAU); g.fill();
      g.strokeStyle = '#6b4a2a';
      g.lineWidth = S * 0.03;
      g.beginPath();
      g.moveTo(-R * 0.55, cy + R * 0.75); g.lineTo(-S * 0.22, S * 0.42);
      g.moveTo(R * 0.55, cy + R * 0.75); g.lineTo(S * 0.22, S * 0.42);
      g.stroke();
      faceAt(g, sp, 0, S * 0.32, S * 0.22);
      g.fillStyle = '#a0703c';
      roundRect(g, -S * 0.26, S * 0.42, S * 0.52, S * 0.3, S * 0.05); g.fill();
      g.fillStyle = '#7a5228';
      g.fillRect(-S * 0.26, S * 0.5, S * 0.52, S * 0.04);
    },
    car(g, S, v, sp, t) {
      g.fillStyle = shade(v.color, 0.2);
      roundRect(g, -S * 0.48, -S * 0.66, S * 0.92, S * 0.48, S * 0.18); g.fill();
      g.fillStyle = '#bfe6ff';
      roundRect(g, -S * 0.38, -S * 0.58, S * 0.72, S * 0.36, S * 0.12); g.fill();
      g.save();
      roundRect(g, -S * 0.38, -S * 0.58, S * 0.72, S * 0.36, S * 0.12); g.clip();
      faceAt(g, sp, -S * 0.02, -S * 0.36, S * 0.22);
      g.restore();
      g.fillStyle = v.color;
      roundRect(g, -S * 0.95, -S * 0.26, S * 1.9, S * 0.46, S * 0.18); g.fill();
      g.fillStyle = '#fff3a0';
      g.beginPath(); g.ellipse(S * 0.88, -S * 0.08, S * 0.07, S * 0.06, 0, 0, TAU); g.fill();
      const ang = t * 10;
      wheel(g, -S * 0.52, S * 0.2, S * 0.21, ang);
      wheel(g, S * 0.52, S * 0.2, S * 0.21, ang);
    },
    bus(g, S, v, sp, t, scene) {
      g.fillStyle = '#ffc93f';
      roundRect(g, -S * 1.45, -S * 0.82, S * 2.9, S * 1.0, S * 0.2); g.fill();
      g.fillStyle = '#e8a91a';
      g.fillRect(-S * 1.45, -S * 0.08, S * 2.9, S * 0.08);
      for (let i = 0; i < 3; i++) {
        const wx = -S * 1.2 + i * S * 0.8;
        g.fillStyle = '#bfe6ff';
        roundRect(g, wx, -S * 0.7, S * 0.62, S * 0.42, S * 0.08); g.fill();
        g.save();
        roundRect(g, wx, -S * 0.7, S * 0.62, S * 0.42, S * 0.08); g.clip();
        faceAt(g, scene.sprites[v.faces[i] % scene.sprites.length], wx + S * 0.31, -S * 0.46, S * 0.22);
        g.restore();
      }
      g.fillStyle = '#fff3a0';
      g.beginPath(); g.ellipse(S * 1.4, -S * 0.02, S * 0.06, S * 0.07, 0, 0, TAU); g.fill();
      const ang = t * 8;
      wheel(g, -S * 0.9, S * 0.2, S * 0.22, ang);
      wheel(g, S * 0.9, S * 0.2, S * 0.22, ang);
    },
    rocket(g, S, v, sp, t) {
      const fl = 0.75 + 0.25 * Math.sin(t * 40);
      const flame = g.createLinearGradient(-S * 0.7, 0, -S * (0.7 + 0.9 * fl), 0);
      flame.addColorStop(0, '#fff3a0');
      flame.addColorStop(0.4, '#ff9a3d');
      flame.addColorStop(1, 'rgba(255,77,109,0)');
      g.fillStyle = flame;
      g.beginPath(); g.moveTo(-S * 0.65, -S * 0.18); g.lineTo(-S * (0.75 + 0.9 * fl), 0); g.lineTo(-S * 0.65, S * 0.18); g.closePath(); g.fill();
      g.fillStyle = v.color2;
      g.beginPath(); g.moveTo(-S * 0.45, -S * 0.2); g.lineTo(-S * 0.75, -S * 0.5); g.lineTo(-S * 0.62, -S * 0.15); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-S * 0.45, S * 0.2); g.lineTo(-S * 0.75, S * 0.5); g.lineTo(-S * 0.62, S * 0.15); g.closePath(); g.fill();
      g.fillStyle = '#f4f6fb';
      g.beginPath(); g.ellipse(0, 0, S * 0.7, S * 0.26, 0, 0, TAU); g.fill();
      g.fillStyle = v.color2;
      g.beginPath(); g.moveTo(S * 0.5, -S * 0.18); g.quadraticCurveTo(S * 0.95, 0, S * 0.5, S * 0.18); g.closePath(); g.fill();
      g.save();
      g.beginPath(); g.arc(S * 0.1, 0, S * 0.17, 0, TAU); g.clip();
      faceAt(g, sp, S * 0.1, 0, S * 0.2);
      g.restore();
      g.strokeStyle = '#9aa0b8'; g.lineWidth = S * 0.04;
      g.beginPath(); g.arc(S * 0.1, 0, S * 0.17, 0, TAU); g.stroke();
    },
    banner(g, S, v, sp, t) {
      // 旗（うしろ）
      const bw = S * 4.6, bh = S * 0.62, bx = -S * 1.3 - bw;
      g.strokeStyle = '#ddd'; g.lineWidth = S * 0.025;
      g.beginPath(); g.moveTo(-S * 0.9, 0); g.lineTo(bx + bw, -bh * 0.1); g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(bx + bw, -bh / 2);
      for (let i = 0; i <= 10; i++) g.lineTo(bx + bw - (bw * i) / 10, -bh / 2 + Math.sin(t * 6 + i) * S * 0.04);
      for (let i = 10; i >= 0; i--) g.lineTo(bx + bw - (bw * i) / 10, bh / 2 + Math.sin(t * 6 + i) * S * 0.04);
      g.closePath(); g.fill();
      g.fillStyle = '#ff4d6d';
      g.font = `900 ${bh * 0.55}px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(E.banner || '100万点おめでとう！', bx + bw / 2, Math.sin(t * 6 + 5) * S * 0.04);
      g.textAlign = 'left';
      DRAW.plane(g, S, v, sp, t);
    },
  };

  function drawVehicles(scene, g, W, H, t, ground) {
    for (const v of scene.vehicles) {
      if (t < v.t0) continue;
      const isGround = v.type === 'car' || v.type === 'bus';
      if (isGround !== ground) continue;
      const dt = t - v.t0;
      const S = H * 0.1 * v.scale;
      let x, y, rot = 0;
      if (v.type === 'rocket') {
        x = (v.x0 + dt * 0.11) * W;
        y = H * 0.85 - dt * 0.13 * H;
        rot = -0.85;
        if (y < -S * 3) continue;
      } else {
        x = (-0.25 + v.speed * dt) * W;
        y = v.y * H;
        if (x - S * 6 > W) continue;
        if (v.type === 'balloon') y += Math.sin(t * 1.4 + v.phase) * S * 0.08;
        else if (isGround) y += -Math.abs(Math.sin(t * 9 + v.phase)) * S * 0.03;
        else y += Math.sin(t * 1.1 + v.phase) * S * 0.12;
      }
      const sp = scene.sprites[v.face % scene.sprites.length];
      g.save();
      g.translate(x, isGround ? y - S * 0.42 : y);
      if (rot) g.rotate(rot);
      DRAW[v.type](g, S, v, sp, t, scene);
      g.restore();
    }
  }

  // t 秒の時点の絵を描く
  function draw(scene, g, W, H, t) {
    if (scene.layoutFor !== `${W}x${H}`) layoutRoll(scene, g, W, H);
    const p = clamp(t / scene.duration);
    drawBackground(scene, g, W, H, t);
    drawClouds(scene, g, W, H, t, p, false); // 雲は乗り物のうしろ
    drawVehicles(scene, g, W, H, t, false);
    drawRoad(scene, g, W, H, t, p);
    drawVehicles(scene, g, W, H, t, true);
    drawRoll(scene, g, W, H, t);
    // はじめと終わりは黒からふわっと
    const end = scene.duration + scene.tail;
    const fade = Math.max(clamp(1 - t / 1.5), clamp((t - (end - 2)) / 2));
    if (fade > 0) {
      g.fillStyle = `rgba(0,0,0,${fade})`;
      g.fillRect(0, 0, W, H);
    }
  }

  // ---------------- ゲームの中で流す ----------------
  let running = null;

  function play({ canvas, faces, logo, onDone }) {
    stop();
    const g = canvas.getContext('2d');
    const state = { scene: null, start: 0, raf: 0, ended: false, done: false };
    running = state;
    const finish = () => {
      if (state.done) return;
      state.done = true;
      cancelAnimationFrame(state.raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisible);
      running = null;
      onDone();
    };
    state.finish = finish;
    // タブを裏にしている間は曲も止まるので、時計も止めておく（絵と曲がずれないように）
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.hidden) hiddenAt = performance.now();
      else if (hiddenAt) {
        state.start += performance.now() - hiddenAt;
        hiddenAt = 0;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const resize = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * d);
      canvas.height = Math.round(window.innerHeight * d);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      state.dpr = d;
    };
    resize();
    window.addEventListener('resize', resize);
    const begin = (seconds) => {
      if (state.scene) return;
      state.scene = makeScene(faces, seconds || E.seconds || 215);
      state.scene.logo = logo;
      state.start = performance.now();
      cancelAnimationFrame(state.raf);
      const loop = () => {
        state.raf = requestAnimationFrame(loop);
        const t = (performance.now() - state.start) / 1000;
        const W = canvas.width / state.dpr, H = canvas.height / state.dpr;
        g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        draw(state.scene, g, W, H, t);
        // 曲が終わったら、最後のボイス（again）
        if (!state.voiced && t >= state.scene.duration + (E.endVoiceAt ?? 0.2)) {
          state.voiced = true;
          if (E.endVoice) Sound.playVoice(E.endVoice);
        }
        if (t > state.scene.duration + state.scene.tail + 0.3) finish();
      };
      loop();
    };
    // 曲が鳴りはじめたら時計をスタート（曲が鳴らせないときは決まった長さで）。それまでは「よみこみ中」
    const t0 = performance.now();
    const waiting = () => {
      if (state.scene || state.done) return;
      state.raf = requestAnimationFrame(waiting);
      const W = canvas.width / state.dpr, H = canvas.height / state.dpr;
      g.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.font = `800 ${Math.max(14, H / 40)}px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('♪ よみこみ中' + '.'.repeat(1 + (Math.floor((performance.now() - t0) / 400) % 3)), W / 2, H / 2);
      g.textAlign = 'left';
    };
    waiting();
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(() => {
      if (state.done) return;
      Sound.playBgm('ending', true, { onStart: (sec) => begin(sec) });
      setTimeout(() => begin(null), 15000); // 曲の読みこみが遅すぎるとき
    });
    return state;
  }

  function stop() {
    if (running) running.finish();
  }

  // 動画用：W×H のキャンバスに t 秒の絵を描く（tools/video/make_ending_video.mjs が使う）
  function renderFrame(scene, canvas, t) {
    const g = canvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    draw(scene, g, canvas.width, canvas.height, t);
  }

  return { play, stop, makeScene, renderFrame };
})();
