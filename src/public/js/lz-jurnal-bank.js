/* lz-jurnal-bank.js - Pembuat Jurnal dari Rekening Koran Bank
 *
 * Mendukung pembacaan rekening koran BPD DIY Syariah dan BSI (PDF).
 * Alur kerja:
 *   1. Deteksi nomor rekening dari dokumen dan verifikasi dengan rekening sistem
 *   2. Ekstraksi mutasi debet/kredit per baris
 *   3. Penyesuaian nama KLL/ULL, Setor Tunai, pemilihan pilar, dan pecah rincian UMP
 *   4. Hasil: Unduh Excel Jurnal (.xlsx), salin TSV, atau impor langsung ke sistem
 *
 * Tanpa berkas baru di api/ (batas 12 Vercel terjaga).
 */
'use strict';

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LZJurnalBank = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {

  var PILAR = [
    'Pendidikan',
    'Kesehatan',
    'Ekonomi & Pemberdayaan',
    'Sosial Kemanusiaan',
    'Dakwah & Advokasi',
    'Keagamaan',
    'Lingkungan',
    'Kelembagaan'
  ];

  var BULAN_MAP = {
    'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'mei': '05', 'jun': '06',
    'jul': '07', 'agu': '08', 'agt': '08', 'sep': '09', 'okt': '10', 'nov': '11', 'des': '12',
    'aug': '08', 'oct': '10', 'dec': '12'
  };

  function normalTanggal(str) {
    if (!str) return '';
    str = String(str).trim();
    var m1 = str.match(/^(\d{2})[\/\-]([A-Za-z]{3})[\/\-](\d{4})$/);
    if (m1) {
      var bln = BULAN_MAP[m1[2].toLowerCase()] || '01';
      return m1[3] + '-' + bln + '-' + m1[1];
    }
    var m2 = str.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m2) {
      return m2[3] + '-' + m2[2] + '-' + m2[1];
    }
    var m3 = str.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
    if (m3) {
      return m3[1] + '-' + m3[2] + '-' + m3[3];
    }
    return str;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rp(n) {
    return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  }

  /* -------------------------------------------------------------
     A. DETEKSI & PENCOCOKAN NOMOR REKENING
     ------------------------------------------------------------- */
  function deteksiRekening(teks, bankHint) {
    teks = String(teks || '');
    var bank = String(bankHint || '').toLowerCase();
    var nomor = '';
    var periode = '';

    var mBpd = teks.match(/(\d{10,16})\s*\n\s*No\.\s*Rekening/i) ||
               teks.match(/No\.\s*Rekening\s*[:\n\s]*(\d{10,16})/i) ||
               teks.match(/No\.\s*Rekening[\s\S]{0,40}?(\d{10,16})/i);

    var mBsi = teks.match(/REKENING\s*:\s*[A-Z]*\s*(\d{10,16})/i) ||
               teks.match(/(\d{10,16})\s*-\s*BSI/i) ||
               teks.match(/Rekening\s*[:\s]+(\d{10,16})/i);

    if (bank === 'bpd' && mBpd) {
      nomor = mBpd[1];
    } else if (bank === 'bsi' && mBsi) {
      nomor = mBsi[1];
    } else if (mBpd) {
      nomor = mBpd[1];
      bank = 'bpd';
    } else if (mBsi) {
      nomor = mBsi[1];
      bank = 'bsi';
    }

    var mPeriode = teks.match(/Hari ini\s*\(\s*([^\)]+)\s*\)/i) ||
                   teks.match(/Periode\s*:\s*([^\r\n]+)/i);
    if (mPeriode) {
      periode = mPeriode[1].trim();
    }

    return {
      nomor: nomor,
      bank: bank,
      periode: periode
    };
  }

  function cocokkanRekening(nomor, daftarRekening) {
    if (!nomor || !Array.isArray(daftarRekening)) return null;
    var normTarget = String(nomor).replace(/\D/g, '');
    if (!normTarget) return null;

    for (var i = 0; i < daftarRekening.length; i++) {
      var r = daftarRekening[i];
      if (!r) continue;
      var normR = String(r.nomor || '').replace(/\D/g, '');
      if (normR && (normR === normTarget || normTarget.endsWith(normR) || normR.endsWith(normTarget))) {
        return r;
      }
    }
    return null;
  }

  /* -------------------------------------------------------------
     B. EKSTRAKSI TEKS DARI PDF MENGGUNAKAN PDF.JS LOKAL
     ------------------------------------------------------------- */
  function muatPdfJs(callback) {
    if (typeof window === 'undefined') {
      if (callback) callback(null);
      return;
    }
    if (window.pdfjsLib) {
      if (callback) callback(window.pdfjsLib);
      return;
    }
    var s = document.createElement('script');
    s.src = '/js/vendor/pdf.min.js';
    s.onload = function() {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/vendor/pdf.worker.min.js';
      }
      if (callback) callback(window.pdfjsLib);
    };
    s.onerror = function() {
      if (callback) callback(null);
    };
    document.head.appendChild(s);
  }

  async function ekstrakHalamanPdf(doc, pageNum) {
    var page = await doc.getPage(pageNum);
    var content = await page.getTextContent();
    return content.items.map(function(it) {
      return {
        str: it.str.trim(),
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        h: it.height
      };
    }).filter(function(it) { return it.str; });
  }

  /* -------------------------------------------------------------
     C. PARSER REKENING KORAN BPD DIY SYARIAH
     ------------------------------------------------------------- */
  async function parseBpdPdf(doc) {
    var noRek = '';
    var periode = '';
    var rawTx = [];

    for (var pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      var items = await ekstrakHalamanPdf(doc, pageNum);

      if (pageNum === 1) {
        for (var i = 0; i < items.length; i++) {
          if (/No\.\s*Rekening/i.test(items[i].str)) {
            for (var j = Math.max(0, i - 4); j <= Math.min(items.length - 1, i + 4); j++) {
              if (/^\d{10,16}$/.test(items[j].str)) noRek = items[j].str;
            }
          }
          if (/Hari ini\s*\(\s*([^\)]+)\s*\)/i.test(items[i].str)) {
            var mP = items[i].str.match(/Hari ini\s*\(\s*([^\)]+)\s*\)/i);
            if (mP) periode = mP[1].trim();
          }
        }
      }

      var contentItems = items.filter(function(it) {
        return it.y <= 685 && !['Tgl Transaksi', 'Keterangan', 'Debet', 'Kredit', 'Jumlah Saldo', 'Mutasi Rekening'].includes(it.str);
      });

      var dateItems = contentItems.filter(function(it) {
        return it.x < 110 && /^\d{2}-[A-Za-z]{3}-\d{4}$/.test(it.str);
      }).sort(function(a, b) { return b.y - a.y; });

      for (var dIdx = 0; dIdx < dateItems.length; dIdx++) {
        var curDate = dateItems[dIdx];
        var nextDate = dateItems[dIdx + 1];
        var minY = nextDate ? nextDate.y + 4 : 0;
        var maxY = curDate.y + 14;

        var txItems = contentItems.filter(function(it) {
          return it.y >= minY && it.y <= maxY;
        });

        txItems.sort(function(a, b) {
          if (Math.abs(b.y - a.y) > 4) return b.y - a.y;
          return a.x - b.x;
        });

        var tx = {
          id: 'bpd_' + pageNum + '_' + (dIdx + 1),
          tanggal: normalTanggal(curDate.str),
          uraian: '',
          debet: 0,
          kredit: 0,
          saldo: 0
        };

        txItems.forEach(function(it) {
          if (it === curDate) return;
          if (/^[\d\.]+,\d{2}$/.test(it.str)) {
            var val = parseFloat(it.str.replace(/\./g, '').replace(',', '.'));
            if (it.x < 365) tx.debet = val;
            else if (it.x < 460) tx.kredit = val;
            else tx.saldo = val;
          } else if (it.x >= 110 && it.x < 265) {
            tx.uraian += (tx.uraian ? ' ' : '') + it.str;
          }
        });

        rawTx.push(tx);
      }
    }

    return {
      bank: 'bpd',
      noRek: noRek,
      periode: periode,
      transaksi: rawTx
    };
  }

  /* -------------------------------------------------------------
     D. PARSER REKENING KORAN BSI (BANK SYARIAH INDONESIA)
     ------------------------------------------------------------- */
  async function parseBsiPdf(doc) {
    var noRek = '';
    var periode = '';
    var rawTx = [];

    for (var pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      var items = await ekstrakHalamanPdf(doc, pageNum);

      if (pageNum === 1) {
        for (var i = 0; i < items.length; i++) {
          var mR = items[i].str.match(/REKENING\s*:\s*[A-Z]*\s*(\d{10,16})/i) || items[i].str.match(/(\d{10,16})\s*-\s*BSI/i);
          if (mR) noRek = mR[1];
          var mP = items[i].str.match(/Periode\s*:\s*([^\r\n]+)/i);
          if (mP) periode = mP[1].trim();
        }
      }

      var contentItems = items.filter(function(it) { return it.y <= 495; });
      var rowNumItems = contentItems.filter(function(it) {
        return it.x < 65 && /^\d+$/.test(it.str);
      }).sort(function(a, b) { return b.y - a.y; });

      for (var rIdx = 0; rIdx < rowNumItems.length; rIdx++) {
        var curRow = rowNumItems[rIdx];
        var nextRow = rowNumItems[rIdx + 1];
        var minY = nextRow ? nextRow.y + 4 : 0;
        var maxY = curRow.y + 8;

        var txItems = contentItems.filter(function(it) {
          return it.y >= minY && it.y <= maxY;
        }).sort(function(a, b) { return a.x - b.x; });

        var tanggal = '';
        var jam = '';
        var ref = '';
        var pengirim = '';
        var deskripsi = '';
        var debet = 0;
        var kredit = 0;
        var saldo = 0;

        txItems.forEach(function(it) {
          if (it === curRow) return;
          if (it.x >= 65 && it.x < 155) {
            if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(it.str)) tanggal = normalTanggal(it.str);
            else if (/^\d{2}\.\d{2}$/.test(it.str)) jam = it.str;
          } else if (it.x >= 155 && it.x < 250) {
            ref += (ref ? ' ' : '') + it.str;
          } else if (it.x >= 250 && it.x < 425) {
            pengirim += (pengirim ? ' ' : '') + it.str;
          } else if (it.x >= 650 && it.x < 830) {
            deskripsi += (deskripsi ? ' ' : '') + it.str;
          } else if (it.x >= 830 && it.x < 905 && /^[\d,]+\.\d{2}$/.test(it.str)) {
            debet = parseFloat(it.str.replace(/,/g, ''));
          } else if (it.x >= 905 && it.x < 995 && /^[\d,]+\.\d{2}$/.test(it.str)) {
            kredit = parseFloat(it.str.replace(/,/g, ''));
          } else if (it.x >= 995 && /^[\d,]+\.\d{2}$/.test(it.str)) {
            saldo = parseFloat(it.str.replace(/,/g, ''));
          }
        });

        var uraianLengkap = [deskripsi, pengirim].filter(Boolean).join(' - ');
        if (!uraianLengkap) uraianLengkap = 'Transaksi BSI ' + (ref || curRow.str);

        rawTx.push({
          id: 'bsi_' + pageNum + '_' + curRow.str,
          tanggal: tanggal,
          jam: jam,
          ref: ref,
          pengirim: pengirim,
          deskripsi: deskripsi,
          uraian: uraianLengkap,
          debet: debet,
          kredit: kredit,
          saldo: saldo
        });
      }
    }

    return {
      bank: 'bsi',
      noRek: noRek,
      periode: periode,
      transaksi: rawTx
    };
  }

  /* -------------------------------------------------------------
     E. ANALISIS DAN PENYESUAIAN BARIS JURNAL
     ------------------------------------------------------------- */
  function bersihkanUraianBank(teks) {
    if (!teks) return '';
    var s = String(teks).trim();
    s = s.replace(/\bCMS\s*ID:\s*[\w\d]+/gi, '');
    s = s.replace(/\bREF:\s*[\w\d\-\.\/]+/gi, '');
    s = s.replace(/\bRRN\.?\s*[\w\d\-]+/gi, '');
    s = s.replace(/\bTRM\s+[A-Z0-9]+\b/gi, '');
    s = s.replace(/\bSKN\s+\d+[\s\-]+[A-Z0-9]+\b/gi, '');
    s = s.replace(/\b[A-Z0-9]{14,35}\b/gi, '');
    s = s.replace(/\b\d{4,}-\d{4,}\b/g, '');
    s = s.replace(/\b\d{8,24}\b/g, '');
    s = s.replace(/\bBIFAST\s*-\s*TRF\s*Dari\s*-\s*/gi, 'TRF DARI ');
    s = s.replace(/\bTRF\s*Dari\s*-\s*/gi, 'TRF DARI ');
    s = s.replace(/\bTRF\.\s*DARI\b/gi, 'TRF DARI ');
    s = s.replace(/\bTRF\.\s*KE\b/gi, 'TRF KE ');
    s = s.replace(/[\/\\]+/g, ' ');
    s = s.replace(/\s*-\s*-\s*/g, ' - ');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/^[-—\s]+|[-—\s]+$/g, '');
    return s;
  }

  function cariKantorDariTeks(teks, daftarLayanan) {
    if (!teks || !Array.isArray(daftarLayanan)) return null;
    var tLow = teks.toLowerCase();

    for (var i = 0; i < daftarLayanan.length; i++) {
      var l = daftarLayanan[i];
      if (!l || !l.nama) continue;
      var nLow = l.nama.toLowerCase();
      if (tLow.indexOf(nLow) >= 0) {
        var prefix = (l.tipe || 'KLL').toUpperCase();
        return prefix + ' ' + l.nama;
      }
    }
    if (/\b(kl|kll)\s*pdg\b/i.test(teks)) return 'KLL Pundong';
    if (/\b(kl|kll)\s*btl\b/i.test(teks)) return 'KLL Bantul Kota';
    if (/\b(kl|kll)\s*img\b/i.test(teks)) return 'KLL Imogiri';
    if (/\b(kl|kll)\s*srd\b/i.test(teks)) return 'KLL Srandakan';
    if (/\b(kl|kll)\s*pjg\b/i.test(teks)) return 'KLL Pajangan';

    return null;
  }

  function ekstrakNamaDanDetail(raw, pengirimBsi, tipe, listLayanan, defaultFund) {
    raw = String(raw || '').trim();
    var uLow = raw.toLowerCase();

    // 1. QRIS: otomatis nama NN, detail Qris
    if (uLow.indexOf('qris') >= 0 || uLow.indexOf('qr ') >= 0 || /^qr\s+\d+/i.test(raw)) {
      return {
        nama: 'NN',
        detail: 'Qris',
        kantor: '',
        tipe: 'himpun'
      };
    }

    var kantor = cariKantorDariTeks(raw, listLayanan);
    var clean = bersihkanUraianBank(raw);
    var nama = '';
    var detail = '';

    // 2. Setor Tunai
    if (tipe === 'setor' || uLow.indexOf('str tunai') >= 0 || uLow.indexOf('setor tunai') >= 0 || uLow.indexOf('setoran tunai') >= 0) {
      var sisa = clean.replace(/\b(str\s*tunai|setor\s*tunai|setoran\s*tunai)[\/:\s]*/gi, '').trim();
      sisa = sisa.replace(/\b(BTL|IMG)\b/g, '').replace(/[\/\\]+/g, ' ').trim();
      detail = 'Setor Tunai';
      if (kantor) {
        nama = kantor;
        if (sisa && sisa.toLowerCase() !== kantor.toLowerCase()) detail += ' ' + sisa;
      } else if (sisa) {
        nama = sisa;
      } else {
        nama = 'Setor Tunai ' + (defaultFund === 'Zakat' ? 'Kas Zakat' : 'Kas Infak');
      }
      return { nama: nama, detail: detail, kantor: kantor, tipe: 'setor' };
    }

    // 3. UMP Program
    if (tipe === 'ump' || uLow.indexOf('ump') >= 0) {
      nama = kantor || 'KLL';
      var sisaUmp = clean.replace(/\bTRF\.?\s*KE\s*/gi, '').replace(/\bUMP\s+(KLL|ULL)?\s*/gi, '').trim();
      detail = sisaUmp || 'UMP Program';
      return { nama: nama, detail: detail, kantor: kantor, tipe: 'ump' };
    }

    // 4. BSI dengan pengirim terstruktur
    if (pengirimBsi) {
      var p = pengirimBsi.replace(/Bank\s+[A-Za-z\s]+$/i, '').replace(/BPD\s+DI\s+Yogyakarta/i, '').trim();
      p = p.replace(/^TRF\s*Dari\s*-\s*/i, '').trim();
      nama = p || pengirimBsi;

      var d = clean;
      d = d.replace(/\bBIFAST\s*-\s*TRF\s*Dari\s*-\s*.*$/i, '');
      d = d.replace(/\bTRF\s*Dari\s*-\s*.*$/i, '');
      d = d.replace(/[\/\\]+/g, ' ').trim();
      d = d.replace(/^[-—\s]+|[-—\s]+$/g, '');
      detail = d;
      return { nama: nama, detail: detail, kantor: kantor, tipe: tipe };
    }

    // 5. Pola TRF DARI di BPD
    var mTrf = clean.match(/TRF\.?\s*DARI[\s\-]+([A-Za-z\s]+?)(?=\s+TRF|\s+QRIS|\s+STR|\s+CMS|\s+REF|\s*$)/i);
    if (mTrf) {
      nama = mTrf[1].trim();
      var sisaTrf = clean.replace(mTrf[0], '').trim();
      sisaTrf = sisaTrf.replace(/[\/\\]+/g, ' ').replace(/^[-—\s]+|[-—\s]+$/g, '');
      detail = sisaTrf;
      if (kantor) {
        detail = nama + (detail ? ' ' + detail : '');
        nama = kantor;
      }
      return { nama: nama, detail: detail, kantor: kantor, tipe: tipe };
    }

    // 6. Pola slash di BPD
    if (clean.indexOf('/') >= 0 || raw.indexOf('/') >= 0) {
      var parts = (raw.indexOf('/') >= 0 ? raw : clean).split(/[\/\\]+/).map(function(x) { return x.trim(); }).filter(Boolean);
      if (parts.length >= 2) {
        var p0 = parts[0], p1 = parts[1], p2 = parts.slice(2).join(' ');
        if (/infaq|infak|zakat|donasi|nt-/i.test(p0) && !/infaq|infak|zakat/i.test(p1)) {
          nama = p1;
          detail = p0.replace(/^NT-/i, '') + (p2 ? ' ' + p2 : '');
        } else if (!/infaq|infak|zakat/i.test(p0) && /infaq|infak|zakat/i.test(p1)) {
          nama = p0;
          detail = p1 + (p2 ? ' ' + p2 : '');
        } else {
          nama = p0;
          detail = parts.slice(1).join(' ');
        }
        if (kantor) {
          if (nama.toLowerCase() !== kantor.toLowerCase()) detail = nama + (detail ? ' ' + detail : '');
          nama = kantor;
        }
        return { nama: nama, detail: detail, kantor: kantor, tipe: tipe };
      }
    }

    // 7. Pola kata kunci donasi/infak
    var mNama = clean.match(/(?:INFAK|INFAQ|ZAKAT|DONASI)\s+(?:UTAMA\s+)?([A-Za-z\s]+)/i);
    if (mNama) {
      nama = mNama[1].trim();
      detail = clean.replace(nama, '').trim();
    } else {
      nama = kantor || clean;
      detail = '';
    }

    nama = nama.replace(/^[-—\s]+|[-—\s]+$/g, '').trim();
    detail = detail.replace(/^[-—\s]+|[-—\s]+$/g, '').trim();
    return { nama: nama || 'Donatur', detail: detail, kantor: kantor, tipe: tipe };
  }

  function analisisTransaksi(barisMentah, opsi) {
    opsi = opsi || {};
    var rek = opsi.rekening || {};
    var listLayanan = opsi.layanan || [];
    var defaultFund = (rek.fundGroup || 'Infak');

    return (barisMentah || []).map(function(r, idx) {
      var debet = Number(r.debet) || 0;
      var kredit = Number(r.kredit) || 0;
      var nominal = kredit > 0 ? kredit : debet;
      var isMasuk = kredit > 0;
      var uraianAsli = r.uraianAsli || r.uraian || r.keterangan || r.deskripsi || '';
      var uraianBersih = bersihkanUraianBank(uraianAsli);

      var tipe = isMasuk ? 'himpun' : 'salur';
      var uLow = uraianAsli.toLowerCase();

      if (isMasuk && (uLow.indexOf('str tunai') >= 0 || uLow.indexOf('setor tunai') >= 0 || uLow.indexOf('setoran tunai') >= 0)) {
        tipe = 'setor';
      } else if (!isMasuk && (uLow.indexOf('ump') >= 0 || uLow.indexOf('uang muka program') >= 0)) {
        tipe = 'ump';
      } else if (!isMasuk && (uLow.indexOf('biaya') >= 0 || uLow.indexOf('skn') >= 0 || uLow.indexOf('adm ') >= 0 || uLow.indexOf('fee ') >= 0)) {
        tipe = 'biaya';
      }

      var info = ekstrakNamaDanDetail(uraianAsli, r.pengirim, tipe, listLayanan, defaultFund);
      var namaDonatur = r.namaDonatur || info.nama || 'Donatur';
      var detailJurnal = r.detailJurnal !== undefined ? r.detailJurnal : info.detail;
      var kantor = r.kantor !== undefined ? r.kantor : (info.kantor || '');
      if (info.tipe && !r.tipe) tipe = info.tipe;

      // Auto-categorization:
      // Zakat -> zakat
      // Setor -> setor
      // UMP -> ump
      // Biaya -> biaya
      // Default jika belum jelas: INFAK UMUM (tanpa pilar)
      var kat = r.kategori || '';
      var jenisDana = r.jenisDana || defaultFund;
      var subJenis = r.subJenis || 'Infak Umum';
      var pilar = r.pilar || '';

      if (!kat) {
        if (uLow.indexOf('zakat') >= 0) {
          kat = 'zakat';
          jenisDana = 'Zakat';
          subJenis = 'Zakat Mal';
          pilar = '';
        } else if (tipe === 'setor') {
          kat = 'setor';
          jenisDana = defaultFund;
          pilar = '';
        } else if (tipe === 'ump') {
          kat = 'ump';
          jenisDana = 'Infak';
          subJenis = 'Infak Terikat';
          pilar = 'Pendidikan';
        } else if (tipe === 'biaya') {
          kat = 'biaya';
          jenisDana = 'Infak';
          pilar = '';
        } else {
          // Belum jelas -> masuk ke infak umum dulu (tanpa pilar)
          kat = 'infak_umum';
          jenisDana = 'Infak';
          subJenis = 'Infak Umum';
          pilar = '';
        }
      }

      return {
        id: r.id || ('tx_' + idx),
        tanggal: r.tanggal,
        uraianAsli: uraianAsli,
        uraianBersih: uraianBersih || uraianAsli,
        namaDonatur: namaDonatur,
        detailJurnal: detailJurnal || '',
        debet: debet,
        kredit: kredit,
        nominal: nominal,
        isMasuk: isMasuk,
        tipe: tipe,
        kategori: kat,
        kantor: kantor,
        jenisDana: jenisDana,
        pilar: pilar,
        subJenis: subJenis,
        rincianUmp: r.rincianUmp || null,
        terpilih: r.terpilih !== undefined ? r.terpilih : true
      };
    });
  }

  function sesuaikanBaris(baris, perubahan) {
    if (!baris) return baris;
    var res = Object.assign({}, baris);
    perubahan = perubahan || {};

    if (perubahan.kategori !== undefined) {
      res.kategori = perubahan.kategori;
      if (res.kategori === 'zakat') {
        res.tipe = 'himpun';
        res.jenisDana = 'Zakat';
        res.subJenis = 'Zakat Mal';
        res.pilar = '';
      } else if (res.kategori === 'infak_umum') {
        res.tipe = 'himpun';
        res.jenisDana = 'Infak';
        res.subJenis = 'Infak Umum';
        res.pilar = '';
      } else if (res.kategori === 'infak_terikat') {
        res.tipe = 'himpun';
        res.jenisDana = 'Infak';
        res.subJenis = 'Infak Terikat';
        if (!res.pilar) res.pilar = 'Pendidikan';
      } else if (res.kategori === 'setor') {
        res.tipe = 'setor';
        res.pilar = '';
        if (!res.namaDonatur.toLowerCase().startsWith('setor tunai')) {
          res.namaDonatur = 'Setor Tunai ' + (res.kantor ? res.kantor : (res.jenisDana === 'Zakat' ? 'Kas Zakat' : 'Kas Infak'));
        }
      } else if (res.kategori === 'ump') {
        res.tipe = 'ump';
        res.isMasuk = false;
        if (!res.pilar) res.pilar = 'Pendidikan';
      } else if (res.kategori === 'biaya') {
        res.tipe = 'biaya';
        res.pilar = '';
        res.isMasuk = false;
      } else if (res.kategori === 'salur') {
        res.tipe = 'salur';
        res.isMasuk = false;
      }
    }
    if (perubahan.pilar !== undefined) {
      res.pilar = perubahan.pilar;
      if (res.pilar && res.jenisDana === 'Infak') {
        res.subJenis = 'Infak Terikat';
      } else if (!res.pilar && res.jenisDana === 'Infak' && res.kategori !== 'infak_terikat') {
        res.subJenis = 'Infak Umum';
      }
    }
    if (perubahan.jenisDana !== undefined) {
      res.jenisDana = perubahan.jenisDana;
    }
    if (perubahan.tipe !== undefined) {
      res.tipe = perubahan.tipe;
      if (res.tipe === 'setor' && !res.namaDonatur.toLowerCase().startsWith('setor tunai')) {
        res.namaDonatur = 'Setor Tunai ' + (res.kantor ? res.kantor : (res.jenisDana === 'Zakat' ? 'Kas Zakat' : 'Kas Infak'));
      }
    }
    if (perubahan.kantor !== undefined) {
      res.kantor = perubahan.kantor;
      if (res.kantor) {
        if (res.tipe === 'setor' || res.kategori === 'setor') {
          res.namaDonatur = 'Setor Tunai ' + res.kantor;
        } else {
          res.namaDonatur = res.kantor;
        }
      }
    }
    if (perubahan.namaDonatur !== undefined) {
      res.namaDonatur = perubahan.namaDonatur;
    }
    if (perubahan.detailJurnal !== undefined) {
      res.detailJurnal = perubahan.detailJurnal;
    }
    if (perubahan.nominal !== undefined) {
      res.nominal = Number(perubahan.nominal) || 0;
    }
    if (perubahan.terpilih !== undefined) {
      res.terpilih = Boolean(perubahan.terpilih);
    }
    return res;
  }

  /* -------------------------------------------------------------
     F. PECAH RINCIAN UMP SESUAI PERMOHONAN
     ------------------------------------------------------------- */
  function validasiPecahUmp(nominalTotal, rincian) {
    nominalTotal = Number(nominalTotal) || 0;
    rincian = Array.isArray(rincian) ? rincian : [];
    var sum = rincian.reduce(function(acc, item) {
      return acc + (Number(item.nominal) || 0);
    }, 0);

    var selisih = Math.abs(nominalTotal - sum);
    return {
      valid: selisih === 0 && rincian.length > 0,
      totalTransfer: nominalTotal,
      totalRincian: sum,
      selisih: selisih
    };
  }

  function terapkanPecahUmp(barisUmp, rincian) {
    if (!barisUmp || !Array.isArray(rincian) || !rincian.length) return [barisUmp];

    return rincian.map(function(item, idx) {
      return Object.assign({}, barisUmp, {
        id: barisUmp.id + '_det_' + (idx + 1),
        uraianAsli: barisUmp.uraianAsli + ' [Rincian ' + (idx + 1) + ': ' + item.uraian + ']',
        namaDonatur: barisUmp.kantor || barisUmp.namaDonatur,
        keteranganDetail: item.uraian || ('Rincian UMP ' + (idx + 1)),
        pilar: item.pilar || barisUmp.pilar || '',
        nominal: Number(item.nominal) || 0,
        debet: Number(item.nominal) || 0,
        isRincianUmp: true,
        indukUmpId: barisUmp.id
      });
    });
  }

  /* -------------------------------------------------------------
     G. GENERATE FORMAT JURNAL STANDAR (TSV & EXCEL)
     ------------------------------------------------------------- */
  function labelAkunRekening(rek) {
    if (!rek) return 'BPD DIY Syariah - 803211000510';
    return (rek.namaBank || 'Bank') + ' - ' + (rek.nomor || '');
  }

  function bangunTSVJurnal(daftarTransaksi, rekening) {
    var rekLabel = labelAkunRekening(rekening);
    var groups = {
      himpunZakat: [],
      himpunInfak: [],
      setorTunai: [],
      umpZakat: [],
      umpInfak: [],
      biayaBank: [],
      salur: []
    };

    (daftarTransaksi || []).forEach(function(tx) {
      if (!tx || !tx.terpilih || tx.nominal <= 0) return;
      var kat = tx.kategori || (tx.tipe === 'setor' ? 'setor' : tx.tipe === 'ump' ? 'ump' : tx.tipe === 'biaya' ? 'biaya' : tx.jenisDana === 'Zakat' ? 'zakat' : 'infak_umum');

      if (kat === 'setor' || tx.tipe === 'setor') {
        groups.setorTunai.push(tx);
      } else if (kat === 'ump' || tx.tipe === 'ump') {
        if (tx.jenisDana === 'Zakat') groups.umpZakat.push(tx);
        else groups.umpInfak.push(tx);
      } else if (kat === 'biaya' || tx.tipe === 'biaya') {
        groups.biayaBank.push(tx);
      } else if (kat === 'zakat' || tx.jenisDana === 'Zakat') {
        groups.himpunZakat.push(tx);
      } else if (kat === 'infak_umum' || kat === 'infak_terikat' || tx.tipe === 'himpun' || tx.isMasuk) {
        groups.himpunInfak.push(tx);
      } else {
        groups.salur.push(tx);
      }
    });

    var lines = [];

    function formatKeteranganJurnal(nama, pilar, detail) {
      nama = String(nama || '').trim();
      pilar = String(pilar || '').trim();
      detail = String(detail || '').trim();

      nama = nama.replace(/\s*[-—]\s*/g, ' ').trim();
      pilar = pilar.replace(/\s*[-—]\s*/g, ' ').trim();
      detail = detail.replace(/\s*[-—]\s*/g, ' ').trim();

      var parts = [];
      if (nama) parts.push(nama);
      if (pilar) parts.push(pilar);
      if (detail && (!pilar || detail.toLowerCase() !== pilar.toLowerCase())) {
        parts.push(detail);
      }

      return parts.join(' ').replace(/\s+/g, ' ').trim() || 'Transaksi Mutasi';
    }

    // 1. PENERIMAAN ZAKAT VIA BANK
    if (groups.himpunZakat.length) {
      lines.push('\tPENERIMAAN ZAKAT VIA BANK\t\t\t');
      groups.himpunZakat.forEach(function(tx) {
        var tgl = tx.tanggal;
        var nom = Math.round(tx.nominal);
        var def = tx.pilar ? tx.pilar : 'Zakat Mal';
        var ket = formatKeteranganJurnal(tx.namaDonatur, def, tx.detailJurnal);
        lines.push(tgl + '\t' + rekLabel + '\t' + nom + '\t\t' + ket);
        lines.push(tgl + '\tPenerimaan Zakat Mal\t\t' + nom + '\t' + ket);
      });
    }

    // 2. PENERIMAAN INFAK VIA BANK
    if (groups.himpunInfak.length) {
      lines.push('\tPENERIMAAN INFAK VIA BANK\t\t\t');
      groups.himpunInfak.forEach(function(tx) {
        var tgl = tx.tanggal;
        var nom = Math.round(tx.nominal);
        var isTerikat = (tx.kategori === 'infak_terikat' || tx.subJenis === 'Infak Terikat' || tx.pilar);
        var akunPos = isTerikat ? 'Penerimaan Infak Terikat' : 'Penerimaan Infak Umum';
        var def = isTerikat ? tx.pilar : 'Infak Umum';
        var ket = formatKeteranganJurnal(tx.namaDonatur, def, tx.detailJurnal);
        lines.push(tgl + '\t' + rekLabel + '\t' + nom + '\t\t' + ket);
        lines.push(tgl + '\t' + akunPos + '\t\t' + nom + '\t' + ket);
      });
    }

    // 3. SETOR TUNAI
    if (groups.setorTunai.length) {
      lines.push('\tSETOR TUNAI\t\t\t');
      groups.setorTunai.forEach(function(tx) {
        var tgl = tx.tanggal;
        var nom = Math.round(tx.nominal);
        var akunKas = tx.jenisDana === 'Zakat' ? 'Kas Zakat' : 'Kas Infak';
        var ket = formatKeteranganJurnal(tx.namaDonatur || ('Setor Tunai ' + akunKas), '', tx.detailJurnal);
        lines.push(tgl + '\t' + rekLabel + '\t' + nom + '\t\t' + ket);
        lines.push(tgl + '\t' + akunKas + '\t\t' + nom + '\t' + ket);
      });
    }

    // 4. UMP INFAK / UMP ZAKAT
    if (groups.umpInfak.length) {
      lines.push('\tUMP INFAK\t\t\t');
      groups.umpInfak.forEach(function(tx) {
        var tgl = tx.tanggal;
        var nom = Math.round(tx.nominal);
        var kantor = tx.kantor || tx.namaDonatur || 'KLL';
        var def = tx.keteranganDetail || tx.uraianBersih || 'UMP Infak';
        var ket = formatKeteranganJurnal('UMP ' + kantor, tx.pilar, tx.detailJurnal || def);
        var akunUmp = 'UMP ' + kantor;
        lines.push(tgl + '\t' + akunUmp + '\t' + nom + '\t\t' + ket);
        lines.push(tgl + '\t' + rekLabel + '\t\t' + nom + '\t' + ket);
      });
    }

    if (groups.umpZakat.length) {
      lines.push('\tUMP ZAKAT\t\t\t');
      groups.umpZakat.forEach(function(tx) {
        var tgl = tx.tanggal;
        var nom = Math.round(tx.nominal);
        var kantor = tx.kantor || tx.namaDonatur || 'KLL';
        var def = tx.keteranganDetail || tx.uraianBersih || 'UMP Zakat';
        var ket = formatKeteranganJurnal('UMP ' + kantor, tx.pilar, tx.detailJurnal || def);
        var akunUmp = 'UMP ' + kantor;
        lines.push(tgl + '\t' + akunUmp + '\t' + nom + '\t\t' + ket);
        lines.push(tgl + '\t' + rekLabel + '\t\t' + nom + '\t' + ket);
      });
    }

    // 5. BIAYA ADMINISTRASI BANK
    if (groups.biayaBank.length) {
      lines.push('\tBIAYA ADMINISTRASI BANK\t\t\t');
      groups.biayaBank.forEach(function(tx) {
        var tgl = tx.tanggal;
        var nom = Math.round(tx.nominal);
        var ket = formatKeteranganJurnal(tx.namaDonatur || 'Biaya Administrasi Bank', '', tx.detailJurnal || tx.uraianBersih || tx.uraianAsli);
        lines.push(tgl + '\tBiaya Administrasi Bank\t' + nom + '\t\t' + ket);
        lines.push(tgl + '\t' + rekLabel + '\t\t' + nom + '\t' + ket);
      });
    }

    // 6. PENYALURAN LAINNYA
    if (groups.salur.length) {
      lines.push('\tPENTASYARUFAN LAINNYA\t\t\t');
      groups.salur.forEach(function(tx) {
        var tgl = tx.tanggal;
        var nom = Math.round(tx.nominal);
        var def = tx.pilar ? ('Penyaluran ' + tx.pilar) : 'Penyaluran Program';
        var ket = formatKeteranganJurnal(tx.namaDonatur, def, tx.detailJurnal);
        lines.push(tgl + '\tPenyaluran Program\t' + nom + '\t\t' + ket);
        lines.push(tgl + '\t' + rekLabel + '\t\t' + nom + '\t' + ket);
      });
    }

    return lines.join('\n');
  }

  function bangunExcelJurnal(daftarTransaksi, rekening, XLSX) {
    if (!XLSX) return null;
    var tsv = bangunTSVJurnal(daftarTransaksi, rekening);
    var rawRows = tsv.split('\n').map(function(line) {
      return line.split('\t');
    });

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(rawRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Jurnal Mutasi');
    return wb;
  }

  /* -------------------------------------------------------------
     H. ANTARMUKA PENGGUNA (MODAL & WORKFLOW)
     ------------------------------------------------------------- */
  var STATE = {
    step: 1,
    bank: 'bpd',
    file: null,
    fileName: '',
    rawTeks: '',
    deteksi: null,
    rekeningTerpilih: null,
    daftarRekening: [],
    daftarLayanan: [],
    transaksi: [],
    cari: '',
    filterTipe: 'semua',
    modalPecahUmp: null
  };

  function ambilDaftarMaster() {
    var rekList = [];
    if (typeof window !== 'undefined' && window.CACHE && Array.isArray(window.CACHE.rekening)) {
      rekList = window.CACHE.rekening;
    }
    var layList = [];
    if (typeof window !== 'undefined' && window.CACHE && Array.isArray(window.CACHE.layanan)) {
      layList = window.CACHE.layanan;
    }
    return { rekening: rekList, layanan: layList };
  }

  function kunciScrollBody() {
    if (typeof document !== 'undefined') {
      document.body.classList.add('jrb-modal-open');
      document.documentElement.classList.add('jrb-modal-open');
    }
  }

  function lepasScrollBody() {
    if (typeof document !== 'undefined') {
      document.body.classList.remove('jrb-modal-open');
      document.documentElement.classList.remove('jrb-modal-open');
    }
  }

  function bukaModal() {
    var master = ambilDaftarMaster();
    Object.assign(STATE, {
      step: 1,
      bank: 'bpd',
      file: null,
      fileName: '',
      rawTeks: '',
      deteksi: null,
      rekeningTerpilih: null,
      daftarRekening: master.rekening,
      daftarLayanan: master.layanan,
      transaksi: [],
      cari: '',
      filterTipe: 'semua',
      modalPecahUmp: null
    });

    kunciScrollBody();

    if (typeof window !== 'undefined' && window.openModal) {
      window.openModal(
        'Pembuat Jurnal dari Rekening Koran Bank',
        '<div id="jrbModalBodyHost"></div>',
        '<div id="jrbModalFootHost"></div>'
      );
      var mc = document.getElementById('modalCard');
      if (mc) {
        mc.classList.add('import-modal', 'jrb-modal');
      }
    }

    gambarModal();
  }

  function tutupModal() {
    lepasScrollBody();
    if (typeof window !== 'undefined' && window.closeModal) {
      window.closeModal();
    }
  }

  function gambarModal() {
    var bodyHost = document.getElementById('jrbModalBodyHost');
    var footHost = document.getElementById('jrbModalFootHost');
    if (!bodyHost || !footHost) {
      if (typeof window !== 'undefined' && window.openModal) {
        window.openModal(
          'Pembuat Jurnal dari Rekening Koran Bank',
          '<div id="jrbModalBodyHost"></div>',
          '<div id="jrbModalFootHost"></div>'
        );
        var mc = document.getElementById('modalCard');
        if (mc) {
          mc.classList.add('import-modal', 'jrb-modal');
        }
        bodyHost = document.getElementById('jrbModalBodyHost');
        footHost = document.getElementById('jrbModalFootHost');
      }
    }
    if (!bodyHost || !footHost) return;

    var wrap = document.querySelector('.jrb-tabel-wrap');
    var lastScrollTop = wrap ? wrap.scrollTop : 0;

    if (STATE.step === 1) {
      bodyHost.innerHTML = gambarLangkah1HTML();
      footHost.innerHTML = '<button class="btn btn-ghost" onclick="LZJurnalBank.tutupModal()">Batal</button>'
        + '<button class="btn btn-primary" id="jrbBtnLanjut" ' + (STATE.rekeningTerpilih ? '' : 'disabled') + ' onclick="LZJurnalBank.lanjutKeLangkah2()">Lanjutkan ke Penyesuaian Jurnal &rarr;</button>';
    } else {
      bodyHost.innerHTML = gambarLangkah2HTML();
      footHost.innerHTML = '<button class="btn btn-ghost btn-sm" onclick="LZJurnalBank.kembaliKeLangkah1()">&larr; Ganti Berkas</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="LZJurnalBank.salinTSV()">Salin TSV</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="LZJurnalBank.unduhExcel()">Unduh Excel Jurnal</button>'
        + '<button class="btn btn-primary btn-sm" onclick="LZJurnalBank.imporKeSistem()">Impor Langsung ke Sistem</button>';
    }

    pasangEventLangkah();

    if (typeof window !== 'undefined' && typeof window.enhanceSelects === 'function') {
      window.enhanceSelects(bodyHost);
    }

    var newWrap = document.querySelector('.jrb-tabel-wrap');
    if (newWrap && lastScrollTop > 0) {
      newWrap.scrollTop = lastScrollTop;
    }
  }

  function gambarLangkah1HTML() {
    var bank = STATE.bank;
    var det = STATE.deteksi;
    var rek = STATE.rekeningTerpilih;

    var h = '<div class="jrb-langkah1">'
      + '<div class="lap-tabs jrb-tabs" style="margin-bottom:14px">'
      + '<button class="lap-tab ' + (bank === 'bpd' ? 'on' : '') + '" onclick="LZJurnalBank.pilihBank(\'bpd\')">Bank BPD DIY Syariah</button>'
      + '<button class="lap-tab ' + (bank === 'bsi' ? 'on' : '') + '" onclick="LZJurnalBank.pilihBank(\'bsi\')">Bank Syariah Indonesia (BSI)</button>'
      + '</div>';

    h += '<div class="imp-drop" id="jrbDropZone" onclick="document.getElementById(\'jrbFileInput\').click()">'
      + '<span class="imp-drop-ic" aria-hidden="true">' + (window.IKON_UNGGAH || '') + '</span>'
      + '<span class="imp-drop-tx"><b>Pilih atau seret berkas Rekening Koran (' + (bank === 'bpd' ? 'BPD DIY Syariah' : 'BSI') + ')</b>'
      + '<span class="imp-drop-d">Berkas PDF rekening koran resmi. Sistem akan membaca nomor rekening dan transaksi mutasi otomatis.</span></span>'
      + '<span class="imp-drop-btn">Telusuri</span>'
      + '</div>'
      + '<input type="file" id="jrbFileInput" accept=".pdf,.txt" style="display:none" onchange="LZJurnalBank.prosesBerkas(this.files)">';

    h += '<div id="jrbStatusProses" class="imp-stat-baris" style="margin:10px 0"></div>';

    if (det) {
      var rekList = STATE.daftarRekening || [];
      var rekOpts = '<option value="">-- Pilih Rekening Terdaftar --</option>'
        + rekList.map(function(r) {
          var sel = (rek && rek.id === r.id) ? ' selected' : '';
          var label = (r.namaBank || 'Bank') + ' - ' + r.nomor + ' (' + (r.fundGroup || 'Umum') + ' - ' + (r.atasNama || '') + ')';
          return '<option value="' + esc(r.id) + '"' + sel + '>' + esc(label) + '</option>';
        }).join('');

      var isCocok = rek && String(rek.nomor || '').replace(/\D/g, '') === String(det.nomor || '').replace(/\D/g, '');

      h += '<div class="card jrb-verif-box" style="padding:16px;margin-top:14px;background:var(--surface2);border-radius:12px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">'
        + '  <div>'
        + '    <span class="badge ' + (isCocok ? 'green' : 'amber') + '" style="font-size:11px">'
        + (isCocok ? '✓ Nomor Rekening Terverifikasi Cocok' : '⚠ Periksa & Pastikan Rekening') + '</span>'
        + '    <div style="font-size:16px;font-weight:800;margin-top:4px">' + esc(det.nomor || '(Nomor belum terbaca)') + '</div>'
        + '  </div>'
        + (det.periode ? '<div style="font-size:12px;color:var(--text2)">Periode: <b>' + esc(det.periode) + '</b></div>' : '')
        + '</div>'
        + '<div class="field" style="margin-bottom:0">'
        + '  <label style="font-weight:700">Pastikan Rekening Bank di Sistem *</label>'
        + '  <select id="jrbSelectRekening" class="input" onchange="LZJurnalBank.gantiRekeningSistem(this.value)" style="width:100%">' + rekOpts + '</select>'
        + '  <div class="desc" style="font-size:11.5px;margin-top:4px;color:var(--muted)">'
        + '    Harus dipastikan nomor rekeningnya sebelum lanjut ke pembuatan jurnal.'
        + '  </div>'
        + '</div>'
        + '</div>';
    }

    h += '</div>';
    return h;
  }

  function gambarLangkah2HTML() {
    var rek = STATE.rekeningTerpilih || {};
    var txs = STATE.transaksi || [];
    var pilars = PILAR;
    var layList = STATE.daftarLayanan || [];

    var totalD = 0, totalK = 0, nMasuk = 0, nKeluar = 0, nSetor = 0, nUmp = 0;
    txs.forEach(function(t) {
      if (!t.terpilih) return;
      if (t.isMasuk) {
        totalK += t.nominal;
        nMasuk++;
      } else {
        totalD += t.nominal;
        nKeluar++;
      }
      if (t.tipe === 'setor' || t.kategori === 'setor') nSetor++;
      if (t.tipe === 'ump' || t.kategori === 'ump') nUmp++;
    });

    var h = '<div class="jrb-langkah2">'
      + '<div class="jrb-ringkasan-bar">'
      + '  <div>'
      + '    <span style="font-weight:700;color:var(--accent-d);margin-right:4px">REKENING:</span>'
      + '    <b>' + esc((rek.namaBank || 'Bank') + ' ' + (rek.nomor || '') + ' (' + (rek.fundGroup || 'Umum') + ')') + '</b>'
      + (STATE.deteksi && STATE.deteksi.periode ? '<span style="color:var(--muted);margin-left:8px">Periode: ' + esc(STATE.deteksi.periode) + '</span>' : '')
      + '  </div>'
      + '  <div style="display:flex;gap:12px;align-items:center">'
      + '    <span>Kredit (Masuk): <b id="jrbStatKredit" style="color:var(--green)">' + rp(totalK) + '</b> (<span id="jrbStatNMasuk">' + nMasuk + '</span>)</span>'
      + '    <span>Debet (Keluar): <b id="jrbStatDebet" style="color:var(--red)">' + rp(totalD) + '</b> (<span id="jrbStatNKeluar">' + nKeluar + '</span>)</span>'
      + '    <span>Setor Tunai: <b id="jrbStatNSetor">' + nSetor + '</b></span>'
      + '    <span>UMP: <b id="jrbStatNUmp">' + nUmp + '</b></span>'
      + '  </div>'
      + '</div>';

    // Filter toolbar
    h += '<div class="toolbar" style="margin-bottom:8px;gap:6px;flex-wrap:wrap">'
      + '  <div class="field" style="margin:0;flex:1;min-width:180px">'
      + '    <input type="text" id="jrbCari" placeholder="Cari uraian, donatur, KLL/ULL, detail..." value="' + esc(STATE.cari) + '" oninput="LZJurnalBank.filterTabel()" style="height:28px;padding:3px 8px;font-size:12px;width:100%">'
      + '  </div>'
      + '  <div class="lap-tabs jrb-filter-tabs" style="margin:0">'
      + '    <button class="lap-tab ' + (STATE.filterTipe === 'semua' ? 'on' : '') + '" data-tipe="semua" onclick="LZJurnalBank.filterTipe(\'semua\')">Semua (' + txs.length + ')</button>'
      + '    <button class="lap-tab ' + (STATE.filterTipe === 'himpun' ? 'on' : '') + '" data-tipe="himpun" onclick="LZJurnalBank.filterTipe(\'himpun\')">Penghimpunan</button>'
      + '    <button class="lap-tab ' + (STATE.filterTipe === 'setor' ? 'on' : '') + '" data-tipe="setor" onclick="LZJurnalBank.filterTipe(\'setor\')">Setor Tunai</button>'
      + '    <button class="lap-tab ' + (STATE.filterTipe === 'ump' ? 'on' : '') + '" data-tipe="ump" onclick="LZJurnalBank.filterTipe(\'ump\')">UMP</button>'
      + '    <button class="lap-tab ' + (STATE.filterTipe === 'salur' ? 'on' : '') + '" data-tipe="salur" onclick="LZJurnalBank.filterTipe(\'salur\')">Penyaluran</button>'
      + '  </div>'
      + '</div>';

    // Tabel Transaksi
    h += '<div class="jrb-tabel-wrap">'
      + '<table class="jrb-table">'
      + '<thead>'
      + '<tr>'
      + '  <th style="width:28px;text-align:center"><input type="checkbox" id="jrbCbAll" checked onchange="LZJurnalBank.togglePilihSemua(this.checked)"></th>'
      + '  <th style="width:85px">Tanggal</th>'
      + '  <th style="min-width:200px">Uraian Bersih (Bank)</th>'
      + '  <th style="width:115px">Kategori Dana</th>'
      + '  <th style="min-width:180px">KLL / ULL / Donatur</th>'
      + '  <th style="min-width:140px">Detail Keterangan Jurnal</th>'
      + '  <th style="width:130px">Pilar Program</th>'
      + '  <th style="width:95px;text-align:right">Nominal</th>'
      + '  <th style="width:75px;text-align:center">Aksi</th>'
      + '</tr>'
      + '</thead><tbody>';

    if (!txs.length) {
      h += '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">Belum ada data transaksi mutasi.</td></tr>';
    } else {
      txs.forEach(function(t, realIdx) {
        var isMasuk = t.isMasuk;
        var nomColor = isMasuk ? 'color:var(--green)' : 'color:var(--red)';
        var kat = t.kategori || (t.tipe === 'setor' ? 'setor' : t.tipe === 'ump' ? 'ump' : t.tipe === 'biaya' ? 'biaya' : t.jenisDana === 'Zakat' ? 'zakat' : (t.subJenis === 'Infak Terikat' || t.pilar) ? 'infak_terikat' : 'infak_umum');

        var katOpts = ''
          + '<option value="infak_umum"' + (kat === 'infak_umum' ? ' selected' : '') + '>Infak Umum</option>'
          + '<option value="infak_terikat"' + (kat === 'infak_terikat' ? ' selected' : '') + '>Infak Terikat</option>'
          + '<option value="zakat"' + (kat === 'zakat' ? ' selected' : '') + '>Zakat Mal</option>'
          + '<option value="setor"' + (kat === 'setor' ? ' selected' : '') + '>Setor Tunai</option>'
          + '<option value="ump"' + (kat === 'ump' ? ' selected' : '') + '>UMP Program</option>'
          + '<option value="biaya"' + (kat === 'biaya' ? ' selected' : '') + '>Biaya Bank</option>'
          + '<option value="salur"' + (kat === 'salur' ? ' selected' : '') + '>Pentasyarufan</option>';

        var layOpts = '<option value="">-- Donatur Pribadi / QRIS --</option>'
          + layList.map(function(l) {
            var fullNama = (l.tipe || 'KLL') + ' ' + l.nama;
            var isSel = (t.kantor && t.kantor.toLowerCase() === fullNama.toLowerCase()) ? ' selected' : '';
            return '<option value="' + esc(fullNama) + '"' + isSel + '>' + esc(fullNama) + '</option>';
          }).join('');

        var isPilarActive = (kat === 'infak_terikat' || kat === 'ump' || kat === 'salur');
        var pilarOpts = '<option value="">(Pilih Pilar)</option>'
          + pilars.map(function(p) {
            return '<option value="' + esc(p) + '"' + (t.pilar === p ? ' selected' : '') + '>' + esc(p) + '</option>';
          }).join('');

        h += '<tr id="jrbRow_' + realIdx + '" class="jrb-row" data-idx="' + realIdx + '" style="' + (t.terpilih ? '' : 'opacity:0.45') + '">'
          + '  <td style="text-align:center"><input type="checkbox" class="jrb-cb-row" ' + (t.terpilih ? 'checked' : '') + ' onchange="LZJurnalBank.ubahPilihan(this, ' + realIdx + ')"></td>'
          + '  <td><input type="date" value="' + esc(t.tanggal) + '" onchange="LZJurnalBank.ubahTanggal(this, ' + realIdx + ')"></td>'
          + '  <td><div class="jrb-uraian-box" title="' + esc(t.uraianAsli) + '">' + esc(t.uraianBersih || t.uraianAsli) + '</div></td>'
          + '  <td><select id="jrbSelKat_' + realIdx + '" class="jrb-sel-kat" onchange="LZJurnalBank.ubahKategori(this, ' + realIdx + ')">' + katOpts + '</select></td>'
          + '  <td>'
          + '    <div style="display:flex;gap:3px;flex-direction:column">'
          + '      <select id="jrbSelLay_' + realIdx + '" class="jrb-sel-lay" onchange="LZJurnalBank.setKantorCepat(this, ' + realIdx + ')">' + layOpts + '</select>'
          + '      <input type="text" id="jrbInpNama_' + realIdx + '" value="' + esc(t.namaDonatur) + '" oninput="LZJurnalBank.ubahNamaDonatur(this, ' + realIdx + ')" placeholder="Nama donatur/person">'
          + '    </div>'
          + '  </td>'
          + '  <td>'
          + '    <input type="text" id="jrbInpDetail_' + realIdx + '" placeholder="Detail setelah pilar..." value="' + esc(t.detailJurnal || '') + '" oninput="LZJurnalBank.ubahDetailJurnal(this, ' + realIdx + ')" style="width:100%" title="Keterangan tambahan jurnal yang diletakkan setelah nama atau pilar">'
          + '  </td>'
          + '  <td id="jrbPilarCell_' + realIdx + '">'
          + (isPilarActive
            ? '<select id="jrbSelPilar_' + realIdx + '" class="jrb-sel-pilar" onchange="LZJurnalBank.ubahPilar(this, ' + realIdx + ')">' + pilarOpts + '</select>'
            : '<span class="muted" style="font-size:10px;padding-left:4px">(Tanpa pilar)</span>')
          + '  </td>'
          + '  <td class="jrb-cell-nom" id="jrbNomCell_' + realIdx + '" style="text-align:right;font-weight:700;' + nomColor + '">' + rp(t.nominal) + '</td>'
          + '  <td class="jrb-cell-aksi" id="jrbAksiCell_' + realIdx + '" style="text-align:center">'
          + (kat === 'ump' ? '<button type="button" class="btn btn-xs ' + (t.rincianUmp && t.rincianUmp.length ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 5px" onclick="LZJurnalBank.bukaModalPecahUmp(' + realIdx + ')">Pecah Detail</button>' : '')
          + '  </td>'
          + '</tr>';
      });

      h += '<tr id="jrbRowKosong" style="display:none"><td colspan="9" style="text-align:center;padding:24px;color:var(--muted)">Tidak ada baris transaksi yang cocok dengan saringan.</td></tr>';
      h += '<tr class="jrb-spacer"><td colspan="9" style="height:60px;border:none!important;background:transparent!important"></td></tr>';
    }

    h += '</tbody></table></div>';
    h += '</div>';

    if (STATE.modalPecahUmp) {
      h += gambarModalPecahUmpHTML(STATE.modalPecahUmp);
    }

    return h;
  }

  function gambarModalPecahUmpHTML(umpState) {
    var tx = STATE.transaksi[umpState.idx];
    if (!tx) return '';

    var sum = (umpState.rincian || []).reduce(function(a, b) {
      return a + (Number(b.nominal) || 0);
    }, 0);
    var selisih = tx.nominal - sum;
    var isPas = selisih === 0;

    var pilars = PILAR;

    var h = '<div class="jrb-submodal-bg" id="jrbSubModalBg" onclick="if(event.target===this)LZJurnalBank.tutupModalPecahUmp()">'
      + '<div class="jrb-submodal">'
      + '<div class="jrb-submodal-head">'
      + '  <h3>Pecah Rincian UMP: ' + esc(tx.kantor || tx.namaDonatur) + '</h3>'
      + '  <button class="close-x" type="button" onclick="LZJurnalBank.tutupModalPecahUmp()">&times;</button>'
      + '</div>'
      + '<div class="jrb-submodal-body">'
      + '  <div class="card" style="padding:10px 14px;margin-bottom:12px;background:var(--surface2);border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
      + '    <div>Total Transfer UMP: <b style="font-size:15px;color:var(--text)">' + rp(tx.nominal) + '</b></div>'
      + '    <div>Status: <span id="jrbUmpStatusBadge" class="badge ' + (isPas ? 'green' : 'red') + '">' + (isPas ? '✓ Sesuai (Pas)' : 'Selisih ' + rp(Math.abs(selisih))) + '</span></div>'
      + '  </div>'
      + '  <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:8px">Rincian permohonan / kegiatan:</div>'
      + '  <div id="jrbRincianRowsList">';

    (umpState.rincian || []).forEach(function(item, rIdx) {
      var pOpts = '<option value="">(Pilih Pilar)</option>'
        + pilars.map(function(p) {
          return '<option value="' + esc(p) + '"' + (item.pilar === p ? ' selected' : '') + '>' + esc(p) + '</option>';
        }).join('');

      h += '<div class="jrb-rincian-row" id="jrbRow_' + rIdx + '">'
        + '  <input type="text" placeholder="Uraian permohonan / detail..." value="' + esc(item.uraian) + '" oninput="LZJurnalBank.ubahRincianItem(' + rIdx + ', \'uraian\', this.value)">'
        + '  <select onchange="LZJurnalBank.ubahRincianItem(' + rIdx + ', \'pilar\', this.value)">' + pOpts + '</select>'
        + '  <input type="number" placeholder="Nominal Rp" value="' + (item.nominal || '') + '" oninput="LZJurnalBank.ubahRincianItem(' + rIdx + ', \'nominal\', this.value)" style="text-align:right">'
        + '  <button type="button" class="jrb-rincian-del" onclick="LZJurnalBank.hapusRincianItem(' + rIdx + ')" title="Hapus baris">&times;</button>'
        + '</div>';
    });

    h += '  </div>'
      + '  <button type="button" class="btn btn-sm btn-ghost" onclick="LZJurnalBank.tambahRincianItem()" style="margin-top:6px">+ Tambah Baris Rincian</button>'
      + '</div>'
      + '<div class="jrb-submodal-foot">'
      + '  <button class="btn btn-ghost" type="button" onclick="LZJurnalBank.tutupModalPecahUmp()">Batal</button>'
      + '  <button class="btn btn-primary" type="button" id="jrbBtnTerapkanUmp" ' + (isPas ? '' : 'disabled') + ' onclick="LZJurnalBank.terapkanRincianUmp()">Terapkan Rincian ke Jurnal</button>'
      + '</div>'
      + '</div></div>';

    return h;
  }

  function pasangEventLangkah() {
    var drop = document.getElementById('jrbDropZone');
    if (drop) {
      drop.ondragover = function(e) { e.preventDefault(); drop.classList.add('di-atas'); };
      drop.ondragleave = function(e) { drop.classList.remove('di-atas'); };
      drop.ondrop = function(e) {
        e.preventDefault();
        drop.classList.remove('di-atas');
        if (e.dataTransfer && e.dataTransfer.files.length) {
          prosesBerkas(e.dataTransfer.files);
        }
      };
    }
  }

  function pilihBank(bank) {
    STATE.bank = bank;
    gambarModal();
  }

  function prosesBerkas(fileList) {
    if (!fileList || !fileList.length) return;
    var file = fileList[0];
    STATE.file = file;
    STATE.fileName = file.name;

    var statusEl = document.getElementById('jrbStatusProses');
    if (statusEl) statusEl.innerHTML = '⏳ Membaca berkas rekening koran...';

    muatPdfJs(function(pdfjs) {
      if (!pdfjs) {
        if (statusEl) statusEl.innerHTML = '<span class="text-danger">Gagal memuat mesin pembaca PDF.</span>';
        return;
      }

      var reader = new FileReader();
      reader.onload = function(e) {
        var typedarray = new Uint8Array(e.target.result);
        pdfjs.getDocument({ data: typedarray }).promise.then(async function(doc) {
          if (statusEl) statusEl.innerHTML = '⏳ Mengekstrak nomor rekening & transaksi...';

          var res = null;
          if (STATE.bank === 'bpd') {
            res = await parseBpdPdf(doc);
          } else {
            res = await parseBsiPdf(doc);
          }

          STATE.deteksi = {
            nomor: res.noRek,
            bank: res.bank,
            periode: res.periode
          };

          var cocok = cocokkanRekening(res.noRek, STATE.daftarRekening);
          STATE.rekeningTerpilih = cocok;

          STATE.transaksi = analisisTransaksi(res.transaksi, {
            rekening: cocok,
            layanan: STATE.daftarLayanan
          });

          if (statusEl) {
            statusEl.innerHTML = '<span class="text-success">✓ Berkas terbaca: ' + res.transaksi.length + ' transaksi mutasi ditemukan.</span>';
          }
          gambarModal();
        }).catch(function(err) {
          if (statusEl) statusEl.innerHTML = '<span class="text-danger">Gagal memproses PDF: ' + esc(err.message) + '</span>';
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function gantiRekeningSistem(rekId) {
    var rek = (STATE.daftarRekening || []).find(function(r) { return r.id === rekId; });
    STATE.rekeningTerpilih = rek || null;
    var btn = document.getElementById('jrbBtnLanjut');
    if (btn) btn.disabled = !STATE.rekeningTerpilih;

    if (STATE.transaksi && STATE.transaksi.length) {
      STATE.transaksi = analisisTransaksi(STATE.transaksi, {
        rekening: STATE.rekeningTerpilih,
        layanan: STATE.daftarLayanan
      });
    }
  }

  function lanjutKeLangkah2() {
    if (!STATE.rekeningTerpilih) {
      alert('Pastikan rekening bank di sistem sudah terpilih sebelum melanjutkan.');
      return;
    }
    STATE.step = 2;
    gambarModal();
  }

  function kembaliKeLangkah1() {
    STATE.step = 1;
    gambarModal();
  }

  // Live in-place update for top summary bar
  function segarkanRingkasanBar() {
    var totalD = 0, totalK = 0, nMasuk = 0, nKeluar = 0, nSetor = 0, nUmp = 0;
    (STATE.transaksi || []).forEach(function(t) {
      if (!t.terpilih) return;
      if (t.isMasuk) {
        totalK += t.nominal;
        nMasuk++;
      } else {
        totalD += t.nominal;
        nKeluar++;
      }
      if (t.tipe === 'setor' || t.kategori === 'setor') nSetor++;
      if (t.tipe === 'ump' || t.kategori === 'ump') nUmp++;
    });

    var elKredit = document.getElementById('jrbStatKredit');
    var elDebet = document.getElementById('jrbStatDebet');
    var elNMasuk = document.getElementById('jrbStatNMasuk');
    var elNKeluar = document.getElementById('jrbStatNKeluar');
    var elNSetor = document.getElementById('jrbStatNSetor');
    var elNUmp = document.getElementById('jrbStatNUmp');

    if (elKredit) elKredit.textContent = rp(totalK);
    if (elDebet) elDebet.textContent = rp(totalD);
    if (elNMasuk) elNMasuk.textContent = nMasuk;
    if (elNKeluar) elNKeluar.textContent = nKeluar;
    if (elNSetor) elNSetor.textContent = nSetor;
    if (elNUmp) elNUmp.textContent = nUmp;
  }

  // Filter in-place: toggle CSS display without re-rendering HTML
  function filterTabel() {
    var qInp = document.getElementById('jrbCari');
    var q = qInp ? qInp.value.toLowerCase().trim() : '';
    STATE.cari = q;

    var rows = document.querySelectorAll('.jrb-table tbody tr.jrb-row');
    var nCocok = 0;

    rows.forEach(function(tr) {
      var idx = Number(tr.dataset.idx);
      var t = STATE.transaksi[idx];
      if (!t) return;
      var tipeCocok = (STATE.filterTipe === 'semua' || t.tipe === STATE.filterTipe);
      var qCocok = !q || (t.uraianAsli + ' ' + (t.uraianBersih || '') + ' ' + t.namaDonatur + ' ' + (t.detailJurnal || '') + ' ' + (t.kantor || '') + ' ' + (t.pilar || '')).toLowerCase().indexOf(q) >= 0;
      var tampil = tipeCocok && qCocok;
      tr.style.display = tampil ? '' : 'none';
      if (tampil) nCocok++;
    });

    var kosongRow = document.getElementById('jrbRowKosong');
    if (kosongRow) kosongRow.style.display = (nCocok === 0 && rows.length > 0) ? '' : 'none';
  }

  function filterTipe(tipe) {
    STATE.filterTipe = tipe || 'semua';
    var tabs = document.querySelectorAll('.jrb-filter-tabs .lap-tab');
    tabs.forEach(function(b) {
      b.classList.toggle('on', b.dataset.tipe === STATE.filterTipe);
    });
    filterTabel();
  }

  function cariTeks(q) {
    var qInp = document.getElementById('jrbCari');
    if (qInp && qInp.value !== q) qInp.value = q;
    filterTabel();
  }

  function togglePilihSemua(checked) {
    (STATE.transaksi || []).forEach(function(t, idx) {
      t.terpilih = Boolean(checked);
      var tr = document.getElementById('jrbRow_' + idx);
      if (tr) {
        tr.style.opacity = t.terpilih ? '1' : '0.45';
        var cb = tr.querySelector('.jrb-cb-row');
        if (cb) cb.checked = t.terpilih;
      }
    });
    segarkanRingkasanBar();
  }

  function ubahPilihan(arg1, arg2) {
    var el = typeof arg1 === 'object' ? arg1 : null;
    var idx = typeof arg1 === 'number' ? arg1 : Number(arg2);
    var checked = el ? el.checked : Boolean(arg2);

    if (STATE.transaksi[idx]) {
      STATE.transaksi[idx].terpilih = checked;
      var tr = document.getElementById('jrbRow_' + idx);
      if (tr) {
        tr.style.opacity = checked ? '1' : '0.45';
        var cb = tr.querySelector('.jrb-cb-row');
        if (cb && cb !== el) cb.checked = checked;
      }
      segarkanRingkasanBar();
    }
  }

  function ubahTanggal(arg1, arg2) {
    var el = typeof arg1 === 'object' ? arg1 : null;
    var idx = typeof arg1 === 'number' ? arg1 : Number(arg2);
    var tgl = el ? el.value : String(arg2);

    if (STATE.transaksi[idx]) {
      STATE.transaksi[idx].tanggal = tgl;
    }
  }

  function ubahTipe(arg1, arg2) {
    ubahKategori(arg1, arg2);
  }

  function ubahKategori(arg1, arg2) {
    var el = typeof arg1 === 'object' ? arg1 : null;
    var idx = typeof arg1 === 'number' ? arg1 : Number(arg2);
    var kat = el ? el.value : String(arg2);

    var t = STATE.transaksi[idx];
    if (!t) return;

    STATE.transaksi[idx] = sesuaikanBaris(t, { kategori: kat });
    t = STATE.transaksi[idx];

    // In-place DOM update in this specific row (NO full-table re-render!)
    var tr = document.getElementById('jrbRow_' + idx);
    if (tr) {
      // 1. Update pilar cell
      var pilarCell = document.getElementById('jrbPilarCell_' + idx);
      if (pilarCell) {
        var isPilarActive = (kat === 'infak_terikat' || kat === 'ump' || kat === 'salur');
        if (isPilarActive) {
          var pOpts = '<option value="">(Pilih Pilar)</option>'
            + PILAR.map(function(p) {
              return '<option value="' + esc(p) + '"' + (t.pilar === p ? ' selected' : '') + '>' + esc(p) + '</option>';
            }).join('');
          pilarCell.innerHTML = '<select id="jrbSelPilar_' + idx + '" class="jrb-sel-pilar" onchange="LZJurnalBank.ubahPilar(this, ' + idx + ')">' + pOpts + '</select>';
          if (typeof window !== 'undefined' && typeof window.enhanceSelects === 'function') {
            window.enhanceSelects(pilarCell);
          }
        } else {
          var wrapLama = pilarCell.querySelector('.select-enhanced');
          if (wrapLama && wrapLama.__pop && wrapLama.__pop.parentNode) {
            wrapLama.__pop.parentNode.removeChild(wrapLama.__pop);
          }
          pilarCell.innerHTML = '<span class="muted" style="font-size:10px;padding-left:4px">(Tanpa pilar)</span>';
        }
      }

      // 2. Update aksi cell
      var aksiCell = document.getElementById('jrbAksiCell_' + idx);
      if (aksiCell) {
        if (kat === 'ump') {
          aksiCell.innerHTML = '<button type="button" class="btn btn-xs ' + (t.rincianUmp && t.rincianUmp.length ? 'btn-primary' : 'btn-ghost') + '" style="font-size:10px;padding:2px 5px" onclick="LZJurnalBank.bukaModalPecahUmp(' + idx + ')">Pecah Detail</button>';
        } else {
          aksiCell.innerHTML = '';
        }
      }

      // 3. Update nama input jika berubah ke Setor Tunai
      var inpNama = document.getElementById('jrbInpNama_' + idx);
      if (inpNama) {
        inpNama.value = t.namaDonatur;
      }

      // 4. Update nominal text color
      var nomCell = document.getElementById('jrbNomCell_' + idx);
      if (nomCell) {
        nomCell.style.color = t.isMasuk ? 'var(--green)' : 'var(--red)';
      }

      // 5. Sinkronisasi tampilan dropdown kategori (jika terpanggil secara terprogram)
      var selKat = document.getElementById('jrbSelKat_' + idx);
      if (selKat && selKat !== el) {
        selKat.value = kat;
        var prevKat = selKat.previousSibling;
        if (prevKat && prevKat.classList && prevKat.classList.contains('select-enhanced')) {
          var btnKatText = prevKat.querySelector('.select-enhanced-btn span');
          if (btnKatText && selKat.options[selKat.selectedIndex]) {
            btnKatText.textContent = selKat.options[selKat.selectedIndex].textContent;
          }
          var popKat = prevKat.__pop;
          if (popKat) {
            popKat.querySelectorAll('.dropdown-item').forEach(function(item, i) {
              item.classList.toggle('active', selKat.selectedIndex === i);
            });
          }
        }
      }
    }

    segarkanRingkasanBar();
  }

  function ubahNamaDonatur(arg1, arg2) {
    var el = typeof arg1 === 'object' ? arg1 : null;
    var idx = typeof arg1 === 'number' ? arg1 : Number(arg2);
    var nama = el ? el.value : String(arg2);

    if (STATE.transaksi[idx]) {
      STATE.transaksi[idx].namaDonatur = nama;
    }
  }

  function ubahDetailJurnal(arg1, arg2) {
    var el = typeof arg1 === 'object' ? arg1 : null;
    var idx = typeof arg1 === 'number' ? arg1 : Number(arg2);
    var val = el ? el.value : String(arg2);

    if (STATE.transaksi[idx]) {
      STATE.transaksi[idx].detailJurnal = val;
    }
  }

  function ubahPilar(arg1, arg2) {
    var el = typeof arg1 === 'object' ? arg1 : null;
    var idx = typeof arg1 === 'number' ? arg1 : Number(arg2);
    var pilar = el ? el.value : String(arg2);

    if (STATE.transaksi[idx]) {
      STATE.transaksi[idx] = sesuaikanBaris(STATE.transaksi[idx], { pilar: pilar });
      var selP = document.getElementById('jrbSelPilar_' + idx);
      if (selP && selP !== el) {
        selP.value = pilar;
        var prevP = selP.previousSibling;
        if (prevP && prevP.classList && prevP.classList.contains('select-enhanced')) {
          var btnPText = prevP.querySelector('.select-enhanced-btn span');
          if (btnPText && selP.options[selP.selectedIndex]) {
            btnPText.textContent = selP.options[selP.selectedIndex].textContent;
          }
          var popP = prevP.__pop;
          if (popP) {
            popP.querySelectorAll('.dropdown-item').forEach(function(item, i) {
              item.classList.toggle('active', selP.selectedIndex === i);
            });
          }
        }
      }
    }
  }

  function setKantorCepat(arg1, arg2) {
    var el = typeof arg1 === 'object' ? arg1 : null;
    var idx = typeof arg1 === 'number' ? arg1 : Number(arg2);
    var fullNama = el ? el.value : String(arg2 || '');

    var t = STATE.transaksi[idx];
    if (!t) return;

    STATE.transaksi[idx] = sesuaikanBaris(t, { kantor: fullNama });
    t = STATE.transaksi[idx];

    // In-place update: update input nama & dropdown value WITHOUT re-rendering table!
    var inpNama = document.getElementById('jrbInpNama_' + idx);
    if (inpNama) inpNama.value = t.namaDonatur;

    var selLay = document.getElementById('jrbSelLay_' + idx);
    if (selLay && selLay !== el) {
      selLay.value = fullNama;
      var prevLay = selLay.previousSibling;
      if (prevLay && prevLay.classList && prevLay.classList.contains('select-enhanced')) {
        var btnLayText = prevLay.querySelector('.select-enhanced-btn span');
        if (btnLayText && selLay.options[selLay.selectedIndex]) {
          btnLayText.textContent = selLay.options[selLay.selectedIndex].textContent;
        }
        var popLay = prevLay.__pop;
        if (popLay) {
          popLay.querySelectorAll('.dropdown-item').forEach(function(item, i) {
            item.classList.toggle('active', selLay.selectedIndex === i);
          });
        }
      }
    }
  }

  function setSetorTunaiCepat(idx) {
    if (STATE.transaksi[idx]) {
      var selKat = document.getElementById('jrbSelKat_' + idx);
      if (selKat) {
        selKat.value = 'setor';
        ubahKategori(selKat, idx);
      } else {
        ubahKategori(idx, 'setor');
      }
    }
  }

  // Pecah UMP sub-modal controller
  function bukaModalPecahUmp(idx) {
    var tx = STATE.transaksi[idx];
    if (!tx) return;
    var rincianAwal = (tx.rincianUmp && tx.rincianUmp.length) ? tx.rincianUmp.slice() : [
      { uraian: 'Rincian 1 ' + (tx.kantor || ''), pilar: tx.pilar || 'Pendidikan', nominal: tx.nominal }
    ];
    STATE.modalPecahUmp = {
      idx: idx,
      rincian: rincianAwal
    };
    gambarModal();
  }

  function tutupModalPecahUmp() {
    STATE.modalPecahUmp = null;
    var subBg = document.getElementById('jrbSubModalBg');
    if (subBg) subBg.remove();
  }

  function bacaInputRincianDariDOM() {
    if (!STATE.modalPecahUmp) return;
    var list = document.getElementById('jrbRincianRowsList');
    if (!list) return;
    var rows = list.querySelectorAll('.jrb-rincian-row');
    rows.forEach(function(r, idx) {
      if (!STATE.modalPecahUmp.rincian[idx]) return;
      var inps = r.querySelectorAll('input');
      var sel = r.querySelector('select');
      if (inps[0]) STATE.modalPecahUmp.rincian[idx].uraian = inps[0].value;
      if (sel) STATE.modalPecahUmp.rincian[idx].pilar = sel.value;
      if (inps[1]) STATE.modalPecahUmp.rincian[idx].nominal = Number(inps[1].value) || 0;
    });
  }

  function tambahRincianItem() {
    if (!STATE.modalPecahUmp) return;
    bacaInputRincianDariDOM();
    STATE.modalPecahUmp.rincian.push({
      uraian: '',
      pilar: 'Pendidikan',
      nominal: 0
    });
    var subBg = document.getElementById('jrbSubModalBg');
    if (subBg) subBg.remove();
    var host = document.getElementById('jrbModalBodyHost');
    if (host) host.insertAdjacentHTML('beforeend', gambarModalPecahUmpHTML(STATE.modalPecahUmp));
    segarkanStatusPecahUmp();
  }

  function hapusRincianItem(rIdx) {
    if (!STATE.modalPecahUmp) return;
    bacaInputRincianDariDOM();
    STATE.modalPecahUmp.rincian.splice(rIdx, 1);
    var subBg = document.getElementById('jrbSubModalBg');
    if (subBg) subBg.remove();
    var host = document.getElementById('jrbModalBodyHost');
    if (host) host.insertAdjacentHTML('beforeend', gambarModalPecahUmpHTML(STATE.modalPecahUmp));
    segarkanStatusPecahUmp();
  }

  function ubahRincianItem(rIdx, key, val) {
    if (!STATE.modalPecahUmp || !STATE.modalPecahUmp.rincian[rIdx]) return;
    if (key === 'nominal') val = Number(val) || 0;
    STATE.modalPecahUmp.rincian[rIdx][key] = val;
    segarkanStatusPecahUmp();
  }

  function segarkanStatusPecahUmp() {
    if (!STATE.modalPecahUmp) return;
    var tx = STATE.transaksi[STATE.modalPecahUmp.idx];
    if (!tx) return;
    var sum = (STATE.modalPecahUmp.rincian || []).reduce(function(a, b) {
      return a + (Number(b.nominal) || 0);
    }, 0);
    var selisih = tx.nominal - sum;
    var isPas = selisih === 0;

    var badge = document.getElementById('jrbUmpStatusBadge');
    if (badge) {
      badge.className = 'badge ' + (isPas ? 'green' : 'red');
      badge.textContent = isPas ? '✓ Sesuai (Pas ' + rp(sum) + ')' : 'Selisih ' + rp(Math.abs(selisih)) + (selisih > 0 ? ' kurang' : ' lebih');
    }
    var btn = document.getElementById('jrbBtnTerapkanUmp');
    if (btn) {
      btn.disabled = !isPas;
    }
  }

  function terapkanRincianUmp() {
    if (!STATE.modalPecahUmp) return;
    bacaInputRincianDariDOM();
    var idx = STATE.modalPecahUmp.idx;
    var tx = STATE.transaksi[idx];
    var rincian = STATE.modalPecahUmp.rincian;

    var cek = validasiPecahUmp(tx.nominal, rincian);
    if (!cek.valid) {
      alert('Total rincian UMP belum sama dengan nominal transfer (selisih ' + rp(cek.selisih) + ').');
      return;
    }

    var expanded = terapkanPecahUmp(tx, rincian);
    STATE.transaksi.splice(idx, 1, ...expanded);
    STATE.modalPecahUmp = null;
    gambarModal();
  }

  // Export / Aksi Jurnal
  function salinTSV() {
    var tsv = bangunTSVJurnal(STATE.transaksi, STATE.rekeningTerpilih);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(function() {
        if (typeof window !== 'undefined' && window.toast) window.toast('Teks TSV Jurnal berhasil disalin ke clipboard.');
        else alert('Teks TSV Jurnal berhasil disalin.');
      });
    } else {
      alert('Salin teks berikut:\n\n' + tsv.slice(0, 500) + '...');
    }
  }

  function unduhExcel() {
    if (typeof window === 'undefined' || !window.XLSX) {
      alert('Pustaka Excel belum siap.');
      return;
    }
    var wb = bangunExcelJurnal(STATE.transaksi, STATE.rekeningTerpilih, window.XLSX);
    var namaRek = (STATE.rekeningTerpilih && STATE.rekeningTerpilih.nomor) ? STATE.rekeningTerpilih.nomor : 'rekening';
    window.XLSX.writeFile(wb, 'Jurnal_Mutasi_' + namaRek + '_' + (new Date().toISOString().slice(0, 10)) + '.xlsx');
    if (typeof window !== 'undefined' && window.toast) window.toast('Berkas Excel Jurnal berhasil diunduh.');
  }

  function imporKeSistem() {
    var tsv = bangunTSVJurnal(STATE.transaksi, STATE.rekeningTerpilih);
    if (!tsv.trim()) {
      alert('Tidak ada transaksi yang dipilih untuk diimpor.');
      return;
    }

    tutupModal();

    if (typeof window !== 'undefined' && typeof window.openImportModal === 'function') {
      window.openImportModal('himpun', 'berkas');
      setTimeout(function() {
        if (typeof window.setImportTab === 'function') window.setImportTab('text');
        var txtArea = document.getElementById('import_text');
        if (txtArea) {
          txtArea.value = tsv;
          if (typeof window.processImportText === 'function') {
            window.processImportText();
          }
        }
      }, 300);
    }
  }

  return {
    PILAR: PILAR,
    normalTanggal: normalTanggal,
    deteksiRekening: deteksiRekening,
    cocokkanRekening: cocokkanRekening,
    muatPdfJs: muatPdfJs,
    parseBpdPdf: parseBpdPdf,
    parseBsiPdf: parseBsiPdf,
    analisisTransaksi: analisisTransaksi,
    sesuaikanBaris: sesuaikanBaris,
    validasiPecahUmp: validasiPecahUmp,
    terapkanPecahUmp: terapkanPecahUmp,
    bangunTSVJurnal: bangunTSVJurnal,
    bangunExcelJurnal: bangunExcelJurnal,

    // UI Controller
    bukaModal: bukaModal,
    tutupModal: tutupModal,
    pilihBank: pilihBank,
    prosesBerkas: prosesBerkas,
    gantiRekeningSistem: gantiRekeningSistem,
    lanjutKeLangkah2: lanjutKeLangkah2,
    kembaliKeLangkah1: kembaliKeLangkah1,
    filterTabel: filterTabel,
    cariTeks: cariTeks,
    filterTipe: filterTipe,
    togglePilihSemua: togglePilihSemua,
    ubahPilihan: ubahPilihan,
    ubahTanggal: ubahTanggal,
    ubahTipe: ubahTipe,
    ubahKategori: ubahKategori,
    ubahNamaDonatur: ubahNamaDonatur,
    ubahPilar: ubahPilar,
    setKantorCepat: setKantorCepat,
    setSetorTunaiCepat: setSetorTunaiCepat,
    bukaModalPecahUmp: bukaModalPecahUmp,
    tutupModalPecahUmp: tutupModalPecahUmp,
    tambahRincianItem: tambahRincianItem,
    hapusRincianItem: hapusRincianItem,
    ubahRincianItem: ubahRincianItem,
    terapkanRincianUmp: terapkanRincianUmp,
    salinTSV: salinTSV,
    unduhExcel: unduhExcel,
    imporKeSistem: imporKeSistem,
    bersihkanUraianBank: bersihkanUraianBank,
    ubahDetailJurnal: ubahDetailJurnal,
    _state: STATE
  };
});
