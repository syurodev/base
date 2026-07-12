# DevKit Documentation Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hoàn thiện tài liệu DevKit thành source of truth nội bộ bằng cách giữ Knowledge layer ổn định và bổ sung Project-state layer có status, roadmap, contracts, security evidence, operations và ADR.

**Architecture:** `content/projects/dev-kit/` được chia thành hai nhóm navigation. Các trang knowledge tiếp tục mô tả vision và target architecture, không chứa progress/status. Sáu trang project-state mới là nguồn duy nhất cho implementation state, verified evidence và các thông tin vận hành thay đổi theo code/commit.

**Tech Stack:** MDX, Fumadocs, Mermaid, Next.js 16, Bun, ESLint, TypeScript. Source implementation được kiểm tra từ `/Users/syuro/Workspace/dev-kit` nhưng không sửa trong plan này.

## Global Constraints

- Chỉ chỉnh tài liệu trong `/Users/syuro/Workspace/PERSONAL/base`.
- Không sửa runtime code của `/Users/syuro/Workspace/dev-kit`.
- Không biến các feature design-only thành claim đã implemented.
- Knowledge pages không có status table, progress percentage hoặc verified commit.
- Project-state dùng đúng bốn nhãn: `Implemented`, `Partial`, `Design only`, `Not started`.
- Mọi implementation claim quan trọng phải có source path hoặc verification command.
- SQLite được mô tả chính xác là application-layer encryption cho sensitive fields; không gọi là SQLCipher/full-database encryption.
- Không đưa secret, password, recovery key, private key hoặc connection credential vào docs.
- Mỗi task kết thúc bằng `git diff --check` và một commit có phạm vi rõ.
- Quality gate cuối: `bun run types:check`, `bun run build`, `bun run lint`.

---

### Task 1: Establish project-state navigation and status vocabulary

**Files:**
- Modify: `content/projects/dev-kit/meta.json`
- Create: `content/projects/dev-kit/implementation-status.mdx`

**Interfaces:**
- Consumes: existing DevKit page IDs in `meta.json`.
- Produces: a `Project state` sidebar section and the canonical status vocabulary used by later pages.

- [ ] **Step 1: Add the Project state section to navigation**

Insert this section after `AI & Security` and before `Engineering`:

```json
"---Project state---",
"implementation-status",
"roadmap",
"technical-contracts",
"security-controls",
"operations",
"architecture-decisions"
```

- [ ] **Step 2: Create the implementation-status page**

Create the page with frontmatter and these sections:

```mdx
---
title: Implementation status
description: Trạng thái implementation đã kiểm chứng của DevKit.
---

# Implementation status

Snapshot được kiểm tra từ checkout `/Users/syuro/Workspace/dev-kit`. Status có
thể thay đổi theo commit; kiến thức kiến trúc ổn định nằm ở các trang khác.

## Status vocabulary

| Status | Meaning |
|---|---|
| Implemented | Có runtime code và test/build evidence phù hợp. |
| Partial | Có runtime code nhưng còn thiếu capability hoặc production behavior quan trọng. |
| Design only | Có architecture/spec nhưng chưa có runtime package/flow. |
| Not started | Chưa có implementation đáng kể. |

## Module matrix

Tạo bảng cho Vault, Notes, Tools, SSH, Database, Capability Gateway, MCP, Sync,
External plugins, Marketplace và Vault item repository. Mỗi dòng phải có
`Status`, `Evidence` và `Remaining scope`.

## Verified snapshot

Ghi ngày kiểm tra, branch, commit và các lệnh verification đã chạy. Không ghi
secret hoặc dữ liệu máy cá nhân.

## Current limitations

Ghi rõ SQLite application-layer encryption, title metadata, tunnel/forwarding,
MCP runtime, sync runtime, external plugin runtime và vault-item repository còn
giới hạn hoặc chưa có.
```

Không dùng phần này để mô tả chi tiết kiến trúc; chỉ dùng để trả lời “đã làm đến đâu”.

- [ ] **Step 3: Verify navigation references**

Run:

