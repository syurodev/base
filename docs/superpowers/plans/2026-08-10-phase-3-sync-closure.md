# Phase 3 Sync Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Phase 3 (`Partial` → `Implemented`) by proving multi-entity sync, retry/idempotency, 2-device conflict convergence, and auth refresh/revoke against the real Compose stack (Gateway → Sync API → PostgreSQL), then updating base-doc status.

**Architecture:** Opt-in Go suite at `dev-kit-app/cmd/synce2e/` (parallel to `cmd/mocksyncserver/`) runs two full device stacks (`syncclient` + `syncstore` + `vaultitem` + SQLite) over HTTP against Gateway loopback. Minimal production gap for 2-device: send `X-DevKit-Enrollment-Token` on session handshake (BE already supports it; desktop does not). Fault injection stays test-only inside `cmd/synce2e`. Revoke uses SQL `UPDATE devices SET status='revoked'` (same as `SyncApiIT`). No JetBrains UI, no BE Phase B.

**Tech Stack:** Go 1.25+ desktop (`devkit` module), Spring Boot Sync API + Gateway MVC, Keycloak realm `devkit`, PostgreSQL 18, Docker Compose.

**Spec:** `base-doc/docs/superpowers/specs/2026-08-10-phase-3-sync-closure-design.md`

## Global Constraints

- Desktop layout: `cmd/<name>/` for E2E binaries/tests; flat `internal/` packages; layering enforced by `go test ./internal/arch/`.
- Backend: Hexagonal by capability (`identity` / `replication` / `audit` / `bootstrap`); no new production capability for fault injection; no public revoke API.
- Protocol version stays `1`; do not change Go client contract to paper over server bugs.
- Suite is **opt-in**: skip unless env is set; default `go test ./internal/... ./cmd/...` must not require Compose.
- Never log/print access tokens, refresh tokens, ciphertext, or `.env` secrets.
- Out of scope: JetBrains 3-pane UI, device revoke HTTP API/UI, Redis/distributed rate limit, multi-region, MCP/plugins.
- Vault item types for G1: `note`, `db-profile`, `ssh-profile` (`vaultitem.ItemType*`).

## File map

| Path | Role |
|---|---|
| `dev-kit-app/cmd/synce2e/harness_test.go` | Env gate, shared vault, device factory, enroll helper, fault proxy |
| `dev-kit-app/cmd/synce2e/g1_multientity_test.go` | Gate G1 |
| `dev-kit-app/cmd/synce2e/g2_retry_test.go` | Gate G2 |
| `dev-kit-app/cmd/synce2e/g3_conflict_test.go` | Gate G3 |
| `dev-kit-app/cmd/synce2e/g4_auth_test.go` | Gate G4 |
| `dev-kit-app/internal/sync/httptransport.go` | Optional enrollment header on session |
| `dev-kit-app/internal/sync/session.go` | Authenticator interface + opts if needed |
| `dev-kit-app/internal/syncclient/connect.go` | Connect path for enrollment token |
| `dev-kit-app/README.md` / `AGENTS.md` | Document `go test ./cmd/synce2e/` |
| `dev-kit-backend/docs/operations/local-development.md` | How to run matrix against Compose |
| `base-doc/content/projects/dev-kit/{implementation-status,roadmap,saas-backend,security-controls}.mdx` | G5 status flip |

---

### Task 1: Scaffold `cmd/synce2e` harness (skip gate + device factory)

**Files:**
- Create: `dev-kit-app/cmd/synce2e/harness_test.go`
- Modify: `dev-kit-app/README.md` (add row for deployed E2E command)
- Modify: `dev-kit-app/AGENTS.md` (one bullet under Tests)

**Interfaces:**
- Consumes: patterns from `cmd/mocksyncserver/e2e_test.go` (`device`, `newDevice`, vault setup)
- Produces: `requireDeployed(t)`, `newSharedVault(t)`, `newDevice(t, baseURL, token, enrollment, vault)`, env `DEVKIT_DEPLOYED_E2E_URL` + `DEVKIT_DEPLOYED_E2E_TOKEN`

