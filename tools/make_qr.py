# シェアの画像に入れる QR コード（assets/ui/qr.png）を作る。js/config.js の share.url を変えたら作りなおす
#   pip install segno
#   python tools/make_qr.py https://satapuyo.com/
import sys
from pathlib import Path

import segno

url = sys.argv[1] if len(sys.argv) > 1 else 'https://satapuyo.com/'
out = Path(__file__).resolve().parent.parent / 'assets' / 'ui' / 'qr.png'
segno.make(url, error='m').save(out, scale=12, border=2, dark='#3a2350', light='#ffffff')
print('書き出し:', out, url)
