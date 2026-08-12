# Phase 3 SaaS Sync Closure Design

**Date:** 2026-08-10  
**Status:** Implemented  
**Evidence:** deployed matrix G1–G4 pass ngày 2026-08-10 via `go test ./cmd/synce2e/ -count=1 -timeout 15m` (desktop `feat/phase-3-sync-closure` `7708b99`; backend `main` `cca601f`). Implementation plan: `docs/superpowers/plans/2026-08-10-phase-3-sync-closure.md`
**Scope:** Close Phase 3 (`Partial` → `Implemented`) per base-doc roadmap #7  
**Repos liệu:**

- Desktop: `/Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app` (and/or checkout `~/Workspace/dev-kit` as referenced by base-doc)
- Backend: `/Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-backend`
- Docs: `/Users/syuro/Workspace/PERSONAL/dev-kit/base-doc`

## Goal

Chứng minh sync zero-knowledge đa thiết bị hoạt động đúng trên stack backend
deploy thật (Compose local đủ Gate: Keycloak → Gateway → Sync API → PostgreSQL),
đủ để đổi Phase 3 từ `Partial` sang `Implemented` trên
`/dev-kit/implementation-status` và `/dev-kit/roadmap`.

Đây là **closure bằng evidence + fix gap**, không phải redesign protocol và
không mở JetBrains 3-pane merge UI.

## Current state (baseline)

Đã có runtime:

- Desktop Phase 3B/3C: transport, outbox, local mutation, pull/apply, Git-style
conflict resolve (ours/theirs/merge notes), PKCE + refresh rotation.
- Backend Phase A + Gateway MVC: `session` / `push` / `pull`, arbitration,
device enroll/revoke guard, audit, Compose private network.
- Evidence: mock two-device E2E (`dev-kit-app/cmd/mocksyncserver/`), Go↔Java
contract E2E opt-in (`internal/sync/backend_contract_e2e_test.go`), backend
`SyncApiIT` (kể cả revoke qua SQL), smoke deploy 2026-08-10
(login → session → one push → pull/apply).

