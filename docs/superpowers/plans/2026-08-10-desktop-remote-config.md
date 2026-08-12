# Desktop Remote Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `GET /v1/desktop/config` on the Gateway (client headers + Redis IP rate limit, fail-open) and a desktop `cloudconfig` client that caches OIDC/version settings so Sync works without exporting `DEVKIT_OIDC_ISSUER`, while local-first behavior stays intact.

**Architecture:** Gateway serves a public JSON config from env/properties, validates `X-DevKit-Client`, and rate-limits with Redis (`desktop-config:rl:<ip>`, 60/min). Desktop pins `https://api.synx.io.vn`, loads disk cache then fetches, wires `auth` from env-override or resolved config, blocks Sync when below `min_app_version`, and refreshes when the network returns.

**Tech Stack:** Spring Boot 4 Gateway MVC + Spring Data Redis / Lettuce; Go desktop `internal/cloudconfig` + existing `internal/auth`; Infisical `DEVKIT_REDIS_PASSWORD`.

**Spec:** `base-doc/docs/superpowers/specs/2026-08-10-desktop-remote-config-design.md`

## Global Constraints

- Pin config host to `https://api.synx.io.vn` (same as `productionSyncGateway`); never accept host/issuer from UI.
- Remote payload may include only OIDC + version/update fields from the spec table — never vault/local module flags.
- `DEVKIT_OIDC_*` env overrides remote/cache when set.
- Redis RL on config GET: 60 req/min/IP; key `desktop-config:rl:<ip>`; Redis down → **fail-open** + log.
- Required request header `X-DevKit-Client: desktop/<semver>`; send `User-Agent: DevKit-Desktop/<semver>`.
- Below `min_app_version`: warn + **block Sync/AuthLogin**; local features keep working.
- Desktop README layout: flat `internal/cloudconfig` (`package cloudconfig`); composition only in `main.go`; keep `go test ./internal/arch/` green.
- Improve Sync error copy when cloud config missing (not only generic “Sync is unavailable.”).
- Out of scope: signed payloads, GitHub/passkey/biometric, sync protocol changes, Redis RL for all `/v1/sync/**` (existing in-memory IP filter may remain).

## File map

| Path | Role |
|---|---|
| `dev-kit-backend/gateway/.../DesktopConfigController.java` | `GET /v1/desktop/config` JSON |
| `dev-kit-backend/gateway/.../DesktopConfigProperties.java` | Env-backed OIDC/version fields |
| `dev-kit-backend/gateway/.../DesktopClientHeaderFilter.java` | Require `X-DevKit-Client` |
| `dev-kit-backend/gateway/.../RedisFixedWindowRateLimiter.java` | Redis INCR/EXPIRE limiter |
| `dev-kit-backend/gateway/.../DesktopConfigRateLimitFilter.java` | Path-scoped RL, fail-open |
| `dev-kit-backend/gateway/.../SecurityConfiguration.java` | `permitAll` for config route; wire filters |
| `dev-kit-backend/gateway/build.gradle` | `spring-boot-starter-data-redis` |
| `dev-kit-backend/gateway/src/test/...` | Header / RL / config IT |
| `dev-kit-app/internal/cloudconfig/*.go` | Types, fetch, cache, version compare, service |
| `dev-kit-app/main.go` | Resolve config → wire auth; start refresh |
| `dev-kit-app/internal/bridge/errors.go` / `sync.go` | Clearer missing-config / below-min errors |
| `dev-kit-app/README.md` | `cloudconfig/` in layout + remote-config notes |
| Ops docs (backend) | Redis required for Gateway config RL |

---

### Task 1: Gateway — public desktop config endpoint + client header

**Files:**
- Create: `dev-kit-backend/gateway/src/main/java/com/synx/devkit/gateway/config/DesktopConfigProperties.java`
- Create: `dev-kit-backend/gateway/src/main/java/com/synx/devkit/gateway/web/DesktopConfigController.java`
- Create: `dev-kit-backend/gateway/src/main/java/com/synx/devkit/gateway/security/DesktopClientHeaderFilter.java`
- Modify: `dev-kit-backend/gateway/src/main/java/com/synx/devkit/gateway/security/SecurityConfiguration.java`
- Create: `dev-kit-backend/gateway/src/test/java/com/synx/devkit/gateway/web/DesktopConfigIT.java` (or extend `GatewayFlowIT`)

**Interfaces:**
- Produces: `GET /v1/desktop/config` → JSON fields matching spec (`oidc_issuer`, optional client/scopes/urls, version fields, `config_version`)
- Header: require `X-DevKit-Client` matching `desktop/` + semver-ish `\d+\.\d+\.\d+` (allow pre-release suffix optionally `desktop/0.1.0` only for v1)

- [ ] **Step 1: Write failing IT**

Assert missing header → 400; with header → 200 and `oidc_issuer` from test property.