```bash
node -e "const m=require('./content/projects/dev-kit/meta.json'); const fs=require('fs'); const pages=m.pages.filter(p=>!p.startsWith('---')); for (const p of pages) if (!fs.existsSync('./content/projects/dev-kit/'+p+'.mdx')) throw new Error(p); console.log('all project pages exist')"
```

Expected: `all project pages exist`.

- [ ] **Step 4: Commit the navigation and status page**

```bash
git add content/projects/dev-kit/meta.json content/projects/dev-kit/implementation-status.mdx
git commit -m "docs: add DevKit implementation status section"
```

---

### Task 2: Document roadmap and implementation boundaries

**Files:**
- Create: `content/projects/dev-kit/roadmap.mdx`
- Modify: `content/projects/dev-kit/index.mdx`

**Interfaces:**
- Consumes: `implementation-status.mdx` vocabulary and the architecture roadmap in the DevKit repository.
- Produces: phase-level execution order and a stable entry link from the overview.

- [ ] **Step 1: Create the roadmap page**

Use these sections:

```mdx
---
title: Roadmap
description: Các phase phát triển và tiêu chí hoàn thành của DevKit.
---

# Roadmap

## Phase 0 — Architecture foundation
Goal, delivered boundaries, and verification evidence.

## Phase 1 — Local MVP
Separate implemented local modules from remaining MVP work.

## Phase 2 — Internal Extension API
Mark manifest/contribution/versioning work separately from the existing
Capability Gateway and internal module registry.

## Phase 3 — SaaS sync
Mark as design-only/not started and list dependencies.

## Phase 4–5 — Plugins and marketplace
Mark as future vision and list security gates before execution.

## Next recommended work
Order the next three implementation slices by dependency, not by product wish
list. Each slice must link to a contract or decision page.
```

Every phase must include `Status`, `Goal`, `Done when`, `Dependencies` and
`Out of scope`.

- [ ] **Step 2: Add a state-aware link from overview**

Add one card to `index.mdx` under the existing cards:

```mdx
<Card title="Implementation status" href="/dev-kit/implementation-status" description="Verified current state, limitations and evidence" />
```

Do not add status prose or progress numbers to the overview itself.

- [ ] **Step 3: Check knowledge/state separation**

Confirm that the overview still explains what DevKit is and only links to the
status page for current implementation facts.

- [ ] **Step 4: Commit roadmap changes**

```bash
git add content/projects/dev-kit/roadmap.mdx content/projects/dev-kit/index.mdx
git commit -m "docs: add DevKit roadmap"
```

---

### Task 3: Document technical contracts

**Files:**
- Create: `content/projects/dev-kit/technical-contracts.mdx`

**Interfaces:**
- Consumes: current Go bridge, permission, capability, crypto, storage and service boundaries.
- Produces: one technical reference for implementers without copying full source files.

- [ ] **Step 1: Create the contract page skeleton**

Use these sections:

```mdx
---
title: Technical contracts
description: Các contract ổn định giữa UI, bridge, gateway, core services và storage.
---

# Technical contracts

## Boundary map
UI bridge → AppService.call → Capability Gateway → core service → repository/storage.

## Bridge contract
List public operation families for vault, notes, database, SSH and tools. Explain
that frontend calls typed adapters rather than generated bindings directly.

## Capability contract
Document subject, capability and bounded scope. Include the actual built-in
subjects and scope families used by the current container.

## Error contract
Document structured public errors, redaction, cancellation and vault-locked
classification. State that internal URL, driver, SQL and command details do not
cross the bridge boundary.

## Persistence contract
Document repository interfaces, JSON blob KV storage, migration behavior and
the distinction between encrypted fields and non-sensitive metadata.

## Encryption envelope contract
Document V1 readability, V2 AAD binding (`record_type`, `record_id`, `key_id`),
algorithm and key-ID compatibility rules.

## Compatibility rules
List what is backward-compatible and what requires a migration or explicit
architecture decision.
```

- [ ] **Step 2: Add evidence links and exact names**

For each contract, link to the relevant source file under the DevKit checkout,
for example `internal/bridge/app_service.go`, `internal/capabilities/gateway.go`,
`internal/permissions/policy.go`, `internal/crypto/aead.go` and
`internal/storage/sqlite.go`. Do not paste implementation bodies into MDX.

