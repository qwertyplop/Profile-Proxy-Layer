# Workspace

## Overview

pnpm workspace monorepo using TypeScript. A profile-based LLM API proxy manager — create profiles with a target URL and API keys, point your AI client at the proxy, and keys rotate automatically (round robin).

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite (proxy-manager artifact)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Architecture

### Artifacts
- `artifacts/api-server` — Express 5 backend. Handles profile CRUD, key management, and proxy forwarding.
- `artifacts/proxy-manager` — React + Vite frontend. Management UI for profiles and keys.

### Proxy URL Format
`/api/proxy/:profileName/<path>` — requests are forwarded to the profile's `targetUrl`, with the current key injected as `Authorization: Bearer <key>`. After each request, the key index rotates to the next key in the list.

### DB Schema (`lib/db/src/schema/`)
- `profilesTable` — stores proxy profiles (name, targetUrl, currentKeyIndex)
- `apiKeysTable` — stores API keys per profile (keyValue, label, profileId FK with cascade delete)

### Routes (`artifacts/api-server/src/routes/`)
- `profiles.ts` — CRUD for profiles and key management
- `proxy.ts` — proxy forwarding handler at `/api/proxy/:profileName/*`

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
