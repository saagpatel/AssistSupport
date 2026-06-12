#!/usr/bin/env bash
set -euo pipefail

# CVE-2025-3000 is currently reported by pip-audit through torch, pulled
# transitively by sentence-transformers, with no fix version available.
bash scripts/search-api/run-python.sh -m pip_audit \
  -r requirements.txt \
  --ignore-vuln CVE-2025-3000
