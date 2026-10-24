// ウェブ版を書き出して、GitHub Pages で公開する docs/ に置く。
//
// GitHub Pages（Jekyll）は、名前が _ で始まるフォルダと node_modules を公開しない。
// expo export はその名前のフォルダを作るので、名前を変えて、中の参照も書き換える。
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const out = resolve(root, process.argv[2] ?? '../docs');

rmSync(dist, { recursive: true, force: true });
execSync('npx expo export -p web --output-dir dist', { cwd: root, stdio: 'inherit' });

const RENAMES = [
  ['_expo', 'expo'],
  ['assets/node_modules', 'assets/nm'],
];
for (const [from, to] of RENAMES) {
  if (existsSync(join(dist, from))) renameSync(join(dist, from), join(dist, to));
}

// index.html と js の中の参照を書き換える
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
for (const file of walk(dist).filter((p) => /\.(html|js|json)$/.test(p))) {
  const text = readFileSync(file, 'utf8');
  const next = text.replaceAll('/_expo/', '/expo/').replaceAll('/assets/node_modules/', '/assets/nm/');
  if (next !== text) writeFileSync(file, next);
}

rmSync(out, { recursive: true, force: true });
cpSync(dist, out, { recursive: true });
writeFileSync(join(out, '.nojekyll'), '');
console.log(`書き出し先：${out}`);
