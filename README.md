# さたぷよ

さたろうの顔が落ちてくる、ぷよぷよ風の落ちものパズル。
ブラウザだけで動く（HTML / CSS / JavaScript のみ、ビルド不要）。PCでもスマホでも遊べる。

## あそびかた

同じ顔（同じ枠の色）を **4つ以上** くっつけると消える。消えたあとに落ちてきたぷよがまた4つそろうと **れんさ**。
左から3列目のいちばん上（✕じるし）まで積みあがったらゲームオーバー。

| 操作 | キー |
| --- | --- |
| 移動 | `←` `→` / `A` `D` |
| 早く落とす | `↓` / `S` |
| 一気に落とす | `↑` / `W` / `Space` |
| 右回転 / 左回転 | `X` `K` / `Z` `J` |
| ポーズ | `Esc` / `P` |

スマホは画面下のボタンで操作。せまいところで回転ボタンを2回すばやく押すと上下が入れかわる。

### モード・メニュー

- **とことんモード** … 積みあがるまでずっと。25手ごとにスピードアップ
- **タイムアタック** … 120秒でスコアかせぎ（秒数は `js/config.js` で変更可）
- **ランキング** … モードごとにトップ10（ブラウザに保存）
- **ずかん** … 顔の一覧と「けした数」。タップで ON / OFF して、出てくる顔を選べる
- **せってい** … ぷよの種類（3〜5）、スピード、落下ガイド、効果音、BGM、音量
- **おんがく** … BGM を作ったプラグイン（BOOTH）と YouTube のリンク
- **★ エンディング** … とことんモードで100万点以上とってゲームオーバーになると流れるエンドロール。一度見ると出てくる

## 手元で動かす

画像を読み込むので、ファイルを直接開くよりローカルサーバー経由が確実。

```bash
python -m http.server 8000
```

→ ブラウザで http://localhost:8000 を開く。

## 画像・音の差し替え

ほとんど **同じファイル名で上書きするだけ** で差し替わる。サイズはバラバラでもOK（ゲーム側で合わせる）。

| ファイル | 用途 | 目安サイズ |
| --- | --- | --- |
| `assets/puyo/face01.jpg` 〜 `face16.jpg` | 落ちてくるぷよの顔 | 正方形 256x256（ちがってもOK・中央を丸く切り抜く） |
| `assets/bg/title.jpg` / `menu.jpg` / `game.jpg` | 背景（作っておいた素材） | 1280x720 |
| `assets/bg/bg1.jpg` 〜 `bg4.jpg` | 背景（images2 の写真から作ったもの） | 1280x720 |
| `assets/bg/field.png` | フィールドの背景 | 384x768 |
| `assets/ui/logo.png` | タイトルロゴ（透過PNG） | 1000x340 |
| `assets/ui/icon.png` | ブラウザのタブのアイコン | 128x128 |
| `assets/sound/bgm_title.mp3` / `bgm_menu.mp3` / `bgm_game.mp3` | BGM（タイトル / メニュー / ゲーム中） | 何秒でもOK |
| `assets/voice/start.mp3` / `chain.mp3` / `cutin.mp3` / `end.mp3` | ボイス（開始 / 連鎖の終わり / ときどきカットイン / 終了） | 何秒でもOK |

細かい設定は **`js/config.js`** にまとまっている。

- `faces` … 顔の画像と名前（ずかんに出る）。増やしても減らしてもOK（最低3つ）
- `backgrounds` … 画面ごとの背景のリスト。何枚でもOKで、ゆっくり動きながら順番に切りかわる
- `sounds` … 効果音・BGMのファイル。`null` のままだと内蔵のピコピコ音が鳴る
  （例: `bgmGame: 'assets/sound/bgm_game.mp3'`）
- `ringColors` … ぷよの枠の色
- `title` … ゲームのタイトル

## BGM（Woody Class のプラグインで制作）

