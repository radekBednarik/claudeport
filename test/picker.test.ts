import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import {
  type DiscoveredEntry,
  listFolderFiles,
  listTopLevelEntries,
  type Manifest,
} from '../src/lib/manifest.js';
import {
  buildInitialState,
  type KeyEvent,
  type PickerModel,
  reduce,
  stateToPaths,
} from '../src/lib/picker.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudeport-test-'));
}

function press(model: PickerModel, ...keys: KeyEvent[]): PickerModel {
  return keys.reduce((m, k) => reduce(m, k), model);
}

const DOWN: KeyEvent = { name: 'down' };
const SPACE: KeyEvent = { name: 'space' };
const ENTER: KeyEvent = { name: 'return' };
const ESC: KeyEvent = { name: 'escape' };

const DISCOVERED: DiscoveredEntry[] = [
  { name: 'CLAUDE.md', type: 'file' },
  { name: 'agents', type: 'dir' },
  { name: 'plugins', type: 'dir' },
  { name: 'settings.json', type: 'file' },
  { name: 'skills', type: 'dir' },
];

const FOLDER_FILES: Record<string, string[]> = {
  agents: ['a.md'],
  plugins: ['installed_plugins.json', 'known_marketplaces.json'],
  skills: ['ponytail/SKILL.md'],
};

// ── buildInitialState ───────────────────────────────────────────────────────

test('buildInitialState maps whole folders, top-level files, and nested children', () => {
  const manifest: Manifest = {
    version: 1,
    paths: ['settings.json', 'skills/', 'plugins/installed_plugins.json'],
  };
  const model = buildInitialState(manifest, DISCOVERED, FOLDER_FILES);
  const byName = Object.fromEntries(model.entries.map((e) => [e.name, e]));

  expect(byName['settings.json'].state).toBe('whole'); // file selected
  expect(byName['CLAUDE.md'].state).toBe('off'); // discovered but not in manifest
  expect(byName.skills.state).toBe('whole'); // whole folder
  expect(byName.agents.state).toBe('off');
  expect(byName.plugins.state).toBe('partial');
  const checked = byName.plugins.children.filter((c) => c.checked).map((c) => c.relPath);
  expect(checked).toEqual(['installed_plugins.json']);
  // both on-disk files are offered even though only one is checked
  expect(byName.plugins.children.map((c) => c.relPath)).toEqual([
    'installed_plugins.json',
    'known_marketplaces.json',
  ]);
});

test('buildInitialState keeps manifest entries that are missing on disk', () => {
  const manifest: Manifest = { version: 1, paths: ['gone/', 'orphan.json'] };
  const model = buildInitialState(manifest, DISCOVERED, FOLDER_FILES);
  const byName = Object.fromEntries(model.entries.map((e) => [e.name, e]));
  expect(byName.gone.type).toBe('dir');
  expect(byName.gone.state).toBe('whole');
  expect(byName['orphan.json'].type).toBe('file');
  expect(byName['orphan.json'].state).toBe('whole');
});

// ── stateToPaths + round-trip ────────────────────────────────────────────────

test('round-trip: open and save unchanged preserves the manifest set', () => {
  const manifest: Manifest = {
    version: 1,
    paths: [
      'settings.json',
      'skills/',
      'agents/',
      'CLAUDE.md',
      'plugins/installed_plugins.json',
      'plugins/known_marketplaces.json',
    ],
  };
  const out = stateToPaths(buildInitialState(manifest, DISCOVERED, FOLDER_FILES));
  expect(new Set(out)).toEqual(new Set(manifest.paths));
  expect(out.length).toBe(manifest.paths.length);
});

test('stateToPaths emits denylist-safe, sorted, deduped paths', () => {
  const manifest: Manifest = { version: 1, paths: ['skills/'] };
  const out = stateToPaths(buildInitialState(manifest, DISCOVERED, FOLDER_FILES));
  expect(out).toEqual(['skills/']);
});

// ── reduce: navigation and toggles ───────────────────────────────────────────

test('space toggles a top-level file on and off', () => {
  const model = buildInitialState({ version: 1, paths: [] }, DISCOVERED, FOLDER_FILES);
  // cursor starts on CLAUDE.md (sorted first)
  const on = press(model, SPACE);
  expect(on.entries[0].state).toBe('whole');
  expect(stateToPaths(on)).toContain('CLAUDE.md');
  const off = press(on, SPACE);
  expect(off.entries[0].state).toBe('off');
});

