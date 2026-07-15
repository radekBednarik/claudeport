import pc from 'picocolors';
import { diffFiles, type FileDiff } from '../lib/files.js';
import { aheadBehind, git } from '../lib/git.js';
import { claudeDir } from '../lib/paths.js';
import { openRepo, printDiff } from '../lib/repo.js';
import { withSpinner } from '../lib/ui.js';

export interface StatusResult {
  ahead: number;
  behind: number;
  diff: FileDiff;
}

export async function status(): Promise<StatusResult> {
  const { repoDir, manifest } = openRepo();
  await withSpinner('Checking remote', () => git(['fetch'], repoDir), {
    warnOnError: 'could not reach the remote, showing offline status',
  });
  const { ahead, behind } = await aheadBehind(repoDir);
  const diff = diffFiles(claudeDir(), repoDir, manifest);

  if (behind > 0)
    console.log(
      pc.yellow(`Repo is ${behind} commit(s) behind the remote — run \`claudeport pull\``),
    );
  if (ahead > 0) console.log(pc.yellow(`Repo is ${ahead} commit(s) ahead of the remote`));
  const dirty = diff.added.length + diff.changed.length + diff.removed.length;
  if (dirty > 0) {
    console.log('Local changes not in the repo (`claudeport push` to sync):');
    printDiff(diff, { added: '+ new', changed: '~ modified', removed: '- deleted locally' });
  }
  if (dirty === 0 && ahead === 0 && behind === 0) console.log(pc.green('Everything in sync.'));
  return { ahead, behind, diff };
}
