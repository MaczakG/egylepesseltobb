"""Rebuild every page of the previous site (egylepesseltobb.hu) in the new design.

Usage:  WP_AUTH='user:app password' python3 pages.py all | <slug> [<slug> ...] | menu | events
The old pages are read from the previous site's public REST API and converted widget by
widget (headings, text, images, buttons, documents) into native Elementor widgets.
"""
import html
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(__file__))
import elt_site as base  # noqa: E402
import site_dynamic as dyn_  # noqa: E402
from elt_site import STATE, save_state, m, NAVY, SAND, DISPLAY, BODY, HOME, PAGE_SETTINGS, eyebrow, anim, wanim, button  # noqa: E402
from site_dynamic import (page_hero, loop_grid, form_style, acceptance_privacy, fid, application_form, donation_form,  # noqa: E402
                          terms, DOMAIN, PRIVACY_URL, dyn)
from el import S, box, gap, T, tag, con, grid, w, heading, text, image, link  # noqa: E402
from wp import rest, mcp, save_elementor  # noqa: E402
from migrate import migrate_image, old_get, MAP, save as save_map, clean_html  # noqa: E402
from extract import widgets as extract_widgets  # noqa: E402

OLD = "https://egylepesseltobb.hu"
CACHE = os.path.join(os.path.dirname(__file__), ".cache", "pages.json")


def old_pages():
    if not os.path.exists(CACHE):
        data = old_get("/wp-json/wp/v2/pages?per_page=100&_fields=id,slug,link,title,content")
        json.dump(data, open(CACHE, "w"))
    return {p["slug"]: p for p in json.load(open(CACHE))}


def W(slug):
    return extract_widgets(old_pages()[slug]["content"]["rendered"])


def migrate_file(url):
    """Upload a document (PDF) and return its new URL."""
    url = html.unescape(url)
    if url in MAP:
        return MAP[url]["url"]
    data = old_get(url, binary=True)
    name = os.path.basename(urllib.parse.urlparse(url).path)
    res = rest("POST", "wp/v2/media", raw=data, headers={"Content-Type": "application/pdf",
                                                       "Content-Disposition": f'attachment; filename="{urllib.parse.quote(name)}"'})
    MAP[url] = {"id": res["id"], "url": res["source_url"]}
    save_map()
    return MAP[url]["url"]


def new_link(href):
    """Map an old-site link to the new site (pages keep their slugs; uploads are migrated)."""
    if not href:
        return href
    if href.startswith(OLD + "/wp-content/uploads/") and href.lower().endswith(".pdf"):
        return migrate_file(href)
    if href.startswith(OLD):
        path = href[len(OLD):]
        if path in ("", "/", "/fooldal", "/fooldal/"):
            return HOME
        return HOME + path.lstrip("/")
    return href


# --------------------------------------------------------------------------- building blocks
def prose(html_, title="Szöveg", **s):
    return text(html_, title=title, text_color=NAVY[600], **T(BODY, 17, 400, 1.75, size_m=16), _css_classes="elt-prose", **s)


def h2(txt, color=NAVY[800], **s):
    return heading(txt, "h2", title="Alcím", title_color=color, **T(DISPLAY, 32, 500, 1.25, size_m=26), **s)


def h3(txt, color=NAVY[800], **s):
    return heading(txt, "h3", title="Alcím", title_color=color, **T(DISPLAY, 22, 600, 1.3), **s)


def section(*els, bg="#FFFFFF", width=900, title="Tartalom", gap_=24, **s):
    return con(*els, root=True, title=title, html_tag="section", content_width="boxed", boxed_width=S(width),
               flex_gap=gap(gap_), background_background="classic", background_color=bg,
               padding=box(96, 40, 112, 40), padding_mobile=box(64, 24, 72, 24), **s)


def card(*els, title="Kártya", **s):
    st = dict(background_background="classic", background_color="#FFFFFF", border_radius=box(16), padding=box(28),
              border_border="solid", border_width=box(1), border_color=NAVY[100], css_classes="elt-lift", flex_gap=gap(8))
    st.update(s)
    return con(*els, title=title, **st)


def img(url, alt="", **s):
    new = migrate_image(url, alt)
    if not new:
        return None
    st = dict(width=S(100, "%"), image_border_radius=box(16))
    st.update(s)
    return image(new, "large", title="Kép", **st)


def gallery(urls, cols=3, title="Galéria"):
    items = []
    for u in urls:
        new = migrate_image(u)
        if new:
            items.append({"id": new["id"], "url": new["url"]})
    return w("image-gallery", title=title, wp_gallery=items, gallery_columns=str(cols), gallery_columns_tablet="3",
             gallery_columns_mobile="2", thumbnail_size="medium_large", gallery_link="file", open_lightbox="yes",
             gallery_display_caption="none", image_spacing="custom", image_spacing_custom=S(12), image_border_radius=box(12))


def is_decor(wd, page_title):
    t = (wd.get("text") or "").strip().lower()
    return t in ("egy lépéssel több alapítvány", "kezdőlap", page_title.strip().lower(), "")


def as_paragraph(wd):
    """The old site often used headings for body text; long ones become paragraphs."""
    t = wd.get("text", "")
    return wd["type"] == "heading" and (len(t) > 90 or t.endswith((".", "!", "?")) and len(t) > 40)


