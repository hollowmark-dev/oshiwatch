#!/usr/bin/env python3
"""開発用（配布しない）: 繰り返し実行が、アプリを閉じた状態でも起動されるかを確かめる。dev/repeat.zip を作る。"""
import json
import pathlib
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_import as b  # noqa: E402

code = (ROOT / "dev" / "repeat_probe.js").read_text(encoding="utf-8")
doc = b.document(
    "開発用",
    "開発用",
    [b.scripting_shortcut("繰り返しテスト（開発用）", code, repetition_minutes=10)],
    [b.constant_variable("ow_repeat_probe", "0")],
)
out = ROOT / "dev" / "repeat.zip"
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr("shortcuts.json", json.dumps(doc, ensure_ascii=False))
print(f"wrote {out}")
