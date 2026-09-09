import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { createTemporaryDirectory } from '../../core/__tests__/helpers/resources.ts';

const require = createRequire(import.meta.url);
const { sendComment } = require('../main/comment-command.cjs') as {
  sendComment: (options: {
    commentCommand: string;
    repositoryRoot: string;
    request: {
      body: string;
      endLine?: number;
      line?: number;
      path: string;
      side?: 'additions' | 'deletions';
      snippet?: string;
    };
    target?: string;
  }) => Promise<{ error: string; ok: false } | { ok: true }>;
};

const captureScript = `
const { writeFileSync } = require('node:fs');

const outFile = process.argv[2];
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  writeFileSync(
    outFile,
    JSON.stringify({ argv: process.argv.slice(3), stdin: Buffer.concat(chunks).toString('utf8') }),
  );
});
`;

const failScript = `
process.stderr.write('boom: comment target unavailable\\n');
process.stderr.write('second line\\n');
process.exit(3);
`;

const writeCaptureScript = (dir: string) => {
  const scriptPath = join(dir, 'capture.cjs');
  writeFileSync(scriptPath, captureScript);
  return scriptPath;
};

test('expands command placeholders and writes the body to stdin', async () => {
  await using repo = await createTemporaryDirectory('codiff-comment-command-');
  const scriptPath = writeCaptureScript(repo.path);
  const outFile = join(repo.path, 'out.json');

  const result = await sendComment({
    commentCommand: `${process.execPath} ${scriptPath} ${outFile} --file {file} --path {path} --line {line} --end {endLine} --side {side} --snippet {snippet} --target {target} --body {body}`,
    repositoryRoot: repo.path,
    request: {
      body: '  Please double-check this.\n',
      endLine: 12,
      line: 10,
      path: 'src/a.ts',
      side: 'additions',
      snippet: 'const value = 1;',
    },
    target: 'pane-1',
  });

  expect(result).toEqual({ ok: true });
  const captured = JSON.parse(readFileSync(outFile, 'utf8'));
  expect(captured.argv).toEqual([
    '--file',
    join(repo.path, 'src/a.ts'),
    '--path',
    'src/a.ts',
    '--line',
    '10',
    '--end',
    '12',
    '--side',
    'additions',
    '--snippet',
    'const value = 1;',
    '--target',
    'pane-1',
    '--body',
    'Please double-check this.',
  ]);
  expect(captured.stdin).toBe('Please double-check this.');
});

test('expands unset placeholders to empty strings for a single-line comment', async () => {
  await using repo = await createTemporaryDirectory('codiff-comment-command-');
  const scriptPath = writeCaptureScript(repo.path);
  const outFile = join(repo.path, 'out.json');

  const result = await sendComment({
    commentCommand: `${process.execPath} ${scriptPath} ${outFile} --line {line} --end {endLine} --snippet {snippet} --target {target}`,
    repositoryRoot: repo.path,
    request: {
      body: 'Single line comment.',
      line: 4,
      path: 'src/a.ts',
    },
  });

  expect(result).toEqual({ ok: true });
  const captured = JSON.parse(readFileSync(outFile, 'utf8'));
  expect(captured.argv).toEqual(['--line', '4', '--end', '', '--snippet', '', '--target', '']);
});

test('returns the first stderr line as the error result on a non-zero exit', async () => {
  await using repo = await createTemporaryDirectory('codiff-comment-command-');
  const scriptPath = join(repo.path, 'fail.cjs');
  writeFileSync(scriptPath, failScript);

  const result = await sendComment({
    commentCommand: `${process.execPath} ${scriptPath}`,
    repositoryRoot: repo.path,
    request: { body: 'Body.', path: 'src/a.ts' },
  });

  expect(result).toEqual({ error: 'boom: comment target unavailable', ok: false });
});

test('reports a failure instead of crashing when the command exits before reading stdin', async () => {
  await using repo = await createTemporaryDirectory('codiff-comment-command-');
  const scriptPath = join(repo.path, 'exit.cjs');
  writeFileSync(scriptPath, 'process.exit(2);');

  const result = await sendComment({
    commentCommand: `${process.execPath} ${scriptPath}`,
    repositoryRoot: repo.path,
    request: { body: 'x'.repeat(1024 * 1024), path: 'src/a.ts' },
  });

  expect(result.ok).toBe(false);
});

test('reports the spawn error when the configured command does not exist', async () => {
  await using repo = await createTemporaryDirectory('codiff-comment-command-');

  const result = await sendComment({
    commentCommand: 'codiff-comment-command-does-not-exist',
    repositoryRoot: repo.path,
    request: { body: 'Body.', path: 'src/a.ts' },
  });

  expect(result.ok).toBe(false);
  expect((result as { error: string }).error).toContain('codiff-comment-command-does-not-exist');
});

test('rejects a path outside the repository without running the command', async () => {
  await using repo = await createTemporaryDirectory('codiff-comment-command-');
  const scriptPath = writeCaptureScript(repo.path);
  const outFile = join(repo.path, 'out.json');

  const result = await sendComment({
    commentCommand: `${process.execPath} ${scriptPath} ${outFile}`,
    repositoryRoot: repo.path,
    request: { body: 'Body.', path: '../outside-the-repo.ts' },
  });

  expect(result).toEqual({ error: 'Invalid repository path.', ok: false });
  expect(existsSync(outFile)).toBe(false);
});

test('returns a message when no comment command is configured', async () => {
  await using repo = await createTemporaryDirectory('codiff-comment-command-');

  const result = await sendComment({
    commentCommand: '',
    repositoryRoot: repo.path,
    request: { body: 'Body.', path: 'src/a.ts' },
  });

  expect(result).toEqual({ error: 'No comment command is configured.', ok: false });
});
