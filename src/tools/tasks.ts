import path from 'path';
import fs from 'fs/promises';
import { Task } from '../types';
import { readMarkdownFile, listMarkdownFiles, appendToFile, fileExists } from '../vault/reader';
import { getVaultManager } from '../vault/multi';
import { getActiveSession } from './session';

type ToolResult = { content: Array<{ type: string; text: string }> };

// ---------------------------------------------------------------------------
// Helper: parse a single task line into a Task object
// ---------------------------------------------------------------------------

function parseTaskLine(line: string, filePath: string, lineNumber: number): Task | null {
  // Match: - [ ] or - [x] or - [/]
  const match = line.match(/^(\s*)-\s+\[([x /])\]\s+(.+)$/);
  if (!match) return null;

  const completed = match[2] === 'x';
  let text = match[3];

  // Extract Tasks plugin metadata
  const due = text.match(/\[due::\s*([^\]]+)\]/)?.[1];
  const priority = text.match(/\[priority::\s*([^\]]+)\]/)?.[1];
  const tags = [...text.matchAll(/#(\w+)/g)].map((m) => m[1]);

  // Clean metadata from display text
  text = text.replace(/\[[a-z]+::[^\]]+\]/g, '').replace(/#\w+/g, '').trim();

  return {
    id: `${path.basename(filePath, '.md')}-L${lineNumber}`,
    text,
    completed,
    due,
    priority,
    tags,
    filePath,
    lineNumber,
  };
}

// ---------------------------------------------------------------------------
// Helper: parse all tasks from a body string (already-read file content)
// ---------------------------------------------------------------------------

function parseTasksFromBody(body: string, filePath: string): Task[] {
  const tasks: Task[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const task = parseTaskLine(lines[i], filePath, i + 1);
    if (task) tasks.push(task);
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// getTasks
// ---------------------------------------------------------------------------

/**
 * obsidian_get_tasks — Get tasks for the current project or specified scope.
 */
export async function getTasks(input: Record<string, unknown>): Promise<ToolResult> {
  const projectName = typeof input.project === 'string' ? input.project : undefined;
  const vaultName = typeof input.vault === 'string' ? input.vault : undefined;
  const includeCompleted = input.includeCompleted === true;

  try {
    // 1. Resolve vault + structure
    const manager = await getVaultManager();
    const vaultConfig = manager.getVaultConfig(vaultName);
    const structure = await manager.getVaultStructure(vaultConfig.name);

    const allTasks: Task[] = [];

    // 2. Find the target project file
    let projectFilePath: string | null = null;

    if (projectName) {
      // Look for a matching file in projectsFolder
      const projectsDir = path.join(structure.root, structure.projectsFolder);
      const projectFiles = await listMarkdownFiles(projectsDir);
      const match = projectFiles.find(
        (f) => path.basename(f, '.md').toLowerCase() === projectName.toLowerCase()
      );
      if (match) projectFilePath = match;
    } else {
      // Fall back to active session's project file
      const session = getActiveSession();
      if (session) {
        projectFilePath = session.project.filePath;
      }
    }

    // 3. Parse tasks from the project file
    if (projectFilePath && (await fileExists(projectFilePath))) {
      const { body } = await readMarkdownFile(projectFilePath);
      const projectTasks = parseTasksFromBody(body, projectFilePath);
      allTasks.push(...projectTasks);
    }

    // 4. Also scan the Tasks/ folder if it exists
    if (structure.tasksFolder) {
      const tasksDir = path.join(structure.root, structure.tasksFolder);
      const taskFiles = await listMarkdownFiles(tasksDir, false);
      for (const filePath of taskFiles) {
        try {
          const { body } = await readMarkdownFile(filePath);
          const fileTasks = parseTasksFromBody(body, filePath);
          allTasks.push(...fileTasks);
        } catch {
          // skip unreadable files
        }
      }
    }

    // 5. Filter by includeCompleted
    const filtered = includeCompleted ? allTasks : allTasks.filter((t) => !t.completed);

    if (filtered.length === 0) {
      return {
        content: [{ type: 'text', text: 'No tasks found.' }],
      };
    }

    // 6. Format output
    const lines = filtered.map((t) => {
      const checkbox = t.completed ? '[x]' : '[ ]';
      const due = t.due ? ` | due: ${t.due}` : '';
      const priority = t.priority ? ` | priority: ${t.priority}` : '';
      const tags = t.tags && t.tags.length > 0 ? ` | tags: ${t.tags.join(', ')}` : '';
      return `${checkbox} [${t.id}] ${t.text}${due}${priority}${tags}`;
    });

    return {
      content: [{ type: 'text', text: lines.join('\n') }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error fetching tasks: ${(err as Error).message}` }],
    };
  }
}

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------

/**
 * obsidian_update_task — Mark a task complete or update its status.
 */
export async function updateTask(input: Record<string, unknown>): Promise<ToolResult> {
  const id = typeof input.id === 'string' ? input.id : '';
  const status = typeof input.status === 'string' ? input.status : '';

  if (!id) {
    return { content: [{ type: 'text', text: 'Error: task id is required.' }] };
  }

  if (!['done', 'in-progress', 'open'].includes(status)) {
    return {
      content: [
        { type: 'text', text: 'Error: status must be one of: done, in-progress, open.' },
      ],
    };
  }

  try {
    // 1. Parse task ID: format is `filename-L42`
    const lineMatch = id.match(/-L(\d+)$/);
    if (!lineMatch) {
      return {
        content: [{ type: 'text', text: `Error: invalid task id format "${id}". Expected "filename-L<number>".` }],
      };
    }
    const lineNumber = parseInt(lineMatch[1], 10);
    const basename = id.slice(0, id.length - lineMatch[0].length); // filename without -L42

    // 2. Search for the file in project file + Tasks/ folder
    const manager = await getVaultManager();
    const vaultConfig = manager.getVaultConfig();
    const structure = await manager.getVaultStructure(vaultConfig.name);

    const candidatePaths: string[] = [];

    // Check active session's project file
    const session = getActiveSession();
    if (session) {
      const projBase = path.basename(session.project.filePath, '.md');
      if (projBase === basename) {
        candidatePaths.push(session.project.filePath);
      }
    }

    // Check projectsFolder
    const projectsDir = path.join(structure.root, structure.projectsFolder);
    const projectFiles = await listMarkdownFiles(projectsDir);
    for (const f of projectFiles) {
      if (path.basename(f, '.md') === basename) candidatePaths.push(f);
    }

    // Check Tasks/ folder
    if (structure.tasksFolder) {
      const tasksDir = path.join(structure.root, structure.tasksFolder);
      const taskFiles = await listMarkdownFiles(tasksDir);
      for (const f of taskFiles) {
        if (path.basename(f, '.md') === basename) candidatePaths.push(f);
      }
    }

    if (candidatePaths.length === 0) {
      return {
        content: [{ type: 'text', text: `Error: could not find file for task id "${id}".` }],
      };
    }

    // Use first match
    const filePath = candidatePaths[0];

    // 3. Read file as raw text (preserve frontmatter exactly)
    const raw = await fs.readFile(filePath, 'utf-8');
    const lines = raw.split('\n');

    if (lineNumber < 1 || lineNumber > lines.length) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: line number ${lineNumber} is out of range (file has ${lines.length} lines).`,
          },
        ],
      };
    }

    const targetLine = lines[lineNumber - 1];

    // 4. Verify it's actually a task line
    if (!/^(\s*)-\s+\[[ x/]\]/.test(targetLine)) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: line ${lineNumber} in "${path.basename(filePath)}" does not look like a task: ${targetLine}`,
          },
        ],
      };
    }

    // 5. Replace the checkbox marker
    const checkboxMap: Record<string, string> = {
      done: '[x]',
      'in-progress': '[/]',
      open: '[ ]',
    };
    const newCheckbox = checkboxMap[status];
    const updatedLine = targetLine.replace(/\[[ x/]\]/, newCheckbox);
    lines[lineNumber - 1] = updatedLine;

    // 6. Write the file back
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8');

    // Extract display text for confirmation
    const textMatch = updatedLine.match(/\[[ x/]\]\s+(.+)$/);
    const taskText = textMatch ? textMatch[1].replace(/\[[a-z]+::[^\]]+\]/g, '').replace(/#\w+/g, '').trim() : updatedLine.trim();

    return {
      content: [{ type: 'text', text: `Task updated: ${taskText} → ${status}` }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error updating task: ${(err as Error).message}` }],
    };
  }
}

