import { execFile } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { createTemporaryDirectory } from '../../core/__tests__/helpers/resources.ts';

const script = resolve('contrib/install-fork');

const runCheck = (directory: string) =>
  new Promise<{ code: number | null; output: string }>((resolveRun) => {
    execFile(
      script,
      ['--check'],
      { env: { HOME: directory, PATH: `${directory}:/usr/bin:/bin`, TMPDIR: directory } },
      (error, stdout, stderr) =>
        resolveRun({ code: error ? (error.code as number) : 0, output: stdout + stderr }),
    );
  });

const writeTool = async (directory: string, name: string, body: string) => {
  const path = join(directory, name);
  await writeFile(path, `#!/bin/bash\n${body}\n`);
  await chmod(path, 0o755);
};

test.skipIf(process.platform !== 'darwin')(
  'install-fork --check lists every outdated or broken prerequisite',
  async () => {
    await using directory = await createTemporaryDirectory('install-fork-');
    await writeTool(directory.path, 'node', 'echo 22.3.0');
    await writeTool(directory.path, 'pnpm', 'echo 10.2.0');
    await writeTool(directory.path, 'xcode-select', 'echo /Library/Developer/CommandLineTools');
    await writeTool(directory.path, 'xcrun', 'echo "license not accepted" >&2; exit 69');

    const { code, output } = await runCheck(directory.path);

    expect(code).toBe(1);
    expect(output).toContain('Node.js 23 or newer is required; found 22.3.0.');
    expect(output).toContain('pnpm 12 or newer is required; found 10.2.0.');
    expect(output).toContain('The C++ compiler does not work');
    expect(output).toContain('    license not accepted');
    expect(output).toContain(`Full output: ${join(directory.path, 'codiff-install-fork.log')}`);
  },
);

test.skipIf(process.platform !== 'darwin')(
  'install-fork --check names the missing tools and how to install them',
  async () => {
    await using directory = await createTemporaryDirectory('install-fork-');
    await writeTool(directory.path, 'xcode-select', 'exit 2');

    const { code, output } = await runCheck(directory.path);

    expect(code).toBe(1);
    expect(output).toContain('Node.js 23 or newer is required (https://nodejs.org).');
    expect(output).toContain('pnpm is required: run `corepack enable pnpm`.');
    expect(output).toContain('run `xcode-select --install`.');
  },
);
