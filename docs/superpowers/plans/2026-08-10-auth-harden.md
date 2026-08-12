# Auth Harden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-rolled desktop OIDC token exchange/refresh with `golang.org/x/oauth2`, load IdP endpoints from `DEVKIT_OIDC_*` env, and keep the app local-first when OIDC is unset.

**Architecture:** Keep custom loopback PKCE callback, browser opener, and OS keychain refresh store. Delegate authorize URL building, code exchange, and refresh to `oauth2.Config` + `ReuseTokenSourceWithExpiry`. `main` leaves `container.Auth` nil when issuer env is missing (bridge already fails sync/auth calls with `ErrInvalidDependencies`).

**Tech Stack:** Go `devkit` module, `golang.org/x/oauth2`, existing `zalando/go-keyring` refresh store, Keycloak-compatible URL layout.

**Spec:** `base-doc/docs/superpowers/specs/2026-08-10-auth-harden-design.md`

## Global Constraints

- **README layout** (`dev-kit-app/README.md` → Code organization / Current layout):
  - Keep OIDC logic in flat `internal/auth` (package name = directory = `auth`). Do **not** add nested packages (`internal/auth/oidc`, `util`, etc.).
  - One package per directory; split by concept into files (`config.go`, `service.go`, `keyring_store.go`, …) all `package auth`.
  - Name files after the concept; co-locate tests as `<file>_test.go`. Match existing auth style (`keyring_store.go` → use `token_source.go`, not a new subpackage).
  - `main.go` stays composition-only (load env + wire `container.Auth`); no OAuth protocol logic in `main`.
  - Dependencies acyclic: `auth` must not import `bridge` / `app`. Enforced by `go test ./internal/arch/`.
  - When documenting, update README **Current layout** tree to include `auth/` (already in base-doc `repo-structure.mdx`, missing from app README tree today).
- Never accept issuer/auth/token URLs from the Wails UI.
- Do not `log.Fatal` / exit solely because `DEVKIT_OIDC_ISSUER` is missing.
- No production Keycloak domain hardcoded as a runtime default in auth source.
- Access token memory-only; refresh only in keychain; never log tokens/codes/verifiers.
- Callback host remains `127.0.0.1` only.
- Out of scope: GitHub IdP, passkeys, vault biometrics, Phase B1 devices, Gateway changes.
- Prefer TDD; keep `go test ./internal/auth/...` green after each task; also keep `go test ./internal/arch/` green.
- Desktop paths below are under `/Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app` unless noted.

## File map

| Path | Role |
|---|---|
| `dev-kit-app/internal/auth/config.go` | `LoadConfigFromEnv`, env keys, Keycloak URL derive (`package auth`) |
| `dev-kit-app/internal/auth/config_test.go` | Config load/validation tests |
| `dev-kit-app/internal/auth/service.go` | Service using `x/oauth2`; remove hand-roll exchange/PKCE |
| `dev-kit-app/internal/auth/service_test.go` | Adapt existing auth tests; keep behavior |
| `dev-kit-app/internal/auth/token_source.go` | Keychain-backed `oauth2.TokenSource` + rotation save (`package auth`) |
| `dev-kit-app/internal/auth/keyring_store.go` | Unchanged store; do not relocate |
| `dev-kit-app/main.go` | Optional auth wiring from env only |
| `dev-kit-app/go.mod` | Add `golang.org/x/oauth2` |
| `dev-kit-app/README.md` | Document `DEVKIT_OIDC_*` + add `auth/` to Current layout tree |
| `dev-kit-app/AGENTS.md` | One-line env note if auth/sync local run needs it |

---

### Task 1: `LoadConfigFromEnv` (fail missing issuer; no hardcode default)

**Files:**
- Create: `dev-kit-app/internal/auth/config.go`
- Create: `dev-kit-app/internal/auth/config_test.go`
- Modify: `dev-kit-app/internal/auth/service.go` — remove `ProductionConfig()` (or leave deprecated stub deleted in this task)

