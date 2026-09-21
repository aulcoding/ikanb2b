/* =============================================================
   main.js — perilaku halaman. Tanpa library.

   Lima perilaku, semuanya digerakkan motion.js:
     1. Umpan balik tekan  — seluruh halaman
     2. Sheet menu         — bisa ditarik, bisa direbut di tengah jalan
     3. FAQ                — tinggi digerakkan pegas, bisa dibalik
     4. Bar WhatsApp       — mengeras masuk, bukan dipudarkan
     5. Filter produk      — hanya bila jenis ikan >= 8

   Satu aturan yang berlaku di seluruh berkas ini: gerakan SELALU
   dimulai dari nilai yang sedang tampil di layar. Tidak ada satu pun
   animasi di sini yang harus selesai dulu sebelum bisa dibalik.
   ============================================================= */
(function () {
  'use strict';

  const M = window.Motion;

  /* =========================
     1. Umpan balik tekan
     Dipasang sekali untuk seluruh dokumen; elemen ikut serta dengan
     menulis data-press di markup.
  ========================= */
  M.pasangTekan(document);

  /* =========================
     2. Sheet menu (mobile & tablet)

     Ini bagian yang paling banyak menanggung prinsip:
       - jari dan sheet bergerak 1:1, menghormati titik genggamnya
       - kelambu dan bahan sheet ikut bergerak SELAMA ditarik
       - menarik melewati batas bawah dilawan perlahan (rubber-band)
       - saat dilepas, tujuannya dipilih dari tempat gerakan itu akan
         berhenti sendiri, bukan dari titik lepas
       - kecepatan jari diserahkan ke pegas sehingga tidak ada jahitan
         antara menarik dan melayang
       - menyentuh sheet yang sedang melayang akan langsung merebutnya
  ========================= */
  (function sheetMenu() {
    const toggle = document.querySelector('#nav-toggle');
    const sheet = document.querySelector('#nav-panel');
    const scrim = document.querySelector('#nav-scrim');
    const iconMenu = document.querySelector('#icon-menu');
    const iconClose = document.querySelector('#icon-close');
    if (!toggle || !sheet || !scrim) return;

    const FOKUSABEL = 'a[href], button:not([disabled])';

    let tinggi = 0; // tinggi sheet, px
    let y = 0; // posisi sekarang: 0 = terbuka penuh, -tinggi = tertutup
    let terbuka = false;
    let menarik = false;
    let bergeser = false; // sudah melewati ambang geser?
    let pointerId = null;
    let awalY = 0;
    let awalGeser = 0;

    const pelacak = M.pelacakKecepatan();

    const pegas = M.pegas({
      nilai: 0,
      bounce: 0,
      duration: 0.3,
      restDelta: 0.5, // satuan px: 0.5px sudah tidak terlihat
      onUpdate: (nilai) => gambar(nilai),
      onRest: () => {
        if (!terbuka) sembunyikan();
      },
    });

    /** Satu-satunya tempat yang menyentuh DOM untuk posisi sheet. */
    function gambar(posisi) {
      y = posisi;
      const p = tinggi ? Math.max(0, Math.min(1, 1 + posisi / tinggi)) : 0;

      if (M.kurangiGerak) {
        /* Permintaan "kurangi gerakan": geser ditukar pudar-silang.
           Umpan baliknya tetap ada, hanya tidak menggoyang ruang. */
        sheet.style.transform = 'none';
        sheet.style.clipPath = 'none';
        sheet.style.opacity = String(p);
      } else {
        sheet.style.transform = 'translate3d(0,' + posisi.toFixed(2) + 'px,0)';
        /* Bagian sheet yang naik melewati garis bawah navbar dipotong,
           bukan ditumpuk di atasnya: sheet harus terlihat keluar dan
           masuk DARI BAWAH bar, bukan melayang menutupinya. Tiga sisi
           lain dilebihkan supaya bayangannya tidak ikut terpotong. */
        const potong = Math.max(0, -posisi);
        sheet.style.clipPath = 'inset(' + potong.toFixed(2) + 'px -120px -120px -120px)';
        sheet.style.opacity = String(Math.min(1, p * 1.6));
      }

      sheet.style.setProperty('--sheet-p', p.toFixed(3));
      scrim.style.setProperty('--sheet-p', p.toFixed(3));
    }

    function ukur() {
      const transform = sheet.style.transform;
      const clip = sheet.style.clipPath;
      sheet.style.transform = 'none';
      sheet.style.clipPath = 'none';
      tinggi = sheet.offsetHeight;
      sheet.style.transform = transform;
      sheet.style.clipPath = clip;
    }

    function tampilkan() {
      sheet.hidden = false;
      scrim.hidden = false;
      ukur();
    }

    function sembunyikan() {
      sheet.hidden = true;
      scrim.hidden = true;
      document.body.style.overflow = '';
    }

    function setAria(open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Tutup menu navigasi' : 'Buka menu navigasi');
      if (iconMenu) iconMenu.hidden = open;
      if (iconClose) iconClose.hidden = !open;
    }

    /**
     * @param {boolean} open  keadaan tujuan
     * @param {number}  v     kecepatan jari saat dilepas, px/detik
     */
    function tuju(open, v) {
      terbuka = open;
      setAria(open);

      if (open) {
        if (sheet.hidden) {
          tampilkan();
          pegas.set(-tinggi); // mulai dari keadaan tertutup, bukan dari nol
        }
        document.body.style.overflow = 'hidden';
      }

      /* Selama jari menarik, posisi digambar langsung tanpa melewati pegas.
         Sebelum pegas mengambil alih, ia harus diberi tahu di mana benda itu
         SEKARANG berada — kalau tidak, ia akan melompat dari posisi
         terakhir yang diingatnya. */
      pegas.set(y, 0);

      /* Pantulan HANYA bila gerakannya memang membawa momentum.
         Menu yang muncul karena diketuk tidak pantas memantul; sheet
         yang baru saja disentil pantas. */
      const momentum = Math.abs(v || 0) > 60;
      pegas.ke(open ? 0 : -tinggi, {
        kecepatan: v || 0,
        bounce: momentum ? 0.2 : 0,
        duration: 0.3,
      });

      if (open) {
        const pertama = sheet.querySelector(FOKUSABEL);
        if (pertama) pertama.focus({ preventScroll: true });
      }
    }

    /* ---------- Tombol ---------- */
    toggle.addEventListener('click', () => {
      if (terbuka) {
        tuju(false, 0);
        toggle.focus();
      } else {
        tuju(true, 0);
      }
    });

    /* ---------- Kelambu: ketuk di luar untuk menutup ---------- */
    scrim.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tuju(false, 0);
      toggle.focus();
    });

    /* ---------- Tarikan jari ---------- */
    sheet.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      if (sheet.hidden) return;

      /* Merebut gerakan yang sedang berlangsung. Pegas dihentikan di
         posisi yang SEDANG TAMPIL, bukan di posisi tujuannya — itu
         sebabnya tidak ada lompatan saat sheet ditangkap di tengah
         jalan. */
      pegas.stop();

      menarik = true;
      bergeser = false;
      pointerId = e.pointerId;
      awalY = e.clientY;
      awalGeser = y;
      pelacak.reset(e.clientY);
      sheet.setPointerCapture(e.pointerId);
    });

    sheet.addEventListener('pointermove', (e) => {
      if (!menarik || e.pointerId !== pointerId) return;
      const dy = e.clientY - awalY;
      pelacak.catat(e.clientY);

      /* Ambang geser: di bawah 10px gerakan masih dianggap ketukan,
         supaya jari yang sedikit bergoyang tetap bisa menekan tautan. */
      if (!bergeser) {
        if (Math.abs(dy) < M.AMBANG_GESER) return;
        bergeser = true;
      }

      let posisi = awalGeser + dy;
      /* Batas bawah melawan perlahan, tidak membeku. Tepi yang berhenti
         mendadak terbaca sebagai macet; tepi yang melawan terbaca
         sebagai "responsif, tapi memang tidak ada lagi di sini". */
      if (posisi > 0) posisi = M.rubberband(posisi, tinggi || 1);
      if (posisi < -tinggi) posisi = -tinggi;

      gambar(posisi);
    });

    function lepas(e) {
      if (!menarik || (e && e.pointerId !== pointerId)) return;
      menarik = false;
      pointerId = null;

      if (!bergeser) return; // ketukan biasa: biarkan tautan bekerja

      const v = pelacak.kecepatan();
      /* Ke mana gerakan ini akan berhenti seandainya diteruskan?
         Tujuan dipilih dari titik itu, bukan dari titik lepas — itu
         yang membuat sentilan pendek terasa melempar sheet. */
      const proyeksi = y + M.proyeksi(v);
      /* Kalau jari masih melaju kencang, tanda kecepatannya yang
         menentukan; posisi hanya dipakai saat gerakan sudah tenang. */
      const tutup = Math.abs(v) > 200 ? v < 0 : proyeksi < -tinggi / 2;

      tuju(!tutup, v);
      if (tutup) toggle.focus();
    }

    sheet.addEventListener('pointerup', lepas);
    sheet.addEventListener('pointercancel', lepas);

    /* Tautan di dalam sheet: tetap berfungsi bila diketuk, diabaikan
       bila ternyata itu awal dari sebuah tarikan. */
    sheet.addEventListener(
      'click',
      (e) => {
        if (bergeser) {
          e.preventDefault();
          bergeser = false;
          return;
        }
        if (e.target.closest('a')) tuju(false, 0);
      },
      true
    );

    /* ---------- Papan ketik ---------- */
    document.addEventListener('keydown', (e) => {
      if (!terbuka) return;

      if (e.key === 'Escape') {
        tuju(false, 0);
        toggle.focus();
        return;
      }

      // Fokus berputar antara tombol toggle dan isi sheet.
      if (e.key === 'Tab') {
        const isi = [toggle].concat(Array.from(sheet.querySelectorAll(FOKUSABEL)));
        const awal = isi[0];
        const akhir = isi[isi.length - 1];
        if (e.shiftKey && document.activeElement === awal) {
          e.preventDefault();
          akhir.focus();
        } else if (!e.shiftKey && document.activeElement === akhir) {
          e.preventDefault();
          awal.focus();
        }
      }
    });

    /* ---------- Lebar layar berubah ---------- */
    window.addEventListener('resize', () => {
      if (!terbuka) return;
      if (window.innerWidth >= 1024) {
        // Sheet ini milik mobile & tablet; di desktop ia tidak punya tempat.
        terbuka = false;
        setAria(false);
        pegas.stop();
        sembunyikan();
        gambar(0);
      } else {
        // Tinggi sheet berubah bila teks berpindah baris.
        ukur();
        pegas.set(0);
        gambar(0);
      }
    });
  })();

  /* =========================
     3. FAQ

     Tinggi jawaban digerakkan pegas, bukan transition CSS. Bedanya
     terasa saat satu pertanyaan diketuk dua kali dengan cepat:
     transition akan menyelesaikan dulu baru membalik; pegas langsung
     berbalik dari tinggi yang sedang tampil, membawa serta kecepatan
     yang sedang berjalan.
  ========================= */
  (function faqAccordion() {
    const daftar = document.querySelector('#faq-list');
    if (!daftar) return;

    const pegasPer = new Map();

    function pegasUntuk(panel) {
      let pegas = pegasPer.get(panel);
      if (pegas) return pegas;

      pegas = M.pegas({
        nilai: 0,
        bounce: 0, // tinggi tidak pernah pantas melewati targetnya
        duration: 0.35,
        restDelta: 0.5,
        onUpdate: (h) => {
          panel.style.height = Math.max(0, h) + 'px';
        },
        onRest: () => {
          const item = panel.closest('.faq-item');
          if (item.dataset.open === 'true') {
            /* Setelah terbuka, tinggi dilepas ke auto supaya jawaban
               ikut menyesuaikan bila lebar layar berubah dan teksnya
               berpindah baris. */
            panel.style.height = 'auto';
          } else {
            panel.style.visibility = 'hidden';
          }
        },
      });
      pegasPer.set(panel, pegas);
      return pegas;
    }

    daftar.addEventListener('click', (e) => {
      const tombol = e.target.closest('.faq-q');
      if (!tombol) return;

      const item = tombol.closest('.faq-item');
      const panel = document.querySelector('#' + tombol.getAttribute('aria-controls'));
      if (!panel) return;

      const sedangTerbuka = tombol.getAttribute('aria-expanded') === 'true';
      const akanTerbuka = !sedangTerbuka;

      tombol.setAttribute('aria-expanded', String(akanTerbuka));
      item.dataset.open = String(akanTerbuka);

      const pegas = pegasUntuk(panel);

      /* Tinggi yang sedang tampil, diambil dari layar. Kalau sedang
         'auto' ia dikunci dulu ke piksel: pegas butuh angka, dan angka
         itu harus angka yang sekarang terlihat. */
      const sekarang = panel.style.height === 'auto' ? panel.scrollHeight : panel.offsetHeight;
      pegas.set(sekarang, pegas.kecepatan);

      if (akanTerbuka) {
        panel.style.visibility = 'visible';
        pegas.ke(panel.scrollHeight);
      } else {
        pegas.ke(0);
      }
    });

    window.addEventListener('resize', () => {
      daftar.querySelectorAll('.faq-item[data-open="true"] .faq-a').forEach((panel) => {
        const pegas = pegasPer.get(panel);
        if (pegas && pegas.berjalan) return; // jangan ganggu yang sedang bergerak
        panel.style.height = 'auto';
      });
    });
  })();

  /* =========================
     4. Bar WhatsApp (mobile)

     Muncul setelah Hero terlewat, menetap, dan menghilang saat CTA
     Penutup terlihat supaya tidak ada dua tombol kembar di layar.
     Kemunculannya bukan pudar: buram, posisi, dan opasitas bergerak
     bersama, sehingga terbaca sebagai bahan yang mengeras.
  ========================= */
  (function stickyCta() {
    const bar = document.querySelector('#sticky-cta');
    const hero = document.querySelector('.hero');
    const cta = document.querySelector('#cta-penutup');
    if (!bar || !hero || !cta) return;

    let heroLewat = false;
    let ctaTerlihat = false;

    const pegas = M.pegas({
      nilai: 0,
      bounce: 0,
      duration: 0.35,
      restDelta: 0.002,
      onUpdate: (p) => {
        bar.style.setProperty('--cta-progress', p.toFixed(3));
      },
    });

    function perbarui() {
      const tampil = heroLewat && !ctaTerlihat;
      // Atribut dipakai CSS untuk mematikan pointer-events saat tersembunyi.
      bar.dataset.show = String(tampil);
      pegas.ke(tampil ? 1 : 0);
    }

    new IntersectionObserver(([entry]) => {
      heroLewat = !entry.isIntersecting;
      perbarui();
    }).observe(hero);

    new IntersectionObserver(([entry]) => {
      ctaTerlihat = entry.isIntersecting;
      perbarui();
    }).observe(cta);
  })();

  /* =========================
     5. Filter jenis ikan
     Hanya aktif bila blok filter dirender (jumlah jenis ikan >= 8).
  ========================= */
  (function productFilter() {
    const grup = document.querySelector('#product-filter');
    const daftar = document.querySelector('#product-list');
    if (!grup || !daftar) return;

    const tabs = grup.querySelectorAll('.tab');
    const baris = daftar.querySelectorAll('.product-row');

    grup.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;

      const filter = tab.dataset.filter;
      tabs.forEach((t) => t.setAttribute('aria-pressed', String(t === tab)));
      baris.forEach((row) => {
        const cocok = filter === 'semua' || (row.dataset.kategori || '').includes(filter);
        row.hidden = !cocok;
      });
    });
  })();
})();
