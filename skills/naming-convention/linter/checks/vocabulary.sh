#!/usr/bin/env bash
# checks/vocabulary.sh — shim de compatibilité : délègue à nc-lint.pl --only vocabulary.
exec perl "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nc-lint.pl" "${1:-.}" --only vocabulary --no-color