**Interfaces:**
- Consumes: existing `Config` struct + `validConfig` rules in `service.go`
- Produces:
  - `func LoadConfigFromEnv() (Config, error)`
  - `var ErrOIDCConfigRequired = errors.New("OIDC configuration is required")` (or equivalent exported sentinel)
  - Env: `DEVKIT_OIDC_ISSUER`, `DEVKIT_OIDC_CLIENT_ID`, `DEVKIT_OIDC_SCOPES`, `DEVKIT_OIDC_AUTH_URL`, `DEVKIT_OIDC_TOKEN_URL`

- [ ] **Step 1: Write failing tests**

```go
package auth

import (
	"errors"
	"testing"
)

func TestLoadConfigFromEnvMissingIssuer(t *testing.T) {
	t.Setenv("DEVKIT_OIDC_ISSUER", "")
	t.Setenv("DEVKIT_OIDC_CLIENT_ID", "")
	t.Setenv("DEVKIT_OIDC_SCOPES", "")
	t.Setenv("DEVKIT_OIDC_AUTH_URL", "")
	t.Setenv("DEVKIT_OIDC_TOKEN_URL", "")
	_, err := LoadConfigFromEnv()
	if !errors.Is(err, ErrOIDCConfigRequired) {
		t.Fatalf("err = %v, want ErrOIDCConfigRequired", err)
	}
}

func TestLoadConfigFromEnvDerivesKeycloakURLs(t *testing.T) {
	t.Setenv("DEVKIT_OIDC_ISSUER", "https://auth.example.test/realms/devkit")
	t.Setenv("DEVKIT_OIDC_CLIENT_ID", "")
	t.Setenv("DEVKIT_OIDC_SCOPES", "")
	t.Setenv("DEVKIT_OIDC_AUTH_URL", "")
	t.Setenv("DEVKIT_OIDC_TOKEN_URL", "")
	cfg, err := LoadConfigFromEnv()
	if err != nil {
		t.Fatalf("LoadConfigFromEnv: %v", err)
	}
	if cfg.ClientID != "devkit-desktop" {
		t.Fatalf("ClientID = %q", cfg.ClientID)
	}
	if cfg.Scope != "openid profile email roles" {
		t.Fatalf("Scope = %q", cfg.Scope)
	}
	wantAuth := "https://auth.example.test/realms/devkit/protocol/openid-connect/auth"
	wantToken := "https://auth.example.test/realms/devkit/protocol/openid-connect/token"
	if cfg.AuthorizationURL != wantAuth || cfg.TokenURL != wantToken {
		t.Fatalf("urls auth=%q token=%q", cfg.AuthorizationURL, cfg.TokenURL)
	}
	if cfg.CallbackAddress != defaultCallbackAddress || cfg.CallbackPath != defaultCallbackPath {
		t.Fatalf("callback mutated")
	}
}

func TestLoadConfigFromEnvRejectsHTTPIssuer(t *testing.T) {
	t.Setenv("DEVKIT_OIDC_ISSUER", "http://auth.example.test/realms/devkit")
	_, err := LoadConfigFromEnv()
	if err == nil {
		t.Fatal("expected error")
	}
	if errors.Is(err, ErrOIDCConfigRequired) {
		t.Fatal("http issuer should be validation error, not missing-config")
	}
}

func TestLoadConfigFromEnvHonorsURLOverrides(t *testing.T) {
	t.Setenv("DEVKIT_OIDC_ISSUER", "https://auth.example.test/realms/devkit")
	t.Setenv("DEVKIT_OIDC_AUTH_URL", "https://auth.example.test/custom/auth")
	t.Setenv("DEVKIT_OIDC_TOKEN_URL", "https://auth.example.test/custom/token")
	t.Setenv("DEVKIT_OIDC_CLIENT_ID", "custom-client")
	t.Setenv("DEVKIT_OIDC_SCOPES", "openid")
	cfg, err := LoadConfigFromEnv()
	if err != nil {
		t.Fatalf("LoadConfigFromEnv: %v", err)
	}
	if cfg.AuthorizationURL != "https://auth.example.test/custom/auth" || cfg.TokenURL != "https://auth.example.test/custom/token" {
		t.Fatalf("override not applied")
	}
	if cfg.ClientID != "custom-client" || cfg.Scope != "openid" {
		t.Fatalf("client/scope override failed")
	}
}
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go test ./internal/auth/ -run 'TestLoadConfigFromEnv' -count=1`

