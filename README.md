# obsidian-mission-control

**Turn your Obsidian vault into a mission control for Claude Code.**

Your vault briefs Claude at the start of every session — project status, open tasks, past decisions. Claude writes back during and after sessions — logging decisions, marking tasks done, writing structured summaries. Bidirectional. Automatic. No copy-pasting.

---

## What It Does

obsidian-mission-control is an MCP server that connects Claude Code to your Obsidian vault. When a session starts, Claude reads your project notes and task lists so it already knows where you left off. As you work, Claude writes decisions and progress back to the vault in real time. When the session ends, a structured summary note is written automatically to your Sessions/ folder.

It supports multiple vaults, the Tasks plugin format, Dataview DQL queries, and Canvas relationship files — so it works with how serious Obsidian users actually organize their knowledge.

---

## Why

Every Claude Code session starts blank. You spend the first few minutes re-explaining your project, pasting in context, reminding Claude what decisions were made last time. And when the session ends, anything Claude helped you figure out disappears unless you manually write it down.

obsidian-mission-control eliminates both problems. Your vault is the persistent memory layer that Claude reads from and writes to — automatically, every session.

---

## Features

- **Session briefing** — Claude loads project context automatically at session start. Status, open tasks, last session date, recent decisions.
- **Task sync** — reads and updates tasks in Tasks plugin format (`- [ ] task text`). Mark tasks complete from inside Claude.
- **Decision logging** — write key decisions back to session notes mid-conversation with a single command.
- **Project switching** — switch active project context mid-session with `/obsidian focus [project]`.
- **Multi-vault support** — configure multiple Obsidian vaults and switch between them.
- **Session summaries** — structured session notes written automatically to your vault's Sessions/ folder at wrap-up.
- **Dataview queries** — run LIST and TABLE Dataview DQL queries against your vault directly from Claude.
- **Canvas support** — read `.canvas` files to understand project relationships and visual maps.
- **Companion skill** — `/obsidian` slash commands for Claude Code for a polished, first-class experience.

---

## Install

**Step 1 — Install the MCP server globally:**

```bash
npm install -g obsidian-mission-control
```

**Step 2 — Add to your Claude Code settings** (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "obsidian-mission-control"
    }
  }
}
```

That's it. Restart Claude Code and your vault will brief Claude at the start of your next session.

---

## Configuration

Create `~/.obsidian-mc.json` to configure your vaults and plugin preferences:

```json
{
  "vaults": {
    "main": "~/Documents/MyVault",
    "work": "~/Documents/WorkVault",
    "research": "~/Dropbox/Research"
  },
  "defaultVault": "main",
  "defaultProject": "Current Sprint",
  "structure": {
    "projectsFolder": "Projects",
    "sessionsFolder": "Sessions",
    "tasksFolder": "Tasks"
  },
  "plugins": {
    "tasks": true,
    "dataview": false,
    "templater": false
  }
}
```

| Key | Description | Default |
|-----|-------------|---------|
| `vaults` | Named map of vault paths | Required |
| `defaultVault` | Which vault to load on session start | First key |
| `defaultProject` | Default project note to brief from | None |
| `structure.projectsFolder` | Folder containing project notes | `Projects` |
| `structure.sessionsFolder` | Folder where session notes are written | `Sessions` |
| `structure.tasksFolder` | Folder for standalone task files | `Tasks` |
| `plugins.tasks` | Enable Tasks plugin format support | `false` |
| `plugins.dataview` | Enable Dataview DQL query support | `false` |
| `plugins.templater` | Enable Templater template awareness | `false` |

---

## Usage

### The Session Lifecycle

**Session start (automatic)**

When you open Claude Code, the MCP server silently loads your project briefing. Claude already knows your context before you type anything.

**During a session**

Use `/obsidian` commands at any time:

```
/obsidian
```

```
Project: obsidian-mission-control  [active]
Last session: 2026-04-04

Open tasks:
  1. Write README
  2. Publish to npm
  3. Add Templater support

