# Personal Ideas Docs — Design Spec

**Date:** 2026-07-12  
**Status:** Approved (conversation) — routing revised  
**Stack:** Next.js (App Router) + Fumadocs + Tailwind + MDX

## Goal

A git-backed site that stores personal project ideas with:

1. A modern **idea garden** homepage for browsing ideas
2. **Deep docs** per idea in a Next.js/Supabase-like docs UI

Deploy target: Vercel first; GitHub Pages optional later via static export if needed.

## Architecture

Single Next.js app, two surfaces:

| Surface | Route | Role |
|---|---|---|
| Idea garden | `/` | Custom React + Tailwind; cards/list of ideas |
| Project docs | `/{project-slug}/...` | Fumadocs UI (sidebar, TOC, search) for that project |

Examples:

- `/cool-saas` → project overview
- `/cool-saas/architecture` → nested doc page
- `/another-idea/research` → another project's docs

There is **no** global `/docs` prefix. Each project owns its URL segment.

Content lives as MDX under `content/projects/{project-slug}/` and is compiled by fumadocs-mdx.

```
app/
  (home)/page.tsx                         # garden homepage
  [project]/[[...slug]]/page.tsx         # Fumadocs pages per project
content/
  projects/
    sample-idea/
      index.mdx
      overview.mdx
      meta.json                            # optional page tree
lib/source.ts                             # Fumadocs source adapter
```

Reserved top-level segments (not project slugs): only framework/static needs as they appear (e.g. `api`, `_next`, assets). Project slugs must not collide with those.

## Content model (v1)

- One folder per project under `content/projects/{project-slug}/`
- `project-slug` is the URL path segment
- Navigation comes from Fumadocs page tree (`meta.json` / folder structure) scoped to that project
- Frontmatter (minimum): `title`, optional `description`
- Sample content: one project (`sample-idea`) with overview + one nested page

Later (out of setup scope): richer idea frontmatter (`status`, `tags`, `summary`) and garden filters driven by that metadata; garden cards link to `/{project-slug}`.

## Stack

- **Next.js** App Router + TypeScript
- **Fumadocs UI** + **fumadocs-mdx**
- **Tailwind CSS**
- **Search:** Orama (Fumadocs default); ideally scoped or labeled by project when multiple exist
- **Hosting:** Vercel-ready

## Setup scope (this phase)

In scope:

- Scaffold Fumadocs app into this repo
- Placeholder garden homepage linking to `/{project-slug}`
- 1 sample project with 1–2 MDX pages under `content/projects/`
- Short README: how to add a new project (folder + slug = URL)

Out of scope:

- Full visual branding / motion for the garden
- Idea status/tag filters
- GitHub Pages static export
- Auth / private docs

## Deploy

- Primary: push to GitHub → connect Vercel → production URL
- Preview deployments via Vercel PRs

## Success criteria

- `pnpm dev` serves garden + project docs locally (package manager: pnpm)
- Visiting `/{project-slug}` shows Fumadocs-style docs (sidebar, TOC, search)
- Adding a new folder under `content/projects/{slug}/` exposes docs at `/{slug}`
- Repo is deployable to Vercel without a global `/docs` base path
