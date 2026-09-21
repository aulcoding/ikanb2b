/* =============================================================
   motion.js — mesin gerak.

   Berkas ini menggantikan transisi CSS untuk segala hal yang bisa
   disentuh pengguna. Alasannya satu: transisi CSS punya durasi tetap
   dan tidak bisa direbut di tengah jalan. Kalau panel sedang menutup
   lalu jari menangkapnya lagi, transisi CSS akan menyelesaikan dulu
   gerakannya baru membalik — terasa seperti berdebat dengan layar.
   Pegas tidak begitu: targetnya diganti, nilainya lanjut dari posisi
   dan kecepatan saat itu juga.

   Tidak ada dependency. Seluruhnya satu objek global: window.Motion.

   Parameter pegas memakai istilah Apple, bukan massa/kekakuan/redaman:
     bounce   0     = kritis, berhenti mulus tanpa memantul
              0.2   = sedikit memantul, hanya untuk gerakan bermomentum
     duration ~detik menuju target. BUKAN durasi mati: pegas tidak
              punya durasi, angka ini menentukan seberapa gesit.
   ============================================================= */

window.Motion = (function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* -----------------------------------------------------------
     Satu loop rAF untuk semua pegas yang sedang hidup.
     Bukan satu loop per pegas: kalau tiga hal bergerak bersamaan,
     ketiganya harus dihitung pada frame yang sama supaya tidak ada
     yang tertinggal setengah frame (lihat "harmony" di catatan CSS).
     ----------------------------------------------------------- */
  const hidup = new Set();
  let frame = 0;
  let waktuTerakhir = 0;

  function tick(sekarang) {
    /* dt dibatasi 1/30 detik. Setelah tab kembali dari latar belakang
       selisihnya bisa beberapa detik; tanpa batas ini pegas akan
       melompat ke ujung dan lompatannya terlihat. */
    const dt = waktuTerakhir ? Math.min((sekarang - waktuTerakhir) / 1000, 1 / 30) : 1 / 60;
    waktuTerakhir = sekarang;

    for (const pegas of Array.from(hidup)) pegas._maju(dt);

    if (hidup.size) {
      frame = requestAnimationFrame(tick);
    } else {
      frame = 0;
      waktuTerakhir = 0;
    }
  }

  function bangunkan(pegas) {
    hidup.add(pegas);
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tidurkan(pegas) {
    hidup.delete(pegas);
  }

  /* -----------------------------------------------------------
     Solusi analitik persamaan pegas teredam.
     Dihitung dari rumus, bukan diintegrasikan per frame, supaya
     hasilnya sama persis pada 60Hz maupun 120Hz dan tidak pernah
     meledak kalau satu frame kelewat panjang.
     ----------------------------------------------------------- */
  function hitung(t, x0, v0, target, zeta, T) {
    const w0 = (2 * Math.PI) / T;
    const A = x0 - target;

    if (zeta >= 1) {
      // Teredam kritis: tidak pernah melewati target.
      const B = v0 + w0 * A;
      const e = Math.exp(-w0 * t);
      return {
        x: target + e * (A + B * t),
        v: e * (v0 - w0 * B * t),
      };
    }

    // Teredam kurang: melewati target lalu kembali.
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const C = (v0 + zeta * w0 * A) / wd;
    const e = Math.exp(-zeta * w0 * t);
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    return {
      x: target + e * (A * cos + C * sin),
      v: e * ((C * wd - zeta * w0 * A) * cos - (A * wd + zeta * w0 * C) * sin),
    };
  }

  class Pegas {
    constructor(opsi) {
      const o = opsi || {};
      this.nilai = o.nilai || 0;
      this.kecepatan = 0;
      this.target = this.nilai;
      this.bounce = o.bounce || 0;
      this.duration = o.duration || 0.4;
      this.restDelta = o.restDelta || 0.01;
      this.onUpdate = o.onUpdate || null;
      this.onRest = o.onRest || null;

      this._t = 0;
      this._x0 = this.nilai;
      this._v0 = 0;
      this._jalan = false;
    }

    get berjalan() {
      return this._jalan;
    }

    /** Lompat ke satu nilai tanpa gerakan. Dipakai saat jari menarik. */
    set(nilai, kecepatan) {
      this.stop();
      this.nilai = nilai;
      this.kecepatan = kecepatan || 0;
      this.target = nilai;
      if (this.onUpdate) this.onUpdate(this.nilai, this);
    }

    /**
     * Ganti target. Inti dari seluruh berkas ini.
     * Gerakan SELALU dimulai dari nilai yang sedang tampil di layar dan
     * kecepatan yang sedang berjalan, bukan dari nilai logis tujuan
     * sebelumnya — itu yang membuat pembalikan arah di tengah gerakan
     * tidak menabrak dinding.
     */
    ke(target, opsi) {
      const o = opsi || {};

      if (o.bounce != null) this.bounce = o.bounce;
      if (o.duration != null) this.duration = o.duration;

      /* Permintaan "kurangi gerakan" tidak berarti mematikan umpan balik,
         melainkan menggantinya dengan yang tidak menggoyang ruang: tanpa
         pantulan dan sesingkat mungkin. Komponen yang memanggil berkas ini
         juga menukar geser menjadi pudar. */
      const zeta = reduceMotion.matches ? 1 : Math.max(0.1, 1 - this.bounce);
      const T = reduceMotion.matches ? Math.min(this.duration, 0.15) : this.duration;

      this._zeta = zeta;
      this._T = T;
      this._x0 = this.nilai;
      this._v0 = o.kecepatan != null ? o.kecepatan : this.kecepatan;
      this._t = 0;
      this.target = target;

      if (Math.abs(this._x0 - target) < this.restDelta && Math.abs(this._v0) < this.restDelta) {
        this.nilai = target;
        this.kecepatan = 0;
        if (this.onUpdate) this.onUpdate(this.nilai, this);
        if (this.onRest) this.onRest(this);
        return this;
      }

      this._jalan = true;
      bangunkan(this);
      return this;
    }

    stop() {
      if (!this._jalan) return this;
      this._jalan = false;
      tidurkan(this);
      return this;
    }

    _maju(dt) {
      this._t += dt;
      const hasil = hitung(this._t, this._x0, this._v0, this.target, this._zeta, this._T);
      this.nilai = hasil.x;
      this.kecepatan = hasil.v;

      const diam =
        Math.abs(this.nilai - this.target) < this.restDelta &&
        Math.abs(this.kecepatan) < this.restDelta * 10;

      // Jaring pengaman: apa pun parameternya, pegas berhenti setelah 4 detik.
      if (diam || this._t > 4) {
        this.nilai = this.target;
        this.kecepatan = 0;
        this._jalan = false;
        tidurkan(this);
        if (this.onUpdate) this.onUpdate(this.nilai, this);
        if (this.onRest) this.onRest(this);
        return;
      }

      if (this.onUpdate) this.onUpdate(this.nilai, this);
    }
  }

  /* -----------------------------------------------------------
     Proyeksi momentum.
     Saat jari dilepas, tujuan TIDAK dipilih dari titik lepas, tapi dari
     tempat gerakan itu akan berhenti sendiri seandainya diteruskan —
     persis seperti scroll yang meluncur. Inilah yang membuat sentilan
     pendek terasa melempar, bukan menggeser.
     ----------------------------------------------------------- */
  function proyeksi(kecepatan, laju) {
    const d = laju == null ? 0.998 : laju;
    return ((kecepatan / 1000) * d) / (1 - d);
  }

  /* -----------------------------------------------------------
     Rubber-band: tepi yang melawan, bukan tepi yang membeku.
     Makin jauh ditarik melewati batas, makin sedikit yang ikut.
     ----------------------------------------------------------- */
  function rubberband(lebih, dimensi, konstanta) {
    const c = konstanta == null ? 0.55 : konstanta;
    return (lebih * dimensi * c) / (dimensi + c * Math.abs(lebih));
  }

  /* -----------------------------------------------------------
     Riwayat posisi jari.
     Kecepatan tidak boleh dihitung dari dua frame terakhir saja: dua
     frame bisa kebetulan identik dan hasilnya nol tepat di saat lepas.
     Diambil dari jendela 100ms terakhir.
     ----------------------------------------------------------- */
  function pelacakKecepatan(jendela) {
    const batas = jendela == null ? 100 : jendela;
    let sampel = [];
    return {
      reset(posisi) {
        sampel = [{ p: posisi, t: performance.now() }];
      },
      catat(posisi) {
        const t = performance.now();
        sampel.push({ p: posisi, t: t });
        while (sampel.length > 2 && t - sampel[0].t > batas) sampel.shift();
      },
      kecepatan() {
        if (sampel.length < 2) return 0;
        const awal = sampel[0];
        const akhir = sampel[sampel.length - 1];
        const dt = akhir.t - awal.t;
        if (dt < 8) return 0; // terlalu pendek untuk dipercaya
        return ((akhir.p - awal.p) / dt) * 1000;
      },
    };
  }

  /* -----------------------------------------------------------
     Umpan balik tekan.
     Kelas .is-pressed dipasang saat jari TURUN, bukan saat dilepas.
     Menunggu 'click' berarti menunggu jari diangkat, dan jeda itulah
     yang membuat tombol terasa mati. Menarik jari menjauh membatalkan
     tekanan, menariknya kembali memulihkannya — supaya salah tekan
     selalu bisa diurungkan tanpa konsekuensi.
     ----------------------------------------------------------- */
  const AMBANG_BATAL = 10; // px

  function pasangTekan(akar) {
    const wadah = akar || document;
    let aktif = null;
    let mulai = null;

    function lepas() {
      if (aktif) aktif.classList.remove('is-pressed');
      aktif = null;
      mulai = null;
    }

    wadah.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button != null && e.button !== 0) return;
        const sasaran = e.target.closest('[data-press]');
        if (!sasaran) return;
        aktif = sasaran;
        mulai = { x: e.clientX, y: e.clientY };
        sasaran.classList.add('is-pressed');
      },
      { passive: true }
    );

    wadah.addEventListener(
      'pointermove',
      (e) => {
        if (!aktif) return;
        const jauh = Math.hypot(e.clientX - mulai.x, e.clientY - mulai.y);
        aktif.classList.toggle('is-pressed', jauh < AMBANG_BATAL);
      },
      { passive: true }
    );

    wadah.addEventListener('pointerup', lepas, { passive: true });
    wadah.addEventListener('pointercancel', lepas, { passive: true });
    window.addEventListener('blur', lepas);
  }

  return {
    Pegas: Pegas,
    pegas: (opsi) => new Pegas(opsi),
    proyeksi: proyeksi,
    rubberband: rubberband,
    pelacakKecepatan: pelacakKecepatan,
    pasangTekan: pasangTekan,
    get kurangiGerak() {
      return reduceMotion.matches;
    },
    AMBANG_GESER: AMBANG_BATAL,
  };
})();
