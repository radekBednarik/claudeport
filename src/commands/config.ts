import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';
import { type Config, configFilePath, readConfig, writeConfig } from '../lib/config.js';

// CLI keys are kebab-case; map them to the camelCase keys stored on disk.
const KEYS: Record<string, keyof Config> = {
  'claude-dir': 'claudeDir',
  'sync-dir': 'syncDir',
};

function resolveKey(cliKey: string): keyof Config {
  const key = KEYS[cliKey];
  if (!key) {
    throw new Error(`Unknown config key '${cliKey}'. Valid keys: ${Object.keys(KEYS).join(', ')}.`);
  }
  return key;
}

// Expand a leading `~` and make the value an absolute, normalized path.
function resolveInputPath(value: string): string {
  let v = value;
  if (v === '~') v = os.homedir();
  else if (v.startsWith('~/') || v.startsWith('~\\')) v = path.join(os.homedir(), v.slice(2));
  return path.resolve(v);
}

export function configSet(cliKey: string, value: string): void {
  const key = resolveKey(cliKey);
  const resolved = resolveInputPath(value);
  const cfg = readConfig();
  cfg[key] = resolved;
  writeConfig(cfg);
  console.log(pc.green(`Set ${cliKey} = ${resolved}`));
}

export function configGet(cliKey?: string): void {
  const cfg = readConfig();
  if (cliKey !== undefined) {
    const key = resolveKey(cliKey);
    console.log(cfg[key] ?? pc.dim('(unset)'));
    return;
  }
  for (const cli of Object.keys(KEYS)) {
    const value = cfg[KEYS[cli]];
    console.log(`${cli} = ${value ?? pc.dim('(unset)')}`);
  }
}

export function configUnset(cliKey: string): void {
  const key = resolveKey(cliKey);
  const cfg = readConfig();
  if (cfg[key] === undefined) {
    console.log(`${cliKey} is already unset.`);
    return;
  }
  delete cfg[key];
  writeConfig(cfg);
  console.log(pc.green(`Unset ${cliKey}`));
}

export function configPath(): void {
  console.log(configFilePath());
}
