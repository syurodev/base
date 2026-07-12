# Ideas

Personal project ideas + docs. Built with Next.js and Fumadocs.

## Develop

```bash
bun install
bun dev
```

- Garden: http://localhost:3000
- Example docs: http://localhost:3000/dev-kit

## Add a project

1. Create `content/projects/{slug}/`
2. Add `meta.json` with `"root": true` and a `pages` list
3. Add `index.mdx` (and more pages as needed)
4. Open `http://localhost:3000/{slug}`

The folder name **is** the URL segment.