- [ ] **Step 3: Add a related-page link**

Link to `implementation-status`, `security-controls` and `architecture-decisions`.

- [ ] **Step 4: Commit contract documentation**

```bash
git add content/projects/dev-kit/technical-contracts.mdx
git commit -m "docs: document DevKit technical contracts"
```

---

### Task 4: Document security controls and evidence

**Files:**
- Create: `content/projects/dev-kit/security-controls.mdx`
- Modify: `content/projects/dev-kit/security.mdx`

**Interfaces:**
- Consumes: current security hardening implementation and the existing high-level security knowledge page.
- Produces: stable security principles plus a separate implementation/evidence page.

- [ ] **Step 1: Create the security-controls page**

Use one row per control in a table with `Control`, `Implementation`, `Evidence`
and `Remaining risk`. Cover:

- bridge choke point and capability authorization;
- allowed/denied audit events and metadata redaction;
- structured public errors;
- Master Password, recovery-key one-time return and vault lifecycle audit;
- SQLite `0600`, `DELETE` journal mode and cleanup on permission failure;
- V1/V2 envelope compatibility and V2 AAD binding;
- SSH exact host-key fingerprint pinning and one-operation passphrase handling;
- remote DB verified TLS, pool limits, cancellation and row cap;
- loopback-only server mode.

Include a final section `Remaining security risks` for application-layer SQLite
encryption, unlocked-process exposure, lack of sync/plugin runtime and any
unverified production assumptions.

- [ ] **Step 2: Keep security.mdx knowledge-oriented**

Retain threat model, protected assets, security principles and reference
baselines in `security.mdx`. Add only a short link to
`/dev-kit/security-controls`; do not move the control matrix into that page.

- [ ] **Step 3: Verify claims against source**

Check each control against the corresponding Go package and ensure no page claims
that MCP, sync, marketplace or external plugins are implemented.

- [ ] **Step 4: Commit security documentation**

```bash
git add content/projects/dev-kit/security.mdx content/projects/dev-kit/security-controls.mdx
git commit -m "docs: separate security controls from security knowledge"
```

---

### Task 5: Add operations runbook and architecture decisions

**Files:**
- Create: `content/projects/dev-kit/operations.mdx`
- Create: `content/projects/dev-kit/architecture-decisions.mdx`

**Interfaces:**
- Consumes: actual DevKit commands, entrypoint behavior and decisions already reflected in code/docs.
- Produces: repeatable local verification instructions and durable decision records.

- [ ] **Step 1: Create the operations page**

Document:

```mdx
## Prerequisites
Go, Bun/npm, Wails v3 and platform requirements for desktop mode.

## Development mode
`task dev` / `wails3 dev` and the requirement for a display/webview runtime.

## Headless server mode
`task run:server`, `go build -tags server .`, default loopback binding and the
explicit statement that this is not a public remote API.

## Verification
`GOCACHE=/private/tmp/devkit-go-cache go test ./...`
`GOCACHE=/private/tmp/devkit-go-cache go vet ./...`
`GOCACHE=/private/tmp/devkit-go-cache go build -tags server .`
`npm --prefix frontend run build`

## Local data and backup
Explain the platform config directory, `DevKit/devkit.db`, file permission
expectations and the difference between backing up wrapped key material and
recovering a lost Master Password.

## Recovery and troubleshooting
Cover not_configured/locked/unlocked states, recovery key handling without
putting the key in logs, stale server host configuration and database/SSH
connection prerequisites.
```

- [ ] **Step 2: Create the architecture decisions page**

Add ADR-style records for:

1. Wails + React + Go core boundaries.
2. Internal modules before external plugins.
3. Capability Gateway as the sensitive-call choke point.
4. Application-layer encrypted records instead of SQLCipher in the current phase.
5. V1 envelope readability plus V2 AAD binding.
6. Loopback-only server mode.
7. Verified TLS for remote database profiles and exact SSH host-key pinning.

