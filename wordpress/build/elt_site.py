"""Builds the Egy Lépéssel Több site in WordPress/Elementor.

Usage:  WP_AUTH='user:app password' python3 elt_site.py <step> [<step> ...]
Steps:  backup kit menu header footer home pages front
State (created post/menu IDs) is kept in state.json so steps can be re-run safely.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from el import S, box, gap, G, T, tag, con, grid, w, heading, text, image, link, walk  # noqa: E402
from wp import rest, mcp, save_elementor, WP_URL  # noqa: E402

HERE = os.path.dirname(__file__)
M = json.load(open(os.path.join(HERE, "media.json")))
STATE_FILE = os.path.join(HERE, "state.json")
STATE = json.load(open(STATE_FILE)) if os.path.exists(STATE_FILE) else {}
HOME = WP_URL + "/"


def save_state():
    json.dump(STATE, open(STATE_FILE, "w"), indent=1, ensure_ascii=False)


def m(name):
    return M[name]


# --------------------------------------------------------------------------- palette / type
NAVY = {50: "#eef2f4", 100: "#dde4e8", 200: "#b9c5cd", 300: "#94a7b3", 400: "#708998", 500: "#4c6b7d",
        600: "#3d5568", 700: "#334758", 800: "#263640", 900: "#1a252d"}
SAND = {50: "#fdfbf7", 100: "#f8f1e4", 200: "#f0e4cb", 300: "#e8d7b2", 400: "#e2d3ab", 500: "#dac7a0",
        600: "#c3ac7e", 700: "#a68c5c", 800: "#7d6944", 900: "#544632"}
DISPLAY, BODY = "Baloo 2", "Nunito"
EASE_PAD_X = (40, 24)  # lg / mobile side padding

SECTION_PAD = dict(padding=box(144, 40, 144, 40), padding_tablet=box(112, 32, 112, 32), padding_mobile=box(96, 24, 96, 24))


def eyebrow(txt, color, **s):
    return heading(txt, "p", title="Felirat", title_color=color,
                   **T(BODY, 14, 600, 1.4, 0.3, "uppercase", size_m=12), _margin=box(0, 0, 16, 0), **s)


def h2(txt, color, **s):
    return heading(txt, "h2", title="Cím", title_color=color, **T(DISPLAY, 48, 500, 1.25, size_t=40, size_m=30), **s)


def anim(delay=0):
    d = {"animation": "fadeInUp"}
    if delay:
        d["animation_delay"] = delay
    return d


def wanim(delay=0):
    d = {"_animation": "fadeInUp"}
    if delay:
        d["_animation_delay"] = delay
    return d


def button(label, url, primary=True, title=None, light=True, **s):
    st = {
        "text": label, "link": link(url), "size": "md",
        "text_padding": box(16, 32, 16, 32), "border_radius": box(999),
        **T(BODY, 16, 600, 1.2),
    }
    if primary:
        st.update({
            "background_background": "classic", "background_color": SAND[500],
            "button_text_color": NAVY[900], "hover_color": NAVY[900],
            "button_background_hover_background": "classic", "button_background_hover_color": SAND[600],
            "_css_classes": "elt-btn-primary",
        })
    else:
        col = "#FFFFFF" if light else NAVY[800]
        st.update({
            "background_background": "classic", "background_color": "rgba(0,0,0,0)",
            "button_text_color": col, "hover_color": SAND[400] if light else SAND[700],
            "button_background_hover_background": "classic", "button_background_hover_color": "rgba(0,0,0,0)",
            "border_border": "solid", "border_width": box(1), "border_color": "rgba(255,255,255,0.4)" if light else NAVY[200],
            "button_hover_border_color": SAND[400] if light else SAND[700],
        })
    st.update(s)
    return w("button", title=title or label, **st)


# =========================================================================== backup
def step_backup():
    """Keep a copy of what we change (INKA kit settings, front page, header/footer conditions)."""
    os.makedirs(os.path.join(HERE, "..", "backup"), exist_ok=True)
    kit = rest("GET", "wp/v2/elementor_library/82?context=edit&_fields=id,meta")
    settings = rest("GET", "wp/v2/settings")
    parts = mcp("elementor-list-site-parts", {})
    json.dump({"kit_82_page_settings": kit["meta"]["_elementor_page_settings"],
               "front_page": {k: settings[k] for k in ("show_on_front", "page_on_front", "title", "description")},
               "site_parts": parts},
              open(os.path.join(HERE, "..", "backup", "inka-vision-before-elt.json"), "w"), indent=1, ensure_ascii=False)
    print("backup written")


# =========================================================================== kit
def step_kit():
    kit_id = 82
    css = open(os.path.join(HERE, "kit.css")).read()
    colors = [
        {"_id": "primary", "title": "Sötétkék (navy-800)", "color": NAVY[800]},
        {"_id": "secondary", "title": "Homok (sand-500)", "color": SAND[500]},
        {"_id": "text", "title": "Szöveg (navy-600)", "color": NAVY[600]},
        {"_id": "accent", "title": "Kiemelés (sand-700)", "color": SAND[700]},
    ]
    custom = [{"_id": f"navy{k}", "title": f"Navy {k}", "color": v} for k, v in NAVY.items() if k not in (800, 600)]
    custom += [{"_id": f"sand{k}", "title": f"Homok {k}", "color": v} for k, v in SAND.items() if k not in (500, 700)]
    custom += [{"_id": "white", "title": "Fehér", "color": "#FFFFFF"}]

    def typo(_id, title, **kw):
        d = {"_id": _id, "title": title}
        d.update(T(**kw))
        return d

    settings = {
        "system_colors": colors,
        "custom_colors": custom,
        "system_typography": [
            typo("primary", "Címsor (Baloo 2)", family=DISPLAY, size=48, weight=500, lh=1.2, size_t=40, size_m=30),
            typo("secondary", "Felirat (kis nagybetűs)", family=BODY, size=14, weight=600, lh=1.4, ls=0.3, tt="uppercase", size_m=12),
            typo("text", "Szöveg (Nunito)", family=BODY, size=16, weight=400, lh=1.65),
            typo("accent", "Gomb", family=BODY, size=16, weight=600, lh=1.2),
        ],
        "custom_typography": [],
        "default_generic_fonts": "Sans-serif",
        "body_background_background": "classic",
        "body_background_color": "#FFFFFF",
        "body_color": NAVY[700],
        "link_normal_color": SAND[700],
        "link_hover_color": NAVY[800],
        **T(BODY, 16, 400, 1.6, prefix="body_typography"),
        "container_width": S(1280),
        "container_padding": box(0),
        "space_between_widgets": gap(0),
        "page_title_selector": "h1.entry-title",
        "active_breakpoints": ["viewport_mobile", "viewport_tablet", "viewport_tablet_extra"],
        "viewport_md": 768, "viewport_lg": 1025, "viewport_tablet_extra": 1440,
        "global_image_lightbox": "yes",
        "lightbox_enable_counter": "yes",
        "lightbox_enable_fullscreen": "yes",
        "lightbox_enable_zoom": "",
        "lightbox_enable_share": "",
        "lightbox_title_src": "title",
        "lightbox_description_src": "",
        "lightbox_color": "rgba(26,37,45,0.95)",
        "lightbox_ui_color": "rgba(255,255,255,0.8)",
        "lightbox_ui_color_hover": SAND[500],
        "lightbox_text_color": "#FFFFFF",
        "site_name": "Egy Lépéssel Több Alapítvány",
        "site_description": "Fogadj örökbe egy családot, és válj havonta a történetük részévé.",
        "site_logo": {"id": m("logo-full.png")["id"], "url": m("logo-full.png")["url"]},
        "site_favicon": {"id": m("favicon.png")["id"], "url": m("favicon.png")["url"]},
        "custom_css": css,
    }
    for h in range(1, 7):
        settings.update(T(DISPLAY, None, 500, 1.2, prefix=f"h{h}_typography"))
        settings[f"h{h}_color"] = NAVY[800]
    mcp("elementor-update-page-settings", {"post_id": kit_id, "settings": settings})
    print("kit saved")


# =========================================================================== menu
MENU = [
    ("Főoldal", HOME, []),
    ("Alapítvány", "#", [("Alapítónk", HOME + "alapitonk/"), ("Nagyköveteink", HOME + "nagykoveteink/"),
                         ("Kuratórium", HOME + "kuratorium/"), ("Dokumentumok", HOME + "dokumentumok/")]),
    ("Fogadj örökbe egy családot", "#", [
        ("Család örökbefogadás", HOME + "fogadj-orokbe-egy-csaladot/"),
        ("Örökbefogadható családok", HOME + "orokbefogadhato-csaladok/"),
        ("Örökbefogadott családok", HOME + "orokbefogadott-csaladok/"),
        ("Az Alapítvány működésének támogatása", HOME + "linkesfizetes/"),
        ("Jótékonysági gálaest", HOME + "jotekonysagi-galaest/"),
        ("Gyömrői Esték #2 – Nápolyi pizza egy jó ügyért", HOME + "gyomroi-estek-2/")]),
    ("Galéria", "#", [("Közös élményeink", HOME + "kozos-elmenyeink/"), ("Családi napok", HOME + "csaladi-napok/"),
                      ("Aláírási ceremónia", HOME + "alairasi-ceremonia/"), ("Gálaest", HOME + "galaest/"),
                      ("Média megjelenések", HOME + "media-megjelenesek/"), ("Prospektus", "PROSPEKTUS")]),
    ("Váradi Eszter díj", "https://hu.wikipedia.org/wiki/V%C3%A1radi_Eszter-d%C3%ADj",
     [("Váradi Eszter-díjra jelölés", HOME + "varadi-eszter-dijra-jeloles/")]),
]
CTA_ADO = HOME + "1-ado/"
CTA_MAIN = HOME + "orokbefogadhato-csaladok/"


def step_menu():
    """(Re)build the main menu with the real site structure."""
    mid = STATE.get("menu_id") or rest("POST", "wp/v2/menus", {"name": "Egy Lépéssel Több – főmenü"})["id"]
    STATE["menu_id"] = mid
    save_state()
    for item in rest("GET", f"wp/v2/menu-items?menus={mid}&per_page=100&_fields=id"):
        rest("DELETE", f"wp/v2/menu-items/{item['id']}?force=true")
    prospektus = "#"
    try:
        from pages import migrate_file
        prospektus = migrate_file("https://egylepesseltobb.hu/wp-content/uploads/2025/10/Prospektus.pdf")
    except Exception as e:  # noqa: BLE001
        print("prospektus", e)
    order = 1
    for label, url, children in MENU:
        parent = rest("POST", "wp/v2/menu-items", {"title": label, "url": url, "menus": mid, "type": "custom",
                                                    "status": "publish", "menu_order": order})
        order += 1
        for clabel, curl in children:
            rest("POST", "wp/v2/menu-items", {"title": clabel, "url": prospektus if curl == "PROSPEKTUS" else curl, "menus": mid,
                                              "type": "custom", "status": "publish", "menu_order": order, "parent": parent["id"],
                                              "target": "_blank" if curl == "PROSPEKTUS" else ""})
            order += 1
    rest("POST", "wp/v2/menu-items", {"title": "Adó 1%", "url": CTA_ADO, "menus": mid, "type": "custom",
                                      "status": "publish", "menu_order": order, "classes": ["elt-menu-cta"]})
    rest("POST", "wp/v2/menu-items", {"title": "Fogadj örökbe egy családot", "url": CTA_MAIN, "menus": mid,
                                      "type": "custom", "status": "publish", "menu_order": order + 1,
                                      "classes": ["elt-menu-cta", "elt-menu-cta--primary"]})
    print("menu", mid, order + 1, "items")


# =========================================================================== header
def header_elements():
    logo = image(m("logo-full.png"), "full", title="Logó", link_to="custom", link=link(HOME), width=S(129), width_mobile=S(110),
                 _flex_size="none")
    nav = w("nav-menu", title="Főmenü", menu=STATE["menu_id"], layout="horizontal", align_items="center",
            pointer="underline", animation_line="grow", submenu_icon={"value": "fas fa-chevron-down", "library": "fa-solid"},
            dropdown="tablet_extra", full_width="stretch", _flex_size="grow", _flex_size_tablet_extra="none", _flex_align_self="center",
            _element_width_tablet_extra="initial", _element_custom_width_tablet_extra=S(48), text_align="aside", toggle="burger", toggle_align="right",
            _css_classes="elt-nav",
            **T(BODY, 14, 500, 1.4, 0.025, prefix="menu_typography"),
            color_menu_item="rgba(255,255,255,0.9)", color_menu_item_hover=SAND[400], pointer_color_menu_item_hover=SAND[500],
            color_menu_item_active="rgba(255,255,255,0.9)", pointer_color_menu_item_active="rgba(0,0,0,0)",
            pointer_width=S(2), padding_horizontal_menu_item=S(0), padding_vertical_menu_item=S(8), menu_space_between=S(36),
            color_dropdown_item="rgba(255,255,255,0.8)", background_color_dropdown_item=NAVY[800],
            color_dropdown_item_hover=SAND[400], background_color_dropdown_item_hover="rgba(51,71,88,0.6)",
            color_dropdown_item_active=SAND[400], background_color_dropdown_item_active="rgba(51,71,88,0.6)",
            **T(BODY, 14, 400, 1.4, prefix="dropdown_typography"),
            padding_horizontal_dropdown_item=S(20), padding_vertical_dropdown_item=S(10),
            dropdown_top_distance=S(12), dropdown_top_distance_tablet_extra=S(19),
            toggle_color="#FFFFFF", toggle_color_hover=SAND[400], toggle_background_color="rgba(0,0,0,0)", toggle_size=S(28))
    buttons = con(
        button("Adó 1%", CTA_ADO, primary=False, title="Adó 1% gomb", text_padding=box(12, 20, 12, 20), **T(BODY, 14, 600, 1.2)),
        button("Fogadj örökbe egy családot", CTA_MAIN, title="Fő gomb", text_padding=box(12, 20, 12, 20), **T(BODY, 14, 600, 1.2)),
        title="Gombok", flex_direction="row", flex_gap=gap(12), flex_align_items="center", _flex_size="none",
        hide_tablet_extra="hidden-tablet_extra", hide_tablet="hidden-tablet", hide_mobile="hidden-mobile")
    script = w("html", title="Görgetés-effekt (fejléc kicsinyítés)", html=(
        "<script>(function(){var b=document.body;function u(){b.classList.toggle('elt-scrolled',window.scrollY>40)}"
        "u();window.addEventListener('scroll',u,{passive:true})})();</script>"))
    inner = con(logo, nav, buttons, title="Fejléc sor", flex_direction="row", flex_justify_content="space-between",
                flex_align_items="center", flex_gap=gap(40), flex_wrap="nowrap", min_height=S(80),
                padding=box(0, 40, 0, 40), padding_mobile=box(0, 24, 0, 24), css_classes="elt-header-inner",
                content_width="boxed", boxed_width=S(1536))
    root = con(inner, script, root=True, title="Fejléc", html_tag="header", css_classes="elt-header",
               background_background="classic", background_color="rgba(26,37,45,0.95)",
               box_shadow_box_shadow_type="yes",
               box_shadow_box_shadow={"horizontal": 0, "vertical": 10, "blur": 15, "spread": -3, "color": "rgba(0,0,0,0.25)"},
               position="fixed", _offset_orientation_h="start", _offset_x=S(0), _offset_orientation_v="start", _offset_y=S(0),
               width=S(100, "%"), z_index=50)
    # Clean placeholders that are not real settings.
    for e in walk([root]):
        e["settings"] = {k: v for k, v in e["settings"].items() if v != {}}
    return [root]


def ensure_site_part(key, type_, title, conditions):
    if STATE.get(key):
        return STATE[key]
    op = {"action": "create", "type": type_, "title": title}
    if conditions is not None:
        op["conditions"] = conditions
    res = mcp("elementor-manage-site-parts", {"operations": [op]})
    pid = res["results"][0]["id"]
    STATE[key] = pid
    save_state()
    return pid


def publish(pid, route, elements, settings=None):
    save_elementor(route, pid, elements, settings)
    mcp("elementor-publish-document", {"post_id": pid})


def step_header():
    pid = ensure_site_part("header_id", "header", "ELT – Fejléc", ["include/general"])
    publish(pid, "elementor_library", header_elements(), {"hide_title": "yes"})
    print("header", pid)


# =========================================================================== footer
def footer_heading(txt):
    return heading(txt, "h5", title=txt, title_color=SAND[400], **T(DISPLAY, 14, 600, 1.4, 0.025, "uppercase"),
                   _margin=box(0, 0, 20, 0))


def link_list(items, title):
    lst = [{"_id": f"i{i}", "text": t, "selected_icon": {"value": "", "library": ""}, "link": link(u) if u else {"url": ""}}
           for i, (t, u) in enumerate(items)]
    return w("icon-list", title=title, view="traditional", icon_list=lst, space_between=S(12),
             text_color="rgba(255,255,255,0.65)", text_color_hover="#FFFFFF", text_indent=S(0),
             **T(BODY, 14, 400, 1.5, prefix="icon_typography"))


def event_card(title, date, imgs, delay):
    gallery = w("image-gallery", title=f"{title} – képek (az első a borító)",
                wp_gallery=[{"id": m(x)["id"], "url": m(x)["url"]} for x in imgs], thumbnail_size="medium_large",
                gallery_columns="1", gallery_link="file", open_lightbox="yes", gallery_display_caption="none",
                image_spacing="custom", image_spacing_custom=S(0))
    return con(gallery,
               heading(title, "h4", title="Rendezvény neve", title_color="#FFFFFF", **T(DISPLAY, 16, 600, 1.4), _margin=box(16, 0, 4, 0)),
               heading(date, "p", title="Dátum, helyszín", title_color="rgba(255,255,255,0.6)", **T(BODY, 14, 400, 1.5)),
               title=f"Rendezvény: {title}", css_classes="elt-event", **anim(delay))


def info_item(label, value, sub=None):
    html = f"<small>{label}</small><p>{value}</p>" + (f'<span class="elt-info-sub">{sub}</span>' if sub else "")
    return text(html, title=label, text_color="rgba(255,255,255,0.7)", **T(BODY, 14, 400, 1.5), _css_classes="elt-info")


def footer_elements():
    partners = [
        ("partner-01-bastion.png", "Bastion"), ("partner-02.png", "Partner"), ("partner-03-daewoo.png", "Daewoo"),
        ("partner-04-lipoti.png", "Lipóti Pékség"), ("partner-05-hsbc.png", "HSBC"), ("partner-06-pizzame.png", "Pizza ME"),
        ("partner-07-hardrock.png", "Hard Rock Cafe"), ("partner-08-bullrent.png", "BullRent"),
        ("partner-09-poseidon.png", "POSeidon"), ("partner-10-justicesecurity.png", "Justice Security")]
    partner_cells = [con(image(m(f), "medium", title=f"{n} logó"), title=f"Partner: {n}", css_classes="elt-partner",
                         background_background="classic", background_color="#FFFFFF", border_radius=box(12),
                         min_height=S(112), padding=box(12), flex_justify_content="center", flex_align_items="center")
                     for f, n in partners]
    partners_sec = con(
        heading("Kiemelt partnereink", "p", title="Felirat", align="center", title_color="rgba(255,255,255,0.4)",
                **T(BODY, 12, 400, 1.4, 0.3, "uppercase"), _margin=box(0, 0, 36, 0)),
        grid(*partner_cells, cols=5, cols_t=3, cols_m=2, g=16, title="Partner logók"),
        title="Partnerek", content_width="boxed", boxed_width=S(1280),
        padding=box(56, 40, 56, 40), padding_mobile=box(56, 24, 56, 24),
        border_border="solid", border_width=box(0, 0, 1, 0), border_color="rgba(255,255,255,0.1)")

    events = grid(
        event_card("Jótékonysági Gála", "2026. szeptember 20. · Budapest, Bálna", ["about.webp", "event-gala-checkin.jpg", "editorial-small1.webp"], 0),
        event_card("Családi Piknik Nap", "2026. október 4. · Margitsziget", ["event-picnic-flute.png", "editorial-big.webp", "hero.webp"], 80),
        event_card("Karácsonyi Adományosztás", "2026. december 14. · Debrecen", ["editorial-small2.webp"], 160),
        event_card("Sportnap a Gyerekekért", "2027. február 1. · Szeged, Sportcsarnok", ["why-important.webp", "story-anna.webp"], 240),
        cols=4, cols_t=2, cols_m=1, g=24, title="Rendezvény kártyák")
    events_sec = con(
        heading("Rendezvényeink", "p", title="Felirat", title_color=SAND[400], **T(BODY, 12, 400, 1.4, 0.3, "uppercase"), _margin=box(0, 0, 12, 0)),
        heading("Találkozzunk élőben is", "h3", title="Cím", title_color="#FFFFFF", **T(DISPLAY, 30, 500, 1.25, size_m=24), _margin=box(0, 0, 40, 0)),
        events,
        title="Rendezvények", _element_id="events", content_width="boxed", boxed_width=S(1280),
        padding=box(64, 40, 64, 40), padding_mobile=box(64, 24, 64, 24),
        border_border="solid", border_width=box(0, 0, 1, 0), border_color="rgba(255,255,255,0.1)")

    social = w("social-icons", title="Közösségi ikonok", shape="circle", icon_color="custom",
               icon_primary_color="rgba(0,0,0,0)", icon_secondary_color="#FFFFFF", icon_size=S(16), icon_padding=S(10, "px"),
               icon_spacing=S(12), image_border_border="solid", image_border_width=box(1), image_border_color="rgba(255,255,255,0.2)",
               hover_primary_color=SAND[500], hover_secondary_color=NAVY[900], hover_border_color=SAND[500], align="left",
               social_icon_list=[
                   {"_id": "fb", "social_icon": {"value": "fab fa-facebook", "library": "fa-brands"}, "link": link("#", True)},
                   {"_id": "ig", "social_icon": {"value": "fab fa-instagram", "library": "fa-brands"}, "link": link("#", True)},
                   {"_id": "yt", "social_icon": {"value": "fab fa-youtube", "library": "fa-brands"}, "link": link("#", True)}])
    col1 = con(image(m("logo-full.png"), "full", title="Logó", link_to="custom", link=link(HOME), width=S(110), align="left",
                     _margin=box(0, 0, 16, 0)),
               text("<p>Most Te is tehetsz egy lépéssel többet!</p>", title="Szlogen", text_color="rgba(255,255,255,0.6)",
                    **T(BODY, 14, 400, 1.6), _margin=box(0, 0, 24, 0)),
               social, title="Logó és közösségi")
    col2 = con(footer_heading("Rólunk"), link_list([("Alapítónk", HOME + "alapitonk/"), ("Küldetésünk", HOME + "kuldetesunk/"),
                                                     ("Nagyköveteink", HOME + "nagykoveteink/"), ("Kuratórium", HOME + "kuratorium/"),
                                                     ("Támogatott területek", HOME + "tamogatott-teruletek/"), ("Partnereink", HOME + "partnereink/"),
                                                     ("Dokumentumok", HOME + "dokumentumok/")], "Rólunk linkek"), title="Rólunk")
    col3 = con(footer_heading("Támogatás"), link_list([("Fogadj örökbe egy családot", HOME + "fogadj-orokbe-egy-csaladot/"),
                                                        ("Jelentkezz támogatónak", HOME + "jelntkezz-tamogatonak/"),
                                                        ("Kerülj be programunkba", HOME + "kerulj-be-programunkba/"),
                                                        ("Online adomány", HOME + "linkesfizetes/"), ("Adó 1%", HOME + "1-ado/"),
                                                        ("Adatkezelési tájékoztató", HOME + "adatkezelesi-tajekoztato/")], "Támogatás linkek"),
               title="Támogatás")
    col4 = con(footer_heading("Kapcsolat"), link_list([("1131 Budapest, Rokolya utca 1-13. 5. emelet", ""), ("+36 70 789 23 40", "tel:+36707892340"),
                                                        ("info@egylepesseltobb.hu", "mailto:info@egylepesseltobb.hu"),
                                                        ("Kapcsolat oldal →", HOME + "kapcsolat/")], "Kapcsolat adatok"),
               title="Kapcsolat")
    top = grid(col1, col2, col3, col4, cols=4, cols_t=2, cols_m=1, g=48, title="Lábléc oszlopok", margin=box(0, 0, 56, 0))

    infos = grid(info_item("Adószám", "19353825-1-41"), info_item("Nyilvántartási szám", "01-01-0013418"),
                 info_item("Bankszámlaszám", "11703006-25993994", "HU88 1170 3006 2599 3994 0000 0000"), info_item("Swift/Bic", "OTPVHUHB"),
                 info_item("Cím", "1131 Budapest, Rokolya utca 1-13. 5. emelet"), info_item("Alapító", "Hajós István"),
                 cols=2, g=16, title="Információk", margin=box(0, 0, 24, 0))
    simplepay = con(
        heading("Biztonságos online fizetés", "p", title="SimplePay felirat", title_color="rgba(255,255,255,0.4)", **T(BODY, 12, 400, 1.4, 0.025, "uppercase")),
        image(m("simplepay_logo.svg"), "full", title="SimplePay logó (link a fizetési tájékoztatóhoz)", link_to="custom",
              link=link("https://simplepay.hu/vasarlo-aff", True), width=S(96),
              _background_background="classic", _background_color="#FFFFFF", _border_radius=box(4), _padding=box(4, 8, 4, 8)),
        title="SimplePay", flex_direction="row", flex_align_items="center", flex_gap=gap(12), flex_wrap="wrap")
    info_col = con(footer_heading("Információk"), infos, simplepay, title="Információk oszlop")
    map_col = con(w("google_maps", title="Térkép", address="1131 Budapest, Rokolya utca 1-13", zoom=S(15), height=S(300),
                    _css_classes="elt-map"),
                  title="Térkép", border_radius=box(12), border_border="solid", border_width=box(1),
                  border_color="rgba(255,255,255,0.1)", overflow="hidden", css_classes="elt-map")
    middle = grid(info_col, map_col, cols=2, cols_t=1, g=32, title="Információk és térkép", margin=box(0, 0, 56, 0))

    bottom = con(
        heading("© 2026 Egy Lépéssel Több Alapítvány. Minden jog fenntartva.", "p", title="Copyright", title_color="rgba(255,255,255,0.4)", **T(BODY, 12, 400, 1.5)),
        heading('<a href="' + HOME + 'adatkezelesi-tajekoztato/">Adatkezelési tájékoztató</a>', "p", title="Adatkezelés link",
                title_color="rgba(255,255,255,0.4)", title_hover_color="#FFFFFF", **T(BODY, 12, 400, 1.5)),
        title="Alsó sáv", flex_direction="row", flex_direction_mobile="column", flex_justify_content="space-between",
        flex_align_items="center", flex_gap=gap(16), padding=box(32, 0, 0, 0),
        border_border="solid", border_width=box(1, 0, 0, 0), border_color="rgba(255,255,255,0.1)")
    contact_sec = con(top, middle, bottom, title="Kapcsolat és információk", _element_id="contact",
                      content_width="boxed", boxed_width=S(1280), padding=box(64, 40, 64, 40), padding_mobile=box(64, 24, 64, 24))

    root = con(partners_sec, events_sec, contact_sec, root=True, title="Lábléc", html_tag="footer",
               background_background="classic", background_color=NAVY[900])
    return [root]


def step_footer():
    pid = ensure_site_part("footer_id", "footer", "ELT – Lábléc", ["include/general"])
    publish(pid, "elementor_library", footer_elements(), {"hide_title": "yes"})
    print("footer", pid)


# =========================================================================== home
def hero():
    content = con(
        eyebrow("Egy Lépéssel Több Alapítvány", SAND[400], **wanim()),
        heading("Most Te is tehetsz egy lépéssel többet!", "h1", title="Főcím", title_color="#FFFFFF",
                **T(DISPLAY, 72, 500, 1.05, size_l=64, size_t=56, size_m=40), _margin=box(0, 0, 24, 0), **wanim(150)),
        text("<p>Fogadj örökbe egy rászoruló családot, és válj havonta a történetük részévé.</p>", title="Bevezető",
             text_color="rgba(255,255,255,0.85)", **T(BODY, 20, 400, 1.65, size_m=18), _margin=box(0, 0, 40, 0),
             _element_width="initial", _element_custom_width=S(672), _element_custom_width_mobile=S(100, "%"), **wanim(300)),
        con(button("Fogadj örökbe egy családot", "#families"),
            button("Ismerd meg a történetünket", "#founder", primary=False),
            title="Gombok", flex_direction="row", flex_wrap="wrap", flex_gap=gap(16), **anim(450)),
        title="Hero tartalom", width=S(896), width_tablet=S(100, "%"), flex_align_items="flex-start")
    cue = con(
        heading("Görgess", "p", title="Görgess felirat", title_color="rgba(255,255,255,0.7)", **T(BODY, 12, 400, 1, 0.1, "uppercase")),
        con(title="Vonal", width=S(1), min_height=S(40), background_background="classic", background_color="rgba(255,255,255,0.4)"),
        title="Görgetés jelző", css_classes="elt-scroll-cue", flex_align_items="center", flex_gap=gap(8), width=S(40),
        position="absolute", _offset_orientation_h="end", _offset_x_end=S(40), _offset_orientation_v="end", _offset_y_end=S(32),
        hide_mobile="hidden-mobile", z_index=2)
    return con(content, cue, root=True, title="Hero (diavetítés)", html_tag="section", _element_id="top", css_classes="elt-hero",
               min_height=S(100, "vh"), flex_justify_content="flex-end", overflow="hidden",
               padding=box(0, 40, 112, 40), padding_mobile=box(0, 24, 112, 24),
               background_background="slideshow",
               background_slideshow_gallery=[{"id": m("event-picnic-flute.png")["id"], "url": m("event-picnic-flute.png")["url"]},
                                             {"id": m("event-gala-checkin.jpg")["id"], "url": m("event-gala-checkin.jpg")["url"]}],
               background_slideshow_loop="yes", background_slideshow_slide_duration=5000,
               background_slideshow_slide_transition="fade", background_slideshow_transition_duration=2000,
               background_slideshow_background_size="cover", background_slideshow_background_position="center center",
               background_slideshow_ken_burns="yes", background_slideshow_ken_burns_zoom_direction="in",
               background_overlay_background="gradient", background_overlay_color="rgba(26,37,45,0.9)",
               background_overlay_color_stop=S(0, "%"), background_overlay_color_b="rgba(26,37,45,0.4)",
               background_overlay_color_b_stop=S(100, "%"), background_overlay_gradient_type="linear",
               background_overlay_gradient_angle=S(0, "deg"), background_overlay_opacity=S(1))


def families_section(loop=None):
    head = con(eyebrow("Fogadj örökbe egy családot", SAND[700], **wanim()),
               h2("Nem statisztika. Nem szám. Egy valódi család, akinek az élete változhat veled.", NAVY[800], **wanim(80)),
               title="Fejléc", width=S(672), width_tablet=S(100, "%"), margin=box(0, 0, 80, 0), margin_mobile=box(0, 0, 64, 0))
    body = loop or heading("A családkártyák a bővítmény telepítése után jelennek meg itt.", "p", title="Helyőrző", title_color=NAVY[400])
    more = heading('<a href="' + HOME + 'orokbefogadhato-csaladok/">Összes örökbefogadható család →</a>', "p",
                   title="Összes család link", title_color=NAVY[800], title_hover_color=SAND[700], **T(BODY, 15, 600, 1.4),
                   _margin=box(40, 0, 0, 0))
    return con(head, body, more, root=True, title="Családok", html_tag="section", _element_id="families",
               content_width="boxed", boxed_width=S(1280), background_background="classic", background_color="#FFFFFF", **SECTION_PAD)


AMBASSADORS = [("Győrfi Pál", "OMSZ szóvivő", "ambassador-gyorfi-pal.jpg"), ("Rácz Jenő", "Michelin-csillagos séf", "ambassador-racz-jeno.jpg"),
               ("Kucsera Gábor", "Kétszeres világbajnok kajakos", "ambassador-kucsera-gabor.jpg"),
               ("Proksa Szandra", "TV2 műsorvezető", "ambassador-proksa-szandra.jpg"),
               ("Kovács-Dobos Evelin", "Színésznő", "ambassador-kovacs-dobos-evelin.jpg"),
               ("Andrásfi Tibor", "Olimpiai bajnok", "ambassador-andrasfi-tibor.jpg")]


def ambassadors_section():
    cards = []
    for i, (name, role, img) in enumerate(AMBASSADORS):
        cards.append(con(
            con(image(m(img), "large", title="Portré"), title="Fotó", css_classes="elt-amb-photo"),
            con(heading(name, "h3", title="Név", title_color="#FFFFFF", align="center", **T(DISPLAY, 18, 600, 1.4), _margin=box(0, 0, 4, 0)),
                heading(role, "p", title="Szerep", title_color=SAND[500], align="center", **T(BODY, 14, 400, 1.4, 0.025, "uppercase")),
                title="Szöveg", padding=box(24), padding_mobile=box(16)),
            title=f"Nagykövet: {name}", css_classes="elt-lift elt-amb-card", overflow="hidden",
            background_background="classic", background_color="rgba(51,71,88,0.6)", border_border="solid", border_width=box(1),
            border_color="rgba(255,255,255,0.1)", border_radius=box(16), **anim((i % 3) * 80)))
    head = con(eyebrow("Nagyköveteink", SAND[400], **wanim()),
               h2("Akik a nevüket adják hozzá, hogy több család jusson segítséghez", "#FFFFFF", **wanim(80)),
               title="Fejléc", width=S(672), width_tablet=S(100, "%"), margin=box(0, 0, 80, 0), margin_mobile=box(0, 0, 64, 0))
    return con(head, grid(*cards, cols=3, cols_t=2, cols_m=2, g=32, g_m=16, title="Nagykövet kártyák"),
               root=True, title="Nagykövetek", html_tag="section", _element_id="ambassadors", content_width="boxed",
               boxed_width=S(1280), overflow="hidden", background_background="classic", background_color=NAVY[800], **SECTION_PAD)


AREAS = [("elt-icon-sziv.svg", "Beteg gyermekek családjai", "Tartósan vagy súlyosan beteg gyermeket nevelő családok anyagi és lelki terheinek enyhítése."),
         ("elt-icon-mancs.svg", "Állatvédelem", "Menhelyek, örökbefogadó programok és sérült állatok gyógykezelésének támogatása."),
         ("elt-icon-kupa.svg", "Sporttámogatás", "Sportfelszerelés, edzésbérlet és versenyeztetés rászoruló, tehetséges gyerekeknek."),
         ("elt-icon-egeszseg.svg", "Egészségügyi támogatás", "Gyógyszerek, vizsgálatok és kezelések elérhetővé tétele, amikor a család ereje elfogyna."),
         ("elt-icon-oktatas.svg", "Oktatás támogatása", "Taneszközök, korrepetálás és ösztöndíjak, hogy a szegénység ne szabjon határt a tanulásnak.")]


def areas_section():
    cards = []
    for i, (icon, title_, desc) in enumerate(AREAS):
        cards.append(con(
            w("icon", title="Ikon", selected_icon={"value": {"id": m(icon)["id"], "url": m(icon)["url"]}, "library": "svg"},
              primary_color=NAVY[700], size=S(40), align="left", _margin=box(0, 0, 20, 0),
              _css_classes="" if "mancs" in icon else "elt-icon-line"),
            heading(title_, "h3", title="Terület", title_color=NAVY[800], **T(DISPLAY, 17, 600, 1.35), _margin=box(0, 0, 8, 0)),
            text(f"<p>{desc}</p>", title="Leírás", text_color=NAVY[600], **T(BODY, 14, 400, 1.65)),
            title=f"Terület: {title_}", css_classes="elt-lift", background_background="classic", background_color="#FFFFFF",
            border_radius=box(16), padding=box(28), border_border="solid", border_width=box(4, 0, 0, 0), border_color=SAND[500],
            **anim(i * 80)))
    head = grid(
        con(eyebrow("Területeink", SAND[700], **wanim()),
            h2("Öt terület, ahol hisszük: a segítség rendszerré válhat", NAVY[800], **wanim(80)), title="Cím"),
        text("<p>Alapítványunk különböző területeken nyújt támogatást: a beteg gyermekek ellátásától kezdve az állatvédelemig, "
             "a sport, az egészségügy és az oktatás előmozdításáig. Közös erővel érhetünk el változást ezekben a fontos ügyekben.</p>",
             title="Bevezető", text_color=NAVY[600], align="right", align_tablet="left", **T(BODY, 16, 400, 1.65), **wanim(160)),
        cols=2, cols_t=1, g=40, title="Fejléc", grid_align_items="end", margin=box(0, 0, 80, 0), margin_mobile=box(0, 0, 64, 0))
    return con(head, grid(*cards, cols=5, cols_t=2, cols_m=1, g=24, title="Terület kártyák"),
               root=True, title="Területeink", html_tag="section", _element_id="areas", content_width="boxed", boxed_width=S(1280),
               background_background="classic", background_color=SAND[50], **SECTION_PAD)


def founder_section():
    photo = con(
        image(m("founder.jpg"), "large", title="Alapító fotó", width=S(100, "%"), height=S(560), height_mobile=S(420),
              **{"object-fit": "cover"}, image_border_radius=box(16), _z_index=1,
              _box_shadow_box_shadow_type="yes",
              _box_shadow_box_shadow={"horizontal": 0, "vertical": 25, "blur": 50, "spread": -12, "color": "rgba(0,0,0,0.5)"}),
        title="Fotó (díszkerettel: elt-founder-photo)", css_classes="elt-founder-photo", width=S(40, "%"), width_tablet=S(100, "%"), **anim())
    copy = con(
        eyebrow("Alapítónk", SAND[400]),
        h2("Hajós István", "#FFFFFF", _margin=box(0, 0, 32, 0)),
        text("<p>Fiatalon lett vállalkozó, első cégét 2002-ben alapította. Meglátása szerint a kellő alázat, az akarat és a folyamatos "
             "tanulás elengedhetetlen egy sikeres vállalkozás működtetéséhez.</p>"
             "<p>Innovatív vezető, aki mindig keresi az újabb és újabb kihívásokat. Ha egy hirtelen feladattal találják magukat szemben, "
             "kollégái már jól ismerik a mottót: nincs lehetetlen, csak tehetetlen. Éppen ezért nagyon büszke csapatára — a cégcsoportban "
             "az alkalmazottak száma meghaladja a 300 főt.</p>",
             title="Bemutatkozás", text_color="rgba(255,255,255,0.8)", paragraph_spacing=S(20), **T(BODY, 18, 400, 1.65, size_m=16)),
        heading("Hajós István", "p", title="Aláírás", title_color=SAND[400], **T(DISPLAY, 24, 400, 1.3, style="italic"), _margin=box(40, 0, 4, 0)),
        heading("Alapító, Egy Lépéssel Több Alapítvány · 2019 óta", "p", title="Beosztás", title_color="rgba(255,255,255,0.5)", **T(BODY, 14, 400, 1.5)),
        title="Szöveg", width=S(60, "%"), width_tablet=S(100, "%"), **anim(120))
    return con(photo, copy, root=True, title="Alapítónk", html_tag="section", _element_id="founder", content_width="boxed",
               boxed_width=S(1152), flex_direction="row", flex_direction_tablet="column", flex_align_items="center", flex_gap=gap(56),
               overflow="hidden", background_background="classic", background_color=NAVY[700], **SECTION_PAD)


def home_elements(loop=None):
    return [hero(), families_section(loop), ambassadors_section(), areas_section(), founder_section()]


PAGE_SETTINGS = {"hide_title": "yes", "template": "elementor_header_footer"}


def ensure_page(key, title, slug):
    if STATE.get(key):
        return STATE[key]
    existing = rest("GET", f"wp/v2/pages?slug={slug}&status=any&context=edit&_fields=id")
    if existing:
        pid = existing[0]["id"]
    else:
        pid = rest("POST", "wp/v2/pages", {"title": title, "slug": slug, "status": "draft", "template": "elementor_header_footer"})["id"]
    STATE[key] = pid
    save_state()
    return pid


def step_home():
    pid = ensure_page("home_id", "Főoldal – Egy Lépéssel Több", "kezdolap")
    loop = STATE.get("home_loop")
    save_elementor("pages", pid, home_elements(loop_grid("elt_orokbefogadhato", 6) if loop else None), PAGE_SETTINGS,
                   extra={"status": "publish", "template": "elementor_header_footer"})
    print("home", pid)


def step_front():
    rest("POST", "wp/v2/settings", {"show_on_front": "page", "page_on_front": STATE["home_id"],
                                    "title": "Egy Lépéssel Több Alapítvány",
                                    "description": "Fogadj örökbe egy családot, és válj havonta a történetük részévé.",
                                    "site_icon": m("favicon.png")["id"], "site_logo": m("logo-full.png")["id"]})
    print("front page set")


def step_unassign_inka():
    """INKA VISION header/footer → draft (kept, but no longer shown)."""
    for pid in (77, 80):
        rest("POST", f"wp/v2/elementor_library/{pid}", {"status": "draft"})


# Placeholders filled in by site_dynamic.py (needs the plugin).
def loop_grid(query_id, per_page):
    raise NotImplementedError


if __name__ == "__main__":
    steps = {"backup": step_backup, "kit": step_kit, "menu": step_menu, "header": step_header, "footer": step_footer,
             "home": step_home, "front": step_front, "unassign_inka": step_unassign_inka}
    for arg in sys.argv[1:]:
        steps[arg]()
