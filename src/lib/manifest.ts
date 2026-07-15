import fs from 'node:fs';
import path from 'node:path';

export interface Manifest {
  version: number;
  paths: string[];
}

export const MANIFEST_FILE = 'claudeport.json';

export const DEFAULT_MANIFEST: Manifest = {
  version: 1,
  paths: [
    'settings.json',
    'skills/',
    'agents/',
    'commands/',
    'CLAUDE.md',
    'keybindings.json',
    'plugins/installed_plugins.json',
    'plugins/known_marketplaces.json',
  ],
};

// Never synced, regardless of what the manifest says.
const DENIED_DIRS = new Set([
  'projects',
  'sessions',
  'session-env',
  'file-history',
  'shell-snapshots',
  'cache',
  'paste-cache',
  'telemetry',
  'backups',
  'security',
  'downloads',
  'todos',
]);
const DENIED_FILES = new Set(['history.jsonl', 'policy-limits.json', 'remote-settings.json']);

/** Normalize a manifest entry to a safe repo-relative path, or null if it is
 *  hostile (absolute, or escaping the base dir). Manifest entries come from the
 *  synced repo and must be treated as untrusted input. */
export function normalizeEntry(entry: string): string | null {
  if (path.posix.isAbsolute(entry) || path.win32.isAbsolute(entry)) return null;
  const norm = path.posix.normalize(entry.replaceAll('\\', '/')).replace(/\/+$/, '');
  if (norm === '' || norm === '.' || norm === '..' || norm.startsWith('../')) return null;
  return norm;
}

export function isDenied(relPath: string): boolean {
  const norm = normalizeEntry(relPath);
  if (norm === null) return true;
  if (DENIED_DIRS.has(norm.split('/')[0])) return true;
  if (norm === 'plugins/cache' || norm.startsWith('plugins/cache/')) return true;
  const base = path.basename(norm);
  if (DENIED_FILES.has(base)) return true;
  if (base.toLowerCase().includes('credentials')) return true;
  if (base.endsWith('.pem') || base.endsWith('.key')) return true;
  return false;
}

export function loadManifest(repoDir: string): Manifest {
  const raw = fs.readFileSync(path.join(repoDir, MANIFEST_FILE), 'utf8');
  const data: unknown = JSON.parse(raw);
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as Manifest).paths) ||
    !(data as Manifest).paths.every((p) => typeof p === 'string')
  ) {
    throw new Error(`Invalid manifest in ${path.join(repoDir, MANIFEST_FILE)}`);
  }
  const version = (data as Manifest).version ?? 1;
  if (version > 1) {
    throw new Error(`Manifest version ${version} is not supported — update claudeport`);
  }
  return { version, paths: (data as Manifest).paths };
}

function walk(dir: string, base: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs);
    // Dirent type checks don't follow symlinks, so links are skipped here.
    if (entry.isDirectory()) walk(abs, base, out);
    else if (entry.isFile()) out.push(rel);
  }
}

/** Resolve manifest entries against a base dir into a sorted list of existing,
 *  non-denied files (paths relative to baseDir, POSIX separators).
 *  Hostile entries (absolute, escaping, denied) and symlinks are dropped. */
export function resolveFiles(baseDir: string, manifest: Manifest): string[] {
  const out: string[] = [];
  for (const entry of manifest.paths) {
    const rel = normalizeEntry(entry);
    if (rel === null) continue;
    const abs = path.join(baseDir, rel);
    if (!fs.existsSync(abs)) continue;
    const stat = fs.lstatSync(abs);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(abs, baseDir, out);
    else if (stat.isFile()) out.push(rel);
  }
  return [...new Set(out)]
    .map((p) => p.split(path.sep).join('/'))
    .filter((p) => !isDenied(p))
    .sort();
}
