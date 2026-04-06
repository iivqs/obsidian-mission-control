"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveSession = getActiveSession;
exports.setActiveSession = setActiveSession;
exports.startSession = startSession;
exports.endSession = endSession;
const path_1 = __importDefault(require("path"));
const multi_1 = require("../vault/multi");
const reader_1 = require("../vault/reader");
// Module-level active session state
let activeSession = null;
function getActiveSession() {
    return activeSession;
}
function setActiveSession(session) {
    activeSession = session;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function today() {
    return new Date().toISOString().split('T')[0];
}
/**
 * Build a Project from a parsed markdown file entry.
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
 * Extract open tasks from a project body (lines containing `- [ ]`).
 */
function extractOpenTasks(body) {
    return body
        .split('\n')
        .filter((line) => /- \[ \]/.test(line))
        .map((line) => line.replace(/^[\s-]*\[ \]\s*/, '').trim())
        .filter(Boolean);
}
/**
 * Default session note template.
 */
function defaultTemplate(date, projectName, vaultName) {
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
async function startSession(input) {
    const projectName = input['project'];
    const vaultName = input['vault'];
    // 1. Resolve vault and structure
    const manager = await (0, multi_1.getVaultManager)();
    const vaultConfig = manager.getVaultConfig(vaultName);
    const structure = await manager.getVaultStructure(vaultConfig.name);
    // 2. Find the project
    const projectsDir = path_1.default.join(vaultConfig.path, structure.projectsFolder);
    let projectFiles;
    try {
        projectFiles = await (0, reader_1.listMarkdownFiles)(projectsDir);
    }
    catch {
        projectFiles = [];
    }
    let selectedFilePath = null;
    let selectedFrontmatter = {};
    let selectedBody = '';
    if (projectName) {
        // Find by filename match (case-insensitive)
        const lower = projectName.toLowerCase();
        for (const fp of projectFiles) {
            const base = path_1.default.basename(fp, '.md').toLowerCase();
            if (base === lower || base.includes(lower)) {
                selectedFilePath = fp;
                break;
            }
        }
        // Also try matching against frontmatter name/title
        if (!selectedFilePath) {
            for (const fp of projectFiles) {
                try {
                    const { frontmatter, body } = await (0, reader_1.readMarkdownFile)(fp);
                    const fmName = (frontmatter['name'] ??
                        frontmatter['title'] ??
                        '').toLowerCase();
                    if (fmName === lower || fmName.includes(lower)) {
                        selectedFilePath = fp;
                        selectedFrontmatter = frontmatter;
                        selectedBody = body;
                        break;
                    }
                }
                catch {
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
    }
    else {
        // Find first project with status "Active"
        for (const fp of projectFiles) {
            try {
                const { frontmatter, body } = await (0, reader_1.readMarkdownFile)(fp);
                const status = frontmatter['status'] ?? '';
                if (status.toLowerCase() === 'active') {
                    selectedFilePath = fp;
                    selectedFrontmatter = frontmatter;
                    selectedBody = body;
                    break;
                }
            }
            catch {
                // skip
            }
        }
        if (!selectedFilePath) {
            return {
                content: [
                    {
                        type: 'text',
                        text: 'No active project found. Pass a project name or set status: Active in a project file.',
                    },
                ],
            };
        }
    }
    // Read the project file if we haven't already
    if (!selectedFrontmatter || Object.keys(selectedFrontmatter).length === 0) {
        const parsed = await (0, reader_1.readMarkdownFile)(selectedFilePath);
        selectedFrontmatter = parsed.frontmatter;
        selectedBody = parsed.body;
    }
    const project = buildProject(selectedFilePath, selectedFrontmatter, selectedBody, vaultConfig.name);
    // 3. Build session note path
    const date = today();
    const sessionFileName = `${date} ${project.name}.md`;
    const sessionsDir = path_1.default.join(vaultConfig.path, structure.sessionsFolder);
    const sessionNotePath = path_1.default.join(sessionsDir, sessionFileName);
    // 4. Determine note content (template or default)
    let noteContent;
    const templatesFolder = structure.templatesFolder;
    if (templatesFolder) {
        const templatePath = path_1.default.join(vaultConfig.path, templatesFolder, 'Session.md');
        if (await (0, reader_1.fileExists)(templatePath)) {
            const raw = await (0, reader_1.readMarkdownFile)(templatePath);
            // Replace common placeholders
            const rawStr = raw.frontmatter && Object.keys(raw.frontmatter).length > 0
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
        }
        else {
            noteContent = defaultTemplate(date, project.name, vaultConfig.name);
        }
    }
    else {
        noteContent = defaultTemplate(date, project.name, vaultConfig.name);
    }
    // 5. Write session note (append if it already exists for today)
    const alreadyExists = await (0, reader_1.fileExists)(sessionNotePath);
    if (alreadyExists) {
        await (0, reader_1.appendToFile)(sessionNotePath, `\n\n---\n_Session resumed at ${new Date().toISOString()}_\n`);
    }
    else {
        // writeMarkdownFile uses gray-matter stringify which reformats frontmatter —
        // write the raw templated content directly to preserve formatting.
        const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
        await fs.mkdir(sessionsDir, { recursive: true });
        await fs.writeFile(sessionNotePath, noteContent, 'utf-8');
    }
    // 6. Build SessionNote and set activeSession
    const sessionNote = {
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
    const taskLines = openTasks.length > 0
        ? openTasks.map((t) => `- [ ] ${t}`).join('\n')
        : '_No open tasks found in project file._';
    const lastSessionDisplay = project.lastSession ?? 'No previous sessions';
    const relativeNotePath = path_1.default.join(structure.sessionsFolder, sessionFileName);
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
async function endSession(input) {
    if (!activeSession) {
        throw new Error('No active session. Call obsidian_start_session first.');
    }
    const summary = input['summary'] ?? '';
    const decisions = input['decisions'] ?? [];
    const tasksDone = input['tasksDone'] ?? [];
    const { note, project } = activeSession;
    // 1. Build summary section
    const lines = [];
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
    await (0, reader_1.appendToFile)(note.filePath, lines.join('\n'));
    // 3. Update project frontmatter — set lastSession to today
    const date = today();
    const updatedFrontmatter = {
        ...project.frontmatter,
        lastSession: date,
    };
    await (0, reader_1.writeMarkdownFile)(project.filePath, updatedFrontmatter, project.body);
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