def convert(widgets_, page_title, skip=()):
    """Generic: old widget list → new Elementor elements."""
    out, para, imgs = [], [], []

    def flush():
        nonlocal para, imgs
        if para:
            out.append(prose("".join(para)))
            para = []
        if imgs:
            if len(imgs) == 1:
                e = img(imgs[0][0], imgs[0][1])
                if e:
                    out.append(e)
            else:
                out.append(gallery([u for u, _ in imgs]))
            imgs = []

    for wd in widgets_:
        t = wd["type"]
        if is_decor(wd, page_title) or (wd.get("text") or "") in skip:
            continue
        if t == "image":
            if para:
                out.append(prose("".join(para)))
                para = []
            imgs.append((wd["src"], wd.get("alt", "")))
            continue
        if imgs:
            flush()
        if t == "heading" and as_paragraph(wd):
            para.append(f"<p>{html.escape(wd['text'])}</p>")
        elif t == "heading":
            flush()
            out.append(h2(wd["text"], _margin=box(24, 0, 0, 0)) if not wd.get("href") else
                       button(wd["text"], new_link(wd["href"]), primary=False, light=False))
        elif t == "text-editor":
            para.append(re.sub(r'href="([^"]+)"', lambda mm: f'href="{new_link(html.unescape(mm.group(1)))}"', clean_html(wd["html"])))
        elif t == "icon-list":
            flush()
            items = "".join(f'<li><a href="{new_link(i["href"])}">{html.escape(i["text"])}</a></li>' if i["href"]
                            else f"<li>{html.escape(i['text'])}</li>" for i in wd["items"])
            out.append(prose(f"<ul>{items}</ul>", title="Lista"))
        elif t == "button" and wd.get("href"):
            flush()
            out.append(button(wd["text"] or "Tovább", new_link(wd["href"])))
    flush()
    return out


def save_page(slug, title, elements, key=None):
    key = key or "page_" + slug
    pid = STATE.get(key)
    if not pid:
        ex = rest("GET", f"wp/v2/pages?slug={urllib.parse.quote(slug)}&status=any&context=edit&_fields=id")
        pid = ex[0]["id"] if ex else rest("POST", "wp/v2/pages", {"title": title, "slug": slug, "status": "draft",
                                                                    "template": "elementor_header_footer"})["id"]
        STATE[key] = pid
        save_state()
    save_elementor("pages", pid, elements, PAGE_SETTINGS,
                   extra={"status": "publish", "title": title, "slug": slug, "template": "elementor_header_footer"})
    print("page", slug, pid)
    return pid


def generic(slug, eyebrow_txt="Egy Lépéssel Több Alapítvány", lead=None, extra_sections=(), skip=()):
    p = old_pages()[slug]
    title = html.unescape(p["title"]["rendered"])
    wds = W(slug)
    if lead is None:
        for wd in wds:
            if not is_decor(wd, title) and wd["type"] in ("heading", "text-editor") and as_paragraph(wd) and len(wd["text"]) < 400:
                lead = wd["text"]
                skip = tuple(skip) + (lead,)
                break
    body = convert(wds, title, skip)
    sections = [page_hero(eyebrow_txt, title, lead or "")]
    if body:
        sections.append(section(*body))
    sections += list(extra_sections)
    return save_page(slug, title, sections)


# --------------------------------------------------------------------------- forms
def opt_lines(pairs):
    return "\n".join(f"{a}|{b}" for a, b in pairs)


def supporter_form():
    return application_form()


def simple_form(name, fields, button_text, success, subject):
    return w("form", title=f"{name} űrlap", form_name=name, form_fields=fields, button_text=button_text,
             submit_actions=["email", "save-to-database"], email_to="info@" + DOMAIN, email_subject=subject,
             email_content="[all-fields]", email_from="noreply@bographic.hu", email_from_name="Egy Lépéssel Több weboldal",
             email_reply_to='[field id="email"]', email_content_type="html", success_message=success,
             error_message="Hiba történt a küldés során. Kérjük, próbáld újra, vagy írj az info@" + DOMAIN + " címre.",
             **form_style())


def form_card(form_widget, title="Űrlap"):
    return con(form_widget, title=title, background_background="classic", background_color="#FFFFFF", border_radius=box(16),
               padding=box(40), padding_mobile=box(24), border_border="solid", border_width=box(1), border_color=NAVY[100])


# --------------------------------------------------------------------------- special pages
def amount_cards(wds, label_word):
    """Old "Támogatás összege: X Ft  [Fizetés]" blocks → cards with the SimplePay payment links."""
    amounts = [wd["text"] for wd in wds if wd["type"] == "heading" and re.match(r"^[\d\s]+Ft$", wd["text"])]
    links = [wd for wd in wds if wd["type"] == "button" and "simplepay" in (wd.get("href") or "")]
    cards = []
    for i, (amt, btn) in enumerate(zip(amounts, links)):
        cards.append(card(
            heading(label_word, "p", title="Felirat", title_color=NAVY[500], **T(BODY, 13, 600, 1.4, 0.1, "uppercase")),
            heading(amt, "h3", title="Összeg", title_color=NAVY[800], **T(DISPLAY, 34, 600, 1.2), _margin=box(0, 0, 12, 0)),
            button(btn["text"] or "Fizetés", btn["href"], title="Fizetés (SimplePay link)", text_padding=box(12, 24, 12, 24)),
            title=f"Összeg: {amt}", flex_align_items="center", border_border="solid", border_width=box(4, 0, 0, 0),
            border_color=SAND[500], **anim((i % 4) * 80)))
    return grid(*cards, cols=4, cols_t=2, cols_m=1, g=24, title="Összegek (SimplePay fizetési linkek)")


