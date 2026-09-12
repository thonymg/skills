#!/usr/bin/env bash
# checks/prefixes.sh — shim de compatibilité : délègue à nc-lint.pl --only prefixes.
exec perl "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nc-lint.pl" "${1:-.}" --only prefixes --no-color
