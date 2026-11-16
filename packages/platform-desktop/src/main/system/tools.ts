import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** What a program said and how it ended (`code` -1: it could not be started). */
export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The device as the Linux System service sees it: programs to run, files to
 * read. The real one is `nodeTools()`; the tests give a fake X250.
 */
export interface SystemTools {
  run(command: string, args: readonly string[]): Promise<RunResult>;
  /** A file's text, or null when it is missing or unreadable. */
  read(file: string): Promise<string | null>;
  /** A directory's entries, or [] when it is missing. */
  list(dir: string): Promise<readonly string[]>;
  /** Where a symbolic link points, or null. */
  readlink(file: string): Promise<string | null>;
  /** When a file was last modified, or null. */
  modified(file: string): Promise<Date | null>;
  /** Used and total bytes of the file system holding `path`, or null. */
  disk(path: string): Promise<{ readonly used: number; readonly total: number } | null>;
  /**
   * A long-running program (`nmcli monitor`, `swayidle`): each line of its
   * output is passed on; the returned function stops it. A program that
   * cannot be started is ignored (the device may lack it).
   */
  daemon(command: string, args: readonly string[], onLine?: (line: string) => void): () => void;
}

const TIMEOUT = 30_000;

/**
 * A long-running program dies with the app (essais du 16 novembre 2026 sur
 * le X250) : killed by its session loop, the app never reaches its own
 * cleanup, and a `nmcli monitor` left behind kept the app's sockets open
 * (the test port among them), a `swayidle` stayed orphaned. On Linux,
 * `setpriv --pdeathsig KILL` (util-linux) has the kernel kill it when the
 * app goes. Elsewhere, or without setpriv, it starts as it is.
 */
export function guardedCommand(
  command: string,
  args: readonly string[],
  setpriv: string | null,
): readonly [string, readonly string[]] {
  return setpriv ? [setpriv, ['--pdeathsig', 'KILL', '--', command, ...args]] : [command, args];
}

/** Where setpriv is on this Linux system, or null. */
function findSetpriv(): string | null {
  if (process.platform !== 'linux') return null;
  for (const dir of (process.env['PATH'] ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, 'setpriv');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Not in this directory.
    }
  }
  return null;
}

export function nodeTools(): SystemTools {
  const setpriv = findSetpriv();
  return {
    run: (command, args) =>
      new Promise((resolve) => {
        execFile(
          command,
          [...args],
          { timeout: TIMEOUT, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } },
          (error, stdout, stderr) => {
            // An exit status is a number; a program that is not there, 'ENOENT'.
            const status = (error as { code?: number | string } | null)?.code;
            const code =
              error === null
                ? 0
                : typeof status === 'number'
                  ? status
                  : status === 'ENOENT'
                    ? -1
                    : 1;
            resolve({ code, stdout, stderr });
          },
        );
      }),
    read: async (file) => {
      try {
        return await fs.promises.readFile(file, 'utf8');
      } catch {
        return null;
      }
    },
    list: async (dir) => {
      try {
        return await fs.promises.readdir(dir);
      } catch {
        return [];
      }
    },
    readlink: async (file) => {
      try {
        return await fs.promises.readlink(file);
      } catch {
        return null;
      }
    },
    modified: async (file) => {
      try {
        return (await fs.promises.stat(file)).mtime;
      } catch {
        return null;
      }
    },
    disk: async (path) => {
      try {
        const s = await fs.promises.statfs(path);
        const total = s.blocks * s.bsize;
        return { total, used: total - s.bfree * s.bsize };
      } catch {
        return null;
      }
    },
    daemon: (command, args, onLine) => {
      let stopped = false;
      const [program, argv] = guardedCommand(command, args, setpriv);
      const child = spawn(program, [...argv], {
        stdio: ['ignore', onLine ? 'pipe' : 'ignore', 'ignore'],
        env: { ...process.env, LC_ALL: 'C' },
      });
      child.on('error', () => {});
      if (onLine && child.stdout) {
        let rest = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          const lines = (rest + chunk).split('\n');
          rest = lines.pop() ?? '';
          if (!stopped) for (const line of lines) onLine(line);
        });
      }
      return () => {
        stopped = true;
        child.kill();
      };
    },
  };
}
