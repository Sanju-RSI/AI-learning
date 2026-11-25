
# AI Engineering Harness

A reusable TypeScript-based AI engineering harness built with Cursor.

## Features

- Reusable Cursor Rules
- Custom Cursor Commands
- Automated code-quality checks
- Git pre-commit hooks
- Jest testing setup
- MCP server with input validation
- Reusable code-review skill

## Tech Stack

- Node.js
- TypeScript
- Cursor
- ESLint
- Prettier
- Jest
- Husky
- MCP SDK
- Zod

## Installation

```bash
git clone https://github.com/Sanju-RSI/AI-learning
cd ai-engineering-harness
npm install
```

## Available Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run format
npm run format:check
npm test
npm run quality
npm run mcp
```

## MCP Tools

### get-user
Fetch a user by ID.

### create-user
Create a user with a validated name and email.

## Git Hooks

Husky runs quality checks before commits.

## Cursor Setup

Open the repository in Cursor and use the rules and commands
provided in the `.cursor` directory.
