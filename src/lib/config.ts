import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Config {
  claudeDir?: string;
  syncDir?: string;
}

/** Native per-user config directory, resolved without extra dependencies. */
function configDir(): string {
  if (process.platform === 'win32') {
    return process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
}

/** Absolute path to the config file (may not exist yet). */
export function configFilePath(): string {
  return path.join(configDir(), 'claudeport', 'config.json');
}

/**
 * Parse the config file. Returns `{}` when it's absent so callers can treat a
 * missing file as "no overrides". Throws with a clear message if the file exists
 * but holds malformed JSON or a non-object, rather than silently ignoring it.
 */
export function readConfig(): Config {
  const file = configFilePath();
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Config file at ${file} is not valid JSON — fix or delete it.`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Config file at ${file} must contain a JSON object.`);
  }
  return parsed as Config;
}

/** Write the config file, creating the parent directory if needed. */
export function writeConfig(cfg: Config): void {
  const file = configFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
}
