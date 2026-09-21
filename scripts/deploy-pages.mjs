/**
 * deploy-pages.mjs
 * Menerbitkan isi dist/ ke branch `gh-pages` di remote `origin`.
 *
 * Kenapa lewat branch dan bukan GitHub Actions: token gh di mesin ini
 * tidak punya scope `workflow`, jadi berkas .github/workflows/ akan
 * ditolak saat push. Menerbitkan branch berisi hasil build hanya
 * memerlukan scope `repo` biasa.
 *
 * Kenapa lewat folder sementara: dist/ ada di .gitignore dan tidak
 * boleh punya .git sendiri di dalam repo kerja. Folder sementara dibuang
 * setelah selesai, jadi repo kerja tidak pernah berubah.
 *
 * Riwayat branch gh-pages sengaja ditimpa setiap kali (satu commit saja):
 * yang diterbitkan adalah hasil build, bukan sejarah pengembangan.
 *
 * Tanpa dependency. Jalankan: npm run deploy
 */
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const BRANCH = 'gh-pages';

const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

async function main() {
  try {
    await access(resolve(DIST, 'index.html'));
  } catch {
    throw new Error('dist/index.html belum ada. Jalankan `npm run build` lebih dulu.');
  }

  const remote = git(['remote', 'get-url', 'origin'], ROOT);
  const pesan = `Terbitkan hasil build — ${new Date().toISOString()}`;

  const kerja = await mkdtemp(join(tmpdir(), 'ikanb2b-pages-'));
  try {
    await cp(DIST, kerja, { recursive: true });

    /* Tanpa berkas ini GitHub menjalankan Jekyll dan membuang apa pun
       yang namanya diawali garis bawah. Tidak ada berkas seperti itu
       sekarang, tetapi menambahkannya lebih murah daripada melacak
       gambar yang hilang di kemudian hari. */
    await writeFile(resolve(kerja, '.nojekyll'), '');

    git(['init', '-q', '-b', BRANCH], kerja);
    git(['add', '-A'], kerja);
    git(['commit', '-q', '-m', pesan], kerja);
    git(['push', '--force', '--quiet', remote, `${BRANCH}:${BRANCH}`], kerja);

    console.log(`\n  Branch ${BRANCH} diperbarui di ${remote}`);
    console.log('  GitHub butuh sekitar satu menit untuk menyajikan versi barunya.\n');
  } finally {
    await rm(kerja, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('GAGAL:', err.message);
  process.exit(1);
});
