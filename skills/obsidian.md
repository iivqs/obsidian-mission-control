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

This skill connects Claude Code to your Obsidian vault bidirectionally. Your vault briefs Claude with project context, open tasks, and past decisions. Claude writes decisions and session summaries back to the vault so nothing is lost between conversations.

---

## Commands

### /obsidian

Load and show the current project briefing: status, open tasks, last session date, and recent decisions.

> Claude: call `obsidian_start_session` for the default project (omit the project argument so the server picks the active/default one). If that fails because no default project is configured, call `obsidian_list_projects` and ask the user which project to load. Once a session is started, call `obsidian_get_briefing` and display the result clearly: project name and status on the first line, open tasks as a numbered list, then last session info. Keep it scannable.

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

1. **Session starts** — run `/obsidian` to load your project briefing. Claude reads your status, open tasks, and last session summary.
2. **You work** — use `/obsidian log [decision]` to record key decisions mid-session. Use `/obsidian tasks` to review open work.
3. **Session ends** — `/obsidian wrap` writes a structured session note to `Sessions/` in your vault and updates the project's last-session date.

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

Restart Claude Code, then run `/obsidian` at the start of any session to load your vault briefing.
