// スコアのシェア：SNS ごとの投稿リンク・コピー用の文章・きろくの画像を作る
//   画像は よこ（ポスト用 1200x630）と たて（ストーリー用 1080x1920）
const Share = (() => {
  const CFG = window.GAME_CONFIG;
  const S = CFG.share || {};
  const url = () => S.url || location.origin + location.pathname;
  const tags = () => S.hashtags || ['さたぷよ'];
  const tagText = () => tags().map((t) => '#' + t).join(' ');
  const shortUrl = () => url().replace(/^https?:\/\//, '').replace(/\/$/, '');

  // 投稿する文章：きろく + ひとこと宣伝 + ハッシュタグ + URL（画面で書きかえてもOK）
  const fullText = (line) => [line, S.catch, tagText(), url()].filter(Boolean).join('\n');

  // SNS ごとの投稿画面のリンク（Facebook は文章を入れられないので URL だけ）
  function links(text) {
    const e = encodeURIComponent;
    return {
      x: `https://twitter.com/intent/tweet?text=${e(text)}`,
      line: `https://line.me/R/share?text=${e(text)}`,
      threads: `https://www.threads.net/intent/post?text=${e(text)}`,
      bsky: `https://bsky.app/intent/compose?text=${e(text)}`,
      fb: `https://www.facebook.com/sharer/sharer.php?u=${e(url())}`,
    };
  }

  // ---------------- きろくの画像 ----------------
  const FONT = "'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Yu Gothic', sans-serif";
  const INK = '#3a2350', SOFT = '#7a5c96', PINK = '#ff4d6d';
  const CHIP_COLORS = ['#4d8bff', '#2fbf6f', '#a66bff', '#ff8a3d'];

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const ok = (img) => img && (img.naturalWidth || img.width);

  function faceCircle(g, img, cx, cy, r, ring) {
    g.save();
    g.beginPath();
    g.arc(cx, cy, r + Math.max(4, r * 0.09), 0, Math.PI * 2);
    g.fillStyle = ring;
    g.fill();
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#fff';
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (ok(img)) {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, cx - r, cy - r, r * 2, r * 2);
    }
    g.restore();
  }

  function font(g, size, weight = 900) {
    g.font = `${weight} ${size}px ${FONT}`;
  }

  // 横はばに入るように文字を小さくする
  function fit(g, text, size, maxW, weight = 900) {
    font(g, size, weight);
    const w = g.measureText(text).width;
    const s = w > maxW ? Math.floor((size * maxW) / w) : size;
    font(g, s, weight);
    return s;
  }

  // 太いふちの文字
  function outlined(g, text, x, y, size, fill, align = 'left') {
    font(g, size);
    g.textAlign = align;
    g.lineJoin = 'round';
    g.lineWidth = size * 0.16;
    g.strokeStyle = INK;
    g.strokeText(text, x, y);
    g.fillStyle = fill;
    g.fillText(text, x, y);
  }

  function text(g, str, x, y, size, color, align = 'left', maxW = 9999, weight = 800) {
    fit(g, str, size, maxW, weight);
    g.textAlign = align;
    g.fillStyle = color;
    g.fillText(str, x, y);
  }

  function background(g, W, H) {
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#ff8fb8');
    bg.addColorStop(0.5, '#a66bff');
    bg.addColorStop(1, '#4d8bff');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const colors = CFG.ringColors;
    for (let i = 0; i < 30; i++) {
      const x = (i * 211) % W, y = (i * 337) % H, r = 18 + ((i * 53) % 70);
      g.globalAlpha = 0.18;
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function panel(g, x, y, w, h, r) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.25)';
    g.shadowBlur = 30;
    g.shadowOffsetY = 12;
    roundRect(g, x, y, w, h, r);
    g.fillStyle = 'rgba(255,255,255,0.94)';
    g.fill();
    g.restore();
  }

  // 終わったときの盤面。board がなければ大きい顔
  function drawBoard(g, d, x, y, cs) {
    const w = cs * 6, h = cs * 12;
    g.save();
    roundRect(g, x - cs * 0.18, y - cs * 0.18, w + cs * 0.36, h + cs * 0.36, cs * 0.4);
    g.fillStyle = '#fff';
    g.fill();
    roundRect(g, x, y, w, h, cs * 0.25);
    g.clip();
    g.fillStyle = '#1c1440';
    g.fillRect(x, y, w, h);
    if (ok(d.fieldBg)) g.drawImage(d.fieldBg, x, y, w, h);
    // ✕ じるし
    g.strokeStyle = 'rgba(255,80,110,0.6)';
    g.lineWidth = cs * 0.1;
    g.lineCap = 'round';
    const m = cs * 0.28;
    g.beginPath();
    g.moveTo(x + 2 * cs + m, y + m); g.lineTo(x + 3 * cs - m, y + cs - m);
    g.moveTo(x + 3 * cs - m, y + m); g.lineTo(x + 2 * cs + m, y + cs - m);
    g.stroke();
    const b = d.board;
    if (b && b.grid) {
      const s = cs * 0.92;
      for (let yy = 1; yy < b.grid.length; yy++) {
        for (let xx = 0; xx < 6; xx++) {
          const t = b.grid[yy][xx];
          if (t == null) continue;
          const spr = t < 0 ? b.garbage : b.sprites && b.sprites[t];
          if (ok(spr)) g.drawImage(spr, x + xx * cs + (cs - s) / 2, y + (yy - 1) * cs + (cs - s) / 2, s, s);
        }
      }
    } else {
      faceCircle(g, d.face, x + w / 2, y + h / 2, w * 0.38, '#ffb703');
    }
    g.restore();
    // ハンコ（ばたんきゅ〜 / ぜんけし!! / かち!! など）
    if (d.stamp) {
      g.save();
      g.translate(x + w / 2, y + h * 0.42);
      g.rotate(-0.18);
      const size = fit(g, d.stamp, cs * 1.25, w * 1.05);
      outlined(g, d.stamp, 0, 0, size, d.stampColor || PINK, 'center');
      g.restore();
    }
  }

  // 数字のカード（ラベル + 値）
  function chip(g, x, y, w, h, label, value, color) {
    roundRect(g, x, y, w, h, Math.min(24, h * 0.3));
    g.fillStyle = color;
    g.fill();
    g.textAlign = 'center';
    text(g, label, x + w / 2, y + h * 0.38, h * 0.22, 'rgba(255,255,255,0.92)', 'center', w - 16, 800);
    text(g, String(value), x + w / 2, y + h * 0.82, h * 0.4, '#fff', 'center', w - 16, 900);
  }

  // よく消した さたろう（顔 + ×かず）
  function faceCounts(g, faces, x, y, slotW, r, perRow) {
    faces.slice(0, 4).forEach((f, i) => {
      const cx = x + (i % perRow) * slotW + r + 8;
      const cy = y + Math.floor(i / perRow) * (r * 2 + 28) + r;
      faceCircle(g, f.img, cx, cy, r, CFG.ringColors[i % CFG.ringColors.length]);
      text(g, '×' + f.count, cx + r + 12, cy + r * 0.38, r * 0.8, INK, 'left', slotW - r * 2 - 24, 900);
    });
  }

  function urlBanner(g, x, y, w, h, withTag) {
    roundRect(g, x, y, w, h, h / 2);
    g.fillStyle = PINK;
    g.fill();
    const label = `▶ ${shortUrl()} で あそべる！${withTag ? '  ' + tagText() : ''}`;
    text(g, label, x + w / 2, y + h * 0.68, h * 0.5, '#fff', 'center', w - h, 900);
  }

  function bigScore(g, d, x, y, maxSize, maxW, align) {
    font(g, maxSize);
    const bw = g.measureText(d.big).width;
    font(g, Math.round(maxSize * 0.34), 800);
    const uw = d.unit ? 14 + g.measureText(d.unit).width : 0;
    const size = Math.floor(maxSize * Math.min(1, maxW / (bw + uw)));
    font(g, size);
    const w = g.measureText(d.big).width;
    font(g, Math.round(size * 0.34), 800);
    const total = w + (d.unit ? 14 + g.measureText(d.unit).width : 0);
    const left = align === 'center' ? x - total / 2 : x;
    outlined(g, d.big, left, y, size, PINK);
    if (d.unit) text(g, d.unit, left + w + 14, y, Math.round(size * 0.34), SOFT, 'left');
  }

  // よこ（ポスト用）
  function landscape(d) {
    const W = 1200, H = 630;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    background(g, W, H);
    panel(g, 30, 30, W - 60, H - 60, 40);
    drawBoard(g, d, 72, 66, 41.5);
    const x0 = 360, x1 = W - 60, wR = x1 - x0;
    if (ok(d.logo)) g.drawImage(d.logo, x0, 50, 210, (210 * d.logo.naturalHeight) / d.logo.naturalWidth);
    text(g, d.mode, x0 + 230, 92, 32, SOFT, 'left', wR - 230);
    text(g, `${d.name}  ・  ${d.date}`, x0 + 230, 132, 26, INK, 'left', wR - 230);
    bigScore(g, d, x0, 270, 128, wR, 'left');
    if (d.rankText) text(g, d.rankText, x0, 318, 30, '#2d5ec2', 'left', wR);
    const n = Math.min(4, d.stats.length), gap = 12, cw = (wR - gap * (n - 1)) / n;
    d.stats.slice(0, 4).forEach(([l, v], i) => chip(g, x0 + i * (cw + gap), 340, cw, 92, l, v, CHIP_COLORS[i]));
    if (d.faces.length) {
      text(g, 'よく けした さたろう', x0, 470, 20, SOFT, 'left');
      faceCounts(g, d.faces, x0, 482, wR / 4, 24, 4);
    }
    urlBanner(g, x0, 548, wR, 50, true);
    return c;
  }

  // たて（ストーリー用）。上下はアプリの表示にかくれやすいので、大事なものは まんなかに
  function portrait(d) {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    background(g, W, H);
    panel(g, 40, 140, W - 80, H - 280, 56);
    if (ok(d.logo)) {
      const lw = 480, lh = (lw * d.logo.naturalHeight) / d.logo.naturalWidth;
      g.drawImage(d.logo, (W - lw) / 2, 170, lw, lh);
    }
    text(g, d.mode, W / 2, 400, 44, SOFT, 'center', W - 180);
    text(g, `${d.name}  ・  ${d.date}`, W / 2, 452, 34, INK, 'center', W - 180);
    bigScore(g, d, W / 2, 660, 180, W - 180, 'center');
    if (d.rankText) text(g, d.rankText, W / 2, 742, 42, '#2d5ec2', 'center', W - 180);
    // 盤面（左）と 数字（右）
    const cs = 56, top = 800;
    drawBoard(g, d, 104, top, cs);
    const x0 = 104 + cs * 6 + 48, wR = W - 90 - x0;
    d.stats.slice(0, 4).forEach(([l, v], i) => chip(g, x0, top + i * 124, wR, 110, l, v, CHIP_COLORS[i]));
    if (d.faces.length) {
      text(g, 'よく けした さたろう', x0, top + 530, 26, SOFT, 'left', wR);
      faceCounts(g, d.faces, x0, top + 548, wR / 2, 32, 2);
    }
    urlBanner(g, 100, 1556, W - 200, 96, false);
    text(g, S.catch || '', W / 2, 1712, 32, INK, 'center', W - 200, 800);
    text(g, tagText(), W / 2, 1758, 34, SOFT, 'center', W - 200, 900);
    return c;
  }

  // d: { mode, name, date, big, unit, rankText, stats: [[ラベル, 値]...], board, face, faces: [{ img, count }], stamp, logo, fieldBg }
  const card = (d, format = 'wide') => (format === 'story' ? portrait(d) : landscape(d));

  return { url, links, fullText, card };
})();
