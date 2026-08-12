#!/usr/bin/env python3

from pathlib import Path
import json
import re
import sys


root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
manifest_path = root / "deploy/deployment.yml"
errors: list[str] = []

if not manifest_path.is_file():
    errors.append("deploy/deployment.yml is missing")
    manifest = ""
else:
    manifest = manifest_path.read_text(encoding="utf-8")

expected = {
    "schema_version": "1",
    "name": "indoor-mapping",
    "interface": "service_creator_v1",
    "install": "deploy/install.sh",
    "readiness": "deploy/readiness.sh",
    "default_root": "/var/www/apps/indoor-mapping",
    "build": "deploy/build.sh",
    "artifact_root": ".deploy-artifact",
}
for key, value in expected.items():
    if not re.search(rf"^\s*{re.escape(key)}:\s*{re.escape(value)}\s*$", manifest, re.MULTILINE):
        errors.append(f"manifest must declare {key}: {value}")

for relative in (
    "deploy/build.sh",
    "deploy/install.sh",
    "deploy/readiness.sh",
    ".env.example",
    "package-lock.json",
    "app/api/health/route.js",
):
    if not (root / relative).is_file():
        errors.append(f"manifest asset is missing: {relative}")

package = json.loads((root / "package.json").read_text(encoding="utf-8"))
if package.get("engines", {}).get("node") != ">=20.9.0":
    errors.append("package.json must pin the supported Node runtime")
if package.get("scripts", {}).get("build") is None:
    errors.append("package.json must define a build command")

next_config = (root / "next.config.ts").read_text(encoding="utf-8")
if (
    'output: "standalone"' not in next_config
    or "process.env.APP_BASE_PATH" not in next_config
    or '"/map"' not in next_config
):
    errors.append("Next.js standalone/basePath settings disagree with the manifest")

manifest = (root / "deploy/deployment.yml").read_text(encoding="utf-8")
for setting in ("name: indoor-mapping", "path: /map"):
    if setting not in manifest:
        errors.append(f"deploy/deployment.yml is missing {setting}")

local_environment = (root / ".env.example").read_text(encoding="utf-8")
if "APP_BASE_PATH=/map" not in local_environment:
    errors.append(".env.example is missing local setting APP_BASE_PATH=/map")

if errors:
    for error in errors:
        print(f"Error: {error}", file=sys.stderr)
    raise SystemExit(1)

print("Frontend deployment contract is valid")
