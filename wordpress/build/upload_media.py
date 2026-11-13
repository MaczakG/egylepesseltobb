"""Upload the design images to the WordPress Media Library (idempotent via media.json)."""
import io, json, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from wp import rest

IMG = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "img")
OUT = os.path.join(os.path.dirname(__file__), "media.json")

ALT = {
    "logo-full.png": "Egy Lépéssel Több Hajós István Alapítvány logó",
    "logo-mark.png": "Egy Lépéssel Több Alapítvány jel",
    "favicon.png": "Egy Lépéssel Több Alapítvány ikon",
    "event-picnic-flute.png": "Gyermek fellépése egy alapítványi rendezvényen",
    "event-gala-checkin.jpg": "Regisztráció egy alapítványi rendezvényen",
    "story-noel.webp": "Noel, akit az Alapítvány támogat",
    "story-fnoel.webp": "F. Noel, akit az Alapítvány támogat",
    "story-kamilla.webp": "Kamilla, akit az Alapítvány támogat",
    "story-anna.webp": "Fejlesztő terápián részt vevő kislány",
    "ambassador-gyorfi-pal.jpg": "Győrfi Pál portréja",
    "ambassador-racz-jeno.jpg": "Rácz Jenő portréja",
    "ambassador-kucsera-gabor.jpg": "Kucsera Gábor portréja",
    "ambassador-proksa-szandra.jpg": "Proksa Szandra portréja",
    "ambassador-kovacs-dobos-evelin.jpg": "Kovács-Dobos Evelin portréja",
    "ambassador-andrasfi-tibor.jpg": "Andrásfi Tibor portréja",
    "founder.jpg": "Hajós István, az alapítvány alapítója",
    "partner-01-bastion.png": "Bastion logó",
    "partner-02.png": "Kiemelt partner logó",
    "partner-03-daewoo.png": "Daewoo logó",
    "partner-04-lipoti.png": "Lipóti Pékség logó",
    "partner-05-hsbc.png": "HSBC logó",
    "partner-06-pizzame.png": "Pizza ME logó",
    "partner-07-hardrock.png": "Hard Rock Cafe Budapest logó",
    "partner-08-bullrent.png": "BullRent Autókölcsönző logó",
    "partner-09-poseidon.png": "POSeidon IT & Security Solutions logó",
    "partner-10-justicesecurity.png": "Justice Security logó",
    "simplepay_logo.svg": "SimplePay by OTP Mobil",
    "hero.webp": "Mosolygó kislány hintán",
    "editorial-big.webp": "Furulyázó kislány egy alapítványi rendezvényen",
    "editorial-small1.webp": "Kislány ünnepi ruhában",
    "editorial-small2.webp": "Kisfiú manójelmezben karácsonykor",
    "about.webp": "Az Egy Lépéssel Több Alapítvány rendezvénye",
    "why-important.webp": "Kislány fejlesztő terápián",
}
MIME = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml"}

media = json.load(open(OUT)) if os.path.exists(OUT) else {}
for name, alt in ALT.items():
    if name in media and media[name].get("alt_pending"):
        rest("POST", f"wp/v2/media/{media[name]['id']}", {"alt_text": alt, "title": alt})
        media[name].pop("alt_pending")
    if name in media:
        continue
    path = os.path.join(IMG, name)
    data = open(path, "rb").read()
    upload_name, mime = name, MIME[os.path.splitext(name)[1]]
    if name == "event-picnic-flute.png":  # 5 MB PNG photo → web JPG
        im = Image.open(io.BytesIO(data)).convert("RGB")
        im.thumbnail((2000, 2000))
        buf = io.BytesIO(); im.save(buf, "JPEG", quality=84, optimize=True, progressive=True)
        data, upload_name, mime = buf.getvalue(), "event-picnic-flute.jpg", "image/jpeg"
    try:
        res = rest("POST", "wp/v2/media", raw=data, headers={"Content-Type": mime, "Content-Disposition": f'attachment; filename="elt-{upload_name}"'})
    except RuntimeError as e:
        print("FAILED", name, e); continue
    media[name] = {"id": res["id"], "url": res["source_url"], "alt_pending": True}
    json.dump(media, open(OUT, "w"), indent=1, ensure_ascii=False)
    rest("POST", f"wp/v2/media/{res['id']}", {"alt_text": alt, "title": alt})
    media[name].pop("alt_pending")
    json.dump(media, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(name, res["id"], res["source_url"])
print(len(media), "items")
