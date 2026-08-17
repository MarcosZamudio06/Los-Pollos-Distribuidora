#!/usr/bin/env python3
"""Select PostgreSQL backup objects that are safe to remove.

The input is the JSON response from S3 ListObjectsV2. Only deterministic
PostgreSQL dump keys are considered. The newest valid dump is always retained,
even when every configured retention window is zero.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections.abc import Iterable


KEY_PATTERN = re.compile(
    r"^postgres/(?P<year>\d{4})/(?P<month>\d{2})/"
    r"(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.dump$"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="ListObjectsV2 JSON file")
    parser.add_argument("--daily", type=int, required=True)
    parser.add_argument("--weekly", type=int, required=True)
    parser.add_argument("--monthly", type=int, required=True)
    return parser.parse_args()


def valid_objects(payload: dict) -> list[dict]:
    contents = payload.get("Contents") or []
    return [
        item
        for item in contents
        if isinstance(item, dict)
        and isinstance(item.get("Key"), str)
        and KEY_PATTERN.fullmatch(item["Key"])
        and int(item.get("Size", 0)) > 0
    ]


def newest_by_group(objects: Iterable[dict], group: str) -> list[dict]:
    grouped: dict[str, dict] = {}
    for item in objects:
        match = KEY_PATTERN.fullmatch(item["Key"])
        assert match is not None
        timestamp = match.group("timestamp")
        if group == "daily":
            group_key = timestamp[:10]
        elif group == "weekly":
            group_key = timestamp[:10]
            from datetime import date

            parsed = date.fromisoformat(group_key)
            group_key = f"{parsed.isocalendar().year:04d}-W{parsed.isocalendar().week:02d}"
        else:
            group_key = timestamp[:7]

        current = grouped.get(group_key)
        if current is None or item["Key"] > current["Key"]:
            grouped[group_key] = item

    return list(grouped.values())


def keep_latest_groups(objects: list[dict], group: str, count: int) -> set[str]:
    if count <= 0:
        return set()
    grouped = newest_by_group(objects, group)
    grouped.sort(key=lambda item: item["Key"], reverse=True)
    return {item["Key"] for item in grouped[:count]}


def main() -> int:
    args = parse_args()
    if min(args.daily, args.weekly, args.monthly) < 0:
        print("retention values must be non-negative", file=sys.stderr)
        return 2

    with open(args.input, encoding="utf-8") as handle:
        payload = json.load(handle)

    objects = valid_objects(payload)
    if len(objects) <= 1:
        return 0

    objects.sort(key=lambda item: item["Key"])
    keep = {objects[-1]["Key"]}
    keep.update(keep_latest_groups(objects, "daily", args.daily))
    keep.update(keep_latest_groups(objects, "weekly", args.weekly))
    keep.update(keep_latest_groups(objects, "monthly", args.monthly))

    for item in objects:
        if item["Key"] not in keep:
            print(item["Key"])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

