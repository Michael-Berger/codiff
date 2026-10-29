// @ts-check

const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const FORK_VERSION_STAMP = 'fork-build.json';

/** @param {string} root @param {ReadonlyArray<string>} args */
const git = (root, args) =>
  execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

/** @param {string} root @param {string} baseVersion */
const readGitForkVersion = (root, baseVersion) => {
  try {
    const sha = git(root, ['rev-parse', '--short', 'HEAD']);
    let count = '';
    try {
      count = git(root, ['rev-list', '--count', `v${baseVersion}..HEAD`]);
    } catch {}
    const dirty = git(root, ['status', '--porcelain', '--untracked-files=no']) ? '.dirty' : '';
    return `${baseVersion}-fork${count ? `.${count}` : ''}+${sha}${dirty}`;
  } catch {
    return null;
  }
};

/** @param {string} root @param {string} baseVersion */
const getForkVersion = (root, baseVersion) => {
  try {
    const { version } = JSON.parse(readFileSync(join(root, FORK_VERSION_STAMP), 'utf8'));
    if (typeof version === 'string' && version) {
      return version;
    }
  } catch {}
  return (
    (existsSync(join(root, '.git')) ? readGitForkVersion(root, baseVersion) : null) ??
    `${baseVersion}-fork`
  );
};

module.exports = { FORK_VERSION_STAMP, getForkVersion, readGitForkVersion };
