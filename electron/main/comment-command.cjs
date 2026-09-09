// @ts-check

const { execFile } = require('node:child_process');
const { resolve } = require('node:path');
const { validateRepositoryPath } = require('../git-state/common.cjs');
const { expandCommandPlaceholders, parseCommandTemplate } = require('./command-template.cjs');

/**
 * @typedef {{
 *   body: string;
 *   endLine?: number;
 *   line?: number;
 *   path: string;
 *   side?: 'additions' | 'deletions';
 *   snippet?: string;
 * }} SendCommentRequest
 * @typedef {{ok: true} | {error: string; ok: false}} SendCommentResult
 */

/**
 * @param {{absolutePath: string; repositoryFilePath: string; repositoryRoot: string; request: SendCommentRequest; target?: string}} options
 * @returns {Readonly<Record<string, string>>}
 */
const buildCommentPlaceholders = ({
  absolutePath,
  repositoryFilePath,
  repositoryRoot,
  request,
  target,
}) => ({
  body: request.body,
  endLine: request.endLine != null ? String(request.endLine) : '',
  file: absolutePath,
  line: request.line != null ? String(request.line) : '',
  path: repositoryFilePath,
  repo: repositoryRoot,
  side: request.side ?? '',
  snippet: request.snippet ?? '',
  target: target ?? '',
});

/** @param {string | undefined} text */
const getFirstNonEmptyLine = (text) =>
  text
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

/**
 * @param {{
 *   commentCommand: string;
 *   env?: NodeJS.ProcessEnv;
 *   repositoryRoot: string;
 *   request: SendCommentRequest;
 *   target?: string;
 * }} options
 * @returns {Promise<SendCommentResult>}
 */
const sendComment = ({ commentCommand, env = process.env, repositoryRoot, request, target }) =>
  new Promise((resolveResult) => {
    const [command, ...args] = parseCommandTemplate(commentCommand);
    if (!command) {
      resolveResult({ error: 'No comment command is configured.', ok: false });
      return;
    }

    /** @type {string} */
    let repositoryFilePath;
    try {
      repositoryFilePath = validateRepositoryPath(request.path);
    } catch (error) {
      resolveResult({ error: error instanceof Error ? error.message : String(error), ok: false });
      return;
    }

    const absolutePath = resolve(repositoryRoot, repositoryFilePath);
    const body = request.body.trim();
    const placeholders = buildCommentPlaceholders({
      absolutePath,
      repositoryFilePath,
      repositoryRoot,
      request: { ...request, body },
      target,
    });
    const expandedArgs = args.map((arg) => expandCommandPlaceholders(arg, placeholders));

    const child = execFile(
      command,
      expandedArgs,
      { cwd: repositoryRoot, env, windowsHide: true },
      (error, _stdout, stderr) => {
        if (error) {
          resolveResult({ error: getFirstNonEmptyLine(stderr) || error.message, ok: false });
          return;
        }

        resolveResult({ ok: true });
      },
    );

    // An EPIPE from a command that exits without reading stdin would crash the main process.
    child.stdin?.on('error', () => {});
    child.stdin?.end(body);
  });

module.exports = { sendComment };