- [ ] **Step 1: Write failing smoke that skips without env**

Create `harness_test.go`:

```go
package main

import (
	"os"
	"testing"
)

func TestHarnessSkipsWithoutEnv(t *testing.T) {
	if os.Getenv("DEVKIT_DEPLOYED_E2E_URL") != "" && os.Getenv("DEVKIT_DEPLOYED_E2E_TOKEN") != "" {
		t.Skip("env configured; skip negative harness check")
	}
	requireDeployed(t) // must call t.Skip, not fail
}
```

Implement `requireDeployed` to `t.Skip` when URL or token missing.

- [ ] **Step 2: Run negative check**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go test ./cmd/synce2e/ -run '^TestHarnessSkipsWithoutEnv$' -count=1`

Expected: PASS (via Skip inside `requireDeployed` when env empty — structure the test so it passes: either Skip is the success path, or assert Skip happened). Prefer:

```go
func requireDeployed(t *testing.T) (baseURL, token string) {
	t.Helper()
	baseURL = os.Getenv("DEVKIT_DEPLOYED_E2E_URL")
	token = os.Getenv("DEVKIT_DEPLOYED_E2E_TOKEN")
	if baseURL == "" || token == "" {
		t.Skip("set DEVKIT_DEPLOYED_E2E_URL and DEVKIT_DEPLOYED_E2E_TOKEN to run deployed matrix")
	}
	return baseURL, token
}
```

And change Step 1 test to only document the skip helper, or delete the negative test and rely on skip. Keep a tiny `TestHarnessCompiles` that always passes.

- [ ] **Step 3: Port device factory from mock E2E**

Copy/adapt from `cmd/mocksyncserver/e2e_test.go`: `device` struct, `newDevice`, `createNote`, `editNote`, `body`, `syncNow`, `account`. Differences:

- `baseURL`/`token` from `requireDeployed`
- `newDevice` accepts optional `enrollmentToken string` (unused until Task 2 — pass `""`)
- **Do not** start `mocksyncserver`
- Each device gets its own SQLite under `t.TempDir()`
- Shared `*vault.Service` with one Setup password (same as mock E2E)

- [ ] **Step 4: Document commands**

In `README.md` Quickstart table add:

`| Deployed sync matrix (opt-in Compose) | \`DEVKIT_DEPLOYED_E2E_URL=… DEVKIT_DEPLOYED_E2E_TOKEN=… go test ./cmd/synce2e/ -count=1\` |`

In `AGENTS.md` Tests section: note suite skips without env; targets Gateway `http://127.0.0.1:8082` typically.

- [ ] **Step 5: Commit (app repo)**

```bash
cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app
git add cmd/synce2e README.md AGENTS.md
git commit -m "$(cat <<'EOF'
test: scaffold opt-in cmd/synce2e harness for deployed sync matrix

EOF
)"
```

---

### Task 2: Enrollment header on session (needed for real device B)

Desktop has no enrollment client today; BE requires `X-DevKit-Enrollment-Token` for every device after the first (`EstablishSyncSessionService`). Contract E2E SQL-seeds devices; full `syncclient` path cannot enroll device B without this.

**Files:**
- Modify: `dev-kit-app/internal/sync/session.go`
- Modify: `dev-kit-app/internal/sync/httptransport.go`
- Modify: `dev-kit-app/internal/sync/httptransport_test.go`
- Modify: `dev-kit-app/internal/syncclient/connect.go` (+ small connect test if present)
- Modify: `dev-kit-app/cmd/synce2e/harness_test.go` (enroll helper + wire Connect)

