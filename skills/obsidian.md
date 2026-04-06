---
name: obsidian
description: Turn your Obsidian vault into a mission control for Claude Code. Bidirectional sync between your vault and Claude sessions.
triggers:
  - /obsidian
  - /obsidian focus
  - /obsidian tasks
  - /obsidian log
  - /obsidian vault
  - /obsidian wrap
---

# Obsidian Mission Control

This skill connects Claude Code to your Obsidian vault bidirectionally. At the start of every session, your vault briefs Claude with project context, open tasks, and past decisions — automatically. As you work, Claude writes decisions and summaries back to your vault so nothing is ever lost between conversations.

No copy-pasting context. No re-explaining your project. Your vault and Claude stay in sync.

---

## Auto-Behavior

When a session begins, Claude automatically calls `obsidian_start_session` to load your current project briefing from the vault — status, open tasks, last session date, and recent decisions. This happens silently in the background; you do not need to trigger it.

When you use `/obsidian wrap` (or end the session naturally), Claude calls `obsidian_end_session` to write a structured summary back to your vault's Sessions/ folder and update the project note.

You do not need to manage any of this manually. It just works.

---

## Commands

### /obsidian

Show the current project briefing: status, open tasks, last session date, and recent decisions.

> Claude: call `obsidian_get_briefing` and format the result clearly. Show project name and status on the first line, then open tasks as a numbered list, then last session info and any logged decisions. Keep it scannable.

---

### /obsidian focus [project name]

Switch the active project context to a different project in your vault.

> Claude: call `obsidian_focus_project` with the project name provided by the user. After switching, call `obsidian_get_briefing` and display the new briefing so the user knows the switch worked. If no project name is given, call `obsidian_list_projects` and present the options.

---

### /obsidian tasks

Show all open tasks for the current project.

> Claude: call `obsidian_get_tasks` and format the results as a markdown checklist. Group by priority if priority metadata is present. If there are no open tasks, say so clearly and offer to check a different project.

---

### /obsidian log [decision text]

Log a decision to the current session note in your vault.

> Claude: call `obsidian_log_decision` with the decision text provided by the user. Confirm the decision was logged. If no text is provided, ask the user what decision they want to record before calling the tool.

---

### /obsidian vault [vault name]

Switch to a different configured vault.

> Claude: use the vault manager to switch to the named vault (refer to the configured vaults in `~/.obsidian-mc.json`). After switching, call `obsidian_start_session` and `obsidian_get_briefing` for the new vault's default project. Display the new briefing. If no vault name is given, list configured vaults from the config file.

---

### /obsidian wrap

End the current session: write a summary to your vault's Sessions/ folder and update the project note.

> Claude: if the user has not provided a summary, ask for a brief one — one to three sentences about what was accomplished. Then call `obsidian_end_session` with the summary. Confirm what was written and where. Mention any tasks that were completed during the session if known.

---

## Session Lifecycle

The full loop runs automatically in the background:

1. **Session starts** — `obsidian_start_session` loads your project context silently. Claude is already briefed before you type your first message.
2. **You work** — as tasks are completed and decisions are made, Claude calls `obsidian_update_task` and `obsidian_log_decision` in the background to keep your vault current.
3. **Session ends** — `/obsidian wrap` triggers `obsidian_end_session`, which writes a structured session note to `Sessions/` in your vault, updates the project's last-session date, and marks any completed tasks.

Your vault accumulates a living history of every Claude session: what was decided, what was built, what is still open.

---

## Setup

**Step 1 — Install the MCP server:**

```bash
npm install -g obsidian-mission-control
```

**Step 2 — Register the MCP server** (`~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "obsidian-mission-control"
    }
  }
}
```

**Step 3 — Configure your vault** (`~/.obsidian-mc.json`):

```json
{
  "vaults": {
    "main": "~/Documents/MyVault"
  },
  "defaultVault": "main",
  "plugins": {
    "tasks": true,
    "dataview": false,
    "templater": false
  }
}
```

That is all. On your next Claude Code session, your vault will brief Claude automatically.
