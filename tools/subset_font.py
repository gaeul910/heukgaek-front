"""Rebuild the site's self-hosted fonts, cut down to only the characters the site uses.

Run this after changing any text in dist/ (HTML or JS):

    pip install fonttools brotli
    python tools/subset_font.py

Sources live in tools/fonts-src/ (all SIL OFL 1.1; licenses alongside):
  - Galmuri11 / Galmuri11 Bold  all Korean text (pixel)     github.com/quiple/galmuri
  - Departure Mono              pixel display + code (Latin) github.com/rektdeckard/departure-mono

Characters missing from a subset still render in the visitor's system font, so a forgotten run
looks slightly off but never breaks.
"""
import pathlib
import string

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SRC = ROOT / "tools" / "fonts-src"
OUT = DIST / "assets" / "fonts"
EXTRA = "·•⇄→←↑↓…‘’“”–—©"

# (source file, output file, which characters, OpenType features to keep)
FONTS = [
    ("DepartureMono-Regular.woff2", "departure-subset.woff2", "ascii", "kern"),
    ("Galmuri11.woff2", "galmuri11-subset.woff2", "site", "kern"),
    ("Galmuri11-Bold.woff2", "galmuri11-bold-subset.woff2", "site", "kern"),
]


def site_text():
    chars = set(string.printable) | set(EXTRA)
    for path in sorted(DIST.rglob("*")):
        if path.suffix in {".html", ".js"}:
            chars |= set(path.read_text(encoding="utf-8"))
    return "".join(sorted(c for c in chars if c.isprintable()))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    texts = {"site": site_text(), "ascii": "".join(c for c in string.printable if c.isprintable()) + EXTRA}
    for src, out, which, features in FONTS:
        dest = OUT / out
        subset.main([
            str(SRC / src),
            f"--text={texts[which]}",
            "--flavor=woff2",
            f"--layout-features={features}",
            "--no-hinting",
            f"--output-file={dest}",
        ])
        print(f"{len(texts[which]):4d} characters -> {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