**Interfaces:**
- Consumes: BE `GET /v1/sync/session` + optional `X-DevKit-Enrollment-Token`; `POST /v1/sync/devices/enrollments`
- Produces:
  - `Authenticator.Authenticate(ctx, token, deviceID string) (AuthSession, error)` unchanged for first device
  - Add `AuthenticateWithEnrollment(ctx, token, deviceID, enrollmentToken string) (AuthSession, error)` on `*HTTPAuthenticator` and extend interface **or** add optional enrollment on a new method while keeping existing method as enrollment-empty wrapper
  - `syncclient.Service.ConnectWithEnrollment(ctx, baseURL, accessToken, enrollmentToken string) error`
  - Harness `enrollDevice(t, baseURL, token, authorizingDeviceID, targetDeviceID) string` returning plaintext enrollment token

- [ ] **Step 1: Failing unit test for enrollment header**

In `httptransport_test.go`, add a test server that asserts `X-DevKit-Enrollment-Token` is present when calling the new API:

```go
func TestAuthenticateWithEnrollmentSendsHeader(t *testing.T) {
	saw := ""
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		saw = r.Header.Get("X-DevKit-Enrollment-Token")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"account_id":"acc","device_id":"dev-2","expires_at":"` +
			time.Now().UTC().Add(time.Hour).Format(time.RFC3339Nano) + `"}`))
	}))
	t.Cleanup(srv.Close)
	auth, err := NewHTTPAuthenticator(srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := auth.AuthenticateWithEnrollment(context.Background(), "tok", "dev-2", "enroll-secret"); err != nil {
		t.Fatal(err)
	}
	if saw != "enroll-secret" {
		t.Fatalf("enrollment header = %q", saw)
	}
}
```

- [ ] **Step 2: Run test — expect fail**

Run: `go test ./internal/sync -run '^TestAuthenticateWithEnrollmentSendsHeader$' -count=1`

Expected: FAIL (method undefined)

- [ ] **Step 3: Implement minimal AuthenticateWithEnrollment**

Reuse `Authenticate` body; if `enrollmentToken != ""` set header `X-DevKit-Enrollment-Token` (constant next to `deviceHeader`). Keep `Authenticate` as call with empty enrollment (no header).

Update `Authenticator` interface carefully: prefer **not** breaking all fakes — add method only on `*HTTPAuthenticator`, and teach `syncclient` factories to use enrollment when provided via ConnectWithEnrollment without widening every mock.

Pattern:

```go
const enrollmentHeader = "X-DevKit-Enrollment-Token"

func (a *HTTPAuthenticator) Authenticate(ctx context.Context, accessToken, localDeviceID string) (AuthSession, error) {
	return a.authenticate(ctx, accessToken, localDeviceID, "")
}

func (a *HTTPAuthenticator) AuthenticateWithEnrollment(ctx context.Context, accessToken, localDeviceID, enrollmentToken string) (AuthSession, error) {
	return a.authenticate(ctx, accessToken, localDeviceID, enrollmentToken)
}
```

- [ ] **Step 4: Wire syncclient ConnectWithEnrollment**

```go
func (s *Service) ConnectWithEnrollment(ctx context.Context, baseURL, accessToken, enrollmentToken string) error {
	// same as Connect but session handshake uses AuthenticateWithEnrollment when factories expose it
}
```

If factories only expose `Authenticator` interface, extend factory to return `*HTTPAuthenticator` path or add optional enrollment to internal `connect` via type assert:

```go
if enrollmentToken != "" {
	if ha, ok := authenticator.(interface {
		AuthenticateWithEnrollment(context.Context, string, string, string) (replicationsync.AuthSession, error)
	}); ok {
		session, err = ha.AuthenticateWithEnrollment(ctx, accessToken, deviceID, enrollmentToken)
	} else {
		return ErrConnectFailed
	}
}
```

- [ ] **Step 5: Harness enroll helper**

```go
func enrollDevice(t *testing.T, baseURL, bearer, authorizerDeviceID, targetDeviceID string) string {
	t.Helper()
	// POST /v1/sync/devices/enrollments with JSON {"target_device_id":"..."}
	// Headers: Authorization, X-DevKit-Device-ID=authorizer, X-DevKit-Sync-Protocol=1
	// Return enrollment_token from JSON. Do not log token value in errors beyond length.
}
```

`newDevice` for device B: EnsureLocalDevice will mint B’s id — enrollment must use that same id. Order:

1. Create device B SQLite + EnsureLocalDevice (or create Service first) to know `targetDeviceID`
2. Call enroll from device A’s known device id
3. `ConnectWithEnrollment` for B

Adjust factory accordingly (may split `openDeviceDB` / `connectDevice`).

- [ ] **Step 6: Run unit tests**

Run: `go test ./internal/sync ./internal/syncclient ./internal/arch/ -count=1`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add internal/sync internal/syncclient cmd/synce2e
git commit -m "$(cat <<'EOF'
feat: send enrollment token on sync session handshake

EOF
)"
```

