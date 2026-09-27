#!/usr/bin/env python3
"""
購入者のスマホが毎回読みに来る設定ファイル（config/config.json）を作る。

- サイトごとのURLテンプレート・ページ数上限・読み取り条件
- 対応キャラ一覧（catalog/characters.json から）
- 停止スイッチ（status / message）と、版の管理（min_version / latest_version）

接続先のホストはスクリプト側（src/lib.js の ALLOWED_HOSTS）に固定してあるので、
ここで別のホストを書いても購入者の端末はアクセスしない。

使い方:
  python tools/build_config.py
  python tools/build_config.py --suspend "サイトの変更に対応中です"   ← 全購入者の確認を一時停止
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

SITES = {
    "sanrio_shop": {
        # new=30: 直近30日に出た商品だけ。人気キャラでも件数が少なく、1〜2ページで済む。
        "list_url": "https://shop.sanrio.co.jp/item?new=30&character_id%5B%5D={id}&page={page}",
        "max_pages": 3,
        "card_selector": "li.c-goods-item",
        "preorder_keywords": ["発売予定日", "先行予約", "予約受付", "発売日"],
    },
    "munyugurumi": {
        # new=1: NEWラベルの付いた商品だけ。robots.txt が sort / order / limit 付きのURLを
        # 全ボットに禁止しているので、それらは付けない（2026-09-27 確認）。
        "list_url": "https://munyugurumi.jp/itemlist?new=1&character={id}&page={page}",
        "max_pages": 2,
        "card_selector": "div.mod-goods",
    },
}


def main():
    characters = json.loads((ROOT / "catalog" / "characters.json").read_text(encoding="utf-8"))
    suspend = None
    if "--suspend" in sys.argv:
        suspend = sys.argv[sys.argv.index("--suspend") + 1]

    config = {
        "schema_version": 1,
        "status": "suspended" if suspend else "active",
        "message": suspend,
        "min_version": 1,
        "latest_version": 1,
        "limits": {"request_interval_ms": 1500, "max_new_per_run": 5},
        "sites": SITES,
        "characters": characters,
    }
    out = ROOT / "config" / "config.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(config, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size} bytes, {len(characters)} characters, status={config['status']})")


if __name__ == "__main__":
    main()
