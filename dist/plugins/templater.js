"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTemplaterEnabled = isTemplaterEnabled;
exports.getTemplatesFolder = getTemplatesFolder;
exports.listTemplates = listTemplates;
exports.applyTemplate = applyTemplate;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const reader_1 = require("../vault/reader");
// Candidate folder names for templates, in preference order
const TEMPLATE_FOLDER_CANDIDATES = ['_templates', 'Templates', 'templates'];
/**
 * Check if Templater plugin is active in this vault.
 * Checks for the Templater plugin data.json or the presence of a templates folder.
 */
async function isTemplaterEnabled(vaultRoot) {
    // First check for Templater plugin data file
    const pluginDataPath = path_1.default.join(vaultRoot, '.obsidian', 'plugins', 'templater-obsidian', 'data.json');
    if (await (0, reader_1.fileExists)(pluginDataPath))
        return true;
    // Fallback: check if any known templates folder exists
    const folder = await getTemplatesFolder(vaultRoot);
    return folder !== null;
}
/**
 * Determine the templates folder path.
 * Checks .obsidian/plugins/templater-obsidian/data.json first,
 * then falls back to common folder names.
 * Returns null if no templates folder is found.
 */
async function getTemplatesFolder(vaultRoot) {
    // Try reading configured folder from Templater plugin data
    const pluginDataPath = path_1.default.join(vaultRoot, '.obsidian', 'plugins', 'templater-obsidian', 'data.json');
    if (await (0, reader_1.fileExists)(pluginDataPath)) {
        try {
            const raw = await promises_1.default.readFile(pluginDataPath, 'utf-8');
            const data = JSON.parse(raw);
            const configured = data['templates_folder'] ??
                data['template_folder'];
            if (configured) {
                const resolved = path_1.default.join(vaultRoot, configured);
                if (await (0, reader_1.fileExists)(resolved))
                    return resolved;
            }
        }
        catch {
            // Parse failure — fall through to candidate check
        }
    }
    // Try candidate folder names
    for (const candidate of TEMPLATE_FOLDER_CANDIDATES) {
        const candidate_path = path_1.default.join(vaultRoot, candidate);
        if (await (0, reader_1.fileExists)(candidate_path)) {
            // Confirm it's a directory
            try {
                const stat = await promises_1.default.stat(candidate_path);
                if (stat.isDirectory())
                    return candidate_path;
            }
            catch {
                // Not accessible
            }
        }
    }
    return null;
}
/**
 * List all template files (.md) in the templates folder.
 * Returns absolute paths.
 */
async function listTemplates(vaultRoot) {
    const folder = await getTemplatesFolder(vaultRoot);
    if (!folder)
        return [];
    try {
        const entries = await promises_1.default.readdir(folder, { withFileTypes: true });
        return entries
            .filter((e) => e.isFile() && e.name.endsWith('.md'))
            .map((e) => path_1.default.join(folder, e.name));
    }
    catch {
        return [];
    }
}
/**
 * Apply a template: read the file and replace Templater / simple variables.
 *
 * Supported replacements:
 *   <% tp.date.now("YYYY-MM-DD") %>  → variables['date'] or today
 *   <% tp.file.title %>              → variables['title']
 *   {{date}}                         → variables['date'] or today
 *   {{title}}                        → variables['title']
 *   {{key}}                          → variables[key] (any key)
 */
async function applyTemplate(templatePath, variables) {
    let content;
    try {
        content = await promises_1.default.readFile(templatePath, 'utf-8');
    }
    catch (err) {
        throw new Error(`Failed to read template at "${templatePath}": ${err.message}`);
    }
    const today = new Date().toISOString().slice(0, 10);
    const dateValue = variables['date'] ?? today;
    const titleValue = variables['title'] ?? '';
    // <% tp.date.now("YYYY-MM-DD") %> — any format string inside quotes
    content = content.replace(/<%[-\s]*tp\.date\.now\([^)]*\)[-\s]*%>/g, dateValue);
    // <% tp.file.title %>
    content = content.replace(/<%[-\s]*tp\.file\.title[-\s]*%>/g, titleValue);
    // Generic <% tp.* %> — leave unknown Templater expressions as-is but strip markers
    // (optional: could warn instead)
    // {{key}} replacements — most specific first
    content = content.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
        if (key in variables)
            return variables[key];
        if (key === 'date')
            return dateValue;
        if (key === 'title')
            return titleValue;
        return _match; // leave unknown placeholders intact
    });
    return content;
}
