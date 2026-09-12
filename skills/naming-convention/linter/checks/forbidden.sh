#!/usr/bin/env bash
# checks/forbidden.sh — shim de compatibilité : délègue à nc-lint.pl --only forbidden.
exec perl "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nc-lint.pl" "${1:-.}" --only forbidden --no-color
