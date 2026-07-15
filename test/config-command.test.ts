import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configGet, configSet, configUnset } from '../src/commands/config.js';
import { configFilePath, readConfig } from '../src/lib/config.js';

const savedEnv = { ...process.env };
let tmp: string;
let logs: string[];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claudesync-cmd-'));
  process.env.XDG_CONFIG_HOME = tmp;
  process.env.APPDATA = tmp;
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...savedEnv };
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('set stores a resolved absolute path', () => {
  configSet('claude-dir', '/abs/claude');
  expect(readConfig().claudeDir).toBe('/abs/claude');
  expect(fs.existsSync(configFilePath())).toBe(true);
});

test('set expands a leading ~', () => {
  configSet('sync-dir', '~/mysync');
  expect(readConfig().syncDir).toBe(path.join(os.homedir(), 'mysync'));
});

test('set resolves a relative path against cwd', () => {
  configSet('claude-dir', 'rel/dir');
  expect(readConfig().claudeDir).toBe(path.resolve('rel/dir'));
});

test('set rejects an unknown key', () => {
  expect(() => configSet('bogus', '/x')).toThrow(/Unknown config key/);
});

test('get prints a single key value', () => {
  configSet('claude-dir', '/abs/claude');
  logs.length = 0;
  configGet('claude-dir');
  expect(logs.join('\n')).toContain('/abs/claude');
});

test('get without a key lists all keys', () => {
  configSet('claude-dir', '/abs/claude');
  logs.length = 0;
  configGet();
  const out = logs.join('\n');
  expect(out).toContain('claude-dir = /abs/claude');
  expect(out).toContain('sync-dir');
});

test('unset removes a key', () => {
  configSet('claude-dir', '/abs/claude');
  configUnset('claude-dir');
  expect(readConfig().claudeDir).toBeUndefined();
});

test('set then unset leaves other keys intact', () => {
  configSet('claude-dir', '/abs/claude');
  configSet('sync-dir', '/abs/sync');
  configUnset('claude-dir');
  expect(readConfig()).toEqual({ syncDir: '/abs/sync' });
});
