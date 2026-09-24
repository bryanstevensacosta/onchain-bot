#!/usr/bin/env node

/**
 * Script para agregar headers @deprecated a clases/servicios que serán migrados
 * 
 * Uso:
 *   node scripts/add-deprecation-headers.js \
 *     --bcs "crypto-news-integration,crypto-news-publisher,crypto-news-ads" \
 *     --target "apps/content-publisher" \
 *     --version "v2.0.0" \
 *     --eta "2026-10-15"
 * 
 * Features:
 * - Detecta clases/interfaces/servicios con decorator @Injectable, @Controller, o export
 * - Agrega JSDoc @deprecated header con info de migración
 * - Preserva imports y decorators existentes
 * - Dry-run por defecto (usar --apply para escribir cambios)
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : null;
};

const bcsArg = getArg('--bcs');
const target = getArg('--target') || 'apps/content-publisher';
const version = getArg('--version') || 'v2.0.0';
const eta = getArg('--eta') || 'TBD';
const apply = args.includes('--apply');
const verbose = args.includes('--verbose');

if (!bcsArg) {
  console.error('Error: --bcs es requerido');
  console.error('Ejemplo: --bcs "crypto-news-integration,crypto-news-publisher"');
  process.exit(1);
}

const bcs = bcsArg.split(',').map((bc) => bc.trim());

// Template para @deprecated header
const createDeprecationHeader = (className, filePath, bcName) => {
  const relativePath = filePath.replace(/^apps\/backend\/src\//, '');
  const targetPath = relativePath.replace(
    new RegExp(`^${bcName}/`),
    `${target}/src/`
  );

  return `/**
 * @deprecated Moved to ${target}
 * This ${detectType(className)} has been migrated to the content-publisher app.
 * It will be removed in ${version} (ETA: ${eta})
 * 
 * Migration guide: /docs/migrations/crypto-news-to-content-publisher.md
 * 
 * New location: ${targetPath}
 * Replacement: Use equivalent service/controller from content-publisher app
 * 
 * Reason: Extracting crypto-news publishing logic from backend monolith to dedicated app
 * Breaking change: Yes (removal)
 * Rollback: Revert to ${version} - 1 if needed
 */`;
};

// Detectar tipo de clase (Service, Controller, etc.)
const detectType = (className) => {
  if (className.includes('Service')) return 'service';
  if (className.includes('Controller')) return 'controller';
  if (className.includes('UseCase')) return 'use case';
  if (className.includes('Repository')) return 'repository';
  if (className.includes('Adapter')) return 'adapter';
  if (className.includes('Scheduler')) return 'scheduler';
  if (className.includes('Guard')) return 'guard';
  if (className.includes('Filter')) return 'filter';
  if (className.includes('Pipe')) return 'pipe';
  if (className.includes('Interceptor')) return 'interceptor';
  if (className.includes('Module')) return 'module';
  return 'class';
};

// Detectar si archivo ya tiene @deprecated
const hasDeprecation = (content) => {
  return content.includes('@deprecated');
};

// Detectar clases/servicios exportados
const extractExportedClasses = (content) => {
  const classRegex = /export\s+(?:class|interface)\s+(\w+)/g;
  const classes = [];
  let match;

  while ((match = classRegex.exec(content)) !== null) {
    classes.push(match[1]);
  }

  return classes;
};

// Agregar @deprecated header antes de export class/interface
const addDeprecationToFile = (content, filePath, bcName) => {
  const classes = extractExportedClasses(content);

  if (classes.length === 0) {
    if (verbose) {
      console.log(`  [SKIP] No exported classes found in ${filePath}`);
    }
    return null;
  }

  let modifiedContent = content;
  let changes = 0;

  classes.forEach((className) => {
    // Buscar patrón: export class/interface ClassName
    const pattern = new RegExp(
      `(export\\s+(?:class|interface)\\s+${className})`,
      'g'
    );

    if (!modifiedContent.match(pattern)) return;

    const header = createDeprecationHeader(className, filePath, bcName);

    // Insertar header ANTES de export class/interface
    modifiedContent = modifiedContent.replace(
      pattern,
      `${header}\n$1`
    );

    changes++;
  });

  return changes > 0 ? modifiedContent : null;
};

// Main
(async () => {
  console.log('🔍 Content Publisher Deprecation Script\n');
  console.log(`BCs: ${bcs.join(', ')}`);
  console.log(`Target: ${target}`);
  console.log(`Version: ${version}`);
  console.log(`ETA: ${eta}`);
  console.log(`Mode: ${apply ? 'WRITE' : 'DRY-RUN'}\n`);

  let totalFiles = 0;
  let modifiedFiles = 0;
  let skippedFiles = 0;

  for (const bc of bcs) {
    const bcPath = path.join(__dirname, '..', 'apps', 'backend', 'src', bc);

    if (!fs.existsSync(bcPath)) {
      console.error(`❌ BC no encontrado: ${bcPath}`);
      continue;
    }

    console.log(`\n📦 Processing BC: ${bc}`);

    const files = glob.sync(`${bcPath}/**/*.ts`, {
      ignore: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/index.ts'],
    });

    console.log(`  Found ${files.length} files\n`);

    for (const file of files) {
      totalFiles++;
      const content = fs.readFileSync(file, 'utf-8');
      const relativePath = file.replace(
        path.join(__dirname, '..', 'apps', 'backend', 'src') + '/',
        ''
      );

      if (hasDeprecation(content)) {
        if (verbose) {
          console.log(`  [SKIP] Already deprecated: ${relativePath}`);
        }
        skippedFiles++;
        continue;
      }

      const modifiedContent = addDeprecationToFile(content, file, bc);

      if (!modifiedContent) {
        skippedFiles++;
        continue;
      }

      modifiedFiles++;
      console.log(`  [${apply ? 'WRITE' : 'DRY-RUN'}] ${relativePath}`);

      if (apply) {
        fs.writeFileSync(file, modifiedContent, 'utf-8');
      }
    }
  }

  console.log(`\n\n📊 Summary:`);
  console.log(`  Total files scanned: ${totalFiles}`);
  console.log(`  Modified: ${modifiedFiles}`);
  console.log(`  Skipped: ${skippedFiles}`);

  if (!apply && modifiedFiles > 0) {
    console.log(`\n⚠️  DRY-RUN mode: no files were modified`);
    console.log(`   Run with --apply to write changes`);
  } else if (apply) {
    console.log(`\n✅ Changes written successfully`);
    console.log(`   Next steps:`);
    console.log(`   1. Review changes: git diff`);
    console.log(`   2. Run tests: npm run test:backend`);
    console.log(`   3. Commit: git commit -m "chore: add @deprecated headers to crypto-news BCs"`);
  }
})();
