# Personal Ideas Docs Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Fumadocs into the existing Next.js app so `/` is an idea garden and each project’s docs live at `/{project-slug}/...`.

**Architecture:** Keep the current Next.js 16 + Tailwind 4 + bun app. Add `fumadocs-ui` + `fumadocs-mdx` on top of already-installed `fumadocs-core`. Content under `content/projects/{slug}/` is loaded with `baseUrl: '/'` so folder names become URL segments. Garden homepage stays `app/page.tsx`; docs use `app/[project]/[[...slug]]/`.

**Tech Stack:** Next.js 16, React 19, fumadocs-core (existing), fumadocs-ui, fumadocs-mdx, Tailwind 4, bun, Orama search

**Spec:** `docs/superpowers/specs/2026-07-12-personal-ideas-docs-design.md`

---

## File map

| File | Responsibility |
|---|---|
| `package.json` | Add fumadocs-ui, fumadocs-mdx, @types/mdx; optional `postinstall`/`types:check` scripts |
| `source.config.ts` | Define MDX docs collection at `content/projects` |
| `next.config.ts` | Wrap config with `createMDX()` |
| `tsconfig.json` | Add `collections/*` → `./.source/*` path |
| `app/globals.css` | Import Fumadocs UI Tailwind presets |
| `app/layout.tsx` | Wrap app in `RootProvider` |
| `app/page.tsx` | Placeholder garden linking to sample project |
| `app/[project]/layout.tsx` | `DocsLayout` + page tree |
| `app/[project]/[[...slug]]/page.tsx` | Render MDX docs page |
| `app/api/search/route.ts` | Orama search API |
| `lib/source.ts` | Fumadocs `loader` with `baseUrl: '/'` |
| `lib/layout.shared.tsx` | Shared nav options (title → garden) |
| `components/mdx.tsx` | MDX component map |
| `content/projects/sample-idea/*` | Sample project MDX + meta |
| `README.md` | How to add a project |
| `.gitignore` | Ignore `.source` if needed; keep `.idea` ignore |

---

### Task 1: Install Fumadocs UI + MDX packages

**Files:**
- Modify: `package.json` (via bun)
- Modify: `.gitignore` (ensure `.source` ignored if generated)

- [ ] **Step 1: Install packages with bun**

Run:

```bash
bun add fumadocs-ui fumadocs-mdx
bun add -d @types/mdx
```

Expected: `package.json` lists `fumadocs-ui`, `fumadocs-mdx`, and `@types/mdx`; lockfile updates.

- [ ] **Step 2: Ensure `.gitignore` covers generated MDX output**

Append if missing:

```gitignore
# fumadocs
.source
```

Also keep the existing `.idea` ignore if present.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock .gitignore
git commit -m "chore: add fumadocs-ui and fumadocs-mdx"
```

---

### Task 2: Configure fumadocs-mdx source + Next plugin

**Files:**
- Create: `source.config.ts`
- Create: `lib/source.ts`
- Modify: `next.config.ts`
- Modify: `tsconfig.json`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Create `source.config.ts`**

```ts
import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/projects',
});

export default defineConfig();
```

- [ ] **Step 2: Create `lib/source.ts`**

```ts
import { docs } from 'collections/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
});
```

- [ ] **Step 3: Replace `next.config.ts`**

```ts
import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const withMDX = createMDX();

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default withMDX(nextConfig);
```

- [ ] **Step 4: Update `tsconfig.json` paths**

Ensure `compilerOptions.paths` includes:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "collections/*": ["./.source/*"]
    }
  }
}
```

Keep existing `include`/`exclude` entries.

- [ ] **Step 5: Add helper scripts to `package.json`**

Merge into `scripts`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "postinstall": "fumadocs-mdx",
    "types:check": "fumadocs-mdx && next typegen && tsc --noEmit"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add source.config.ts lib/source.ts next.config.ts tsconfig.json package.json
git commit -m "chore: configure fumadocs-mdx source and Next plugin"
```

---

### Task 3: Add sample project content

**Files:**
- Create: `content/projects/sample-idea/index.mdx`
- Create: `content/projects/sample-idea/overview.mdx`
- Create: `content/projects/sample-idea/meta.json`

- [ ] **Step 1: Create sample project files**

`content/projects/sample-idea/meta.json`:

```json
{
  "title": "Sample Idea",
  "description": "Example personal project docs",
  "root": true,
  "pages": ["index", "overview"]
}
```

`content/projects/sample-idea/index.mdx`:

```mdx
---
title: Sample Idea
description: A placeholder project to prove the docs route works.
---

# Sample Idea

This is a demo project living at `/sample-idea`.

## Why it exists

Use this folder as a template when adding a new idea:

1. Create `content/projects/{your-slug}/`
2. Add `index.mdx` (+ optional pages)
3. Visit `/{your-slug}`

## Next

See [Overview](/sample-idea/overview).
```

`content/projects/sample-idea/overview.mdx`:

```mdx
---
title: Overview
description: Deeper notes for the sample idea.
---

# Overview

Write architecture notes, research, and decisions here.

### Goals

- Keep ideas in git as MDX
- Browse from the garden homepage
- Read deep docs in a Fumadocs UI
```

- [ ] **Step 2: Generate `.source` once**

Run:

```bash
bunx fumadocs-mdx
```

Expected: `.source/` directory created (gitignored).

- [ ] **Step 3: Commit content only**

```bash
git add content/projects
git commit -m "docs: add sample-idea project content"
```

---

### Task 4: Wire root layout, CSS, MDX components, shared nav

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `lib/layout.shared.tsx`
- Create: `components/mdx.tsx`

- [ ] **Step 1: Replace `app/globals.css`**

```css
@import 'tailwindcss';
@import 'fumadocs-ui/css/neutral.css';
@import 'fumadocs-ui/css/preset.css';

