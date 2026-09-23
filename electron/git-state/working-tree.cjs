// @ts-check

const { readRepositoryChangeSignature } = require('../repository-watcher.cjs');
const {
  createSection,
  createSummary,
  fileSort,
  generatedDirectoryPathspecExcludes,
  generatedDirectoryPathspecs,
  getFingerprint,
  getGravatarHash,
  getWhitespaceDiffArgs,
  git,
  MAX_UNTRACKED_INITIAL_ITEMS,
  parseStatus,
  readFileStat,
  readGitImageFile,
  readIndexImageFile,
  readWorkingTreeImageFile,
  splitPatchByPath,
  validateRepositoryPath,
} = require('./common.cjs');

/**
 * @typedef {import('../../core/types.ts').ChangedFile} ChangedFile
 * @typedef {import('../../core/types.ts').DiffImageContentRequest} DiffImageContentRequest
 * @typedef {import('../../core/types.ts').DiffImageContentResult} DiffImageContentResult
 * @typedef {import('../../core/types.ts').DiffSection} DiffSection
 * @typedef {import('../../core/types.ts').DiffSectionContentRequest} DiffSectionContentRequest
 * @typedef {import('../../core/types.ts').RepositoryState} RepositoryState
 * @typedef {import('./common.cjs').StatusItem} StatusItem
 * @typedef {'staged' | 'unstaged'} WorkingTreeSectionKind
 */

/** @param {string} path */
const shouldEagerlyReadWorkingTreeContents = (path) => /\.md$/i.test(path);

/**
 * @param {string} repoRoot
 * @param {WorkingTreeSectionKind} kind
 * @param {{showWhitespace?: boolean}} [options]
 * @returns {Promise<Map<string, {binary: boolean; patch: string}>>}
 */
const readPatchMap = async (repoRoot, kind, options = {}) => {
  const whitespaceArgs = getWhitespaceDiffArgs(options);
  const args =
    kind === 'staged'
      ? ['diff', '--cached', '--patch', '--no-ext-diff', ...whitespaceArgs]
      : ['diff', '--patch', '--no-ext-diff', ...whitespaceArgs];
  return splitPatchByPath(await git(repoRoot, args));
};

/** @param {string} repoRoot @returns {Promise<Array<StatusItem>>} */
const listUntrackedItems = async (repoRoot) => {
  const rawFiles = await git(repoRoot, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    '.',
    ...generatedDirectoryPathspecExcludes,
  ]);
  const paths = rawFiles.split('\0').filter(Boolean).sort();
  /** @type {Array<StatusItem>} */
  const items = paths.slice(0, MAX_UNTRACKED_INITIAL_ITEMS).map((path) => ({
    path,
    staged: false,
    status: 'untracked',
    unstaged: true,
    untracked: true,
  }));

  if (paths.length > MAX_UNTRACKED_INITIAL_ITEMS) {
    const omitted = paths.length - MAX_UNTRACKED_INITIAL_ITEMS;
    items.push({
      directory: true,
      path: `Untracked files not shown (${omitted} more)`,
      staged: false,
      status: 'untracked',
      summary: createSummary(`${omitted} untracked files are not shown.`, {
        canLoad: false,
        fileCount: omitted,
        loadState: 'directory',
      }),
      unstaged: true,
      untracked: true,
    });
  }

  const rawDirectories = await git(repoRoot, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--directory',
    '-z',
    '--',
    ...generatedDirectoryPathspecs,
  ]);

  for (const path of rawDirectories.split('\0').filter(Boolean)) {
    items.push({
      directory: true,
      path: path.endsWith('/') ? path.slice(0, -1) : path,
      staged: false,
      status: 'untracked',
      unstaged: true,
      untracked: true,
    });
  }

  const unique = new Map();
  for (const item of items) {
    unique.set(item.path, item);
  }

  return [...unique.values()].sort(fileSort);
};

/**
 * @param {string} launchPath
 * @param {{eagerContents?: boolean; showWhitespace?: boolean}} [options]
 * @returns {Promise<RepositoryState>}
 */