---

### Task 3: Gate G1 — multi-entity / multi-record on Compose

**Files:**
- Create: `dev-kit-app/cmd/synce2e/g1_multientity_test.go`
- Modify: `dev-kit-backend/docs/operations/local-development.md` (matrix runbook section)

**Interfaces:**
- Consumes: harness + enrollment from Task 2; Compose Gateway URL + bearer
- Produces: `TestG1MultiEntityPullApply` green against live stack

- [ ] **Step 1: Write G1 test (will skip without env; fail if env set and stack wrong)**

```go
func TestG1MultiEntityPullApply(t *testing.T) {
	baseURL, token := requireDeployed(t)
	vlt := newSharedVault(t)
	a := newBootstrappedDevice(t, baseURL, token, vlt) // first device, no enrollment
	b := newEnrolledDevice(t, baseURL, token, a, vlt)  // enrollment via A

	noteID := a.createNote(t, "n1", "note-body")
	dbID := a.createDBProfile(t, "Primary")
	sshID := a.createSSHProfile(t, "Bastion")
	a.syncNow(t)
	report := b.syncNow(t)
	if report.Pulled < 3 || report.Applied < 3 {
		t.Fatalf("B report = %#v, want pulled/applied >= 3", report)
	}
	// assert B can open all three payloads; entity versions monotonic via second edit+sync
	a.editNote(t, noteID, "note-body-v2")
	a.syncNow(t)
	b.syncNow(t)
	if b.body(t, noteID) != "note-body-v2" {
		t.Fatalf("note not fast-forwarded")
	}
	_ = dbID
	_ = sshID
}
```

Helpers `createDBProfile` / `createSSHProfile` use `vaultitem.Store.Create` with metadata matching `schema_test.go` (types `db-profile` / `ssh-profile`, keys `db-password` / `ssh-secret`).

- [ ] **Step 2: Document token acquisition in BE ops doc**

Add section “Deployed sync matrix (Phase 3 closure)” to `local-development.md`:

1. `docker compose up -d --build`; wait Gateway health `http://127.0.0.1:8082/actuator/health`
2. Obtain a short-lived bearer the Gateway accepts (Keycloak access token for realm `devkit` test user — do not paste secrets into the doc; describe `curl` shape with env vars)
3. Export `DEVKIT_DEPLOYED_E2E_URL=http://127.0.0.1:8082` and `DEVKIT_DEPLOYED_E2E_TOKEN`
4. From desktop repo: `go test ./cmd/synce2e/ -count=1`

Note: if local realm has registration/direct-grant disabled, use Admin-created test user + password grant only in local `.env` (never commit).

- [ ] **Step 3: Run G1 against Compose**

```bash
# backend
cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-backend && docker compose up -d --build
# then set URL/TOKEN from local procedure
cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app
DEVKIT_DEPLOYED_E2E_URL=http://127.0.0.1:8082 DEVKIT_DEPLOYED_E2E_TOKEN="…" \
  go test ./cmd/synce2e/ -run '^TestG1' -count=1 -timeout 5m
```

Expected: PASS. If fail: fix client/BE minimally (do not change protocol version).

- [ ] **Step 4: Commit**

```bash
# app
git add cmd/synce2e
git commit -m "$(cat <<'EOF'
test: add G1 multi-entity deployed sync matrix

EOF
)"
# backend docs
cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-backend
git add docs/operations/local-development.md
git commit -m "$(cat <<'EOF'
docs: document Phase 3 deployed sync matrix runbook

EOF
)"
```

