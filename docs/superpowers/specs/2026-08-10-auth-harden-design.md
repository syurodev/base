# Auth Harden (Desktop OIDC Client) Design

**Date:** 2026-08-10  
**Status:** Implemented — evidence: `go test ./internal/auth/ -count=1` (PASS)  
**Scope:** Replace hand-rolled OAuth token exchange/refresh in desktop
`internal/auth` with `golang.org/x/oauth2`, and move IdP endpoints to process
config without breaking local-first startup.  
**Repos liệu:**

- Desktop: `/Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app`
- Docs: `/Users/syuro/Workspace/PERSONAL/dev-kit/base-doc`

**Follow-ups (out of this slice):** GitHub IdP on Keycloak, passkeys, vault
biometric unlock, Phase B1 device management UI/API.

## Goal

Giảm sai sót quanh PKCE + refresh-token rotation bằng thư viện OAuth2 chuẩn của
Go team, đồng thời bỏ hardcode domain Keycloak trong source. App vẫn **local
first**: thiếu OIDC config hoặc không có mạng không được chặn vault / features
local.

## Current state (baseline)

- `internal/auth` tự implement Authorization Code + PKCE, token POST, refresh
  rotation vào OS keychain, early refresh ~60s, lock chống double-refresh.
- `ProductionConfig()` hardcode
  `https://auth.synx.io.vn/realms/devkit` và derive auth/token URLs.
- `main` gọi `auth.New(ProductionConfig())` và `log.Fatal` nếu lỗi — hiện luôn
  có config hardcode nên app luôn gắn IdP production.
- Sync chỉ chạy khi user chủ động connect; access token lấy từ auth service.
- Unit tests cover refresh rotation, rejected refresh, interactive PKCE.

## Layout constraints (desktop README)

Follow `dev-kit-app/README.md` Code organization:

- Flat `internal/auth` only (`package auth`); no nested auth subpackages.
- Concept-named files + `*_test.go`; composition stays in root `main.go`.
- Keep `go test ./internal/arch/` green (`auth` must not import `app`/`bridge`).
- README Current layout must list `auth/` when docs are updated.

## Design decisions

### 1. Library: `golang.org/x/oauth2` only

- Dùng `Config.AuthCodeURL` + `GenerateVerifier` / `S256ChallengeOption` /
  `VerifierOption` / `Exchange`.
- Dùng `ReuseTokenSourceWithExpiry` (hoặc tương đương) cho cache access token +
  refresh trước expiry (`RefreshBefore`).
- **Không** thêm `zitadel/oidc` hay Clerk Go SDK trong slice này.
- **Không** verify ID token trên desktop (Gateway/JWKS vẫn là trust boundary).

### 2. OIDC endpoints from trusted config (not UI)

Nguồn duy nhất lúc process start / compose auth: **environment variables**
(prefix `DEVKIT_`). Không bao giờ nhận issuer từ Wails/frontend.

| Variable | Required for sync auth | Notes |
|---|---|---|
| `DEVKIT_OIDC_ISSUER` | Yes | e.g. `https://auth.synx.io.vn/realms/devkit` or local Keycloak realm URL |
| `DEVKIT_OIDC_CLIENT_ID` | No | Default `devkit-desktop` if empty |
| `DEVKIT_OIDC_SCOPES` | No | Default `openid profile email roles` if empty |
| `DEVKIT_OIDC_AUTH_URL` | No | Override; else `{issuer}/protocol/openid-connect/auth` |
| `DEVKIT_OIDC_TOKEN_URL` | No | Override; else `{issuer}/protocol/openid-connect/token` |

Validation (when config is present): HTTPS issuer/auth/token, non-empty host,
no userinfo in URL, callback still loopback `127.0.0.1` only
(`CallbackAddress` / `CallbackPath` remain app constants unless tests inject).

### 3. Local-first: fail on sync auth use, not on app start

**Option A refined:** thiếu `DEVKIT_OIDC_ISSUER` là lỗi **cấu hình auth**, không
phải lỗi khởi động app.

| Situation | Behavior |
|---|---|
| App start, issuer unset | App runs; vault and local modules work |
| `AuthLogin` / `AccessToken` / `SyncConnect` without config | Return clear auth/config error; no network call |
| Config present, offline | Local OK; login/refresh fails when IdP is needed |
| Config present, online | Normal PKCE + refresh via `x/oauth2` |

`main` **must not** `os.Exit` / `log.Fatal` solely because OIDC env is missing.
Wire auth as optional: nil / disabled service, or `LoadConfig` → skip `auth.New`
and let bridge methods fail with a stable error (e.g. existing
`ErrAuthenticationRequired` or a dedicated `ErrOIDCConfigRequired` mapped at
bridge).

### 4. Persist rotated refresh before exposing access token

When the library returns a token with a new `RefreshToken`, save to
`RefreshTokenStore` **before** returning the access token to sync. On
`invalid_grant` / refresh failure that means credential is dead: delete store
and surface `ErrAuthenticationRequired`.

### 5. Keep public contracts

- Bridge/capability surface for login, status, logout, sync connect unchanged in
  intent.
- Access token memory-only; refresh in OS keychain only.
- No logging of tokens, codes, or verifiers.
- Fixed loopback callback host `127.0.0.1` (port/path as today).

## Approach rejected

- **Hardcoded production issuer with env override only** — rejected; user chose
  no hardcoded domain; sync auth requires explicit config.
- **Fail process start without issuer** — rejected; breaks local-first offline.
- **Issuer from UI** — rejected; phishing / malicious IdP risk.
- **Rewrite backend to TS / Better Auth / Clerk for this slice** — rejected;
  IdP and sync stack stay Boot + Keycloak.

## Implementation sketch (non-normative)

1. Add `golang.org/x/oauth2` dependency.
2. Replace `ProductionConfig()` with `LoadConfigFromEnv() (Config, error)` (name
   flexible); derive Keycloak paths when overrides absent.
3. Refactor `Service` to use `oauth2.Config` for authorize + exchange + refresh;
   keep custom loopback listener, `state`, `BrowserOpener`, keychain store.
4. Update `main` composition: load config; if missing, leave auth unset/disabled;
   never fatal on missing issuer.
5. Adapt `internal/auth` unit tests; add LoadConfig tests (missing issuer,
   derive URLs, reject http issuer).
6. Document env vars in desktop README (example values, local Keycloak).

## Done when

1. No production Keycloak domain string required in auth source for default path.
2. Hand-rolled token form POST / PKCE hash helpers removed in favor of
   `x/oauth2` (callback/`state` remain custom).
3. App starts and local features work without `DEVKIT_OIDC_ISSUER`.
4. With valid env, login + refresh rotation behavior matches existing tests.
5. `go test ./internal/auth/...` passes.

## Non-goals

- GitHub / passkey Keycloak realm features.
- Vault biometric unlock.
- Changing Gateway audience or sync protocol.
- Discovery document fetch (optional later; not required while URLs derive from
  issuer or overrides).
