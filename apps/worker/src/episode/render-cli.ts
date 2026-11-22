import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RENDER_WORKER_DIR = fileURLToPath(
  new URL('../../../render-worker/', import.meta.url),
);

const MAX_TIMEOUT_MS = 10 * 60 * 1000;
const TAIL_CHARS = 8_000;
const PROGRESS_PREFIX = '##progress ';

export class EpisodeRenderError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'EpisodeRenderError';
  }
}

/** Progress the renderer emits per scene; the worker turns it into a bar + ETA. */
export type RenderProgressEvent =
  | { readonly type: 'total'; readonly total: number }
  | {
      readonly type: 'scene';
      readonly index: number;
      readonly total: number;
      readonly id: string;
      readonly renderMs: number;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Parse one renderer stdout line. Unknown or malformed lines return null: the
 * renderer is a separate process and its log format is not a contract.
 */
export function parseRenderProgressLine(
  line: string,
): RenderProgressEvent | null {
  if (!line.startsWith(PROGRESS_PREFIX)) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(line.slice(PROGRESS_PREFIX.length));
  } catch {
    return null;
  }

  const record = asRecord(parsed);

  if (record === null) {
    return null;
  }

  const total = record.total;

  if (typeof total !== 'number' || !Number.isInteger(total) || total < 1) {
    return null;
  }

  if (record.type === 'total') {
    return { type: 'total', total };
  }

  if (record.type !== 'scene') {
    return null;
  }

  const index = record.index;
  const id = record.id;
  const renderMs = record.renderMs;

  if (
    typeof index !== 'number' ||
    !Number.isInteger(index) ||
    index < 1 ||
    index > total ||
    typeof id !== 'string' ||
    typeof renderMs !== 'number' ||
    !Number.isFinite(renderMs) ||
    renderMs < 0
  ) {
    return null;
  }

  return { type: 'scene', index, total, id, renderMs };
}

export interface RenderStoryboardCliInput {
  storyboardPath: string;
  assetsPath: string;
  outDir: string;
  timeoutMs?: number;
  onProgress?: (event: RenderProgressEvent) => void;
}

/**
 * Runs the existing render-worker CLI in a subprocess. Episode mode does not
 * import Remotion/React into the BullMQ worker: Chrome RAM and the bundler stay
 * in `apps/render-worker`.
 */
export function renderStoryboardCli(
  input: RenderStoryboardCliInput,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        path.join(RENDER_WORKER_DIR, 'src', 'cli.ts'),
        'render-storyboard',
        '--input',
        input.storyboardPath,
        '--out',
        input.outDir,
        '--assets',
        input.assetsPath,
      ],
      {
        cwd: RENDER_WORKER_DIR,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      },
    );

    let stderr = '';
    let stdoutBuffer = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new EpisodeRenderError(
          'Remotion не уложился в таймаут рендера эпизода',
          null,
          stderr.slice(-TAIL_CHARS),
        ),
      );
    }, input.timeoutMs ?? MAX_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;

      let newline = stdoutBuffer.indexOf('\n');

      while (newline >= 0) {
        const line = stdoutBuffer.slice(0, newline).trimEnd();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);

        const event = parseRenderProgressLine(line);

        if (event !== null) {
          input.onProgress?.(event);
        }

        newline = stdoutBuffer.indexOf('\n');
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-TAIL_CHARS);
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(
        new EpisodeRenderError(
          `Не удалось запустить render-worker: ${error.message}`,
          null,
          stderr.slice(-TAIL_CHARS),
        ),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new EpisodeRenderError(
          `render-worker завершился с кодом ${String(code)}${
            stderr.trim().length > 0
              ? `: ${stderr.trim().slice(-500)}`
              : ''
          }`,
          code,
          stderr.slice(-TAIL_CHARS),
        ),
      );
    });
  });
}
