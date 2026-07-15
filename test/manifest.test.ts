import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { DEFAULT_MANIFEST, isDenied, loadManifest, resolveFiles } from '../src/lib/manifest.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudeport-test-'));
}

test('default manifest covers the v1 sync surface', () => {
  expect(DEFAULT_MANIFEST.version).toBe(1);
  expect(DEFAULT_MANIFEST.paths).toContain('settings.json');
  expect(DEFAULT_MANIFEST.paths).toContain('skills/');
  expect(DEFAULT_MANIFEST.paths).toContain('agents/');
  expect(DEFAULT_MANIFEST.paths).toContain('CLAUDE.md');
});

test('denylist blocks credentials and machine-local paths', () => {
  expect(isDenied('.credentials.json')).toBe(true);
  expect(isDenied('foo/my-credentials.json')).toBe(true);
  expect(isDenied('certs/server.pem')).toBe(true);
  expect(isDenied('certs/id.key')).toBe(true);
  expect(isDenied('history.jsonl')).toBe(true);
  expect(isDenied('projects/x/session.jsonl')).toBe(true);
  expect(isDenied('sessions/abc')).toBe(true);
  expect(isDenied('backups/old')).toBe(true);
  expect(isDenied('settings.json')).toBe(false);
  expect(isDenied('skills/ponytail/SKILL.md')).toBe(false);
});

test('loadManifest reads a valid manifest', () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, 'claudeport.json'),
    JSON.stringify({ version: 1, paths: ['settings.json'] }),
  );
  expect(loadManifest(dir)).toEqual({ version: 1, paths: ['settings.json'] });
});

test('loadManifest rejects unsupported future versions', () => {
  const dir = tmpDir();
  fs.writeFileSync(
    path.join(dir, 'claudeport.json'),
    JSON.stringify({ version: 2, paths: ['settings.json'] }),
  );
  expect(() => loadManifest(dir)).toThrow(/version/i);
});

test('loadManifest rejects garbage', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'claudeport.json'), '{"paths": "nope"}');
  expect(() => loadManifest(dir)).toThrow(/manifest/i);
});

test('resolveFiles expands directories, skips missing paths, applies denylist', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{}');
  fs.mkdirSync(path.join(dir, 'skills/ponytail'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'skills/ponytail/SKILL.md'), 'x');
  fs.writeFileSync(path.join(dir, 'skills/ponytail/extra.key'), 'secret');
  fs.writeFileSync(path.join(dir, '.credentials.json'), 'secret');

  const files = resolveFiles(dir, {
    version: 1,
    // .credentials.json allowlisted on purpose: denylist must still win
    paths: ['settings.json', 'skills/', 'agents/', '.credentials.json'],
  });

  expect(files).toEqual(['settings.json', 'skills/ponytail/SKILL.md']);
});
