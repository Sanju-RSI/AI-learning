import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'sample-api-server',
  version: '1.0.0',
});

// Sample data (in-memory)
const users = [
  { id: '1', name: 'Sanju', email: 'Sanju@example.com' },
  { id: '2', name: 'David', email: 'David@example.com' },
];

// Tool 1: Get user details
server.registerTool(
  'get-user',
  {
    description: 'Get a user by their ID',
    inputSchema: {
      userId: z.string().min(1, 'User ID is required'),
    },
  },
  async ({ userId }) => {
    const user = users.find((item) => item.id === userId);

    if (!user) {
      return {
        content: [{ type: 'text', text: `User ${userId} not found` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(user, null, 2),
        },
      ],
    };
  },
);

// Tool 2: Create a user
server.registerTool(
  'create-user',
  {
    description: 'Create a user with a name and valid email address',
    inputSchema: {
      name: z.string().min(2),
      email: z.string().email(),
    },
  },
  async ({ name, email }) => {
    const user = {
      id: String(users.length + 1),
      name,
      email,
    };

    users.push(user);

    return {
      content: [
        {
          type: 'text',
          text: `User created: ${JSON.stringify(user)}`,
        },
      ],
    };
  },
);

// Start MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sample API MCP server is running');
}

main().catch((error) => {
  console.error('MCP server failed:', error);
  process.exit(1);
});
