import type { FileDiffLoadedFiles } from '@pierre/diffs';

const hunkHeaderPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

type SubsetHunk = {
  additionCount: number;
  additionStart: number;
  body: ReadonlyArray<string>;
  deletionCount: number;
  deletionStart: number;
  headerIndex: number;
};

const parseSubsetHunks = (lines: ReadonlyArray<string>) => {
  const hunks: Array<SubsetHunk> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = hunkHeaderPattern.exec(lines[index] ?? '');
    if (!match) {
      continue;
    }

    const deletionCount = Number(match[2] ?? 1);
    const additionCount = Number(match[4] ?? 1);
    const body: Array<string> = [];
    let oldRemaining = deletionCount;
    let newRemaining = additionCount;
    let cursor = index + 1;
    while (cursor < lines.length) {
      const line = lines[cursor] ?? '';
      if (line.startsWith('\\')) {
        body.push(line);
      } else if (oldRemaining === 0 && newRemaining === 0) {
        break;
      } else {
        body.push(line);
        if (!line.startsWith('+')) {
          oldRemaining -= 1;
        }
        if (!line.startsWith('-')) {
          newRemaining -= 1;
        }
      }
      cursor += 1;
    }

    hunks.push({
      additionCount,
      additionStart: Number(match[3]),
      body,
      deletionCount,
      deletionStart: Number(match[1]),
      headerIndex: index,
    });
    index = cursor - 1;
  }
  return hunks.sort((a, b) => a.additionStart - b.additionStart);
};

const getSideStartIndex = (start: number, count: number) => (count === 0 ? start : start - 1);

// A stop showing some of a file's hunks diffs against the old file with every
// other hunk applied, so expanded context matches on both sides.
const getSubsetDeletionStarts = (hunks: ReadonlyArray<SubsetHunk>) => {
  const starts = new Map<SubsetHunk, number>();
  let offset = 0;
  for (const hunk of hunks) {
    const index = getSideStartIndex(hunk.additionStart, hunk.additionCount) - offset;
    starts.set(hunk, hunk.deletionCount === 0 ? index : index + 1);
    offset += hunk.additionCount - hunk.deletionCount;
  }
  return starts;
};

export const alignPatchToHunkSubset = (patch: string) => {
  const lines = patch.split('\n');
  for (const [hunk, start] of getSubsetDeletionStarts(parseSubsetHunks(lines))) {
    lines[hunk.headerIndex] = lines[hunk.headerIndex].replace(/^@@ -\d+/, `@@ -${start}`);
  }
  return lines.join('\n');
};

const splitContents = (contents: string) => {
  const hasFinalNewline = contents.endsWith('\n');
  const body = hasFinalNewline ? contents.slice(0, -1) : contents;
  if (body.length === 0) {
    return { hasFinalNewline, lines: hasFinalNewline ? [''] : [] };
  }
  return { hasFinalNewline, lines: body.split('\n') };
};

const revertSubsetHunks = (patch: string, newContents: string) => {
  const hunks = parseSubsetHunks(patch.split('\n'));
  const { hasFinalNewline, lines: newLines } = splitContents(newContents);
  const oldLines: Array<string> = [];
  let oldHasFinalNewline = hasFinalNewline;
  let cursor = 0;
  for (const hunk of hunks) {
    const start = getSideStartIndex(hunk.additionStart, hunk.additionCount);
    if (start < cursor || start > newLines.length) {
      return null;
    }
    oldLines.push(...newLines.slice(cursor, start));
    cursor = start;

    let previous = '';
    let oldMissingNewline = false;
    let newMissingNewline = false;
    for (const line of hunk.body) {
      if (line.startsWith('\\')) {
        if (previous === '+') {
          newMissingNewline = true;
        } else {
          oldMissingNewline = true;
        }
        continue;
      }
      previous = line.startsWith('+') || line.startsWith('-') ? line[0] : ' ';
      if (line.startsWith('-')) {
        oldLines.push(line.slice(1));
        continue;
      }
      if (cursor >= newLines.length) {
        return null;
      }
      if (!line.startsWith('+')) {
        oldLines.push(newLines[cursor]);
      }
      cursor += 1;
    }
    if (oldMissingNewline) {
      oldHasFinalNewline = false;
    } else if (newMissingNewline) {
      oldHasFinalNewline = true;
    }
  }
  oldLines.push(...newLines.slice(cursor));
  return `${oldLines.join('\n')}${oldHasFinalNewline && oldLines.length > 0 ? '\n' : ''}`;
};

export const getHunkSubsetContents = (
  patch: string,
  files: FileDiffLoadedFiles,
  cacheKeySuffix: string,
): FileDiffLoadedFiles => {
  if (files.oldFile == null || files.newFile == null) {
    return files;
  }

  const contents = revertSubsetHunks(patch, files.newFile.contents);
  if (contents == null || contents === files.oldFile.contents) {
    return files;
  }

  return {
    ...files,
    oldFile: {
      ...files.oldFile,
      cacheKey:
        files.oldFile.cacheKey != null ? `${files.oldFile.cacheKey}:${cacheKeySuffix}` : undefined,
      contents,
    },
  };
};
