#!/usr/bin/env bash
# checks/class-suffixes.sh — shim de compatibilité : délègue à nc-lint.pl --only class-suffixes.
exec perl "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nc-lint.pl" "${1:-.}" --only class-suffixes --no-color
