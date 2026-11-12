"""Migrate the event / gallery posts of the previous site and build the gallery pages.

Usage:  WP_AUTH='user:app password' python3 events.py posts | templates | pages
"""
import html
import json
import os
import re
import sys
import urllib.parse

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))
from elt_site import STATE, save_state, NAVY, SAND, DISPLAY, BODY, HOME, eyebrow, anim, wanim, button, ensure_site_part, publish  # noqa: E402
from site_dynamic import page_hero, dyn  # noqa: E402
from el import S, box, gap, T, tag, con, w, heading, text, image  # noqa: E402
from wp import rest, mcp  # noqa: E402
from migrate import migrate_image, load_posts, media_info, clean_html, first_text, STATE as MSTATE, save as msave  # noqa: E402
from pages import save_page, section  # noqa: E402

CATS = {42: "Aláírási ceremónia", 43: "Családi nap", 44: "Gálaest", 45: "Közös élményeink", 31: "Rendezvények"}
FAMILY_CATS = {39, 40, 36}


def categories():
    cmap = STATE.setdefault("categories", {})
    for old_id, name in CATS.items():
        if str(old_id) in cmap:
            continue
        found = rest("GET", "wp/v2/categories?search=" + urllib.parse.quote(name) + "&_fields=id,name")
        hit = next((c for c in found if html.unescape(c["name"]) == name), None)
        cmap[str(old_id)] = hit["id"] if hit else rest("POST", "wp/v2/categories", {"name": name})["id"]
        save_state()
    return cmap


def event_elements(story_html, gallery_items):
    els = []
    if story_html:
        els.append(text(story_html, title="Szöveg", text_color=NAVY[600], **T(BODY, 17, 400, 1.75), _css_classes="elt-prose"))
    if gallery_items:
        els.append(w("image-gallery", title=f"Galéria ({len(gallery_items)} kép)", wp_gallery=gallery_items, gallery_columns="4",
                     gallery_columns_tablet="3", gallery_columns_mobile="2", thumbnail_size="medium", gallery_link="file",
                     open_lightbox="yes", gallery_display_caption="none", image_spacing="custom", image_spacing_custom=S(10),
                     image_border_radius=box(10)))
    return [con(*els, root=True, title="Tartalom", flex_gap=gap(32))]


def step_posts():
    cmap = categories()
    done = MSTATE.setdefault("events", {})
    posts = [p for p in load_posts() if not set(p["categories"]) & FAMILY_CATS]
    info = media_info([p["featured_media"] for p in posts])
    for p in sorted(posts, key=lambda x: x["date"]):
        if str(p["id"]) in done:
            continue
        title = html.unescape(p["title"]["rendered"]).strip()
        soup = BeautifulSoup(p["content"]["rendered"], "lxml")
        srcs = []
        for im in soup.find_all("img"):
            src = im.get("src")
            if src and src not in srcs:
                srcs.append(src)
        for g in soup.select("figure"):
            g.decompose()
        story = clean_html(str(soup.body or soup)) if soup.get_text(strip=True) else ""
        items = []
        for i, src in enumerate(srcs):
            new = migrate_image(src, title)
            if new:
                items.append({"id": new["id"], "url": new["url"]})
            if i % 20 == 19:
                print("   ", title, i + 1, "/", len(srcs))
        cover = None
        if p["featured_media"] in info:
            cover = migrate_image(info[p["featured_media"]]["source_url"], title)
        elif items:
            cover = items[0]
        cats = [cmap[str(c)] for c in p["categories"] if str(c) in cmap]
        excerpt = first_text(story, 200) if story else f"Fotógaléria – {len(items)} kép."
        payload = {"title": title, "slug": p["slug"], "status": "publish", "date": p["date"], "content": story or "",
                   "excerpt": excerpt, "categories": cats or [1],
                   "meta": {"_elementor_edit_mode": "builder", "_elementor_template_type": "wp-post",
                            "_elementor_data": json.dumps(event_elements(story, items), ensure_ascii=False)}}
        if cover:
            payload["featured_media"] = cover["id"]
        res = rest("POST", "wp/v2/posts", payload)
        done[str(p["id"])] = res["id"]
        msave()
        print("event", title, len(items), "images ->", res["id"])


