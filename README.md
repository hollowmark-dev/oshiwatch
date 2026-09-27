# oshiwatch（推しキャラ新商品ウォッチ・開発中）

好きなキャラクターの新商品だけを、スマホに通知するための仕組みです。
Android の無料アプリ [HTTP Shortcuts](https://play.google.com/store/apps/details?id=ch.rmy.android.http_shortcuts) の上で動く「ショートカット」として配布します。
独自のアプリはインストールしません。

いま対応しているお店:

- サンリオオンラインショップ本店（直近30日の新商品）
- むにゅぐるみパティオ（NEWの付いた商品）

対応キャラは319（両方のお店に対応しているのは38）。一覧は [config/config.json](config/config.json) にあります。

## 入れ方（開発中の手順）

1. Google Play で **HTTP Shortcuts** をインストールする（無料）
2. スマホで次のリンクを開き、「Import from URL」の画面で **OK** を押す
   https://http-shortcuts.rmy.ch/import?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhollowmark-dev%2Foshiwatch%2Fmain%2Fdist%2Finstall.zip
3. 「**キャラを選ぶ**」→「追加する」→ キャラ名の一部（例: `けろ`）を入れて、通知してほしいキャラにチェック
4. 「**今すぐチェック**」を1回押す（初回は、いまある商品を登録するだけで通知はしません）
5. あとは「自動チェック」が6時間ごとに動きます。新商品が出たら通知が届きます

更新するときは、次のリンクを開いてください（選んだキャラと記録はそのまま残ります）:
https://http-shortcuts.rmy.ch/import?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhollowmark-dev%2Foshiwatch%2Fmain%2Fdist%2Fupdate.zip

## 中身

| パス | 内容 |
|---|---|
| `src/lib.js` | 共通処理（取得・読み取り・差分・安全装置・通知） |
| `src/check_auto.js` ほか | 各ショートカットの入口 |
| `config/config.json` | サイトの読み取り条件・対応キャラ一覧・停止スイッチ |
| `dist/install.zip` / `update.zip` | 取り込み用ファイル |
| `tools/` | 上の各ファイルを作るスクリプト |
| `DESIGN.md` | 設計と、この構成に至った経緯 |

## アクセスの作法

- 各お店へのアクセスは、使う人のスマホから1日1回・1.5秒間隔の逐次実行に限る
- User-Agent は正直に名乗る（`OshiWatch/… (HTTP Shortcuts; +このリポジトリ)`）
- `robots.txt` で禁止されているURLは使わない（週1回確認し、禁止されたら自動で止まる）
- お店側のアクセス制限（国外アクセス制限・ボット確認など）は迂回しない

お店の運営者の方で、アクセスを止めてほしい場合は Issue でお知らせください。設定ファイルの停止スイッチで、全員の確認をすぐに止められます。
