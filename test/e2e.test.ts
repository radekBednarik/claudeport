import { afterAll, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { init } from '../src/commands/init.js';
import { push } from '../src/commands/push.js';
import { pull } from '../src/commands/pull.js';
import { status } from '../src/commands/status.js';
import { diff } from '../src/commands/diff.js';

// Two fake machines (A = workstation, B = notebook) sharing a local bare repo.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claudesync-e2e-'));
const remote = path.join(root, 'remote.git');
execFileSync('git', ['init', '--bare', '-b', 'main', remote]);

const A = { claude: path.join(root, 'a/.claude'), sync: path.join(root, 'a/.claude-sync') };
const B = { claude: path.join(root, 'b/.claude'), sync: path.join(root, 'b/.claude-sync') };
fs.mkdirSync(A.claude, { recursive: true });
fs.mkdirSync(B.claude, { recursive: true });

Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@test',
});

function on(machine: { claude: string; sync: string }): void {
  process.env.CLAUDE_CONFIG_DIR = machine.claude;
  process.env.CLAUDESYNC_DIR = machine.sync;
}

function write(base: string, rel: string, content: string): void {
  const abs = path.join(base, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function read(base: string, rel: string): string {
  return fs.readFileSync(path.join(base, rel), 'utf8');
}

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('init on machine A seeds an empty remote, never leaking secrets', async () => {
  write(A.claude, 'settings.json', '{"model":"opus"}');
  write(A.claude, 'skills/foo/SKILL.md', 'foo skill');
  write(A.claude, '.credentials.json', 'SECRET');
  write(A.claude, 'history.jsonl', 'machine-local');

  on(A);
  await init(remote);

  expect(fs.existsSync(path.join(A.sync, 'claude-sync.json'))).toBe(true);
  expect(read(A.sync, 'settings.json')).toBe('{"model":"opus"}');
  expect(read(A.sync, 'skills/foo/SKILL.md')).toBe('foo skill');
  expect(fs.existsSync(path.join(A.sync, '.credentials.json'))).toBe(false);
  expect(fs.existsSync(path.join(A.sync, 'history.jsonl'))).toBe(false);
  // and it was pushed to the remote
  const remoteFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', 'main'], {
    cwd: remote,
    encoding: 'utf8',
  });
  expect(remoteFiles).toContain('settings.json');
  expect(remoteFiles).not.toContain('.credentials.json');
});

test('init on machine B adopts the config', async () => {
  on(B);
  await init(remote, { yes: true });

  expect(read(B.claude, 'settings.json')).toBe('{"model":"opus"}');
  expect(read(B.claude, 'skills/foo/SKILL.md')).toBe('foo skill');
});

test('push from B, pull on A round-trips changes including deletions', async () => {
  write(B.claude, 'settings.json', '{"model":"sonnet"}');
  write(B.claude, 'skills/bar/SKILL.md', 'bar skill');
  fs.rmSync(path.join(B.claude, 'skills/foo'), { recursive: true });

  on(B);
  await push({});

  on(A);
  const result = await pull({ yes: true });

  expect(read(A.claude, 'settings.json')).toBe('{"model":"sonnet"}');
  expect(read(A.claude, 'skills/bar/SKILL.md')).toBe('bar skill');
  expect(fs.existsSync(path.join(A.claude, 'skills/foo/SKILL.md'))).toBe(false);
  // overwritten files were backed up
  expect(result.backupDir).toBeTruthy();
  expect(read(A.claude, path.relative(A.claude, path.join(result.backupDir!, 'settings.json')))).toBe(
    '{"model":"opus"}',
  );
  // machine-local files untouched
  expect(read(A.claude, 'history.jsonl')).toBe('machine-local');
});

test('status and diff report local drift', async () => {
  write(A.claude, 'settings.json', '{"model":"opus-again"}');

  on(A);
  const s = await status();
  expect(s.diff.changed).toEqual(['settings.json']);
  expect(s.behind).toBe(0);

  const d = await diff();
  expect(d).toContain('settings.json');
  expect(d).toContain('opus-again');
});

test('push refuses when behind the remote', async () => {
  on(A);
  await push({}); // A pushes its drift

  on(B);
  write(B.claude, 'settings.json', '{"model":"haiku"}');
  await expect(push({})).rejects.toThrow(/behind/i);
});

test('pull without --yes refuses when not interactive', async () => {
  on(B);
  await expect(pull({})).rejects.toThrow(/--yes|confirmation/i);
});
