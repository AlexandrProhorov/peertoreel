import { join, resolve } from 'node:path';
import { bench } from './bench.js';

interface Options {
  readonly root: string;
  readonly out: string;
  readonly quiet: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--quiet') {
      values.set('quiet', 'true');
    } else if (argument !== undefined && argument.startsWith('--')) {
      const value = argv[index + 1];

      if (value !== undefined && !value.startsWith('--')) {
        values.set(argument.slice(2), value);
        index += 1;
      }
    }
  }

  /* The script runs from `apps/render-worker`: archives are local, the report
     belongs to the repository. */
  const cwd = process.cwd();
  const today = new Date().toISOString().slice(0, 10);

  return {
    root: resolve(values.get('root') ?? join(cwd, 'out')),
    out: resolve(
      values.get('out') ??
        join(cwd, '..', '..', 'docs', 'workspace', 'reports', `${today}-bench`),
    ),
    quiet: values.has('quiet'),
  };
}

const options = parseOptions(process.argv.slice(2));

bench({ root: options.root, out: options.out })
  .then(({ runs, report }) => {
    if (!options.quiet) {
      process.stdout.write(`${report}\n${runs.length} run(s) → ${options.out}\n`);
    }
  })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
