import readline from 'node:readline';
import pc from 'picocolors';
import { type DiscoveredEntry, isDenied, type Manifest, normalizeEntry } from './manifest.js';

// The picker is split into a pure core (buildInitialState / reduce / stateToPaths,
// all IO-free and unit-tested with synthetic keys) and a thin stdin/stdout loop
// (runPicker). We hand-roll raw-mode TTY handling to carry no prompt dependency.

export type EntryState = 'off' | 'whole' | 'partial';
export type View = 'top' | 'folder-choice' | 'file-sublist';

export interface PickerChild {
  relPath: string; // folder-relative POSIX path
  checked: boolean;
}

export interface PickerEntry {
  name: string;
  type: 'file' | 'dir';
  state: EntryState;
  children: PickerChild[]; // populated for dirs; empty for files
}

interface FolderBackup {
  state: EntryState;
  children: PickerChild[];
}

export interface PickerModel {
  entries: PickerEntry[];
  cursor: number; // index into entries (top view)
  view: View;
  activeFolder: number | null; // index into entries while in a sub-view
  subCursor: number; // cursor within folder-choice (0|1) or file-sublist
  backup: FolderBackup | null; // snapshot for cancelling a folder interaction
  done: 'save' | 'cancel' | null;
}

/** A single keypress, shaped like node readline's keypress event. */
export interface KeyEvent {
  name?: string;
  ctrl?: boolean;
}

type Classified =
  | { top: string; kind: 'whole' | 'file' }
  | { top: string; kind: 'child'; child: string };

function isChild(c: Classified): c is Extract<Classified, { kind: 'child' }> {
  return c.kind === 'child';
}

/** Split a raw manifest entry into how the picker represents it.
 *  - trailing slash & single segment → whole folder
 *  - single segment, no slash        → top-level file
 *  - contains a slash                → nested child of a top-level folder */
function classifyEntry(raw: string): Classified | null {
  const norm = normalizeEntry(raw);
  if (norm === null) return null;
  const posix = raw.replaceAll('\\', '/');
  const isFolder = posix.replace(/\/+$/, '') !== posix;
  const slash = norm.indexOf('/');
  if (slash === -1) return { top: norm, kind: isFolder ? 'whole' : 'file' };
  return { top: norm.slice(0, slash), kind: 'child', child: norm.slice(slash + 1) };
}

/** Build the initial picker model from the current manifest and what was
 *  discovered on disk. The candidate list is the union of discovered top-level
 *  entries and top-level names referenced by the manifest, so entries that are
 *  in the manifest but missing on disk still show and can be removed.
 *  `folderFiles` maps a top-level folder name to its folder-relative files. */
export function buildInitialState(
  manifest: Manifest,
  discovered: DiscoveredEntry[],
  folderFiles: Record<string, string[]> = {},
): PickerModel {
  const parsed = manifest.paths.map(classifyEntry).filter((p) => p !== null);

  const types = new Map<string, 'file' | 'dir'>();
  for (const d of discovered) types.set(d.name, d.type);
  // Infer a type for manifest-only names (missing on disk): a bare file entry is
  // a file; anything with children or a trailing slash is a folder.
  for (const p of parsed) {
    if (types.has(p.top)) continue;
    types.set(p.top, p.kind === 'file' ? 'file' : 'dir');
  }

  // Manifest entries are untrusted input; drop denied top-level names so the
  // picker never shows a row (e.g. `projects/`) that would be stripped on save.
  const names = [...new Set([...discovered.map((d) => d.name), ...parsed.map((p) => p.top)])]
    .filter((name) => !isDenied(name))
    .sort();

  const entries: PickerEntry[] = names.map((name) => {
    const type = types.get(name) ?? 'file';
    if (type === 'file') {
      const on = parsed.some((p) => p.top === name && p.kind === 'file');
      return { name, type, state: on ? 'whole' : 'off', children: [] };
    }
    // dir: children = on-disk files, plus manifest children resolved against them.
    const diskFiles = folderFiles[name] ?? [];
    const checked = new Set<string>();
    const extra = new Set<string>(); // manifest children with no on-disk file
    for (const child of parsed
      .filter((p) => p.top === name)
      .filter(isChild)
      .map((p) => p.child)) {
      if (isDenied(`${name}/${child}`)) continue;
      // A child that names a subfolder expands to the files under it, so we never
      // show both `sub` and `sub/thing.json`.
      const under = diskFiles.filter((f) => f === child || f.startsWith(`${child}/`));
      if (under.length > 0) for (const f of under) checked.add(f);
      else {
        extra.add(child); // missing on disk — keep it verbatim and selected
        checked.add(child);
      }
    }
    const whole = parsed.some((p) => p.top === name && p.kind === 'whole');
    const available = [...new Set([...diskFiles, ...extra])].sort();
    const children = available.map((relPath) => ({ relPath, checked: checked.has(relPath) }));
    const state: EntryState = whole ? 'whole' : children.some((c) => c.checked) ? 'partial' : 'off';
    return { name, type, state, children };
  });

  return {
    entries,
    cursor: 0,
    view: 'top',
    activeFolder: null,
    subCursor: 0,
    backup: null,
    done: null,
  };
}