const readWorkingTreeState = async (launchPath, options = {}) => {
  const repoRoot = (await git(launchPath, ['rev-parse', '--show-toplevel'])).trim();
  const [trackedStatus, untrackedItems] = await Promise.all([
    git(repoRoot, ['status', '--porcelain=v1', '-z', '-uno']),
    listUntrackedItems(repoRoot),
  ]);
  const status = [...parseStatus(trackedStatus), ...untrackedItems].sort(fileSort);
  const shouldUsePatchOnly = options.eagerContents === false;
  const [stagedPatches, unstagedPatches] = shouldUsePatchOnly
    ? await Promise.all([
        readPatchMap(repoRoot, 'staged', options),
        readPatchMap(repoRoot, 'unstaged', options),
      ])
    : [new Map(), new Map()];
  /** @type {Array<ChangedFile>} */
  const files = [];

  for (const item of status) {
    /** @type {Array<DiffSection>} */
    const sections = [];
    const patchOnly = shouldUsePatchOnly && !shouldEagerlyReadWorkingTreeContents(item.path);

    if (item.staged) {
      sections.push(
        await createSection(repoRoot, item, 'staged', {
          patch: stagedPatches.get(item.path),
          patchOnly,
          showWhitespace: options.showWhitespace,
        }),
      );
    }

    if (item.unstaged) {
      sections.push(
        await createSection(repoRoot, item, 'unstaged', {
          patch: item.status === 'conflicted' ? undefined : unstagedPatches.get(item.path),
          patchOnly,
          showWhitespace: options.showWhitespace,
        }),
      );
    }

    const fingerprint = getFingerprint(
      `${item.status}\n${item.oldPath || ''}\n${sections
        .map(
          (section) =>
            `${section.loadState || 'ready'}\n${section.binary ? 'binary' : 'text'}\n${
              section.patch
            }\n${section.summary?.reason || ''}\n${section.summary?.fingerprint || ''}\n${
              section.oldFile?.contents || ''
            }\n${section.newFile?.contents || ''}`,
        )
        .join('\n')}`,
    );

    files.push({
      fingerprint,
      oldPath: item.oldPath,
      path: item.path,
      sections,
      status: item.status,
    });
  }

  return {
    files,
    generatedAt: Date.now(),
    launchPath,
    root: repoRoot,
    source: {
      type: 'working-tree',
    },
  };
};

/** @param {string} repoRoot @param {string} path @returns {Promise<StatusItem>} */
const getStatusItemForPath = async (repoRoot, path) => {
  const trackedStatus = parseStatus(
    await git(repoRoot, ['status', '--porcelain=v1', '-z', '-uno']),
  );
  const trackedItem = trackedStatus.find((item) => item.path === path);
  if (trackedItem) {
    return trackedItem;
  }

  const stat = await readFileStat(repoRoot, path);
  return {
    directory: Boolean(stat?.isDirectory()),
    path,
    staged: false,
    status: 'untracked',
    unstaged: true,
    untracked: true,
  };
};

/** @param {string} launchPath @param {DiffSectionContentRequest} request */
const readDiffSectionContent = async (launchPath, request) => {
  const repoRoot = (await git(launchPath, ['rev-parse', '--show-toplevel'])).trim();
  const path = validateRepositoryPath(request.path);
  if (request.kind === 'commit' || request.source?.type === 'commit') {
    throw new Error('Lazy loading commit diffs is not supported.');
  }

  const item = await getStatusItemForPath(repoRoot, path);
  return createSection(repoRoot, item, /** @type {WorkingTreeSectionKind} */ (request.kind), {
    force: request.force,
    showWhitespace: request.showWhitespace,
  });
};

/**
 * @param {string} launchPath
 * @param {DiffImageContentRequest} request
 * @returns {Promise<DiffImageContentResult>}
 */
const readDiffImageContent = async (launchPath, request) => {
  try {
    const repoRoot = (await git(launchPath, ['rev-parse', '--show-toplevel'])).trim();
    const path = validateRepositoryPath(request.path);
    if (request.kind === 'commit' || request.source?.type === 'commit') {
      throw new Error('Commit image diffs are loaded through the commit reader.');
    }

    const item = await getStatusItemForPath(repoRoot, path);
    const oldPath = item.oldPath || item.path;
    const [oldImage, newImage] =
      request.kind === 'staged'
        ? await Promise.all([
            readGitImageFile(repoRoot, 'HEAD', oldPath),
            readIndexImageFile(repoRoot, item.path),
          ])
        : await Promise.all([
            item.untracked
              ? undefined
              : readIndexImageFile(repoRoot, item.path, item.conflictStage),
            readWorkingTreeImageFile(repoRoot, item.path),
          ]);

    if (!oldImage && !newImage) {
      return {
        reason: 'Codiff could not load either side of this image.',
        status: 'unavailable',
      };
    }

    return {
      ...(newImage ? { newImage } : {}),
      ...(oldImage ? { oldImage } : {}),
      status: 'ready',
    };
  } catch (error) {
    return {
      reason: error instanceof Error ? error.message : 'Codiff could not load this image.',
      status: 'unavailable',
    };
  }
};

/** @param {string} repoRoot @param {ReadonlyArray<string>} args */
const gitOrEmpty = async (repoRoot, args) => {
  try {
    return await git(repoRoot, args);
  } catch {
    return '';
  }
};

/** @param {string} launchPath */
const readGitIdentity = async (launchPath) => {
  const [configuredName, configuredEmail] = await Promise.all([
    gitOrEmpty(launchPath, ['config', '--get', 'user.name']),
    gitOrEmpty(launchPath, ['config', '--get', 'user.email']),
  ]);
  const email = configuredEmail.trim();
  const name = configuredName.trim();

  return {
    email,
    gravatarUrl: email
      ? `https://www.gravatar.com/avatar/${getGravatarHash(email)}?s=80&d=identicon`
      : undefined,
    name,
  };
};

module.exports = {
  readDiffSectionContent,
  readDiffImageContent,
  readGitIdentity,
  readRepositoryChangeSignature,
  readWorkingTreeState,
};
