// スコアのシェア：SNS ごとの投稿リンク・コピー用の文章・きろくの画像を作る
//   画像は よこ（ポスト用 1200x675）と たて（ストーリー用 1080x1920）
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

  // 称号（しょうごう）のバッジ
  function badge(g, x, y, h, label, align = 'left') {
    font(g, h * 0.5);
    const w = g.measureText(label).width + h * 1.1;
    const left = align === 'center' ? x - w / 2 : x;
    roundRect(g, left, y, w, h, h / 2);
    g.fillStyle = '#ffb703';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#fff';
    g.stroke();
    text(g, label, left + w / 2, y + h * 0.7, h * 0.5, INK, 'center', w, 900);
    return w;
  }

  // 小さい数字（ラベル + 値）
  function miniStat(g, x, y, w, h, label, value) {
    roundRect(g, x, y, w, h, Math.min(16, h * 0.3));
    g.fillStyle = 'rgba(122, 92, 150, 0.12)';
    g.fill();
    text(g, label, x + w / 2, y + h * 0.4, h * 0.26, SOFT, 'center', w - 10, 800);
    text(g, String(value), x + w / 2, y + h * 0.84, h * 0.38, INK, 'center', w - 10, 900);
  }

  // れんさの きろく：れんさするたびの れんさ数を ぼうグラフに（新しいほうが右）
  const BAR_COLORS = ['#c9c9d3', '#7cc4ff', '#7cf29c', '#ffe066', '#ffb35c', '#ff9bd2', '#ff6b6b'];
  function chainGraph(g, x, y, w, h, log) {
    const head = log.length ? `れんさ の きろく（${log.length}かい・さいだい ${Math.max(...log)}れんさ）` : 'れんさ の きろく';
    text(g, head, x, y + h * 0.2, h * 0.2, SOFT, 'left', w, 800);
    const top = y + h * 0.3, gh = h * 0.7;
    roundRect(g, x, top, w, gh, 10);
    g.fillStyle = 'rgba(122, 92, 150, 0.08)';
    g.fill();
    if (!log.length) {
      text(g, 'れんさ なし', x + w / 2, top + gh * 0.62, gh * 0.3, SOFT, 'center', w, 800);
      return;
    }
    const list = log.slice(-40);
    const max = Math.max(4, ...list);
    const slot = (w - 12) / Math.max(list.length, 12);
    const bw = Math.max(3, slot * 0.72);
    list.forEach((n, i) => {
      const bh = Math.max(4, ((gh - 10) * n) / max);
      const bx = x + 6 + i * slot + (slot - bw) / 2, by = top + gh - 4 - bh;
      roundRect(g, bx, by, bw, bh, Math.min(6, bw / 2));
      g.fillStyle = BAR_COLORS[Math.min(n - 1, BAR_COLORS.length - 1)];
      g.fill();
      if (bw >= 16 && bh >= 20) text(g, String(n), bx + bw / 2, by + Math.min(bh - 4, bw * 0.9), Math.min(bw * 0.8, 22), INK, 'center', bw, 900);
    });
  }

  // QRコード（ゲームのURL）
  function qr(g, img, x, y, size, label) {
    if (!ok(img)) return 0;
    roundRect(g, x - 6, y - 6, size + 12, size + 12, 12);
    g.fillStyle = '#fff';
    g.fill();
    g.imageSmoothingEnabled = false;
    g.drawImage(img, x, y, size, size);
    g.imageSmoothingEnabled = true;
    if (label) text(g, label, x + size / 2, y + size + 26, 18, SOFT, 'center', size + 40, 800);
    return size;
  }

  // よこ（ポスト用 1200x675）
  function landscape(d) {
    const W = 1200, H = 675;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    background(g, W, H);
    panel(g, 24, 24, W - 48, H - 48, 40);
    // 左：盤面 と QR
    drawBoard(g, d, 64, 64, 41);
    if (ok(d.qr)) {
      qr(g, d.qr, 64, 572, 70);
      text(g, 'スキャンで', 148, 598, 20, SOFT, 'left', 160, 800);
      text(g, 'すぐ あそべる', 148, 626, 20, INK, 'left', 160, 900);
    }
    // 右
    const x0 = 344, x1 = W - 60, wR = x1 - x0;
    if (ok(d.logo)) g.drawImage(d.logo, x0, 46, 190, (190 * d.logo.naturalHeight) / d.logo.naturalWidth);
    text(g, d.mode, x0 + 210, 82, 30, SOFT, 'left', wR - 210);
    text(g, `${d.name}  ・  ${d.date}`, x0 + 210, 118, 24, INK, 'left', wR - 210);
    let bx = x0;
    if (d.badge) bx += badge(g, x0, 138, 38, `しょうごう：${d.badge}`) + 14;
    // しょうごう の右に 順位、いちばん右に あそんだ回数・じっせき
    if (d.meLine) text(g, d.meLine, x1, 166, 17, SOFT, 'right', 270, 800);
    if (d.rankText) text(g, d.rankText, bx, 166, 24, '#2d5ec2', 'left', x1 - bx - (d.meLine ? 285 : 0), 900);
    bigScore(g, d, x0, 288, 112, wR, 'left');
    const n = Math.min(4, d.stats.length), gap = 12, cw = (wR - gap * (n - 1)) / n;
    d.stats.slice(0, 4).forEach(([l, v], i) => chip(g, x0 + i * (cw + gap), 304, cw, 84, l, v, CHIP_COLORS[i]));
    const m = Math.min(4, d.extra.length), mw = (wR - gap * (m - 1)) / Math.max(1, m);
    d.extra.slice(0, 4).forEach(([l, v], i) => miniStat(g, x0 + i * (mw + gap), 398, mw, 54, l, v));
    chainGraph(g, x0, 462, wR, 78, d.chainLog);
    if (d.faces.length) faceCounts(g, d.faces, x0, 548, wR / 4, 19, 4);
    urlBanner(g, x0, 596, wR, 40, true);
    return c;
  }

  // たて（ストーリー用 1080x1920）。上下はアプリの表示にかくれやすいので、大事なものは まんなかに
  function portrait(d) {
    const W = 1080, H = 1920;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    background(g, W, H);
    panel(g, 40, 120, W - 80, H - 220, 56);
    if (ok(d.logo)) {
      const lw = 420, lh = (lw * d.logo.naturalHeight) / d.logo.naturalWidth;
      g.drawImage(d.logo, (W - lw) / 2, 146, lw, lh);
    }
    text(g, d.mode, W / 2, 352, 42, SOFT, 'center', W - 180);
    text(g, `${d.name}  ・  ${d.date}`, W / 2, 402, 32, INK, 'center', W - 180);
    if (d.badge) badge(g, W / 2, 428, 54, `しょうごう：${d.badge}`, 'center');
    bigScore(g, d, W / 2, 652, 170, W - 180, 'center');
    text(g, d.rankText || '', W / 2, 716, 40, '#2d5ec2', 'center', W - 180, 900);
    // 盤面（左）と 数字（右）
    const cs = 52, top = 760;
    drawBoard(g, d, 96, top, cs);
    const x0 = 96 + cs * 6 + 44, wR = W - 96 - x0;
    d.stats.slice(0, 4).forEach(([l, v], i) => chip(g, x0, top + i * 106, wR, 96, l, v, CHIP_COLORS[i]));
    const mw = (wR - 10) / 2;
    d.extra.slice(0, 4).forEach(([l, v], i) => miniStat(g, x0 + (i % 2) * (mw + 10), top + 434 + Math.floor(i / 2) * 76, mw, 66, l, v));
    if (d.meLine) text(g, d.meLine, x0 + wR / 2, top + 614, 24, SOFT, 'center', wR, 800);
    // れんさの きろく・よく消した さたろう
    chainGraph(g, 96, 1414, W - 192, 120, d.chainLog);
    if (d.faces.length) {
      text(g, 'よく けした さたろう', 96, 1574, 24, SOFT, 'left', 400, 800);
      faceCounts(g, d.faces, 96, 1588, (W - 192) / 4, 28, 4);
    }
    // URL と QR
    const qs = 132;
    qr(g, d.qr, W - 96 - qs, 1660, qs);
    urlBanner(g, 96, 1676, W - 192 - qs - 30, 76, false);
    text(g, `${S.catch || ''}  ${tagText()}`, 96 + (W - 192 - qs - 30) / 2, 1784, 22, SOFT, 'center', W - 192 - qs - 30, 800);
    return c;
  }

  // d: { mode, name, date, big, unit, badge, rankText, meLine, stats: [[ラベル, 値]...], extra: [[ラベル, 値]...], chainLog,
  //      board, face, faces: [{ img, count }], stamp, logo, fieldBg, qr }
  function card(d, format = 'wide') {
    d = { stats: [], extra: [], chainLog: [], faces: [], ...d };
    return format === 'story' ? portrait(d) : landscape(d);
  }

  return { url, links, fullText, card };
})();
