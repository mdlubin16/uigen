# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run setup` — install deps, generate Prisma client, run migrations (run once after clone)
- `npm run dev` — start the dev server with Turbopack at http://localhost:3000 (Next.js falls back to the next free port, e.g. 3001, if 3000 is taken)
- `npm run dev:daemon` — same, but backgrounded with output to `logs.txt` (useful when you need the server running while you keep working)
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — Next.js ESLint
- `npm test` — starts Vitest in **watch mode** (the `test` script is bare `vitest`). For a one-shot run use `npx vitest run`; a single file with `npx vitest run src/lib/__tests__/file-system.test.ts`, or filter by name with `npx vitest run -t "creates a file"`.
- `npm run db:reset` — drop and recreate the SQLite database (destructive)

Do **not** run `npm audit fix` — dependencies are intentionally pinned to a mutually-compatible set and `audit fix` will break the app.

## Slash commands

- `/audit` ([.claude/commands/audit.md](.claude/commands/audit.md)) — audits dependencies for known vulnerabilities and applies safe, deliberate updates. It must **never** run `npm audit fix` (see the pinned-dependency warning above); instead it bumps individual packages one at a time and verifies each change with `npm test`, surfacing major/peer/transitive risks for manual review.

## Environment

- `ANTHROPIC_API_KEY` — optional. Without it (or if left as the `your-api-key-here` placeholder), the app falls back to a mock LLM provider that returns canned components. See [src/lib/provider.ts](src/lib/provider.ts).
- `JWT_SECRET` — optional; defaults to a development value. Tests and local dev run fine without any `.env`.

### Node 25+ compat shim

[next.config.ts](next.config.ts) imports [node-compat.cjs](node-compat.cjs) before any app code. Node 25 enables an experimental Web Storage API that exposes non-functional global `localStorage`/`sessionStorage` on the server, breaking SSR guards that assume `typeof sessionStorage === "undefined"` means "not the browser" — exactly the assumption [src/lib/anon-work-tracker.ts](src/lib/anon-work-tracker.ts) relies on. The shim deletes those globals server-side to restore pre-25 behavior. Don't remove the import, and keep it in mind when adding new server-reachable `typeof storage` guards.

## Architecture

UIGen is a Next.js 15 (App Router) app that generates React components via an LLM and previews them live in the browser. There is **no real filesystem involved** — generated code lives in an in-memory virtual file system.

### Virtual File System (the core abstraction)

[src/lib/file-system.ts](src/lib/file-system.ts) defines `VirtualFileSystem`, a `Map`-backed tree of `FileNode`s with `createFile`/`updateFile`/`rename`/`delete` plus text-editor-style operations (`viewFile`, `replaceInFile`, `insertInFile`) and `serialize`/`deserialize` for persistence. Nothing is ever written to disk.

There are **two live instances** of the VFS per session, and keeping them in sync is the central data-flow concern:
- **Server-side**: [src/app/api/chat/route.ts](src/app/api/chat/route.ts) rebuilds a fresh VFS from the serialized `files` sent in each request body, exposes it to the LLM tools, and (for logged-in users) re-serializes it into the project row in `onFinish`.
- **Client-side**: [src/lib/contexts/file-system-context.tsx](src/lib/contexts/file-system-context.tsx) holds the canonical client VFS. As tool calls stream back, `onToolCall` (in [chat-context.tsx](src/lib/contexts/chat-context.tsx)) routes them to `handleToolCall`, which **replays the same mutations** locally so the UI updates optimistically without waiting for the server.

### LLM chat + tools

The chat uses the Vercel AI SDK (`streamText` server-side, `useChat` client-side). The system prompt lives in [src/lib/prompts/generation.tsx](src/lib/prompts/generation.tsx) and dictates conventions the generated code must follow: every project has a root `/App.jsx` default export, Tailwind for styling, and `@/` import alias for non-library files.

