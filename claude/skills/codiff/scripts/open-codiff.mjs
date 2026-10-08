#!/usr/bin/env node

// Launcher for the Codiff `codiff` skill. Opens Codiff on an agent-authored walkthrough JSON
// file or a plain diff, passing the Claude session id so follow-up questions reuse the
// conversation.
//
// Usage:
//   node scripts/open-codiff.mjs --file <path> [target]
//   node scripts/open-codiff.mjs [target]
//   node scripts/open-codiff.mjs --plan <path> [repository]
//
// `--file <path>` is forwarded to Codiff as `--walkthrough-file`. Without it, Codiff opens the
// plain diff for the target. Any other arguments (a commit, `--commit <sha>`, `--branch <ref>`,
// HEAD, a PR number, or a repository path) are forwarded verbatim; when no repository path is
// given the session's working directory is used.

import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const threadId = process.env.CLAUDE_SESSION_ID || '';
const skillRoot = resolve(import.meta.dirname, '..');
const codiffRoot = resolve(skillRoot, '../../..');
const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxSessionScanFiles = 20_000;
const maxSessionReadBytes = 16 * 1024 * 1024;

const getCodiffCommand = () => {
  if (process.env.CODIFF_COMMAND) {
    return { args: [], command: process.env.CODIFF_COMMAND };
  }

  const appCli = join(codiffRoot, 'bin/codiff-app');
  if (
    process.platform === 'darwin' &&
    codiffRoot.includes('.app/Contents/Resources/app') &&
    existsSync(appCli)
  ) {
    return { args: [], command: appCli };
  }

  const devCli = join(codiffRoot, 'bin/codiff.js');
  if (existsSync(devCli)) {
    return { args: [devCli], command: process.execPath };
  }

  if (process.platform === 'darwin' && existsSync(appCli)) {
    return { args: [], command: appCli };
  }

  return { args: [], command: 'codiff' };
};

const getShareCommand = () =>
  process.env.CODIFF_SHARE_COMMAND
    ? { args: [], command: process.env.CODIFF_SHARE_COMMAND }
    : { args: [join(codiffRoot, 'bin/share-codiff.mjs')], command: process.execPath };

const getClaudeHome = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');

const findClaudeSessionFile = (sessionId) => {
  if (!sessionIdPattern.test(sessionId)) {
    return null;
  }

  const root = join(getClaudeHome(), 'projects');
  if (!existsSync(root)) {
    return null;
  }

  const stack = [root];
  let scanned = 0;
  while (stack.length > 0 && scanned < maxSessionScanFiles) {
    const directory = stack.pop();
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
        b.name.localeCompare(a.name),
      );
    } catch {
      continue;
    }

    const directories = [];
    for (const entry of entries) {
      scanned += 1;
      const path = join(directory, entry.name);
      if (entry.isFile() && path.toLowerCase().endsWith(`${sessionId.toLowerCase()}.jsonl`)) {
        return path;
      }
      if (entry.isDirectory()) {
        directories.push(path);
      }
      if (scanned >= maxSessionScanFiles) {
        break;
      }
    }
    stack.push(...directories.reverse());
  }

  return null;
};

const readSessionTail = (path) => {
  let file;
  try {
    file = openSync(path, 'r');
    const size = fstatSync(file).size;
    const length = Math.min(size, maxSessionReadBytes);
    const offset = size - length;
    const buffer = Buffer.allocUnsafe(length);
    let bytesRead = 0;
    while (bytesRead < length) {
      const count = readSync(file, buffer, bytesRead, length - bytesRead, offset + bytesRead);
      if (count === 0) {
        break;
      }
      bytesRead += count;
    }

    const text = buffer.toString('utf8', 0, bytesRead);
    if (offset === 0) {
      return text;
    }

    const precedingByte = Buffer.allocUnsafe(1);
    if (readSync(file, precedingByte, 0, 1, offset - 1) === 1 && precedingByte[0] === 0x0a) {
      return text;
    }

    const firstCompleteLine = text.indexOf('\n');
    return firstCompleteLine === -1 ? '' : text.slice(firstCompleteLine + 1);
  } catch {
    return '';
  } finally {
    if (file != null) {
      try {
        closeSync(file);
      } catch {
        // Best-effort cleanup in the short-lived launcher process.
      }
    }
  }
};

const readSessionCwd = (sessionId) => {
  const sessionPath = findClaudeSessionFile(sessionId);
  if (!sessionPath) {
    return null;
  }

  let cwd = null;
  for (const line of readSessionTail(sessionPath).split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      const item = JSON.parse(line);
      if (typeof item?.cwd === 'string' && item.cwd) {
        cwd = item.cwd;
      }
    } catch {
      // Ignore future-format or malformed session records.
    }
  }

  return cwd;
};

const getFallbackSessionCwd = () => {
  const cwd = process.cwd();
  const isRunningFromSourceSkill = cwd === skillRoot || cwd.startsWith(`${skillRoot}/`);
  if (isRunningFromSourceSkill && existsSync(join(codiffRoot, 'bin/codiff.js'))) {
    return codiffRoot;
  }

  return cwd;
};

