#!/usr/bin/env python3
"""Maintain an atomic transaction manifest for GIS refreshes."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, NoReturn


STATUSES = {
    "PREPARING",
    "VALIDATED",
    "PROMOTING",
    "ACTIVE",
    "ROLLED_BACK",
    "FAILED",
}
PROMOTION_STATES = {"SWITCHING", "ACTIVE", "ROLLED_BACK", "FAILED"}


def fail(message: str) -> NoReturn:
    raise SystemExit(f"map refresh: {message}")


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_manifest(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read manifest {path}: {error}")
    if not isinstance(value, dict):
        fail("manifest root must be an object")
    return value


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.partial")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)


def update(path: Path, callback: Any) -> dict[str, Any]:
    manifest = read_manifest(path)
    manifest["updatedAt"] = now()
    callback(manifest)
    atomic_write(path, manifest)
    return manifest


def command_init(args: argparse.Namespace) -> None:
    if not args.refresh_id:
        fail("refresh ID is required")
    output = Path(args.output)
    if output.exists():
        fail(f"refresh manifest already exists: {output}")
    manifest = {
        "schemaVersion": 1,
        "refreshId": args.refresh_id,
        "startedAt": args.started_at or now(),
        "updatedAt": now(),
        "status": "PREPARING",
        "components": {},
        "promotions": {},
        "metrics": {
            "backendDowntimeSeconds": 0,
            "preparationDurationSeconds": None,
            "promotionDurationSeconds": None,
        },
    }
    atomic_write(output, manifest)


def command_set_status(args: argparse.Namespace) -> None:
    if args.status not in STATUSES:
        fail(f"unsupported status: {args.status}")
    path = Path(args.manifest)

    def change(manifest: dict[str, Any]) -> None:
        manifest["status"] = args.status
        if args.reason:
            manifest["reason"] = args.reason

    update(path, change)


def command_set_component(args: argparse.Namespace) -> None:
    path = Path(args.manifest)

    def change(manifest: dict[str, Any]) -> None:
        components = manifest.setdefault("components", {})
        components[args.component] = {
            "datasetVersion": args.dataset_version,
            "sourceUrl": args.source_url,
            "sha256": args.sha256.lower(),
            "fingerprint": args.fingerprint,
            "candidatePath": args.candidate_path,
            "manifestPath": str(Path(args.candidate_path) / "manifest.json"),
        }

    update(path, change)


def command_set_promotion(args: argparse.Namespace) -> None:
    if args.state not in PROMOTION_STATES:
        fail(f"unsupported promotion state: {args.state}")
    path = Path(args.manifest)

    def change(manifest: dict[str, Any]) -> None:
        promotions = manifest.setdefault("promotions", {})
        promotions[args.component] = {
            "service": args.service,
            "state": args.state,
            "durationMs": int(args.duration_ms),
            "health": args.health,
            "smoke": args.smoke,
            "updatedAt": now(),
        }

    update(path, change)


def command_set_metric(args: argparse.Namespace) -> None:
    path = Path(args.manifest)

    try:
        metric_value: Any = int(args.value)
    except ValueError:
        metric_value = args.value

    def change(manifest: dict[str, Any]) -> None:
        metrics = manifest.setdefault("metrics", {})
        metrics[args.key] = metric_value

    update(path, change)


def command_validate(args: argparse.Namespace) -> None:
    manifest = read_manifest(Path(args.manifest))
    if manifest.get("schemaVersion") != 1:
        fail("unsupported refresh manifest schema")
    if not manifest.get("refreshId"):
        fail("refreshId is missing")
    status = manifest.get("status")
    if status not in STATUSES:
        fail("manifest status is invalid")
    components = manifest.get("components")
    if not isinstance(components, dict):
        fail("components must be an object")
    required = args.component or []
    missing = [name for name in required if name not in components]
    if missing:
        fail(f"missing components: {', '.join(missing)}")
    print(f"PASS: refresh {manifest['refreshId']} status={status}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser("init")
    init.add_argument("--output", required=True)
    init.add_argument("--refresh-id", required=True)
    init.add_argument("--started-at")
    init.set_defaults(handler=command_init)

    set_status = subparsers.add_parser("set-status")
    set_status.add_argument("--manifest", required=True)
    set_status.add_argument("--status", required=True)
    set_status.add_argument("--reason")
    set_status.set_defaults(handler=command_set_status)

    component = subparsers.add_parser("set-component")
    component.add_argument("--manifest", required=True)
    component.add_argument("--component", required=True)
    component.add_argument("--dataset-version", required=True)
    component.add_argument("--source-url", required=True)
    component.add_argument("--sha256", required=True)
    component.add_argument("--fingerprint", required=True)
    component.add_argument("--candidate-path", required=True)
    component.set_defaults(handler=command_set_component)

    promotion = subparsers.add_parser("set-promotion")
    promotion.add_argument("--manifest", required=True)
    promotion.add_argument("--component", required=True)
    promotion.add_argument("--service", required=True)
    promotion.add_argument("--state", required=True)
    promotion.add_argument("--duration-ms", required=True)
    promotion.add_argument("--health", required=True)
    promotion.add_argument("--smoke", required=True)
    promotion.set_defaults(handler=command_set_promotion)

    metric = subparsers.add_parser("set-metric")
    metric.add_argument("--manifest", required=True)
    metric.add_argument("--key", required=True)
    metric.add_argument("--value", required=True)
    metric.set_defaults(handler=command_set_metric)

    validate = subparsers.add_parser("validate")
    validate.add_argument("--manifest", required=True)
    validate.add_argument("--component", action="append")
    validate.set_defaults(handler=command_validate)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
