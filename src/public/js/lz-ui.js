/* js/lz-ui.js — penyelaras <select> dan pemilih tanggal khas LAZDigital
 *
 * Aslinya menyatu di app.js. Dipisah ke sini supaya halaman lain — Broadcast,
 * dan halaman apa pun setelahnya — memakai dropdown yang BENAR-BENAR sama,
 * bukan tiruan yang mirip. Dropdown adalah bagian yang paling cepat terlihat
 * berbeda kalau ditulis dua kali: tinggi baris, jarak huruf, dan cara popover
 * menempel selalu meleset sedikit, dan "sedikit" itu yang membuat satu halaman
 * terasa bukan bagian dari aplikasi yang sama.
 *
 * Berkas ini berdiri sendiri: tidak memanggil apa pun dari app.js. Yang
 * dibutuhkannya hanya kelas-kelas di styles.css (.custom-dropdown, .btn-dropdown,
 * .dropdown-popover, .dropdown-item, .calendar-*).
 *
 * CATATAN: app.js masih memegang salinannya sendiri. Keduanya sengaja belum
 * disatukan: app.js berukuran setengah megabita dan dipakai setiap hari, jadi
 * membedahnya di tengah pekerjaan Broadcast menaruh risiko besar di tempat yang
 * tidak ada hubungannya. Kalau app.js dirapikan nanti, hapus blok enhancer di
 * sana lalu muat berkas ini dari index.html.
 *
 * Dua kopling khas modul keuangan sudah dilepas: id "f_rekeningId" yang dulu
 * ditulis langsung di dalam kode kini jadi penanda umum lewat atribut
 * data-tunda-kosong dan data-selalu-cari.
 */
(function () {
'use strict';

var BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
             'Agustus', 'September', 'Oktober', 'November', 'Desember'];

var IKON_KALENDER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

function el(id) { return document.getElementById(id); }

var _POP_DAFTAR = [];

function popUkur(btn, pop){
  var r = btn.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  /* Kalender tidak boleh dipotong lalu digulir — bentuknya harus utuh,
     jadi tingginya dibiarkan apa adanya dan letaknya yang digeser. */
  var kaku = pop.classList.contains('datepicker-enhanced-popover');

  var minLebar = pop.classList.contains('rt-pop') ? 304 : (kaku ? 268 : 210);
  var lebar = Math.min(Math.max(r.width, minLebar), vw - 16);
  var kiri  = Math.min(Math.max(8, r.left), Math.max(8, vw - lebar - 8));

  pop.style.position = 'fixed';
  pop.style.width = lebar + 'px';
  pop.style.left = kiri + 'px';
  pop.style.right = 'auto';
  pop.style.margin = '0';

  if (kaku){
    pop.style.setProperty('max-height', 'none', 'important');
    var perlu = Math.min(pop.offsetHeight || 340, vh - 16);
    var atas = r.bottom + 6;
    if (atas + perlu > vh - 8) atas = r.top - 6 - perlu;        // coba buka ke atas
    if (atas < 8) atas = Math.max(8, vh - perlu - 8);           // masih mepet: rapatkan ke tepi layar
    pop.style.bottom = 'auto';
    pop.style.top = atas + 'px';
    pop.style.transformOrigin = (atas < r.top ? 'bottom left' : 'top left');
    return;
  }

  var ruangBawah = vh - r.bottom - 14;
  var ruangAtas  = r.top - 14;
  var keAtas = (ruangBawah < 240 && ruangAtas > ruangBawah);
  var tinggi = Math.max(150, Math.min(420, keAtas ? ruangAtas : ruangBawah));

  pop.style.setProperty('max-height', tinggi + 'px', 'important');
  if (keAtas){
    pop.style.top = 'auto';
    pop.style.bottom = (vh - r.top + 6) + 'px';
    pop.style.transformOrigin = 'bottom left';
  } else {
    pop.style.bottom = 'auto';
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.transformOrigin = 'top left';
  }

  var cari = pop.querySelector('.dropdown-search');
  var sec  = pop.querySelector('.dropdown-section');
  if (sec) sec.style.setProperty('max-height', Math.max(90, tinggi - (cari ? 52 : 10)) + 'px', 'important');
}

function popTutupSemua(kecuali){
  document.querySelectorAll('.select-enhanced-popover, .datepicker-enhanced-popover').forEach(function(p){
    if (p !== kecuali) p.classList.add('hidden');
  });
}

function popDaftarkan(btn, pop){
  var ada = false;
  _POP_DAFTAR.forEach(function(x){ if (x.pop === pop) ada = true; });
  if (!ada) _POP_DAFTAR.push({ btn: btn, pop: pop });
}

function popBuka(btn, pop){
  if (pop.parentNode !== document.body) document.body.appendChild(pop);
  popDaftarkan(btn, pop);
  pop.classList.remove('hidden');
  popUkur(btn, pop);
}

/* Buang daftar yatim: tombol pemiliknya sudah hilang dari halaman
   (mis. panel di-render ulang) supaya tidak menumpuk di <body>. */
function popBersihkan(){
  for (var i = _POP_DAFTAR.length - 1; i >= 0; i--){
    var x = _POP_DAFTAR[i];
    if (!document.body.contains(x.btn)){
      if (x.pop.parentNode) x.pop.parentNode.removeChild(x.pop);
      _POP_DAFTAR.splice(i, 1);
    }
  }
}

(function(){
  function ikuti(){
    for (var i = _POP_DAFTAR.length - 1; i >= 0; i--){
      var x = _POP_DAFTAR[i];
      if (!document.body.contains(x.btn)) continue;
      if (!x.pop.classList.contains('hidden')) popUkur(x.btn, x.pop);
    }
  }
  window.addEventListener('scroll', ikuti, true);
  window.addEventListener('resize', ikuti);
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') popTutupSemua(null);
  });
})();

