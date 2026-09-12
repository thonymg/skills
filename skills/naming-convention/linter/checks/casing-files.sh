#!/usr/bin/env bash
# checks/casing-files.sh — shim de compatibilité : délègue à nc-lint.pl --only casing-files.
exec perl "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nc-lint.pl" "${1:-.}" --only casing-files --no-color
