#!/usr/bin/env node
// Bundles the exporters and writes real generated output for each target
// language to export-check/, so CI can hand each file to its real compiler
// (cargo, go, python, node) instead of trusting the exporter's own snapshot
// tests. See .github/workflows/ci.yml.

import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const outDir = path.join(repoRoot, 'export-check');

const EXTENSIONS = {
  ratatui: 'rs',
  bubbletea: 'go',
  tview: 'go',
  textual: 'py',
  blessed: 'js',
  opentui: 'tsx',
  ink: 'tsx',
};

// Formats with a real color-tier degradation path (see codeExporter.ts / shared.ts).
// Textual's TCSS color story doesn't have an ansi16 mode (see todo.md), so it's excluded.
const COLOR_MODE_FORMATS = new Set(['ratatui', 'bubbletea', 'tview', 'blessed', 'opentui', 'ink']);

async function main() {
  const result = await build({
    stdin: {
      contents: `
        export { exportToCode } from '${path.join(repoRoot, 'src/utils/export/codeExporter')}';
        export { kitchenSinkTree, styleEdgeCasesTree } from '${path.join(repoRoot, 'src/utils/export/__tests__/fixtures')}';
      `,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });

  const bundlePath = path.join(os.tmpdir(), `export-check-bundle-${Date.now()}.mjs`);
  writeFileSync(bundlePath, result.outputFiles[0].text);
  const { exportToCode, kitchenSinkTree, styleEdgeCasesTree } = await import(bundlePath);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const write = (name, code) => {
    writeFileSync(path.join(outDir, name), code);
    console.log(`wrote export-check/${name}`);
  };

  const kitchenTree = kitchenSinkTree();
  const edgeTree = styleEdgeCasesTree();
  for (const [format, ext] of Object.entries(EXTENSIONS)) {
    write(`${format}.${ext}`, exportToCode(kitchenTree, format));
    // The style-edge-cases fixture exercises gradient fallback and justify/align/gap —
    // real code paths the kitchen-sink fixture alone doesn't hit (no gradient/justify there).
    write(`${format}-edge.${ext}`, exportToCode(edgeTree, format));
    if (COLOR_MODE_FORMATS.has(format)) {
      write(`${format}-edge-ansi16.${ext}`, exportToCode(edgeTree, format, 'ansi16'));
      write(`${format}-edge-ansi256.${ext}`, exportToCode(edgeTree, format, 'ansi256'));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