/* Sorot pilihan dengan panah atas/bawah lalu Enter. */
function popSorot(pop, arah){
  var items = [].slice.call(pop.querySelectorAll('.dropdown-item')).filter(function(it){ return it.style.display !== 'none'; });
  if (!items.length) return;
  var kini = -1;
  items.forEach(function(it, i){ if (it.classList.contains('sorot')) kini = i; });
  if (kini < 0) items.forEach(function(it, i){ if (it.classList.contains('active')) kini = i; });
  var next = kini + arah;
  if (next < 0) next = items.length - 1;
  if (next >= items.length) next = 0;
  items.forEach(function(it){ it.classList.remove('sorot'); });
  items[next].classList.add('sorot');
  items[next].scrollIntoView({ block: 'nearest' });
}
function popPilihSorotan(pop){
  var it = pop.querySelector('.dropdown-item.sorot') ||
           [].slice.call(pop.querySelectorAll('.dropdown-item')).filter(function(x){ return x.style.display !== 'none'; })[0];
  if (it) it.click();
}

function enhanceSelects(containerId) {
  var parent = containerId ? (typeof containerId === 'string' ? el(containerId) : containerId) : document;
  if (!parent) return;

  popBersihkan();

  var wrappers = parent.querySelectorAll('.select-enhanced');
  wrappers.forEach(function(w) {
    var sel = w.nextSibling;
    if (!sel || sel.tagName !== 'SELECT') {
      if (w.__pop && w.__pop.parentNode) w.__pop.parentNode.removeChild(w.__pop);
      w.remove();
    }
  });

  var selects = parent.querySelectorAll('select');
  selects.forEach(function(sel) {
    if (sel.dataset.tundaKosong === '1' && sel.options.length <= 1 && sel.options[0] && sel.options[0].value === '') {
      return;
    }

    var prev = sel.previousSibling;
    if (prev && prev.classList && prev.classList.contains('select-enhanced')) {
      var popLama = prev.__pop;
      var popItems = popLama ? popLama.querySelectorAll('.dropdown-item') : [];
      if (popLama && popItems.length === sel.options.length) {
        /* isi masih sama — cukup segarkan label & tanda pilihan */
        var btnText = prev.querySelector('.select-enhanced-btn span');
        if (btnText && sel.options[sel.selectedIndex]) {
          btnText.textContent = sel.options[sel.selectedIndex].textContent;
        }
        popItems.forEach(function(item, idx) {
          item.classList.toggle('active', sel.selectedIndex === idx);
          item.classList.remove('sorot');
        });
        return;
      }
      if (popLama && popLama.parentNode) popLama.parentNode.removeChild(popLama);
      prev.remove();
    }

    sel.style.display = 'none';

    var container = document.createElement('div');
    container.className = 'custom-dropdown select-enhanced';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-dropdown select-enhanced-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');

    var btnText = document.createElement('span');
    btnText.className = 'sel-teks';
    btnText.textContent = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '- pilih -';
    btn.appendChild(btnText);

    var chevron = document.createElement('span');
    chevron.className = 'sel-chev';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    btn.appendChild(chevron);

    var popover = document.createElement('div');
    popover.className = 'dropdown-popover select-enhanced-popover sel-pop hidden';
    popover.setAttribute('role', 'listbox');

    var searchInput = null;
    if (sel.options.length > 6 || sel.dataset.selaluCari === '1') {
      var searchDiv = document.createElement('div');
      searchDiv.className = 'dropdown-search';
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Cari…';
      searchInput.className = 'dropdown-search-input';
      searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
      searchDiv.appendChild(searchInput);
      popover.appendChild(searchDiv);
    }

    var section = document.createElement('div');
    section.className = 'dropdown-section';

    for (var i = 0; i < sel.options.length; i++) {
      var opt = sel.options[i];
      var item = document.createElement('div');
      item.className = 'dropdown-item' + (sel.selectedIndex === i ? ' active' : '');
      item.setAttribute('role', 'option');
      item.textContent = opt.textContent;
      item.setAttribute('data-value', opt.value);

      item.addEventListener('click', (function(oIdx, text) {
        return function(e) {
          e.stopPropagation();
          sel.selectedIndex = oIdx;
          btnText.textContent = text;
          var evt = document.createEvent('HTMLEvents');
          evt.initEvent('change', true, true);
          sel.dispatchEvent(evt);
          if (sel.onchange) sel.onchange();
          popover.classList.add('hidden');
          btn.setAttribute('aria-expanded', 'false');
          section.querySelectorAll('.dropdown-item').forEach(function(x, k){
            x.classList.toggle('active', k === oIdx);
            x.classList.remove('sorot');
          });
        };
      })(i, opt.textContent));

      section.appendChild(item);
    }

    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        var q = e.target.value.toLowerCase().trim();
        var terlihat = 0;
        section.querySelectorAll('.dropdown-item').forEach(function(item) {
          var cocok = item.textContent.toLowerCase().indexOf(q) >= 0;
          item.style.display = cocok ? '' : 'none';
          item.classList.remove('sorot');
          if (cocok) terlihat++;
        });
        var kosong = popover.querySelector('.dropdown-kosong');
        if (!terlihat) {
          if (!kosong) {
            kosong = document.createElement('div');
            kosong.className = 'dropdown-kosong';
            kosong.textContent = 'Tidak ada yang cocok';
            section.appendChild(kosong);
          }
          kosong.style.display = '';
        } else if (kosong) { kosong.style.display = 'none'; }
      });
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); popSorot(popover, 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); popSorot(popover, -1); }
        else if (e.key === 'Enter') { e.preventDefault(); popPilihSorotan(popover); }
      });
    }

    popover.appendChild(section);
    container.appendChild(btn);
    container.__pop = popover;

    sel.parentNode.insertBefore(container, sel);

    btn.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (popover.classList.contains('hidden')) btn.click();
        else popSorot(popover, e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key === 'Enter' && !popover.classList.contains('hidden')) {
        e.preventDefault(); popPilihSorotan(popover);
      }
    });

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var tertutup = popover.classList.contains('hidden');
      popTutupSemua(popover);
      if (!tertutup) {
        popover.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      popBuka(btn, popover);
      btn.setAttribute('aria-expanded', 'true');
      section.querySelectorAll('.dropdown-item').forEach(function(x){
        x.classList.remove('sorot');
        x.style.display = '';
      });
      var kosong = popover.querySelector('.dropdown-kosong');
      if (kosong) kosong.style.display = 'none';
      /* pilihan yang sedang aktif ditaruh di tengah daftar supaya jelas
         masih ada pilihan di atas maupun di bawahnya */
      var aktif = section.querySelector('.dropdown-item.active');
      if (aktif) aktif.scrollIntoView({ block: 'center' });
      if (searchInput) {
        searchInput.value = '';
        setTimeout(function(){ searchInput.focus(); }, 30);
      }
    });
  });
}

