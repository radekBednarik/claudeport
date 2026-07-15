import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { backupFiles, diffFiles, syncFiles } from '../src/lib/files.js';
import type { Manifest } from '../src/lib/manifest.js';

const manifest: Manifest = { version: 1, paths: ['settings.json', 'skills/'] };

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudeport-test-'));
}

function seed(dir: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

test('diffFiles reports added, changed and removed files', () => {
  const src = tmpDir();
  const dest = tmpDir();
  seed(src, { 'settings.json': '{"a":1}', 'skills/new/SKILL.md': 'new' });
  seed(dest, { 'settings.json': '{"a":2}', 'skills/old/SKILL.md': 'old' });

  expect(diffFiles(src, dest, manifest)).toEqual({
    added: ['skills/new/SKILL.md'],
    changed: ['settings.json'],
    removed: ['skills/old/SKILL.md'],
  });
});

test('diffFiles reports nothing for identical trees', () => {
  const src = tmpDir();
  const dest = tmpDir();
  seed(src, { 'settings.json': '{}' });
  seed(dest, { 'settings.json': '{}' });

  expect(diffFiles(src, dest, manifest)).toEqual({
    added: [],
    changed: [],
    removed: [],
  });
});

test('syncFiles makes dest match src, including deletions', () => {
  const src = tmpDir();
  const dest = tmpDir();
  seed(src, { 'settings.json': '{"a":1}', 'skills/new/SKILL.md': 'new' });
  seed(dest, { 'settings.json': '{"a":2}', 'skills/old/SKILL.md': 'old' });

  const result = syncFiles(src, dest, manifest);

  expect(result).toEqual({
    copied: ['settings.json', 'skills/new/SKILL.md'],
    deleted: ['skills/old/SKILL.md'],
  });
  expect(fs.readFileSync(path.join(dest, 'settings.json'), 'utf8')).toBe('{"a":1}');
  expect(fs.readFileSync(path.join(dest, 'skills/new/SKILL.md'), 'utf8')).toBe('new');
  expect(fs.existsSync(path.join(dest, 'skills/old/SKILL.md'))).toBe(false);
});

test('syncFiles never writes denied files into dest', () => {
  const src = tmpDir();
  const dest = tmpDir();
  seed(src, { '.credentials.json': 'secret', 'settings.json': '{}' });

  syncFiles(src, dest, {
    version: 1,
    paths: ['settings.json', '.credentials.json'],
  });

  expect(fs.existsSync(path.join(dest, '.credentials.json'))).toBe(false);
});

test('backupFiles copies files into a timestamped dir and returns its path', () => {
  const base = tmpDir();
  const backupRoot = tmpDir();
  seed(base, { 'settings.json': '{"a":1}', 'skills/s/SKILL.md': 'x' });

  const backupDir = backupFiles(base, ['settings.json', 'skills/s/SKILL.md'], backupRoot);

  expect(backupDir.startsWith(backupRoot)).toBe(true);
  expect(fs.readFileSync(path.join(backupDir, 'settings.json'), 'utf8')).toBe('{"a":1}');
  expect(fs.readFileSync(path.join(backupDir, 'skills/s/SKILL.md'), 'utf8')).toBe('x');
});
