# Personal Ideas Docs — Design Spec

**Date:** 2026-07-12  
**Status:** Approved (conversation)  
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
| Docs | `/docs/...` | Fumadocs UI (sidebar, TOC, search) |

Content lives as MDX under `content/` and is compiled by fumadocs-mdx.

```
app/
  (home)/page.tsx              # garden homepage
  docs/[[...slug]]/page.tsx    # Fumadocs docs pages
content/
  docs/                        # MDX + meta.json page tree
lib/source.ts                  # Fumadocs source adapter
```

## Content model (v1)

- Docs pages are MDX files under `content/docs/`
- Navigation comes from Fumadocs page tree (`meta.json` / folder structure)
- Frontmatter (minimum): `title`, optional `description`
- Sample content: one idea with a short overview + nested doc page

Later (out of setup scope): richer idea frontmatter (`status`, `tags`, `summary`) and garden filters driven by that metadata.

## Stack

- **Next.js** App Router + TypeScript
- **Fumadocs UI** + **fumadocs-mdx**
- **Tailwind CSS**
- **Search:** Orama (Fumadocs default)
- **Hosting:** Vercel-ready

## Setup scope (this phase)

In scope:

- Scaffold Fumadocs app into this repo
- Placeholder garden homepage linking into docs
- 1–2 sample MDX pages
- Short README: how to add a new idea/doc

Out of scope:

- Full visual branding / motion for the garden
- Idea status/tag filters
- GitHub Pages static export
- Auth / private docs

## Deploy

- Primary: push to GitHub → connect Vercel → production URL
- Preview deployments via Vercel PRs

## Success criteria

- `pnpm dev` serves garden + docs locally (package manager: pnpm)
- Docs look like a modern docs site (sidebar, TOC, search)
- Adding a new MDX file under `content/docs/` shows up in navigation after refresh
- Repo is deployable to Vercel without extra app rewrites beyond Fumadocs defaults