/* v8: dulu blok ini memindai SELURUH DOM tiap 250ms (4x per detik, selamanya)
   walau tidak ada yang berubah — sumber jank yang konstan, terasa saat mengetik
   dan scroll. Sekarang scan hanya jalan kalau DOM benar-benar berubah:
   MutationObserver menandai "kotor", tick 800ms yang mengerjakannya, observer
   dilepas selama proses agar perubahan buatannya sendiri tidak memicu loop. */
var __enhDirty = true, __enhObs = null;
function runEnhancers() {
  if (document.hidden || !__enhDirty) return;
  __enhDirty = false;
  if (__enhObs) __enhObs.disconnect();
  try {
    enhanceSelects();
    enhanceDatePickers();
  } catch(e) {}
  if (__enhObs && document.body) {
    __enhObs.observe(document.body, { childList: true, subtree: true });
  }
}
(function() {
  function start() {
    __enhObs = new MutationObserver(function() { __enhDirty = true; });
    __enhObs.observe(document.body, { childList: true, subtree: true });
    runEnhancers();
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  setInterval(runEnhancers, 800);
  // jaring pengaman: paksa satu scan tiap 5 detik kalau ada perubahan yang terlewat
  setInterval(function() { __enhDirty = true; }, 5000);
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) { __enhDirty = true; runEnhancers(); }
  });
})();

function formatIndoDate(dStr) {
  if (!dStr) return '- pilih tanggal -';
  var parts = dStr.split('T')[0].split('-');
  if (parts.length === 3) {
    var day = Number(parts[2]);
    var month = Number(parts[1]);
    var year = Number(parts[0]);
    return day + ' ' + (BULAN[month] || '') + ' ' + year;
  }
  return dStr;
}

