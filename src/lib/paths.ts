import os from 'node:os';
import path from 'node:path';
import { readConfig } from './config.js';

// Resolution order for both dirs: env var > config file > home-dir default.
export function claudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? readConfig().claudeDir ?? path.join(os.homedir(), '.claude');
}

export function syncDir(): string {
  return process.env.CLAUDESYNC_DIR ?? readConfig().syncDir ?? path.join(os.homedir(), '.claude-sync');
}
