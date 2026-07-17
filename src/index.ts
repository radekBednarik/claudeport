#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('claudeport')
  .description('Sync your Claude Code configuration across machines via your own git repo')
  .version('0.3.0');

program
  .command('init')
  .argument('<remote-url>', 'git remote URL of your config repo')
  .option('-y, --yes', 'apply adopted config without confirmation')
  .description('link this machine to a config repo (seeds an empty repo, adopts a populated one)')
  .action(async (remoteUrl: string, opts: { yes?: boolean }) => {
    const { init } = await import('./commands/init.js');
    await init(remoteUrl, opts);
  });

program
  .command('push')
  .option('-m, --message <message>', 'commit message')
  .description('copy local Claude config into the repo, commit and push')
  .action(async (opts: { message?: string }) => {
    const { push } = await import('./commands/push.js');
    await push(opts);
  });

program
  .command('pull')
  .option('-y, --yes', 'apply without confirmation')
  .description('fetch the repo and apply its config to this machine')
  .action(async (opts: { yes?: boolean }) => {
    const { pull } = await import('./commands/pull.js');
    await pull(opts);
  });

program
  .command('status')
  .description('show what differs between this machine and the repo')
  .action(async () => {
    const { status } = await import('./commands/status.js');
    await status();
  });

program
  .command('diff')
  .description('show a unified diff between this machine and the repo')
  .action(async () => {
    const { diff } = await import('./commands/diff.js');
    await diff();
  });

program
  .command('manifest')
  .description('interactively choose which .claude paths to sync')
  .action(async () => {
    const { manifest } = await import('./commands/manifest.js');
    await manifest();
  });

const config = program
  .command('config')
  .description('view or change where claudeport reads config (env var > config file > default)');

config
  .command('set')
  .argument('<key>', 'config key: claude-dir | sync-dir')
  .argument('<value>', 'directory path (a leading ~ and relative paths are resolved)')
  .description('store a config value in the native config file')
  .action(async (key: string, value: string) => {
    const { configSet } = await import('./commands/config.js');
    configSet(key, value);
  });

config
  .command('get')
  .argument('[key]', 'config key: claude-dir | sync-dir (omit to list all)')
  .description('print stored config value(s)')
  .action(async (key: string | undefined) => {
    const { configGet } = await import('./commands/config.js');
    configGet(key);
  });

config
  .command('unset')
  .argument('<key>', 'config key: claude-dir | sync-dir')
  .description('remove a config value')
  .action(async (key: string) => {
    const { configUnset } = await import('./commands/config.js');
    configUnset(key);
  });

config
  .command('path')
  .description('print the config file location')
  .action(async () => {
    const { configPath } = await import('./commands/config.js');
    configPath();
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
