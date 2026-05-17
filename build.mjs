#!/usr/bin/env node
/**
 * Build script: bundles server.js to CJS with esbuild, copies static assets,
 * then uses @yao-pkg/pkg to produce standalone executables for macOS, Windows, Linux.
 *
 * Usage:
 *   node build.mjs              → build all platforms
 *   node build.mjs --host       → build for current platform only
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST      = path.join(__dirname, 'dist');
const BUNDLE    = path.join(DIST, 'bundle.cjs');
const hostOnly  = process.argv.includes('--host');

// ── 1. Clean dist ─────────────────────────────────────────────────────────────
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// ── 2. Bundle server.js → CJS ─────────────────────────────────────────────────
console.log('Bundling server.js…');
await build({
  entryPoints: [path.join(__dirname, 'server.js')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: BUNDLE,
  external: [],
});

// ── 3. Copy static assets into dist/ ─────────────────────────────────────────
console.log('Copying assets…');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.copyFileSync(path.join(__dirname, 'renderer', 'index.html'), path.join(DIST, 'index.html'));
fs.copyFileSync(path.join(__dirname, 'assets', 'icon.svg'),     path.join(DIST, 'icon.svg'));
copyDir(path.join(__dirname, 'lib'), path.join(DIST, 'lib'));

// ── 4. pkg config (inline) ────────────────────────────────────────────────────
const pkgConfig = {
  pkg: {
    assets: ['dist/index.html', 'dist/icon.svg', 'dist/lib/**/*', 'dist/renderer/**/*'],
    targets: hostOnly
      ? [`node18-${process.platform}-x64`]
      : ['node18-macos-x64', 'node18-win-x64', 'node18-linux-x64'],
    outputPath: path.join(DIST, 'executables'),
  },
};

const tmpPkg = path.join(DIST, '_pkg.json');
fs.writeFileSync(tmpPkg, JSON.stringify({
  name: 'vega',
  version: '1.4.0',
  bin: BUNDLE,
  ...pkgConfig,
}));

// ── 5. Run pkg ────────────────────────────────────────────────────────────────
console.log(`Creating executable(s) with pkg…`);
fs.mkdirSync(path.join(DIST, 'executables'), { recursive: true });

const targets = pkgConfig.pkg.targets.join(',');
execSync(
  `npx @yao-pkg/pkg ${tmpPkg} --targets ${targets} --output ${path.join(DIST, 'executables', 'vega')} --compress GZip`,
  { stdio: 'inherit' }
);

fs.rmSync(tmpPkg);

console.log('\nDone! Executables are in dist/executables/');
