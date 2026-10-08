import { execFile } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { createTemporaryDirectory } from '../../core/__tests__/helpers/resources.ts';

const script = resolve('contrib/codiff-comment');

const runCodiffComment = (args: ReadonlyArray<string>, body: string, env = process.env) =>
  new Promise<{ code: number | null; stderr: string }>((resolveRun) => {
    const child = execFile(script, args, { env }, (error, _stdout, stderr) =>
      resolveRun({ code: error ? (error.code as number) : 0, stderr }),
    );
    child.stdin?.end(body);
  });

test('codiff-comment appends a comment block to a queue file target', async () => {
  await using directory = await createTemporaryDirectory('codiff-comment-');
  const queuePath = join(directory.path, 'comments.txt');
  await writeFile(queuePath, '');

  const result = await runCodiffComment(
    [
      '--target',
      queuePath,
      '--file',
      '/repo/src/a.ts',
      '--path',
      'src/a.ts',
      '--line',
      '3',
      '--end',
      '5',
      '--snippet',
      'x = 1\ny = 2',
      '--send',
    ],
    'rename these  \r\nplease\n',
  );

  expect(result).toEqual({ code: 0, stderr: '' });
  expect(await readFile(queuePath, 'utf8')).toBe(
    'Codiff review comment on src/a.ts:3-5\n> x = 1\n> y = 2\nrename these\nplease\n\n',
  );
});

test('codiff-comment hands a pane target to herdr-comment', async () => {
  await using directory = await createTemporaryDirectory('codiff-comment-');
  const fakeHerdrComment = join(directory.path, 'herdr-comment');
  const argsPath = join(directory.path, 'args.txt');
  await writeFile(
    fakeHerdrComment,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > '${argsPath}'\ncat >> '${argsPath}'\n`,
  );
  await chmod(fakeHerdrComment, 0o755);

  const result = await runCodiffComment(
    ['--target', 'w1E:p1', '--file', '/repo/a.ts', '--path', 'a.ts', '--line', '7', '--send'],
    'looks off',
    { ...process.env, HERDR_COMMENT_BIN: fakeHerdrComment },
  );

  expect(result).toEqual({ code: 0, stderr: '' });
  expect((await readFile(argsPath, 'utf8')).split('\n')).toEqual([
    '--file',
    '/repo/a.ts',
    '--line',
    '7',
    '--end',
    '',
    '--snippet',
    '',
    '--pane',
    'w1E:p1',
    '--send',
    'looks off',
  ]);
});

test('codiff-comment refuses a queue that does not exist', async () => {
  await using directory = await createTemporaryDirectory('codiff-comment-');
  const queuePath = join(directory.path, 'missing.txt');

  expect(
    await runCodiffComment(['--target', queuePath, '--file', '/repo/a.ts'], 'comment'),
  ).toEqual({ code: 1, stderr: `comment queue not found: ${queuePath}\n` });
});
