"""Second build stage – needs the "Egy Lépéssel Több – Családok és adományok" plugin to be active.

Usage:  WP_AUTH='user:app password' python3 site_dynamic.py <step> [<step> ...]
Steps:  families loopitem single home lists support result
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import elt_site as base  # noqa: E402
from elt_site import (STATE, save_state, m, NAVY, SAND, DISPLAY, BODY, HOME, SECTION_PAD, PAGE_SETTINGS,  # noqa: E402
                  eyebrow, h2, anim, wanim, button, ensure_site_part, ensure_page, publish)
from el import S, box, gap, T, tag, con, grid, w, heading, text, image, link, eid  # noqa: E402
from wp import rest, mcp, save_elementor, WP_URL  # noqa: E402

DOMAIN = "egylepesseltobb.hu"
PRIVACY_URL = HOME + "adatkezelesi-tajekoztato/"


def terms():
    if "terms" not in STATE:
        res = rest("GET", "wp/v2/elt_statusz?per_page=10&_fields=id,slug")
        STATE["terms"] = {t["slug"]: t["id"] for t in res}
        save_state()
    return STATE["terms"]


def dyn(**tags):
    return {"__dynamic__": tags}


# =========================================================================== families
FAMILIES = [
    ("Noel", "Küzdelem a dongalábbal", "story-noel.webp",
     "2025 őszén dongaláb miatt hónapokon át heti gipszelésre járt, majd 2026 februárjában fontos műtéten esett át. "
     "Nagymamája elvesztése is nehéz veszteség volt a családnak. Ma már ortopéd cipővel teszi meg egyre biztosabb lépéseit, "
     "de további kezelések várnak rá."),
    ("F. Noel", "9 éves · Duchenne-féle izomdisztrófia", "story-fnoel.webp",
     "Ritka és súlyos izombetegséggel született — szülei már kisgyermekként érezték, hogy nehezebb útja lesz, mint kortársainak. "
     "Két éven belül mindkét lába eltört, mégis újra és újra megpróbált felállni. Ma karjait is egyre nehezebben emeli, "
     "de nem panaszkodik — csendben, türelemmel küzd."),
    ("Kamilla", "Rett-szindróma", "story-kamilla.webp",
     "Egészségesen született, ám másfél éves korára feltűnt, hogy lassabban fejlődik társainál. Háromévesen diagnosztizálták "
     "nála a Rett-szindrómát, ami komoly visszaesést okozott. A család célja, hogy Kamilla minél tovább megőrizhesse mosolygós, "
     "boldog természetét."),
]


def step_families():
    t = terms()
    ids = STATE.setdefault("families", {})
    for name, sub, img, story in FAMILIES:
        if name in ids:
            continue
        res = rest("POST", "wp/v2/elt_csalad", {
            "title": name, "status": "publish", "content": f"<p>{story}</p>", "excerpt": story,
            "featured_media": m(img)["id"], "elt_statusz": [t["orokbefogadhato"]],
            "meta": {"elt_alcim": sub, "elt_jelentkezok": 0},
        })
        ids[name] = res["id"]
        save_state()
        print("family", name, res["id"], res["link"])


# =========================================================================== loop item (family card)
def family_card():
    media = con(
        image({"id": "", "url": ""}, "medium_large", title="Borítókép", **dyn(image=tag("post-featured-image"))),
        heading("Örökbefogadható", "p", title="Státusz címke", _css_classes="elt-status-badge",
                _position="absolute", _offset_orientation_h="start", _offset_x=S(16), _offset_orientation_v="start", _offset_y=S(16),
                _z_index=2, **dyn(title=tag("elt-csalad-adat", {"mezo": "statusz"}))),
        title="Kép (link a család oldalára)", css_classes="elt-card-media elt-zoom", html_tag="a", link={"url": ""},
        **dyn(link=tag("post-url")))
    body = con(
        heading("Család neve", "h3", title="Név", title_color=NAVY[800], title_hover_color=SAND[700], **T(DISPLAY, 20, 600, 1.35),
                _margin=box(0, 0, 4, 0), **dyn(title=tag("post-title"), link=tag("post-url"))),
        heading("Alcím", "p", title="Alcím", title_color=NAVY[500], **T(BODY, 14, 400, 1.5), _margin=box(0, 0, 16, 0),
                **dyn(title=tag("elt-csalad-adat", {"mezo": "alcim"}))),
        text("<p>Rövid történet</p>", title="Kivonat", text_color=NAVY[600], **T(BODY, 14, 400, 1.65), _margin=box(0, 0, 24, 0),
             **dyn(editor=tag("post-excerpt", {"max_length": "", "apply_to_post_content": ""}))),
        heading("Segítek →", "p", title="Gomb (Segítek …)", title_color=NAVY[800], title_hover_color=SAND[700], **T(BODY, 14, 600, 1.4),
                _css_classes="elt-card-cta", _padding=box(20, 0, 0, 0), _margin=box(0, 0, 0, 0),
                _border_border="solid", _border_width=box(1, 0, 0, 0), _border_color=NAVY[200], _flex_align_self="stretch",
                **dyn(title=tag("elt-csalad-adat", {"mezo": "gomb_felirat", "after": " →"}), link=tag("elt-jelentkezes-url", {"horgony": "#jelentkezes"}))),
        title="Szöveg", padding=box(28), padding_mobile=box(24), _flex_size="grow")
    # Push the call-to-action line to the bottom of equal-height cards.
    body["elements"][-1]["settings"]["_margin"] = {"unit": "px", "top": "auto", "right": "0", "bottom": "0", "left": "0", "isLinked": False}
    root = con(media, body, root=True, title="Családkártya", html_tag="article", css_classes="elt-lift elt-family-card",
               background_background="classic", background_color=NAVY[50], border_border="solid", border_width=box(1),
               border_color=NAVY[100], border_radius=box(16), overflow="hidden")
    return [root]


def step_loopitem():
    pid = ensure_site_part("loop_item_id", "loop-item", "ELT – Családkártya (Loop elem)", None)
    import json as _json
    first = next(iter(STATE.get("families", {}).values()), None)
    settings = {"preview_type": "single/elt_csalad"}
    if first:
        settings["preview_id"] = first
    # Elementor's MCP cannot save loop-item documents, so write + publish through REST and
    # let a kit save (step "kit" of elt_site.py) clear Elementor's CSS cache afterwards.
    rest("POST", f"wp/v2/elementor_library/{pid}", {"status": "publish", "meta": {
        "_elementor_edit_mode": "builder", "_elementor_page_settings": settings,
        "_elementor_data": _json.dumps(family_card(), ensure_ascii=False)}})
    base.step_kit()
    print("loop item", pid)


def loop_grid(query_id, per_page, pagination=False, nothing=""):
    status = query_id.replace("elt_", "")
    s = dict(template_id=STATE["loop_item_id"], columns=3, columns_tablet=2, columns_mobile=1, posts_per_page=per_page,
             column_gap=S(40), column_gap_tablet=S(32), column_gap_mobile=S(24), row_gap=S(40), row_gap_mobile=S(24),
             equal_height="yes", post_query_post_type="elt_csalad", post_query_query_id=query_id, nothing_found_message_text=nothing,
             post_query_include=["terms"], post_query_include_term_ids=[str(terms()[status])],
             post_query_orderby="date", post_query_order="desc", nothing_found_message=nothing, **wanim())
    if pagination:
        s["pagination_type"] = "numbers"
    return w("loop-grid", title="Családok listája (Loop Grid – Query ID: " + query_id + ")", **s)


base.loop_grid = loop_grid


# =========================================================================== forms
def fid():
    return eid()


def form_style():
    return dict(
        show_labels="yes", mark_required="yes", input_size="md", button_size="md", button_width="100", button_align="stretch",
        column_gap=S(20), row_gap=S(20), custom_messages="yes",
        required_field_message="Ezt a mezőt kötelező kitölteni.", invalid_message="Hibás adat, kérjük, ellenőrizd.",
        label_color=NAVY[700], **T(BODY, 14, 600, 1.4, prefix="label_typography"),
        field_text_color=NAVY[800], field_background_color="#FFFFFF", field_border_color=NAVY[100], field_border_width=box(1),
        field_border_radius=box(12), **T(BODY, 15, 400, 1.5, prefix="field_typography"),
        button_background_color=SAND[500], button_text_color=NAVY[900], button_background_hover_color=SAND[600],
        button_hover_color=NAVY[900], button_border_radius=box(999), button_text_padding=box(16, 32, 16, 32),
        **T(BODY, 16, 600, 1.2, prefix="button_typography"),
        _css_classes="elt-form elt-btn-primary",
        _element_cache="yes",  # "yes" = cache inactive: the family list / preselection must be rendered on every request
    )


def acceptance_privacy():
    return {"_id": fid(), "custom_id": "adatkezeles", "field_type": "acceptance", "field_label": "Adatkezelés", "width": "100",
            "required": "true",
            "acceptance_text": f'Elolvastam és elfogadom az <a href="{PRIVACY_URL}" target="_blank">adatkezelési tájékoztatót</a>.'}


def application_form():
    """The real "Jelentkezz támogatónak" form of the previous site, wired to the family automation."""
    amounts = [("Válassz összeget", "")] + [(f"{n:,} Ft".replace(",", " "), str(n)) for n in range(5000, 50001, 5000)]
    heard = ["Televízióból", "Facebookról", "Plakáton láttam", "Instagramról", "Rádióból", "Barátoktól vagy ismerősöktől",
             "Rendezvényen vagy eseményen", "Hírlevélből vagy e-mailből", "Egyéb felületről"]
    opt = lambda pairs: "\n".join(f"{x}|{y}" for x, y in pairs)  # noqa: E731
    fields = [
        {"_id": fid(), "custom_id": "vezeteknev", "field_type": "text", "field_label": "Vezetéknév", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "keresztnev", "field_type": "text", "field_label": "Keresztnév", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "email", "field_type": "email", "field_label": "E-mail", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "telefon", "field_type": "tel", "field_label": "Telefonszám", "width": "50", "required": "true"},
        {"_id": fid(), "custom_id": "osszeg", "field_type": "select", "field_label": "Havi támogatás összege (HUF)", "width": "50",
         "required": "true", "field_options": opt(amounts)},
        {"_id": fid(), "custom_id": "csalad", "field_type": "select", "field_label": "Támogatni kívánt család", "width": "50",
         "required": "true", "field_options": "Válassz családot…|"},
        {"_id": fid(), "custom_id": "honnan", "field_type": "select", "field_label": "Honnan hallott rólunk?", "width": "100",
         "required": "true", "field_options": opt([("Válasszon a felsoroltak közül", "")] + [(h, h) for h in heard])},
        {"_id": fid(), "custom_id": "uzenet", "field_type": "textarea", "field_label": "Megjegyzés", "width": "100", "rows": "4"},
        {"_id": fid(), "custom_id": "adatkezeles", "field_type": "acceptance", "field_label": "Adatkezelés", "width": "100", "required": "true",
         "acceptance_text": f'Elolvastam és megértettem az <a href="{PRIVACY_URL}" target="_blank">adatkezelési tájékoztatót</a>.'},
    ]
    return w("form", title="Jelentkezz támogatónak űrlap", form_name="Jelentkezz támogatónak", form_fields=fields,
             button_text="Jelentkezem", submit_actions=["elt_jelentkezes", "email"],
             email_to="info@" + DOMAIN, email_subject='Új támogatói jelentkezés – [field id="vezeteknev"] [field id="keresztnev"]',
             email_content="[all-fields]", email_from="noreply@bographic.hu", email_from_name="Egy Lépéssel Több weboldal",
             email_reply_to='[field id="email"]', email_content_type="html",
             success_message="Köszönjük a jelentkezésed! E-mailben visszaigazolunk, és a szerződéskötés előtt telefonon is felvesszük veled a kapcsolatot.",
             error_message="Hiba történt a küldés során. Kérjük, próbáld újra, vagy írj az info@" + DOMAIN + " címre.",
             **form_style())


SP_STATEMENT = (
    "Tudomásul veszem, hogy az Egy Lépéssel Több Hajós István Alapítvány (1131 Budapest, Rokolya utca 1-13. 5. emelet) adatkezelő "
    f"által a(z) {DOMAIN} felhasználói adatbázisában tárolt alábbi személyes adataim átadásra kerülnek az OTP Mobil Kft., mint "
    "adatfeldolgozó részére. Az adatkezelő által továbbított adatok köre az alábbi: e-mail cím. Az adatfeldolgozó által végzett "
    "adatfeldolgozási tevékenység jellege és célja a SimplePay Adatkezelési tájékoztatóban, az alábbi linken tekinthető meg: "
    '<a href="https://simplepay.hu/vasarlo-aff" target="_blank">https://simplepay.hu/vasarlo-aff</a>')


def donation_form():
    fields = [
        {"_id": fid(), "custom_id": "osszeg", "field_type": "radio", "field_label": "Adomány összege", "width": "100", "required": "true",
         "field_options": "5 000 Ft|5000\n10 000 Ft|10000\n20 000 Ft|20000\n50 000 Ft|50000\nEgyedi összeg|egyedi",
         "field_value": "10000", "inline_list": "elementor-subgroup-inline"},
        {"_id": fid(), "custom_id": "egyedi_osszeg", "field_type": "number", "field_label": "Egyedi összeg (Ft)", "width": "100",
         "field_min": "500", "placeholder": "pl. 15000 – csak „Egyedi összeg” választásakor"},
        {"_id": fid(), "custom_id": "nev", "field_type": "text", "field_label": "Név", "width": "50", "required": "true", "placeholder": "Teljes név"},
        {"_id": fid(), "custom_id": "email", "field_type": "email", "field_label": "E-mail cím", "width": "50", "required": "true",
         "placeholder": "pelda@email.hu"},
        acceptance_privacy(),
        {"_id": fid(), "custom_id": "adattovabbitas", "field_type": "acceptance", "field_label": "Adattovábbítási nyilatkozat", "width": "100",
         "required": "true", "acceptance_text": SP_STATEMENT},
    ]
    return w("form", title="Adomány űrlap (SimplePay)", form_name="Online adomány", form_fields=fields,
             button_text="Tovább a biztonságos fizetéshez", submit_actions=["elt_simplepay"],
             success_message="Átirányítunk a SimplePay biztonságos fizetési oldalára…",
             error_message="A fizetés indítása nem sikerült. Kérjük, próbáld újra később.",
             **form_style())


# =========================================================================== single family template
def single_elements():
    hero = con(
        con(image({"id": "", "url": ""}, "large", title="Borítókép", width=S(100, "%"), height=S(460), height_mobile=S(300),
                  **{"object-fit": "cover"}, image_border_radius=box(16), **dyn(image=tag("post-featured-image"))),
            title="Kép", width=S(50, "%"), width_tablet=S(100, "%"), **anim()),
        con(heading("Örökbefogadható", "p", title="Státusz címke", _css_classes="elt-status-badge", _margin=box(0, 0, 20, 0),
                    **dyn(title=tag("elt-csalad-adat", {"mezo": "statusz"}))),
            heading("Család neve", "h1", title="Név", title_color="#FFFFFF", **T(DISPLAY, 56, 500, 1.1, size_t=44, size_m=36),
                    _margin=box(0, 0, 12, 0), **dyn(title=tag("post-title"))),
            heading("Alcím", "p", title="Alcím", title_color=SAND[400], **T(BODY, 18, 500, 1.5), _margin=box(0, 0, 12, 0),
                    **dyn(title=tag("elt-csalad-adat", {"mezo": "alcim"}))),
            heading("Havi támogatás", "p", title="Havi támogatási összeg", title_color="rgba(255,255,255,0.7)", **T(BODY, 16, 400, 1.5),
                    _margin=box(0, 0, 32, 0), **dyn(title=tag("elt-csalad-adat", {"mezo": "havi_osszeg", "before": "Havi támogatási cél: "}))),
            con(button("Jelentkezem támogatónak", "#jelentkezes", title="Jelentkezés gomb (csak örökbefogadhatónál)",
                       _css_classes="elt-btn-primary elt-csak-orokbefogadhato"),
                button("Vissza a családokhoz", HOME + "orokbefogadhato-csaladok/", primary=False),
                title="Gombok", flex_direction="row", flex_wrap="wrap", flex_gap=gap(16)),
            title="Adatok", width=S(50, "%"), width_tablet=S(100, "%"), flex_align_items="flex-start", **anim(120)),
        root=True, title="Család fejléc", html_tag="section", content_width="boxed", boxed_width=S(1152),
        flex_direction="row", flex_direction_tablet="column", flex_align_items="center", flex_gap=gap(56),
        padding=box(176, 40, 96, 40), padding_mobile=box(128, 24, 64, 24), background_background="classic", background_color=NAVY[900])

    story = con(
        eyebrow("A család története", SAND[700]),
        con(w("theme-post-content", title="Történet (a család szövege)", align="left", text_color=NAVY[600],
              **T(BODY, 18, 400, 1.75, size_m=16)), title="Történet"),
        w("image-gallery", title="Galéria (a család képei)", gallery_columns="3", gallery_columns_mobile="2", thumbnail_size="medium_large",
          gallery_link="file", open_lightbox="yes", gallery_display_caption="none", image_spacing="custom", image_spacing_custom=S(6),
          _css_classes="elt-gallery", wp_gallery=[], _margin=box(48, 0, 0, 0), **dyn(wp_gallery=tag("elt-csalad-galeria", {"boritokep": ""}))),
        root=True, title="Történet és galéria", html_tag="section", content_width="boxed", boxed_width=S(820),
        background_background="classic", background_color="#FFFFFF",
        padding=box(112, 40, 112, 40), padding_mobile=box(72, 24, 72, 24))

    apply_open = con(
        eyebrow("Jelentkezés", SAND[700]),
        h2("Légy te is a család támogatója!", NAVY[800], _margin=box(0, 0, 16, 0)),
        text("<p>A beküldött jelentkezésekre e-mailben visszaigazolunk. Telefonon a támogatókkal szerződéskötés előtt fogjuk felvenni "
             "a kapcsolatot, amint a támogatni kívánt családnak összegyűlt a havi 50 000 Ft támogatása.</p>", title="Leírás", text_color=NAVY[600], **T(BODY, 16, 400, 1.65),
             _margin=box(0, 0, 32, 0)),
        con(application_form(), title="Űrlap kártya", background_background="classic", background_color="#FFFFFF", border_radius=box(16),
            padding=box(40), padding_mobile=box(24), border_border="solid", border_width=box(1), border_color=NAVY[100]),
        title="Jelentkezés (csak örökbefogadható családnál látszik)", css_classes="elt-csak-orokbefogadhato")
    apply_closed = con(
        eyebrow("Örökbefogadott család", SAND[700]),
        h2("Ez a család már megtalálta a támogatóit", NAVY[800], _margin=box(0, 0, 16, 0)),
        text("<p>Köszönjük mindenkinek, aki jelentkezett! Nézd meg a többi családot, akik még várják a segítséget.</p>",
             title="Leírás", text_color=NAVY[600], **T(BODY, 16, 400, 1.65), _margin=box(0, 0, 32, 0)),
        button("Örökbefogadható családok", HOME + "orokbefogadhato-csaladok/"),
        title="Üzenet (csak örökbefogadott családnál látszik)", css_classes="elt-csak-orokbefogadott", flex_align_items="flex-start")
    apply_sec = con(apply_open, apply_closed, root=True, title="Jelentkezés", html_tag="section", _element_id="jelentkezes",
                    content_width="boxed", boxed_width=S(820), background_background="classic", background_color=SAND[50],
                    padding=box(112, 40, 112, 40), padding_mobile=box(72, 24, 72, 24))
    return [hero, story, apply_sec]


def step_single():
    pid = ensure_site_part("single_id", "single-post", "ELT – Család oldal (sablon)", ["include/singular/elt_csalad"])
    first = next(iter(STATE.get("families", {}).values()), None)
    settings = {"preview_type": "single/elt_csalad"}
    if first:
        settings["preview_id"] = first
    publish(pid, "elementor_library", single_elements(), settings)
    print("single", pid)


# =========================================================================== pages
def page_hero(eyebrow_txt, title_txt, intro):
    return con(
        eyebrow(eyebrow_txt, SAND[400], **wanim()),
        heading(title_txt, "h1", title="Oldal címe", title_color="#FFFFFF", **T(DISPLAY, 56, 500, 1.1, size_t=44, size_m=36),
                _margin=box(0, 0, 20, 0), **wanim(100)),
        text(f"<p>{intro}</p>", title="Bevezető", text_color="rgba(255,255,255,0.8)", **T(BODY, 18, 400, 1.65, size_m=16),
             _element_width="initial", _element_custom_width=S(720), _element_custom_width_tablet=S(100, "%"), **wanim(200)),
        root=True, title="Oldal fejléc", html_tag="section", content_width="boxed", boxed_width=S(1280),
        padding=box(176, 40, 96, 40), padding_mobile=box(144, 24, 72, 24), background_background="classic", background_color=NAVY[800])


def application_section(intro):
    return con(
        con(eyebrow("Jelentkezés", SAND[700]),
            h2("Jelentkezz egy család támogatójának", NAVY[800], _margin=box(0, 0, 16, 0)),
            text(f"<p>{intro}</p>", title="Leírás", text_color=NAVY[600], **T(BODY, 16, 400, 1.65), _margin=box(0, 0, 32, 0)),
            con(application_form(), title="Űrlap kártya", background_background="classic", background_color="#FFFFFF", border_radius=box(16),
                padding=box(40), padding_mobile=box(24), border_border="solid", border_width=box(1), border_color=NAVY[100]),
            title="Tartalom"),
        root=True, title="Jelentkezés", html_tag="section", _element_id="jelentkezes", content_width="boxed", boxed_width=S(820),
        background_background="classic", background_color=SAND[50], padding=box(112, 40, 112, 40), padding_mobile=box(72, 24, 72, 24))


def list_section(grid_widget):
    return con(grid_widget, root=True, title="Családok", html_tag="section", content_width="boxed", boxed_width=S(1280),
               background_background="classic", background_color="#FFFFFF", padding=box(96, 40, 112, 40), padding_mobile=box(64, 24, 72, 24))


def step_lists():
    pid = ensure_page("adoptable_id", "Örökbefogadható családok", "orokbefogadhato-csaladok")
    save_elementor("pages", pid, [
        page_hero("Fogadj örökbe egy családot", "Örökbefogadható családok",
                  "Ők most várják, hogy valaki havonta a történetük részévé váljon. Válassz egy családot, és jelentkezz támogatónak."),
        list_section(loop_grid("elt_orokbefogadhato", 12, pagination=True,
                               nothing="Jelenleg minden család megtalálta a támogatóit. Köszönjük!")),
        application_section("Válaszd ki a családot, add meg az elérhetőségeidet, és munkatársunk hamarosan felveszi veled a kapcsolatot."),
    ], PAGE_SETTINGS, extra={"status": "publish", "template": "elementor_header_footer"})
    print("adoptable page", pid)

    pid = ensure_page("adopted_id", "Örökbefogadott családok", "orokbefogadott-csaladok")
    save_elementor("pages", pid, [
        page_hero("Fogadj örökbe egy családot", "Örökbefogadott családok",
                  "Ezek a családok már megtalálták a támogatóikat. Köszönjük mindenkinek, aki egy lépéssel többet tett értük!"),
        list_section(loop_grid("elt_orokbefogadott", 12, pagination=True,
                               nothing="Hamarosan itt láthatod azokat a családokat, akik már megtalálták a támogatóikat.")),
        con(button("Örökbefogadható családok", HOME + "orokbefogadhato-csaladok/"), root=True, title="Gomb", content_width="boxed",
            boxed_width=S(1280), flex_align_items="center", padding=box(0, 40, 112, 40), padding_mobile=box(0, 24, 72, 24)),
    ], PAGE_SETTINGS, extra={"status": "publish", "template": "elementor_header_footer"})
    print("adopted page", pid)


def info_card(title_, html):
    return con(heading(title_, "h3", title=title_, title_color=NAVY[800], **T(DISPLAY, 20, 600, 1.3), _margin=box(0, 0, 8, 0)),
               text(html, title="Szöveg", text_color=NAVY[600], **T(BODY, 15, 400, 1.65)),
               title=title_, background_background="classic", background_color="#FFFFFF", border_radius=box(16), padding=box(28),
               border_border="solid", border_width=box(4, 0, 0, 0), border_color=SAND[500])


def step_support():
    pid = ensure_page("support_id", "Az Alapítvány működésének támogatása", "tamogatas")
    form_card = con(
        heading("Online adomány bankkártyával", "h2", title="Cím", title_color=NAVY[800], **T(DISPLAY, 30, 500, 1.25, size_m=26),
                _margin=box(0, 0, 8, 0)),
        text("<p>Válaszd ki az összeget – a fizetés a SimplePay biztonságos oldalán történik.</p>", title="Leírás", text_color=NAVY[600],
             **T(BODY, 15, 400, 1.65), _margin=box(0, 0, 24, 0)),
        donation_form(),
        con(image(m("simplepay_logo.svg"), "full", title="SimplePay logó (link)", link_to="custom",
                  link=link("https://simplepay.hu/vasarlo-aff", True), width=S(110)),
            text("<p>A bankkártyás fizetést az OTP Mobil Kft. SimplePay rendszere biztosítja.</p>", title="SimplePay szöveg",
                 text_color=NAVY[500], **T(BODY, 13, 400, 1.5)),
            title="SimplePay", flex_direction="row", flex_align_items="center", flex_gap=gap(16), flex_wrap="wrap", margin=box(24, 0, 0, 0)),
        title="Adomány kártya", background_background="classic", background_color="#FFFFFF", border_radius=box(16),
        padding=box(40), padding_mobile=box(24), border_border="solid", border_width=box(1), border_color=NAVY[100], **anim())
    side = con(
        info_card("Banki átutalás", "<p>Bankszámlaszám: <strong>11703006-25993994</strong><br>IBAN: HU88 1170 3006 2599 3994 0000 0000<br>"
                                    "Swift/BIC: OTPVHUHB<br>Közlemény: „Adomány”</p>"),
        info_card("Adó 1%", "<p>Személyi jövedelemadód 1%-ával is segítheted munkánkat.<br>Adószámunk: <strong>19353825-1-41</strong></p>"),
        info_card("Fogadj örökbe egy családot", f'<p>Havi rendszeres támogatóként egy konkrét család életén segíthetsz. '
                                                f'<a href="{HOME}orokbefogadhato-csaladok/">Nézd meg az örökbefogadható családokat →</a></p>'),
        title="Egyéb támogatási módok", flex_gap=gap(24), **anim(120))
    body = grid(form_card, side, cols=2, cols_t=1, g=40, title="Adomány és információk", grid_align_items="start")
    save_elementor("pages", pid, [
        page_hero("Támogatás", "Az Alapítvány működésének támogatása",
                  "Minden adomány közvetlenül a rászoruló családokhoz, beteg gyermekekhez és programjainkhoz jut el. Köszönjük, hogy egy lépéssel többet teszel!"),
        con(body, root=True, title="Adomány", html_tag="section", _element_id="adomany", content_width="boxed", boxed_width=S(1280),
            background_background="classic", background_color=SAND[50], padding=box(96, 40, 112, 40), padding_mobile=box(64, 24, 72, 24)),
    ], PAGE_SETTINGS, extra={"status": "publish", "template": "elementor_header_footer"})
    print("support page", pid)


def step_result():
    pid = ensure_page("result_id", "Fizetés eredménye", "fizetes-eredmenye")
    save_elementor("pages", pid, [
        page_hero("Online adomány", "Fizetés eredménye", "Köszönjük, hogy támogatod az Alapítvány munkáját."),
        con(w("shortcode", title="SimplePay eredmény (rövidkód – ne töröld)", shortcode="[elt_fizetes_eredmeny]"),
            con(button("Vissza a főoldalra", HOME),
                button("Újabb adomány", HOME + "tamogatas/", primary=False, light=False),
                title="Gombok", flex_direction="row", flex_wrap="wrap", flex_gap=gap(16)),
            root=True, title="Eredmény", content_width="boxed", boxed_width=S(820), flex_gap=gap(32),
            background_background="classic", background_color="#FFFFFF", padding=box(96, 40, 112, 40), padding_mobile=box(64, 24, 72, 24)),
    ], PAGE_SETTINGS, extra={"status": "publish", "template": "elementor_header_footer"})
    print("result page", pid)


def step_home():
    STATE["home_loop"] = True
    save_state()
    base.step_home()


if __name__ == "__main__":
    steps = {"families": step_families, "loopitem": step_loopitem, "single": step_single, "home": step_home,
             "lists": step_lists, "support": step_support, "result": step_result}
    for arg in sys.argv[1:]:
        steps[arg]()
