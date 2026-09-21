# Landing Page B2B — Supplier & Distributor Ikan

HTML5 + Tailwind CSS v4 + Vanilla JavaScript. Tanpa React/Vue/Alpine/jQuery, tanpa library pihak ketiga.

> **Catatan perubahan.** Tata letak, konten, dan aturan data halaman ini masih mengikuti UI Blueprint asli.
> Yang diganti adalah **bahasa permukaan dan geraknya**: permukaan putih solid menjadi bahan tembus,
> transisi CSS berdurasi tetap menjadi pegas yang bisa direbut di tengah jalan, dan tipografi berpindah
> dari ukuran per-breakpoint ke ukuran optis. Beberapa angka blueprint (radius maksimum 4px, larangan blur,
> cakupan JavaScript empat perilaku) sengaja dilampaui; ringkasannya ada di bagian
> [Sistem desain](#sistem-desain) di bawah. Perbarui blueprint sebelum mengubahnya lagi.

## Menjalankan

```bash
npm install
npm run fonts     # sekali saja: mengunduh & menyimpan font ke assets/fonts/
npm run build     # menghasilkan dist/
npm run serve     # buka http://localhost:5173
```

Saat mengerjakan tampilan: `npm run watch:css` di satu terminal, `npm run build:html` tiap kali template
atau data berubah.

## Struktur

```
data/business.json     SATU-SATUNYA sumber data bisnis
src/index.html         template halaman
src/styles.css         token warna, bahan, kedalaman, tipografi, spasi, komponen
src/motion.js          mesin pegas + isyarat sentuh (tanpa dependency)
src/main.js            5 perilaku halaman, semuanya memakai motion.js
scripts/build-html.mjs menyuntikkan data ke template
scripts/fetch-fonts.mjs mengunduh font untuk di-self-host
assets/fonts/          2 berkas woff2 + fonts.css
assets/img/            foto asli bisnis (masih kosong)
dist/                  hasil build — folder inilah yang di-upload
```

## Sistem desain

Empat hal yang menentukan bagaimana halaman ini terasa. Mengubah salah satunya berarti mengubah
seluruh halaman, jadi ubahlah di tokennya, bukan di komponennya.

### 1. Bahan, bukan kotak

Navbar, panel hero, sheet menu, dan bar WhatsApp adalah lapisan tembus yang dilalui konten di
bawahnya — bukan strip putih yang memakan ruang. Bobotnya menyampaikan hierarki:

| Token | Dipakai oleh | Kenapa segitu |
|---|---|---|
| `--material-regular` (82%) | navbar | memisahkan wilayah; teksnya harus terbaca di atas foto apa pun |
| `--material-thick` (92%) | panel hero, sheet menu | menanggung teks panjang, jadi paling padat |

Aturan yang tidak boleh dilanggar: **bahan terang tidak pernah ditumpuk di atas bahan terang lain.**
Itu sebabnya sheet menu dipotong tepat di garis bawah navbar (`clip-path`, diatur `main.js`) alih-alih
digeser menutupinya.

Sebagai pengganti garis 1px di bawah navbar, halaman memakai **tepi gulir**: gradasi tipis yang muncul
hanya ketika ada konten yang benar-benar lewat di bawah navbar, digerakkan `animation-timeline: scroll()`.

### 2. Gerak berbasis pegas

`src/motion.js` berisi satu mesin pegas tanpa dependency. Parameternya memakai istilah Apple, bukan
massa/kekakuan/redaman:

- `bounce` — `0` berarti teredam kritis (tidak pernah melewati target), `0.2` sedikit memantul.
- `duration` — seberapa gesit, dalam detik. **Bukan durasi mati**: pegas tidak punya durasi tetap.

Pantulan hanya dipakai setelah gerakan yang membawa momentum (sentilan jari). Menu yang muncul karena
diketuk tidak memantul.

Yang membedakannya dari `transition` CSS: pegas selalu berangkat dari **nilai yang sedang tampil di
layar** beserta kecepatannya. Sheet yang sedang menutup bisa ditangkap lagi dan langsung berbalik
mengikuti jari, tanpa menunggu gerakan sebelumnya selesai. Transisi CSS di `styles.css` sengaja
disisakan hanya untuk yang tidak bisa digenggam: warna dan umpan balik tekan.

Sheet menu memakai seluruh rangkaiannya: tarikan 1:1 yang menghormati titik genggam, `setPointerCapture`,
perlawanan bertahap di batas bawah (`rubberband`), pemilihan tujuan dari **proyeksi momentum**
(`current + (v/1000)·d/(1−d)`, `d = 0.998`) alih-alih dari titik lepas, lalu penyerahan kecepatan jari
ke pegas supaya tidak ada jahitan antara menarik dan melayang.

### 3. Umpan balik pada saat jari turun

`data-press` di markup + `Motion.pasangTekan()` memasang `.is-pressed` pada `pointerdown`, bukan pada
`click`. Menggeser jari lebih dari 10px membatalkan tekanan; menggesernya kembali memulihkannya.
Tiga varian: `data-press` (skala 0.97), `data-press="lembut"` (0.99, untuk permukaan lebar), dan
`data-press="warna"` (tanpa skala, hanya warna — untuk baris panjang yang akan menggeser teks bila
diskalakan).

### 4. Tipografi optis

Fraunces diunduh **beserta sumbu `opsz`-nya** (lihat `scripts/fetch-fonts.mjs`) sehingga
`font-optical-sizing: auto` benar-benar mengubah bentuk huruf. Biayanya berkas font naik dari ~37 KB
ke ~66 KB; itu satu-satunya kenaikan bobot dari perubahan ini.

Tracking ditetapkan **per ukuran**, tidak satu nilai untuk semua: judul besar dirapatkan
(`-0.032em`), teks isi di `0`, teks kecil justru dilonggarkan (`+0.006em`). Leading bergerak terbalik
terhadap ukuran. Ukuran memakai `clamp()` dengan suku `rem` di dalamnya, dan seluruh spasi memakai `rem`,
supaya tata letak ikut membesar ketika pengguna memperbesar teks sistemnya.

### Preferensi sistem

Ketiganya independen dan ketiganya dihormati, ada di bagian paling bawah `styles.css`:

| Preferensi | Yang berubah |
|---|---|
| `prefers-reduced-motion: reduce` | geser & pegas ditukar pudar-silang pendek; pantulan dimatikan; perubahan warna dipertahankan |
| `prefers-reduced-transparency: reduce` | bahan menjadi padat: opasitas penuh, buram dimatikan, hierarki dibawa bayangan & garis |
| `prefers-contrast: more` | latar nyaris padat plus garis tegas yang terdefinisi; cincin fokus 3px |


## Mengganti data

Semua isi halaman berasal dari `data/business.json`. Ubah di situ, jalankan `npm run build`, selesai.
Nomor WhatsApp cukup ditulis sekali di `contact.whatsappNumber`; seluruh tautan dan pesan otomatis ikut.

Tiga aturan yang dijalankan skrip build:

| Jenis data | Bila kosong |
|---|---|
| **[B] Blocking** | dirender sebagai teks `[ NAMA FIELD ]` di halaman — **tidak pernah dikarang** |
| **[H] Hide-if-empty** | barisnya tidak dirender sama sekali |
| **[S] Section-optional** | sub-bloknya dihapus (testimoni, foto, peta) |

Setiap kali `npm run build` dijalankan, terminal mencetak laporan: `[B]` apa yang masih kosong,
berapa baris `[H]` disembunyikan, dan blok `[S]` mana yang dihapus.

### Data masih CONTOH

`data/business.json` saat ini berisi **data contoh**, bukan data bisnis nyata. Selama
`_meta.dataStatus` belum bernilai `"ASLI"`, sebuah banner peringatan muncul di atas halaman dan
halaman **tidak boleh dipublikasikan**. Ganti seluruh nilai, lalu ubah statusnya.

Yang wajib ditulis sendiri oleh pemilik bisnis (isinya berupa komitmen ke pelanggan):
`policy.ikanMati`, `policy.ukuranTidakSesuai`, `supply.minimumOrder`, `supply.orderCutoff`,
`delivery.areas`, `contact.whatsappNumber`.

## Menambahkan foto

Foto adalah **foto asli bisnis**. Dilarang memakai stock photo, hasil pencarian gambar, gambar
AI, atau ilustrasi yang menyerupai foto — aturan ini bagian dari kontrak desain.

1. Simpan foto di `assets/img/` dalam format WebP (hero ≤ 250KB, foto lain ≤ 150KB).
2. Isi path-nya di `data/business.json`, misal `"heroImage": "assets/img/sortir-pagi.webp"`.
3. Isi juga teks alternatifnya (`heroAlt`) secara deskriptif, bukan "foto ikan".
4. Jalankan `npm run build`.

Selama path masih kosong, halaman menampilkan **slot foto kosong** dengan dimensi yang sudah
final — bukan gambar pengganti — sehingga tata letak tidak bergeser ketika foto asli masuk.

Rasio yang dipakai: hero 3:2 (dipotong 4:5 di mobile), foto proses 4:5, foto produk 1:1,
foto identitas 3:2.
