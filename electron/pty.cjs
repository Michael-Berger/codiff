// @ts-check

const { accessSync, chmodSync, constants } = require('node:fs');
const { dirname, join } = require('node:path');

// pnpm can install node-pty's prebuilt macOS spawn-helper without the
// executable bit, which makes pty.spawn fail with `posix_spawnp failed`.
const ensureSpawnHelperIsExecutable = () => {
  if (process.platform !== 'darwin') {
    return;
  }
  const helper = join(
    dirname(require.resolve('node-pty/package.json')),
    'prebuilds',
    `darwin-${process.arch}`,
    'spawn-helper',
  );
  try {
    accessSync(helper, constants.X_OK);
  } catch {
    try {
      chmodSync(helper, 0o755);
    } catch {
      // Let node-pty report the failure if the helper cannot be repaired.
    }
  }
};

/** @type {typeof import('node-pty').spawn} */
const spawnPty = (...args) => {
  ensureSpawnHelperIsExecutable();
  return require('node-pty').spawn(...args);
};

module.exports = { spawnPty };
