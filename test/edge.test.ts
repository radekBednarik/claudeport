import { afterAll, afterEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { init } from '../src/commands/init.js';
import { push } from '../src/commands/push.js';
import { pull } from '../src/commands/pull.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claudesync-edge-'));
let n = 0;

Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@test',
});

function fixture(): { remote: string; claude: string; sync: string } {
  const dir = path.join(root, String(n++));
  const remote = path.join(dir, 'remote.git');
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '--bare', '-b', 'main', remote]);
  const claude = path.join(dir, '.claude');
  fs.mkdirSync(claude);
  fs.writeFileSync(path.join(claude, 'settings.json'), '{}');
  return { remote, claude, sync: path.join(dir, '.claude-sync') };
}

function on(m: { claude: string; sync: string }): void {
  process.env.CLAUDE_CONFIG_DIR = m.claude;
  process.env.CLAUDESYNC_DIR = m.sync;
}

afterEach(() => vi.restoreAllMocks());
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

test('failed init cleans up so it can be retried', async () => {
  const m = fixture();
  const hook = path.join(m.remote, 'hooks/pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });

  on(m);
  await expect(init(m.remote)).rejects.toThrow();
  expect(fs.existsSync(m.sync)).toBe(false);

  fs.rmSync(hook);
  await init(m.remote); // retry succeeds
  expect(fs.existsSync(path.join(m.sync, 'claude-sync.json'))).toBe(true);
});

test('pull explains what to do when the clone has diverged', async () => {
  const a = fixture();
  on(a);
  await init(a.remote);
  // second machine pushes a change
  const b = { claude: path.join(root, `${n}b/.claude`), sync: path.join(root, `${n}b/.claude-sync`) };
  fs.mkdirSync(b.claude, { recursive: true });
  on(b);
  await init(a.remote, { yes: true });
  fs.writeFileSync(path.join(b.claude, 'settings.json'), '{"model":"x"}');
  await push({});
  // meanwhile A's clone gains a local commit → diverged
  fs.writeFileSync(path.join(a.sync, 'stray.txt'), 'local commit');
  execFileSync('git', ['add', '-A'], { cwd: a.sync });
  execFileSync('git', ['commit', '-m', 'stray'], { cwd: a.sync });

  on(a);
  await expect(pull({ yes: true })).rejects.toThrow(/diverged/i);
});

test('pull hints about plugins when plugin selections change', async () => {
  const a = fixture();
  fs.mkdirSync(path.join(a.claude, 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(a.claude, 'plugins/installed_plugins.json'), '{"v":1}');
  on(a);
  await init(a.remote);

  const b = { claude: path.join(root, `${n}p/.claude`), sync: path.join(root, `${n}p/.claude-sync`) };
  fs.mkdirSync(b.claude, { recursive: true });
  on(b);
  const log = vi.spyOn(console, 'log');
  await init(a.remote, { yes: true });

  expect(log.mock.calls.flat().join('\n')).toMatch(/restart claude code/i);
});