function renderCalendarGrid(container, selectedDateStr, currentViewDate, onSelect) {
  var viewYear = currentViewDate.getFullYear();
  var viewMonth = currentViewDate.getMonth();
  
  var selected = selectedDateStr ? new Date(selectedDateStr) : null;
  
  var header = document.createElement('div');
  header.className = 'calendar-header';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '10px 14px';
  header.style.borderBottom = '1px solid var(--border)';
  
  var prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'calendar-nav-btn';
  prevBtn.innerHTML = '‹';
  prevBtn.onclick = function(e) {
    e.stopPropagation();
    currentViewDate.setMonth(viewMonth - 1);
    rebuild();
  };
  
  var title = document.createElement('div');
  title.className = 'calendar-title';
  title.style.fontWeight = '700';
  title.style.fontSize = '13.5px';
  title.textContent = (BULAN[viewMonth + 1] || '') + ' ' + viewYear;
  title.style.cursor = 'pointer';
  title.onclick = function(e) {
    e.stopPropagation();
    renderYearPicker(container, selectedDateStr, currentViewDate, onSelect);
  };
  
  var nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'calendar-nav-btn';
  nextBtn.innerHTML = '›';
  nextBtn.onclick = function(e) {
    e.stopPropagation();
    currentViewDate.setMonth(viewMonth + 1);
    rebuild();
  };
  
  header.appendChild(prevBtn);
  header.appendChild(title);
  header.appendChild(nextBtn);
  
  var grid = document.createElement('div');
  grid.className = 'calendar-grid';
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '4px';
  grid.style.padding = '10px';
  
  var weekdays = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  weekdays.forEach(function(day) {
    var cell = document.createElement('div');
    cell.className = 'calendar-weekday';
    cell.textContent = day;
    cell.style.textAlign = 'center';
    cell.style.fontSize = '11px';
    cell.style.fontWeight = '600';
    cell.style.color = 'var(--muted)';
    cell.style.padding = '4px 0';
    grid.appendChild(cell);
  });
  
  var firstDayIdx = new Date(viewYear, viewMonth, 1).getDay();
  var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  
  var prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  for (var i = firstDayIdx - 1; i >= 0; i--) {
    var cell = document.createElement('div');
    cell.className = 'calendar-cell calendar-cell-muted';
    cell.textContent = prevMonthDays - i;
    cell.style.textAlign = 'center';
    cell.style.padding = '6px 0';
    cell.style.fontSize = '12px';
    cell.style.opacity = '0.3';
    grid.appendChild(cell);
  }
  
  for (var day = 1; day <= daysInMonth; day++) {
    var cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.textContent = day;
    cell.style.textAlign = 'center';
    cell.style.padding = '6px 0';
    cell.style.fontSize = '12px';
    cell.style.borderRadius = '6px';
    cell.style.cursor = 'pointer';
    cell.style.fontWeight = '500';
    cell.style.color = 'var(--text)';
    
    var cellDateStr = viewYear + '-' + ('0' + (viewMonth + 1)).slice(-2) + '-' + ('0' + day).slice(-2);
    
    if (selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day) {
      cell.className += ' calendar-cell-selected';
      cell.style.background = 'var(--accent)';
      cell.style.color = '#fff';
      cell.style.fontWeight = '700';
    }
    
    cell.onclick = (function(dStr) {
      return function(e) {
        e.stopPropagation();
        onSelect(dStr);
      };
    })(cellDateStr);
    
    grid.appendChild(cell);
  }
  
  container.innerHTML = '';
  container.appendChild(header);
  container.appendChild(grid);
  
  function rebuild() {
    renderCalendarGrid(container, selectedDateStr, currentViewDate, onSelect);
  }
}

function renderYearPicker(container, selectedDateStr, currentViewDate, onSelect) {
  var header = document.createElement('div');
  header.className = 'calendar-header';
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.padding = '10px 14px';
  header.style.borderBottom = '1px solid var(--border)';
  
  var title = document.createElement('div');
  title.style.fontWeight = '700';
  title.style.fontSize = '13.5px';
  title.textContent = 'Pilih Tahun';
  
  var backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'calendar-nav-btn';
  backBtn.innerHTML = '←';
  backBtn.onclick = function(e) {
    e.stopPropagation();
    renderCalendarGrid(container, selectedDateStr, currentViewDate, onSelect);
  };
  
  header.appendChild(title);
  header.appendChild(backBtn);
  
  var grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
  grid.style.gap = '8px';
  grid.style.padding = '12px';
  grid.style.maxHeight = '180px';
  grid.style.overflowY = 'auto';
  
  var curYear = new Date().getFullYear();
  for (var y = curYear + 5; y >= curYear - 10; y--) {
    var cell = document.createElement('div');
    cell.textContent = y;
    cell.style.textAlign = 'center';
    cell.style.padding = '8px 0';
    cell.style.fontSize = '13px';
    cell.style.cursor = 'pointer';
    cell.style.borderRadius = '6px';
    cell.style.color = 'var(--text)';
    
    if (y === currentViewDate.getFullYear()) {
      cell.style.background = 'var(--accent-soft)';
      cell.style.color = 'var(--accent-d)';
      cell.style.fontWeight = '700';
    }
    
    cell.onclick = (function(yr) {
      return function(e) {
        e.stopPropagation();
        currentViewDate.setFullYear(yr);
        renderCalendarGrid(container, selectedDateStr, currentViewDate, onSelect);
      };
    })(y);
    
    grid.appendChild(cell);
  }
  
  container.innerHTML = '';
  container.appendChild(header);
  container.appendChild(grid);
}

