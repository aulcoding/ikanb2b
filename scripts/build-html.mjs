/**
 * build-html.mjs
 * Menyuntikkan data/business.json ke src/index.html menjadi dist/index.html.
 *
 * Alasan ada berkas ini (blueprint FASE 5 / guardrail 14):
 * data bisnis ditulis SEKALI di satu berkas, lalu dipakai ulang di
 * seluruh halaman. Injeksi dilakukan saat build, bukan saat runtime,
 * supaya JavaScript di browser tetap nol untuk urusan konten.
 *
 * Tanpa dependency. Sintaks template:
 *   {{path.ke.nilai}}             nilai (di-escape)
 *   {{.field}}                    field item, di dalam blok repeat
 *   {{wa:umum|produk|area|rutin}} tautan WhatsApp beserta pesan awal
 *   <!-- repeat:products --> … <!-- /repeat -->
 *   <!-- if:path --> … <!-- /if -->        tampil bila nilai terisi
 *   <!-- ifnot:path --> … <!-- /ifnot -->  tampil bila nilai kosong
 */
import { readFile, writeFile, mkdir, cp, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

/* -------------------------------------------------------------
   Data BLOCKING [B] — bila kosong, dirender apa adanya sebagai
   teks dalam kurung siku. TIDAK PERNAH dikarang (blueprint 1.12).
   ------------------------------------------------------------- */
const BLOCKING = {
  'business.nama': 'NAMA BISNIS',
  'business.deskripsi': 'DESKRIPSI BISNIS',
  'contact.whatsappNumber': 'NOMOR WHATSAPP',
  'contact.whatsappTampil': 'NOMOR WHATSAPP',
  'contact.jamLayanan': 'JAM OPERASIONAL',
  'location.alamat': 'ALAMAT',
  'supply.minimumOrder': 'MINIMUM ORDER',
  'supply.minimumOrderRingkas': 'MINIMUM ORDER',
  'supply.orderCutoff': 'ORDER CUTOFF',
  'supply.konfirmasiPesananBesar': 'KONFIRMASI PESANAN BESAR',
  'supply.ukuranBisaDipilih': 'KEBIJAKAN UKURAN',
  'delivery.areaRingkas': 'AREA PENGIRIMAN',
  'delivery.jadwal': 'JADWAL KIRIM',
  'delivery.kebijakanLuarArea': 'KEBIJAKAN LUAR AREA',
  // Field di dalam blok repeat (diawali titik).
  '.ukuran': 'UKURAN IKAN',
  '.kegunaan': 'KEGUNAAN',
  '.konteks': 'KONTEKS USAHA',
  '.ukuranBiasa': 'UKURAN YANG BIASA DIAMBIL',
  '.kondisiIkan': 'KONDISI IKAN',
  '.polaKirim': 'POLA PENGIRIMAN',
  'policy.ikanMati': 'KEBIJAKAN IKAN MATI',
  'policy.ukuranTidakSesuai': 'KEBIJAKAN UKURAN TIDAK SESUAI',
  'policy.pesananRutin': 'KEBIJAKAN PESANAN RUTIN',
};

/* Pesan awal WhatsApp — satu sumber untuk seluruh halaman (blueprint 1.11).
   Titik-titik sengaja dipertahankan supaya pengirim mengisinya. */
const WA_MESSAGES = {
  umum: (n) =>
    `Halo ${n}, saya ingin menanyakan stok dan harga ikan untuk kebutuhan usaha. Jenis ikan: … / Ukuran: … / Perkiraan jumlah: … / Lokasi: … / Dibutuhkan tanggal: …`,
  produk: (n, ikan) =>
    `Halo ${n}, saya ingin menanyakan stok dan harga ${ikan}. Ukuran: … / Perkiraan jumlah: … / Lokasi: …`,
  area: (n) =>
    `Halo ${n}, apakah melayani pengiriman ke [ lokasi saya ]? Kebutuhan saya: …`,
  rutin: (n) =>
    `Halo ${n}, saya pemilik [ jenis usaha ] di [ lokasi ]. Saya ingin menanyakan kemungkinan supply rutin. Jenis ikan: … / Ukuran: … / Perkiraan jumlah per pengiriman: …`,
};

const report = { blockingKosong: [], barisDisembunyikan: 0, blokDihapus: [] };

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Ambil nilai dari path bertitik. Path diawali "." berarti field item. */
function getValue(path, data, item) {
  // "{{.}}" berarti item itu sendiri — dipakai untuk larik berisi teks biasa.
  if (path === '.') return item;
  if (path.startsWith('.')) return item?.[path.slice(1)];
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), data);
}

function isFilled(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'boolean') return v;
  return v != null && String(v).trim() !== '';
}

function waLink(kind, data, item) {
  const nama = isFilled(data.business?.nama) ? data.business.nama : '[ NAMA BISNIS ]';
  const nomor = isFilled(data.contact?.whatsappNumber) ? data.contact.whatsappNumber : '';
  const text = kind === 'produk' ? WA_MESSAGES.produk(nama, item?.nama ?? '') : WA_MESSAGES[kind](nama);
  return `https://wa.me/${nomor}?text=${encodeURIComponent(text)}`;
}

