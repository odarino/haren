---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";

// import .css files directly and it works
import './index.css';

import { createRoot } from "react-dom/client";

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.md`.

<!-- haren:begin -->
## Haren Framework

This workspace uses the Haren agentic SDLC framework.

**On every session start, you MUST:**
1. Read `.haren-dev/skill.md` — this is your operating manual
2. Follow its instructions for session orientation
3. Read `.haren-dev/manifest.yaml` and `.haren-dev/progress.json` before taking any action

All project documentation, specs, plans, and artifacts are managed inside `.haren-dev/`.
Write outside `.haren-dev/` only in the module's repos (see "Repos and Git" in `.haren-dev/skill.md`), only from the `planned` status on (implement phase) or when qa-engineer writes tests in `$E2E`. For a change the user explicitly asks for, use the gate override (see below).

## Brainstorming Gate

Before writing ANY code outside `.haren-dev/`:
1. Read `.haren-dev/progress.json` and `.haren-dev/manifest.yaml`
2. Write code only inside the repos of a module with status `planned`, `implementing`, `evaluating`, `completed`, or `released` (the module's `repos` keys in progress.json)
3. `discovered` and `decomposed` do NOT allow code. If no module is at `planned` or later, STOP and tell the user to run the plan phase.
4. Exception: the user explicitly asks for a change (for example a hotfix). Run `haren track override on --reason "<what the user asked>"`, make the change, then run `haren track override off`.

Design specs are written to Haren artifact folders, NOT to docs/superpowers/specs/.
<!-- haren:end -->

## Dogfooding note

This repo uses haren on itself through `.haren-dev/`. The source of truth for skills, agents and templates is `content/`. Never edit `.haren-dev/skills`, `.haren-dev/agents`, `.haren-dev/templates` or `.claude/skills` to change haren itself — edit `content/` and run `bun apps/cli/src/index.ts upgrade --haren-dir .haren-dev --yes`.