function enhanceDatePickers(containerId) {
  var parent = containerId ? (typeof containerId === 'string' ? el(containerId) : containerId) : document;
  if (!parent) return;
  
  var wrappers = parent.querySelectorAll('.datepicker-enhanced');
  wrappers.forEach(function(w) {
    var inp = w.nextSibling;
    if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'date') {
      if (w.__pop && w.__pop.parentNode) w.__pop.parentNode.removeChild(w.__pop);
      w.remove();
    }
  });

  var dateInputs = parent.querySelectorAll('input[type="date"]');
  dateInputs.forEach(function(inp) {
    var prev = inp.previousSibling;
    if (prev && prev.classList && prev.classList.contains('datepicker-enhanced')) {
      var btnText = prev.querySelector('.datepicker-enhanced-btn span');
      if (btnText) {
        btnText.textContent = formatIndoDate(inp.value);
      }
      return;
    }
    
    inp.style.display = 'none';
    
    var container = document.createElement('div');
    container.className = 'custom-dropdown datepicker-enhanced';
    container.__pop = null;
    container.style.width = '100%';
    
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-dropdown datepicker-enhanced-btn';
    btn.style.width = '100%';
    btn.style.justifyContent = 'space-between';
    
    btn.style.background = 'var(--surface)';
    btn.style.border = '1px solid var(--border)';
    btn.style.color = 'var(--text)';
    btn.style.padding = '10px 12px';
    btn.style.borderRadius = '10px';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '500';
    btn.style.minWidth = '0';
    
    var btnText = document.createElement('span');
    btnText.textContent = formatIndoDate(inp.value);
    btn.appendChild(btnText);
    
    var calendarIcon = document.createElement('span');
    calendarIcon.innerHTML = IKON_KALENDER;
    calendarIcon.style.fontSize = '13px';
    calendarIcon.style.opacity = '0.6';
    btn.appendChild(calendarIcon);
    
    var popover = document.createElement('div');
    popover.className = 'dropdown-popover datepicker-enhanced-popover hidden';
    popover.style.width = '260px';
    popover.style.left = '0';
    popover.style.right = 'auto';
    popover.style.boxSizing = 'border-box';
    popover.style.padding = '0';
    popover.style.background = 'var(--surface)';
    popover.style.border = '1px solid var(--border)';
    
    container.appendChild(btn);
    container.__pop = popover;

    inp.parentNode.insertBefore(container, inp);

    var currentViewDate = inp.value ? new Date(inp.value) : new Date();
    
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isHidden = popover.classList.contains('hidden');
      document.querySelectorAll('.datepicker-enhanced-popover, .select-enhanced-popover').forEach(function(p) {
        p.classList.add('hidden');
      });
      if (isHidden) {
        popBuka(btn, popover);   /* kalender ikut dipasang di <body> agar tidak terpotong kartu */
        renderCalendarGrid(popover, inp.value, currentViewDate, function(selectedDateStr) {
          inp.value = selectedDateStr;
          btnText.textContent = formatIndoDate(selectedDateStr);
          
          var evt = document.createEvent('HTMLEvents');
          evt.initEvent('change', true, true);
          inp.dispatchEvent(evt);
          if (inp.onchange) inp.onchange();
          
          popover.classList.add('hidden');
        });
        /* Tinggi kalender baru diketahui setelah gridnya digambar, dan berubah
           lagi saat ganti bulan (5 atau 6 baris), jadi letaknya dihitung ulang
           supaya kotaknya selalu utuh di layar. */
        popUkur(btn, popover);
        if (!popover.__ukurTerpasang) {
          popover.__ukurTerpasang = true;
          popover.addEventListener('click', function(){
            setTimeout(function(){
              if (!popover.classList.contains('hidden')) popUkur(btn, popover);
            }, 0);
          });
        }
      }
    });
  });
}

/* Klik di luar menutup daftar. Daftar sekarang berada di <body>, jadi
   pengecekan tidak bisa lagi lewat .closest('.custom-dropdown') dari
   popovernya — yang diperiksa adalah letak klik itu sendiri. */
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('.select-enhanced-popover, .datepicker-enhanced-popover, .custom-dropdown, .rt')) return;
  popTutupSemua(null);
});

/* ============================================================
   PEMILIH RENTANG TANGGAL
   ------------------------------------------------------------
   Satu tombol, satu kalender. Klik pertama menetapkan tanggal awal, klik kedua
   tanggal akhir. Tidak ada dua kotak tanggal terpisah.

   KENAPA BUKAN DUA <input type="date">.
   Dua kotak terpisah memaksa orang menghitung sendiri: "tanggal berapa tujuh
   hari lalu?" Lalu membuka dua kalender, dan tidak ada satu pun layar yang
   memperlihatkan rentang yang sedang dipilih sebagai satu kesatuan. Di sini
   rentangnya terlihat sebagai pita di kalender sejak sebelum klik kedua, dan
   pilihan yang paling sering dipakai tersedia sebagai satu tombol.

   Bentuknya SAMA PERSIS dengan pemilih rentang di halaman utama LAZDigital,
   sampai ke nama kelas CSS-nya (.rt-*, sudah ada di styles.css). Itu bukan
   kebetulan: bagian kecil seperti tinggi baris kalender dan cara pita rentang
   digambar adalah yang paling cepat membuat sebuah halaman terasa bukan bagian
   dari aplikasi yang sama.

   CATATAN SALINAN. app.js masih memegang salinannya sendiri, sama seperti
   penyelaras dropdown di atas, dan alasannya sama: app.js berukuran setengah
   megabita dan dipakai setiap hari. Kalau app.js dirapikan nanti, hapus blok
   PEMILIH RENTANG TANGGAL di sana lalu muat berkas ini dari index.html.
   ============================================================ */
