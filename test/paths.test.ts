import { afterEach, expect, test } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { claudeDir, syncDir } from '../src/lib/paths.js';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
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
