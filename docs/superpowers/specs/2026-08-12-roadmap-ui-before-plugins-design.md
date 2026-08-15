# Roadmap reorder — UI before plugins

**Date:** 2026-08-12  
**Status:** Approved  
**Affects:** `base-doc/content/projects/dev-kit/{roadmap,implementation-status,plugins,agent-hub}.mdx`

## Decision

1. **Phase 4 — Agent Hub** closes as **Implemented (Claude-only)**. Codex / Gemini
   adapters stay out of v1; add later via the same `VendorAdapter` without
   reworking core.
2. **Phase 5 — Workbench UI** is next after Phase 4. Source of truth:
   `dev-kit-app/DESIGN.md` (Raycast-like dark canvas). Scope is **whole app**,
   not only deferred Sync panes. UI must stay **flexible** enough to add vendors,
   tabs/sessions, and conflict/device surfaces without layout rewrites.
3. **External plugins** move to **Phase 6**; **marketplace** to **Phase 7**
   (were Phase 5–6). Both remain Design only until after UI.

## Non-goals

- Implementing DESIGN.md tokens in this doc change (docs/roadmap only).
- Shipping Codex/Gemini adapters as part of Phase 4 close.
- Changing plugin/marketplace architecture pages beyond phase numbering.

## Done-when (docs)

- Roadmap lists Phase 4 → 5 (UI) → 6 (plugins) → 7 (marketplace).
- Implementation status matrix and Agent Hub / Plugins callouts match.
