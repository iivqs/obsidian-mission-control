export interface Config {
  vaults: Record<string, string>;
  defaultVault: string;
  plugins: {
    tasks: boolean;
    dataview: boolean;
    templater: boolean;
  };
}

export interface VaultConfig {
  name: string;
  path: string; // resolved absolute path
}

export interface VaultStructure {
  root: string;
  projectsFolder: string;   // e.g. "Projects"
  sessionsFolder: string;   // e.g. "Sessions"
  tasksFolder?: string;     // e.g. "Tasks" (optional)
  templatesFolder?: string; // e.g. "_templates"
}

export interface Project {
  name: string;
  filePath: string;
  status: string;
  lastSession?: string;
  vault: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface Task {
  id: string;           // generated from file path + line number
  text: string;
  completed: boolean;
  due?: string;
  priority?: string;
  tags?: string[];
  filePath: string;
  lineNumber: number;
}

export interface SessionNote {
  project: string;
  vault: string;
  date: string;         // YYYY-MM-DD
  filePath: string;
  decisions: string[];
  tasksDone: string[];
  summary?: string;
}

export interface ActiveSession {
  project: Project;
  vault: VaultConfig;
  structure: VaultStructure;
  note: SessionNote;
  startedAt: Date;
}

export interface BriefingResult {
  project: Project;
  openTasks: Task[];
  lastSessionSummary?: string;
  decisions?: string[];
}

export interface QueryResult {
  columns: string[];
  rows: string[][];
}

export interface CanvasNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
}

export interface CanvasEdge {
  from: string;
  to: string;
  label?: string;
}

export interface CanvasResult {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}
