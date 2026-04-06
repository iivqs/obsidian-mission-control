import path from 'path';
import { ActiveSession, Project, SessionNote } from '../types';
import { getVaultManager } from '../vault/multi';
import {
  readMarkdownFile,
  writeMarkdownFile,
  appendToFile,
  fileExists,
  listMarkdownFiles,
} from '../vault/reader';

type ToolResult = { content: Array<{ type: string; text: string }> };

// Module-level active session state
let activeSession: ActiveSession | null = null;

export function getActiveSession(): ActiveSession | null {
  return activeSession;
}

export function setActiveSession(session: ActiveSession | null): void {
  activeSession = session;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Build a Project from a parsed markdown file entry.
 */
function buildProject(
  filePath: string,
  frontmatter: Record<string, unknown>,
  body: string,
  vaultName: string
): Project {
  const name =
    (frontmatter['name'] as string | undefined) ??
    (frontmatter['title'] as string | undefined) ??
    path.basename(filePath, '.md');

  return {
    name,
    filePath,
    status: (frontmatter['status'] as string | undefined) ?? 'Unknown',
    lastSession: frontmatter['lastSession'] as string | undefined,
    vault: vaultName,
    frontmatter,
    body,
  };
}

/**
 * Extract open tasks from a project body (lines containing `- [ ]`).
 */
function extractOpenTasks(body: string): string[] {
  return body
    .split('\n')
    .filter((line) => /- \[ \]/.test(line))
    .map((line) => line.replace(/^[\s-]*\[ \]\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Default session note template.
 */
function defaultTemplate(date: string, projectName: string, vaultName: string): string {
  return `---
date: ${date}
project: ${projectName}
vault: ${vaultName}
---

# Session — ${date}: ${projectName}

## Context
[Auto-loaded at session start]

## Tasks
[Loaded from project tasks]

## Decisions

## Summary
`;
}

// ---------------------------------------------------------------------------
// startSession
// ---------------------------------------------------------------------------

/**
 * obsidian_start_session — Start a work session for a project.
 * Creates a session note in the vault and loads project context.
 */
export async function startSession(input: Record<string, unknown>): Promise<ToolResult> {
  const projectName = input['project'] as string | undefined;
  const vaultName = input['vault'] as string | undefined;

  // 1. Resolve vault and structure
  const manager = await getVaultManager();
  const vaultConfig = manager.getVaultConfig(vaultName);
  const structure = await manager.getVaultStructure(vaultConfig.name);

  // 2. Find the project
  const projectsDir = path.join(vaultConfig.path, structure.projectsFolder);
  let projectFiles: string[];
  try {
    projectFiles = await listMarkdownFiles(projectsDir);
  } catch {
    projectFiles = [];
  }

  let selectedFilePath: string | null = null;
  let selectedFrontmatter: Record<string, unknown> = {};
  let selectedBody = '';

  if (projectName) {
    // Find by filename match (case-insensitive)
    const lower = projectName.toLowerCase();
    for (const fp of projectFiles) {
      const base = path.basename(fp, '.md').toLowerCase();
      if (base === lower || base.includes(lower)) {
        selectedFilePath = fp;
        break;
      }
    }

    // Also try matching against frontmatter name/title
    if (!selectedFilePath) {
      for (const fp of projectFiles) {
        try {
          const { frontmatter, body } = await readMarkdownFile(fp);
          const fmName = (
            (frontmatter['name'] as string | undefined) ??
            (frontmatter['title'] as string | undefined) ??
            ''
          ).toLowerCase();
          if (fmName === lower || fmName.includes(lower)) {
            selectedFilePath = fp;
            selectedFrontmatter = frontmatter;
            selectedBody = body;
            break;
          }
        } catch {
          // skip unparseable files
        }
      }
    }

    if (!selectedFilePath) {
      return {
        content: [
          {
            type: 'text',
            text: `Project "${projectName}" not found in ${structure.projectsFolder}/.`,
          },
        ],
      };
    }
  } else {
    // Find first project with status "Active"
    for (const fp of projectFiles) {
      try {
        const { frontmatter, body } = await readMarkdownFile(fp);
        const status = (frontmatter['status'] as string | undefined) ?? '';
        if (status.toLowerCase() === 'active') {
          selectedFilePath = fp;
          selectedFrontmatter = frontmatter;
          selectedBody = body;
          break;
        }
      } catch {
        // skip
      }
    }

    if (!selectedFilePath) {
      return {
        content: [
          {
            type: 'text',
            text:
              'No active project found. Pass a project name or set status: Active in a project file.',
          },
        ],
      };
    }
  }

  // Read the project file if we haven't already
  if (!selectedFrontmatter || Object.keys(selectedFrontmatter).length === 0) {
    const parsed = await readMarkdownFile(selectedFilePath);
    selectedFrontmatter = parsed.frontmatter;
    selectedBody = parsed.body;
  }

  const project = buildProject(
    selectedFilePath,
    selectedFrontmatter,
    selectedBody,
    vaultConfig.name
  );

  // 3. Build session note path
  const date = today();
  const sessionFileName = `${date} ${project.name}.md`;
  const sessionsDir = path.join(vaultConfig.path, structure.sessionsFolder);
  const sessionNotePath = path.join(sessionsDir, sessionFileName);

  // 4. Determine note content (template or default)
  let noteContent: string;

  const templatesFolder = structure.templatesFolder;
  if (templatesFolder) {
    const templatePath = path.join(vaultConfig.path, templatesFolder, 'Session.md');
    if (await fileExists(templatePath)) {
      const raw = await readMarkdownFile(templatePath);
      // Replace common placeholders
      const rawStr =
        raw.frontmatter && Object.keys(raw.frontmatter).length > 0
          ? `---\n${Object.entries(raw.frontmatter)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')}\n---\n${raw.body}`
          : raw.body;

      noteContent = rawStr
        .replace(/{{date}}/gi, date)
        .replace(/{{DATE}}/g, date)
        .replace(/{{title}}/gi, project.name)
        .replace(/{{project}}/gi, project.name)
        .replace(/YYYY-MM-DD/g, date)
        .replace(/ProjectName/g, project.name)
        .replace(/vaultName/g, vaultConfig.name);
    } else {
      noteContent = defaultTemplate(date, project.name, vaultConfig.name);
    }
  } else {
    noteContent = defaultTemplate(date, project.name, vaultConfig.name);
  }

  // 5. Write session note (append if it already exists for today)
  const alreadyExists = await fileExists(sessionNotePath);
  if (alreadyExists) {
    await appendToFile(
      sessionNotePath,
      `\n\n---\n_Session resumed at ${new Date().toISOString()}_\n`
    );
  } else {
    // writeMarkdownFile uses gray-matter stringify which reformats frontmatter —
    // write the raw templated content directly to preserve formatting.
    const fs = await import('fs/promises');
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(sessionNotePath, noteContent, 'utf-8');
  }

  // 6. Build SessionNote and set activeSession
  const sessionNote: SessionNote = {
    project: project.name,
    vault: vaultConfig.name,
    date,
    filePath: sessionNotePath,
    decisions: [],
    tasksDone: [],
  };

  activeSession = {
    project,
    vault: vaultConfig,
    structure,
    note: sessionNote,
    startedAt: new Date(),
  };

  // 7. Build briefing string
  const openTasks = extractOpenTasks(selectedBody);
  const taskLines =
    openTasks.length > 0
      ? openTasks.map((t) => `- [ ] ${t}`).join('\n')
      : '_No open tasks found in project file._';

  const lastSessionDisplay = project.lastSession ?? 'No previous sessions';

  const relativeNotePath = path.join(structure.sessionsFolder, sessionFileName);

  const briefing = [
    `# Mission Control Briefing`,
    `**Project:** ${project.name}`,
    `**Status:** ${project.status}`,
    `**Vault:** ${vaultConfig.name}`,
    `**Session note:** ${relativeNotePath}`,
    ``,
    `## Open Tasks`,
    taskLines,
    ``,
    `## Last Session`,
    lastSessionDisplay,
  ].join('\n');

  return {
    content: [{ type: 'text', text: briefing }],
  };
}

// ---------------------------------------------------------------------------
// endSession
// ---------------------------------------------------------------------------

/**
 * obsidian_end_session — End the current work session.
 * Writes summary to the session note, updates project frontmatter lastSession date.
 */
export async function endSession(input: Record<string, unknown>): Promise<ToolResult> {
  if (!activeSession) {
    throw new Error('No active session. Call obsidian_start_session first.');
  }

  const summary = (input['summary'] as string | undefined) ?? '';
  const decisions = (input['decisions'] as string[] | undefined) ?? [];
  const tasksDone = (input['tasksDone'] as string[] | undefined) ?? [];

  const { note, project } = activeSession;

  // 1. Build summary section
  const lines: string[] = [];
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push(summary);

  if (decisions.length > 0) {
    lines.push('');
    lines.push('## Decisions Made');
    for (const d of decisions) {
      lines.push(`- ${d}`);
    }
  }

  if (tasksDone.length > 0) {
    lines.push('');
    lines.push('## Tasks Completed');
    for (const t of tasksDone) {
      lines.push(`- [x] ${t}`);
    }
  }

  lines.push('');

  // 2. Append to the session note
  await appendToFile(note.filePath, lines.join('\n'));

  // 3. Update project frontmatter — set lastSession to today
  const date = today();
  const updatedFrontmatter: Record<string, unknown> = {
    ...project.frontmatter,
    lastSession: date,
  };
  await writeMarkdownFile(project.filePath, updatedFrontmatter, project.body);

  // 4. Clear session state
  const notePath = note.filePath;
  activeSession = null;

  return {
    content: [
      {
        type: 'text',
        text: `Session ended. Summary written to ${notePath}`,
      },
    ],
  };
}
