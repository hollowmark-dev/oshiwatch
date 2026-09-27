#!/usr/bin/env python3
"""
HTTP Shortcuts の取り込み用ファイル（JSON）を生成する。

HTTP Shortcuts はリンク `https://http-shortcuts.rmy.ch/import?url=<このJSONのURL>` を開くだけで
取り込めるので、購入者への配布はこのJSONを公開URLに置くだけで済む。

書式は公式リポジトリの ImportExport* モデル（compatibilityVersion 90、v4.7.0時点）に合わせている。
IDは実行のたびに変わると再取り込み時に重複するので、名前から決まるUUIDv5にする。

使い方:
  python tools/build_import.py probe   → dist/probe.json
"""
import json
import pathlib
import sys
import uuid
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
NAMESPACE = uuid.UUID("6f0c2a4e-3a41-4a8e-9c61-0e7e2c3f5a10")  # このプロジェクト固有の名前空間
COMPATIBILITY_VERSION = 90


def uid(name):
    return str(uuid.uuid5(NAMESPACE, name))


def scripting_shortcut(name, code, *, description=None, icon="flat_color_star", repetition_minutes=None,
                       wait_for_internet=False, timeout_ms=None):
    s = {
        "id": uid("shortcut:" + name),
        "executionType": "scripting",
        "name": name,
        "iconName": icon,
        "codeOnPrepare": code,
    }
    if description:
        s["description"] = description
    if repetition_minutes:
        s["repetitionInterval"] = repetition_minutes
    if wait_for_internet:
        s["waitForInternet"] = True
    if timeout_ms:
        s["timeout"] = timeout_ms
    return s


def constant_variable(key, value=""):
    return {"id": uid("variable:" + key), "key": key, "type": "constant", "value": value}


def document(title, category_name, shortcuts, variables):
    return {
        "compatibilityVersion": COMPATIBILITY_VERSION,
        "version": COMPATIBILITY_VERSION,
        "title": title,
        "categories": [
            {
                "id": uid("category:" + category_name),
                "name": category_name,
                "layoutType": "linear_list",
                "shortcuts": shortcuts,
            }
        ],
        "variables": variables,
    }


def build_probe():
    code = (ROOT / "probe" / "probe.js").read_text(encoding="utf-8")
    return document(
        title="推しキャラ新商品ウォッチ 回線テスト",
        category_name="回線テスト",
        shortcuts=[
            scripting_shortcut(
                "回線テスト",
                code,
                description="サイトに届くか・商品を読み取れるかを確かめます",
                icon="flat_color_rocket",
            )
        ],
        variables=[constant_variable("ow_probe_runs", "0")],
    )


CATEGORY = "推しキャラ新商品ウォッチ"
# 状態を入れる変数。setVariable は変数が既にあることが前提なので、取り込み時に空で作っておく。
STATE_VARIABLES = ["ow_state", "ow_recent", "ow_selected", "ow_config"]


def with_lib(entry_file):
    """共通ライブラリを各ショートカットの先頭に埋め込む（アプリのグローバルコードは使わない）。"""
    lib = (ROOT / "src" / "lib.js").read_text(encoding="utf-8")
    entry = (ROOT / "src" / entry_file).read_text(encoding="utf-8")
    return lib + "\n\n" + entry


def app_shortcuts():
    return [
        scripting_shortcut(
            "新商品を見る",
            with_lib("view.js"),
            description="見つかった新商品の一覧。予約商品はカレンダーに登録できます",
            icon="flat_color_star",
        ),
        scripting_shortcut(
            "キャラを選ぶ",
            with_lib("pick.js"),
            description="通知してほしいキャラを選びます",
            icon="flat_color_lightbulb_3",
        ),
        scripting_shortcut(
            "今すぐチェック",
            with_lib("check_now.js"),
            description="いますぐ新商品を確認します",
            icon="flat_color_rocket",
        ),
        scripting_shortcut(
            "自動チェック",
            with_lib("check_auto.js"),
            description="6時間ごとに自動で動きます（タップ不要）。その日の確認が済んでいれば何もしません",
            icon="flat_color_rocket",
            repetition_minutes=360,
            wait_for_internet=True,
        ),
    ]


def build_install():
    """はじめて入れる人用。ショートカット＋空の変数。"""
    return document(
        title=CATEGORY,
        category_name=CATEGORY,
        shortcuts=app_shortcuts(),
        variables=[constant_variable(k, "") for k in STATE_VARIABLES],
    )


def build_update():
    """更新用。ショートカットだけを入れ替え、変数（選んだキャラ・記録）には触れない。"""
    return document(title=CATEGORY, category_name=CATEGORY, shortcuts=app_shortcuts(), variables=[])


TARGETS = {"probe": build_probe, "install": build_install, "update": build_update}


def main():
    names = sys.argv[1:] or list(TARGETS)
    for name in names:
        write_one(name)


def write_one(name):
    doc = TARGETS[name]()
    text = json.dumps(doc, ensure_ascii=False, indent=2)

    out_dir = ROOT / "dist"
    out_dir.mkdir(parents=True, exist_ok=True)

    # 確認用の素のJSON
    (out_dir / f"{name}.json").write_text(text, encoding="utf-8")

    # 配布用はZIP（中身は shortcuts.json 1つ）。アプリの取り込み処理はまずZIPとして読み、
    # ZIPでないと判定できた場合だけJSONとして読み直す作りで、素のJSONをURLから渡すと
    # 「unexpected end of stream」で失敗した（v4.7.0、2026-09-27 エミュレーターで確認）。
    # 公式のエクスポートと同じZIP形式なら確実に通る。
    zip_path = out_dir / f"{name}.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("shortcuts.json", text)
    print(f"wrote {zip_path} ({zip_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
