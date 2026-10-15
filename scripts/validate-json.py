#!/usr/bin/env python3
"""Validate theme JSON, allowing Shopify's leading /* ... */ auto-gen headers."""

from __future__ import annotations

import json
import pathlib
import re
import sys

COMMENT = re.compile(r"/\*.*?\*/", re.S)


def load(path: pathlib.Path) -> None:
    text = path.read_text(encoding="utf-8")
    text = COMMENT.sub("", text, count=1).lstrip()
    if not text:
        raise ValueError("empty after stripping comment header")
    json.loads(text)


def main() -> int:
    roots = [pathlib.Path("templates"), pathlib.Path("config")]
    fail = 0
    checked = 0
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.json")):
            checked += 1
            try:
                load(path)
            except Exception as exc:  # noqa: BLE001 — report all parse failures
                print(f"::error file={path}::{exc}")
                fail += 1
    print(f"Checked {checked} JSON files under templates/ and config/.")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
