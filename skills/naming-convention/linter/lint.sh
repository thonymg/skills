#!/usr/bin/env bash
# lint.sh — Point d'entrée du linter de convention de nommage.
# Le moteur est nc-lint.pl (Perl 5 de base, zéro dépendance, lecture seule).
#
# Usage:
#   ./lint.sh [TARGET] [--only CHECK] [--json] [--summary] [--no-color]
#
# TARGET peut être un dossier OU un fichier unique (usage typique de l'agent :
# vérifier le fichier qu'il vient d'écrire).
#
# Checks : casing-files, casing-identifiers, prefixes, forbidden,
#          class-suffixes, standalone-suffixes
# Exit   : 0 si aucune erreur, 1 sinon.
exec perl "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nc-lint.pl" "$@"
