import fs from 'node:fs';
import path from 'node:path';
import { resolveFiles, type Manifest } from './manifest.js';

export interface FileDiff {
  added: string[]; // in src, not in dest
  changed: string[]; // in both, contents differ
  removed: string[]; // in dest, not in src
}

function sameContent(a: string, b: string): boolean {
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

export function diffFiles(srcDir: string, destDir: string, manifest: Manifest): FileDiff {
  const srcFiles = new Set(resolveFiles(srcDir, manifest));
  const destFiles = new Set(resolveFiles(destDir, manifest));
  const diff: FileDiff = { added: [], changed: [], removed: [] };
  for (const rel of srcFiles) {
    if (!destFiles.has(rel)) diff.added.push(rel);
    else if (!sameContent(path.join(srcDir, rel), path.join(destDir, rel))) {
      diff.changed.push(rel);
    }
  }
  for (const rel of destFiles) {
    if (!srcFiles.has(rel)) diff.removed.push(rel);
  }
  return diff;
}

/** Make destDir's manifest-tracked files match srcDir's (copy + delete). */
export function syncFiles(
  srcDir: string,
  destDir: string,
  manifest: Manifest,
): { copied: string[]; deleted: string[] } {
  const diff = diffFiles(srcDir, destDir, manifest);
  const copied = [...diff.added, ...diff.changed].sort();
  for (const rel of copied) {
    const dest = path.join(destDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(srcDir, rel), dest);
  }
  for (const rel of diff.removed) {
    fs.rmSync(path.join(destDir, rel));
  }
  return { copied, deleted: diff.removed };
}

/** Copy the given files from baseDir into a new timestamped dir under backupRoot. */
export function backupFiles(baseDir: string, relPaths: string[], backupRoot: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(backupRoot, `claude-sync-${stamp}`);
  for (const rel of relPaths) {
    const src = path.join(baseDir, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(backupDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return backupDir;
}
