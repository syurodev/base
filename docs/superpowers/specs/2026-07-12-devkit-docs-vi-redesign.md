# DevKit Docs — Vietnamese Redesign Spec

**Date:** 2026-07-12  
**Status:** Approved in conversation  
**Project:** `/dev-kit` in repo `base`  
**Companion:** diagrams/flows required; avoid dry walls of text

## Goal

Rewrite and reorganize DevKit documentation into Vietnamese, with a modern docs reading experience: short pages, Hybrid sidebar IA, Mermaid diagrams, and Fumadocs UI components (Callout, Cards, Steps, Tabs).

## Decisions (locked)

| Topic | Choice |
|---|---|
| Scope | Full rewrite of DevKit docs into Vietnamese (Approach A) |
| Sidebar IA | Hybrid — overview/architecture first, then domains (Approach C) |
| Content style | Hub + deep-dive pages with Mermaid-first template (Approach 1) |
| Terminology | Keep common English tech terms (`vault`, `plugin`, `sync`, `MCP`); explain in Vietnamese |
| Site language | Docs + garden in Vietnamese; README stays English |
| Diagrams | Mermaid via Fumadocs; required on architecture/security/MCP/system pages |

## Information architecture

Replace the current 5 English files with this page tree under `content/projects/dev-kit/`:

### Giới thiệu
- `index` — Tổng quan
- `vision` — Tầm nhìn & nguyên tắc

### Kiến trúc
- `system-overview` — Sơ đồ hệ thống
- `runtime` — Runtime & process
- `data-sync` — Data & sync

### Modules
- `vault` — Vault & notes
- `connections` — Connections
- `tools` — Tools
- `plugins` — Plugins

### AI & bảo mật
- `mcp-agent` — MCP / Agent
- `security` — Security model

### Engineering
- `repo-structure` — Cấu trúc repo
- `core-foundation` — Core foundation
- `open-questions` — Câu hỏi mở

`meta.json` must use `"root": true` and section separators / page list matching this tree.

## Page template

Every deep-dive page follows this order:

1. Title + one-sentence Vietnamese description (frontmatter + lead)
2. Primary Mermaid diagram (flowchart, sequence, or architecture)
3. Short Vietnamese explanation (a few paragraphs; English terms kept)
4. Structured detail (Steps, Tabs, tables, Callouts — not long prose walls)
5. “Next” Cards linking to related pages

### Diagram minimums

| Page group | Diagram requirement |
|---|---|
| system-overview, runtime, data-sync, mcp-agent, security | Required Mermaid |
| Module pages (vault, connections, tools, plugins) | Flow or boundary diagram |
| index, vision | Cards + optional small diagram |
| repo-structure, core-foundation, open-questions | Optional; prefer lists/tables/Cards |

## Content rules

- **Rewrite, don’t machine-dump:** Re-author from DevKit architecture sources; preserve meaning; improve clarity.
- **Vietnamese body language** with English technical nouns retained.
- **No global `/docs` prefix** — URLs remain `/{slug}` e.g. `/dev-kit/security`.
- **Sources of truth for meaning:** existing imported architecture docs and `/Users/syuro/Workspace/dev-kit/docs/architecture/` if needed for fidelity.
- Remove obsolete English MDX files once the new tree is in place (`architecture.mdx`, `core-foundation.mdx`, `project-structure.mdx`, `mcp-agent-integration.mdx`, old `index.mdx`).

## Technical changes

1. Enable Mermaid in Fumadocs:
   - `remarkMdxMermaid` in `source.config.ts`
   - `Mermaid` MDX component (install `mermaid`, and `next-themes` if required by the Fumadocs recipe)
2. Prefer official Fumadocs UI MDX components already available via `fumadocs-ui/mdx` (Callout, Cards, Steps, Tabs, etc.).
3. Update garden homepage copy to Vietnamese (keep discovery logic).
4. Update docs nav title/labels in `lib/layout.shared.tsx` to Vietnamese where user-facing.
5. Keep `README.md` in English.

## Garden & chrome

- `/` headline and supporting text in Vietnamese
- Project cards still driven by frontmatter `title` / `description` (Vietnamese)
- Docs layout nav title e.g. `Ý tưởng` or `Ideas` → Vietnamese equivalent consistent with garden

## Out of scope

- Full visual rebrand of Fumadocs chrome beyond language/labels
- Translating README
- Adding new product features to DevKit itself
- Multi-project garden filters / status tags
- Perfect 1:1 sentence translation of every historical English paragraph

## Success criteria

- All IA pages exist in Vietnamese and appear in sidebar
- Visiting `/dev-kit` and key deep pages shows Mermaid diagrams rendered
- No remaining primary English wall-of-text pages for DevKit
- Garden and docs nav are Vietnamese; README remains English
- `bun run build` succeeds; smoke checks for `/`, `/dev-kit`, `/dev-kit/system-overview`, `/dev-kit/mcp-agent` return 200
