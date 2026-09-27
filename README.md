# oshiwatch（開発中）

好きなキャラクターの新商品だけを、スマホに通知するための仕組みです。
Android の無料アプリ [HTTP Shortcuts](https://http-shortcuts.rmy.ch/) の上で動く「ショートカット」として配布します。
独自のアプリはインストールしません。

## いまの状態

回線・機能テストの段階です。

- `probe/probe.js` — 回線・機能テスト用のスクリプト
- `tools/build_import.py` — HTTP Shortcuts の取り込み用ファイル（ZIP）を作る
- `dist/probe.zip` — 取り込み用ファイル

## 回線テストを取り込む

HTTP Shortcuts を入れたAndroidで、次のリンクを開きます。

https://http-shortcuts.rmy.ch/import?url=https%3A%2F%2Fraw.githubusercontent.com%2Fhollowmark-dev%2Foshiwatch%2Fmain%2Fdist%2Fprobe.zip

## アクセスの作法

- 各サイトへのアクセスは、使う人のスマホから1日1回程度・逐次実行に限る
- User-Agent は正直に名乗る（`OshiWatch/… (HTTP Shortcuts; +このリポジトリ)`）
- `robots.txt` で禁止されているURLは使わない
- サイト側のアクセス制限（国外アクセス制限・ボット確認など）は迂回しない

サイトの運営者の方で、アクセスを止めてほしい場合は Issue でお知らせください。