Expected: FAIL (undefined `LoadConfigFromEnv` / `ErrOIDCConfigRequired`)

- [ ] **Step 3: Implement `config.go`**

```go
package auth

import (
	"errors"
	"os"
	"strings"
	"time"
)

var ErrOIDCConfigRequired = errors.New("OIDC configuration is required")

const (
	envOIDCIssuer   = "DEVKIT_OIDC_ISSUER"
	envOIDCClientID = "DEVKIT_OIDC_CLIENT_ID"
	envOIDCScopes   = "DEVKIT_OIDC_SCOPES"
	envOIDCAuthURL  = "DEVKIT_OIDC_AUTH_URL"
	envOIDCTokenURL = "DEVKIT_OIDC_TOKEN_URL"
)

// LoadConfigFromEnv reads trusted process environment only. Missing issuer
// returns ErrOIDCConfigRequired so callers can keep the app local-first.
func LoadConfigFromEnv() (Config, error) {
	issuer := strings.TrimSpace(os.Getenv(envOIDCIssuer))
	if issuer == "" {
		return Config{}, ErrOIDCConfigRequired
	}
	clientID := strings.TrimSpace(os.Getenv(envOIDCClientID))
	if clientID == "" {
		clientID = "devkit-desktop"
	}
	scope := strings.TrimSpace(os.Getenv(envOIDCScopes))
	if scope == "" {
		scope = "openid profile email roles"
	}
	authURL := strings.TrimSpace(os.Getenv(envOIDCAuthURL))
	tokenURL := strings.TrimSpace(os.Getenv(envOIDCTokenURL))
	if authURL == "" {
		authURL = strings.TrimRight(issuer, "/") + "/protocol/openid-connect/auth"
	}
	if tokenURL == "" {
		tokenURL = strings.TrimRight(issuer, "/") + "/protocol/openid-connect/token"
	}
	cfg := Config{
		Issuer:           issuer,
		AuthorizationURL: authURL,
		TokenURL:         tokenURL,
		ClientID:         clientID,
		Scope:            scope,
		CallbackAddress:  defaultCallbackAddress,
		CallbackPath:     defaultCallbackPath,
		LoginTimeout:     3 * time.Minute,
		RefreshBefore:    60 * time.Second,
	}
	if !validConfig(cfg) {
		return Config{}, ErrAuthenticationFailed
	}
	return cfg, nil
}
```

Delete `ProductionConfig()` from `service.go`. Fix any compile break in `main.go` in Task 3 (temporarily comment or leave broken until Task 3 if needed — prefer Task 3 immediately after).

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go test ./internal/auth/ -run 'TestLoadConfigFromEnv' -count=1`

Expected: PASS

- [ ] **Step 5: Commit** (only if user asked to commit)

```bash
cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app
git add internal/auth/config.go internal/auth/config_test.go internal/auth/service.go
git commit -m "$(cat <<'EOF'
feat(auth): load OIDC endpoints from DEVKIT_OIDC_* env