// ---------------------------------------------------------------------------
// logDecision
// ---------------------------------------------------------------------------

/**
 * obsidian_log_decision — Append a decision to the active session note.
 */
export async function logDecision(input: Record<string, unknown>): Promise<ToolResult> {
  const decision = typeof input.decision === 'string' ? input.decision.trim() : '';
  const projectName = typeof input.project === 'string' ? input.project : undefined;

  if (!decision) {
    return { content: [{ type: 'text', text: 'Error: decision text is required.' }] };
  }

  try {
    // 1. Get active session note path
    let notePath: string | null = null;

    const session = getActiveSession();
    if (session) {
      notePath = session.note.filePath;
    } else {
      // 2. No active session — try to find today's session note for the project
      const manager = await getVaultManager();
      const vaultConfig = manager.getVaultConfig();
      const structure = await manager.getVaultStructure(vaultConfig.name);

      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const sessionsDir = path.join(structure.root, structure.sessionsFolder);

      // List session notes and look for today's date + optional project match
      const sessionFiles = await listMarkdownFiles(sessionsDir);
      const candidates = sessionFiles.filter((f) => {
        const base = path.basename(f);
        const hasToday = base.includes(today);
        if (!hasToday) return false;
        if (projectName) return base.toLowerCase().includes(projectName.toLowerCase());
        return true;
      });

      if (candidates.length > 0) {
        notePath = candidates[0];
      }
    }

    if (!notePath) {
      return {
        content: [
          {
            type: 'text',
            text:
              'Error: no active session and no session note found for today. ' +
              'Start a session first with obsidian_start_session.',
          },
        ],
      };
    }

    // 3. Format the decision entry with current time
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const entry = `\n**Decision [${hh}:${mm}]:** ${decision}`;

    // 4. Append to the session note file
    await appendToFile(notePath, entry);

    return {
      content: [{ type: 'text', text: `Decision logged to ${notePath}` }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error logging decision: ${(err as Error).message}` }],
    };
  }
}
