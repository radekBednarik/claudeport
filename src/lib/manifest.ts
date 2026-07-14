import fs from 'node:fs';
import path from 'node:path';

export interface Manifest {
  version: number;
  paths: string[];
}

export const MANIFEST_FILE = 'claude-sync.json';

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
const DENIED_FILES = new Set([
  'history.jsonl',
  'policy-limits.json',
  'remote-settings.json',
]);

export function isDenied(relPath: string): boolean {
  const parts = relPath.split('/');
  if (DENIED_DIRS.has(parts[0])) return true;
  const base = path.basename(relPath);
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
  return { version: (data as Manifest).version ?? 1, paths: (data as Manifest).paths };
}

function walk(dir: string, base: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs);
    if (entry.isDirectory()) walk(abs, base, out);
    else if (entry.isFile()) out.push(rel);
  }
}

/** Resolve manifest entries against a base dir into a sorted list of existing,
 *  non-denied files (paths relative to baseDir, POSIX separators). */
export function resolveFiles(baseDir: string, manifest: Manifest): string[] {
  const out: string[] = [];
  for (const entry of manifest.paths) {
    const rel = entry.replace(/\/+$/, '');
    const abs = path.join(baseDir, rel);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) walk(abs, baseDir, out);
    else out.push(rel);
  }
  return [...new Set(out)]
    .map((p) => p.split(path.sep).join('/'))
    .filter((p) => !isDenied(p))
    .sort();
}