def simplepay_note():
    return con(image(m("simplepay_logo.svg"), "full", title="SimplePay logó", link_to="custom",
                     link=link("https://simplepay.hu/vasarlo-aff", True), width=S(110)),
               text("<p>A bankkártyás fizetést az OTP Mobil Kft. SimplePay rendszere biztosítja.</p>", title="SimplePay szöveg",
                    text_color=NAVY[500], **T(BODY, 13, 400, 1.5)),
               title="SimplePay", flex_direction="row", flex_align_items="center", flex_gap=gap(16), flex_wrap="wrap")


def page_linkesfizetes():
    slug = "linkesfizetes"
    wds = W(slug)
    paras = "".join(re.sub(r'href="([^"]+)"', lambda mm: f'href="{new_link(mm.group(1))}"', clean_html(wd["html"])) for wd in wds if wd["type"] == "text-editor")
    custom = con(
        h2("Egyedi összeg megadása"),
        prose("<p>Más összeggel szeretnél támogatni? Add meg az összeget – a fizetés a SimplePay biztonságos oldalán történik.</p>"),
        form_card(donation_form(), "Adomány kártya"),
        title="Egyedi összeg (csak beállított SimplePay kulcsokkal látszik)", css_classes="elt-csak-simplepay", flex_gap=gap(16),
        margin=box(56, 0, 0, 0))
    pid = save_page(slug, "Az Alapítvány működésének támogatása", [
        page_hero("Támogatás", "Az Alapítvány működésének támogatása", "Az Alapítvány céljainak megvalósítása érdekében minden támogatás kiemelten fontos számunkra."),
        section(prose(paras), amount_cards(wds, "Támogatás összege"), simplepay_note(), custom, width=1152, bg=SAND[50], _element_id="adomany"),
    ], key="support_id")
    return pid


def page_payment_event(slug, label_word, eyebrow_txt):
    p = old_pages()[slug]
    title = html.unescape(p["title"]["rendered"])
    wds = W(slug)
    intro = " ".join(wd["text"] for wd in wds if wd["type"] == "text-editor")
    save_page(slug, title, [
        page_hero(eyebrow_txt, title, intro),
        section(amount_cards(wds, label_word), simplepay_note(), width=1152, bg=SAND[50]),
    ])


def page_kuratorium():
    slug = "kuratorium"
    wds = W(slug)
    people, cur = [], None
    for wd in wds:
        if wd["type"] == "image":
            cur = {"img": wd["src"], "lines": [], "text": ""}
            people.append(cur)
        elif cur is not None and wd["type"] == "heading":
            cur["lines"].append(wd["text"])
        elif cur is not None and wd["type"] == "text-editor":
            cur["text"] += clean_html(wd["html"])
    cards = []
    for i, pp in enumerate(people):
        name, role, *quote = pp["lines"] + ["", ""]
        els = [con(img(pp["img"], name, image_border_radius=box(0)), title="Fotó", css_classes="elt-amb-photo")]
        body = [heading(name, "h3", title="Név", title_color=NAVY[800], **T(DISPLAY, 22, 600, 1.3)),
                heading(role, "p", title="Szerep", title_color=SAND[700], **T(BODY, 13, 600, 1.4, 0.08, "uppercase"), _margin=box(0, 0, 12, 0))]
        if quote and quote[0]:
            body.append(heading("„" + quote[0] + "”", "p", title="Idézet", title_color=NAVY[600], **T(DISPLAY, 17, 400, 1.5, style="italic")))
        if pp["text"]:
            body.append(prose(pp["text"]))
        els.append(con(*body, title="Szöveg", padding=box(24), flex_gap=gap(4)))
        cards.append(con(*els, title=f"Kuratóriumi tag: {name}", css_classes="elt-lift elt-amb-card", overflow="hidden",
                         background_background="classic", background_color="#FFFFFF", border_radius=box(16),
                         border_border="solid", border_width=box(1), border_color=NAVY[100], **anim((i % 4) * 80)))
    save_page(slug, "Kuratórium", [
        page_hero("Alapítvány", "Kuratórium", "Az Alapítvány működését felügyelő kuratórium tagjai."),
        section(grid(*cards, cols=4, cols_t=2, cols_m=1, g=24, title="Kuratóriumi tagok"), width=1280, bg=SAND[50]),
    ])


