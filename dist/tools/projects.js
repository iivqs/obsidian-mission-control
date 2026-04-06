"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBriefing = getBriefing;
exports.listProjects = listProjects;
exports.focusProject = focusProject;
const path_1 = __importDefault(require("path"));
const multi_1 = require("../vault/multi");
const reader_1 = require("../vault/reader");
const session_1 = require("./session");
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Build a Project object from a parsed markdown file.
 */
function buildProject(filePath, frontmatter, body, vaultName) {
    const name = frontmatter['name'] ??
        frontmatter['title'] ??
        path_1.default.basename(filePath, '.md');
    return {
        name,
        filePath,
        status: frontmatter['status'] ?? 'Unknown',
        lastSession: frontmatter['lastSession'],
        vault: vaultName,
        frontmatter,
        body,
    };
}
/**
 * Find a project file in projectsPath whose basename partially matches name
 * (case-insensitive). Returns the absolute file path or null.
 */
async function findProject(projectsPath, name) {
    let files;
    try {
        files = await (0, reader_1.listMarkdownFiles)(projectsPath);
    }
    catch {
        return null;
    }
    const lower = name.toLowerCase();
    // Prefer exact match first, then partial
    let partialMatch = null;
    for (const file of files) {
        const base = path_1.default.basename(file, '.md').toLowerCase();
        if (base === lower)
            return file;
        if (!partialMatch && base.includes(lower)) {
            partialMatch = file;
        }
    }
    return partialMatch;
}
/**
 * Extract open tasks from a markdown body. Returns Task objects.
 */
