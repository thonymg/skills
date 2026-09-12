#!/usr/bin/env bash
# checks/standalone-suffixes.sh — shim de compatibilité : délègue à nc-lint.pl --only standalone-suffixes.
exec perl "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nc-lint.pl" "${1:-.}" --only standalone-suffixes --no-color
