/**
 * optimize-images.mjs
 * Mengecilkan foto ke ukuran tampil sebenarnya dan mengonversinya ke WebP.
 * Berkas asli TIDAK dihapus atau ditimpa; hasilnya berkas baru ber-akhiran -web.webp
 * di assets/img/web/, lalu path di data/business.json diperbarui.
 *
 * Jalankan: npm run images
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'assets/img/web');

/* Lebar tampil maksimal + anggaran ukuran per peran foto (blueprint 1.9). */
const PERAN = {
  hero:        { lebar: 1600, maksKB: 250 },
  produk:      { lebar: 600,  maksKB: 90 },
  jenisUsaha:  { lebar: 900,  maksKB: 150 },
  penanganan:  { lebar: 800,  maksKB: 150 },
  identitas:   { lebar: 700,  maksKB: 120 },
};

const KUALITAS = [80, 72, 64, 56, 48];

async function optimalkan(pathRelatif, peran) {
  const { lebar, maksKB } = PERAN[peran];
  const sumber = resolve(ROOT, pathRelatif.replace(/^\//, ''));
  const nama = basename(pathRelatif, extname(pathRelatif)).replace(/\./g, '-') + '-web.webp';
  const tujuan = resolve(OUT_DIR, nama);

  const asal = (await stat(sumber)).size;
  let hasil = 0;

  for (const q of KUALITAS) {
    await run('magick', [
      sumber,
      '-auto-orient',
      '-strip',
      '-resize', `${lebar}x${lebar}>`,
      '-quality', String(q),
      '-define', 'webp:method=6',
      tujuan,
    ]);
    hasil = (await stat(tujuan)).size;
    if (hasil <= maksKB * 1024) break;
  }

  console.log(
    `  ${basename(pathRelatif).padEnd(42)} ${(asal / 1024).toFixed(0).padStart(6)} KB -> ` +
      `${(hasil / 1024).toFixed(0).padStart(5)} KB  (${peran})`
  );
  return '/assets/img/web/' + nama;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const dataPath = resolve(ROOT, 'data/business.json');
  const data = JSON.parse(await readFile(dataPath, 'utf8'));

  const tugas = [];
  if (data.photography?.heroImage) tugas.push([data.photography, 'heroImage', 'hero']);
  ['fotoLokasi', 'fotoKendaraan', 'fotoPIC'].forEach((k) => {
    if (data.photography?.[k]) tugas.push([data.photography, k, 'identitas']);
  });
  (data.products ?? []).forEach((p) => p.foto && tugas.push([p, 'foto', 'produk']));
  (data.businessTypes ?? []).forEach((b) => b.foto && tugas.push([b, 'foto', 'jenisUsaha']));
  (data.handling ?? []).forEach((h) => h.foto && tugas.push([h, 'foto', 'penanganan']));

  console.log(`\n  Mengoptimasi ${tugas.length} foto (berkas asli tidak diubah):\n`);
  for (const [obj, key, peran] of tugas) {
    obj[key] = await optimalkan(obj[key], peran);
  }

  await writeFile(dataPath, JSON.stringify(data, null, 2) + '\n');
  console.log('\n  data/business.json diperbarui ke berkas hasil optimasi.\n');
}

main().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