/** Render satu potong template dalam satu lingkup (root + item opsional). */
function render(tpl, data, item) {
  // 1. Blok repeat
  tpl = tpl.replace(
    /<!--\s*repeat:([\w.]+)\s*-->([\s\S]*?)<!--\s*\/repeat\s*-->/g,
    (_, path, inner) => {
      const list = getValue(path, data, item);
      if (!Array.isArray(list) || list.length === 0) {
        report.blokDihapus.push(`repeat:${path} (kosong)`);
        return '';
      }
      return list.map((entry) => render(inner, data, entry)).join('');
    }
  );

  // 2. Blok kondisional
  tpl = tpl.replace(
    /<!--\s*if:([\w.]+)\s*-->([\s\S]*?)<!--\s*\/if\s*-->/g,
    (_, path, inner) => {
      if (isFilled(getValue(path, data, item))) return render(inner, data, item);
      if (!BLOCKING[path]) report.barisDisembunyikan += 1;
      return '';
    }
  );
  tpl = tpl.replace(
    /<!--\s*ifnot:([\w.]+)\s*-->([\s\S]*?)<!--\s*\/ifnot\s*-->/g,
    (_, path, inner) => (isFilled(getValue(path, data, item)) ? '' : render(inner, data, item))
  );

  // 3. Tautan WhatsApp
  tpl = tpl.replace(/\{\{\s*wa:(\w+)\s*\}\}/g, (_, kind) =>
    WA_MESSAGES[kind] ? escapeHtml(waLink(kind, data, item)) : ''
  );

  // 4. Nilai biasa
  tpl = tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = getValue(path, data, item);
    if (isFilled(value)) return escapeHtml(value);
    const label = BLOCKING[path];
    if (label) {
      if (!report.blockingKosong.includes(path)) report.blockingKosong.push(path);
      return `[ ${label} ]`;
    }
    return '';
  });

  return tpl;
}

async function main() {
  const data = JSON.parse(await readFile(resolve(ROOT, 'data/business.json'), 'utf8'));

  /* Status ketersediaan diubah menjadi kata. Blueprint 1.8: status tidak
     pernah disampaikan lewat warna saja. Status di luar daftar dianggap
     tidak diketahui sehingga barisnya tidak dirender. */
  const STATUS_LABEL = { tersedia: 'Tersedia', terbatas: 'Stok terbatas' };
  (data.products ?? []).forEach((p) => {
    p.statusLabel = STATUS_LABEL[p.status] ?? '';
  });

  // Nilai turunan yang dipakai template.
  data._computed = {
    isStaging: (data._meta?.dataStatus ?? '').toUpperCase() !== 'ASLI',
    // Filter jenis ikan hanya diadakan bila jumlah jenis >= 8 (blueprint section 3).
    showFilter: Array.isArray(data.products) && data.products.length >= 8,
    tahunSekarang: new Date().getFullYear(),
  };

  const template = await readFile(resolve(ROOT, 'src/index.html'), 'utf8');
  const html = render(template, data, null);

  await mkdir(DIST, { recursive: true });
  await writeFile(resolve(DIST, 'index.html'), html);
  /* Font disalin ulang dari nol: set font pernah berganti, dan cp tidak
     pernah menghapus, sehingga berkas lama bisa menumpuk di hasil build. */
  await rm(resolve(DIST, 'assets/fonts'), { recursive: true, force: true });
  await cp(resolve(ROOT, 'assets/fonts'), resolve(DIST, 'assets/fonts'), { recursive: true });
  /* Dua berkas skrip: motion.js (mesin gerak) dimuat lebih dulu, main.js
     memakainya. Urutan di halaman dijaga atribut defer. */
  for (const js of ['motion.js', 'main.js']) {
    await cp(resolve(ROOT, 'src', js), resolve(DIST, 'assets', js)).catch(() => {});
  }

  /* Foto: hanya yang benar-benar dipakai halaman yang ikut ke dist.
     Berkas asli beresolusi penuh tetap tinggal di assets/img/ sebagai arsip
     kerja; dist/ adalah folder yang di-upload, jadi isinya harus seringan
     mungkin (blueprint 1.9). Folder lama dihapus dulu supaya foto yang sudah
     tidak dirujuk tidak tertinggal di hasil build. */
  /* Garis miring di depan sengaja tidak diwajibkan: path foto ditulis
     relatif supaya halaman tetap utuh ketika disajikan dari sub-folder
     (GitHub Pages proyek, folder pratinjau, dsb). Bentuk absolut lama
     tetap dikenali. */
  const dipakai = [
    ...new Set([...html.matchAll(/assets\/img\/[^"'\s)]+/g)].map((m) => m[0])),
  ];
  await rm(resolve(DIST, 'assets/img'), { recursive: true, force: true });
  let byteFoto = 0;
  for (const src of dipakai) {
    const dari = resolve(ROOT, src);
    const ke = resolve(DIST, src);
    await mkdir(dirname(ke), { recursive: true });
    await cp(dari, ke);
    byteFoto += (await stat(ke)).size;
  }

  /* ---------- Laporan data ---------- */
  console.log('\n  dist/index.html ditulis.');
  console.log(`  Status data   : ${data._meta?.dataStatus ?? '(tidak diset)'}`);
  console.log(`  Filter produk : ${data._computed.showFilter ? 'AKTIF (>= 8 jenis)' : 'nonaktif (< 8 jenis)'}`);
  if (report.blockingKosong.length) {
    console.log(`\n  [B] MASIH KOSONG (${report.blockingKosong.length}) — dirender sebagai teks kurung siku:`);
    report.blockingKosong.forEach((p) => console.log(`    - ${p}  ->  [ ${BLOCKING[p]} ]`));
  } else {
    console.log('  [B] lengkap   : ya');
  }
  console.log(`  [H] baris disembunyikan : ${report.barisDisembunyikan}`);
  console.log(`  Foto disalin  : ${dipakai.length} berkas, ${(byteFoto / 1024).toFixed(0)} KB`);
  if (report.blokDihapus.length) {
    console.log(`  [S] blok dihapus        : ${report.blokDihapus.join(', ')}`);
  }
  if (data._computed.isStaging) {
    console.log('\n  PERINGATAN: dataStatus bukan "ASLI" — banner staging aktif, halaman belum boleh dipublikasikan.\n');
  }
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(1);
});
