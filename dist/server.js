#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
// Tool stub handlers
const session_1 = require("./tools/session");
const projects_1 = require("./tools/projects");
const tasks_1 = require("./tools/tasks");
const query_1 = require("./tools/query");
const server = new index_js_1.Server({
    name: 'obsidian-mission-control',
    version: '0.1.0',
}, {
    capabilities: {
        tools: {},
    },
});
// Tool definitions
const TOOLS = [
    {
        name: 'obsidian_start_session',
        description: 'Start a work session for a project in your Obsidian vault. Creates a session note and loads project context.',
        inputSchema: {
            type: 'object',
            properties: {
                project: {
                    type: 'string',
                    description: 'Name or path of the project to start a session for',
                },
                vault: {
                    type: 'string',
                    description: 'Name of the vault (uses default if omitted)',
                },
            },
            required: ['project'],
        },
    },
    {
        name: 'obsidian_get_briefing',
        description: 'Get a full briefing for the current or specified project: status, open tasks, last session summary, and recent decisions.',
        inputSchema: {
            type: 'object',
            properties: {
                project: {
                    type: 'string',
                    description: 'Project name (uses active session project if omitted)',
                },
                vault: {
                    type: 'string',
                    description: 'Vault name (uses default if omitted)',
                },
            },
        },
    },
    {
        name: 'obsidian_list_projects',
        description: 'List all projects in the vault, optionally filtered by status.',
        inputSchema: {
            type: 'object',
            properties: {
                vault: {
                    type: 'string',
                    description: 'Vault name (uses default if omitted)',
                },
                status: {
                    type: 'string',
                    description: 'Filter by status (e.g. Active, Archived, Someday)',
                },
            },
        },
    },
    {
        name: 'obsidian_focus_project',
        description: 'Switch focus to a different project without ending the current session.',
        inputSchema: {
            type: 'object',
            properties: {
                project: {
                    type: 'string',
                    description: 'Project name to switch focus to',
                },
                vault: {
                    type: 'string',
                    description: 'Vault name (uses default if omitted)',
                },
            },
            required: ['project'],
        },
    },
    {
        name: 'obsidian_get_tasks',
        description: 'Get open tasks for the current project or a specified file/folder.',
        inputSchema: {
            type: 'object',
            properties: {
                project: {
                    type: 'string',
                    description: 'Project name (uses active session project if omitted)',
                },
                vault: {
                    type: 'string',
                    description: 'Vault name (uses default if omitted)',
                },
                includeCompleted: {
                    type: 'boolean',
                    description: 'Include completed tasks (default: false)',
                },
            },
        },
    },
    {
        name: 'obsidian_update_task',
        description: 'Mark a task as complete or update its text in a vault file.',
        inputSchema: {
            type: 'object',
            properties: {
                taskId: {
                    type: 'string',
                    description: 'Task ID (from obsidian_get_tasks)',
                },
                completed: {
                    type: 'boolean',
                    description: 'Mark task as completed',
                },
                text: {
                    type: 'string',
                    description: 'New task text (optional)',
                },
                vault: {
                    type: 'string',
                    description: 'Vault name (uses default if omitted)',
                },
            },
            required: ['taskId'],
        },
    },
    {
        name: 'obsidian_log_decision',
        description: 'Append a decision or note to the current session note in the vault.',
        inputSchema: {
            type: 'object',
            properties: {
                decision: {
                    type: 'string',
                    description: 'Decision or note to log',
                },
                project: {
                    type: 'string',
                    description: 'Project name (uses active session project if omitted)',
                },
                vault: {
                    type: 'string',
                    description: 'Vault name (uses default if omitted)',
                },
            },
            required: ['decision'],
        },
    },
    {
        name: 'obsidian_end_session',
        description: 'End the current work session: write a summary, update project frontmatter, and close the session note.',
        inputSchema: {
            type: 'object',
            properties: {
                summary: {
                    type: 'string',
                    description: 'Summary of what was accomplished this session',
                },
                vault: {
                    type: 'string',
                    description: 'Vault name (uses default if omitted)',
                },
            },
            required: ['summary'],
        },
    },
    {
        name: 'obsidian_query',
        description: 'Run a Dataview DQL query against the vault and return results as a table.',
        inputSchema: {
            type: 'object',
            properties: {
                dql: {
                    type: 'string',
                    description: 'Dataview Query Language (DQL) query string',
                },
                vault: {
                    type: 'string',
                    description: 'Vault name (uses default if omitted)',
                },
            },
            required: ['dql'],
        },
    },
    {
        name: 'obsidian_read_canvas',
        description: 'Read an Obsidian canvas (.canvas) file and return its nodes and edges.',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the .canvas file (relative to vault root)',
                },
                vault: {
                    type: 'string',
                    description: 'Vault name (uses default if omitted)',
                },
            },
            required: ['filePath'],
        },
    },
];
// List tools handler
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
});
// Call tool handler
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const input = (args ?? {});
    switch (name) {
        case 'obsidian_start_session':
            return (0, session_1.startSession)({
                project: input['project'],
                vault: input['vault'],
            });
        case 'obsidian_get_briefing':
            return (0, projects_1.getBriefing)({
                project: input['project'],
                vault: input['vault'],
            });
        case 'obsidian_list_projects':
            return (0, projects_1.listProjects)({
                vault: input['vault'],
                status: input['status'],
            });
        case 'obsidian_focus_project':
            return (0, projects_1.focusProject)({
                project: input['project'],
                vault: input['vault'],
            });
        case 'obsidian_get_tasks':
            return (0, tasks_1.getTasks)({
                project: input['project'],
                vault: input['vault'],
                includeCompleted: input['includeCompleted'],
            });
        case 'obsidian_update_task':
            // Schema exposes `taskId` + `completed`; implementation reads `id` + `status`
            return (0, tasks_1.updateTask)({
                id: input['taskId'],
                status: input['completed'] === true ? 'done' : (input['status'] ?? 'open'),
                vault: input['vault'],
            });
        case 'obsidian_log_decision':
            return (0, tasks_1.logDecision)({
                decision: input['decision'],
                project: input['project'],
                vault: input['vault'],
            });
        case 'obsidian_end_session':
            return (0, session_1.endSession)({
                summary: input['summary'],
                decisions: input['decisions'],
                tasksDone: input['tasksDone'],
                vault: input['vault'],
            });
        case 'obsidian_query':
            return (0, query_1.query)({
                dql: input['dql'],
                vault: input['vault'],
            });
        case 'obsidian_read_canvas':
            // Schema exposes `filePath`; implementation reads `file`
            return (0, query_1.readCanvas)({
                file: input['filePath'],
                vault: input['vault'],
            });
        default:
            return {
                content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                isError: true,
            };
    }
});
// Start the server
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error('Obsidian Mission Control MCP server running on stdio');
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