EOF
)"
```

---

### Task 2: Optional auth wiring in `main` (local-first)

**Files:**
- Modify: `dev-kit-app/main.go`
- Modify: `dev-kit-app/internal/bridge/sync.go` (only if error mapping needed — prefer keep nil → `ErrInvalidDependencies`; optional map to `ErrOIDCConfigRequired` in comments/docs only)

**Interfaces:**
- Consumes: `auth.LoadConfigFromEnv`, `auth.ErrOIDCConfigRequired`, `auth.New`
- Produces: `container.Auth` set only when config loads; otherwise `nil`

- [ ] **Step 1: Write a focused composition test if practical**

Prefer not to spin Wails. Instead add a tiny helper testable function in `main` package is awkward. Verify manually via unit-level:

Add `internal/auth/wiring_test.go` is overkill. **Skip new test**; rely on existing bridge nil-Auth behavior + Step 3 smoke.

Document expected: with env unset, `AuthLogin` returns dependency/auth error and app process still starts.

- [ ] **Step 2: Update `main.go` auth block**

Replace:

```go
authService, err := auth.New(auth.Dependencies{
	Config: auth.ProductionConfig(),
	...
})
if err != nil {
	log.Fatal(err)
}
container.Auth = authService
```

With:

```go
var openBrowser auth.BrowserOpener
if cfg, err := auth.LoadConfigFromEnv(); err == nil {
	authService, err := auth.New(auth.Dependencies{
		Config: cfg,
		Store:  auth.NewSystemRefreshTokenStore(),
		OpenBrowser: func(url string) error {
			if openBrowser == nil {
				return auth.ErrAuthenticationFailed
			}
			return openBrowser(url)
		},
	})
	if err != nil {
		log.Fatal(err) // keyring/deps failure only — not missing issuer
	}
	container.Auth = authService
} else if !errors.Is(err, auth.ErrOIDCConfigRequired) {
	log.Fatal(err) // invalid issuer URL etc. at startup is OK to fail loud
}
// Missing issuer: leave container.Auth nil; local features still run.
```

Keep assigning `openBrowser` later as today. Import `"errors"`.

**Important:** Invalid HTTPS/`validConfig` failure at startup (`ErrAuthenticationFailed`) may fatal — acceptable (misconfiguration). Only missing issuer is soft.

- [ ] **Step 3: Compile check**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go build -o /dev/null .`

Expected: success (may still fail until Task 3 removes `ProductionConfig` refs — do Task 2 after Task 1 deleted `ProductionConfig`).

- [ ] **Step 4: Commit** (if user asked)

```bash
git add main.go
git commit -m "$(cat <<'EOF'
fix(auth): leave Auth unset when OIDC issuer env is missing

EOF
)"
```

---

### Task 3: Delegate exchange/refresh to `golang.org/x/oauth2`

**Files:**
- Create: `dev-kit-app/internal/auth/token_source.go`
- Modify: `dev-kit-app/internal/auth/service.go`
- Modify: `dev-kit-app/internal/auth/service_test.go` (httptest expectations for oauth2 form fields)
- Modify: `dev-kit-app/go.mod` / `go.sum` via `go get`

**Interfaces:**
- Consumes: `oauth2.Config`, `oauth2.GenerateVerifier`, `S256ChallengeOption`, `VerifierOption`, `ReuseTokenSourceWithExpiry`
- Produces: same `Service` methods: `EnsureAuthenticated`, `AccessToken`, `Logout`, `Status`

- [ ] **Step 1: Add dependency**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go get golang.org/x/oauth2@latest`

- [ ] **Step 2: Run existing auth tests — baseline**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go test ./internal/auth/ -count=1`

Expected: PASS on current hand-roll (or FAIL if Task 1 removed helpers still used — proceed to implement).

- [ ] **Step 3: Implement keychain `TokenSource`**