ぜんぶ、[Woody Class](https://www.youtube.com/@WoodyClass) の VST プラグインの音だけで作っている。
ゲームのメニューの「♪ おんがく」にも、使ったプラグインと YouTube のリンクを出している（中身は `js/config.js` の `credits`）。

| プラグイン | 使ったところ |
| --- | --- |
| [Woody Tsuzumi Beats](https://woodyclass.booth.pm/items/8975757) | ドラム（アニソン・ローファイ・邦ロック・メタルのグルーヴ） |
| [Woody Wasei Chords](https://woodyclass.booth.pm/items/8913254) | コード進行とボイシング（カノン進行・王道進行・テンション付き 2516・マイナー版 Axis など） |
| [Woody Katachi Synth](https://woodyclass.booth.pm/items/8914910)（無料） | 和音・ベース・メロディの音色（チップチューン矩形リード・8bit ベース・ローファイ・プラック・Supersaw・Reese Bass など） |
| [Woody Giongo EQ](https://woodyclass.booth.pm/items/8919240) | 仕上げの EQ（明るいポップ・ローファイ・EDM、ドラムにポップ・メタル） |

| 曲 | 中身 | テンポ / 長さ | ゲームで |
| --- | --- | --- | --- |
| テーマ1 タイトル（8bit） | カノン進行 → 王道進行 → ♭VI–♭VII–I、チップチューンのメロディ | 150 BPM / 16小節（25.6秒）ループ | タイトル |
| テーマ2 メニュー（ローファイ） | テンション付き 2516、後半はシェイカーとプラックのメロディ | 80 BPM / 16小節（48秒）ループ | メニュー |
| テーマ3 バトル（激しめ） | 4つ打ち → 2ビート＋ツーバス → メロスピ → ブレイク → 全部のせ | 160 BPM / 32小節（48秒）ループ | ゲーム中 |
| テーマ4 シティポップ | 丸サ進行 → 3625、16ビート、三角波のメロディとカッティング | 120 BPM / 16小節（32秒）ループ | （まだ使っていない） |
| テーマ5 ボス戦（8bit×メタル） | アンダルシア進行 → ナポリの六の和音、ツーバス・ギャロップ・3・3・2 のキメ | 180 BPM / 32小節（42.7秒）ループ | （まだ使っていない） |
| テーマ6 町（8bit） | C F C G のほのぼの進行、ブーム・チック | 120 BPM / 16小節（32秒）ループ | （まだ使っていない） |
| テーマ7 エンディング（J-POP） | 頭サビ → 8bit イントロ → A → B → サビ → 間奏 → A → B → サビ → 8bit ソロ → Cメロ → 落ちサビ → 半音上げのラスサビ → アウトロ | 160 BPM / 140小節（3分35秒） | エンディング |

ループ曲はつなぎ目なしでループする。作り直すときは（Node.js・ffmpeg と、Woody Class のプラグインのツールが必要）:

```bash
node tools/music/make_bgm.mjs
```

- ゲームで使う 4 曲は `assets/sound/bgm_*.mp3` に、保存用の「テーマ1〜7」は `music/` と `VSTプラグイン\BGM\` に（wav と試聴用 mp3。`music/` は GitHub に上げない）
- ツール（TsuzumiTool・WaonTool・KatachiTool・HibikiUiShots）は `%USERPROFILE%\WoodyClassBuild\…` から読む（別の場所なら環境変数 `WOODY_BUILD`）
- メロディ・リズムの刻み方・使うグルーヴや進行は `tools/music/make_bgm.mjs` の中に書いてある
- 最後に表示されるループ位置（`loopStart` / `loopEnd`）を `js/config.js` の `sounds` に書く
- 自分で作った mp3 にするなら `bgmGame: 'assets/sound/my_song.mp3'` のようにファイル名だけ書けば、ファイル全体をループする

## エンディング

とことんモードで **100万点以上** とってゲームオーバーになると、リザルトの前にエンドロールが流れる（曲はテーマ7）。
一度見ると、メニューに「★ エンディング」が出て何度でも見られる。

- 文字は下から上へ。うしろを飛行機・ジェット・ヘリ・気球・車・バス・ロケットに乗ったさたろうが左から右へ横切る。空は昼 → 夕方 → 夜
- スタッフ、CAST（16人の顔・キャラ・ひとこと）、Special Thanks、主演のひとこと、THANK YOU FOR PLAYING の順。曲が終わったら again のボイス
- 中身はぜんぶ `js/config.js`：CAST のキャラとひとことは `faces` の `role`・`comment`、ほかは `ending`（点数のしきい値・スタッフ・最後のひとことなど）

エンドロールを動画（1920x1080・30fps の mp4）にするときは（Microsoft Edge と ffmpeg が必要）:

```bash
node tools/video/make_ending_video.mjs
```

→ `music/` と `VSTプラグイン\BGM\` に「テーマ7 エンディング（J-POP）エンドロール.mp4」ができる。

## ボイス

`voice` フォルダの声を、お尻の無音を切って音量をそろえてから `assets/voice/` に入れている（元のファイルは GitHub に上げない）。

| いつ | ファイル（元） |
| --- | --- |
| ゲーム開始 | `start.mp3`（my f） |
| 2れんさ以上が終わったとき | `chain.mp3`（again） |
| ゲーム中にたまに（25〜50秒ごと・顔のカットインつき） | `cutin.mp3`（with y） |
| ゲーム終了（ばたんきゅ〜・タイムアップ） | `end.mp3`（are you） |

声が鳴っている間は BGM を少し下げる。声どうしは重ならない（あとから鳴った方に切りかわる）。
タイミングは `js/config.js` の `voices`・`voiceChainMin`・`voiceCutinSeconds` で変えられる。「せってい」の「ボイス」で OFF にもできる。

### 元の写真から作り直す

`images/`（顔）と `images2/`（背景）に写真を入れて実行すると、`assets/` の画像を作り直す。

```bash
pip install pillow
python tools/make_assets.py
```

顔の切り抜き位置は `tools/make_assets.py` の `FACE_BOXES` で調整できる。
`images/` と `images2/` は元写真なので GitHub には上げない設定（`.gitignore`）にしてある。

## GitHub Pages で公開

1. GitHub のリポジトリの **Settings → Pages** を開く
2. Source を **Deploy from a branch**、Branch を `main` / `/ (root)` にして Save
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で遊べる

## ファイル構成

```
index.html        画面（タイトル・メニュー・ゲーム・リザルトなど）
css/style.css     見た目
js/config.js      画像・音・タイトルなどの設定
js/audio.js       効果音とBGMの再生（ファイルがなければ内蔵音）
js/game.js        ぷよぷよ本体（盤面・回転・連鎖・得点・描画）
js/ending.js      エンディング（エンドロール）の絵
js/main.js        画面遷移・入力・ランキング・ずかん・せってい
assets/           画像
tools/            画像作成・BGM作成（プラグインで鳴らす）・エンドロールの動画書き出し
```
