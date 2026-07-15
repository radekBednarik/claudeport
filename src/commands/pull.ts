import { aheadBehind, git } from '../lib/git.js';
import { loadManifest } from '../lib/manifest.js';
import { type ApplyResult, applyRepoToLocal, openRepo } from '../lib/repo.js';
import { withSpinner } from '../lib/ui.js';

export async function pull(opts: { yes?: boolean } = {}): Promise<ApplyResult> {
  const { repoDir } = openRepo();
  await withSpinner('Fetching from remote', () => git(['fetch'], repoDir), {
    warnOnError: 'could not reach the remote, applying last fetched state',
  });
  if ((await aheadBehind(repoDir)).behind > 0) {
    try {
      await withSpinner('Merging remote changes', () =>
        git(['merge', '--ff-only', '@{upstream}'], repoDir),
      );
    } catch {
      throw new Error(
        `Your sync clone at ${repoDir} has diverged from the remote — ` +
          'resolve it there with git (e.g. `git pull --rebase`), then re-run `claudeport pull`',
      );
    }
  }
  // re-read: the manifest itself may have changed
  return applyRepoToLocal(repoDir, loadManifest(repoDir), opts);
}