```go
package auth

import (
	"context"
	"errors"
	"sync"

	"golang.org/x/oauth2"
)

// refreshTokenSource loads the keychain refresh token and asks oauth2 to refresh.
// It persists a rotated refresh token before callers use the new access token.
type refreshTokenSource struct {
	mu     sync.Mutex
	ctx    context.Context
	config *oauth2.Config
	store  RefreshTokenStore
}

func (s *refreshTokenSource) Token() (*oauth2.Token, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	refresh, found, err := s.store.Load()
	if err != nil || !found || !validToken(refresh) {
		return nil, ErrAuthenticationRequired
	}
	token, err := s.config.TokenSource(s.ctx, &oauth2.Token{RefreshToken: refresh}).Token()
	if err != nil {
		if isInvalidGrant(err) {
			_ = s.store.Delete()
			return nil, ErrAuthenticationRequired
		}
		return nil, ErrAuthenticationFailed
	}
	if token.RefreshToken == "" {
		return nil, ErrAuthenticationFailed
	}
	if err := s.store.Save(token.RefreshToken); err != nil {
		return nil, ErrAuthenticationFailed
	}
	if !validToken(token.AccessToken) || token.Expiry.IsZero() {
		return nil, ErrAuthenticationFailed
	}
	return token, nil
}

func isInvalidGrant(err error) bool {
	var rErr *oauth2.RetrieveError
	if errors.As(err, &rErr) {
		// Keycloak returns 400 invalid_grant; RetrieveError exposes body/status.
		return rErr.Response != nil && (rErr.Response.StatusCode == 400 || rErr.Response.StatusCode == 401)
	}
	return false
}
```

Wire in `Service.AccessToken` via:

```go
src := oauth2.ReuseTokenSourceWithExpiry(nil, &refreshTokenSource{ctx: ctx, config: s.oauth, store: s.store}, s.config.RefreshBefore)
token, err := src.Token()
```

Also keep an in-memory reuse source on `Service` guarded by mutex so concurrent sync requests share one refresh — mirror current `refreshMu` + cached access token. Preferred shape:

- On `Service`, hold `tokenSrc oauth2.TokenSource` rebuilt when config/store ready, using `ReuseTokenSourceWithExpiry` wrapping `refreshTokenSource`.
- `AccessToken` calls `s.tokenSrc.Token()` under `refreshMu` **or** rely solely on `ReuseTokenSource` internal mutex (then drop duplicate cache fields carefully).

**Invariant:** save rotated refresh **inside** `refreshTokenSource.Token` before return.

- [ ] **Step 4: Refactor interactive login to oauth2 PKCE**

In `interactiveLogin`:

```go
verifier := oauth2.GenerateVerifier()
redirectURI := "http://" + listener.Addr().String() + s.config.CallbackPath
s.oauth.RedirectURL = redirectURI
authURL := s.oauth.AuthCodeURL(state,
	oauth2.AccessTypeOffline,
	oauth2.S256ChallengeOption(verifier),
)
// ... browser + callback ...
token, err := s.oauth.Exchange(ctx, callback.code, oauth2.VerifierOption(verifier))
```

Build `s.oauth` in `New`:

```go
oauthCfg := &oauth2.Config{
	ClientID: config.ClientID,
	Endpoint: oauth2.Endpoint{
		AuthURL:  config.AuthorizationURL,
		TokenURL: config.TokenURL,
	},
	RedirectURL: "http://" + config.CallbackAddress + config.CallbackPath,
	Scopes:      strings.Fields(config.Scope),
}
```

Remove: manual SHA256 challenge, `exchange()`, `tokenResponse`, unused crypto/sha256 imports if unused.

Ensure `HTTPClient` still injected via `context.WithValue(ctx, oauth2.HTTPClient, s.client)`.

- [ ] **Step 5: Adapt `service_test.go`**

Refresh handler must accept oauth2 refresh form (`grant_type=refresh_token`, `client_id`, `refresh_token`). Rejected-refresh test should return HTTP 400 so `RetrieveError` maps to `ErrAuthenticationRequired`.

Interactive login test must accept authorize query with `code_challenge` / `code_challenge_method=S256` from library.

