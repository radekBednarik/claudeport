import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { syncFiles } from '../src/lib/files.js';
import { isDenied, resolveFiles } from '../src/lib/manifest.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudeport-sec-'));
}

function seed(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

// A malicious repo controls the manifest — every entry must be treated as hostile.

test('resolveFiles ignores ../ traversal entries', () => {
  const parent = tmpDir();
  const base = path.join(parent, 'claude');
  fs.mkdirSync(base);
  seed(parent, { 'outside.txt': 'secret' });
  seed(base, { 'settings.json': '{}' });

  const files = resolveFiles(base, {
    version: 1,
    paths: ['settings.json', '../outside.txt', 'skills/../../outside.txt'],
  });

  expect(files).toEqual(['settings.json']);
});

test('resolveFiles ignores absolute path entries', () => {
  const base = tmpDir();
  seed(base, { 'settings.json': '{}' });
  fs.writeFileSync('/tmp/claudeport-sec-absolute.txt', 'x');

  const files = resolveFiles(base, {
    version: 1,
    paths: ['settings.json', '/tmp/claudeport-sec-absolute.txt', '/etc/hostname'],
  });

  expect(files).toEqual(['settings.json']);
});

test('denylist cannot be bypassed with ./ prefixes or redundant separators', () => {
  expect(isDenied('./sessions/x.jsonl')).toBe(true);
  expect(isDenied('sessions//x.jsonl')).toBe(true);
  expect(isDenied('skills/../projects/x.jsonl')).toBe(true);
  expect(isDenied('./.credentials.json')).toBe(true);
});

test('resolveFiles applies the denylist to ./-prefixed entries', () => {
  const base = tmpDir();
  seed(base, { 'sessions/chat.jsonl': 'private', 'settings.json': '{}' });

  const files = resolveFiles(base, {
    version: 1,
    paths: ['settings.json', './sessions/chat.jsonl'],
  });

  expect(files).toEqual(['settings.json']);
});

test('plugin cache never syncs, even when named directly', () => {
  expect(isDenied('plugins/cache/some-plugin/index.js')).toBe(true);
  expect(isDenied('plugins/installed_plugins.json')).toBe(false);
});

test('resolveFiles does not follow symlinked directories or files', () => {
  const base = tmpDir();
  const target = tmpDir();
  seed(target, { 'private/id_rsa.txt': 'SECRET' });
  seed(base, { 'settings.json': '{}' });
  fs.symlinkSync(path.join(target, 'private'), path.join(base, 'skills'));
  fs.symlinkSync(path.join(target, 'private/id_rsa.txt'), path.join(base, 'CLAUDE.md'));

  const files = resolveFiles(base, {
    version: 1,
    paths: ['settings.json', 'skills/', 'CLAUDE.md'],
  });

  expect(files).toEqual(['settings.json']);
});

test('symlinks nested inside a synced directory are skipped', () => {
  const base = tmpDir();
  const target = tmpDir();
  seed(target, { 'secret.txt': 'SECRET' });
  seed(base, { 'skills/real/SKILL.md': 'ok' });
  fs.symlinkSync(path.join(target, 'secret.txt'), path.join(base, 'skills/link.md'));

  const files = resolveFiles(base, { version: 1, paths: ['skills/'] });

  expect(files).toEqual(['skills/real/SKILL.md']);
});

test('syncFiles with a hostile manifest never writes outside the destination', () => {
  const srcParent = tmpDir();
  const destParent = tmpDir();
  const src = path.join(srcParent, 'repo');
  const dest = path.join(destParent, 'claude');
  fs.mkdirSync(src);
  fs.mkdirSync(dest);
  seed(srcParent, { 'evil.txt': 'pwned' });
  seed(src, { 'settings.json': '{}' });

  syncFiles(src, dest, {
    version: 1,
    paths: ['settings.json', '../evil.txt', '/etc/hostname'],
  });

  expect(fs.existsSync(path.join(destParent, 'evil.txt'))).toBe(false);
  expect(fs.readFileSync(path.join(dest, 'settings.json'), 'utf8')).toBe('{}');
});

test('syncFiles never writes through a pre-existing symlink in the destination', () => {
  const src = tmpDir();
  const dest = tmpDir();
  const outside = path.join(tmpDir(), 'bashrc');
  fs.writeFileSync(outside, 'ORIGINAL');
  seed(src, { 'settings.json': 'PWNED' });
  // dest/settings.json is a symlink pointing outside dest, as a pre-planted attack.
  fs.symlinkSync(outside, path.join(dest, 'settings.json'));

  expect(() => syncFiles(src, dest, { version: 1, paths: ['settings.json'] })).toThrow(/symlink/);
  expect(fs.readFileSync(outside, 'utf8')).toBe('ORIGINAL');
});

test('syncFiles never writes through a symlinked parent directory', () => {
  const src = tmpDir();
  const dest = tmpDir();
  const outside = tmpDir();
  seed(src, { 'skills/evil.md': 'PWNED' });
  // dest/skills is a symlink to a directory outside dest.
  fs.symlinkSync(outside, path.join(dest, 'skills'));

  expect(() => syncFiles(src, dest, { version: 1, paths: ['skills/'] })).toThrow(/symlink/);
  expect(fs.existsSync(path.join(outside, 'evil.md'))).toBe(false);
});