def page_nagykoveteink():
    slug = "nagykoveteink"
    wds = W(slug)
    photos = {"Győrfi Pál": "ambassador-gyorfi-pal.jpg", "Rácz Jenő": "ambassador-racz-jeno.jpg", "Kucsera Gábor": "ambassador-kucsera-gabor.jpg",
              "Proksa Szandra": "ambassador-proksa-szandra.jpg", "Andrásfi Tibor": "ambassador-andrasfi-tibor.jpg",
              "Kovács-Dobos Evelin": "ambassador-kovacs-dobos-evelin.jpg"}
    cards, last_img = [], None
    for wd in wds:
        if wd["type"] == "image":
            last_img = wd
        elif wd["type"] == "text-editor" and last_img:
            name = next((n for n in photos if wd["text"].startswith(n)), None)
            if not name:
                continue
            role = wd["text"][len(name):].strip()
            pic = image(m(photos[name]), "large", title="Portré")
            if last_img.get("href"):
                pic["settings"].update(link_to="custom", link=link(last_img["href"], True))
            cards.append(con(
                con(pic, title="Fotó", css_classes="elt-amb-photo"),
                con(heading(name, "h3", title="Név", title_color="#FFFFFF", align="center", **T(DISPLAY, 18, 600, 1.4), _margin=box(0, 0, 4, 0)),
                    heading(role, "p", title="Szerep", title_color=SAND[500], align="center", **T(BODY, 14, 400, 1.4, 0.025, "uppercase")),
                    title="Szöveg", padding=box(24), padding_mobile=box(16)),
                title=f"Nagykövet: {name}", css_classes="elt-lift elt-amb-card", overflow="hidden",
                background_background="classic", background_color="rgba(51,71,88,0.6)", border_border="solid", border_width=box(1),
                border_color="rgba(255,255,255,0.1)", border_radius=box(16), **anim((len(cards) % 3) * 80)))
            last_img = None
    lead = next(wd["text"] for wd in wds if wd["type"] == "heading" and wd["text"].startswith("Ők azok"))
    save_page(slug, "Nagyköveteink", [
        page_hero("Alapítvány", "Nagyköveteink", lead),
        con(grid(*cards, cols=3, cols_t=2, cols_m=2, g=32, g_m=16, title="Nagykövet kártyák"), root=True, title="Nagykövetek",
            html_tag="section", content_width="boxed", boxed_width=S(1280), background_background="classic", background_color=NAVY[800],
            padding=box(96, 40, 112, 40), padding_mobile=box(64, 24, 72, 24)),
    ])


def page_dokumentumok():
    slug = "dokumentumok"
    wds = W(slug)
    blocks, cur = [], None
    for wd in wds:
        if wd["type"] == "heading" and wd["text"] != "Dokumentumok":
            cur = {"title": wd["text"], "items": []}
            blocks.append(cur)
        elif wd["type"] == "icon-list" and cur:
            cur["items"] += wd["items"]
    cards = []
    for b in blocks:
        btns = [button("Letöltés: " + i["text"].replace(".pdf", ""), new_link(i["href"]), primary=False, light=False,
                       title=i["text"], text_padding=box(10, 20, 10, 20), **T(BODY, 14, 600, 1.3)) for i in b["items"]]
        cards.append(card(h3(b["title"], _margin=box(0, 0, 12, 0)),
                          con(*btns, title="Fájlok", flex_direction="row", flex_wrap="wrap", flex_gap=gap(12)),
                          title=b["title"], border_border="solid", border_width=box(4, 0, 0, 0), border_color=SAND[500]))
    save_page(slug, "Dokumentumok", [
        page_hero("Alapítvány", "Dokumentumok", "Az Alapítvány működésével kapcsolatos nyilvános dokumentumok letölthető formában."),
        section(*cards, width=900, bg=SAND[50]),
    ])


AREA_ICONS = {"Beteg": "elt-icon-sziv.svg", "Állat": "elt-icon-mancs.svg", "Sport": "elt-icon-kupa.svg",
              "Egészség": "elt-icon-egeszseg.svg", "Oktatás": "elt-icon-oktatas.svg"}


def page_tamogatott_teruletek():
    slug = "tamogatott-teruletek"
    wds = W(slug)
    areas, cur = [], None
    for wd in wds:
        if wd["type"] == "heading" and wd["text"].lower() != "egy lépéssel több alapítvány":
            cur = {"title": wd["text"], "html": ""}
            areas.append(cur)
        elif wd["type"] == "text-editor" and cur:
            cur["html"] += clean_html(wd["html"])
    cards = []
    for i, a in enumerate(areas):
        icon = next((v for k, v in AREA_ICONS.items() if a["title"].startswith(k)), "elt-icon-sziv.svg")
        cards.append(card(
            w("icon", title="Ikon", selected_icon={"value": {"id": m(icon)["id"], "url": m(icon)["url"]}, "library": "svg"},
              primary_color=NAVY[700], size=S(40), align="left", _css_classes="" if "mancs" in icon else "elt-icon-line"),
            h3(a["title"], _margin=box(12, 0, 8, 0)), prose(a["html"]),
            title=a["title"], border_border="solid", border_width=box(4, 0, 0, 0), border_color=SAND[500], padding=box(32), **anim((i % 2) * 80)))
    save_page(slug, "Támogatott területek", [
        page_hero("Alapítvány", "Támogatott területek", "Alapítványunk különböző területeken nyújt támogatást: a beteg gyermekek ellátásától kezdve az állatvédelemig, a sport, az egészségügy és az oktatás előmozdításáig."),
        section(grid(*cards, cols=2, cols_t=1, g=24, title="Területek"), width=1152, bg=SAND[50]),
    ])


