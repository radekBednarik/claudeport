import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { configFilePath, readConfig, writeConfig } from '../src/lib/config.js';

const savedEnv = { ...process.env };
const savedPlatform = process.platform;
let tmp: string;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claudeport-cfg-'));
});

afterEach(() => {
  process.env = { ...savedEnv };
  setPlatform(savedPlatform);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('configFilePath honors XDG_CONFIG_HOME on non-Windows', () => {
  setPlatform('linux');
  process.env.XDG_CONFIG_HOME = tmp;
  expect(configFilePath()).toBe(path.join(tmp, 'claudeport', 'config.json'));
});

test('configFilePath falls back to ~/.config on non-Windows', () => {
  setPlatform('darwin');
  delete process.env.XDG_CONFIG_HOME;
  expect(configFilePath()).toBe(path.join(os.homedir(), '.config', 'claudeport', 'config.json'));
});

test('configFilePath honors APPDATA on Windows', () => {
  setPlatform('win32');
  process.env.APPDATA = tmp;
  expect(configFilePath()).toBe(path.join(tmp, 'claudeport', 'config.json'));
});

test('readConfig returns {} when the file is absent', () => {
  process.env.XDG_CONFIG_HOME = tmp;
  expect(readConfig()).toEqual({});
});

test('readConfig throws on malformed JSON', () => {
  process.env.XDG_CONFIG_HOME = tmp;
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ not json');
  expect(() => readConfig()).toThrow();
});

test('readConfig throws when the file is not an object', () => {
  process.env.XDG_CONFIG_HOME = tmp;
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '"a string"');
  expect(() => readConfig()).toThrow();
});

test('writeConfig then readConfig round-trips', () => {
  process.env.XDG_CONFIG_HOME = tmp;
  writeConfig({ claudeDir: '/a', syncDir: '/b' });
  expect(readConfig()).toEqual({ claudeDir: '/a', syncDir: '/b' });
});

test('writeConfig creates the parent directory', () => {
  process.env.XDG_CONFIG_HOME = path.join(tmp, 'nested', 'deep');
  writeConfig({ claudeDir: '/a' });
  expect(fs.existsSync(configFilePath())).toBe(true);
});

test('writeConfig preserves unknown keys on disk', () => {
  process.env.XDG_CONFIG_HOME = tmp;
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ future: 'keep me', claudeDir: '/old' }));
  const cfg = readConfig();
  writeConfig({ ...cfg, claudeDir: '/new' });
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({
    future: 'keep me',
    claudeDir: '/new',
  });
});
