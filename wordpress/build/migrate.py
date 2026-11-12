"""Migrate content from the previous site (egylepesseltobb.hu) into the new WordPress.

Usage:  WP_AUTH='user:app password' python3 migrate.py families|events
Progress is saved in migrate_state.json (resumable). Images are resized to max 2000 px
before upload and recorded in media_map.json (old URL -> new attachment).
"""
import html
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from wp import rest, _CTX  # noqa: E402

OLD = "https://egylepesseltobb.hu"
HERE = os.path.dirname(__file__)
STATE_F = os.path.join(HERE, os.environ.get("MIGRATE_STATE", "migrate_state.json"))
MAP_F = os.path.join(HERE, os.environ.get("MIGRATE_MAP", "media_map.json"))
STATE = json.load(open(STATE_F)) if os.path.exists(STATE_F) else {}
MAP = json.load(open(MAP_F)) if os.path.exists(MAP_F) else {}
CACHE = os.path.join(HERE, ".cache")
os.makedirs(CACHE, exist_ok=True)


def save():
    json.dump(STATE, open(STATE_F, "w"), indent=1, ensure_ascii=False)
    json.dump(MAP, open(MAP_F, "w"), indent=1, ensure_ascii=False)


def old_get(path_or_url, binary=False):
    url = path_or_url if path_or_url.startswith("http") else OLD + path_or_url
    req = urllib.request.Request(urllib.parse.quote(url, safe=":/?&=%#,+~@!$'()*;"),
                                 headers={"User-Agent": "Mozilla/5.0 (site migration)"})
    with urllib.request.urlopen(req, context=_CTX, timeout=120) as r:
        data = r.read()
    return data if binary else json.loads(data.decode())


def original_url(url):
    """Thumbnail URL (…-300x200.jpg / …-scaled.jpg) → the uploaded original where possible."""
    return re.sub(r"-\d{2,4}x\d{2,4}(\.[a-zA-Z]{3,4})$", r"\1", url)


def migrate_image(url, alt=""):
    """Download (original size), shrink to ≤2000 px, upload; returns {'id','url'}."""
    url = html.unescape(url).split("?")[0]
    key = original_url(url)
    if key in MAP:
        return MAP[key]
    data = None
    for candidate in (key, url):
        try:
            data = old_get(candidate, binary=True)
            src = candidate
            break
        except Exception:
            continue
    if data is None:
        print("  ! image not found", url)
        return None
    name = os.path.basename(urllib.parse.urlparse(src).path)
    stem, ext = os.path.splitext(name)
    ext = ext.lower()
    mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml"}.get(ext)
    if ext in (".jpg", ".jpeg", ".png", ".webp"):
        try:
            im = Image.open(io.BytesIO(data))
            has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
            if max(im.size) > 2000 or (ext == ".png" and not has_alpha and len(data) > 600_000):
                im.thumbnail((2000, 2000))
                buf = io.BytesIO()
                if has_alpha:
                    im.save(buf, "PNG", optimize=True)
                    ext, mime = ".png", "image/png"
                else:
                    im.convert("RGB").save(buf, "JPEG", quality=84, optimize=True, progressive=True)
                    ext, mime = ".jpg", "image/jpeg"
                data = buf.getvalue()
        except Exception as e:  # keep the original bytes
            print("  ! resize failed", name, e)
    if not mime:
        print("  ! unsupported", name)
        return None
    stem = re.sub(r"-scaled$", "", stem)
    res = rest("POST", "wp/v2/media", raw=data,
               headers={"Content-Type": mime, "Content-Disposition": f'attachment; filename="{urllib.parse.quote(stem)}{ext}"'})
    if alt:
        rest("POST", f"wp/v2/media/{res['id']}", {"alt_text": alt})
    MAP[key] = {"id": res["id"], "url": res["source_url"]}
    save()
    return MAP[key]


ALLOWED = {"p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a"}


def clean_html(c):
    """Keep simple formatting only (paragraphs, lists, emphasis, links)."""
    c = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", "", c, flags=re.S)
    c = re.sub(r"<!--.*?-->", "", c, flags=re.S)

    def tagfix(m):
        closing, name, attrs = m.group(1), m.group(2).lower(), m.group(3) or ""
        if name not in ALLOWED:
            return ""
        if name == "a" and not closing:
            href = re.search(r'href="([^"]+)"', attrs)
            return f'<a href="{href.group(1)}">' if href else "<a>"
        return f"<{closing}{name}>"
    c = re.sub(r"<(/?)([a-zA-Z0-9]+)([^>]*)>", tagfix, c)
    c = re.sub(r"<p>\s*(&nbsp;|\xa0)?\s*</p>", "", c)
    c = re.sub(r"\n\s*\n+", "\n", c).strip()
    return c


def first_text(c, limit=260):
    text = html.unescape(re.sub(r"<[^>]+>", " ", c))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:–-")
    return cut + "…"


def load_posts():
    path = os.path.join(CACHE, "posts.json")
    if not os.path.exists(path):
        posts = []
        for page in (1, 2):
            posts += old_get(f"/wp-json/wp/v2/posts?per_page=100&page={page}&_fields=id,slug,link,date,title,content,excerpt,featured_media,categories")
        json.dump(posts, open(path, "w"))
    return json.load(open(path))


def media_info(ids):
    out = {}
    ids = [i for i in ids if i]
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        for m in old_get("/wp-json/wp/v2/media?per_page=100&include=" + ",".join(map(str, chunk)) + "&_fields=id,source_url,alt_text"):
            out[m["id"]] = m
    return out


ADOPTABLE, ADOPTED, UNCATEGORIZED = 39, 40, 36


def step_families():
    from elt_site import STATE as SITE
    terms = SITE["terms"]
    posts = [p for p in load_posts() if set(p["categories"]) & {ADOPTABLE, ADOPTED, UNCATEGORIZED}]
    print(len(posts), "families")
    done = STATE.setdefault("families", {})
    # Remove the three demo families created from the design mock (replaced by the real ones).
    for name, pid in list(SITE.get("families", {}).items()):
        if not STATE.get("demo_removed_" + str(pid)):
            try:
                rest("DELETE", f"wp/v2/elt_csalad/{pid}?force=true")
            except RuntimeError as e:
                print("  demo delete", pid, e)
            STATE["demo_removed_" + str(pid)] = True
            save()
    info = media_info([p["featured_media"] for p in posts if str(p["id"]) not in done])
    for p in sorted(posts, key=lambda x: x["date"]):
        if str(p["id"]) in done:
            continue
        title = html.unescape(p["title"]["rendered"]).strip()
        content = p["content"]["rendered"]
        for src in set(re.findall(r'<img[^>]+src="([^"]+)"', content)):
            new = migrate_image(src, title)
            if new:
                content = content.replace(src, new["url"])
        body = clean_html(content)
        cover = None
        if p["featured_media"] and p["featured_media"] in info:
            cover = migrate_image(info[p["featured_media"]]["source_url"], info[p["featured_media"]].get("alt_text") or title)
        status = "orokbefogadhato" if ADOPTABLE in p["categories"] else "orokbefogadott"
        payload = {"title": title, "slug": p["slug"], "status": "publish", "date": p["date"], "content": body,
                   "excerpt": first_text(body), "elt_statusz": [terms[status]]}
        if cover:
            payload["featured_media"] = cover["id"]
        res = rest("POST", "wp/v2/elt_csalad", payload)
        done[str(p["id"])] = res["id"]
        save()
        print(len(done), status, title, "->", res["id"])
    print("families done", len(done))


if __name__ == "__main__":
    {"families": step_families}[sys.argv[1]]()
