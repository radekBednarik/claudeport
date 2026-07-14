import os from 'node:os';
import path from 'node:path';

export function claudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
}

export function syncDir(): string {
  return process.env.CLAUDESYNC_DIR ?? path.join(os.homedir(), '.claude-sync');
}
