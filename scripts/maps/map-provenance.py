#!/usr/bin/env python3
"""Create and validate reproducible GIS provenance manifests."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, NoReturn


SHA256_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")


def fail(message: str) -> NoReturn:
    raise SystemExit(f"map provenance: {message}")


def identity_payload(
    component: str, dataset_version: str, source_url: str, sha256: str
) -> dict[str, str]:
    return {
        "component": component,
        "datasetVersion": dataset_version,
        "sourceUrl": source_url,
        "sha256": sha256.lower(),
    }


def fingerprint(payload: dict[str, str]) -> str:
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def validate_identity(
    component: str, dataset_version: str, source_url: str, sha256: str
) -> dict[str, str]:
    if not component or not dataset_version or not source_url:
        fail("component, dataset version, and source URL are required")
    if not SHA256_PATTERN.fullmatch(sha256):
        fail("source SHA-256 must be exactly 64 hexadecimal characters")
    return identity_payload(component, dataset_version, source_url, sha256)


def safe_artifact_path(root: Path, relative: str) -> Path:
    if not relative or Path(relative).is_absolute():
        fail(f"artifact path must be relative: {relative!r}")
    root_resolved = root.resolve()
    candidate = (root / relative).resolve()
    if candidate != root_resolved and root_resolved not in candidate.parents:
        fail(f"artifact path escapes manifest root: {relative!r}")
    return candidate


def ensure_non_empty_artifact(root: Path, relative: str) -> None:
    path = safe_artifact_path(root, relative)
    if path.is_file():
        if path.stat().st_size <= 0:
            fail(f"artifact is empty: {relative}")
        return
    if path.is_dir():
        for child in path.rglob("*"):
            if child.is_file() and child.stat().st_size > 0:
                return
        fail(f"artifact directory is empty: {relative}")
    fail(f"artifact is missing: {relative}")


def validate_manifest(
    manifest_path: Path,
    component: str,
    dataset_version: str,
    source_url: str,
    sha256: str,
    artifact_paths: list[str],
) -> dict[str, Any]:
    expected = validate_identity(component, dataset_version, source_url, sha256)
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read manifest {manifest_path}: {error}")
    if not isinstance(manifest, dict):
        fail("manifest root must be an object")
    for key, value in expected.items():
        if manifest.get(key) != value:
            fail(f"manifest {key} does not match the requested provenance")
    identity = manifest.get("identity")
    if not isinstance(identity, dict):
        fail("manifest identity is missing")
    if identity.get("fingerprint") != fingerprint(expected):
        fail("manifest identity fingerprint does not match its provenance")
    for key, value in expected.items():
        if identity.get(key) != value:
            fail(f"manifest identity {key} does not match the requested provenance")
    prepared_at = manifest.get("preparedAt")
    if not isinstance(prepared_at, str) or not prepared_at:
        fail("manifest preparedAt is missing")
    declared_artifacts = manifest.get("artifactPaths")
    if not isinstance(declared_artifacts, list) or not declared_artifacts:
        fail("manifest artifactPaths is missing")
    requested = artifact_paths or [str(item) for item in declared_artifacts]
    if any(item not in declared_artifacts for item in requested):
        fail("requested artifact is not declared by the manifest")
    root = manifest_path.parent
    for relative in requested:
        if not isinstance(relative, str):
            fail("manifest artifact path must be a string")
        ensure_non_empty_artifact(root, relative)
    return manifest


def command_identity(args: argparse.Namespace) -> None:
    payload = validate_identity(
        args.component, args.dataset_version, args.source_url, args.sha256
    )
    print(fingerprint(payload))


def command_write(args: argparse.Namespace) -> None:
    payload = validate_identity(
        args.component, args.dataset_version, args.source_url, args.sha256
    )
    output = Path(args.output)
    if not output.parent.is_dir():
        fail(f"manifest parent does not exist: {output.parent}")
    for artifact in args.artifact:
        ensure_non_empty_artifact(output.parent, artifact)
    prepared_at = args.prepared_at or datetime.now(timezone.utc).isoformat().replace(
        "+00:00", "Z"
    )
    tool: dict[str, str] = {}
    if args.tool_name:
        tool["name"] = args.tool_name
    if args.tool_version:
        tool["version"] = args.tool_version
    if args.tool_image:
        tool["image"] = args.tool_image
    manifest: dict[str, Any] = {
        "schemaVersion": 1,
        **payload,
        "preparedAt": prepared_at,
        "artifactPaths": args.artifact,
        "tool": tool,
        "identity": {**payload, "fingerprint": fingerprint(payload)},
    }
    output.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def command_validate(args: argparse.Namespace) -> None:
    manifest = validate_manifest(
        Path(args.manifest),
        args.component,
        args.dataset_version,
        args.source_url,
        args.sha256,
        args.artifact,
    )
    print(
        "PASS: "
        + manifest["component"]
        + " provenance "
        + manifest["identity"]["fingerprint"]
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_identity_arguments(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("--component", required=True)
        subparser.add_argument("--dataset-version", required=True)
        subparser.add_argument("--source-url", required=True)
        subparser.add_argument("--sha256", required=True)

    identity_parser = subparsers.add_parser("identity")
    add_identity_arguments(identity_parser)
    identity_parser.set_defaults(handler=command_identity)

    write_parser = subparsers.add_parser("write")
    add_identity_arguments(write_parser)
    write_parser.add_argument("--output", required=True)
    write_parser.add_argument("--prepared-at")
    write_parser.add_argument("--artifact", action="append", required=True)
    write_parser.add_argument("--tool-name")
    write_parser.add_argument("--tool-version")
    write_parser.add_argument("--tool-image")
    write_parser.set_defaults(handler=command_write)

    validate_parser = subparsers.add_parser("validate")
    add_identity_arguments(validate_parser)
    validate_parser.add_argument("--manifest", required=True)
    validate_parser.add_argument("--artifact", action="append")
    validate_parser.set_defaults(handler=command_validate)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.handler(args)


if __name__ == "__main__":
    main()
