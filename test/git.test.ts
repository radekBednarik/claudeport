import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { aheadBehind, commitAll, git } from '../src/lib/git.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudeport-test-'));
}

async function makeRemoteAndClone(): Promise<{ remote: string; clone: string }> {
  const remote = path.join(tmpDir(), 'remote.git');
  await git(['init', '--bare', '-b', 'main', remote], tmpDir());
  const clone = path.join(tmpDir(), 'clone');
  await git(['clone', remote, clone], tmpDir());
  await git(['config', 'user.email', 'test@test'], clone);
  await git(['config', 'user.name', 'test'], clone);
  return { remote, clone };
}

test('git runs a command and returns stdout', async () => {
  const dir = tmpDir();
  await git(['init', '-b', 'main'], dir);
  expect(await git(['symbolic-ref', '--short', 'HEAD'], dir)).toBe('main');
});

test('git throws with stderr on failure', async () => {
  await expect(git(['rev-parse', 'HEAD'], tmpDir())).rejects.toThrow(/not a git repository/i);
});

test('commitAll commits everything and returns false on a clean tree', async () => {
  const { clone } = await makeRemoteAndClone();
  fs.writeFileSync(path.join(clone, 'a.txt'), 'hello');

  expect(await commitAll(clone, 'first')).toBe(true);
  expect(await git(['log', '--format=%s'], clone)).toBe('first');
  expect(await commitAll(clone, 'noop')).toBe(false);
});

test('aheadBehind is zero when no upstream is configured', async () => {
  const dir = tmpDir();
  await git(['init', '-b', 'main'], dir);
  await git(['config', 'user.email', 'test@test'], dir);
  await git(['config', 'user.name', 'test'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  await commitAll(dir, 'c1');

  expect(await aheadBehind(dir)).toEqual({ ahead: 0, behind: 0 });
});

test('aheadBehind reports divergence from origin', async () => {
  const { remote, clone: a } = await makeRemoteAndClone();
  fs.writeFileSync(path.join(a, 'a.txt'), '1');
  await commitAll(a, 'c1');
  await git(['push', '-u', 'origin', 'main'], a);

  const b = path.join(tmpDir(), 'b');
  await git(['clone', remote, b], tmpDir());
  await git(['config', 'user.email', 'test@test'], b);
  await git(['config', 'user.name', 'test'], b);
  expect(await aheadBehind(b)).toEqual({ ahead: 0, behind: 0 });

  fs.writeFileSync(path.join(a, 'a.txt'), '2');
  await commitAll(a, 'c2');
  await git(['push'], a);
  fs.writeFileSync(path.join(b, 'b.txt'), 'x');
  await commitAll(b, 'c3');
  await git(['fetch'], b);

  expect(await aheadBehind(b)).toEqual({ ahead: 1, behind: 1 });
});