var _RT = {};

function rtEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function rtIso(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function rtUrai(s) {
  var p = String(s || '').split('-');
  if (p.length < 3) return null;
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return isNaN(d.getTime()) ? null : d;
}

var RT_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
                'Agustus', 'September', 'Oktober', 'November', 'Desember'];
var RT_HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/* Pilihan cepat. "Hari ini", "3 hari", dan "7 hari" ada di depan karena itu
   yang ditanyakan tiap pagi; rentang panjang dipakai saat menutup buku, yang
   terjadi sebulan sekali. */
var RT_PRESET = [
  { kode: 'kini', label: 'Hari ini' },
  { kode: '3', label: '3 hari' },
  { kode: '7', label: '7 hari' },
  { kode: '30', label: '30 hari' },
  { kode: 'bln', label: 'Bulan ini' },
  { kode: 'blnLalu', label: 'Bulan lalu' },
  { kode: 'thn', label: 'Tahun ini' }
];

/* "5 – 20 Agustus 2026" bila sebulan, "28 Jul – 3 Agu 2026" bila beda bulan. */
function rtLabel(dari, sampai) {
  var a = rtUrai(dari), b = rtUrai(sampai);
  if (!a || !b) return 'Pilih rentang tanggal';
  var sng = function (d) { return RT_BULAN[d.getMonth()].slice(0, 3); };
  if (dari === sampai) return a.getDate() + ' ' + RT_BULAN[a.getMonth()] + ' ' + a.getFullYear();
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
    return a.getDate() + ' – ' + b.getDate() + ' ' + RT_BULAN[b.getMonth()] + ' ' + b.getFullYear();
  if (a.getFullYear() === b.getFullYear())
    return a.getDate() + ' ' + sng(a) + ' – ' + b.getDate() + ' ' + sng(b) + ' ' + b.getFullYear();
  return a.getDate() + ' ' + sng(a) + ' ' + a.getFullYear() + ' – ' + b.getDate() + ' ' + sng(b) + ' ' + b.getFullYear();
}

function rentangHTML(id, dari, sampai, opsi) {
  opsi = opsi || {};
  var kls = 'rt' + (opsi.rapat ? ' rt-rapat' : '');
  var teks = (dari && sampai) ? rtLabel(dari, sampai) : (opsi.kosong || 'Pilih rentang tanggal');
  return '<div class="' + kls + '" id="' + id + '_wrap">'
    + '<button type="button" class="rt-btn' + ((dari && sampai) ? '' : ' rt-hampa') + '" id="' + id + '_btn" aria-haspopup="dialog">'
    + '<span class="rt-ic" aria-hidden="true">' + IKON_KALENDER + '</span>'
    + '<span class="rt-teks" id="' + id + '_teks">' + rtEsc(teks) + '</span>'
    + '<span class="rt-car" aria-hidden="true">▾</span>'
    + '</button></div>';
}

function rentangNilai(id) {
  var s = _RT[id] || {};
  return { dari: s.dari || '', sampai: s.sampai || '' };
}

function rentangPasang(id, opsi) {
  opsi = opsi || {};
  var btn = el(id + '_btn');
  if (!btn) return;

  /* Popover lama dibuang dulu. Halaman ini menggambar ulang isinya setiap kali
     penyaringnya berubah, dan tanpa pembuangan ini <body> perlahan penuh
     kalender yatim yang tidak terlihat siapa pun. */
  var lama = _RT[id];
  if (lama && lama.pop && lama.pop.parentNode) lama.pop.parentNode.removeChild(lama.pop);

  var pop = document.createElement('div');
  pop.className = 'dropdown-popover datepicker-enhanced-popover rt-pop hidden';

  var s = _RT[id] = {
    dari: opsi.dari || '', sampai: opsi.sampai || '',
    tahap: 'awal', bayang: '', pop: pop, btn: btn,
    onTerap: opsi.onTerap || null,
    bolehKosong: opsi.bolehKosong === true,
    kosong: opsi.kosong || 'Semua tanggal'
  };
  var awal = rtUrai(s.dari) || new Date();
  s.lihat = new Date(awal.getFullYear(), awal.getMonth(), 1);

  pop.addEventListener('mousedown', function (e) { e.stopPropagation(); });
  pop.addEventListener('click', function (e) { e.stopPropagation(); });

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var tertutup = pop.classList.contains('hidden');
    popTutupSemua(pop);
    if (!tertutup) { pop.classList.add('hidden'); return; }
    s.tahap = 'awal'; s.bayang = '';
    var a = rtUrai(s.dari) || new Date();
    s.lihat = new Date(a.getFullYear(), a.getMonth(), 1);
    rtGambar(id);
    popBuka(btn, pop);
  });

  rtGambar(id);
  rtTeksBaru(id);
}