function cloneChildren(children: PickerChild[]): PickerChild[] {
  return children.map((c) => ({ ...c }));
}

/** Pure state transition: (model, key) → next model. No IO. */
export function reduce(model: PickerModel, key: KeyEvent): PickerModel {
  const m: PickerModel = {
    ...model,
    entries: model.entries.map((e) => ({ ...e, children: cloneChildren(e.children) })),
  };
  const isUp = key.name === 'up' || key.name === 'k';
  const isDown = key.name === 'down' || key.name === 'j';

  if (m.view === 'top') {
    if (isUp) m.cursor = Math.max(0, m.cursor - 1);
    else if (isDown) m.cursor = Math.max(0, Math.min(m.entries.length - 1, m.cursor + 1));
    else if (key.name === 'return') m.done = 'save';
    else if (key.name === 'escape') m.done = 'cancel';
    else if (key.name === 'space') {
      const entry = m.entries[m.cursor];
      if (!entry) return m;
      if (entry.type === 'file') {
        entry.state = entry.state === 'off' ? 'whole' : 'off';
      } else if (entry.state === 'off') {
        m.view = 'folder-choice';
        m.activeFolder = m.cursor;
        m.subCursor = 0;
        m.backup = { state: entry.state, children: cloneChildren(entry.children) };
      } else {
        entry.state = 'off'; // clear a selected folder; child checks are retained
      }
    }
    return m;
  }

  const entry = m.activeFolder === null ? undefined : m.entries[m.activeFolder];
  if (!entry) {
    m.view = 'top';
    return m;
  }

  if (m.view === 'folder-choice') {
    if (isUp || isDown) m.subCursor = m.subCursor === 0 ? 1 : 0;
    else if (key.name === 'escape') restoreAndReturn(m, entry);
    else if (key.name === 'return') {
      if (m.subCursor === 0) {
        entry.state = 'whole';
        m.view = 'top';
        m.backup = null;
      } else {
        m.view = 'file-sublist';
        m.subCursor = 0;
      }
    }
    return m;
  }

  // file-sublist
  if (isUp) m.subCursor = Math.max(0, m.subCursor - 1);
  else if (isDown) m.subCursor = Math.min(entry.children.length - 1, m.subCursor + 1);
  else if (key.name === 'space') {
    const child = entry.children[m.subCursor];
    if (child) child.checked = !child.checked;
  } else if (key.name === 'escape') {
    restoreAndReturn(m, entry);
  } else if (key.name === 'return') {
    entry.state = entry.children.some((c) => c.checked) ? 'partial' : 'off';
    m.view = 'top';
    m.backup = null;
  }
  return m;
}

function restoreAndReturn(m: PickerModel, entry: PickerEntry): void {
  if (m.backup) {
    entry.state = m.backup.state;
    entry.children = m.backup.children;
  }
  m.view = 'top';
  m.backup = null;
}

/** Build the manifest `paths` array from the final selection state:
 *  whole folder → `name/`, file → `name`, partial → `name/<child>` per check.
 *  Normalized, deduped, denylist-filtered, sorted. */
export function stateToPaths(model: PickerModel): string[] {
  const out: string[] = [];
  for (const entry of model.entries) {
    if (entry.type === 'file') {
      if (entry.state !== 'off') out.push(entry.name);
    } else if (entry.state === 'whole') {
      out.push(`${entry.name}/`);
    } else if (entry.state === 'partial') {
      for (const child of entry.children) {
        if (child.checked) out.push(`${entry.name}/${child.relPath}`);
      }
    }
  }
  return [...new Set(out)].filter((p) => normalizeEntry(p) !== null && !isDenied(p)).sort();
}

// ── IO loop ───────────────────────────────────────────────────────────────

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const ALT_ENTER = '\x1b[?1049h'; // switch to the alternate screen buffer
const ALT_EXIT = '\x1b[?1049l'; // restore the normal buffer on exit
const HOME = '\x1b[H'; // cursor to top-left
const CLEAR_EOL = '\x1b[K'; // erase to end of line
const CLEAR_BELOW = '\x1b[J'; // erase from cursor to end of screen

/** Muted styling for the "off"/secondary bits of a row. Skipped on the active
 *  row: bold already sets it apart, and dim shares picocolors' reset code with
 *  bold (\x1b[22m), so a dim fragment inside a bolded line would leak. */
function muted(text: string, active: boolean): string {
  return active ? text : pc.dim(text);
}

/** Checkbox for a folder-file child: green when checked, muted when off. */
function fileBox(checked: boolean, active: boolean): string {
  return checked ? pc.green('[x]') : muted('[ ]', active);
}

function glyph(entry: PickerEntry, active: boolean): string {
  if (entry.type === 'file') return fileBox(entry.state !== 'off', active);
  if (entry.state === 'whole') return pc.green('[x]');
  if (entry.state === 'partial') return pc.yellow('[~]');
  return muted('[ ]', active);
}