# ----------------------------------------------------------------------- templates
def post_card():
    media = con(
        image({"id": "", "url": ""}, "medium_large", title="Borítókép", **dyn(image=tag("post-featured-image"))),
        title="Kép (link a bejegyzésre)", css_classes="elt-card-media elt-zoom", html_tag="a", link={"url": ""}, **dyn(link=tag("post-url")))
    body = con(
        heading("Dátum", "p", title="Dátum", title_color=SAND[700], **T(BODY, 12, 600, 1.4, 0.1, "uppercase"), _margin=box(0, 0, 6, 0),
                **dyn(title=tag("post-date", {"type": "post_date_gmt", "format": "custom", "custom_format": "Y. F j."}))),
        heading("Cím", "h3", title="Cím", title_color=NAVY[800], title_hover_color=SAND[700], **T(DISPLAY, 20, 600, 1.35),
                _margin=box(0, 0, 8, 0), **dyn(title=tag("post-title"), link=tag("post-url"))),
        text("<p>Kivonat</p>", title="Kivonat", text_color=NAVY[600], **T(BODY, 14, 400, 1.65), _margin=box(0, 0, 20, 0),
             **dyn(editor=tag("post-excerpt", {"max_length": "", "apply_to_post_content": ""}))),
        heading("Megnézem →", "p", title="Link", title_color=NAVY[800], title_hover_color=SAND[700], **T(BODY, 14, 600, 1.4),
                _css_classes="elt-card-cta", _padding=box(18, 0, 0, 0), _border_border="solid", _border_width=box(1, 0, 0, 0),
                _border_color=NAVY[200], **dyn(link=tag("post-url"))),
        title="Szöveg", padding=box(28), padding_mobile=box(24), _flex_size="grow")
    body["elements"][-1]["settings"]["_margin"] = {"unit": "px", "top": "auto", "right": "0", "bottom": "0", "left": "0", "isLinked": False}
    return [con(media, body, root=True, title="Bejegyzés kártya", html_tag="article", css_classes="elt-lift elt-family-card",
                background_background="classic", background_color=NAVY[50], border_border="solid", border_width=box(1),
                border_color=NAVY[100], border_radius=box(16), overflow="hidden")]


def single_post():
    hero = con(
        heading("Dátum", "p", title="Dátum", title_color=SAND[400], **T(BODY, 14, 600, 1.4, 0.2, "uppercase"), _margin=box(0, 0, 12, 0),
                **dyn(title=tag("post-date", {"type": "post_date_gmt", "format": "custom", "custom_format": "Y. F j."}))),
        heading("Cím", "h1", title="Cím", title_color="#FFFFFF", **T(DISPLAY, 52, 500, 1.15, size_t=42, size_m=34), **dyn(title=tag("post-title"))),
        root=True, title="Bejegyzés fejléc", html_tag="section", content_width="boxed", boxed_width=S(1152),
        padding=box(176, 40, 72, 40), padding_mobile=box(136, 24, 48, 24), background_background="classic", background_color=NAVY[800])
    body = con(con(w("theme-post-content", title="Tartalom (szöveg + galéria)"), title="Tartalom"),
               con(button("Vissza a galériához", HOME + "kozos-elmenyeink/", primary=False, light=False), title="Vissza", margin=box(48, 0, 0, 0)),
               root=True, title="Tartalom", html_tag="section", content_width="boxed", boxed_width=S(1152),
               padding=box(72, 40, 112, 40), padding_mobile=box(48, 24, 72, 24), background_background="classic", background_color="#FFFFFF")
    return [hero, body]


