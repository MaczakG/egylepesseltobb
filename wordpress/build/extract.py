"""Turn an old Elementor page (rendered HTML) into an ordered list of widgets."""
import html as H
import re
from bs4 import BeautifulSoup


def _text(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()


def widgets(rendered):
    soup = BeautifulSoup(rendered, "lxml")
    out = []
    for el in soup.select("[class*=elementor-widget-]"):
        cls = " ".join(el.get("class", []))
        m = re.search(r"elementor-widget-([a-z0-9_-]+)", cls)
        if not m or "elementor-widget-container" == m.group(0):
            continue
        t = m.group(1)
        if t in ("container",):
            continue
        if el.find_parent(class_=re.compile("elementor-widget-")):
            continue  # nested inside another widget (e.g. loop)
        w = {"type": t}
        if t == "heading":
            h = el.find(re.compile("^h[1-6]$|^p$|^div$"), class_=re.compile("elementor-heading-title"))
            if not h:
                continue
            w["tag"] = h.name
            w["text"] = _text(h)
            a = h.find("a")
            if a and a.get("href"):
                w["href"] = a["href"]
        elif t == "text-editor":
            c = el.find(class_="elementor-widget-container") or el
            w["html"] = c.decode_contents().strip()
            w["text"] = _text(c)
        elif t == "image":
            img = el.find("img")
            if not img:
                continue
            w["src"] = img.get("src")
            w["alt"] = img.get("alt", "")
            a = el.find("a")
            if a and a.get("href"):
                w["href"] = a["href"]
        elif t == "button":
            a = el.find("a")
            w["text"] = _text(el)
            w["href"] = a.get("href") if a else ""
        elif t == "icon-list":
            w["items"] = []
            for li in el.select("li"):
                a = li.find("a")
                w["items"].append({"text": _text(li), "href": a.get("href") if a else ""})
        elif t == "shortcode":
            w["text"] = _text(el)[:300]
            w["fields"] = [_text(l) for l in el.select("label")]
        elif t in ("posts", "loop-grid"):
            w["titles"] = [_text(h) for h in el.select("h3, .elementor-post__title")]
        elif t == "video":
            w["settings"] = el.get("data-settings", "")
        elif t in ("image-gallery", "gallery", "media-carousel"):
            w["images"] = [i.get("src") for i in el.select("img")] + [a.get("href") for a in el.select("a[href]")]
        elif t == "breadcrumbs":
            continue
        else:
            w["text"] = _text(el)[:300]
        out.append(w)
    return out
