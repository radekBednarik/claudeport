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
    git(['merge', '--ff-only', '@{upstream}'], repoDir);
  }
  // re-read: the manifest itself may have changed
  return applyRepoToLocal(repoDir, loadManifest(repoDir), opts);
}