---

### Task 4: Gate G2 — retry / backoff + idempotency

**Files:**
- Create: `dev-kit-app/cmd/synce2e/faultproxy_test.go` (or section in harness)
- Create: `dev-kit-app/cmd/synce2e/g2_retry_test.go`

**Interfaces:**
- Consumes: harness devices; in-process reverse proxy
- Produces: `TestG2PushRetriesWithoutDuplicateLog` 

- [ ] **Step 1: Fault proxy**

```go
// newFaultProxy(t, upstream string, failTimes int, status int) (proxyURL string)
// First failTimes requests to /v1/sync/push return status (429 or 503) with empty body;
// subsequent requests reverse-proxy to upstream.
```

Use `httptest.NewServer`. Count only push paths if pull must succeed for setup — or fail first N of any `/v1/sync/**` after session established. Clearest approach:

1. Connect A/B directly to real Gateway (session OK)
2. Rebuild transport base URL to proxy for SyncNow only — if syncclient does not allow mid-flight base URL swap, connect **through** proxy from the start and let proxy pass `/session` always, fail `/push` N times.

```go
func newSelectiveFaultProxy(t *testing.T, upstream string, pushFailures int) string {
	// /v1/sync/session,/enrollments → always forward
	// /v1/sync/push → 503 for first pushFailures, then forward
	// /v1/sync/pull → always forward
}
```

- [ ] **Step 2: Write G2 test**

```go
func TestG2PushRetriesWithoutDuplicateLog(t *testing.T) {
	upstream, token := requireDeployed(t)
	proxy := newSelectiveFaultProxy(t, upstream, 2) // two 503s then OK
	vlt := newSharedVault(t)
	a := newBootstrappedDevice(t, proxy, token, vlt)
	_ = a.createNote(t, "retry-me", "body")
	// First SyncNow should eventually succeed if runner retries within one SyncNow,
	// OR call SyncNow twice. Assert:
	// - final report PushSent >= 1
	// - second SyncNow does not double-apply on B (idempotent)
	b := newEnrolledDevice(t, proxy, token, a, vlt)
	a.syncNow(t)
	a.syncNow(t) // replay
	b.syncNow(t)
	// B has exactly one note body; optional: psql count replication_log via docker exec
}
```

If current `SyncNow`/`runner` does not retry inside one call, assert: first `SyncNow` returns network failure / pending retry state, second succeeds — still satisfies G2.

Inspect outbox via `syncstore` if needed: pending with `FailureNetwork` after first attempt.

- [ ] **Step 3: Run G2**

```bash
DEVKIT_DEPLOYED_E2E_URL=… DEVKIT_DEPLOYED_E2E_TOKEN=… \
  go test ./cmd/synce2e/ -run '^TestG2' -count=1 -timeout 5m
```

Expected: PASS. If runner never marks retry on 503, fix `internal/sync/httptransport.go` status mapping / `runner.go` minimally.

- [ ] **Step 4: Commit**

```bash
git add cmd/synce2e internal/sync
git commit -m "$(cat <<'EOF'
test: add G2 retry and idempotency deployed matrix

EOF
)"
```

---

### Task 5: Gate G3 — conflict convergence on BE (not mock)

**Files:**
- Create: `dev-kit-app/cmd/synce2e/g3_conflict_test.go`

**Interfaces:**
- Consumes: harness + resolve helpers from mock E2E (`ResolveUseTheirs`, `ResolveUseLocal`)
- Produces: three tests mirroring mock: theirs / ours / merge

- [ ] **Step 1: Port `setupConflict` to deployed harness**

Same sequence as `cmd/mocksyncserver/e2e_test.go` `setupConflict`, but `baseURL/token` from `requireDeployed` and device B enrolled.

- [ ] **Step 2: Port three convergence tests**

- `TestG3ResolveUseTheirsConverges`
- `TestG3ResolveUseOursConverges`
- `TestG3ResolveMergeConverges`