- [ ] **Step 2: Run IT — expect FAIL** (route denyAll / missing controller)

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-backend/gateway && ./gradlew test --tests '*DesktopConfig*'`

- [ ] **Step 3: Implement properties + controller + header filter**

```java
@ConfigurationProperties("devkit.desktop.config")
public class DesktopConfigProperties {
    private String configVersion = "1";
    private String oidcIssuer; // required in prod via env DEVKIT_DESKTOP_OIDC_ISSUER
    private String oidcClientId = "devkit-desktop";
    private String oidcScopes = "openid profile email roles";
    private String oidcAuthUrl;
    private String oidcTokenUrl;
    private String minAppVersion;
    private String latestAppVersion;
    private String updateUrl;
    // getters/setters
}
```

Controller returns a map/DTO with snake_case JSON (`@JsonProperty` or record naming). Reject startup or return 503 if `oidcIssuer` blank in prod — for tests, set property.

`DesktopClientHeaderFilter`: if path is `/v1/desktop/config` and header missing/invalid → 400 JSON error; else continue.

`SecurityConfiguration`: `.requestMatchers("/v1/desktop/config").permitAll()` before denyAll; register header filter before IP filter (or immediately after).

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit** (when user asks / during SDD)

```bash
git commit -m "$(cat <<'EOF'
feat(gateway): public GET /v1/desktop/config with client header gate

EOF
)"
```

---

### Task 2: Gateway — Redis rate limit for desktop config (fail-open)

**Files:**
- Modify: `dev-kit-backend/gateway/build.gradle` — add `implementation 'org.springframework.boot:spring-boot-starter-data-redis'`
- Create: `RedisFixedWindowRateLimiter.java` (or `DesktopConfigRedisRateLimiter.java`)
- Create: `DesktopConfigRateLimitFilter.java`
- Modify: `SecurityConfiguration.java` / Redis `@Configuration` with optional connection
- Modify: `GatewayAbuseProperties` or new `DesktopConfigAbuseProperties` — `requestsPerMinute=60`
- Test: unit test with embedded/mock Redis **or** Testcontainers if already used; else mock `StringRedisTemplate` / Lettuce

**Interfaces:**
- Consumes: Redis via `DEVKIT_REDIS_HOST` (default `localhost`), `DEVKIT_REDIS_PORT`, `DEVKIT_REDIS_PASSWORD`
- Key: `desktop-config:rl:<remoteAddr>`
- On Redis errors: log warning, `chain.doFilter` (fail-open)
- On limit exceeded: `429` + `Retry-After: 60` (reuse `GatewayRejectionWriter` if possible)

- [ ] **Step 1: Failing test** — after 60 allows in same window, 61st is 429; when Redis throws, request still 200

- [ ] **Step 2: Implement Redis INCR + EXPIRE (60s window)** fail-open

```java
// Pseudocode
Long count = redis.opsForValue().increment(key);
if (count != null && count == 1) redis.expire(key, Duration.ofMinutes(1));
return count == null || count <= limit; // null → treat as allow (fail-open path separate via try/catch)
```

Only apply filter when `request.getRequestURI()` equals `/v1/desktop/config` (normalize context path).

Keep existing `IpRateLimitFilter` for other routes (in-memory) unless product wants Redis globally — **out of scope**.

- [ ] **Step 3: Document env in `deploy/server/README.md` or gateway README**: Redis required for meaningful RL; password from Infisical `DEVKIT_REDIS_PASSWORD`

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(gateway): Redis rate limit for desktop config with fail-open

EOF
)"
```

---

### Task 3: Desktop — `internal/cloudconfig` fetch + disk cache

**Files:**
- Create: `dev-kit-app/internal/cloudconfig/config.go` (struct + validation)
- Create: `dev-kit-app/internal/cloudconfig/cache.go`
- Create: `dev-kit-app/internal/cloudconfig/client.go`
- Create: `dev-kit-app/internal/cloudconfig/version.go`
- Create: `*_test.go` for each

**Interfaces:**
- Produces:
  - `const ProductionAPIBase = "https://api.synx.io.vn"`
  - `type Snapshot struct { ConfigVersion, OIDCIssuer, ... }`
  - `func (Snapshot) AuthConfig() (auth.Config, error)` — derive Keycloak URLs; call into shared validation (either export `auth.ConfigFromIssuer(...)` helper in auth package, or duplicate HTTPS checks carefully — **prefer** adding `auth.ConfigFromOIDC(issuer, clientID, scopes, authURL, tokenURL string) (Config, error)` that reuses `validConfig`)
  - `type Store interface { Load() (Snapshot, bool, error); Save(Snapshot) error }`
  - `func Fetch(ctx, baseURL, appVersion string, client *http.Client) (Snapshot, error)` — sets headers
  - `func CompareSemver(running, minimum string) (belowMin bool, err error)` — simple split on `.`, numeric; empty minimum → not below

- [ ] **Step 1: Failing tests** for cache round-trip, Fetch headers, invalid issuer rejected, semver below-min

- [ ] **Step 2: Implement** — cache file under `filepath.Join(configDir, "DevKit", "desktop-config.json")` mode `0600`

Fetch:

```go
req.Header.Set("X-DevKit-Client", "desktop/"+appVersion)
req.Header.Set("User-Agent", "DevKit-Desktop/"+appVersion)
req.Header.Set("Accept", "application/json")
```