def step_templates():
    import elt_site
    pid = ensure_site_part("post_loop_id", "loop-item", "ELT – Bejegyzés kártya (Loop elem)", None)
    rest("POST", f"wp/v2/elementor_library/{pid}", {"status": "publish", "meta": {
        "_elementor_edit_mode": "builder", "_elementor_page_settings": {"preview_type": "single/post"},
        "_elementor_data": json.dumps(post_card(), ensure_ascii=False)}})
    sid = ensure_site_part("single_post_id", "single-post", "ELT – Bejegyzés oldal (sablon)", ["include/singular/post"])
    publish(sid, "elementor_library", single_post(), {"preview_type": "single/post"})
    elt_site.step_kit()  # clears Elementor's CSS cache (loop items cannot be saved through the MCP)
    print("templates", pid, sid)


def post_grid(cat_new_id, nothing):
    return w("loop-grid", title="Bejegyzések (Loop Grid)", template_id=STATE["post_loop_id"], columns=3, columns_tablet=2, columns_mobile=1,
             posts_per_page=12, column_gap=S(32), row_gap=S(32), row_gap_mobile=S(24), equal_height="yes",
             post_query_post_type="post", post_query_include=["terms"], post_query_include_term_ids=[str(cat_new_id)],
             post_query_orderby="date", post_query_order="desc", pagination_type="numbers",
             nothing_found_message=nothing, nothing_found_message_text=nothing, **wanim())


def event_card_dark():
    """Compact dark card for the footer event strip (cover, title, date)."""
    return [con(
        con(image({"id": "", "url": ""}, "medium_large", title="Borítókép", **dyn(image=tag("post-featured-image"))),
            title="Kép (link)", css_classes="elt-event-media elt-zoom", html_tag="a", link={"url": ""}, **dyn(link=tag("post-url"))),
        heading("Cím", "h4", title="Cím", title_color="#FFFFFF", title_hover_color=SAND[400], **T(DISPLAY, 16, 600, 1.4), _margin=box(16, 0, 4, 0),
                **dyn(title=tag("post-title"), link=tag("post-url"))),
        heading("Dátum", "p", title="Dátum", title_color="rgba(255,255,255,0.6)", **T(BODY, 14, 400, 1.5),
                **dyn(title=tag("post-date", {"type": "post_date_gmt", "format": "custom", "custom_format": "Y. F j."}))),
        root=True, title="Rendezvény kártya", css_classes="elt-event-card")]


def step_footer():
    import elt_site
    pid = ensure_site_part("event_loop_id", "loop-item", "ELT – Rendezvény kártya (lábléc, Loop elem)", None)
    rest("POST", f"wp/v2/elementor_library/{pid}", {"status": "publish", "meta": {
        "_elementor_edit_mode": "builder", "_elementor_page_settings": {"preview_type": "single/post"},
        "_elementor_data": json.dumps(event_card_dark(), ensure_ascii=False)}})
    elt_site.step_footer()
    elt_site.step_kit()
    print("footer events", pid)


GALLERY_PAGES = [("kozos-elmenyeink", "Közös élményeink", 45), ("csaladi-napok", "Családi napok", 43),
                 ("alairasi-ceremonia", "Aláírási ceremónia", 42), ("galaest", "Gálaest", 44)]


def step_pages():
    cmap = categories()
    for slug, title, old_cat in GALLERY_PAGES:
        save_page(slug, title, [
            page_hero("Galéria", title, "Képek és pillanatok az Alapítvány eseményeiről."),
            section(post_grid(cmap[str(old_cat)], "Hamarosan újabb képekkel jelentkezünk."), width=1280, bg=SAND[50]),
        ])


if __name__ == "__main__":
    for a in sys.argv[1:]:
        {"posts": step_posts, "templates": step_templates, "pages": step_pages, "footer": step_footer}[a]()
