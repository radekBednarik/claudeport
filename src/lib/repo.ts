import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { execFileSync } from 'node:child_process';
import pc from 'picocolors';
import { claudeDir, syncDir } from './paths.js';
import { loadManifest, MANIFEST_FILE, type Manifest } from './manifest.js';
import { backupFiles, diffFiles, syncFiles, type FileDiff } from './files.js';

export function openRepo(): { repoDir: string; manifest: Manifest } {
  const repoDir = syncDir();
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    throw new Error(`No sync repo at ${repoDir} — run \`claudesync init <remote-url>\` first`);
  }
  return { repoDir, manifest: loadManifest(repoDir) };
}

export function printDiff(diff: FileDiff, labels: { added: string; changed: string; removed: string }): void {
  for (const rel of diff.added) console.log(pc.green(`  ${labels.added} ${rel}`));
  for (const rel of diff.changed) console.log(pc.yellow(`  ${labels.changed} ${rel}`));
  for (const rel of diff.removed) console.log(pc.red(`  ${labels.removed} ${rel}`));
}

/** Unified diff of every manifest-tracked file that differs (a = fromDir, b = toDir). */
export function unifiedDiff(fromDir: string, toDir: string, manifest: Manifest): string {
  const diff = diffFiles(toDir, fromDir, manifest);
  const chunks: string[] = [];
  for (const rel of diff.added) chunks.push(`Only in ${toDir}: ${rel}`);
  for (const rel of diff.removed) chunks.push(`Only in ${fromDir}: ${rel}`);
  for (const rel of diff.changed) {
    try {
      execFileSync(
        'git',
        ['diff', '--no-index', '--', path.join(fromDir, rel), path.join(toDir, rel)],
        { encoding: 'utf8', stdio: 'pipe' },
      );
    } catch (err) {
      chunks.push((err as { stdout?: string }).stdout ?? '');
    }
  }
  return chunks.join('\n');
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    throw new Error('Not running interactively — re-run with --yes to apply without confirmation');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

export interface ApplyResult {
  applied: FileDiff;
  backupDir?: string;
}

/** Apply the repo's manifest-tracked files to the local Claude dir:
 *  show what changes, confirm, back up, then copy/delete. */
export async function applyRepoToLocal(
  repoDir: string,
  manifest: Manifest,
  opts: { yes?: boolean },
): Promise<ApplyResult> {
  const local = claudeDir();
  const diff = diffFiles(repoDir, local, manifest);
  if (diff.added.length + diff.changed.length + diff.removed.length === 0) {
    console.log('Already up to date.');
    return { applied: diff };
  }

  console.log(`Incoming changes to ${local}:`);
  printDiff(diff, { added: '+ add', changed: '~ update', removed: '- delete' });
  if (!opts.yes && !(await confirm('Apply these changes?'))) {
    throw new Error('Aborted — nothing was changed');
  }

  let backupDir: string | undefined;
  const affected = [...diff.changed, ...diff.removed];
  if (affected.length > 0) {
    backupDir = backupFiles(local, affected, path.join(local, 'backups'));
    console.log(pc.dim(`Backed up ${affected.length} file(s) to ${backupDir}`));
  }
  syncFiles(repoDir, local, manifest);
  console.log(pc.green('Applied.'));
  return { applied: diff, backupDir };
}

export { MANIFEST_FILE };