def page_partnereink():
    slug = "partnereink"
    wds = W(slug)
    groups, cur, intro = [], None, ""
    for wd in wds:
        if wd["type"] == "heading" and wd["text"].isupper():
            cur = {"title": wd["text"].capitalize(), "imgs": []}
            groups.append(cur)
        elif wd["type"] == "heading" and as_paragraph(wd):
            intro = wd["text"]
        elif wd["type"] == "image" and cur:
            cur["imgs"].append(wd)
    secs = []
    for g in groups:
        cells = []
        for wd in g["imgs"]:
            new = migrate_image(wd["src"], wd.get("alt") or "Partner logó")
            if new:
                cells.append(con(image(new, "medium", title="Logó"), title="Partner", css_classes="elt-partner",
                                 background_background="classic", background_color="#FFFFFF", border_radius=box(12),
                                 padding=box(12), flex_justify_content="center", flex_align_items="center",
                                 border_border="solid", border_width=box(1), border_color=NAVY[100]))
        secs += [h2(g["title"]), grid(*cells, cols=5, cols_t=3, cols_m=2, g=16, title=g["title"] + " logók", margin=box(0, 0, 40, 0))]
    save_page(slug, "Partnereink", [page_hero("Alapítvány", "Partnereink", intro), section(*secs, width=1280)])


def page_media():
    slug = "media-megjelenesek"
    wds = W(slug)
    items, cur = [], None
    for wd in wds:
        if wd["type"] == "heading" and not is_decor(wd, "Média megjelenések") and not wd["text"].startswith("Az Egy Lépéssel Több Alapítvány médiamegjelenései"):
            cur = {"title": wd["text"], "html": ""}
            items.append(cur)
        elif wd["type"] == "text-editor" and cur:
            cur["html"] += re.sub(r'href="([^"]+)"', lambda mm: f'href="{html.unescape(mm.group(1))}" target="_blank" rel="noopener"', clean_html(wd["html"]))
    cards = [card(h3(it["title"]), prose(it["html"]), title=it["title"][:60], border_border="solid", border_width=box(0, 0, 0, 4),
                  border_color=SAND[500]) for it in items]
    save_page(slug, "Média megjelenések", [
        page_hero("Galéria", "Média megjelenések", "Az Egy Lépéssel Több Alapítvány médiamegjelenései."),
        section(grid(*cards, cols=2, cols_t=1, g=20, title="Megjelenések"), width=1152, bg=SAND[50]),
    ])


def page_kapcsolat():
    slug = "kapcsolat"
    wds = W(slug)
    info = "".join(clean_html(wd["html"]) for wd in wds if wd["type"] == "text-editor")
    save_page(slug, "Kapcsolat", [
        page_hero("Kapcsolat", "Kapcsolat", "Kérdésed van? Keress minket bizalommal!"),
        section(grid(card(h3("Egy Lépéssel Több – Hajós István – Alapítvány", _margin=box(0, 0, 12, 0)), prose(info), title="Adatok", padding=box(36)),
                     con(w("google_maps", title="Térkép", address="1131 Budapest, Rokolya utca 1-13", zoom=S(15), height=S(420)),
                         title="Térkép", css_classes="elt-map", border_radius=box(16), overflow="hidden"),
                     cols=2, cols_t=1, g=32, title="Kapcsolat"), width=1152, bg=SAND[50]),
    ])


def page_jelentkezz():
    slug = "jelntkezz-tamogatonak"
    wds = W(slug)
    intro = " ".join(wd["text"] for wd in wds if wd["type"] == "text-editor")
    save_page(slug, "Jelentkezz támogatónak", [
        page_hero("Fogadj örökbe egy családot", "Jelentkezz támogatónak!", intro),
        section(form_card(supporter_form(), "Jelentkezés kártya"), width=820, bg=SAND[50], _element_id="jelentkezes"),
    ])


def page_kerulj_be():
    slug = "kerulj-be-programunkba"
    wds = W(slug)
    body = "".join(clean_html(wd["html"]) for wd in wds if wd["type"] == "text-editor")
    fields = [
        {"_id": fid(), "custom_id": "nev", "field_type": "text", "field_label": "Név", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "email", "field_type": "email", "field_label": "E-mail", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "telefon", "field_type": "tel", "field_label": "Telefonszám", "width": "100", "required": "true"},
        {"_id": fid(), "custom_id": "tortenet", "field_type": "textarea", "field_label": "Rövid történet a gyermek betegségéről, fejlesztésekről, célokról",
         "width": "100", "rows": "6", "required": "true"},
        {"_id": fid(), "custom_id": "dokumentacio", "field_type": "upload", "field_label": "A gyermek betegségét igazoló orvosi dokumentáció feltöltése",
         "width": "100", "file_types": "pdf,jpg,jpeg,png", "allow_multiple_upload": "yes", "max_files": "5", "file_sizes": "10"},
        {"_id": fid(), "custom_id": "adatkezeles", "field_type": "acceptance", "field_label": "Adatkezelés", "width": "100", "required": "true",
         "acceptance_text": f'Elolvastam és megértettem az <a href="{PRIVACY_URL}" target="_blank">adatkezelési tájékoztatót</a>.'},
    ]
    form = simple_form("Jelentkezés a programba", fields, "Jelentkezés elküldése",
                       "Köszönjük a jelentkezést! A kuratórium döntéséről e-mailben értesítünk.",
                       'Jelentkezés a programba – [field id="nev"]')
    save_page(slug, "Kerülj be programunkba", [
        page_hero("Fogadj örökbe egy családot", "Ki kerülhet be a Fogadj örökbe egy családot programunkba?",
                  "A program feltételei és a jelentkezés menete."),
        section(prose(body)),
        section(h2("Jelentkezés"), form_card(form), width=820, bg=SAND[50], _element_id="jelentkezes"),
    ])


