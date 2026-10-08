# Codiff

> [!NOTE]
> **This is a fork of [nkzw-tech/codiff](https://github.com/nkzw-tech/codiff).** It adds one
> feature: review comments can be sent straight to a running coding agent instead of copied to the
> clipboard. It also never updates itself, since an upstream update would replace the fork. See
> [What this fork adds](#what-this-fork-adds).

Codiff is a beautiful, minimal, local diff viewer for reviewing Git changes and committing them.

<img width="48%" src="https://github.com/user-attachments/assets/9801587d-5879-461a-b375-9fbfa3c5f25d" />
<img width="48%" src="https://github.com/user-attachments/assets/8b92902b-1112-4553-ba59-74e84a61ca7d" />

## What this fork adds

Upstream Codiff lets you copy pending review comments as Markdown and paste them into an agent
yourself, and its **Ask** button starts a fresh one-off agent run. This fork adds a
`commentCommand` setting: when it is set and an agent session opened Codiff, **Ask** (or
<kbd>Mod</kbd>+<kbd>Enter</kbd>) runs that command with the comment's details, so the comment lands
in that session while you keep reviewing.

### How it works

1. An agent session opens Codiff with `--agent-target` (the bundled skills do this), and you write
   a comment on any review: a working tree, commit, branch, range, or pull request.
2. You click **Ask** or press <kbd>Mod</kbd>+<kbd>Enter</kbd>. **Comment** (or
   <kbd>Mod</kbd>+<kbd>Alt</kbd>+<kbd>Enter</kbd>) keeps upstream's behavior: it saves a local
   comment, or posts to GitHub or GitLab in a pull request review. Without `commentCommand` or an
   agent target, **Ask** is upstream's one-off agent reply.
3. Codiff runs your command once for that comment. The comment body is written to the command's
   stdin, and placeholders in the command string are filled in:

   | Placeholder | Value                                                             |
   | ----------- | ----------------------------------------------------------------- |
   | `{repo}`    | Absolute path of the repository root                              |
   | `{file}`    | Absolute path of the commented file                               |
   | `{path}`    | Repository-relative path of the commented file                    |
   | `{line}`    | First line of the comment's range                                 |
   | `{endLine}` | Last line of a range comment, or empty for a single line          |
   | `{side}`    | `additions` or `deletions`                                        |
   | `{snippet}` | The source lines the comment is anchored to (at most six)         |
   | `{body}`    | The comment text, trimmed. Also always written to stdin           |
   | `{target}`  | The value passed to `codiff --agent-target`, or empty (see below) |

4. On success the comment shows a **Sent** marker and will not be sent again. On failure Codiff
   shows the command's first line of stderr in a toast and leaves the comment unsent, so **Ask**
   retries it.

The command runs without a shell, so a multi-line body or snippet is safe in an argument. Empty
placeholders expand to an empty string.

### Configure it

Open `Codiff > Open Config File...` and add `commentCommand` under `settings` in
`~/.codiff/codiff.jsonc`. Any executable on your login shell's PATH works. Two examples:

```jsonc
{
  "settings": {
    // Append each comment to a file.
    "commentCommand": "sh -c \"cat >> /tmp/review-comments.md\"",
  },
}
```

```jsonc
{
  "settings": {
    // Send each comment to the Claude Code session that opened Codiff.
    "commentCommand": "codiff-comment --target {target} --file {file} --path {path} --line {line} --end {endLine} --snippet {snippet} --send",
  },
}
```

The second example uses [`contrib/codiff-comment`](contrib/codiff-comment). Put it on your PATH
(for example `ln -s "$PWD/contrib/codiff-comment" ~/.local/bin/`). It delivers to Claude Code in
any app, including Claude Desktop, and to sessions running in Herdr through
[`contrib/herdr`](contrib/herdr/README.md). Leave `commentCommand` empty (the default) to turn the
feature off.

The config file is watched, so the change applies to open windows without a restart. For editor
completion on the new key, point `$schema` at this fork instead of upstream:
`https://raw.githubusercontent.com/Michael-Berger/codiff/main/core/config/codiff-config.schema.json`.

### Tell the command where to send comments

`codiff` accepts a new flag, `--agent-target <string>`, and the matching environment variable
`CODIFF_AGENT_TARGET`. Codiff does not interpret the value; it is handed to your command as
`{target}`. Use it to identify the agent session that should receive the comments, for example the
terminal pane the review was launched from.

The bundled `codiff` skill for Claude Code sets the target for you:

- **In Herdr**, it forwards `HERDR_PANE_ID`, and `codiff-comment` pastes each comment into that
  pane.
- **Anywhere else** (Claude Desktop, an IDE, a plain terminal), it creates a comment queue file and
  passes its path. `codiff-comment` appends each comment to the file, and the skill has Claude
  watch it with the Monitor tool, so comments arrive while Claude keeps working. Closing the Codiff
  window ends the watch.

### Install the fork

Fork builds are not published, so you build it yourself. You need Node.js and pnpm
(`corepack enable pnpm`). If you installed upstream Codiff with Homebrew, run
`brew uninstall --cask codiff` first; your settings in `~/.codiff` are kept.

```bash
git clone https://github.com/Michael-Berger/codiff.git
cd codiff
contrib/install-fork
```

The script builds `Codiff.app` into `/Applications` (macOS on Apple Silicon), links `codiff`,
`codiff-comment`, and `herdr-comment` (when Herdr is installed) into `~/.local/bin`, installs the
Claude Code skill, and sets `commentCommand` unless you already have one. Pass `--no-app` to run
Codiff straight from the checkout instead. Other agents' skills install from the app's Install
Skill menu.

To check that the fork is the Codiff you are running, look for `-fork` in the version:
`codiff --version` prints something like `codiff v1.16.0-fork`, and Codiff > About Codiff shows
the same.

### Updates

The fork never checks for or installs updates: upstream releases would replace it and drop the
fork's changes. The `checkForUpdates` setting has no effect, the Check for Updates menu item is
gone, and `codiff update` exits with an error. To update, run `git pull` and then
`contrib/install-fork` again.

## Why Codiff

- **Fast Local Reviews:** Review and commit changes in any Git repository.
- **LLM Walkthroughs:** Run `codiff -w` to generate an optimized commit walkthrough.
- **Inline Review Comments:** Comment directly on GitHub pull requests and GitLab merge requests, or copy review comments as Markdown for follow-ups.
- **Lightweight Definition Navigation:** Mod/Ctrl-click an identifier to find likely local definitions without starting a language server.

## Download

Install with Homebrew:

```bash
brew install --cask nkzw-tech/tap/codiff
```

Download the latest Codiff app from [GitHub Releases](https://github.com/nkzw-tech/codiff/releases).

After installing the app, run `Codiff > Install Terminal Helper` to make the `codiff` command available in your shell.

## Command Line

```bash
codiff
```

Run it from any Git repository, or pass a path:

```bash
codiff /path/to/repository
```

Review a specific commit:

```bash
codiff a1b2c3d
```

Review the current branch against a target branch:

```bash
codiff main
```

Review a GitHub pull request or GitLab merge request using the current repository remote:

```bash
codiff pr 75
codiff pr owner:my-feature-branch
codiff mr 23
```

Branch lookup uses `gh` and selects an open GitHub pull request. Include `owner:` for pull
requests from forks.

Full GitHub and GitLab review URLs are also supported. GitLab hosts and nested project paths are
derived from the URL or local Git remote and authenticated through `glab`; Codiff does not require
instance-specific configuration.

Start with an LLM-generated narrative walkthrough. When generating a walkthrough without an
explicit target, Codiff uses local changes when present and falls back to `HEAD` when the working
tree is clean:

```bash
codiff -w
codiff -w a1b2c3d
```

When walkthrough sharing is available for your Git identity, generate and upload the same
walkthrough without opening Codiff. The same default applies to generated walkthroughs, and the
command prints the final URL:

```bash
codiff --share
codiff --share HEAD
```

Show all available options:

```bash
codiff --help
```

Codiff prints its own shell completions for bash, fish and zsh. They complete every flag, the
values those flags accept, and Git refs for the ref argument:

```bash
# bash, in ~/.bashrc
source <(codiff --completions bash)

# fish, in ~/.config/fish/completions/codiff.fish
codiff --completions fish | source

# zsh, on the fpath
codiff --completions zsh > ~/.zsh/completions/_codiff
```

Launching Codiff in multiple repositories opens a separate native window for each repository.

## Command Bar

Open the command bar with <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on macOS, or
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on other platforms. Type to filter commands, use
<kbd>Up</kbd>/<kbd>Down</kbd> to move through results, press <kbd>Enter</kbd> to run the selected
command, and press <kbd>Esc</kbd> to close it.

The command bar includes actions for common review workflows:

- Focus File Filter
- Find in Diffs
- Show File Tree, Show History, and Show Walkthrough
- Copy Review Comments
- Copy Review Comments and Close
- Toggle Viewed for the currently selected file
- Toggle Diff Layout, with the target layout action shown as the hint
- Open the currently selected file in your editor
- Toggle Sidebar
- Reload Window

## Configuration

Codiff reads configuration from `~/.codiff/codiff.jsonc`. Open `Codiff > Open Config File...` to
create the file with defaults and open it in your editor. The file supports JSONC comments and
trailing commas, includes a JSON schema reference for editor completion, and is watched while Codiff
is running so changes apply to open windows.

Set `settings.showWhitespace` to `true` to show whitespace-only changes in diffs and file line
counts; when it is `false`, Codiff hides those changes from the working-tree review state.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/nkzw-tech/codiff/main/core/config/codiff-config.schema.json",
  "settings": {
    "agentBackend": "codex",
    "claudeModel": "claude-sonnet-4-6",
    "codeFontFamily": "",
    "codeFontSize": 13,
    "commentCommand": "",
    "copyCommentsOnClose": false,
    "diffStyle": "split",
    "editorCommand": "",
    "lastRepositoryPath": "",
    "openAIModel": "gpt-5.6-terra",
    "openAIReasoningEffort": "",
    "opencodeModel": "opencode-default",
    "sidebarPosition": "left",
    "showWhitespace": false,
    "theme": "system",
    "walkthroughPrompt": "",
    "wordWrap": false,
  },
  "keymap": {
    "commandBar": "Mod+k",
    "diffSearch": "Mod+f",
    "fileFilter": "Mod+p",
    "nextSearchMatch": "Enter",
    "openFile": "Mod+Shift+o",
    "prevSearchMatch": "Shift+Enter",
    "closeSearch": "Escape",
    "submitComment": "Mod+Alt+Enter",
    "askAgent": "Mod+Enter",
    "discardComment": "Escape",
    "toggleSidebar": "Mod+Shift+b",
  },
}
```

Set `settings.editorCommand` to customize file opening. Use `{file}` for the selected file,
`{line}` for its line number when available, and `{repo}` for the repository root, for example
`"subl \"{repo}\" \"{file}\""`.
Set `settings.commentCommand` to send a review comment to the agent session that opened Codiff
with **Ask**; see [What this fork adds](#what-this-fork-adds) for the
placeholders it accepts.
Set `settings.sidebarPosition` to `left` or `right` to choose which side of the desktop window shows
the file sidebar.

Choose `View > Diff > Split` or `View > Diff > Unified`, use Toggle Diff Layout in the command bar,
or set `settings.diffStyle` to `split` for side-by-side diffs or `unified` for unified diffs.
Choose `View > Diff > Word Wrap`, use Toggle Word Wrap in the command bar, or set
`settings.wordWrap` to `true` to wrap long diff lines.
Choose `View > Diff > Expand Unchanged Lines` or set `settings.expandUnchanged` to `true` to show
full files instead of collapsing unchanged lines between hunks.
Choose `View > Diff > Font Size`, use the code font size commands in the command bar, or use
<kbd>Cmd/Ctrl</kbd>+<kbd>+</kbd>, <kbd>Cmd/Ctrl</kbd>+<kbd>-</kbd>, and
<kbd>Cmd/Ctrl</kbd>+<kbd>0</kbd> to change only diff and code rendering font size.
Set `settings.codeFontFamily` manually to an installed CSS font family name, for example
`"JetBrains Mono"` or `"SF Mono"`. Leave it empty to use Codiff's bundled mono stack.
Use `Mod` for <kbd>Cmd</kbd> on macOS and <kbd>Ctrl</kbd> on other platforms. Shortcut strings can
combine `Mod`, `Ctrl`, `Alt`, `Shift`, or `Meta` with a key, for example `Mod+k` or
`Alt+Enter`.

## Walkthroughs

Codiff uses a local agent CLI for walkthroughs and inline review assistance. On the first launch
without an existing config file, it selects the first installed CLI in this order: Codex, Claude
Code, OpenCode, then Pi. This checks executable presence only and persists the selection. If none
are installed, Codiff keeps Codex as the default. After that, select a backend with the
`settings.agentBackend` config value (or the `--agent` flag for a single launch) and the `Agent`
application menu:

- `codex` (default) — the OpenAI Codex CLI, configured with `settings.openAIModel`.
- `claude` — the [Claude Code](https://claude.com/claude-code) CLI, configured with `settings.claudeModel`.
- `opencode` — the [OpenCode](https://opencode.ai/) CLI, configured with
  `settings.opencodeModel`.
- `pi` — the Pi CLI, using its configured default model.

The Codex `Model` and `Reasoning Effort` menus load the installed CLI's model catalog in the
background. They offer its visible models and supported reasoning efforts, including new models
without a Codiff update. Legacy models omitted from a successful catalog, including GPT-5.5,
remain configurable by ID; a selected model missing from the catalog appears as a custom choice.
If discovery fails or an older CLI does not support it, the predefined model choices remain
available, and selecting Codex or changing configuration retries discovery. Custom model IDs in
`settings.openAIModel` are also accepted.

Set `settings.openAIReasoningEffort` to an effort supported by your selected model, for example
`"high"` with `settings.openAIModel` set to `"gpt-6.1-sol"`. Selecting a different model in the menu
resets an explicit effort that the new model does not advertise. Leave the effort empty to keep
Codiff's existing defaults for its predefined models and inherit Codex settings for other models.
An unsupported explicit effort reports an error rather than triggering a model fallback.
An explicit effort also applies to a fallback model; clear it to use that model's default.
Walkthrough caches distinguish explicit reasoning efforts, so a new generation request with a
different effort does not reuse the previous effort's result.

Codex walkthroughs still default to GPT-5.6 Terra with low reasoning. GPT-5.6 Sol and Luna use
medium reasoning unless you override it. If a selected model is unavailable, Codiff retries with
Terra when applicable and then GPT-5.5, persisting the first model that succeeds unless you changed
the selection during the run. Walkthroughs with at least 100 reviewable hunks use GPT-5.5 with low
reasoning when Terra is the configured default and no explicit effort is configured. An explicit
effort keeps the selected model for these large walkthroughs.

Install the backend you want and verify it is available before using `codiff -w`:

```bash
codex --version
claude --version
opencode --version
pi --version
```

Codiff looks for the CLI on `PATH` and the usual install locations. On macOS, it also recognizes
the CLI embedded in `Codex.app` or `ChatGPT.app` under `/Applications` or `~/Applications`. It does
not run your shell startup files to discover CLIs. If a CLI is installed somewhere else, launch
Codiff with an explicit path:

```bash
CODIFF_CODEX_PATH=/absolute/path/to/codex codiff -w
CODIFF_CLAUDE_PATH=/absolute/path/to/claude codiff --agent claude -w
CODIFF_OPENCODE_PATH=/absolute/path/to/opencode codiff --agent opencode -w
CODIFF_PI_PATH=/absolute/path/to/pi codiff --agent pi -w
```

Claude Code rides your existing `claude` login (subscription or `ANTHROPIC_API_KEY`); run `claude`
once and complete `/login` if you have not already.

OpenCode keeps its own configured model when `settings.opencodeModel` is `opencode-default`.
Choose another model from the application `Model` menu, or set a provider-qualified id such as
`anthropic/claude-sonnet-4-6`, `openai/gpt-5.5`, or another model available to your OpenCode
account. When Codiff launches OpenCode for walkthroughs or review assistance and an explicit model
is unavailable, it retries with OpenCode's configured default and persists that fallback. The
managed `/codiff` command runs directly in OpenCode, so OpenCode reports access errors for its
selected model; choose `opencode-default` when portability is more important than pinning.

Set `settings.walkthroughPrompt` to add custom instructions to generated walkthrough prompts. Use it
to request a specific language, tone, or level of detail while Codiff keeps its walkthrough guide,
hunk ids, review-order constraints, and JSON schema in place.

To drive Codiff from your agent, install its integration from the application menu under
`Install Skill`, then choose Codex, Claude Code, Pi, or OpenCode. Codiff updates keep the installed
skill current. The OpenCode integration also installs a managed `/codiff` command that uses
`settings.opencodeModel`; choosing `opencode-default` leaves the command unpinned. Invoke it from
the agent:

```text
$codiff       /codiff        # author a narrative walkthrough and open Codiff
```

In OpenCode, `/codiff` uses the model selected in Codiff while `$codiff` runs as part of the
current session and therefore uses that session's active model.

`codiff` asks Codiff for the current authoring guide (`codiff --walkthrough-guide`), writes a
narrative walkthrough JSON to a temporary file, and opens Codiff on it with `--walkthrough-file`
plus the current session id. Because the guidance lives in Codiff, the installed skill stays a thin
shim while the walkthrough sees the original conversation context without a lossy summary handoff.

## Development

```bash
vp install
vp build
vpr codiff
```

For live development:

```bash
vpr dev
ELECTRON_RENDERER_URL=http://127.0.0.1:5173 vpr electron
```

To try lightweight Mod/Ctrl-click definition navigation against a deterministic temporary Git
repository, run `vpr example:definition-navigation`. See the
[definition navigation example](examples/definition-navigation/README.md) for the expected flow.

Useful checks:

```bash
vp check
vp test
vp build
```

Run `vpr test:integration` to build and test the public sharing service in the local
Cloudflare Workers runtime. The `test` workspace uses Vitest 4.1 for compatibility
with `@cloudflare/vitest-plugin`; the main test suite uses Vitest 5.

## Contributing

Found an issue, or want to improve something? See the
[contributing guide](CONTRIBUTING.md) for local application and public web
service setup.