Each record must include `Decision`, `Context`, `Alternatives considered`,
`Consequences` and `Status`.

- [ ] **Step 3: Commit operations and decisions**

```bash
git add content/projects/dev-kit/operations.mdx content/projects/dev-kit/architecture-decisions.mdx
git commit -m "docs: add DevKit operations and architecture decisions"
```

---

### Task 6: Correct knowledge-page claims without adding status noise

**Files:**
- Modify: `content/projects/dev-kit/system-overview.mdx`
- Modify: `content/projects/dev-kit/runtime.mdx`
- Modify: `content/projects/dev-kit/data-sync.mdx`
- Modify: `content/projects/dev-kit/vault.mdx`
- Modify: `content/projects/dev-kit/connections.mdx`
- Modify: `content/projects/dev-kit/tools.mdx`
- Modify: `content/projects/dev-kit/plugins.mdx`
- Modify: `content/projects/dev-kit/mcp-agent.mdx`
- Modify: `content/projects/dev-kit/repo-structure.mdx`
- Modify: `content/projects/dev-kit/open-questions.mdx`

**Interfaces:**
- Consumes: the knowledge/project-state separation and new page links from Tasks 1–5.
- Produces: knowledge pages that remain useful without making false current-state claims.

- [ ] **Step 1: Reframe target architecture language**

Use `designed to`, `target`, `future`, `should` and `must` where a page describes
MCP, sync, external plugins, marketplace, background workers, lazy activation,
tunnels or other not-yet-implemented runtime capabilities.

- [ ] **Step 2: Correct data-encryption terminology**

In `data-sync.mdx` and `vault.mdx`, distinguish application-layer encryption of
sensitive record fields from full-database encryption. Preserve the zero-knowledge
design goal as a target for future sync.

- [ ] **Step 3: Correct module scope**

In `tools.mdx`, describe the currently established command-registry pattern
without claiming format/convert/snippet runners exist. In `connections.mdx`,
describe profile storage, SSH command execution and PostgreSQL query behavior
without claiming tunnel/forwarding support.

- [ ] **Step 4: Close resolved open questions**

Replace resolved questions in `open-questions.mdx` with links to
`architecture-decisions`. Keep only unresolved choices such as future plugin
runtime and product monetization if they still require a decision.

- [ ] **Step 5: Add minimal project-state links**

Add one related-page card or short link where useful. Do not add status tables,
progress labels or verification dates to knowledge pages.

- [ ] **Step 6: Commit knowledge corrections**

```bash
git add content/projects/dev-kit
git commit -m "docs: align DevKit knowledge pages with architecture scope"
```

---

### Task 7: Run documentation quality gates and final review

**Files:**
- Modify: any page requiring fixes found during verification.

**Interfaces:**
- Consumes: all pages and navigation created by Tasks 1–6.
- Produces: a buildable, navigable and internally consistent documentation site.

- [ ] **Step 1: Run MDX type generation and TypeScript check**

Run:

```bash
bun run types:check
```

Expected: generated MDX/types complete successfully and `tsc --noEmit` exits 0.

- [ ] **Step 2: Run production build**

Run:

```bash
bun run build
```

Expected: all `/dev-kit/*` pages are generated without MDX or route errors.

- [ ] **Step 3: Run lint**

Run:

```bash
bun run lint
```

Expected: ESLint exits 0.

- [ ] **Step 4: Run content consistency checks**

Run:

```bash
rg -n -i "MCP server|sync client|external plugin runtime|marketplace|background workers|lazy-activate|tunnel|format, convert|snippet runners|encrypted DB|SQLCipher" content/projects/dev-kit
git diff --check
git status --short --branch
```

Review every result manually. A matched phrase is acceptable only when it is
explicitly labeled design-only, target, future, or a resolved decision.

- [ ] **Step 5: Review the navigation and page set**

Confirm all 20 DevKit pages appear under the intended sidebar groups, every card
link resolves, knowledge pages contain no status tables, and project-state pages
contain source/evidence references.

- [ ] **Step 6: Commit final verification fixes**

```bash
git add content/projects/dev-kit
git commit -m "docs: verify DevKit documentation set"
```

