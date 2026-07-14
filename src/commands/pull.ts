import pc from 'picocolors';
import { aheadBehind, git } from '../lib/git.js';
import { loadManifest } from '../lib/manifest.js';
import { applyRepoToLocal, openRepo, type ApplyResult } from '../lib/repo.js';

export async function pull(opts: { yes?: boolean } = {}): Promise<ApplyResult> {
  const { repoDir } = openRepo();
  try {
    git(['fetch'], repoDir);
  } catch {
    console.error(pc.yellow('warning: could not reach the remote, applying last fetched state'));
  }
  if (aheadBehind(repoDir).behind > 0) {
    try {
      git(['merge', '--ff-only', '@{upstream}'], repoDir);
    } catch {
      throw new Error(
        `Your sync clone at ${repoDir} has diverged from the remote — ` +
          'resolve it there with git (e.g. `git pull --rebase`), then re-run `claudesync pull`',
      );
    }
  }
  // re-read: the manifest itself may have changed
  return applyRepoToLocal(repoDir, loadManifest(repoDir), opts);
}
