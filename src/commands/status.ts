import pc from 'picocolors';
import { claudeDir } from '../lib/paths.js';
import { aheadBehind, git } from '../lib/git.js';
import { diffFiles, type FileDiff } from '../lib/files.js';
import { openRepo, printDiff } from '../lib/repo.js';

export interface StatusResult {
  ahead: number;
  behind: number;
  diff: FileDiff;
}

export async function status(): Promise<StatusResult> {
  const { repoDir, manifest } = openRepo();
  try {
    git(['fetch'], repoDir);
  } catch {
    console.error(pc.yellow('warning: could not reach the remote, showing offline status'));
  }
  const { ahead, behind } = aheadBehind(repoDir);
  const diff = diffFiles(claudeDir(), repoDir, manifest);

  if (behind > 0) console.log(pc.yellow(`Repo is ${behind} commit(s) behind the remote — run \`claudeport pull\``));
  if (ahead > 0) console.log(pc.yellow(`Repo is ${ahead} commit(s) ahead of the remote`));
  const dirty = diff.added.length + diff.changed.length + diff.removed.length;
  if (dirty > 0) {
    console.log('Local changes not in the repo (`claudeport push` to sync):');
    printDiff(diff, { added: '+ new', changed: '~ modified', removed: '- deleted locally' });
  }
  if (dirty === 0 && ahead === 0 && behind === 0) console.log(pc.green('Everything in sync.'));
  return { ahead, behind, diff };
}