test('selecting a folder → whole folder', () => {
  const model = buildInitialState({ version: 1, paths: [] }, DISCOVERED, FOLDER_FILES);
  // move to `agents` (index 1), open choice, pick "Whole folder" (subCursor 0)
  const after = press(model, DOWN, SPACE, ENTER);
  const agents = after.entries.find((e) => e.name === 'agents');
  expect(after.view).toBe('top');
  expect(agents?.state).toBe('whole');
  expect(stateToPaths(after)).toContain('agents/');
});

test('selecting a folder → pick specific files', () => {
  const model = buildInitialState({ version: 1, paths: [] }, DISCOVERED, FOLDER_FILES);
  // to `plugins` (index 2): DOWN DOWN, SPACE (open), DOWN (choose "specific"), ENTER,
  // then in sublist SPACE (check first file), ENTER (commit)
  const after = press(model, DOWN, DOWN, SPACE, DOWN, ENTER, SPACE, ENTER);
  const plugins = after.entries.find((e) => e.name === 'plugins');
  expect(after.view).toBe('top');
  expect(plugins?.state).toBe('partial');
  expect(stateToPaths(after)).toEqual(['plugins/installed_plugins.json']);
});

test('esc from the file sublist cancels that folder without losing other picks', () => {
  const model = buildInitialState({ version: 1, paths: [] }, DISCOVERED, FOLDER_FILES);
  // select skills whole first (index 4): DOWN*4, SPACE, ENTER
  const withSkills = press(model, DOWN, DOWN, DOWN, DOWN, SPACE, ENTER);
  expect(withSkills.entries.find((e) => e.name === 'skills')?.state).toBe('whole');
  // now go to plugins (index 2), open sublist, check a file, then ESC to cancel
  const back = press({ ...withSkills, cursor: 0 }, DOWN, DOWN, SPACE, DOWN, ENTER, SPACE, ESC);
  expect(back.view).toBe('top');
  expect(back.entries.find((e) => e.name === 'plugins')?.state).toBe('off'); // cancelled
  expect(back.entries.find((e) => e.name === 'skills')?.state).toBe('whole'); // survived
});

test('multi-folder round-trip: folder A specific + folder B whole both saved', () => {
  const model = buildInitialState({ version: 1, paths: [] }, DISCOVERED, FOLDER_FILES);
  // plugins (index 2) specific: check known_marketplaces.json (2nd file)
  let m = press(model, DOWN, DOWN, SPACE, DOWN, ENTER, DOWN, SPACE, ENTER);
  // agents (index 1) whole
  m = press({ ...m, cursor: 0 }, DOWN, SPACE, ENTER);
  expect(new Set(stateToPaths(m))).toEqual(new Set(['plugins/known_marketplaces.json', 'agents/']));
});

test('enter on the top list saves; esc cancels', () => {
  const model = buildInitialState({ version: 1, paths: [] }, DISCOVERED, FOLDER_FILES);
  expect(press(model, ENTER).done).toBe('save');
  expect(press(model, ESC).done).toBe('cancel');
});

test('toggling a selected folder off clears it', () => {
  const manifest: Manifest = { version: 1, paths: ['skills/'] };
  const model = buildInitialState(manifest, DISCOVERED, FOLDER_FILES);
  const skillsIdx = model.entries.findIndex((e) => e.name === 'skills');
  const after = press({ ...model, cursor: skillsIdx }, SPACE);
  expect(after.entries[skillsIdx].state).toBe('off');
  expect(stateToPaths(after)).toEqual([]);
});

// ── fixes: denied names, nested-subfolder expansion, empty list ───────────────

test('denied manifest entries never surface as picker rows', () => {
  const manifest: Manifest = {
    version: 1,
    paths: ['settings.json', 'projects/', 'history.jsonl'],
  };
  const model = buildInitialState(manifest, DISCOVERED, FOLDER_FILES);
  const names = model.entries.map((e) => e.name);
  expect(names).not.toContain('projects');
  expect(names).not.toContain('history.jsonl');
  expect(model.entries.find((e) => e.name === 'settings.json')?.state).toBe('whole');
});

