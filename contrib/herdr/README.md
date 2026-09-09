# Herdr bridge for Codiff review comments

`herdr-comment` takes one review comment and pastes it into the input of a Claude Code agent
running in [Herdr](https://herdr.dev). Codiff calls it through the `commentCommand` setting, so a
comment left on a walkthrough lands in the session that opened it.

## Requirements

- `herdr` on PATH, with an agent running in the repository you are reviewing.
- `jq` and `git`.
- Codiff built from this fork, which adds `commentCommand` and `--agent-target`.

## Install

```bash
ln -s "$(pwd)/contrib/herdr/herdr-comment" ~/.local/bin/herdr-comment
```

Then add the command to `~/.codiff/codiff.jsonc`:

```jsonc
"commentCommand": "herdr-comment --file {file} --line {line} --end {endLine} --snippet {snippet} --pane {target} --send"
```

Drop `--send` if you prefer comments to accumulate in the agent's input box so you can submit
several in one turn.

## How a comment is routed

1. `{target}` is the Herdr pane Codiff was launched from. The bundled `codiff` skill forwards
   `HERDR_PANE_ID` as `--agent-target` automatically. A pane that no longer hosts an agent in the
   repository is ignored.
2. Otherwise, the agent whose working directory is inside the file's git worktree. When several
   match, the focused one wins; pass `--agent <name>` to pick one by its pane title.

The pasted block is the repo-relative path with the line range, the anchored source lines, and the
comment body.

## Usage

```
herdr-comment --file <path> --line <n> [--end <n>] [--snippet <code>] [--pane <w:p>] [--agent <name>]
              [--send] [--focus] [--dry-run] [--text <comment>]
```

`--text` takes every remaining argument, so it must come last. Without it the comment is read
from stdin, which is how Codiff passes the body. `--dry-run` prints the resolved pane and the
payload instead of sending.

Exit codes: 0 sent, 1 usage or resolution error, 2 Herdr call failed. Codiff shows the first line of
stderr in a toast when the command fails and leaves the comment unsent.