def page_varadi():
    slug = "varadi-eszter-dijra-jeloles"
    cats = ["Az Év Önkéntese", "Az Év Magánszemély Támogatója", "Az Év Céges Támogatója", "Az Év Előadója", "Az Év Előadóművésze",
            "Az Év Nagykövete", "Az Év Médiatámogatója", "Az Év Gyermekorvosa", "Az Év Egészségügyi Dolgozója",
            "Az Év Utánpótlás Női Sportolója", "Az Év Utánpótlás Férfi Sportolója", "Életműdíj", "Különdíj",
            "Az Év Női Paralimpikonja", "Az Év Férfi Paralimpikonja"]
    amb = ["Győrfi Pál", "Kucsera Gábor", "Andrásfi Tibor", "Kovács-Dobos Evelin"]
    fields = [
        {"_id": fid(), "custom_id": "jelolo_cim", "field_type": "html", "field_label": "", "width": "100", "field_html": "<h3>Jelölő adatai</h3>"},
        {"_id": fid(), "custom_id": "nev", "field_type": "text", "field_label": "Név", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "email", "field_type": "email", "field_label": "E-mail", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "telefon", "field_type": "tel", "field_label": "Telefonszám", "width": "100"},
        {"_id": fid(), "custom_id": "jelolesek_cim", "field_type": "html", "field_label": "", "width": "100", "field_html": "<h3>Jelölések</h3>"},
        {"_id": fid(), "custom_id": "jelolt_nev", "field_type": "text", "field_label": "Jelölt neve", "width": "100", "required": "true"},
        {"_id": fid(), "custom_id": "dij_kategoria", "field_type": "select", "field_label": "Díj kategória", "width": "50", "required": "true",
         "field_options": opt_lines([("Válasszon", "")] + [(c, c) for c in cats])},
        {"_id": fid(), "custom_id": "nagykovet", "field_type": "select", "field_label": "Nagykövet", "width": "50",
         "field_options": opt_lines([("Válasszon", "")] + [(a, a) for a in amb])},
        {"_id": fid(), "custom_id": "indoklas", "field_type": "textarea", "field_label": "Indoklás (legalább 200 karakter)", "width": "100",
         "rows": "6", "required": "true"},
        acceptance_privacy(),
    ]
    form = simple_form("Váradi Eszter-díj jelölés", fields, "Jelölés elküldése", "Köszönjük a jelölést!",
                       'Váradi Eszter-díj jelölés – [field id="jelolt_nev"] ([field id="dij_kategoria"])')
    save_page(slug, "Váradi Eszter-díjra jelölés", [
        page_hero("Váradi Eszter díj", "Váradi Eszter-díjra jelölés", "Jelöld azt, aki szerinted a legtöbbet tette egy lépéssel többért."),
        section(form_card(form), width=820, bg=SAND[50]),
    ])


