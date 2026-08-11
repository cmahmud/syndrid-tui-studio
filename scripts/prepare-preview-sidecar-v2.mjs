import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv.includes('--release');
const profile = release ? 'release' : 'debug';
const extension = process.platform === 'win32' ? '.exe' : '';
const rustc = process.env.RUSTC || 'rustc';
const cargo = process.env.CARGO || 'cargo';
const versionInfo = execFileSync(rustc, ['-vV'], { encoding: 'utf8' });
const targetTriple = versionInfo.match(/^host:\s*(.+)$/m)?.[1]?.trim();
if (!targetTriple) throw new Error('rustc -vV did not report a host target triple');

const args = [
  'build',
  '--manifest-path', join(root, 'src-tauri', 'Cargo.toml'),
  '--bin', 'syndrid-tui-preview',
  '--target-dir', join(root, 'src-tauri', 'target'),
];
if (release) args.push('--release');

console.log(`[preview-sidecar] building ${profile} for ${targetTriple}`);
execFileSync(cargo, args, { cwd: root, stdio: 'inherit' });

const source = join(root, 'src-tauri', 'target', profile, `syndrid-tui-preview${extension}`);
const binaries = join(root, 'src-tauri', 'binaries');
mkdirSync(binaries, { recursive: true });
const destination = join(binaries, `syndrid-tui-preview-${targetTriple}${extension}`);
copyFileSync(source, destination);
console.log(`[preview-sidecar] ${destination} (${statSync(destination).size} bytes)`);
