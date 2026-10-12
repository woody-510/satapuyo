"""元画像からゲーム用の画像を作り直すスクリプト（Pillow が必要: pip install pillow）

    python tools/make_assets.py

- images/  の画像 → assets/puyo/faceNN.jpg（256x256 の正方形。顔のあたりを切り抜く）
- images2/ の画像 → assets/bg/bgN.jpg（1280x720。画面いっぱい用に切り抜く）

サイズはバラバラでOK。FACE_BOXES に書いてない画像は「中央やや上」を自動で切り抜く。
作ったあと js/config.js の faces / backgrounds に追加すればゲームに出てくる。
"""
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
FACE_SIZE = 256
BG_W, BG_H = 1280, 720

# 手で合わせた顔の位置 { ファイル名: (中心x, 中心y, 一辺) }（元画像のピクセル）
FACE_BOXES = {
    'sataro (1).jpeg': (140, 185, 260),
    'sataro (2).jpeg': (1885, 1452, 1370),
    'sataro (3).jpeg': (916, 946, 946),
    'sataro (4).jpeg': (190, 260, 360),
    'sataro (5).jpeg': (981, 662, 1158),
    'sataro (6).jpeg': (70, 62, 118),
    'sataro (7).jpeg': (375, 470, 720),
    'sataro (8).jpeg': (1099, 756, 733),
    'sataro (9).jpeg': (410, 210, 420),
    'sataro (10).jpeg': (400, 390, 600),
    'sataro (11).jpeg': (768, 1134, 1594),
    'sataro (12).jpeg': (300, 680, 600),
    'sataro (13).jpeg': (190, 260, 360),
    'sataro (14).jpeg': (1123, 756, 1064),
    'sataro (15).jpeg': (567, 662, 1182),
    'sataro (16).jpeg': (340, 370, 640),
}

IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'}


def natural_key(p):
    import re
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', p.name)]


def list_images(folder):
    if not folder.exists():
        return []
    return sorted((p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXT), key=natural_key)


def open_rgb(path):
    return ImageOps.exif_transpose(Image.open(path)).convert('RGB')


def make_faces():
    out = ROOT / 'assets' / 'puyo'
    out.mkdir(parents=True, exist_ok=True)
    for i, path in enumerate(list_images(ROOT / 'images'), 1):
        im = open_rgb(path)
        w, h = im.size
        cx, cy, s = FACE_BOXES.get(path.name, (w // 2, int(h * 0.4), min(w, h)))
        s = min(s, w, h)
        x0 = min(max(cx - s // 2, 0), w - s)
        y0 = min(max(cy - s // 2, 0), h - s)
        face = im.crop((x0, y0, x0 + s, y0 + s)).resize((FACE_SIZE, FACE_SIZE), Image.LANCZOS)
        face.save(out / f'face{i:02d}.jpg', quality=86, optimize=True)
        print(f'{path.name} -> assets/puyo/face{i:02d}.jpg')


def make_backgrounds():
    out = ROOT / 'assets' / 'bg'
    out.mkdir(parents=True, exist_ok=True)
    for i, path in enumerate(list_images(ROOT / 'images2'), 1):
        im = open_rgb(path)
        w, h = im.size
        if w / h > BG_W / BG_H:
            cw, ch = int(h * BG_W / BG_H), h
        else:
            cw, ch = w, int(w * BG_H / BG_W)
        x0, y0 = (w - cw) // 2, (h - ch) // 2
        bg = im.crop((x0, y0, x0 + cw, y0 + ch)).resize((BG_W, BG_H), Image.LANCZOS)
        if cw < BG_W:  # 小さい画像を引き伸ばしたときのガビガビをなじませる
            bg = bg.filter(ImageFilter.GaussianBlur(1.2))
        bg.save(out / f'bg{i}.jpg', quality=80, optimize=True, progressive=True)
        print(f'{path.name} -> assets/bg/bg{i}.jpg')


if __name__ == '__main__':
    make_faces()
    make_backgrounds()
