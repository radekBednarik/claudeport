import pc from 'picocolors';

// Braille dot spinner — the familiar `ora`/npm frames, rendered by hand so we
// carry no dependency and, crucially, never touch stdin (a spinner library that
// grabbed the TTY here deadlocked child git processes).
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_MS = 80;
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_LINE = '\r\x1b[K';

/** Human-friendly duration: "340ms" under a second, "1.2s" above. */
export function elapsed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Run `fn` behind an animated spinner.
 *  - success: a green ✔ (`opts.done` text if given, else `label`) with elapsed time.
 *  - failure with `opts.warnOnError`: a yellow ⚠ with that message; error swallowed, returns undefined.
 *  - failure otherwise: a red ✖ then the error is rethrown.
 *  Only animates on a TTY; piped/CI output just gets the single result line. */
export async function withSpinner<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { done?: string; warnOnError?: string } = {},
): Promise<T | undefined> {
  const stream = process.stdout;
  const animate = stream.isTTY === true;
  const start = performance.now();

  let frame = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const render = (): void => {
    stream.write(`${CLEAR_LINE}${pc.cyan(FRAMES[frame])} ${label}`);
    frame = (frame + 1) % FRAMES.length;
  };
  const onSigint = (): void => {
    stop();
    process.exit(130);
  };
  function stop(): void {
    if (timer) clearInterval(timer);
    if (animate) {
      stream.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
      process.removeListener('SIGINT', onSigint);
    }
  }
  const finish = (symbol: string, text: string): void => {
    console.log(`${symbol} ${text}`);
  };

  if (animate) {
    process.once('SIGINT', onSigint);
    stream.write(HIDE_CURSOR);
    render();
    timer = setInterval(render, FRAME_MS);
    timer.unref?.();
  }

  try {
    const result = await fn();
    stop();
    finish(
      pc.green('✔'),
      `${opts.done ?? label} ${pc.dim(`(${elapsed(performance.now() - start)})`)}`,
    );
    return result;
  } catch (err) {
    stop();
    if (opts.warnOnError !== undefined) {
      finish(pc.yellow('⚠'), pc.yellow(opts.warnOnError));
      return undefined;
    }
    finish(pc.red('✖'), label);
    throw err;
  }
}
