import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RENDER_WORKER_DIR = fileURLToPath(
  new URL('../../../render-worker/', import.meta.url),
);

const MAX_TIMEOUT_MS = 10 * 60 * 1000;
const TAIL_CHARS = 8_000;

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

export interface RenderStoryboardCliInput {
  storyboardPath: string;
  assetsPath: string;
  outDir: string;
  timeoutMs?: number;
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
        stdio: ['ignore', 'ignore', 'pipe'],
        shell: false,
        windowsHide: true,
      },
    );

    let stderr = '';
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
