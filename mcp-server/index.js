/**
 * Clipboard Manager – Knowledge Base MCP Server
 *
 * Exposes three tools to Claude:
 *   • list_notes   – list all notes (paginated)
 *   • search_notes – full-text search
 *   • get_note     – fetch a single note by ID (full content)
 *
 * Communication with the Rust backend uses a tiny HTTP server bound to
 * 127.0.0.1 on the port passed via MCP_API_PORT.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_PORT = process.env.MCP_API_PORT ?? '0';
const API_BASE = `http://127.0.0.1:${API_PORT}`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'list_notes',
    description:
      'List notes from the knowledge base. Returns id, title, summary, tags, and a content preview for each note.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of notes to return (default 20, max 100).',
        },
      },
    },
  },
  {
    name: 'search_notes',
    description:
      'Search the knowledge base by keyword. Returns matching notes with id, title, summary, tags, and a content preview.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword or phrase.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return (default 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_note',
    description: 'Retrieve a single note by its numeric ID including the full content.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The numeric ID of the note.',
        },
      },
      required: ['id'],
    },
  },
];

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function apiFetch(path) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'clipboard-kb', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    if (name === 'list_notes') {
      const limit = Math.min(Number(args.limit ?? 20), 100);
      const notes = await apiFetch(`/api/knowledge?limit=${limit}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }],
      };
    }

    if (name === 'search_notes') {
      if (!args.query) {
        return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };
      }
      const q = encodeURIComponent(String(args.query));
      const limit = Math.min(Number(args.limit ?? 10), 50);
      const notes = await apiFetch(`/api/knowledge?q=${q}&limit=${limit}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }],
      };
    }

    if (name === 'get_note') {
      if (args.id == null) {
        return { content: [{ type: 'text', text: 'Error: id is required' }], isError: true };
      }
      const note = await apiFetch(`/api/knowledge/${Number(args.id)}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(note, null, 2) }],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Tool error: ${err.message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Connect via stdio transport
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
