import openpyxl
from collections import defaultdict

f = r"C:\Users\T14s G1 AMD R5 4560U\Downloads\Telegram Desktop\[2025] DATA-transaksi.xlsx"
wb = openpyxl.load_workbook(f, data_only=True, read_only=True)
rows = list(wb["Analisa"].iter_rows(values_only=True))
data = []
for i, r in enumerate(rows[2:], 3):
    if not r or not r[1]:
        continue
    data.append(dict(baris=i, nama=str(r[1]).strip(), dana=str(r[3]).strip(),
                     awal=float(r[5] or 0), himpun=float(r[6] or 0), amil=float(r[7] or 0),
                     salur=float(r[8] or 0), umk=float(r[9] or 0), akhir=float(r[10] or 0)))

amil_masuk = defaultdict(float)
for x in data:
    amil_masuk[x["nama"]] += x["amil"]

print("=== UJI RUMUS DENGAN HAK AMIL MASUK KE DANA AMIL ===")
buruk = []
for x in data:
    tambah = amil_masuk[x["nama"]] if x["dana"] == "Amil" else 0.0
    kira = x["awal"] + x["himpun"] - x["amil"] - x["salur"] - x["umk"] + tambah
    if abs(kira - x["akhir"]) > 0.05:
        buruk.append((x, kira, tambah))
print("baris tidak cocok:", len(buruk), "dari", len(data))
for x, kira, tambah in buruk[:30]:
    print(f'{x["baris"]:4d} {x["nama"][:30]:30s} {x["dana"][:20]:20s} akhir {x["akhir"]:15,.2f} kira {kira:15,.2f} beda {x["akhir"]-kira:13,.2f} amilMasuk {tambah:13,.2f}')

print()
print("=== TOTAL ===")
for k in ["awal", "himpun", "amil", "salur", "umk", "akhir"]:
    print(k, f"{sum(x[k] for x in data):,.2f}")
print("baris row1:", rows[0][4:])

print()
print("=== SALDO AWAL SHEET vs ANALISA (kunci ID-dana persis) ===")
sa = defaultdict(float)
for r in wb["Saldo Awal"].iter_rows(min_row=2, values_only=True):
    if not r or not r[1]:
        continue
    sa[(str(r[1]).strip(), str(r[2]).strip())] += float(r[5] or 0)
buruk2 = []
for x in data:
    if x["awal"] == 0:
        continue
    v = sa.get((x["nama"], x["dana"]), 0.0)
    if abs(v - x["awal"]) > 0.05:
        buruk2.append((x, v))
print("tidak cocok:", len(buruk2))
for x, v in buruk2[:20]:
    print(f'  {x["nama"][:28]:28s} {x["dana"]:22s} analisa {x["awal"]:14,.2f} sheet {v:14,.2f}')

print()
print("=== SALDO AKHIR PER DAERAH / KLL / ULL ===")
per = defaultdict(float)
for x in data:
    per[x["nama"]] += x["akhir"]
for n, v in sorted(per.items(), key=lambda z: -z[1]):
    print(f"{n[:45]:45s} {v:18,.2f}")
print("GRAND TOTAL", f"{sum(per.values()):,.2f}")