html {
  scrollbar-gutter: stable;
}

html > body[data-scroll-locked] {
  margin-right: 0px !important;
  --removed-body-scroll-bar-size: 0px !important;
}
```

- [ ] **Step 2: Update `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { RootProvider } from 'fumadocs-ui/provider/next';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Ideas',
    template: '%s | Ideas',
  },
  description: 'Personal project ideas and docs',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create `lib/layout.shared.tsx`**

```tsx
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Ideas',
      url: '/',
    },
  };
}
```

- [ ] **Step 4: Create `components/mdx.tsx`**

```tsx
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
```

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx lib/layout.shared.tsx components/mdx.tsx
git commit -m "feat: add Fumadocs provider, theme, and MDX components"
```

---

### Task 5: Add `/{project}/...` docs routes + search API

**Files:**
- Create: `app/[project]/layout.tsx`
- Create: `app/[project]/[[...slug]]/page.tsx`
- Create: `app/api/search/route.ts`

- [ ] **Step 1: Create docs layout**

`app/[project]/layout.tsx`:

```tsx
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;

  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
```

Note: with `"root": true` on each project `meta.json`, Fumadocs shows root folders as layout tabs and scopes sidebar to the active project. The unused `project` param is fine for now; do not remove it — it documents the route segment and can filter later if needed.

- [ ] **Step 2: Create docs page**

`app/[project]/[[...slug]]/page.tsx`:

```tsx
import { source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

function getSlugs(project: string, slug?: string[]) {
  return [project, ...(slug ?? [])];
}

export default async function Page({
  params,
}: {
  params: Promise<{ project: string; slug?: string[] }>;
}) {
  const { project, slug } = await params;
  const page = source.getPage(getSlugs(project, slug));
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams().map((param) => {
    const [project, ...slug] = param.slug;
    return { project, slug };
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ project: string; slug?: string[] }>;
}): Promise<Metadata> {
  const { project, slug } = await params;
  const page = source.getPage(getSlugs(project, slug));
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
```

- [ ] **Step 3: Create search route**

`app/api/search/route.ts`:

```ts
import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

export const { GET } = createFromSource(source, {
  language: 'english',
});
```

- [ ] **Step 4: Commit**

```bash
git add 'app/[project]' app/api/search/route.ts
git commit -m "feat: serve project docs at /{project-slug}"
```

---

### Task 6: Replace homepage with garden placeholder + README

**Files:**
- Modify: `app/page.tsx`
- Modify: `README.md`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import Link from 'next/link';
import { source } from '@/lib/source';

export default function Home() {
  const projects = source.getPages().filter((page) => page.slugs.length === 1);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm text-fd-muted-foreground">Personal ideas</p>
        <h1 className="text-4xl font-semibold tracking-tight">Idea garden</h1>
        <p className="max-w-xl text-fd-muted-foreground">
          Browse project ideas. Each card opens deep docs at{' '}
          <code className="text-sm">/{'{project-slug}'}</code>.
        </p>
      </header>

      <ul className="grid gap-4">
        {projects.map((project) => (
          <li key={project.url}>
            <Link
              href={project.url}
              className="block rounded-xl border border-fd-border px-5 py-4 transition-colors hover:bg-fd-accent"
            >
              <h2 className="text-lg font-medium">{project.data.title}</h2>
              {project.data.description ? (
                <p className="mt-1 text-sm text-fd-muted-foreground">
                  {project.data.description}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Replace `README.md` with setup notes**

```md
# Ideas

Personal project ideas + docs. Built with Next.js and Fumadocs.

## Develop

```bash
bun install
bun dev
```

- Garden: http://localhost:3000
- Sample docs: http://localhost:3000/sample-idea

## Add a project

1. Create `content/projects/{slug}/`
2. Add `meta.json` with `"root": true` and a `pages` list
3. Add `index.mdx` (and more pages as needed)
4. Open `http://localhost:3000/{slug}`

The folder name **is** the URL segment.
```

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx README.md
git commit -m "feat: add idea garden homepage and README"
```

---

### Task 7: Verify build and routes

**Files:** none (verification only)

- [ ] **Step 1: Run production build**

```bash
bun run build
```

Expected: build succeeds; static params include `sample-idea` and `sample-idea/overview` (or equivalent).

- [ ] **Step 2: Smoke-test locally**

```bash
bun run start
```

In another terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sample-idea
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sample-idea/overview
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/search?query=sample"
```

Expected: `200` for all four.

- [ ] **Step 3: Stop the server**

Stop the `bun run start` process when done.

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Garden at `/` | Task 6 |
| Docs at `/{project-slug}/...` | Tasks 3, 5 |
| Fumadocs UI (sidebar/TOC/search) | Tasks 4, 5 |
| Sample MDX project | Task 3 |
| README how to add project | Task 6 |
| Vercel-ready Next app | Tasks 2, 7 |
| bun as package manager (repo reality) | Task 1 |

## Notes / risks

- If `source.generateParams()` shape differs slightly, adjust Task 5 mapping so `project` is always the first slug segment.
- If TypeScript complains about `page.data.full`, omit the `full` prop.
- Do not reintroduce a `/docs` prefix.
