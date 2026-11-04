#!/usr/bin/env node
// Explicit, copy-only migration. Never run automatically during an installation.
import { existsSync, lstatSync, readdirSync, mkdirSync, copyFileSync, constants } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function migrate(project, { dryRun = false } = {}) {
  project = resolve(project);
  if (!existsSync(project) || !lstatSync(project).isDirectory() || lstatSync(project).isSymbolicLink()) throw new Error('Project must be an existing, non-symlink directory.');
  // The predecessor name appears only here and in explicit compatibility support.
  const source = join(project, '.hallmark');
  const target = join(project, '.slopless');
  const result = { copied: [], skipped: [], dryRun };
  try { lstatSync(source); } catch (error) { if (error.code === 'ENOENT') return result; throw error; }
  const plan = [];
  const inspect = (src, dest) => {
    const stat = lstatSync(src);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink: ${src}`);
    if (existsSync(dest) || (() => { try { return lstatSync(dest).isSymbolicLink(); } catch { return false; } })()) {
      const dst = lstatSync(dest);
      if (dst.isSymbolicLink()) throw new Error(`Refusing symlink destination: ${dest}`);
      if (stat.isDirectory() !== dst.isDirectory()) throw new Error(`Directory/file conflict: ${dest}`);
    }
    if (stat.isDirectory()) for (const name of readdirSync(src)) inspect(join(src, name), join(dest, name));
    else if (stat.isFile()) plan.push({ src, dest, exists: existsSync(dest) });
    else throw new Error(`Refusing non-regular file: ${src}`);
  };
  inspect(source, target); // Validate the entire tree before writing any file.
  for (const item of plan) {
    const relative = item.dest.slice(target.length + 1);
    if (item.exists) { result.skipped.push(relative); continue; }
    if (!dryRun) {
      mkdirSync(dirname(item.dest), { recursive: true });
      // COPYFILE_EXCL also protects against a file created after preflight.
      copyFileSync(item.src, item.dest, constants.COPYFILE_EXCL);
    }
    result.copied.push(relative);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--project');
  const valid = args.every((a, i) => a === '--dry-run' || a === '--help' || a === '--project' || i === index + 1 && index >= 0);
  if (args.includes('--help')) { console.log('node scripts/migrate.mjs --project <directory> [--dry-run]\nCopy missing legacy state into .slopless without changing the source.'); process.exit(0); }
  if (!valid || index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) { console.error('usage: node scripts/migrate.mjs --project <directory> [--dry-run]'); process.exit(2); }
  try { console.log(JSON.stringify(migrate(args[index + 1], { dryRun: args.includes('--dry-run') }), null, 2)); }
  catch (error) { console.error(error.message); process.exit(1); }
}