Reject non-HTTPS base URL. Timeout ~5s. On 429 return distinct `ErrRateLimited`.

App version constant for v1: `cloudconfig.AppVersion = "0.1.0"` (document ldflags follow-up).

- [ ] **Step 3: `go test ./internal/cloudconfig/ ./internal/auth/ ./internal/arch/ -count=1` PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(cloudconfig): fetch and cache pinned desktop remote config

EOF
)"
```

---

### Task 4: Desktop — wire main + auth + version gate + clearer errors

**Files:**
- Modify: `dev-kit-app/main.go`
- Modify: `dev-kit-app/internal/bridge/errors.go` (and tests)
- Modify: `dev-kit-app/internal/bridge/sync.go` if needed for below-min / missing config sentinels
- Modify: `dev-kit-app/internal/app/container.go` if Auth setter / version status needed
- Optional: bridge method `CloudConfigStatus()` later — **YAGNI** unless UI needs it in this slice; minimum is block AuthLogin/SyncConnect

**Resolve order in `main`:**

1. If `auth.LoadConfigFromEnv()` OK → wire Auth (env wins); still may fetch cloudconfig for version gate only.
2. Else `cache.Load` → optional `Fetch` with timeout → `Save` on success → `AuthConfig()` → wire Auth.
3. If no usable OIDC → leave `Auth` nil.
4. If snapshot has `min_app_version` and `CompareSemver` says below → set `container.SyncBlockedReason` or similar; bridge AuthLogin/SyncConnect returns dedicated error.

**Error mapping:**

```go
// errors.go
case errors.Is(err, cloudconfig.ErrUnavailable):
  return apperrors.New(codeConnectionFailed, "Cloud configuration is unavailable. Connect to the internet once or set DEVKIT_OIDC_ISSUER.", true)
case errors.Is(err, cloudconfig.ErrAppBelowMinimum):
  return apperrors.New(codeConnectionFailed, "This DevKit version is too old for Sync. Please update.", true)
```

When Auth nil solely because config missing, map `ErrInvalidDependencies` on auth paths to the clearer cloud-config message **or** have AuthLogin check an explicit flag on container.

**Issuer change:** if cache had issuer A and fetch returns B while keychain has refresh: `auth.Logout()` / delete refresh store before replacing Auth service.

- [ ] **Step 1: Tests** for bridge error strings; optional main helper `resolveAuthConfig(...)` unit-tested in `cloudconfig` or `app` package

- [ ] **Step 2: Implement wiring**

- [ ] **Step 3: `go test ./internal/bridge/ ./internal/cloudconfig/ ./internal/auth/ ./internal/arch/ -count=1` PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(app): wire remote/cached OIDC config and Sync version gate

EOF
)"
```

---

### Task 5: Desktop — refresh when network returns

**Files:**
- Modify: `dev-kit-app/internal/cloudconfig/service.go` (or `refresh.go`)
- Modify: `main.go` to start background refresh

**Behavior:**
- After startup, loop: wait for connectivity (TCP dial to pinned host `:443` or successful Fetch), debounce 2s, Fetch, Save, apply version gate + issuer-change rules.
- On `ErrRateLimited`: backoff (e.g. 60s+jitter), do not tight-loop.
- Do not block UI thread; goroutine with context canceled on app shutdown if available.

- [ ] **Step 1: Unit test** fake clock/transport — after failed Fetch, successful retry updates snapshot

- [ ] **Step 2: Implement + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(cloudconfig): refresh desktop config when connectivity returns

EOF
)"
```

---

### Task 6: Docs + verification

**Files:**
- Modify: `dev-kit-app/README.md` — Current layout `cloudconfig/`; note remote config + env override
- Modify: `dev-kit-app/AGENTS.md` — brief
- Modify: backend ops doc — Redis + `DEVKIT_DESKTOP_OIDC_ISSUER` (or whatever property binding) + Infisical password
- Update spec status to Implemented when evidence ready

- [ ] **Step 1: Doc edits**

- [ ] **Step 2: Verification**

```bash
cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go test ./internal/cloudconfig/ ./internal/auth/ ./internal/bridge/ ./internal/arch/ -count=1
cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-backend/gateway && ./gradlew test
```

- [ ] **Step 3: Commit docs**

---

## Spec coverage

| Spec item | Task |
|---|---|
| Pin `api.synx.io.vn` + GET config | 1, 3 |
| Cache + offline | 3, 4 |
| Refresh on reconnect | 5 |
| Headers | 1, 3 |
| Redis RL 60/min fail-open | 2 |
| Env override | 4 |
| Version gate blocks Sync | 4 |
| Clearer errors | 4 |
| README / ops | 6 |
| Flat `cloudconfig` package | 3 |

## Placeholder / consistency review

- Redis key prefix `desktop-config:rl:` consistent.
- Header pattern `desktop/<semver>` consistent client/server.
- Fail-open only for Redis errors on config path, not for missing OIDC issuer in response (invalid payload → do not poison cache).
