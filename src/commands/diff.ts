import { claudeDir } from '../lib/paths.js';
import { openRepo, unifiedDiff } from '../lib/repo.js';

export async function diff(): Promise<string> {
  const { repoDir, manifest } = openRepo();
  const out = unifiedDiff(repoDir, claudeDir(), manifest);
  console.log(out || 'No differences.');
  return out;
}
