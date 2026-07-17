import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncFiles } from '../lib/files.js';
import { commitAll, git } from '../lib/git.js';
import { DEFAULT_MANIFEST, loadManifest, MANIFEST_FILE, saveManifest } from '../lib/manifest.js';
import { claudeDir, syncDir } from '../lib/paths.js';
import { applyRepoToLocal } from '../lib/repo.js';
import { withSpinner } from '../lib/ui.js';

export async function init(remoteUrl: string, opts: { yes?: boolean } = {}): Promise<void> {
  const repoDir = syncDir();
  if (fs.existsSync(repoDir)) {
    throw new Error(`${repoDir} already exists — this machine looks already initialized`);
  }
  fs.mkdirSync(path.dirname(repoDir), { recursive: true });
  // `--` stops remoteUrl being parsed as an option; disabling the ext transport
  // blocks `ext::sh -c '…'` URLs that would run arbitrary local shell on clone.
  await withSpinner(
    'Cloning config repo',
    () =>
      git(
        ['clone', '-c', 'protocol.ext.allow=never', '--', remoteUrl, repoDir],
        path.dirname(repoDir),
      ),
    { done: 'Cloned config repo' },
  );
  try {
    await setup(repoDir, remoteUrl, opts);
  } catch (err) {
    fs.rmSync(repoDir, { recursive: true, force: true });
    throw err;
  }
}

async function setup(repoDir: string, remoteUrl: string, opts: { yes?: boolean }): Promise<void> {
  if (fs.existsSync(path.join(repoDir, MANIFEST_FILE))) {
    console.log('Found existing config in the repo — applying it to this machine.');
    await applyRepoToLocal(repoDir, loadManifest(repoDir), opts);
    return;
  }

  let hasCommits = true;
  try {
    await git(['rev-parse', 'HEAD'], repoDir);
  } catch {
    hasCommits = false;
  }
  if (hasCommits) {
    throw new Error(
      `Remote is not empty but has no ${MANIFEST_FILE} — is this the right repo? ` +
        'Point claudeport at an empty repo or an existing claudeport repo.',
    );
  }

  console.log(`Seeding ${remoteUrl} from ${claudeDir()} …`);
  saveManifest(repoDir, DEFAULT_MANIFEST);
  const { copied } = syncFiles(claudeDir(), repoDir, DEFAULT_MANIFEST);
  await commitAll(repoDir, `claudeport init from ${os.hostname()}`);
  await withSpinner('Pushing to remote', () => git(['push', '-u', 'origin', 'HEAD'], repoDir), {
    done: `Initialized: ${copied.length} file(s) pushed`,
  });
}
