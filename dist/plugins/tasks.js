"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTaskLine = parseTaskLine;
exports.parseTasksFromContent = parseTasksFromContent;
exports.parseTasksFromFolder = parseTasksFromFolder;
exports.makeTaskId = makeTaskId;
exports.parseTaskId = parseTaskId;
exports.updateTaskInContent = updateTaskInContent;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const glob_1 = require("glob");
// Regex to match a task checkbox line
const TASK_LINE_RE = /^(\s*)-\s+\[([x /])\]\s+(.*)$/i;
// Emoji date patterns
const DUE_EMOJI_RE = /📅\s*(\d{4}-\d{2}-\d{2})/;
const COMPLETION_EMOJI_RE = /✅\s*(\d{4}-\d{2}-\d{2})/;
// Inline metadata: [due:: 2026-04-10]
const METADATA_RE = /\[(\w+)::\s*([^\]]+)\]/g;
// Tag pattern: #tag/subtag
const TAG_RE = /#([\w/]+)/g;
function todayISO() {
    return new Date().toISOString().slice(0, 10);
}
/**
 * Parse a single task line in Tasks plugin format.
 * Returns null if line is not a task.
 */
function parseTaskLine(line, filePath, lineNumber) {
    const match = TASK_LINE_RE.exec(line);
    if (!match)
        return null;
    const statusChar = match[2].toLowerCase(); // 'x', '/', or ' '
    const raw = match[3];
    const completed = statusChar === 'x';
    // Extract due date — emoji first, then inline metadata
    let due;
    const dueEmoji = DUE_EMOJI_RE.exec(raw);
    if (dueEmoji) {
        due = dueEmoji[1];
    }
    // Extract priority from emojis
    let priority;
    if (raw.includes('⏫')) {
        priority = 'high';
    }
    else if (raw.includes('🔼')) {
        priority = 'medium';
    }
    else if (raw.includes('🔽')) {
        priority = 'low';
    }
    // Extract inline metadata overrides
    let metaMatch;
    const metaRegex = new RegExp(METADATA_RE.source, 'g');
    while ((metaMatch = metaRegex.exec(raw)) !== null) {
        const key = metaMatch[1].toLowerCase();
        const value = metaMatch[2].trim();
        if (key === 'due')
            due = value;
        if (key === 'priority')
            priority = value;
    }
    // Extract tags
    const tags = [];
    let tagMatch;
    const tagRegex = new RegExp(TAG_RE.source, 'g');
    while ((tagMatch = tagRegex.exec(raw)) !== null) {
        tags.push(tagMatch[1]);
    }
    // Strip all metadata/emoji from text for clean display
    let text = raw
        .replace(DUE_EMOJI_RE, '')
        .replace(COMPLETION_EMOJI_RE, '')
        .replace(/[⏫🔼🔽🛒]/gu, '')
        .replace(new RegExp(METADATA_RE.source, 'g'), '')
        .replace(new RegExp(TAG_RE.source, 'g'), '')
        .trim();
    const task = {
        id: makeTaskId(filePath, lineNumber),
        text,
        completed,
        filePath,
        lineNumber,
    };
    if (due)
        task.due = due;
    if (priority)
        task.priority = priority;
    if (tags.length > 0)
        task.tags = tags;
    return task;
}
/**
 * Parse all tasks from file content string.
 */
function parseTasksFromContent(content, filePath) {
    const lines = content.split('\n');
    const tasks = [];
    lines.forEach((line, index) => {
        // lineNumber is 1-based
        const task = parseTaskLine(line, filePath, index + 1);
        if (task)
            tasks.push(task);
    });
    return tasks;
}
/**
 * Parse tasks from all .md files in a folder (recursive).
 */
async function parseTasksFromFolder(folderPath) {
    const files = await (0, glob_1.glob)('**/*.md', {
        cwd: folderPath,
        absolute: true,
        nodir: true,
    });
    const allTasks = [];
    for (const filePath of files) {
        try {
            const content = await promises_1.default.readFile(filePath, 'utf-8');
            const tasks = parseTasksFromContent(content, filePath);
            allTasks.push(...tasks);
        }
        catch {
            // Skip unreadable files
        }
    }
    return allTasks;
}
/**
 * Generate a stable task ID from file basename + line number.
 * Uses basename only to keep IDs portable across vault moves.
 */
function makeTaskId(filePath, lineNumber) {
    const basename = path_1.default.basename(filePath);
    return `${Buffer.from(basename).toString('base64url')}:${lineNumber}`;
}
/**
 * Parse a task ID back to { basename, lineNumber }.
 * Only returns basename; caller must resolve full path.
 */
function parseTaskId(id) {
    const colonIdx = id.lastIndexOf(':');
    const encodedBasename = id.slice(0, colonIdx);
    const lineStr = id.slice(colonIdx + 1);
    return {
        basename: Buffer.from(encodedBasename, 'base64url').toString('utf-8'),
        lineNumber: parseInt(lineStr, 10),
    };
}
/**
 * Update a task's status in a file content string.
 * Returns the modified content.
 * When marking done, appends a completion emoji and today's date.
 */
function updateTaskInContent(content, lineNumber, status) {
    const lines = content.split('\n');
    // lineNumber is 1-based
    const idx = lineNumber - 1;
    if (idx < 0 || idx >= lines.length)
        return content;
    const line = lines[idx];
    const checkboxRe = /^(\s*-\s+\[)[x /](\].*)$/i;
    const checkboxMatch = checkboxRe.exec(line);
    if (!checkboxMatch)
        return content;
    let newChar;
    if (status === 'done')
        newChar = 'x';
    else if (status === 'in-progress')
        newChar = '/';
    else
        newChar = ' ';
    let newLine = `${checkboxMatch[1]}${newChar}${checkboxMatch[2]}`;
    if (status === 'done') {
        // Remove any existing completion emoji+date before appending fresh one
        newLine = newLine.replace(/\u2705\s*\d{4}-\d{2}-\d{2}/g, '').trimEnd();
        newLine += ` \u2705 ${todayISO()}`;
    }
    lines[idx] = newLine;
    return lines.join('\n');
}
