import { execFileSync } from 'node:child_process';

/** Run git with the given args in cwd; returns trimmed stdout, throws with stderr. */
export function git(args: string[], cwd: string): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error(`git ${args[0]} failed: ${e.stderr?.trim() || e.message}`);
  }
}

/** Stage everything and commit; returns false if there was nothing to commit. */
export function commitAll(dir: string, message: string): boolean {
  git(['add', '-A'], dir);
  if (git(['status', '--porcelain'], dir) === '') return false;
  git(['commit', '-m', message], dir);
  return true;
}

/** Commits ahead of / behind the upstream of the current branch. */
export function aheadBehind(dir: string): { ahead: number; behind: number } {
  const out = git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], dir);
  const [ahead, behind] = out.split(/\s+/).map(Number);
  return { ahead, behind };
}
