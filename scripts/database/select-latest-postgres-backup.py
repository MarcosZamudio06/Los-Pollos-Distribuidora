#!/usr/bin/env python3
"""Print the newest non-empty deterministic PostgreSQL backup key."""

from __future__ import annotations

import argparse
import json
import re


KEY_PATTERN = re.compile(
    r"^postgres/\d{4}/\d{2}/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.dump$"
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as handle:
        payload = json.load(handle)

    keys = [
        item["Key"]
        for item in payload.get("Contents", [])
        if isinstance(item, dict)
        and isinstance(item.get("Key"), str)
        and KEY_PATTERN.fullmatch(item["Key"])
        and int(item.get("Size", 0)) > 0
    ]
    if not keys:
        return 1

    print(max(keys))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

