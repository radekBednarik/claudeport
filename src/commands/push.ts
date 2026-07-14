import os from 'node:os';
import pc from 'picocolors';
import { claudeDir } from '../lib/paths.js';
import { aheadBehind, commitAll, git } from '../lib/git.js';
import { syncFiles } from '../lib/files.js';
import { openRepo } from '../lib/repo.js';

export async function push(opts: { message?: string } = {}): Promise<void> {
  const { repoDir, manifest } = openRepo();
  try {
    git(['fetch'], repoDir);
  } catch {
    console.error(pc.yellow('warning: could not reach the remote'));
  }
  const { behind } = aheadBehind(repoDir);
  if (behind > 0) {
    throw new Error(`Sync repo is ${behind} commit(s) behind the remote — run \`claudesync pull\` first`);
  }

  const { copied, deleted } = syncFiles(claudeDir(), repoDir, manifest);
  const committed = commitAll(repoDir, opts.message ?? `sync from ${os.hostname()}`);
  if (!committed && aheadBehind(repoDir).ahead === 0) {
    console.log('Already up to date.');
    return;
  }
  git(['push'], repoDir);
  console.log(pc.green(`Pushed ${copied.length} file(s)${deleted.length ? `, ${deleted.length} deletion(s)` : ''}.`));
}
