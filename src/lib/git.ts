import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Run git with the given args in cwd; returns trimmed stdout, throws with stderr. */
export async function git(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
    return stdout.trim();
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error(`git ${args[0]} failed: ${e.stderr?.trim() || e.message}`);
  }
}

/** Stage everything and commit; returns false if there was nothing to commit. */
export async function commitAll(dir: string, message: string): Promise<boolean> {
  await git(['add', '-A'], dir);
  if ((await git(['status', '--porcelain'], dir)) === '') return false;
  await git(['commit', '-m', message], dir);
  return true;
}

/** Commits ahead of / behind the upstream of the current branch.
 *  Zero/zero when no upstream is configured. */
export async function aheadBehind(dir: string): Promise<{ ahead: number; behind: number }> {
  try {
    await git(['rev-parse', '@{upstream}'], dir);
  } catch {
    return { ahead: 0, behind: 0 };
  }
  const out = await git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], dir);
  const [ahead, behind] = out.split(/\s+/).map(Number);
  return { ahead, behind };
}