test('a denied nested manifest child is dropped, not shown checked', () => {
  const discovered: DiscoveredEntry[] = [{ name: 'plugins', type: 'dir' }];
  const ff = { plugins: ['installed_plugins.json'] };
  const model = buildInitialState({ version: 1, paths: ['plugins/cache/blob'] }, discovered, ff);
  const plugins = model.entries.find((e) => e.name === 'plugins');
  expect(plugins?.state).toBe('off');
  expect(plugins?.children.map((c) => c.relPath)).toEqual(['installed_plugins.json']);
  expect(stateToPaths(model)).toEqual([]);
});

test('a nested whole-subfolder entry expands to its files with no duplicate row', () => {
  const discovered: DiscoveredEntry[] = [{ name: 'plugins', type: 'dir' }];
  const ff = { plugins: ['installed_plugins.json', 'sub/deep/x.json', 'sub/thing.json'] };
  const model = buildInitialState({ version: 1, paths: ['plugins/sub/'] }, discovered, ff);
  const plugins = model.entries.find((e) => e.name === 'plugins');
  expect(plugins?.state).toBe('partial');
  // no bare `sub` row — only the files under it
  expect(plugins?.children.map((c) => c.relPath)).toEqual([
    'installed_plugins.json',
    'sub/deep/x.json',
    'sub/thing.json',
  ]);
  const checked = plugins?.children.filter((c) => c.checked).map((c) => c.relPath);
  expect(checked).toEqual(['sub/deep/x.json', 'sub/thing.json']);
  expect(stateToPaths(model)).toEqual(['plugins/sub/deep/x.json', 'plugins/sub/thing.json']);
});

test('a nested manifest child missing on disk is preserved and stays checked', () => {
  const discovered: DiscoveredEntry[] = [{ name: 'plugins', type: 'dir' }];
  const ff = { plugins: ['installed_plugins.json'] };
  const model = buildInitialState({ version: 1, paths: ['plugins/ghost.json'] }, discovered, ff);
  const plugins = model.entries.find((e) => e.name === 'plugins');
  expect(plugins?.state).toBe('partial');
  expect(plugins?.children.map((c) => c.relPath)).toEqual(['ghost.json', 'installed_plugins.json']);
  expect(plugins?.children.find((c) => c.relPath === 'ghost.json')?.checked).toBe(true);
  expect(stateToPaths(model)).toEqual(['plugins/ghost.json']);
});

test('down on an empty list keeps the cursor at 0, save yields no paths', () => {
  const model = buildInitialState({ version: 1, paths: [] }, [], {});
  expect(model.entries).toEqual([]);
  const after = press(model, DOWN, DOWN);
  expect(after.cursor).toBe(0);
  expect(stateToPaths(press(after, ENTER))).toEqual([]);
});

// ── discovery helpers ─────────────────────────────────────────────────────────

test('listTopLevelEntries returns dirs and files, minus denylist and symlinks', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'settings.json'), '{}');
  fs.writeFileSync(path.join(dir, 'history.jsonl'), 'x'); // denied file
  fs.mkdirSync(path.join(dir, 'skills'));
  fs.mkdirSync(path.join(dir, 'projects')); // denied dir
  fs.symlinkSync(path.join(dir, 'settings.json'), path.join(dir, 'link.json'));

  const entries = listTopLevelEntries(dir);
  const names = entries.map((e) => e.name);
  expect(names).toEqual(['settings.json', 'skills']);
  expect(entries.find((e) => e.name === 'skills')?.type).toBe('dir');
  expect(entries.find((e) => e.name === 'settings.json')?.type).toBe('file');
});

test('listFolderFiles flattens a folder and applies the denylist', () => {
  const dir = tmpDir();
  fs.mkdirSync(path.join(dir, 'plugins/cache'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugins/installed_plugins.json'), '{}');
  fs.writeFileSync(path.join(dir, 'plugins/cache/blob'), 'x'); // denied
  fs.mkdirSync(path.join(dir, 'plugins/sub'));
  fs.writeFileSync(path.join(dir, 'plugins/sub/thing.json'), '{}');

  expect(listFolderFiles(dir, 'plugins')).toEqual(['installed_plugins.json', 'sub/thing.json']);
});

test('listFolderFiles returns [] for a missing folder', () => {
  expect(listFolderFiles(tmpDir(), 'nope')).toEqual([]);
});
