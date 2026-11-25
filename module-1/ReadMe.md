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

## Leave API

Employee leave requests with employee, manager, and admin roles. Development seed password for every seeded account is `Password123!`.

```bash
createdb leave_management
npm run seed
npm run dev:api
```

Seeded accounts:

- admin@example.com
- manager@example.com
- employee@example.com
- other@example.com

Sign in with `POST /api/auth/login`, then send `Authorization: Bearer <token>`.

- `POST /api/leave/requests` creates leave for the signed-in user
- `POST /api/leave/requests/:id/approve`, `/reject`, and `/cancel` send the `version` from the request
- `GET /api/users` is admin only

Copy `.env.example` to `.env` when the database URL or JWT secret should differ from the local defaults. Integration tests use `leave_management_test`.

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