function rtTeksBaru(id) {
  var s = _RT[id]; if (!s) return;
  var isi = !!(s.dari && s.sampai);
  var t = el(id + '_teks');
  if (t) t.textContent = isi ? rtLabel(s.dari, s.sampai) : (s.bolehKosong ? s.kosong : 'Pilih rentang tanggal');
  if (s.btn) s.btn.classList.toggle('rt-hampa', !isi);
}

/* Kosongkan pilihan — dipakai saringan yang boleh "semua tanggal". */
function rtHapus(id) {
  var s = _RT[id]; if (!s) return;
  s.dari = ''; s.sampai = ''; s.tahap = 'awal'; s.bayang = '';
  rtGambar(id); rtTeksBaru(id);
  s.pop.classList.add('hidden');
  if (s.onTerap) s.onTerap('', '');
}

function rtGambar(id) {
  var s = _RT[id]; if (!s) return;
  var v = s.lihat;
  var thn = v.getFullYear(), bln = v.getMonth();
  var pertama = new Date(thn, bln, 1);
  var jmlHari = new Date(thn, bln + 1, 0).getDate();
  var geser = pertama.getDay();
  var hariIni = rtIso(new Date());

  var h = '<div class="rt-preset">' + RT_PRESET.map(function (p) {
    return '<button type="button" class="rt-chip" data-preset="' + p.kode + '">' + rtEsc(p.label) + '</button>';
  }).join('') + '</div>';

  h += '<div class="rt-head">'
    + '<button type="button" class="rt-nav" data-geser="-1" aria-label="Bulan sebelumnya">‹</button>'
    + '<div class="rt-judul">' + RT_BULAN[bln] + ' ' + thn + '</div>'
    + '<button type="button" class="rt-nav" data-geser="1" aria-label="Bulan berikutnya">›</button>'
    + '</div>';

  h += '<div class="rt-hari">' + RT_HARI.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>';
  h += '<div class="rt-grid">';
  for (var i = 0; i < geser; i++) h += '<span class="rt-kosong"></span>';
  for (var d = 1; d <= jmlHari; d++) {
    var iso = thn + '-' + ('0' + (bln + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
    h += '<button type="button" class="rt-sel' + (iso === hariIni ? ' kini' : '') + '" data-iso="' + iso + '">' + d + '</button>';
  }
  h += '</div>';

  h += '<div class="rt-kaki">'
    + '<span class="rt-info" id="' + id + '_info"></span>'
    + (s.bolehKosong ? '<button type="button" class="rt-hapus" data-hapus="1">Semua</button>' : '')
    + '<button type="button" class="rt-terap" data-terap="1">Selesai</button>'
    + '</div>';

  s.pop.innerHTML = h;

  /* Pendengar dipasang di sini, bukan lewat atribut onclick seperti di app.js.
     Atribut onclick menuntut fungsinya berada di ruang nama global halaman;
     berkas ini terbungkus IIFE justru supaya TIDAK menaruh apa-apa di sana
     kecuali yang sengaja dibuka lewat window. */
  s.pop.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () { rtPreset(id, b.getAttribute('data-preset')); });
  });
  s.pop.querySelectorAll('[data-geser]').forEach(function (b) {
    b.addEventListener('click', function () { rtGeser(id, Number(b.getAttribute('data-geser'))); });
  });
  s.pop.querySelectorAll('.rt-sel').forEach(function (b) {
    var iso = b.getAttribute('data-iso');
    b.addEventListener('click', function () { rtKlik(id, iso); });
    b.addEventListener('mouseenter', function () { rtBayang(id, iso); });
  });
  var bHapus = s.pop.querySelector('[data-hapus]');
  if (bHapus) bHapus.addEventListener('click', function () { rtHapus(id); });
  var bTerap = s.pop.querySelector('[data-terap]');
  if (bTerap) bTerap.addEventListener('click', function () { rtTutup(id); });

  rtTandai(id);
  if (!s.pop.classList.contains('hidden')) popUkur(s.btn, s.pop);
}

/* Menandai ujung dan pita rentang dengan mengubah KELAS pada tombol yang sudah
   ada. Membangun ulang seluruh kalender tiap kali kursor pindah hari membuat
   transisi CSS tidak pernah sempat berjalan, dan geraknya patah-patah. */
