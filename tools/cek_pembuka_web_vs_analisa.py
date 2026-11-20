"""Bandingkan saldo pembuka 2026 di web dengan Saldo Kas Akhir sheet Analisa.
Fokus: total per kantor, bukan per pos, karena pemetaan pos sudah diuji terpisah.
"""
import json
import urllib.request
from collections import defaultdict
import openpyxl

TOKEN = "0f3de460-b64b-4fda-bc3b-8c5dc58cac45"
URL = "https://lazdigital.my.id/api/rpc"
XLSX = r"C:\Users\T14s G1 AMD R5 4560U\Downloads\Telegram Desktop\[2025] DATA-transaksi.xlsx"


def rpc(fn, args):
    req = urllib.request.Request(
        URL,
        data=json.dumps({"fn": fn, "args": args}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        j = json.load(r)
    if "__error" in j:
        raise RuntimeError(fn + ": " + j["__error"])
    return j["result"]


wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
per_excel = defaultdict(float)
for r in wb["Analisa"].iter_rows(min_row=3, values_only=True):
    if not r or not r[1]:
        continue
    per_excel[str(r[1]).strip()] += float(r[10] or 0)

web = {}
for fn, arg in (("apiSaldoDaerahRinci", "2026-11-20"),):
    for k in rpc(fn, [TOKEN, arg])["daftar"]:
        web[k["nama"]] = k["pembuka"]
for gol in ("kll", "ull"):
    for k in rpc("apiSaldoKantorRinci", [TOKEN, "2026-11-20", gol])["daftar"]:
        web[k["nama"]] = k["pembuka"]

# KLL RS PKU belum konsolidasi: saldonya ikut Daerah.
pku = sum(v for n, v in per_excel.items() if "PKU" in n.upper())
per_excel = {n: v for n, v in per_excel.items() if "PKU" not in n.upper()}
per_excel["DAERAH Bantul"] = per_excel.get("DAERAH Bantul", 0.0) + pku

gabung = defaultdict(float)
for n, v in per_excel.items():
    key = n.upper().replace("PENGHIMPUNAN DAERAH", "DAERAH BANTUL")
    gabung[key] += v
webkey = {n.upper(): v for n, v in web.items()}

print(f"{'kantor':38s}{'excel':>18s}{'web':>18s}{'beda':>14s}")
beda_total = 0.0
for key in sorted(set(gabung) | set(webkey)):
    a, b = gabung.get(key, 0.0), webkey.get(key, 0.0)
    d = b - a
    if abs(d) > 1:
        beda_total += d
        print(f"{key[:37]:38s}{a:18,.0f}{b:18,.0f}{d:14,.0f}  <<<")
print(f"\ntotal excel {sum(gabung.values()):,.2f}")
print(f"total web   {sum(webkey.values()):,.2f}")
print(f"selisih     {sum(webkey.values()) - sum(gabung.values()):,.2f}")
print(f"jumlah kantor excel {len(gabung)} web {len(webkey)}")
