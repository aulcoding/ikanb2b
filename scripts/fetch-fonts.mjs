/**
 * fetch-fonts.mjs
 * Mengunduh font dari Google Fonts lalu menyimpannya di assets/fonts/ (self-hosted).
 * Hanya subset "latin" yang diambil, sesuai anggaran performa blueprint (1.9).
 * Dijalankan sekali: npm run fonts
 *
 * Tanpa dependency. Hasil akhir: berkas .woff2 + assets/fonts/fonts.css
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'assets/fonts');

// User-Agent browser modern diperlukan agar Google Fonts mengirim woff2.
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Dua family saja. Tidak ada font ketiga (blueprint 1.3).
const FAMILIES = [
  {
    /* Fraunces: serif variable dengan karakter display (dipilih pemilik).
       Sumbu opsz ikut diminta supaya `font-optical-sizing: auto` benar-benar
       bekerja: bentuk huruf menipis dan merapat sendiri saat ukurannya besar.
       Tanpa opsz, Google Fonts memakukan sumbu itu dan CSS-nya jadi sia-sia. */
    url: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&display=swap',
    file: () => 'fraunces-latin-var.woff2',
  },
  {
    // Oswald: dipakai untuk label & data operasional (dipilih pemilik).
    url: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400..600&display=swap',
    file: () => 'oswald-latin-var.woff2',
  },
];

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Gagal mengambil ${url} (${res.status})`);
  return res.text();
}

/** Ambil hanya blok @font-face dengan komentar subset "latin". */
function parseLatinFaces(css) {
  const faces = [];
  const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (m[1] !== 'latin') continue;
    const body = m[2];
    const pick = (prop) => (body.match(new RegExp(`${prop}:\\s*([^;]+);`)) || [])[1]?.trim();
    faces.push({
      family: pick('font-family').replace(/['"]/g, ''),
      style: pick('font-style') || 'normal',
      weight: pick('font-weight') || '400',
      stretch: pick('font-stretch'),
      /* Sebagian family variabel dikirim Google dengan baris ini; kalau ada,
         harus ikut disalin apa adanya supaya sumbu non-standar tetap aktif. */
      variationSettings: (body.match(/font-variation-settings:\s*[^;]+;/) || [])[0],
      unicodeRange: pick('unicode-range'),
      src: (body.match(/url\((https:[^)]+)\)/) || [])[1],
    });
  }
  return faces;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const rules = [];

  for (const family of FAMILIES) {
    const css = await fetchText(family.url);
    const faces = parseLatinFaces(css);
    if (!faces.length) throw new Error(`Subset latin tidak ditemukan untuk ${family.url}`);

    for (const face of faces) {
      const fileName = family.file(face);
      const res = await fetch(face.src, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`Gagal mengunduh ${face.src}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(resolve(OUT_DIR, fileName), buf);
      console.log(`  ${fileName}  ${(buf.length / 1024).toFixed(1)} KB  (${face.family} ${face.weight})`);

      rules.push(
        [
          '@font-face {',
          `  font-family: '${face.family}';`,
          `  font-style: ${face.style};`,
          `  font-weight: ${face.weight};`,
          face.stretch ? `  font-stretch: ${face.stretch};` : null,
          '  font-display: swap;',
          face.variationSettings ? `  ${face.variationSettings}` : null,
          `  src: url('./${fileName}') format('woff2');`,
          `  unicode-range: ${face.unicodeRange};`,
          '}',
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
  }

  const header = [
    '/* Dihasilkan oleh scripts/fetch-fonts.mjs — jangan diedit manual. */',
    '/* Font di-self-host (blueprint 1.9). Subset: latin. */',
    '',
  ].join('\n');

  await writeFile(resolve(OUT_DIR, 'fonts.css'), header + rules.join('\n\n') + '\n');
  console.log(`\n  assets/fonts/fonts.css ditulis (${rules.length} @font-face).`);
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(1);
});
