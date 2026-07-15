import os from 'node:os';
import { syncFiles } from '../lib/files.js';
import { aheadBehind, commitAll, git } from '../lib/git.js';
import { claudeDir } from '../lib/paths.js';
import { openRepo } from '../lib/repo.js';
import { withSpinner } from '../lib/ui.js';

export async function push(opts: { message?: string } = {}): Promise<void> {
  const { repoDir, manifest } = openRepo();
  await withSpinner('Checking remote', () => git(['fetch'], repoDir), {
    warnOnError: 'could not reach the remote',
  });
  const { behind } = await aheadBehind(repoDir);
  if (behind > 0) {
    throw new Error(
      `Sync repo is ${behind} commit(s) behind the remote — run \`claudeport pull\` first`,
    );
  }

  const { copied, deleted } = syncFiles(claudeDir(), repoDir, manifest);
  const committed = await commitAll(repoDir, opts.message ?? `sync from ${os.hostname()}`);
  if (!committed && (await aheadBehind(repoDir)).ahead === 0) {
    console.log('Already up to date.');
    return;
  }
  await withSpinner('Pushing to remote', () => git(['push'], repoDir), {
    done: `Pushed ${copied.length} file(s)${deleted.length ? `, ${deleted.length} deletion(s)` : ''}`,
  });
}