function label(entry: PickerEntry, active: boolean): string {
  if (entry.type !== 'dir') return entry.name;
  const suffix =
    entry.state === 'partial'
      ? ` (${entry.children.filter((c) => c.checked).length} file(s))`
      : '/';
  return `${entry.name}${muted(suffix, active)}`;
}

/** Join row fragments; bold the whole line when it's the active (cursor) row.
 *  Fragments carry only color styling (reset \x1b[39m), never dim, so the bold
 *  wrap has no reset-code collision. */
function styleRow(active: boolean, ...parts: string[]): string {
  const line = parts.join(' ');
  return active ? pc.bold(line) : line;
}

/** Choose the slice of `count` list rows to show in `height` lines, keeping the
 *  cursor row visible (roughly centered, clamped at both ends). */
export function visibleWindow(
  count: number,
  cursor: number,
  height: number,
): { start: number; end: number } {
  if (height <= 0 || count <= height) return { start: 0, end: count };
  const start = Math.max(0, Math.min(cursor - Math.floor(height / 2), count - height));
  return { start, end: start + height };
}

/** Repaint in place on the alternate screen: home the cursor, clear each line
 *  to its end as we overwrite it, then clear anything left below. No full-screen
 *  erase, so the redraw does not flicker. */
function paint(lines: string[]): void {
  const body = lines.map((line) => `${line}${CLEAR_EOL}`).join('\n');
  process.stdout.write(`${HOME}${body}${CLEAR_BELOW}`);
}

/** Build header, selectable rows (with the active cursor), and footer for the
 *  current view. Windowing/painting is applied by render(). */
function viewLines(model: PickerModel): {
  header: string[];
  rows: string[];
  cursor: number;
  footer: string[];
} {
  if (model.view === 'top') {
    const rows = model.entries.map((entry, i) => {
      const active = i === model.cursor;
      const pointer = active ? pc.cyan('❯') : ' ';
      return styleRow(active, pointer, glyph(entry, active), label(entry, active));
    });
    return {
      header: [pc.bold('Select paths to sync'), ''],
      rows,
      cursor: model.cursor,
      footer: ['', pc.dim('↑/↓ move · space toggle · enter save · esc cancel')],
    };
  }
  const entry = model.activeFolder === null ? undefined : model.entries[model.activeFolder];
  if (model.view === 'folder-choice' && entry) {
    const rows = ['Whole folder', 'Pick specific files'].map((opt, i) => {
      const active = i === model.subCursor;
      return styleRow(active, active ? pc.cyan('❯') : ' ', opt);
    });
    return {
      header: [pc.bold(`${entry.name}/`), ''],
      rows,
      cursor: model.subCursor,
      footer: ['', pc.dim('↑/↓ move · enter choose · esc back')],
    };
  }
  if (entry) {
    const rows =
      entry.children.length === 0
        ? [pc.dim('  (no files found)')]
        : entry.children.map((child, i) => {
            const active = i === model.subCursor;
            const pointer = active ? pc.cyan('❯') : ' ';
            return styleRow(active, pointer, fileBox(child.checked, active), child.relPath);
          });
    return {
      header: [pc.bold(`${entry.name}/ — pick files`), ''],
      rows,
      cursor: model.subCursor,
      footer: ['', pc.dim('↑/↓ move · space toggle · enter done · esc back')],
    };
  }
  return { header: [], rows: [], cursor: 0, footer: [] };
}

function render(model: PickerModel): void {
  const { header, rows, cursor, footer } = viewLines(model);
  // Reserve terminal rows for the header, footer, and the two scroll markers.
  const termRows = process.stdout.rows ?? 24;
  const budget = Math.max(1, termRows - header.length - footer.length - 2);
  const { start, end } = visibleWindow(rows.length, cursor, budget);
  const above = start > 0 ? pc.dim(`  ↑ ${start} more`) : '';
  const below = end < rows.length ? pc.dim(`  ↓ ${rows.length - end} more`) : '';
  paint([...header, above, ...rows.slice(start, end), below, ...footer]);
}

/** Run the interactive picker. Returns the final model on save, or null on
 *  cancel. Precondition: process.stdin is an interactive TTY (the caller checks;
 *  see commands/manifest.ts). Restores terminal state on every exit. */
export function runPicker(initial: PickerModel): Promise<PickerModel | null> {
  const input = process.stdin;

  return new Promise<PickerModel | null>((resolve, reject) => {
    let model = initial;
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      input.removeListener('keypress', onKey);
      input.setRawMode(false);
      input.pause();
      process.stdout.write(`${SHOW_CURSOR}${ALT_EXIT}`);
    };
    const onKey = (_str: string, key: KeyEvent | undefined): void => {
      try {
        if (key?.ctrl && key.name === 'c') {
          cleanup();
          process.exit(130);
        }
        model = reduce(model, key ?? {});
        if (model.done) {
          cleanup();
          resolve(model.done === 'save' ? model : null);
          return;
        }
        render(model);
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    process.stdout.write(`${ALT_ENTER}${HIDE_CURSOR}`);
    render(model);
    input.on('keypress', onKey);
  });
}
