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
    "profile": "nextjs_frontend",
    "interface": "service_creator_v1",
    "default_root": "/var/www/apps/indoor-mapping",
    "pm2_name": "indoor-mapping",
    "base_path": "/map",
    "bind_host": "127.0.0.1",
    "health_path": "/map/api/health",
    "format": "nextjs_standalone",
}
for key, value in expected.items():
    if not re.search(rf"^\s*{re.escape(key)}:\s*{re.escape(value)}\s*$", manifest, re.MULTILINE):
        errors.append(f"manifest must declare {key}: {value}")

for relative in (
    "scripts/deploy.sh",
    "scripts/rollback.sh",
    "scripts/readiness.sh",
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
if 'output: "standalone"' not in next_config or 'basePath: "/map"' not in next_config:
    errors.append("Next.js standalone/basePath settings disagree with the manifest")

env_example = (root / ".env.example").read_text(encoding="utf-8")
for setting in ("APP_HOST=127.0.0.1", "APP_BASE_PATH=/map", "PM2_APP_NAME=indoor-mapping"):
    if setting not in env_example:
        errors.append(f".env.example is missing {setting}")

if errors:
    for error in errors:
        print(f"Error: {error}", file=sys.stderr)
    raise SystemExit(1)

print("Frontend deployment contract is valid")
