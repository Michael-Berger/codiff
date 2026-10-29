import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { createTemporaryDirectory } from '../../core/__tests__/helpers/resources.ts';

const require = createRequire(import.meta.url);
const { getForkVersion } = require('../fork-version.cjs') as {
  getForkVersion: (root: string, baseVersion: string) => string;
};

const git = (cwd: string, ...args: Array<string>) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const commit = async (cwd: string, name: string) => {
  await writeFile(join(cwd, name), name);
  git(cwd, 'add', name);
  git(cwd, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-qm', name);
};

const initRepository = async (cwd: string) => {
  git(cwd, 'init', '-q');
  await commit(cwd, 'release.txt');
};

test('getForkVersion counts commits since the release tag and names the commit', async () => {
  await using directory = await createTemporaryDirectory('fork-version-');
  await initRepository(directory.path);
  git(directory.path, 'tag', 'v1.2.3');
  await commit(directory.path, 'a.txt');
  await commit(directory.path, 'b.txt');
  const sha = git(directory.path, 'rev-parse', '--short', 'HEAD');

  expect(getForkVersion(directory.path, '1.2.3')).toBe(`1.2.3-fork.2+${sha}`);

  await writeFile(join(directory.path, 'a.txt'), 'edited');
  expect(getForkVersion(directory.path, '1.2.3')).toBe(`1.2.3-fork.2+${sha}.dirty`);
});

test('getForkVersion leaves out the count when the release tag is missing', async () => {
  await using directory = await createTemporaryDirectory('fork-version-');
  await initRepository(directory.path);
  const sha = git(directory.path, 'rev-parse', '--short', 'HEAD');

  expect(getForkVersion(directory.path, '1.2.3')).toBe(`1.2.3-fork+${sha}`);
});

test('getForkVersion prefers the build stamp and falls back to a bare fork suffix', async () => {
  await using directory = await createTemporaryDirectory('fork-version-');

  expect(getForkVersion(directory.path, '1.2.3')).toBe('1.2.3-fork');

  await writeFile(
    join(directory.path, 'fork-build.json'),
    JSON.stringify({ version: '1.2.3-fork.7+abc1234' }),
  );
  expect(getForkVersion(directory.path, '1.2.3')).toBe('1.2.3-fork.7+abc1234');
});
