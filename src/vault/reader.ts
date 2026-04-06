import matter from 'gray-matter';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

/**
 * Read a markdown file and parse its frontmatter and body.
 */
export async function readMarkdownFile(filePath: string): Promise<{ frontmatter: Record<string, unknown>; body: string }> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read markdown file at "${filePath}": ${(err as Error).message}`);
  }

  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    body: parsed.content,
  };
}

/**
 * Write a markdown file with the given frontmatter and body.
 * Creates parent directories if they don't exist.
 */
export async function writeMarkdownFile(filePath: string, frontmatter: Record<string, unknown>, body: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const content = matter.stringify(body, frontmatter);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Append content to an existing file, or create it if it doesn't exist.
 */
export async function appendToFile(filePath: string, content: string): Promise<void> {
  let existing = '';
  try {
    existing = await fs.readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist — start with empty string
  }
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, existing + content, 'utf-8');
}

/**
 * List all .md files in a folder.
 * Non-recursive by default; pass recursive=true for deep listing.
 */
export async function listMarkdownFiles(folderPath: string, recursive = false): Promise<string[]> {
  const pattern = recursive ? '**/*.md' : '*.md';
  const files = await glob(pattern, {
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
export async function readMarkdownFolder(folderPath: string): Promise<Array<{ filePath: string; frontmatter: Record<string, unknown>; body: string }>> {
  const files = await listMarkdownFiles(folderPath, false);
  const results: Array<{ filePath: string; frontmatter: Record<string, unknown>; body: string }> = [];

  for (const filePath of files) {
    try {
      const { frontmatter, body } = await readMarkdownFile(filePath);
      results.push({ filePath, frontmatter, body });
    } catch (err) {
      console.warn(`Warning: skipping "${filePath}" — ${(err as Error).message}`);
    }
  }

  return results;
}

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
