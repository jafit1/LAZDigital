"""Audit: apakah saldo awal per kantor/pos, penghimpunan, dan pentasyarufan di web
benar-benar sama dengan sumbernya."""
import json
import re
import urllib.request
from collections import defaultdict

import openpyxl

TOKEN = "0f3de460-b64b-4fda-bc3b-8c5dc58cac45"
URL = "https://lazdigital.my.id/api/rpc"
SAMPAI = "2026-11-20"
XLSX = r"C:\Users\T14s G1 AMD R5 4560U\Downloads\Telegram Desktop\[2025] DATA-transaksi.xlsx"


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


def padat(fn):
    r = rpc(fn, [TOKEN])
    kol = r["kolom"]
    return kol, r["baris"]


def gabung_daerah(teks):
    t = str(teks or "").lower()
    if re.search(r"palestin|gaza|falastin|ntt|nusa tenggara|gempa|sumatera|sumatra|banjir|bencana", t):
        return True
    return bool(re.search(r"aceh", t)) and bool(re.search(r"korban|bencana|banjir|gempa|sumatera|kemanusiaan", t))


def ke_daerah_saja(nama):
    return bool(re.search(r"rs\.?\s*pku", str(nama or ""), re.I))


# ---------- 1. SALDO AWAL per kantor per pos ----------
print("=== 1. SALDO AWAL 2026 PER KANTOR & POS ===")
web_awal = rpc("apiDaftarSaldoAwalAnalisa", [TOKEN, "2026"])["baris"]
w = defaultdict(float)
for b in web_awal:
    nama = b["nama"]
    if ke_daerah_saja(nama):
        nama = "DAERAH Bantul"
    w[(nama, b["dana"])] += float(b["nominal"])

wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
x = defaultdict(float)
for r in wb["Analisa"].iter_rows(min_row=3, values_only=True):
    if not r or not r[1]:
        continue
    nama = str(r[1]).strip()
    if ke_daerah_saja(nama):
        nama = "DAERAH Bantul"
    x[(nama, str(r[3]).strip())] += float(r[10] or 0)

x = {k: v for k, v in x.items() if abs(v) > 0.5}
print("pos bernilai di sheet:", len(x), "di web:", len(w))
print("total sheet", f"{sum(x.values()):,.2f}", "| total web", f"{sum(w.values()):,.2f}")
beda = []
for k in set(x) | set(w):
    d = w.get(k, 0.0) - x.get(k, 0.0)
    if abs(d) > 1:
        beda.append((k, x.get(k, 0.0), w.get(k, 0.0), d))
print("pos berselisih > Rp1:", len(beda))
for k, a, b, d in beda[:20]:
    print(f"   {k[0][:32]:34s} {k[1]:18s} sheet {a:15,.2f} web {b:15,.2f} beda {d:13,.2f}")

# ---------- 2. PENGHIMPUNAN 2026 ----------
print("\n=== 2. PENGHIMPUNAN 2026 ===")
kol, baris = padat("apiListPenghimpunanPadat")
ix = {k: i for i, k in enumerate(kol)}
lay = rpc("apiListLayanan", [TOKEN])
peta = {}
for l in lay:
    if l.get("id"):
        peta[str(l["id"])] = ("ULL " if str(l.get("tipe", "")).upper() == "ULL" else "KLL ") + str(l.get("nama", ""))

h = defaultdict(float)
dilewat_tanggal = 0
tanpa_layanan = 0
for b in baris:
    tanggal = str(b[ix["tanggal"]] or "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", tanggal) or tanggal > SAMPAI:
        dilewat_tanggal += 1
        continue
    nama = peta.get(str(b[ix["layananId"]] or ""), "Penghimpunan Daerah")
    if not b[ix["layananId"]]:
        tanpa_layanan += 1
    teks = " ".join(str(b[ix[c]] or "") for c in ("keterangan", "program", "pilar") if c in ix)
    if gabung_daerah(teks) or ke_daerah_saja(nama):
        nama = "DAERAH Bantul"
    h[nama] += float(b[ix["jumlah"]] or 0)

tot_himpun_web = defaultdict(float)
for g in ("kll", "ull"):
    for k in rpc("apiSaldoKantorRinci", [TOKEN, SAMPAI, g])["daftar"]:
        tot_himpun_web[k["nama"]] = sum(p["himpun"] for p in k["dana"])
for k in rpc("apiSaldoDaerahRinci", [TOKEN, SAMPAI])["daftar"]:
    tot_himpun_web[k["nama"]] = sum(p["himpun"] for p in k["dana"])

print("baris tabel:", len(baris), "| dilewat (tanggal/kedaluwarsa):", dilewat_tanggal, "| tanpa layananId:", tanpa_layanan)
print("total baris terpakai", f"{sum(h.values()):,.2f}", "| total web", f"{sum(tot_himpun_web.values()):,.2f}")
sel = [(n, h.get(n, 0.0), v) for n, v in tot_himpun_web.items() if abs(h.get(n, 0.0) - v) > 1]
print("kantor berselisih > Rp1:", len(sel))
for n, a, b in sorted(sel, key=lambda z: -abs(z[1] - z[2]))[:15]:
    print(f"   {n[:34]:36s} tabel {a:16,.2f} web {b:16,.2f} beda {b-a:14,.2f}")

# ---------- 3. PENTASYARUFAN 2026 ----------
print("\n=== 3. PENTASYARUFAN 2026 ===")
kol2, baris2 = padat("apiListPentasyarufanPadat")
ix2 = {k: i for i, k in enumerate(kol2)}
dipakai = 0.0
n_dipakai = 0
n_ump = 0
nil_ump = 0.0
dilewat_tanggal2 = 0
for b in baris2:
    tanggal = str(b[ix2["tanggal"]] or "")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", tanggal) or tanggal > SAMPAI:
        dilewat_tanggal2 += 1
        continue
    seksi = str(b[ix2["section"]] or "")
    prog = str(b[ix2["program"]] or "")
    nilai = float(b[ix2["jumlah"]] or 0)
    if re.match(r"^(UMP|LPJ)\b", seksi, re.I) or re.match(r"^(UMP|LPJ)\b", prog, re.I):
        n_ump += 1
        nil_ump += nilai
        continue
    n_dipakai += 1
    dipakai += nilai

tot_salur_web = 0.0
for g in ("kll", "ull"):
    for k in rpc("apiSaldoKantorRinci", [TOKEN, SAMPAI, g])["daftar"]:
        tot_salur_web += sum(p["salur"] for p in k["dana"])
for k in rpc("apiSaldoDaerahRinci", [TOKEN, SAMPAI])["daftar"]:
    tot_salur_web += sum(p["salur"] for p in k["dana"])

print("baris tabel:", len(baris2), "| dilewat tanggal:", dilewat_tanggal2)
print("dipakai sbg penyaluran:", n_dipakai, "baris", f"{dipakai:,.2f}")
print("dilewat sbg UMP/LPJ:", n_ump, "baris", f"{nil_ump:,.2f}")
print("total web:", f"{tot_salur_web:,.2f}", "| selisih:", f"{tot_salur_web - dipakai:,.2f}")