def page_1ado():
    slug = "1-ado"
    wds = W(slug)
    steps_imgs = [wd["src"] for wd in wds if wd["type"] == "image"]
    paper = next((wd for wd in wds if wd["type"] == "icon-list"), None)
    pdf = next((wd for wd in wds if wd["type"] == "button" and (wd.get("href") or "").lower().endswith(".pdf")), None)
    info_html = "".join(clean_html(wd["html"]) for wd in wds if wd["type"] == "text-editor")
    points = [("01", "Fogadj örökbe egy családot", "A program hosszú távon, stabilan működhessen."),
              ("02", "Családok összekapcsolása", "Családok összekapcsolása támogatókkal."),
              ("03", "Célzott támogatás", "Hogy ellenőrzötten jussanak el a valóban rászorulókhoz.")]
    pcards = [card(heading(n, "p", title="Szám", title_color=SAND[700], **T(DISPLAY, 36, 600, 1)), h3(t), prose(f"<p>{d}</p>"),
                   title=t, border_border="solid", border_width=box(4, 0, 0, 0), border_color=SAND[500], **anim(i * 80))
              for i, (n, t, d) in enumerate(points)]
    contact = simple_form("1% kapcsolat", [
        {"_id": fid(), "custom_id": "nev", "field_type": "text", "field_label": "Név", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "email", "field_type": "email", "field_label": "E-mail", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "uzenet", "field_type": "textarea", "field_label": "Üzenet", "width": "100", "rows": "5", "required": "true"},
        acceptance_privacy()], "Üzenet küldése", "Köszönjük az üzenetet, hamarosan válaszolunk!", 'Kérdés az 1%-ról – [field id="nev"]')
    els = [
        page_hero("Adó 1%", "Ajánld fel adód 1%-át", "Adószám: 19353825-1-41 – Most te is tehetsz egy lépéssel többet."),
        section(prose("<p>Az adód 1%-ának felajánlása neked semmibe nem kerül, mégis valódi változást hozhat olyan családok életébe, "
                      "akik nap mint nap súlyos beteg gyermekükért küzdenek.</p><p>Az Egy Lépéssel Több Hajós István Alapítvány azért dolgozik, "
                      "hogy a legnehezebb helyzetben lévő családok ne maradjanak egyedül.</p>"),
                h2("Mire fordítjuk az adó 1%-át?", _margin=box(24, 0, 0, 0)),
                prose("<p>Az SZJA 1% felajánlásokból beérkező összegeket az alapítvány működésére fordítjuk.</p>"),
                grid(*pcards, cols=3, cols_t=1, g=24, title="Mire fordítjuk"), width=1152),
        section(h2("Hogyan tudod felajánlani adód 1%-át?"), gallery(steps_imgs, cols=5, title="Lépések képekben"), width=1280, bg=SAND[50]),
    ]
    paper_els = [h2("Papír alapú felajánlás")]
    if paper:
        paper_els.append(prose("<ul>" + "".join(f"<li>{html.escape(i['text'])}</li>" for i in paper["items"]) + "</ul>"))
    paper_els.append(heading("Adó 1 százalék felajánlás határidő: 2026.05.20.", "p", title="Határidő", title_color=NAVY[800], **T(BODY, 17, 700, 1.5)))
    if pdf:
        paper_els.append(button("Adó 1% nyomtatvány letöltése", new_link(pdf["href"])))
    els.append(section(*paper_els))
    els.append(section(grid(card(h3("Alapítványi információk", _margin=box(0, 0, 8, 0)), prose(info_html), title="Információk"),
                            con(h3("Amennyiben kérdésed merülne fel, keress minket bizalommal!", _margin=box(0, 0, 16, 0)), form_card(contact), title="Kapcsolat"),
                            cols=2, cols_t=1, g=32, title="Információk és kapcsolat"), width=1152, bg=SAND[50]))
    save_page(slug, "1% adó", els)


def page_fogadj_orokbe():
    slug = "fogadj-orokbe-egy-csaladot"
    wds = [wd for wd in W(slug) if wd["type"] == "heading"]
    qa, i = [], 0
    texts = [wd["text"] for wd in wds if not is_decor(wd, "Fogadj örökbe egy családot")]
    lead = texts[0] if texts else ""
    rest_ = [t for t in texts[1:] if not re.search(r"és családja$|^[A-ZÁ-Ű]\. [A-ZÁ-Ű]", t)]
    while i < len(rest_) - 1:
        qa.append((rest_[i], rest_[i + 1]))
        i += 2
    cards = [card(h3(q, _margin=box(0, 0, 8, 0)), prose(f"<p>{html.escape(a)}</p>"), title=q[:60], border_border="solid",
                  border_width=box(4, 0, 0, 0), border_color=SAND[500], **anim((k % 2) * 80)) for k, (q, a) in enumerate(qa)]
    save_page(slug, "Fogadj örökbe egy családot", [
        page_hero("Fogadj örökbe egy családot", "Fogadj örökbe egy családot", lead),
        section(grid(*cards, cols=2, cols_t=1, g=24, title="Kérdések és válaszok"),
                con(button("Jelentkezz támogatónak", HOME + "jelntkezz-tamogatonak/"),
                    button("Kerülj be programunkba", HOME + "kerulj-be-programunkba/", primary=False, light=False),
                    title="Gombok", flex_direction="row", flex_wrap="wrap", flex_gap=gap(16), margin=box(16, 0, 0, 0)),
                width=1152, bg=SAND[50]),
        section(eyebrow("Örökbefogadható családok", SAND[700]), h2("Ők most várják a támogatóikat"),
                loop_grid("elt_orokbefogadhato", 6), button("Összes örökbefogadható család", HOME + "orokbefogadhato-csaladok/", primary=False, light=False),
                width=1280),
    ])


def page_kuldetesunk():
    slug = "kuldetesunk"
    wds = [wd for wd in W(slug) if wd["type"] == "heading"]
    texts = [wd["text"] for wd in wds if not is_decor(wd, "Küldetésünk") and wd["text"] not in ("Alapítónk Hajós István",)
             and not re.search(r"(és családja|Viktória)$", wd["text"])]
    main = texts[0] if texts else ""
    areas = texts[1] if len(texts) > 1 else ""
    items = [x.strip() for x in areas.split("●")[1:]]
    head = areas.split("●")[0].strip()
    save_page(slug, "Küldetésünk", [
        page_hero("Alapítvány", "Küldetésünk", main),
        section(h2(head or "További támogatott területeink:"), prose("<ul>" + "".join(f"<li>{html.escape(x)}</li>" for x in items) + "</ul>"),
                button("Támogatott területek", HOME + "tamogatott-teruletek/", primary=False, light=False)),
        section(eyebrow("Örökbefogadható családok", SAND[700]), h2("Akiknek most segíthetsz"), loop_grid("elt_orokbefogadhato", 6),
                width=1280, bg=SAND[50]),
    ])


