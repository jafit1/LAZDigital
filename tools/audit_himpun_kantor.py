"""Audit penghimpunan per kantor: replikasi aturan engine + kanonik nama."""
import json
import re
import urllib.request
from collections import defaultdict

TOKEN = "0f3de460-b64b-4fda-bc3b-8c5dc58cac45"
URL = "https://lazdigital.my.id/api/rpc"
SAMPAI = "2026-11-20"


def rpc(fn, args):
    req = urllib.request.Request(
        URL,
        data=json.dumps({"fn": fn, "args": args}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        j = json.load(r)
    if "__error" in j:
        raise RuntimeError(fn + ": " + j["__error"])
    return j["result"]


def gabung_daerah(teks):
    t = str(teks or "").lower()
    if re.search(r"palestin|gaza|falastin|ntt|nusa tenggara|gempa|sumatera|sumatra|banjir|bencana", t):
        return True
    return bool(re.search(r"aceh", t)) and bool(re.search(r"korban|bencana|banjir|gempa|sumatera|kemanusiaan", t))


def ke_daerah_saja(nama):
    return bool(re.search(r"rs\.?\s*pku", str(nama or ""), re.I))


GANTI = [
    (r"^ull\s+ull\s+", "ULL "),
    (r"mts\s+muhammadiyah\s+kasihan", "MTs Kasihan"),
    (r"smp\s+muh\s*2\s+bambanglipuro", "SMP Muhammadiyah 2 Bambanglipuro"),
    (r"smk\s+muh\s+imogiri", "SMK Muhammadiyah 1 Imogiri"),
    (r"smk\s+muh\s+bambanglipuro", "SMK Muhammadiyah 1 Bambang"),
    (r"smk\s+muh\s+1\s+bantul", "SMK Muhammadiyah 1 Bantul"),
    (r"masjid\s+at\s+taqwa", "Masjid At Taqwa Gluntung"),
]


def kata(s):
    s = str(s or "").lower()
    s = re.sub(r"^(kll|ull)\s+", "", s)
    s = s.replace("muhammadiyah", "muh")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return [x for x in s.split() if x]


def kanonik(nama, daftar):
    n = str(nama or "").strip()
    if not n:
        return "DAERAH Bantul"
    if re.match(r"^penghimpunan daerah$", n, re.I) or re.match(r"^daerah\b", n, re.I):
        return "DAERAH Bantul"
    if n in daftar:
        return n
    for pola, ganti in GANTI:
        n = re.sub(pola, ganti, n, flags=re.I)
    if n in daftar:
        return n
    a = kata(n)
    terbaik, skor = "", 0.0
    for k in daftar:
        b = kata(k)
        sama = sum(1 for x in b if x in a)
        nilai = sama / max(1, min(len(a), len(b)))
        if nilai > skor:
            skor, terbaik = nilai, k
    return terbaik if skor >= 0.7 else nama


web = {}
for g in ("kll", "ull"):
    for k in rpc("apiSaldoKantorRinci", [TOKEN, SAMPAI, g])["daftar"]:
        web[k["nama"]] = sum(p["himpun"] for p in k["dana"])
for k in rpc("apiSaldoDaerahRinci", [TOKEN, SAMPAI])["daftar"]:
    web[k["nama"]] = sum(p["himpun"] for p in k["dana"])

kol, baris = (lambda r: (r["kolom"], r["baris"]))(rpc("apiListPenghimpunanPadat", [TOKEN]))
ix = {k: i for i, k in enumerate(kol)}
peta = {}
for l in rpc("apiListLayanan", [TOKEN]):
    if l.get("id"):
        peta[str(l["id"])] = ("ULL " if str(l.get("tipe", "")).upper() == "ULL" else "KLL ") + str(l.get("nama", ""))

h = defaultdict(float)
for b in baris:
    tgl = str(b[ix["tanggal"]] or "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", tgl) or tgl > SAMPAI:
        continue
    nama = kanonik(peta.get(str(b[ix["layananId"]] or ""), "Penghimpunan Daerah"), list(web))
    teks = " ".join(str(b[ix[c]] or "") for c in ("keterangan", "program", "pilar") if c in ix)
    if gabung_daerah(teks) or ke_daerah_saja(nama):
        nama = "DAERAH Bantul"
    h[nama] += float(b[ix["jumlah"]] or 0)

print(f"{'kantor':38s}{'tabel':>18s}{'web':>18s}{'beda':>14s}")
for n in sorted(set(h) | set(web)):
    a, b = h.get(n, 0.0), web.get(n, 0.0)
    tanda = "  <<<" if abs(a - b) > 1 else ""
    if tanda or n not in web or n not in h:
        print(f"{n[:37]:38s}{a:18,.0f}{b:18,.0f}{b-a:14,.0f}{tanda}")
print("total tabel", f"{sum(h.values()):,.2f}", "| total web", f"{sum(web.values()):,.2f}")
print("kantor hanya di tabel:", [n for n in h if n not in web])
