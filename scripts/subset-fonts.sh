#!/usr/bin/env sh
# Rebuilds the embedded fonts of packages/core/src/fonts (SIL OFL 1.1).
#
# Sources: the full variable builds of github.com/google/fonts (ofl/literata,
# ofl/inter, ofl/jetbrainsmono). The Google Fonts API and Fontsource strip the small-caps features
# (smcp, c2sc) the design relies on, hence this local subset keeping every
# OpenType layout feature. Literata has no U+202F (narrow no-break space): the
# font stack falls back to Inter for it, which does.
#
# Usage: scripts/subset-fonts.sh <dir with the .ttf files>
# Requires: pip install fonttools brotli
set -eu
src="$1"
out="$(dirname "$0")/../packages/core/src/fonts"
# Latin, Latin-1, Latin Extended-A/B, general punctuation (incl. U+2042 ⁂),
# euro, trademark, arrows, minus, ligatures.
unicodes="U+0020-007E,U+00A0-024F,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0308,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FB01-FB02,U+FEFF,U+FFFD"
# The system's monospace (X250, docs/DESIGN.md §3.2) also keeps arrows, keys
# (⌘ ⇧ ⇥ ⏎ ⊞), block elements (▁…█, the Wi-Fi signal and the cpu curve), dots
# (● ○) and the lightning of the battery.
mono="$unicodes,U+2190-21FF,U+2295-22A1,U+2300-23FF,U+2580-259F,U+25A0-25FF,U+26A1"
# A missing source is skipped: one font can be rebuilt alone.
subset() {
  [ -f "$src/$1" ] || { echo "skipped: $1" >&2; return 0; }
  pyftsubset "$src/$1" --unicodes="${3:-$unicodes}" --layout-features='*' \
    --flavor=woff2 --output-file="$out/$2"
}
subset 'Literata[opsz,wght].ttf' Literata-Variable.woff2
subset 'Literata-Italic[opsz,wght].ttf' Literata-Italic-Variable.woff2
subset 'Inter[opsz,wght].ttf' Inter-Variable.woff2
subset 'JetBrainsMono[wght].ttf' JetBrainsMono-Variable.woff2 "$mono"
