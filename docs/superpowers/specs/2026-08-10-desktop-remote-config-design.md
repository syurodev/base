# Desktop Remote Config Design

**Date:** 2026-08-10  
**Status:** Implemented (2026-08-10)  
**Scope:** Pin backend domain in the desktop app; fetch non-local-first cloud
config over HTTPS; disk-cache for offline; refresh when network returns; protect
the public endpoint with client headers + Redis rate limits.  
**Repos liệu:**

- Desktop: `/Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app`
- Backend: `/Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-backend`
- Docs: `/Users/syuro/Workspace/PERSONAL/dev-kit/base-doc`

**Related:** Auth harden (`2026-08-10-auth-harden-design.md`) introduced
`DEVKIT_OIDC_*` env loading and optional Auth wiring. This design supersedes
“env-only issuer” for production convenience while keeping env as a **dev
override**.

## Goal

Desktop opens without requiring the user to export OIDC env vars. On launch it
loads cloud config from the pinned API host, caches it for offline use, and
refreshes when connectivity returns. Only settings that do **not** break
local-first behavior are served remotely. Public access is lightly filtered
(client headers) and rate-limited via Redis (`DEVKIT_REDIS_PASSWORD` / Infisical).

## Current state (baseline)

- Sync gateway URL is already pinned:
  `productionSyncGateway = "https://api.synx.io.vn"` in `internal/bridge/sync.go`.
- OIDC issuer comes only from `DEVKIT_OIDC_*` (Auth harden). Missing issuer →
  `container.Auth == nil` → Sync UI shows `connection_failed: Sync is unavailable.`
- Gateway has authenticated-subject abuse limits (in-memory). Java backend does
  not yet consume Redis; Compose documents optional `bundled-redis` +
  `DEVKIT_REDIS_PASSWORD`.
- Local vault / modules must keep working with no network.

## Design decisions

### 1. Trusted bootstrap: hardcode API host only

- Pin config base to the same production API host as Sync:
  `https://api.synx.io.vn`.
- Public endpoint: `GET /v1/desktop/config` (no JWT).
- Never accept API host, issuer, or config URL from the Wails UI.
- Local / alternate IdP: `DEVKIT_OIDC_*` env **overrides** remote/cache when set.

### 2. What is remote vs local-only

**Allowed on remote config (cloud identity / update policy):**

| Field | Purpose |
|---|---|
| `oidc_issuer` | Keycloak (or IdP) realm issuer for Sync login |
| `oidc_client_id` | Optional; default `devkit-desktop` if absent |
| `oidc_scopes` | Optional; default `openid profile email roles` |
| `oidc_auth_url` / `oidc_token_url` | Optional overrides |
| `min_app_version` | Semver floor |
| `latest_app_version` | Optional newer version hint |
| `update_url` | Optional download / release page |
| `config_version` | Monotonic or opaque revision for cache diagnostics |

**Never remote (always local):** vault paths/policies, Master Password rules,
SQLite location, local module enablement, capability grants, sync protocol
constants, DEK handling.

### 3. Client lifecycle (cache + reconnect)

```text
app start
  → read disk cache (if present + schema-valid)
  → apply cache immediately for Sync/auth wiring if usable
  → fetch GET /v1/desktop/config (short timeout)
      success → validate → write cache → apply (see §5)
      failure → keep cache; if no cache, Sync/auth stay unavailable
  → when network becomes available later
      → fetch immediately (debounced); update cache + apply
```

- Cache location: app-private disk (e.g. under existing app data / XDG), not
  SQLite vault DB (config is not a vault secret; keep separate and non-encrypted
  unless we later decide otherwise — plaintext issuer is public metadata).
- Offline with warm cache: local features + Sync login using cached OIDC.
- Offline with empty cache: local-first OK; Sync/AuthLogin returns a **clear**
  error (improve copy vs generic “Sync is unavailable.”).

### 4. Request filtering headers (best-effort)

Desktop always sends (compiled into binary):

| Header | Example | Server |
|---|---|---|
| `X-DevKit-Client` | `desktop/0.4.0` | Required; pattern `desktop/<semver>`; else `400` |
| `User-Agent` | `DevKit-Desktop/0.4.0` | Recommended; may require prefix `DevKit-Desktop/` |