Còn thiếu theo doc (saas-backend “Kiểm thử hoãn…”, roadmap #7):

1. Đa entity / đa record trên BE thật.
2. Latency / `408/429/5xx` / ngắt → retry/backoff + idempotency.
3. Hội tụ conflict 2-device trên BE thật (không mock).
4. Auth thật: refresh hết hạn + device revoke → `401/403` mapping phía client.

## Design decision

**Approach: Opt-in Go matrix against local Compose stack.**

- Harness mô phỏng **hai device** đầy đủ (mỗi device: SQLite + `syncclient` +
vault DEK chung), nói chuyện HTTP thật với Gateway loopback
(`http://127.0.0.1:8082`), không dùng `cmd/mocksyncserver`.
- Tái sử dụng pattern device factory từ `cmd/mocksyncserver/e2e_test.go` và
auth/token pattern từ `internal/sync/backend_contract_e2e_test.go`.
- Suite **opt-in** qua biến môi trường (skip mặc định trong `go test ./…`),
chạy khi Compose + token fixture sẵn sàng.
- Smoke production Keycloak browser đã có giữ nguyên làm evidence phụ; **không**
bắt buộc mở rộng production matrix trong closure này.
- Chỉ sửa production code khi matrix lộ bug thật (client hoặc backend).

### Alternatives considered


| Option                                              | Quyết định                                              |
| --------------------------------------------------- | ------------------------------------------------------- |
| Manual checklist + shell smoke                      | Reject — không đủ để claim `Implemented`.               |
| Hybrid Compose + mở rộng production PKCE matrix     | Defer — browser PKCE khó CI; Compose cover correctness. |
| JetBrains 3-pane UI trong cùng phase                | Out of scope (roadmap: làm sau).                        |
| BE Phase B (revoke API/UI, retention, multi-region) | Out of scope.                                           |


## Success criteria

Phase 3 được đánh `Implemented` chỉ khi **tất cả** gate sau pass trên Compose:


| #   | Gate                        | Pass khi                                                                                                                                                                                                                                                                                      |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Multi-entity / multi-record | Device A tạo/sửa nhiều record thuộc `note`, `database`, `ssh`; push; device B pull/apply đủ; cursor account tiến; thứ tự per-entity bảo toàn (không rollback version).                                                                                                                        |
| G2  | Retry / backoff             | Khi push/pull gặp `408`/`429`/`5xx` hoặc connection drop giữa chừng: outbox vào retry (`MarkRetry` / `FailureNetwork`), lần sau thành công; **không** tạo bản trùng trên replication log (idempotency key).                                                                                   |
| G3  | Conflict convergence        | Hai device diverge cùng note trên BE; server trả conflict; client capture theirs; resolve ours **và** theirs (và merge notes nếu đã có trên mock) đều hội tụ hai phía sau SyncNow.                                                                                                            |
| G4  | Auth refresh + revoke       | (a) Access/session hết hạn → client refresh hoặc clear đúng contract; request sau không dùng bearer chết. (b) Device bị revoke (`UPDATE devices SET status='revoked'`, pattern `SyncApiIT`) → session/push/pull map `401`/`403` → `ErrAuthentication` / clear session, không apply thêm data. |
| G5  | Docs                        | Cập nhật `implementation-status`, `roadmap`, `saas-backend` (và security-controls nếu cần) với evidence lệnh/commit; Sync client + SaaS backend không còn “remaining: multi-device matrix…” như blocker Phase 3.                                                                              |


## Architecture

```text
Device A (SQLite + syncclient) ──┐
                                 ├──► Gateway :8082 ──► Sync API ──► PostgreSQL
Device B (SQLite + syncclient) ──┘         ▲
                                           │
                              Keycloak (token fixture / realm)
                              Fault injector (G2 only)
```

### Components (bám README cấu trúc thật)

**Desktop (`dev-kit-app`)** — theo README: `cmd/<binary>/` cho executable + E2E;
`internal/` flat, một package/một thư mục, tên ngắn lowercase; `sync` là protocol
thấp, `syncclient`/`syncstore`/`syncconflict` là orchestration/persistence.
Two-device E2E hiện đã sống ở `cmd/mocksyncserver/` (`go test ./cmd/mocksyncserver/`).
Contract transport opt-in đã có ở `internal/sync/backend_contract_e2e_test.go`.

1. **Deployed matrix suite (desktop)** — `**cmd/synce2e/`** (`package main`)
  Song song `cmd/mocksyncserver/`: full 2-device stacks (`syncclient` +
   `syncstore` + `vaultitem` + SQLite), HTTP thật tới Gateway, **không** import
   mock server. Opt-in qua env; chạy `go test ./cmd/synce2e/`.  
   **Không** đặt `internal/sync/deployedmatrix/` — nested dưới protocol package,
   lệch “prefer flat”, và dễ kéo `syncclient` (layer cao) vào cây `sync` (layer
   thấp) trái `internal/arch`.  
   **Không** nhét matrix vào `internal/sync` cùng file contract E2E — contract
   chỉ kiểm transport; matrix cần composition giống mock E2E → thuộc `cmd/`.
2. **Compose stack (backend)** — không đổi layout hexagonal
  Dùng Compose + Gateway `127.0.0.1:8082` như README BE. Env:
   `DEVKIT_DEPLOYED_E2E_URL`, `DEVKIT_DEPLOYED_E2E_TOKEN` (hoặc tương đương),
   optional DSN/psql cho revoke fixture.
3. **Fault injector (G2)** — test-only, **không** capability BE mới
  Proxy/`httptest` wrapper trong `cmd/synce2e/` (hoặc Compose profile toxiproxy
   ngoài tree production). Không thêm package dưới `com.synx.devkit.*` production
   chỉ để fault; README BE cấm nhồi logic vào `shared`/`bootstrap` vì tiện test.
4. **Revoke fixture (G4)** — giữ pattern IT hiện có
  `SyncApiIT` đã `UPDATE devices SET status = 'revoked'`. Helper nếu cần: chỉ
   `src/test/java/com/synx/devkit/e2e/` (cùng chỗ E2E BE), không public revoke API,
   không capability `identity` mới cho Phase 3 closure.

### Auth in CI / local matrix

- Dùng **gateway-compatible signed identity** hoặc Keycloak token lấy bằng
client-credentials / password grant **chỉ trong realm test local**, không
mở lại direct grant trên production realm.
- Browser PKCE không bắt buộc trong suite này (đã có smoke 2026-08-10).

## Error / mapping rules (không đổi contract)

Giữ mapping đã chốt trong saas-backend / `internal/sync`:

- `401`/`403` → `ErrAuthentication` (clear session / không retry như network).
- `408`/`429`/`5xx` / network drop → `FailureNetwork` (retry).
- Conflict trên push → client conflict flow, không auto-winner.

Nếu matrix phát hiện drift giữa client và backend, **sửa implementation**
cho khớp contract; không âm thầm đổi protocol version `1`.

## Testing strategy


| Layer                                 | Vai trò trong closure                            |
| ------------------------------------- | ------------------------------------------------ |
| Unit / existing mock E2E              | Giữ regression; không thay thế G1–G4.            |
| Backend `SyncApiIT` + Go contract E2E | Baseline; matrix mở rộng full `syncclient` path. |
| **Deployed matrix (mới)**             | Evidence chính cho G1–G4.                        |
| Production smoke                      | Evidence phụ đã có; không gate thêm.             |


Mỗi gate là một (hoặc vài) test độc lập, fail message chỉ rõ gate nào.

## Documentation updates (after green)

- `content/projects/dev-kit/implementation-status.mdx` — Sync client + SaaS
backend → `Implemented` (hoặc giữ Partial chỉ nếu còn limitation ngoài G1–G4;
theo Done when roadmap thì đủ G1–G4 là Implemented).
- `content/projects/dev-kit/roadmap.mdx` — Phase 3 Implemented; tick #7.
- `content/projects/dev-kit/saas-backend.mdx` — bỏ “ma trận chưa hoàn tất”;
ghi lệnh chạy matrix.
- Optional: `security-controls.mdx` remaining rows cho refresh/revoke matrix.

## Out of scope

- JetBrains 3-pane merge UI.
- Device list/rename/revoke HTTP API + desktop management UI (BE Phase B).
- Distributed rate limit, Redis, multi-region, retention/backup.
- MCP / plugins / marketplace.
- Đổi envelope version, plaintext title encryption, production Keycloak policy
redesign.

## Risks and mitigations


| Risk                                                         | Mitigation                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Compose flaky / slow                                         | Timeout rõ; health wait; opt-in only.                                 |
| No revoke API                                                | SQL fixture documented; same as backend IT.                           |
| Retry behavior incomplete under real HTTP                    | Matrix fails → fix `httptransport`/`runner` minimally.                |
| Checkout path drift (`~/Workspace/dev-kit` vs `dev-kit-app`) | Plan ghi path PERSONAL monorepo; sync docs paths khi cập nhật status. |
| Sai chỗ đặt suite (nested `internal/sync/...`)               | Chốt `cmd/synce2e/` theo README app + pattern `cmd/mocksyncserver`.   |


## Self-review checklist

- [x] No TBD placeholders for required gates.
- [x] Scope A only (no JetBrains UI).
- [x] Approach matches approved design (Compose Go matrix).
- [x] Success criteria map 1:1 to roadmap #7 deferred tests.
- [x] Out of scope explicit.