import { afterEach, beforeEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeDir, syncDir } from '../src/lib/paths.js';
import { writeConfig } from '../src/lib/config.js';

const saved = { ...process.env };
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claudesync-paths-'));
  // Point the config file at an isolated, initially-empty dir.
  process.env.XDG_CONFIG_HOME = tmp;
  process.env.APPDATA = tmp;
});

afterEach(() => {
  process.env = { ...saved };
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('claudeDir defaults to ~/.claude', () => {
  delete process.env.CLAUDE_CONFIG_DIR;
  expect(claudeDir()).toBe(path.join(os.homedir(), '.claude'));
});

test('claudeDir respects CLAUDE_CONFIG_DIR', () => {
  process.env.CLAUDE_CONFIG_DIR = '/tmp/fake-claude';
  expect(claudeDir()).toBe('/tmp/fake-claude');
});

test('syncDir defaults to ~/.claude-sync', () => {
  delete process.env.CLAUDESYNC_DIR;
  expect(syncDir()).toBe(path.join(os.homedir(), '.claude-sync'));
});

test('syncDir respects CLAUDESYNC_DIR', () => {
  process.env.CLAUDESYNC_DIR = '/tmp/fake-sync';
  expect(syncDir()).toBe('/tmp/fake-sync');
});

test('claudeDir uses the config file when the env var is unset', () => {
  delete process.env.CLAUDE_CONFIG_DIR;
  writeConfig({ claudeDir: '/from/config' });
  expect(claudeDir()).toBe('/from/config');
});

test('syncDir uses the config file when the env var is unset', () => {
  delete process.env.CLAUDESYNC_DIR;
  writeConfig({ syncDir: '/from/config-sync' });
  expect(syncDir()).toBe('/from/config-sync');
});

test('env var overrides the config file', () => {
  process.env.CLAUDE_CONFIG_DIR = '/from/env';
  writeConfig({ claudeDir: '/from/config' });
  expect(claudeDir()).toBe('/from/env');
});
