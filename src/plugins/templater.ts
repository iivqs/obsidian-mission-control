import path from 'path';
import fs from 'fs/promises';
import { fileExists } from '../vault/reader';

// Candidate folder names for templates, in preference order
const TEMPLATE_FOLDER_CANDIDATES = ['_templates', 'Templates', 'templates'];

/**
 * Check if Templater plugin is active in this vault.
 * Checks for the Templater plugin data.json or the presence of a templates folder.
 */
export async function isTemplaterEnabled(vaultRoot: string): Promise<boolean> {
  // First check for Templater plugin data file
  const pluginDataPath = path.join(
    vaultRoot,
    '.obsidian',
    'plugins',
    'templater-obsidian',
    'data.json'
  );
  if (await fileExists(pluginDataPath)) return true;

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
export async function getTemplatesFolder(vaultRoot: string): Promise<string | null> {
  // Try reading configured folder from Templater plugin data
  const pluginDataPath = path.join(
    vaultRoot,
    '.obsidian',
    'plugins',
    'templater-obsidian',
    'data.json'
  );

  if (await fileExists(pluginDataPath)) {
    try {
      const raw = await fs.readFile(pluginDataPath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;
      const configured =
        (data['templates_folder'] as string | undefined) ??
        (data['template_folder'] as string | undefined);
      if (configured) {
        const resolved = path.join(vaultRoot, configured);
        if (await fileExists(resolved)) return resolved;
      }
    } catch {
      // Parse failure — fall through to candidate check
    }
  }

  // Try candidate folder names
  for (const candidate of TEMPLATE_FOLDER_CANDIDATES) {
    const candidate_path = path.join(vaultRoot, candidate);
    if (await fileExists(candidate_path)) {
      // Confirm it's a directory
      try {
        const stat = await fs.stat(candidate_path);
        if (stat.isDirectory()) return candidate_path;
      } catch {
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
export async function listTemplates(vaultRoot: string): Promise<string[]> {
  const folder = await getTemplatesFolder(vaultRoot);
  if (!folder) return [];

  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => path.join(folder, e.name));
  } catch {
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
export async function applyTemplate(
  templatePath: string,
  variables: Record<string, string>
): Promise<string> {
  let content: string;
  try {
    content = await fs.readFile(templatePath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read template at "${templatePath}": ${(err as Error).message}`);
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
  content = content.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (key in variables) return variables[key];
    if (key === 'date') return dateValue;
    if (key === 'title') return titleValue;
    return _match; // leave unknown placeholders intact
  });

  return content;
}
