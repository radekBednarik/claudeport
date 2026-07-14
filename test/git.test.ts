import { expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { aheadBehind, commitAll, git } from '../src/lib/git.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudesync-test-'));
}

function makeRemoteAndClone(): { remote: string; clone: string } {
  const remote = path.join(tmpDir(), 'remote.git');
  git(['init', '--bare', '-b', 'main', remote], tmpDir());
  const clone = path.join(tmpDir(), 'clone');
  git(['clone', remote, clone], tmpDir());
  git(['config', 'user.email', 'test@test'], clone);
  git(['config', 'user.name', 'test'], clone);
  return { remote, clone };
}

test('git runs a command and returns stdout', () => {
  const dir = tmpDir();
  git(['init', '-b', 'main'], dir);
  expect(git(['symbolic-ref', '--short', 'HEAD'], dir)).toBe('main');
});

test('git throws with stderr on failure', () => {
  expect(() => git(['rev-parse', 'HEAD'], tmpDir())).toThrow(/not a git repository/i);
});

test('commitAll commits everything and returns false on a clean tree', () => {
  const { clone } = makeRemoteAndClone();
  fs.writeFileSync(path.join(clone, 'a.txt'), 'hello');

  expect(commitAll(clone, 'first')).toBe(true);
  expect(git(['log', '--format=%s'], clone)).toBe('first');
  expect(commitAll(clone, 'noop')).toBe(false);
});

test('aheadBehind is zero when no upstream is configured', () => {
  const dir = tmpDir();
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@test'], dir);
  git(['config', 'user.name', 'test'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  commitAll(dir, 'c1');

  expect(aheadBehind(dir)).toEqual({ ahead: 0, behind: 0 });
});

test('aheadBehind reports divergence from origin', () => {
  const { remote, clone: a } = makeRemoteAndClone();
  fs.writeFileSync(path.join(a, 'a.txt'), '1');
  commitAll(a, 'c1');
  git(['push', '-u', 'origin', 'main'], a);

  const b = path.join(tmpDir(), 'b');
  git(['clone', remote, b], tmpDir());
  git(['config', 'user.email', 'test@test'], b);
  git(['config', 'user.name', 'test'], b);
  expect(aheadBehind(b)).toEqual({ ahead: 0, behind: 0 });

  fs.writeFileSync(path.join(a, 'a.txt'), '2');
  commitAll(a, 'c2');
  git(['push'], a);
  fs.writeFileSync(path.join(b, 'b.txt'), 'x');
  commitAll(b, 'c3');
  git(['fetch'], b);

  expect(aheadBehind(b)).toEqual({ ahead: 1, behind: 1 });
});