const rawArgs = process.argv.slice(2);

if (rawArgs[0] === '--resolve-plan-comments') {
  const reviewPath = rawArgs[1] ? resolve(rawArgs[1]) : '';
  const threadIds = rawArgs.slice(2).filter(Boolean);
  if (!reviewPath || threadIds.length === 0) {
    process.stderr.write(
      'open-codiff: expected --resolve-plan-comments <review-path> <thread-id>... .\n',
    );
    process.exit(1);
  }
  const require = createRequire(import.meta.url);
  const { resolvePlanReviewThreadsAtPath } = require(join(codiffRoot, 'electron/plan-review.cjs'));
  try {
    const { missingIds, resolvedIds } = await resolvePlanReviewThreadsAtPath(
      reviewPath,
      threadIds,
      'agent-handled',
    );
    process.stdout.write(
      `CODIFF_PLAN_COMMENTS_RESOLVED ${JSON.stringify({ missingIds, resolvedIds })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
  process.exit(0);
}

const commentQueueClosedMarker = 'CODIFF_REVIEW_CLOSED';
const commentQueuePollMs = 500;

const shellQuote = (value) => `'${value.replaceAll("'", String.raw`'\''`)}'`;

const readCommentQueueOffset = (offsetPath) => {
  try {
    return Number.parseInt(readFileSync(offsetPath, 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
};

const readCommentQueueFrom = (queuePath, offset) => {
  const file = openSync(queuePath, 'r');
  try {
    const length = fstatSync(file).size - offset;
    if (length <= 0) {
      return { nextOffset: offset, text: '' };
    }
    const buffer = Buffer.allocUnsafe(length);
    const bytesRead = readSync(file, buffer, 0, length, offset);
    return { nextOffset: offset + bytesRead, text: buffer.toString('utf8', 0, bytesRead) };
  } finally {
    closeSync(file);
  }
};

// `--watch-comments <queue>`: stream comments appended to a queue for a Monitor. The offset file
// beside the queue lets a restarted watch resume where the last one stopped.
if (rawArgs[0] === '--watch-comments') {
  const queuePath = rawArgs[1] ? resolve(rawArgs[1]) : '';
  if (!queuePath || !existsSync(queuePath)) {
    process.stderr.write(`open-codiff: comment queue not found at ${queuePath}.\n`);
    process.exit(1);
  }

  const offsetPath = `${queuePath}.offset`;
  let offset = readCommentQueueOffset(offsetPath);
  for (;;) {
    let chunk;
    try {
      chunk = readCommentQueueFrom(queuePath, offset);
    } catch (error) {
      process.stderr.write(`open-codiff: ${error instanceof Error ? error.message : error}\n`);
      process.exit(1);
    }

    if (chunk.nextOffset > offset) {
      offset = chunk.nextOffset;
      writeFileSync(offsetPath, String(offset));
      const lines = chunk.text.split('\n');
      const comments = lines
        .filter((line) => line !== commentQueueClosedMarker)
        .join('\n')
        .trim();
      if (comments) {
        process.stdout.write(`${comments}\n`);
      }
      if (lines.includes(commentQueueClosedMarker)) {
        process.stdout.write('Codiff review closed. Stop watching for review comments.\n');
        process.exit(0);
      }
    }

    await sleep(commentQueuePollMs);
  }
}

// `--guide`: print Codiff's current walkthrough authoring guide and exit. The
// guidance lives in Codiff (not this skill), so it stays current across updates.
if (rawArgs.includes('--guide')) {
  const binEntry = join(codiffRoot, 'bin/codiff.js');
  const guide = existsSync(binEntry)
    ? { args: [binEntry, '--walkthrough-guide'], command: process.execPath }
    : (() => {
        const resolved = getCodiffCommand();
        return { args: [...resolved.args, '--walkthrough-guide'], command: resolved.command };
      })();
  const guideResult = spawnSync(guide.command, guide.args, { encoding: 'utf8', stdio: 'inherit' });
  if (guideResult.error) {
    process.stderr.write(`${guideResult.error.message}\n`);
    process.exit(1);
  }
  process.exit(guideResult.status ?? 0);
}

// Pull `--file <path>` (or `--file=<path>`) out of the forwarded arguments.
const forwardedArgs = [];
let openSharedWalkthrough = false;
let planFile = '';
let shareWalkthrough = false;
let walkthroughFile = '';
for (let index = 0; index < rawArgs.length; index += 1) {
  const arg = rawArgs[index];
  if (arg === '--file') {
    walkthroughFile = rawArgs[index + 1] || '';
    index += 1;
    continue;
  }
  if (arg.startsWith('--file=')) {
    walkthroughFile = arg.slice('--file='.length);
    continue;
  }
  if (arg === '--plan') {
    planFile = rawArgs[index + 1] || '';
    index += 1;
    continue;
  }
  if (arg.startsWith('--plan=')) {
    planFile = arg.slice('--plan='.length);
    continue;
  }
  if (arg === '--share') {
    shareWalkthrough = true;
    continue;
  }
  if (arg === '--open') {
    openSharedWalkthrough = true;
    continue;
  }
  forwardedArgs.push(arg);
}

const sessionCwd =
  process.env.CLAUDE_SESSION_CWD || readSessionCwd(threadId) || getFallbackSessionCwd();

if (planFile && shareWalkthrough) {
  const planFilePath = resolve(sessionCwd, planFile);
  if (!existsSync(planFilePath) || !/\.md$/i.test(planFilePath)) {
    process.stderr.write(`open-codiff: plan file not found at ${planFilePath}.\n`);
    process.exit(1);
  }
  const shareCommand = getShareCommand();
  const shareResult = spawnSync(
    shareCommand.command,
    [
      ...shareCommand.args,
      '--plan',
      planFilePath,
      '--agent',
      'claude',
      ...(threadId ? ['--claude-session', threadId] : []),
      ...(openSharedWalkthrough ? ['--open'] : []),
      ...forwardedArgs,
    ],
    { cwd: sessionCwd, encoding: 'utf8' },
  );
  if (shareResult.stdout) {
    process.stdout.write(shareResult.stdout);
  }
  if (shareResult.stderr) {
    process.stderr.write(shareResult.stderr);
  }
  if (shareResult.error) {
    process.stderr.write(`${shareResult.error.message}\n`);
    process.exit(1);
  }
  process.exit(shareResult.status ?? 0);
}

if (planFile) {
  const planFilePath = resolve(sessionCwd, planFile);
  if (!existsSync(planFilePath) || !/\.md$/i.test(planFilePath)) {
    process.stderr.write(`open-codiff: plan file not found at ${planFilePath}.\n`);
    process.exit(1);
  }
  const codiffCommand = getCodiffCommand();
  const result = spawnSync(
    codiffCommand.command,
    [
      ...codiffCommand.args,
      '--plan',
      planFilePath,
      '--agent',
      'claude',
      ...(threadId ? ['--claude-session', threadId] : []),
      ...forwardedArgs,
    ],
    { cwd: sessionCwd, encoding: 'utf8', stdio: 'inherit' },
  );
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

if (!walkthroughFile && shareWalkthrough) {
  process.stderr.write('open-codiff: missing --file <path> to the walkthrough JSON.\n');
  process.exit(1);
}

const walkthroughFilePath = walkthroughFile ? resolve(sessionCwd, walkthroughFile) : '';
if (walkthroughFilePath && !existsSync(walkthroughFilePath)) {
  process.stderr.write(`open-codiff: walkthrough file not found at ${walkthroughFilePath}.\n`);
  process.exit(1);
}

if (shareWalkthrough) {
  const shareCommand = getShareCommand();
  const shareResult = spawnSync(
    shareCommand.command,
    [
      ...shareCommand.args,
      '--file',
      walkthroughFilePath,
      '--agent',
      'claude',
      ...(openSharedWalkthrough ? ['--open'] : []),
      ...forwardedArgs,
    ],
    {
      cwd: sessionCwd,
      encoding: 'utf8',
    },
  );
  if (shareResult.stdout) {
    process.stdout.write(shareResult.stdout);
  }
  if (shareResult.stderr) {
    process.stderr.write(shareResult.stderr);
  }
  if (shareResult.error) {
    process.stderr.write(`${shareResult.error.message}\n`);
    process.exit(1);
  }
  process.exit(shareResult.status ?? 0);
}

const hasRepositoryTarget = forwardedArgs.some(
  (arg) => !arg.startsWith('-') && existsSync(resolve(sessionCwd, arg)),
);

const createCommentQueue = () => {
  const queuePath = join(mkdtempSync(join(tmpdir(), 'codiff-comments-')), 'comments.txt');
  writeFileSync(queuePath, '');
  return queuePath;
};

const commentQueue = process.env.HERDR_PANE_ID ? '' : createCommentQueue();
const agentTarget = process.env.HERDR_PANE_ID || commentQueue;

const codiffCommand = getCodiffCommand();
const args = [
  ...codiffCommand.args,
  ...(walkthroughFilePath ? ['-w'] : []),
  '--agent',
  'claude',
  ...(walkthroughFilePath ? ['--walkthrough-file', walkthroughFilePath] : []),
  ...(threadId ? ['--claude-session', threadId] : []),
  '--agent-target',
  agentTarget,
  ...forwardedArgs,
  ...(hasRepositoryTarget ? [] : [sessionCwd]),
];
const result = spawnSync(codiffCommand.command, args, {
  encoding: 'utf8',
  stdio: 'inherit',
});

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}

if (commentQueue && result.status === 0) {
  const monitor = [process.execPath, import.meta.filename, '--watch-comments', commentQueue]
    .map(shellQuote)
    .join(' ');
  process.stdout.write(
    `CODIFF_COMMENT_QUEUE ${JSON.stringify({ monitor, queue: commentQueue })}\n`,
  );
}

process.exit(result.status ?? 0);
