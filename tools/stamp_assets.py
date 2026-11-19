"""Add content-hash version tags to local asset URLs so browsers never keep a stale copy.

    python tools/stamp_assets.py

Rewrites references like  styles.css / app.js / assets/fonts/x.woff2  (optionally already ending in ?v=...)
in dist/**/*.html and dist/**/*.css to  name?v=<first 10 hex of the file's sha256>.
Run it after tools/subset_font.py and before committing. Idempotent.
"""
import hashlib
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
REF = re.compile(r'''(?P<pre>(?:href|src)=["']|url\()(?P<path>(?!https?:|data:|#|/)[^"')?#]+\.(?:css|js|woff2|svg|png))(?:\?v=[0-9a-f]+)?''')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def main():
    # CSS files are stamped too, which changes their own hash, so repeat until nothing moves.
    for _ in range(5):
        if not stamp_once():
            break


def stamp_once():
    changed = 0
    for page in sorted(list(DIST.rglob("*.html")) + list(DIST.rglob("*.css"))):
        text = page.read_text(encoding="utf-8")

        def tag(m):
            target = (page.parent / m.group("path")).resolve()
            if not target.is_file():
                return m.group(0)
            return f'{m.group("pre")}{m.group("path")}?v={digest(target)}'

        new = REF.sub(tag, text)
        if new != text:
            page.write_text(new, encoding="utf-8", newline="")
            changed += 1
            print("stamped", page.relative_to(ROOT))
    print(f"{changed} file(s) updated")
    return changed


if __name__ == "__main__":
    main()