Recent decisions:
  - Chose MCP over REST API for native Claude integration (2026-04-03)
  - Sessions stored as daily notes in Sessions/ folder (2026-04-02)
```

**Wrap up**

```
/obsidian wrap
```

Claude asks for a brief summary, then writes a structured session note to your vault:

```markdown
# Session: 2026-04-05

**Project:** obsidian-mission-control
**Duration:** ~90 min

## Summary
Completed README and skills file. Pushed to GitHub.

## Decisions
- MIT license confirmed
- npm publish target: obsidian-mission-control

## Tasks completed
- [x] Write README
- [x] Write skills/obsidian.md

## Tasks remaining
- [ ] Publish to npm
- [ ] Add Templater support
```

---

## MCP Tools

These tools are exposed over MCP and called automatically by Claude or via skill commands.

| Tool | Description |
|------|-------------|
| `obsidian_start_session` | Start a work session for a project — loads initial context |
| `obsidian_get_briefing` | Get full project briefing: status, tasks, last session, decisions |
| `obsidian_list_projects` | List all projects in the vault, optionally filtered by status |
| `obsidian_focus_project` | Switch active project context to a different project |
| `obsidian_get_tasks` | Get all open tasks for the current project |
| `obsidian_update_task` | Mark a task complete or update its text |
| `obsidian_log_decision` | Append a decision entry to the current session note |
| `obsidian_end_session` | End session — write summary note, update project status |
| `obsidian_query` | Run a Dataview DQL query (LIST or TABLE) against the vault |
| `obsidian_read_canvas` | Read an Obsidian `.canvas` file and return node/edge data |

---

## Skill Commands

Install the companion skill to get `/obsidian` slash commands in Claude Code.

Copy `skills/obsidian.md` from this repo to your Claude Code skills folder, then restart Claude Code.

| Command | Description |
|---------|-------------|
| `/obsidian` | Show current project briefing |
| `/obsidian focus [project]` | Switch to a different project |
| `/obsidian tasks` | Show all open tasks as a checklist |
| `/obsidian log [decision]` | Log a decision to the current session note |
| `/obsidian vault [name]` | Switch to a different configured vault |
| `/obsidian wrap` | End session and write summary to vault |

---

## Vault Structure

The default folder structure created/expected in your vault:

```
YourVault/
  Projects/
    My Project.md        ← project note (status, description, metadata)
  Sessions/
    2026-04-05.md        ← session note written by obsidian_end_session
    2026-04-04.md
  Tasks/
    My Project Tasks.md  ← optional standalone task file
```

### Project Note Format

Project notes use frontmatter for structured data:

```markdown
---
status: active
last_session: 2026-04-04
tags: [project]
---

# My Project

Project description here.

## Tasks
- [ ] Open task one
- [ ] Open task two
- [x] Completed task

## Decisions
- Chose approach X because Y (2026-04-03)
```

All folders are configurable via `~/.obsidian-mc.json`. You can point the server at any existing vault structure.

---

## Plugin Compatibility

| Plugin | Status | Notes |
|--------|--------|-------|
| **Tasks** | Supported | Reads/writes `- [ ]` and `- [x]` format, including due dates and priorities |
| **Dataview** | Supported | Run DQL LIST and TABLE queries via `obsidian_query` |
| **Templater** | Aware | Recognizes Templater syntax in notes; does not execute templates |
| **Canvas** | Supported | Reads `.canvas` JSON files, returns node and edge data |

Dataview and Templater support must be enabled in `~/.obsidian-mc.json`.

---

## Contributing

Contributions are welcome. Open an issue to discuss a feature before submitting a PR.

```bash
git clone https://github.com/iivqs/obsidian-mission-control
cd obsidian-mission-control
npm install
npm run dev
```

The MCP server entry point is `src/server.ts`. Tools are defined in `src/tools/`. Build with `npm run build`.

Please keep PRs focused — one feature or fix per PR. Include a brief description of what changed and why.

---

## License

MIT. See [LICENSE](LICENSE).

---

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk).