function extractOpenTasks(body, filePath) {
    const tasks = [];
    const lines = body.split('\n');
    lines.forEach((line, index) => {
        const match = line.match(/^(\s*)- \[ \]\s+(.+)$/);
        if (match) {
            const text = match[2].trim();
            const lineNumber = index + 1;
            const id = `${filePath}:${lineNumber}`;
            // Extract optional due date: 📅 YYYY-MM-DD or due:: YYYY-MM-DD
            const dueMatch = text.match(/📅\s*(\d{4}-\d{2}-\d{2})/) ?? text.match(/due::\s*(\d{4}-\d{2}-\d{2})/);
            const due = dueMatch ? dueMatch[1] : undefined;
            // Extract optional priority: ⏫ high, 🔼 medium, 🔽 low
            let priority;
            if (/⏫/.test(text))
                priority = 'high';
            else if (/🔼/.test(text))
                priority = 'medium';
            else if (/🔽/.test(text))
                priority = 'low';
            // Extract tags: #tag
            const tags = [...text.matchAll(/#([\w/-]+)/g)].map((m) => m[1]);
            tasks.push({
                id,
                text,
                completed: false,
                due,
                priority,
                tags: tags.length > 0 ? tags : undefined,
                filePath,
                lineNumber,
            });
        }
    });
    return tasks;
}
/**
 * Extract the last session summary from the project body.
 * Looks for ## Last Session or ## Summary sections.
 */
function extractLastSessionSummary(body) {
    // Match ## Last Session or ## Summary heading and capture content until the next heading
    const sectionRegex = /^##\s+(Last Session|Summary)\s*\n([\s\S]*?)(?=^##\s|\s*$)/im;
    const match = body.match(sectionRegex);
    if (match) {
        const content = match[2].trim();
        return content.length > 0 ? content : undefined;
    }
    return undefined;
}
/**
 * Sort projects: Active first, then In Progress, then rest alphabetically by status.
 */
const STATUS_ORDER = {
    active: 0,
    'in progress': 1,
    complete: 2,
    archived: 3,
    unknown: 4,
};
function statusRank(status) {
    return STATUS_ORDER[status.toLowerCase()] ?? 4;
}
/**
 * Format a BriefingResult as a human-readable string.
 */
function formatBriefing(briefing) {
    const { project, openTasks, lastSessionSummary, decisions } = briefing;
    const taskLines = openTasks.length > 0
        ? openTasks.map((t) => `- [ ] ${t.text}`).join('\n')
        : '_No open tasks found._';
    const lines = [
        `# Mission Control Briefing`,
        `**Project:** ${project.name}`,
        `**Status:** ${project.status}`,
        `**Vault:** ${project.vault}`,
        `**Last Session:** ${project.lastSession ?? 'Never'}`,
        ``,
        `## Open Tasks`,
        taskLines,
    ];
    if (lastSessionSummary) {
        lines.push(``, `## Last Session Summary`, lastSessionSummary);
    }
    if (decisions && decisions.length > 0) {
        lines.push(``, `## Recent Decisions`);
        for (const d of decisions) {
            lines.push(`- ${d}`);
        }
    }
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Exported tool functions
// ---------------------------------------------------------------------------
/**
 * obsidian_get_briefing — Get a full briefing for a project.
 * Returns status, open tasks, last session summary, recent decisions.
 */
async function getBriefing(input) {
    const projectName = input['project'];
    const vaultName = input['vault'];
    // 1. Resolve vault and structure
    const manager = await (0, multi_1.getVaultManager)();
    const vaultConfig = manager.getVaultConfig(vaultName);
    const structure = await manager.getVaultStructure(vaultConfig.name);
    const projectsPath = path_1.default.join(vaultConfig.path, structure.projectsFolder);
    // 2. Find the project file
    let filePath = null;
    if (projectName) {
        filePath = await findProject(projectsPath, projectName);
        if (!filePath) {
            return {
                content: [{ type: 'text', text: `Project "${projectName}" not found in ${structure.projectsFolder}/.` }],
            };
        }
    }
    else {
        // Fall back to active session's project
        const session = (0, session_1.getActiveSession)();
        if (session) {
            filePath = session.project.filePath;
        }
        else {
            return {
                content: [{ type: 'text', text: 'No project specified and no active session. Pass a project name or start a session first.' }],
            };
        }
    }
    // 3. Read the project file
    const { frontmatter, body } = await (0, reader_1.readMarkdownFile)(filePath);
    const project = buildProject(filePath, frontmatter, body, vaultConfig.name);
    // 4. Extract open tasks
    const openTasks = extractOpenTasks(body, filePath);
    // 5. Extract last session summary
    const lastSessionSummary = extractLastSessionSummary(body);
    // 6. Assemble and return
    const briefingResult = {
        project,
        openTasks,
        lastSessionSummary,
    };
    return {
        content: [{ type: 'text', text: formatBriefing(briefingResult) }],
    };
}
/**
 * obsidian_list_projects — List all projects in the vault.
 * If input.vault === "all", list across every configured vault.
 */
async function listProjects(input) {
    const vaultName = input['vault'];
    const statusFilter = input['status']?.toLowerCase();
    const manager = await (0, multi_1.getVaultManager)();
    // Determine which vaults to scan
    const vaultConfigs = vaultName === 'all'
        ? manager.listVaults()
        : [manager.getVaultConfig(vaultName)];
    const allProjects = [];
    for (const vaultConfig of vaultConfigs) {
        const structure = await manager.getVaultStructure(vaultConfig.name);
        const projectsPath = path_1.default.join(vaultConfig.path, structure.projectsFolder);
        let files;
        try {
            files = await (0, reader_1.listMarkdownFiles)(projectsPath);
        }
        catch {
            // Projects folder may not exist — skip silently
            continue;
        }
        for (const filePath of files) {
            try {
                const { frontmatter, body } = await (0, reader_1.readMarkdownFile)(filePath);
                const project = buildProject(filePath, frontmatter, body, vaultConfig.name);
                allProjects.push(project);
            }
            catch {
                // Skip unreadable files
            }
        }
    }
    // Apply optional status filter
    const filtered = statusFilter
        ? allProjects.filter((p) => p.status.toLowerCase() === statusFilter)
        : allProjects;
    // Sort: Active first, then In Progress, then rest
    filtered.sort((a, b) => {
        const rankDiff = statusRank(a.status) - statusRank(b.status);
        if (rankDiff !== 0)
            return rankDiff;
        return a.name.localeCompare(b.name);
    });
    if (filtered.length === 0) {
        const filterNote = statusFilter ? ` with status "${statusFilter}"` : '';
        return {
            content: [{ type: 'text', text: `No projects found${filterNote}.` }],
        };
    }
    // Format output
    const lines = ['# Projects', ''];
    for (const p of filtered) {
        const lastSess = p.lastSession ? ` | Last session: ${p.lastSession}` : '';
        const vaultNote = vaultName === 'all' ? ` (${p.vault})` : '';
        lines.push(`- **${p.name}**${vaultNote} — ${p.status}${lastSess}`);
    }
    return {
        content: [{ type: 'text', text: lines.join('\n') }],
    };
}
/**
 * obsidian_focus_project — Switch focus to a different project.
 * Updates the active session's project without ending the session.
 */
async function focusProject(input) {
    const projectName = input['project'];
    const vaultName = input['vault'];
    if (!projectName) {
        return {
            content: [{ type: 'text', text: 'A project name is required.' }],
        };
    }
    // 1. Resolve vault and structure
    const manager = await (0, multi_1.getVaultManager)();
    const vaultConfig = manager.getVaultConfig(vaultName);
    const structure = await manager.getVaultStructure(vaultConfig.name);
    const projectsPath = path_1.default.join(vaultConfig.path, structure.projectsFolder);
    // 2. Find the project file (case-insensitive partial match)
    const filePath = await findProject(projectsPath, projectName);
    if (!filePath) {
        return {
            content: [{ type: 'text', text: `Project "${projectName}" not found in ${structure.projectsFolder}/.` }],
        };
    }
    // 3. Read the project
    const { frontmatter, body } = await (0, reader_1.readMarkdownFile)(filePath);
    const project = buildProject(filePath, frontmatter, body, vaultConfig.name);
    // 4. Update active session's project (or create a lightweight session stub if none exists)
    const currentSession = (0, session_1.getActiveSession)();
    if (currentSession) {
        // Swap the project on the existing session, preserving the session note
        const updatedSession = {
            ...currentSession,
            project,
            vault: vaultConfig,
            structure,
        };
        (0, session_1.setActiveSession)(updatedSession);
    }
    else {
        // No active session — create a minimal one so future calls can find the project
        const today = new Date().toISOString().split('T')[0];
        (0, session_1.setActiveSession)({
            project,
            vault: vaultConfig,
            structure,
            note: {
                project: project.name,
                vault: vaultConfig.name,
                date: today,
                filePath: '',
                decisions: [],
                tasksDone: [],
            },
            startedAt: new Date(),
        });
    }
    // 5. Build and return briefing
    const openTasks = extractOpenTasks(body, filePath);
    const lastSessionSummary = extractLastSessionSummary(body);
    const briefingResult = {
        project,
        openTasks,
        lastSessionSummary,
    };
    return {
        content: [{ type: 'text', text: formatBriefing(briefingResult) }],
    };
}
