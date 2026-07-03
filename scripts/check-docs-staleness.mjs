#!/usr/bin/env node
// scripts/check-docs-staleness.mjs
//
// Chequea si los archivos staged tienen AGENTS.md desactualizados.
// Regla: para cada archivo cambiado, busca en .docs-map.jsonc todos los
// AGENTS.md desde el más cercano hasta BC level (L2).
// Si el AGENTS.md no está también staged, muestra warning.
//
// Uso: node scripts/check-docs-staleness.mjs
// Exit code: 0 siempre (no bloqueante)

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const ROOT = process.cwd();

// 1. Leer .docs-map.jsonc (soporta comentarios JSONC)
function loadDocsMap() {
  const raw = readFileSync(resolve(ROOT, '.docs-map.jsonc'), 'utf8');
  // Strip single-line comments (//) and block comments (/* */)
  const json = raw
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return JSON.parse(json);
}

let config;
try {
  config = loadDocsMap();
} catch (err) {
  console.error('⚠️  No se pudo leer .docs-map.jsonc:', err.message);
  process.exit(0);
}

// 2. Obtener archivos staged
let stagedRaw = '';
try {
  stagedRaw = execSync('git diff --cached --name-only', { cwd: ROOT })
    .toString()
    .trim();
} catch (err) {
  // No git repo or no commits — just exit cleanly
  process.exit(0);
}

const stagedFiles = stagedRaw ? stagedRaw.split('\n').filter(Boolean) : [];

if (stagedFiles.length === 0) process.exit(0);

// 3. Para cada archivo, encontrar todos los AGENTS.md aplicables
//    desde el más cercano hasta BC level (L2 inclusive):
//    el archivo debe estar dentro del path del entry, y el entry debe
//    tener level >= 2 (L2 = BC o más profundo).
//    Esto incluye: L2 (BC), L3 (sub-BC), L4+ (módulos internos).
//    Excluye: L0 (root), L1 (app) — esos son demasiado generales para
//    cambios dentro de un BC.
const docsToUpdate = new Set();

for (const file of stagedFiles) {
  for (const entry of config.maps) {
    if (entry.path === '' || file.startsWith(entry.path + '/')) {
      // Regla: incluir desde BC level (L2) en adelante.
      // El más específico y sus ancestros hasta L2.
      if (entry.level >= 2) {
        docsToUpdate.add(entry.doc);
      }
    }
  }
}

// 4. Verificar cuáles NO están staged
const stagedDocs = new Set(
  stagedFiles.filter((f) => f.endsWith('AGENTS.md')),
);

const missing = [...docsToUpdate].filter((doc) => !stagedDocs.has(doc));

if (missing.length > 0) {
  console.log('\n⚠️  Documentación posiblemente desactualizada:');
  for (const doc of missing) {
    console.log(`   • ${doc}`);
  }
  console.log(
    '\n   Actualiza el AGENTS.md correspondiente o ignora este warning.\n',
  );
}

process.exit(0);