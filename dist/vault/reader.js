"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readMarkdownFile = readMarkdownFile;
exports.writeMarkdownFile = writeMarkdownFile;
exports.appendToFile = appendToFile;
exports.listMarkdownFiles = listMarkdownFiles;
exports.readMarkdownFolder = readMarkdownFolder;
exports.fileExists = fileExists;
const gray_matter_1 = __importDefault(require("gray-matter"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const glob_1 = require("glob");
/**
 * Read a markdown file and parse its frontmatter and body.
 */
async function readMarkdownFile(filePath) {
    let raw;
    try {
        raw = await promises_1.default.readFile(filePath, 'utf-8');
    }
    catch (err) {
        throw new Error(`Failed to read markdown file at "${filePath}": ${err.message}`);
    }
    const parsed = (0, gray_matter_1.default)(raw);
    return {
        frontmatter: parsed.data,
        body: parsed.content,
    };
}
/**
 * Write a markdown file with the given frontmatter and body.
 * Creates parent directories if they don't exist.
 */
async function writeMarkdownFile(filePath, frontmatter, body) {
    const dir = path_1.default.dirname(filePath);
    await promises_1.default.mkdir(dir, { recursive: true });
    const content = gray_matter_1.default.stringify(body, frontmatter);
    await promises_1.default.writeFile(filePath, content, 'utf-8');
}
/**
 * Append content to an existing file, or create it if it doesn't exist.
 */
async function appendToFile(filePath, content) {
    let existing = '';
    try {
        existing = await promises_1.default.readFile(filePath, 'utf-8');
    }
    catch {
        // File doesn't exist — start with empty string
    }
    const dir = path_1.default.dirname(filePath);
    await promises_1.default.mkdir(dir, { recursive: true });
    await promises_1.default.writeFile(filePath, existing + content, 'utf-8');
}
/**
 * List all .md files in a folder.
 * Non-recursive by default; pass recursive=true for deep listing.
 */
async function listMarkdownFiles(folderPath, recursive = false) {
    const pattern = recursive ? '**/*.md' : '*.md';
    const files = await (0, glob_1.glob)(pattern, {
        cwd: folderPath,
        absolute: true,
        nodir: true,
    });
    return files;
}
/**
 * Read all markdown files in a folder and return parsed results.
 * Skips files that fail to parse (logs a warning).
 */
async function readMarkdownFolder(folderPath) {
    const files = await listMarkdownFiles(folderPath, false);
    const results = [];
    for (const filePath of files) {
        try {
            const { frontmatter, body } = await readMarkdownFile(filePath);
            results.push({ filePath, frontmatter, body });
        }
        catch (err) {
            console.warn(`Warning: skipping "${filePath}" — ${err.message}`);
        }
    }
    return results;
}
/**
 * Check if a file exists.
 */
async function fileExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
