# Claude Code — Default Skills Reference

> Skills are specialized capabilities built into Claude Code. They can be invoked explicitly with `/skill-name` or triggered automatically when Claude detects matching context.

---

## How Skills Work

| Invocation | Description |
|---|---|
| **Explicit** | Type `/skill-name` (or `/skill-name args`) in chat |
| **Auto-triggered** | Claude invokes the skill proactively when context matches |

---

## Skills Catalog

### `/init`
**Initialize project documentation**

Creates a `CLAUDE.md` file in the project root with codebase documentation — structure, conventions, how to run services, etc. Claude uses this file for context in every subsequent session.

- **When to use:** First time setting up a project with Claude Code
- **Trigger:** Explicit only
- **Output:** `CLAUDE.md` written to repo root

---

### `/session-start-hook`
**Configure a session startup hook**

Sets up a `SessionStart` hook in `.claude/settings.json` so that a shell script runs automatically whenever a Claude Code web session starts. Useful for installing dependencies, starting services, or validating environment state.

- **When to use:** Setting up a repository for Claude Code on the web
- **Trigger:** Explicit only
- **Output:** Hook entry added to `.claude/settings.json`

---

### `/update-config`
**Edit Claude Code settings and hooks**

Modifies `settings.json` or `settings.local.json` to configure automated behaviors, permissions, environment variables, and hooks. Use this for any "from now on…", "always…", or "when Claude does X…" type requests.

- **When to use:** Adding permissions, env vars, hooks, or automated behaviors
- **Trigger:** Auto (when you say "from now on…", "allow X", "whenever X") + Explicit
- **Examples:**
  - `"allow npm commands"`
  - `"set DEBUG=true"`
  - `"when Claude stops, show a summary"`

---

### `/run`
**Launch and interact with the project app**

Starts the project's app or server and observes it running — useful for confirming a change works in the real application, not just in tests. Looks for a project-specific launch skill first, then falls back to standard patterns (CLI, server, TUI, browser).

- **When to use:** "Run the app", "start the server", "confirm this change works"
- **Trigger:** Auto + Explicit

---

### `/verify`
**Verify a code change works end-to-end**

Runs the app and observes actual behavior to confirm that a fix or feature works as intended. Goes beyond type-checking and tests — it validates the golden path and edge cases.

- **When to use:** After a fix: "confirm this works", "verify the PR", "test the change"
- **Trigger:** Auto (after edits, when asked to confirm) + Explicit

---

### `/code-review`
**Review diff for bugs and quality issues**

Analyzes the current diff at a configurable effort level and reports correctness bugs, reuse opportunities, simplification candidates, and efficiency issues.

- **When to use:** Before committing or after a batch of edits
- **Trigger:** Auto (after code changes) + Explicit
- **Flags:**
  - `--comment` — post findings as inline PR comments
  - `--fix` — apply findings directly to the working tree
- **Effort levels:** `low`, `medium`, `high`, `max`

---

### `/simplify`
**Simplify and clean up changed code**

Reviews changed code specifically for reuse, simplification, efficiency, and "altitude" cleanups (removing unnecessary abstraction layers), then applies the fixes. Quality-focused only — does not hunt for bugs.

- **When to use:** After implementing a feature, before opening a PR
- **Trigger:** Auto + Explicit
- **Note:** Use `/code-review` for bug hunting; use `/simplify` for cleanup

---

### `/security-review`
**Security audit of pending changes**

Performs a focused security review of all changes on the current branch — checks for OWASP Top 10 vulnerabilities, secrets exposure, injection risks, auth issues, and more.

- **When to use:** Before pushing or merging any branch with sensitive changes
- **Trigger:** Explicit only

---

### `/review`
**Review a pull request**

Reviews a specific pull request end-to-end: reads the diff, checks for correctness, style, and potential issues, and summarizes findings.

- **When to use:** "Review PR #123", "check this pull request"
- **Trigger:** Explicit only

---

### `/deep-research`
**Multi-source fact-checked research report**

Fans out web searches, fetches sources, adversarially verifies claims, and synthesizes a cited report. Best for complex questions requiring up-to-date or cross-referenced information.

- **When to use:** Research questions that need breadth, depth, and citations
- **Trigger:** Explicit only
- **Usage:** `/deep-research <your question>`
- **Note:** For underspecified questions, Claude will ask 2–3 clarifying questions first

---

### `/claude-api`
**Claude API / Anthropic SDK reference**

Provides accurate, up-to-date reference for the Claude API: model IDs, pricing, parameters, streaming, tool use, MCP, agents, caching, token counting, and model migration.

- **When to use:** Any task involving Claude/Anthropic models, SDK usage, or LLM integration
- **Trigger:** Auto (when Anthropic, Claude, model names, or LLM-shaped tasks are mentioned) + Explicit
- **Note:** Never answers from memory — always fetches current data

---

### `/fewer-permission-prompts`
**Reduce permission dialog interruptions**

Scans session transcripts for common read-only Bash and MCP tool calls, then adds a prioritized allowlist to `.claude/settings.json` to suppress repeated prompts for safe operations.

- **When to use:** When you're being interrupted by too many permission dialogs
- **Trigger:** Explicit only
- **Output:** Allowlist entries added to `.claude/settings.json`

---

### `/keybindings-help`
**Customize keyboard shortcuts**

Guides you through modifying `~/.claude/keybindings.json` to rebind keys, add chord bindings, or change the submit key.

- **When to use:** "Rebind Ctrl+S", "add a chord shortcut", "change submit key"
- **Trigger:** Explicit only

---

### `/loop`
**Run a skill or prompt on a recurring interval**

Schedules a skill or prompt to execute repeatedly on a given interval. Useful for polling, periodic reviews, or babysitting long-running processes.

- **When to use:** "Check the deploy every 5 minutes", "keep running `/code-review`"
- **Trigger:** Explicit only
- **Usage:** `/loop <interval> <skill-or-prompt>` (default interval: 10 minutes)
- **Example:** `/loop 5m /code-review`

---

## Quick Reference

| Skill | Explicit | Auto | Primary Use |
|---|---|---|---|
| `/init` | ✓ | | Create CLAUDE.md |
| `/session-start-hook` | ✓ | | Setup startup hooks |
| `/update-config` | ✓ | ✓ | Settings, hooks, permissions |
| `/run` | ✓ | ✓ | Start the app |
| `/verify` | ✓ | ✓ | Confirm a fix works |
| `/code-review` | ✓ | ✓ | Bug + quality review |
| `/simplify` | ✓ | ✓ | Code cleanup |
| `/security-review` | ✓ | | Security audit |
| `/review` | ✓ | | PR review |
| `/deep-research` | ✓ | | Multi-source research |
| `/claude-api` | ✓ | ✓ | Anthropic API reference |
| `/fewer-permission-prompts` | ✓ | | Reduce permission dialogs |
| `/keybindings-help` | ✓ | | Keyboard customization |
| `/loop` | ✓ | | Recurring tasks |
