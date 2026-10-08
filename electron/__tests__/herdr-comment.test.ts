import { execFile } from 'node:child_process';
import { chmod, mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vite-plus/test';
import { createTemporaryDirectory } from '../../core/__tests__/helpers/resources.ts';

const script = resolve('contrib/herdr/herdr-comment');
const execFileAsync = promisify(execFile);

const setUpPanes = async (temporaryDirectory: string) => {
  const directory = await realpath(temporaryDirectory);
  const sessionRepo = join(directory, 'session');
  const reviewedRepo = join(directory, 'reviewed');
  for (const repo of [sessionRepo, reviewedRepo]) {
    await mkdir(repo);
    await execFileAsync('git', ['init', '-q', repo]);
  }
  const file = join(reviewedRepo, 'a.ts');
  await writeFile(file, 'x\n');
  const agents = {
    result: {
      agents: [
        { cwd: sessionRepo, focused: false, pane_id: 'w1:p1', terminal_title_stripped: 'session' },
        { cwd: reviewedRepo, focused: true, pane_id: 'w2:p1', terminal_title_stripped: 'other' },
      ],
    },
  };
  const fakeHerdr = join(directory, 'herdr');
  await writeFile(fakeHerdr, `#!/usr/bin/env bash\necho '${JSON.stringify(agents)}'\n`);
  await chmod(fakeHerdr, 0o755);
  return { env: { ...process.env, HERDR_BIN: fakeHerdr }, file };
};

const resolvePane = async (args: ReadonlyArray<string>, env: NodeJS.ProcessEnv) => {
  const { stdout } = await execFileAsync(script, [...args, '--dry-run', '--text', 'hi'], { env });
  return stdout.split('\n')[0];
};

test('herdr-comment keeps the launching pane when it works in another checkout', async () => {
  await using directory = await createTemporaryDirectory('herdr-comment-');
  const { env, file } = await setUpPanes(directory.path);

  expect(await resolvePane(['--file', file, '--line', '1', '--pane', 'w1:p1'], env)).toBe(
    'pane: w1:p1',
  );
});

test('herdr-comment falls back to the file worktree when the pane is closed', async () => {
  await using directory = await createTemporaryDirectory('herdr-comment-');
  const { env, file } = await setUpPanes(directory.path);

  expect(await resolvePane(['--file', file, '--line', '1', '--pane', 'w9:p9'], env)).toBe(
    'pane: w2:p1',
  );
});
