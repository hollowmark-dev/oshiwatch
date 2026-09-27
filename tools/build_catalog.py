#!/usr/bin/env python3
"""
対応キャラ一覧（サンリオ公式の character_id と、むにゅぐるみの character コードの対応表）を作る。
開発者が時々手元で実行するためのもので、購入者の端末では動かない。

- サンリオ公式: `item?character_id=<id>` のページ題名がキャラ名になる（存在しないIDは「検索結果」）。
  サイトマップが無いので、IDを1.5秒間隔で順に調べる。キャラ選択UIに出るのは人気35キャラだけで、
  それ以外のID（例: おさるのもんきち=30）もURLとしては有効なため、UIからは拾わない。
- むにゅぐるみ: 一覧ページの絞り込みリンク `character=<コード>">キャラ名` から取る（1リクエスト）。

使い方:
  python tools/build_catalog.py            → catalog/raw_sanrio.json, raw_munyu.json, characters.json
  python tools/build_catalog.py --merge-only  → 取得済みの raw_*.json から characters.json だけ作り直す
"""
import html
import json
import pathlib
import re
import sys
import time
import unicodedata
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "catalog"
UA = "OshiWatch/0.1 (catalog build; +https://github.com/hollowmark-dev/oshiwatch)"
INTERVAL = 1.5
SANRIO_ID_RANGES = [range(1, 251), range(1000, 1101)]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "ja"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", errors="replace")


def crawl_sanrio():
    found = {}
    ids = [i for rng in SANRIO_ID_RANGES for i in rng]
    for n, cid in enumerate(ids, 1):
        try:
            html = get(f"https://shop.sanrio.co.jp/item?character_id={cid}")
        except Exception as e:  # noqa: BLE001
            print(f"  id={cid} error {e}", flush=True)
            time.sleep(INTERVAL)
            continue
        m = re.search(r"<title>([^<｜]+)｜", html)
        name = m.group(1).strip() if m else None
        if name and name != "検索結果":
            total = re.search(r'search-result"><span>([\d,]+)件', html)
            found[str(cid)] = {"name": name, "total": int(total.group(1).replace(",", "")) if total else 0}
            print(f"  [{n}/{len(ids)}] id={cid} {name}", flush=True)
        time.sleep(INTERVAL)
    return found


def crawl_munyu():
    # キャラで絞り込んだページから取ると、選択中のキャラだけリンクの形が変わって漏れる（けろっぴで発生）。
    # 絞り込み無しのページから取る。
    html = get("https://munyugurumi.jp/itemlist?new=1")
    pairs = {}
    for code, name in re.findall(r'href="/itemlist\?new=1&(?:amp;)?character=([A-Za-z0-9]+)">([^<]+)', html):
        pairs.setdefault(code, name.strip())
    return pairs


def norm(name):
    s = unicodedata.normalize("NFKC", name)
    # 表記ゆれ（空白・中黒・感嘆符など）を無視して照合する（例: ウィアーダイナソアーズ！）
    return re.sub(r"[\s・･.．\-ー!！?？]", "", s).lower()


def merge(sanrio, munyu):
    by_norm = {}
    for sid, info in sanrio.items():
        name = html.unescape(info["name"])  # 題名には「&amp;」のような記号が混ざる
        if not norm(name):
            continue  # 「-」のような中身の無いカテゴリ
        entry = by_norm.setdefault(norm(name), {"name": name, "sources": {}, "items": 0})
        entry["sources"]["sanrio_shop"] = sid
        entry["items"] = max(entry["items"], info.get("total", 0))
    for code, raw_name in munyu.items():
        name = html.unescape(raw_name)
        if not norm(name):
            continue
        entry = by_norm.setdefault(norm(name), {"name": name, "sources": {}, "items": 0})
        entry["sources"]["munyugurumi"] = code

    characters = []
    for entry in by_norm.values():
        src = entry["sources"]
        key = ("m_" + src["munyugurumi"].lower()) if "munyugurumi" in src else ("s_" + src["sanrio_shop"])
        characters.append({"key": key, "name": entry["name"], "sources": src, "_items": entry["items"]})
    # 選ぶ画面での並び順: サンリオ公式での商品数が多い順（人気の目安）→ 両サイト対応 → 名前順。
    # 多くの人の推しが上のほうに来るようにする。
    characters.sort(key=lambda c: (-c["_items"], -len(c["sources"]), c["name"]))
    for c in characters:
        del c["_items"]
    return characters


def main():
    OUT.mkdir(exist_ok=True)
    if "--merge-only" not in sys.argv:
        print("munyugurumi...", flush=True)
        munyu = crawl_munyu()
        (OUT / "raw_munyu.json").write_text(json.dumps(munyu, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {len(munyu)} codes", flush=True)
        time.sleep(INTERVAL)
        print("sanrio shop...", flush=True)
        sanrio = crawl_sanrio()
        (OUT / "raw_sanrio.json").write_text(json.dumps(sanrio, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {len(sanrio)} ids", flush=True)
    else:
        if "--refresh-munyu" in sys.argv:
            munyu = crawl_munyu()
            (OUT / "raw_munyu.json").write_text(json.dumps(munyu, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"munyugurumi: {len(munyu)} codes", flush=True)
        munyu = json.loads((OUT / "raw_munyu.json").read_text(encoding="utf-8"))
        sanrio = json.loads((OUT / "raw_sanrio.json").read_text(encoding="utf-8"))

    characters = merge(sanrio, munyu)
    (OUT / "characters.json").write_text(json.dumps(characters, ensure_ascii=False, indent=2), encoding="utf-8")
    both = sum(1 for c in characters if len(c["sources"]) == 2)
    print(f"characters: {len(characters)} (両サイト対応 {both})", flush=True)


if __name__ == "__main__":
    main()
