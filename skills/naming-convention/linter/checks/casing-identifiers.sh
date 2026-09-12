#!/usr/bin/env bash
# checks/casing-identifiers.sh — shim de compatibilité : délègue à nc-lint.pl --only casing-identifiers.
exec perl "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/nc-lint.pl" "${1:-.}" --only casing-identifiers --no-color