Copy assertions from mock E2E; fail messages prefix `G3`.

- [ ] **Step 3: Run G3**

```bash
DEVKIT_DEPLOYED_E2E_URL=… DEVKIT_DEPLOYED_E2E_TOKEN=… \
  go test ./cmd/synce2e/ -run '^TestG3' -count=1 -timeout 10m
```

Expected: PASS. Keep `go test ./cmd/mocksyncserver/` green as regression.

- [ ] **Step 4: Commit**

```bash
git add cmd/synce2e
git commit -m "$(cat <<'EOF'
test: add G3 two-device conflict convergence on deployed backend

EOF
)"
```

---

### Task 6: Gate G4 — refresh/expiry mapping + device revoke

**Files:**
- Create: `dev-kit-app/cmd/synce2e/g4_auth_test.go`
- Modify: harness with optional `DEVKIT_DEPLOYED_E2E_DATABASE_URL` or `docker compose exec` helper for revoke SQL

**Interfaces:**
- Consumes: Compose DB access for revoke; `ConnectWithTokenSource` / auth error mapping
- Produces: `TestG4RevokedDeviceRejected`, `TestG4ExpiredCredentialsClearSession`

- [ ] **Step 1: Revoke helper**

Prefer documented `docker compose exec` against service DB:

```bash
docker compose exec -T db psql -U … -d … -c "UPDATE devices SET status='revoked' WHERE device_id='…'"
```

Wrap in Go test helper that shells out **only when** `DEVKIT_DEPLOYED_E2E_REVOKE_CMD` is set, OR uses `database/sql` when `DEVKIT_DEPLOYED_E2E_DATABASE_URL` is set. Skip G4 revoke subtest if neither configured (document required env in ops doc). Prefer DATABASE_URL for reliability:

```go
func revokeDevice(t *testing.T, deviceID string) {
	dsn := os.Getenv("DEVKIT_DEPLOYED_E2E_DATABASE_URL")
	if dsn == "" {
		t.Skip("set DEVKIT_DEPLOYED_E2E_DATABASE_URL to run revoke gate")
	}
	// sql.Open pgx/stdlib or lib/pq; UPDATE devices SET status='revoked' WHERE device_id=$1
}
```

- [ ] **Step 2: Test revoke**

```go
func TestG4RevokedDeviceRejected(t *testing.T) {
	baseURL, token := requireDeployed(t)
	vlt := newSharedVault(t)
	a := newBootstrappedDevice(t, baseURL, token, vlt)
	status := a.sync.Status()
	revokeDevice(t, status.DeviceID)
	_, err := a.sync.SyncNow(context.Background())
	if !errors.Is(err, syncclient.ErrConnectAuthenticationRejected) &&
		!errors.Is(err, replicationsync.ErrAuthentication) {
		// accept documented syncclient auth error after 403
		t.Fatalf("after revoke SyncNow err = %v", err)
	}
}
```

Align assertion with actual error the client returns on 403 during SyncNow (read `syncnow.go` / transport mapping; update test to exact sentinel).

- [ ] **Step 3: Test expired credentials**

Use `ConnectWithTokenSource` with a source that returns a dead bearer then a fresh one:

```go
type sequenceTokens struct{ tokens []string; i int }
func (s *sequenceTokens) AccessToken(ctx context.Context) (string, time.Time, error) {
	// return next token; last token is valid DEVKIT_DEPLOYED_E2E_TOKEN
}
```

Or: connect with valid token, replace provider session with expired `AuthSession` if test seam exists. Prefer token source that first yields invalid token causing `ErrAuthentication`, then valid — proves clear/retry path without Keycloak refresh grant.

Also add one test that uses `auth.Service` against a local httptest token endpoint (already covered in `internal/auth/service_test.go`) — **do not duplicate**; G4 deployed focus is syncclient + Gateway 401/403 mapping.

- [ ] **Step 4: Run G4**