Not a secret — scrapers can forge. Purpose: drop casual scanners before Redis RL.

### 5. Version policy

- Compare running app semver to `min_app_version`.
- **Below min:** show UI warning; **block Sync connect / AuthLogin** (local app
  remains usable).
- **Below latest but ≥ min:** optional non-blocking update hint.
- Missing version fields: skip gate (treat as no minimum).

### 6. Apply / OIDC session rules

- Building `auth.Config` from remote+cache uses the same HTTPS validation as
  `LoadConfigFromEnv` / `validConfig`.
- If env OIDC is set, skip remote issuer for Auth wiring (env wins).
- If `oidc_issuer` changes while a refresh session exists: do not silently
  retarget mid-session; require logout / next interactive login against the new
  issuer (clear or invalidate keychain refresh when issuer fingerprint changes).

### 7. Rate limit: Redis

- Apply on `GET /v1/desktop/config` only (public path).
- Backend: Redis (Infisical / env `DEVKIT_REDIS_PASSWORD`; host/port via existing
  deploy conventions). Enable Redis for the process that serves this route
  (Gateway preferred as edge).
- Key: e.g. `desktop-config:rl:<client-ip>` (optional secondary dimension from
  `X-DevKit-Client` if useful; IP is primary).
- Budget (initial): **60 requests / minute / IP**.
- Over limit: `429` + `Retry-After`.
- **Redis unavailable: fail-open** for this endpoint (serve config, log/metric
  warning). Rationale: readability of config for legitimate clients beats hard
  outage; abuse still mitigated by headers when Redis is up. Revisit fail-closed
  if abuse appears.
- Desktop on `429`: keep cache; exponential backoff; no tight retry loop.

### 8. Response shape (normative sketch)

```json
{
  "config_version": "1",
  "oidc_issuer": "https://auth.synx.io.vn/realms/devkit",
  "oidc_client_id": "devkit-desktop",
  "oidc_scopes": "openid profile email roles",
  "min_app_version": "0.1.0",
  "latest_app_version": "0.1.0",
  "update_url": "https://synx.io.vn/devkit/releases"
}
```

Omit unused optional fields rather than sending nulls. Unknown fields: ignore
(forward-compatible).

### 9. Desktop package layout (README constraints)

- New logic stays flat under `internal/` (e.g. `internal/cloudconfig` or extend
  `internal/auth` carefully). Prefer a focused `cloudconfig` package if Auth
  would otherwise mix IdP protocol with HTTP config fetch.
- Composition in `main.go` only.
- Keep `go test ./internal/arch/` green.

### 10. Backend placement

- Prefer **Gateway** route + Redis RL filter, proxy or return static/config from
  env/file, **or** thin Spring controller behind Gateway.
- Do not put OIDC secrets in this payload (issuer is public).
- Document Redis as required for production Gateway when this endpoint ships
  (password already in Infisical).

## Approach rejected

- Issuer only via env for production UX — inconvenient for GUI launches.
- In-process rate limit only — rejected; use Redis already provisioned.
- Accepting config host from UI — phishing / malicious IdP risk.
- Moving vault or local module flags to remote — violates local-first.
- Redis fail-closed on config GET for v1 — rejected in favor of fail-open +
  observability.

## Done when

1. Desktop pins API host; fetches `/v1/desktop/config` with required client
   headers; caches to disk; refreshes on reconnect.
2. Auth can wire from cache/remote without `DEVKIT_OIDC_ISSUER` in production;
   env still overrides.
3. Below `min_app_version` blocks Sync/login only; local features work.
4. Gateway (or serving edge) enforces headers + Redis RL; 429 behavior documented;
   Redis down → fail-open + log.
5. Unit/integration tests for cache, header reject, RL (or contract test), and
   version gate.
6. README / ops docs updated (Redis, Infisical password, endpoint).

## Non-goals

- Signed config payloads / cert pinning beyond normal TLS (optional later).
- Distributed RL for all authenticated sync routes (separate Phase B item).
- GitHub / passkey / vault biometric.
- Changing sync push/pull protocol.
