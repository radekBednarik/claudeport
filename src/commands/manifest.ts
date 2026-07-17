import path from 'node:path';
import pc from 'picocolors';
import {
  listFolderFiles,
  listTopLevelEntries,
  MANIFEST_FILE,
  saveManifest,
} from '../lib/manifest.js';
import { claudeDir } from '../lib/paths.js';
import { buildInitialState, runPicker, stateToPaths } from '../lib/picker.js';
import { openRepo } from '../lib/repo.js';

export async function manifest(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error('`claudeport manifest` requires an interactive terminal.');
  }

  const { repoDir, manifest: current } = openRepo();

  const base = claudeDir();
  const discovered = listTopLevelEntries(base);
  const folderFiles: Record<string, string[]> = {};
  for (const entry of discovered) {
    if (entry.type === 'dir') folderFiles[entry.name] = listFolderFiles(base, entry.name);
  }

  const result = await runPicker(buildInitialState(current, discovered, folderFiles));
  if (!result) {
    console.log(pc.dim('Cancelled — manifest unchanged.'));
    return;
  }

  saveManifest(repoDir, { version: current.version, paths: stateToPaths(result) });
  console.log(pc.green(`Updated ${path.join(repoDir, MANIFEST_FILE)}`));
  console.log(pc.dim('Run `claudeport push` to sync your selection.'));
}