```bash
DEVKIT_DEPLOYED_E2E_URL=… DEVKIT_DEPLOYED_E2E_TOKEN=… \
DEVKIT_DEPLOYED_E2E_DATABASE_URL=… \
  go test ./cmd/synce2e/ -run '^TestG4' -count=1 -timeout 5m
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cmd/synce2e
git commit -m "$(cat <<'EOF'
test: add G4 revoke and auth-expiry deployed matrix

EOF
)"
```

---

### Task 7: Full matrix green + README evidence commands

**Files:**
- Modify: `dev-kit-app/README.md`, `dev-kit-backend/docs/operations/local-development.md` (final command block)

- [ ] **Step 1: Run full suite**

```bash
cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app
DEVKIT_DEPLOYED_E2E_URL=http://127.0.0.1:8082 \
DEVKIT_DEPLOYED_E2E_TOKEN="…" \
DEVKIT_DEPLOYED_E2E_DATABASE_URL="…" \
  go test ./cmd/synce2e/ -count=1 -timeout 15m
```

Expected: all G1–G4 PASS

Also:

```bash
go test ./internal/arch/ ./internal/sync ./internal/syncclient ./cmd/mocksyncserver/ -count=1
```

Expected: PASS

- [ ] **Step 2: Commit any last harness polish**

```bash
git commit -m "$(cat <<'EOF'
test: harden synce2e harness after full matrix pass

EOF
)"
```

(Only if there are changes.)

---

### Task 8: Gate G5 — flip base-doc Phase 3 to Implemented

**Files:**
- Modify: `base-doc/content/projects/dev-kit/implementation-status.mdx`
- Modify: `base-doc/content/projects/dev-kit/roadmap.mdx`
- Modify: `base-doc/content/projects/dev-kit/saas-backend.mdx`
- Modify: `base-doc/content/projects/dev-kit/security-controls.mdx` (remaining rows for matrix)
- Modify: `base-doc/docs/superpowers/specs/2026-08-10-phase-3-sync-closure-design.md` (Status: Implemented evidence)

**Rules:** Use vocabulary `Implemented`. Cite `cmd/synce2e` + commit SHAs + date. Remove “ma trận multi-device… vẫn chưa” blockers. JetBrains UI may remain as deferred UX note under limitations, not Phase 3 blocker.

- [ ] **Step 1: Update implementation-status**

- Sync / Replication client → `Implemented` (remaining: JetBrains 3-pane only, if still desired)
- Sync SaaS backend → `Implemented` for Phase A closure (remaining: Phase B items only)
- Verified snapshot: new date, commands including `go test ./cmd/synce2e/`

- [ ] **Step 2: Update roadmap**

- Phase 3 Status: Implemented
- Next recommended #7 → checked; point next work to Phase B / polish / plugins as appropriate

- [ ] **Step 3: Update saas-backend + security-controls**

- Status Partial → Implemented for Phase A matrix
- Replace deferred-test section with “matrix live in `cmd/synce2e`”

- [ ] **Step 4: Commit base-doc**

```bash
cd /Users/syuro/Workspace/PERSONAL/dev-kit/base-doc
git add content/projects/dev-kit docs/superpowers/specs/2026-08-10-phase-3-sync-closure-design.md
git commit -m "$(cat <<'EOF'
docs: mark Phase 3 SaaS sync Implemented after deployed matrix

EOF
)"
```

---

## Self-review (plan vs spec)

| Spec gate | Task |
|---|---|
| G1 multi-entity | Task 3 |
| G2 retry/idempotency | Task 4 |
| G3 conflict 2-device on BE | Task 5 (+ Task 2 enrollment prerequisite) |
| G4 refresh/revoke | Task 6 |
| G5 docs | Task 8 |
| Package `cmd/synce2e` | Task 1 |
| No JetBrains / no Phase B | Global Constraints |
| Fault injector test-only | Task 4 |
| Revoke via SQL | Task 6 |

No TBD placeholders for required gates. Enrollment client support is an explicit prerequisite discovered from README/BE reality (not UI).

---

## Execution handoff

Plan saved to `base-doc/docs/superpowers/plans/2026-08-10-phase-3-sync-closure.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