function rtTandai(id) {
  var s = _RT[id]; if (!s || !s.pop) return;
  var lo = s.dari, hi = s.sampai;
  if (s.tahap === 'akhir' && s.dari && s.bayang) {
    lo = s.dari < s.bayang ? s.dari : s.bayang;
    hi = s.dari < s.bayang ? s.bayang : s.dari;
  }
  var hariIni = rtIso(new Date());
  s.pop.querySelectorAll('.rt-sel').forEach(function (b) {
    var iso = b.getAttribute('data-iso');
    var k = ['rt-sel'];
    if (iso === hariIni) k.push('kini');
    if (lo && hi && iso > lo && iso < hi) k.push('dalam');
    if (lo && hi && iso === lo && iso === hi) k.push('tunggal');
    else if (iso === lo) k.push('ujung awal');
    else if (iso === hi) k.push('ujung akhir');
    var baru = k.join(' ');
    if (b.className !== baru) b.className = baru;
  });
  var info = s.pop.querySelector('#' + id + '_info');
  if (info) {
    info.innerHTML = s.tahap === 'akhir' ? 'Pilih <b>tanggal akhir</b>'
      : (s.dari && s.sampai) ? rtEsc(rtLabel(s.dari, s.sampai))
      : 'Klik <b>tanggal awal</b>';
  }
}

function rtGeser(id, delta) {
  var s = _RT[id]; if (!s) return;
  s.lihat = new Date(s.lihat.getFullYear(), s.lihat.getMonth() + delta, 1);
  rtGambar(id);
}

function rtBayang(id, iso) {
  var s = _RT[id]; if (!s || s.tahap !== 'akhir' || !s.dari) return;
  if (s.bayang === iso) return;
  s.bayang = iso;
  rtTandai(id);
}

function rtKlik(id, iso) {
  var s = _RT[id]; if (!s) return;
  if (s.tahap === 'awal') {
    s.dari = iso; s.sampai = ''; s.bayang = iso; s.tahap = 'akhir';
    rtTandai(id); rtTeksBaru(id);
    return;
  }
  /* Klik kedua: urutan tanggal dirapikan sendiri bila terbalik. Orang yang
     mengklik akhir dulu lalu awal tidak sedang salah, ia cuma membaca kalender
     dari arah lain. */
  if (iso < s.dari) { s.sampai = s.dari; s.dari = iso; }
  else s.sampai = iso;
  s.tahap = 'awal'; s.bayang = '';
  rtTandai(id); rtTeksBaru(id);
  /* Jeda pendek supaya pita rentangnya sempat terlihat sebelum menutup. */
  setTimeout(function () { rtSelesai(id); }, 180);
}

function rtPreset(id, jenis) {
  var s = _RT[id]; if (!s) return;
  var n = new Date(), a, b;
  if (jenis === 'kini') { a = n; b = n; }
  else if (jenis === '3') { b = n; a = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 2); }
  else if (jenis === '7') { b = n; a = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 6); }
  else if (jenis === '30') { b = n; a = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 29); }
  else if (jenis === 'bln') { a = new Date(n.getFullYear(), n.getMonth(), 1); b = new Date(n.getFullYear(), n.getMonth() + 1, 0); }
  else if (jenis === 'blnLalu') { a = new Date(n.getFullYear(), n.getMonth() - 1, 1); b = new Date(n.getFullYear(), n.getMonth(), 0); }
  else { a = new Date(n.getFullYear(), 0, 1); b = new Date(n.getFullYear(), 11, 31); }
  s.dari = rtIso(a); s.sampai = rtIso(b);
  s.tahap = 'awal'; s.bayang = '';
  s.lihat = new Date(a.getFullYear(), a.getMonth(), 1);
  rtGambar(id); rtTeksBaru(id);
  rtSelesai(id);
}

function rtTutup(id) {
  var s = _RT[id]; if (!s) return;
  /* "Selesai" ditekan saat baru satu tanggal terpilih: dianggap satu hari.
     Menutupnya tanpa hasil akan membuang klik yang sudah benar. */
  if (s.tahap === 'akhir' && s.dari && !s.sampai) {
    s.sampai = s.dari; s.tahap = 'awal'; s.bayang = '';
    rtGambar(id); rtTeksBaru(id);
  }
  s.pop.classList.add('hidden');
  if (s.dari && s.sampai && s.onTerap) s.onTerap(s.dari, s.sampai);
}

function rtSelesai(id) {
  var s = _RT[id]; if (!s) return;
  s.pop.classList.add('hidden');
  if (s.onTerap) s.onTerap(s.dari, s.sampai);
}

/* ============ MUTASI BANK ============ */
window.MUTASI_PARSED_ROWS = [];


/* Dibuka lewat window, bukan modul: halaman-halaman ini dimuat dengan <script>
   biasa tanpa langkah build. */
window.runEnhancers = runEnhancers;
window.enhanceSelects = enhanceSelects;
window.enhanceDatePickers = enhanceDatePickers;
window.formatIndoDate = formatIndoDate;
window.popTutupSemua = popTutupSemua;
window.rentangHTML = rentangHTML;
window.rentangPasang = rentangPasang;
window.rentangNilai = rentangNilai;
/* Halaman yang baru mengganti innerHTML memakai ini untuk memaksa pemindaian
   ulang seketika, tanpa menunggu putaran 800 ms berikutnya. */
window.tandaiPerluEnhance = function () { __enhDirty = true; if (typeof runEnhancers === 'function') runEnhancers(); };

})();