def page_alapitonk():
    slug = "alapitonk"
    wds = W(slug)
    photo = next(wd for wd in wds if wd["type"] == "image")
    paras = [wd["text"] for wd in wds if wd["type"] == "heading" and as_paragraph(wd)]
    more = next((wd for wd in wds if wd.get("href")), None)
    copy = con(eyebrow("Alapítónk", SAND[400]),
               heading("Hajós István", "h2", title="Név", title_color="#FFFFFF", **T(DISPLAY, 48, 500, 1.2, size_m=34), _margin=box(0, 0, 8, 0)),
               heading("az Egy Lépéssel Több Alapítvány alapítója", "p", title="Alcím", title_color=SAND[400], **T(BODY, 18, 500, 1.5), _margin=box(0, 0, 24, 0)),
               text("".join(f"<p>{html.escape(p)}</p>" for p in paras), title="Bemutatkozás", text_color="rgba(255,255,255,0.8)",
                    paragraph_spacing=S(20), **T(BODY, 18, 400, 1.7, size_m=16)),
               button(more["text"], more["href"], primary=False, _margin=box(16, 0, 0, 0)) if more else heading("", "p"),
               title="Szöveg", width=S(58, "%"), width_tablet=S(100, "%"), **anim(120))
    pic = con(img(photo["src"], "Hajós István", height=S(560), height_mobile=S(420), **{"object-fit": "cover"}),
              title="Fotó (díszkerettel)", css_classes="elt-founder-photo", width=S(42, "%"), width_tablet=S(100, "%"), **anim())
    save_page(slug, "Alapítónk", [
        page_hero("Alapítvány", "Alapítónk", "Hajós István, az Egy Lépéssel Több Alapítvány alapítója."),
        con(pic, copy, root=True, title="Alapító", html_tag="section", content_width="boxed", boxed_width=S(1152), flex_direction="row",
            flex_direction_tablet="column", flex_align_items="center", flex_gap=gap(56), background_background="classic",
            background_color=NAVY[700], padding=box(96, 40, 112, 40), padding_mobile=box(64, 24, 72, 24)),
    ])


def page_family_lists():
    """Update the two family list pages with the original intro text and the real support form."""
    intro = ("Alapítványunk szervez vagy becsatlakozik egyéni és eseti gyűjtésekbe is, de fő célunk, hogy rászoruló családoknak "
             "havi rendszereséggel segíthessünk a „fogadj örökbe egy családot” programunkkal.")
    save_page("orokbefogadhato-csaladok", "Örökbefogadható családok", [
        page_hero("Fogadj örökbe egy családot", "Örökbefogadható családok", intro),
        dyn_.list_section(loop_grid("elt_orokbefogadhato", 12, pagination=True, nothing="Jelenleg minden család megtalálta a támogatóit. Köszönjük!")),
        section(eyebrow("Jelentkezés", SAND[700]), h2("Jelentkezz támogatónak!"),
                prose("<p>A beküldött jelentkezésekre e-mailben visszaigazolunk. Telefonon a támogatókkal szerződéskötés előtt fogjuk felvenni "
                      "a kapcsolatot, amint a támogatni kívánt családnak összegyűlt a havi 50 000 Ft támogatása.</p>"),
                form_card(supporter_form()), width=820, bg=SAND[50], _element_id="jelentkezes"),
    ], key="adoptable_id")
    save_page("orokbefogadott-csaladok", "Örökbefogadott családok", [
        page_hero("Fogadj örökbe egy családot", "Örökbefogadott családok", intro),
        dyn_.list_section(loop_grid("elt_orokbefogadott", 24, pagination=True, nothing="Hamarosan itt láthatod azokat a családokat, akik már megtalálták a támogatóikat.")),
    ], key="adopted_id")


SPECIAL = {
    "linkesfizetes": page_linkesfizetes,
    "gyomroi-estek-2": lambda: page_payment_event("gyomroi-estek-2", "Adomány összege", "Rendezvény"),
    "jotekonysagi-galaest": lambda: page_payment_event("jotekonysagi-galaest", "Támogatói jegy", "Rendezvény"),
    "kuratorium": page_kuratorium,
    "nagykoveteink": page_nagykoveteink,
    "dokumentumok": page_dokumentumok,
    "tamogatott-teruletek": page_tamogatott_teruletek,
    "partnereink": page_partnereink,
    "media-megjelenesek": page_media,
    "kapcsolat": page_kapcsolat,
    "jelntkezz-tamogatonak": page_jelentkezz,
    "kerulj-be-programunkba": page_kerulj_be,
    "varadi-eszter-dijra-jeloles": page_varadi,
    "1-ado": page_1ado,
    "fogadj-orokbe-egy-csaladot": page_fogadj_orokbe,
    "kuldetesunk": page_kuldetesunk,
    "alapitonk": page_alapitonk,
    "csaladlistak": page_family_lists,
}
GENERIC = ["adatkezelesi-tajekoztato", "generali-szurobusz-palyazat", "feltoltes-alatt"]


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["all"]:
        args = list(SPECIAL) + GENERIC
    for a in args:
        try:
            if a in SPECIAL:
                SPECIAL[a]()
            else:
                generic(a)
        except Exception as e:  # keep going, report at the end
            print("FAILED", a, repr(e)[:500])
