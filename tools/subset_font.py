"""Rebuild dist/assets/fonts/pretendard-subset.woff2 with only the characters the site uses.

Run this after changing any text in dist/ (HTML or JS). Characters missing from the subset
still render, in the visitor's system font, so a forgotten run looks slightly off but never breaks.

    pip install fonttools brotli
    curl -LO https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2
    python3 tools/subset_font.py PretendardVariable.woff2
"""
import pathlib
import string
import sys

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT = DIST / "assets" / "fonts" / "pretendard-subset.woff2"


def site_text():
    chars = set(string.printable) | set("·•⇄→←↑↓…‘’“”–—©")
    for path in sorted(DIST.rglob("*")):
        if path.suffix in {".html", ".js"}:
            chars |= set(path.read_text(encoding="utf-8"))
    return "".join(sorted(c for c in chars if c.isprintable()))


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = site_text()
    subset.main([
        sys.argv[1],
        f"--text={text}",
        "--flavor=woff2",
        "--layout-features=kern,liga,calt,tnum",
        "--no-hinting",
        f"--output-file={OUT}",
    ])
    print(f"{len(text)} characters -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
