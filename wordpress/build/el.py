"""Tiny Elementor (V3 containers + widgets) JSON builder used by site.py."""
import json
import random
import urllib.parse

_rng = random.Random()


def eid():
    return "".join(_rng.choice("0123456789abcdef") for _ in range(7))


def S(size, unit="px"):
    return {"unit": unit, "size": size, "sizes": []}


def box(t, r=None, b=None, l=None, unit="px"):
    if r is None:
        r = b = l = t
    elif b is None:
        b, l = t, r
    elif l is None:
        l = r
    return {"unit": unit, "top": str(t), "right": str(r), "bottom": str(b), "left": str(l), "isLinked": False}


def gap(n, row=None):
    return {"column": str(n), "row": str(n if row is None else row), "unit": "px", "isLinked": row is None}


def G(color_id):
    return "globals/colors?id=" + color_id


def T(family=None, size=None, weight=None, lh=None, ls=None, tt=None, style=None,
      size_l=None, size_t=None, size_m=None, prefix="typography", lh_unit="em", ls_unit="em"):
    d = {f"{prefix}_typography": "custom"}
    if family:
        d[f"{prefix}_font_family"] = family
    if size is not None:
        d[f"{prefix}_font_size"] = S(size)
    for suf, val in (("_tablet_extra", size_l), ("_tablet", size_t), ("_mobile", size_m)):
        if val is not None:
            d[f"{prefix}_font_size{suf}"] = S(val)
    if weight:
        d[f"{prefix}_font_weight"] = str(weight)
    if lh is not None:
        d[f"{prefix}_line_height"] = S(lh, lh_unit)
    if ls is not None:
        d[f"{prefix}_letter_spacing"] = S(ls, ls_unit)
    if tt:
        d[f"{prefix}_text_transform"] = tt
    if style:
        d[f"{prefix}_font_style"] = style
    return d


def tag(name, settings=None):
    """Dynamic tag text, e.g. for __dynamic__ values."""
    return '[elementor-tag id="%s" name="%s" settings="%s"]' % (
        eid(), name, urllib.parse.quote_plus(json.dumps(settings or {}, separators=(",", ":"), ensure_ascii=False)))


def con(*children, root=False, title=None, **s):
    settings = {"content_width": "full", "flex_direction": "column", "flex_gap": gap(0)}
    settings.update(s)
    if title:
        settings["_title"] = title
    return {"id": eid(), "elType": "container", "isInner": not root, "settings": settings, "elements": list(children)}


def grid(*children, cols=3, cols_t=None, cols_m=None, cols_l=None, g=24, g_m=None, title=None, **s):
    settings = {
        "container_type": "grid", "content_width": "full",
        "grid_columns_grid": S(cols, "fr"), "grid_rows_grid": S("auto", "custom"),
        "grid_gaps": gap(g), "grid_auto_flow": "row",
    }
    for suf, val in (("_tablet_extra", cols_l), ("_tablet", cols_t), ("_mobile", cols_m)):
        if val is not None:
            settings["grid_columns_grid" + suf] = S(val, "fr")
            settings["grid_rows_grid" + suf] = S("auto", "custom")
    if g_m is not None:
        settings["grid_gaps_mobile"] = gap(g_m)
    settings.update(s)
    if title:
        settings["_title"] = title
    return {"id": eid(), "elType": "container", "isInner": True, "settings": settings, "elements": list(children)}


def w(widget_type, title=None, **s):
    if title:
        s["_title"] = title
    return {"id": eid(), "elType": "widget", "widgetType": widget_type, "settings": s, "elements": []}


def heading(text, tag_="h2", title=None, **s):
    settings = {"title": text, "header_size": tag_}
    settings.update(s)
    if title:
        settings["_title"] = title
    return {"id": eid(), "elType": "widget", "widgetType": "heading", "settings": settings, "elements": []}


def text(html, title=None, **s):
    settings = {"editor": html}
    settings.update(s)
    if title:
        settings["_title"] = title
    return {"id": eid(), "elType": "widget", "widgetType": "text-editor", "settings": settings, "elements": []}


def image(media, size="large", title=None, **s):
    settings = {"image": {"id": media["id"], "url": media["url"], "source": "library"}, "image_size": size}
    settings.update(s)
    if title:
        settings["_title"] = title
    return {"id": eid(), "elType": "widget", "widgetType": "image", "settings": settings, "elements": []}


def link(url, external=False):
    return {"url": url, "is_external": "on" if external else "", "nofollow": "", "custom_attributes": ""}


def walk(elements):
    for e in elements:
        yield e
        yield from walk(e.get("elements", []))