- [ ] **Step 6: Run full auth package tests**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go test ./internal/auth/ -count=1`

Expected: PASS

- [ ] **Step 7: Commit** (if user asked)

```bash
git add go.mod go.sum internal/auth/
git commit -m "$(cat <<'EOF'
refactor(auth): use golang.org/x/oauth2 for PKCE exchange and refresh

EOF
)"
```

---

### Task 4: Docs

**Files:**
- Modify: `dev-kit-app/README.md` (OIDC env + **Current layout** line for `auth/`)
- Modify: `dev-kit-app/AGENTS.md` (short note)

- [ ] **Step 1: Document env vars + fix layout tree**

In README **Current layout** `internal/` block, add (near sync packages, alphabetically or next to bridge):

```text
  auth/              OIDC PKCE browser flow + OS-keychain refresh-token rotation
```

Also add subsection **OIDC (optional — required only for Sync login)** (after Quickstart or near Sync notes):

```markdown
### OIDC (optional — required only for Sync login)

Local-first: omit these to run vault and local modules without IdP.
OIDC code lives in `internal/auth` (flat package; wired from `main.go`).

| Variable | Required | Description |
| --- | --- | --- |
| `DEVKIT_OIDC_ISSUER` | for Sync auth | Keycloak realm issuer, e.g. `https://auth.example/realms/devkit` |
| `DEVKIT_OIDC_CLIENT_ID` | no | Default `devkit-desktop` |
| `DEVKIT_OIDC_SCOPES` | no | Default `openid profile email roles` |
| `DEVKIT_OIDC_AUTH_URL` | no | Override authorize URL |
| `DEVKIT_OIDC_TOKEN_URL` | no | Override token URL |

Example (local Keycloak from companion backend Compose):

`export DEVKIT_OIDC_ISSUER=https://localhost:…/realms/devkit`  
(use the real HTTPS issuer your realm publishes; loopback callback stays `http://127.0.0.1:62364/callback`.)
```

AGENTS.md: one bullet that Sync browser login needs `DEVKIT_OIDC_ISSUER`.

- [ ] **Step 2: Commit** (if user asked)

```bash
git add README.md AGENTS.md
git commit -m "$(cat <<'EOF'
docs(auth): document DEVKIT_OIDC_* for optional Sync identity

EOF
)"
```

---

### Task 5: Verification gate

- [ ] **Step 1: Auth unit tests**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go test ./internal/auth/ -count=1`

Expected: PASS

- [ ] **Step 2: Broader compile + arch**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go test ./internal/arch/ ./internal/bridge/ -count=1`

Expected: PASS (bridge nil-Auth paths unchanged)

- [ ] **Step 3: Grep for leftover hardcode / ProductionConfig**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && rg 'ProductionConfig|auth\\.synx\\.io\\.vn' internal/auth main.go || true`

Expected: no matches in runtime code (examples in README OK)

- [ ] **Step 4: Mark design Implemented** (docs only, after code lands)

Update `base-doc/docs/superpowers/specs/2026-08-10-auth-harden-design.md` status line to `Implemented` with test evidence command.

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| `golang.org/x/oauth2` only | Task 3 |
| Env config, no UI issuer | Task 1 |
| No hardcoded production default issuer | Task 1 + Task 5 grep |
| Local-first missing issuer | Task 2 |
| Save rotated refresh before expose | Task 3 `refreshTokenSource` |
| Keep bridge contracts / keychain / loopback | Task 2–3 |
| README env docs | Task 4 |
| `go test ./internal/auth/...` | Task 3, 5 |
| Out of scope GitHub/passkey/biometric/B1 | not scheduled |

## Placeholder / consistency review

- Sentinel name: `ErrOIDCConfigRequired` used consistently.
- Env names match design table.
- `validConfig` still enforces HTTPS for issuer/auth/token (tests use `https://auth.example.test/...`).