The model itself comes from `getLanguageModel()` in [src/lib/provider.ts](src/lib/provider.ts): with a real `ANTHROPIC_API_KEY` it returns the Anthropic model, otherwise a `MockLanguageModel` that emits canned tool calls. **The test suite always runs against this mock — tests never hit the real API**, so changes to generation behavior must be reflected in the mock to stay covered.

The model is given exactly two tools, both built around a VFS instance:
- `str_replace_editor` ([src/lib/tools/str-replace.ts](src/lib/tools/str-replace.ts)) — view/create/str_replace/insert
- `file_manager` ([src/lib/tools/file-manager.ts](src/lib/tools/file-manager.ts)) — rename/delete

When changing a tool's parameters or behavior, update **both** the server tool definition and the client-side `handleToolCall` switch in `file-system-context.tsx`, or the preview will drift from what the LLM thinks it did.

### Live preview

[src/lib/transform/jsx-transformer.ts](src/lib/transform/jsx-transformer.ts) compiles the VFS in the browser: `@babel/standalone` transpiles each `.jsx/.tsx` file, results become blob URLs, and `createImportMap` wires up an ES module import map (React from esm.sh, `@/` aliases, third-party packages resolved to `https://esm.sh/<pkg>`). Missing local imports get stub placeholder modules so the preview never hard-fails. `createPreviewHTML` assembles an iframe document with the import map, collected CSS, an error boundary, and Tailwind via CDN. The entry point is `/App.jsx`.

### Auth & persistence

- Auth is JWT-in-an-httpOnly-cookie via `jose` ([src/lib/auth.ts](src/lib/auth.ts)). `getSession` reads it server-side; [src/middleware.ts](src/middleware.ts) returns a 401 for unauthenticated requests to `/api/projects` and `/api/filesystem` (note: `/api/chat` is **not** guarded here — it handles anonymous sessions itself).
- Prisma + SQLite. **The Prisma client is generated to a non-standard path, [src/generated/prisma](src/generated/prisma)** (see the `output` in [prisma/schema.prisma](prisma/schema.prisma)) — import it via [src/lib/prisma.ts](src/lib/prisma.ts), not `@prisma/client`.
- The data model is just two tables ([prisma/schema.prisma](prisma/schema.prisma)): `User` (email/bcrypt password) and `Project`. A `Project` has a **nullable** `userId` and stores chat `messages` and the serialized VFS `data` as JSON-string columns (defaults `"[]"` / `"{}"`); deleting a user cascades to their projects.
- **Anonymous users** have no DB row. Their work is kept in `sessionStorage` ([src/lib/anon-work-tracker.ts](src/lib/anon-work-tracker.ts)); on sign-in/sign-up the tracked messages + files are flushed into a freshly created project. Server Actions for projects live in [src/actions](src/actions).

### Routing

`/` ([src/app/page.tsx](src/app/page.tsx)) redirects authenticated users to their most recent project (creating one if none exist) and renders the anonymous workspace otherwise. `/[projectId]` renders a saved project. Both mount `MainContent`, which composes `FileSystemProvider` → `ChatProvider` → the chat/editor/preview panels.

### UI components

The app's own chrome (not the generated previews) uses shadcn/ui primitives in [src/components/ui](src/components/ui), configured via [components.json](components.json). Add new ones with `npx shadcn@latest add <component>` rather than hand-rolling, and compose class names with the `cn()` helper from [src/lib/utils.ts](src/lib/utils.ts). The feature components on top of those primitives live alongside in [src/components](src/components) (`chat/`, `editor/`, `preview/`, `auth/`) and lean on three notable client libraries: **`@monaco-editor/react`** powers the code editor, **`react-resizable-panels`** drives the draggable panel layout in `MainContent`, and **`react-markdown`** renders assistant messages.

## Testing notes

Tests use Vitest + Testing Library with jsdom ([vitest.config.mts](vitest.config.mts)); `vite-tsconfig-paths` resolves the `@/` alias. Tests live in `__tests__` directories next to the code they cover.
