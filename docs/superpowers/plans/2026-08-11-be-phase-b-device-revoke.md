# BE Phase B Device Revoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship self-service device list/revoke with durable PG revoke, Redis edge denylist TTL 60s read by Gateway, and desktop bridge/syncclient + G4 API revoke (no UI polish).

**Architecture:** Hexagonal identity use cases on the sync API write `devices.status=revoked` then `SET sync:revoked-device:{sub}:{deviceId}` in Redis. Gateway filter on `/v1/sync/**` EXISTS-checks Redis (fail-open). Desktop adds HTTP + capability-gated bridge methods. G4 uses two devices so last-ACTIVE guard does not block the revoke under test.

**Tech Stack:** Spring Boot sync API + Gateway MVC, Spring Data Redis (`StringRedisTemplate`), PostgreSQL, Docker Compose, Go desktop (`internal/sync`, `internal/syncclient`, `internal/bridge`, `cmd/synce2e`).

**Spec:** `base-doc/docs/superpowers/specs/2026-08-11-be-phase-b-device-revoke-design.md`  
**Backend mirror:** `dev-kit-backend/docs/specs/2026-08-11-sync-backend-phase-b-device-revoke.md`

## Global Constraints

- Redis is **not** on push/pull correctness path; PG `devices.status` remains durable truth.
- Redis key: `sync:revoked-device:{sub}:{deviceId}` where `{sub}` is Keycloak/JWT subject (Gateway has no internal account UUID). TTL **60s**.
- Gateway Redis down → **fail-open** (log warn); PG still returns 403 for revoked devices.
- Cannot revoke the last ACTIVE device → `409` via `ConflictException` (add dedicated handler; today `ConflictException` falls through to `422`).
- Missing target / other account → `404` via new `NotFoundException`.
- No Keycloak logout, no rename/reactivate, no device-management UI, no JetBrains 3-pane polish.
- Never log tokens, ciphertext, or raw JWT.
- Desktop layout: flat `internal/` packages; capability grants in `internal/app/container.go`; keep `go test ./internal/arch/` green.
- Local `docker-compose.yml` currently has **no** Redis service; Gateway already depends on `spring.data.redis` for desktop-config RL — add Redis on `sync-private-network` for API+Gateway.

## File map

| Path | Role |
|---|---|
| `dev-kit-backend/.../DeviceRepository.java` + `JdbcDeviceRepository.java` | `listByAccount`, `countActive`, `revoke` |
| `dev-kit-backend/.../DeviceEnrollmentRepository.java` + JDBC | `deleteByCreatedByDeviceId` |
| `dev-kit-backend/.../shared/error/NotFoundException.java` | 404 domain error |
| `dev-kit-backend/.../ApiExceptionHandler.java` | Map `NotFoundException`→404, `ConflictException`→409 |
| `dev-kit-backend/.../ListDevices*`, `RevokeDevice*` | Ports + services |
| `dev-kit-backend/.../DeviceRevocationDenylist.java` (port) + Redis adapter | Post-commit denylist write |
| `dev-kit-backend/.../DeviceController.java` (or split list/revoke) | `GET /v1/sync/devices`, `POST .../revoke` |
| `dev-kit-backend/build.gradle` + `application.yaml` | Redis dependency + config for API |
| `dev-kit-backend/docker-compose.yml` | Redis service + env for api/gateway |
| `dev-kit-backend/gateway/.../RevokedDeviceDenylistFilter.java` | EXISTS check fail-open |
| `dev-kit-backend/src/test/.../SyncApiIT.java` | API revoke cases; stop SQL-only revoke for happy path |
| `dev-kit-app/internal/sync/httptransport.go` (+ test) | `ListDevices` / `RevokeDevice` HTTP |
| `dev-kit-app/internal/syncclient/` | Thin wrappers if needed |
| `dev-kit-app/internal/bridge/sync.go` + `container.go` | `SyncListDevices` / `SyncRevokeDevice` |
| `dev-kit-app/cmd/synce2e/g4_auth_test.go` | Two-device API revoke |
| `base-doc/content/projects/dev-kit/*.mdx` | Flip Design → Implemented when verified |

---

### Task 1: Persistence — list / countActive / revoke / enrollment cleanup

**Files:**
- Modify: `dev-kit-backend/src/main/java/com/synx/devkit/identity/application/port/out/DeviceRepository.java`
- Modify: `dev-kit-backend/src/main/java/com/synx/devkit/identity/adapter/out/persistence/JdbcDeviceRepository.java`
- Modify: `dev-kit-backend/src/main/java/com/synx/devkit/identity/application/port/out/DeviceEnrollmentRepository.java`
- Modify: `dev-kit-backend/src/main/java/com/synx/devkit/identity/adapter/out/persistence/JdbcDeviceEnrollmentRepository.java`
- Modify: `dev-kit-backend/src/test/java/com/synx/devkit/identity/IdentityPersistenceIT.java`

**Interfaces:**
- Consumes: existing `Device`, `DeviceStatus`, JDBC patterns
- Produces:
  - `List<Device> listByAccount(UUID accountId)`
  - `long countActive(UUID accountId)`
  - `Optional<Device> revoke(UUID accountId, String deviceId, Instant now)` — sets `revoked` if row exists; returns updated device (or empty if missing)
  - `int deleteByCreatedByDeviceId(UUID accountId, String createdByDeviceId)`

- [ ] **Step 1: Extend ports**

```java
// DeviceRepository additions
List<Device> listByAccount(UUID accountId);
long countActive(UUID accountId);
Optional<Device> revoke(UUID accountId, String deviceId, Instant now);

// DeviceEnrollmentRepository addition
int deleteByCreatedByDeviceId(UUID accountId, String createdByDeviceId);
```

- [ ] **Step 2: Implement JDBC**

```sql
-- listByAccount
SELECT id, account_id, device_id, status, protocol_version, first_seen_at, last_seen_at
FROM devices WHERE account_id = :accountId ORDER BY first_seen_at ASC, device_id ASC

-- countActive
SELECT COUNT(*) FROM devices WHERE account_id = :accountId AND status = 'active'

-- revoke (idempotent for already-revoked: still RETURNING row)
UPDATE devices
SET status = 'revoked', last_seen_at = :now
WHERE account_id = :accountId AND device_id = :deviceId
RETURNING id, account_id, device_id, status, protocol_version, first_seen_at, last_seen_at

-- deleteByCreatedByDeviceId
DELETE FROM device_enrollments
WHERE account_id = :accountId AND created_by_device_id = :createdByDeviceId
```

- [ ] **Step 3: Persistence IT**

In `IdentityPersistenceIT`, cover: list returns only account devices; revoke flips status; `countActive` decrements; `deleteByCreatedByDeviceId` removes pending enrollments created by that device.

- [ ] **Step 4: Run tests**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-backend && ./gradlew test --tests com.synx.devkit.identity.IdentityPersistenceIT`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-backend
git add src/main/java/com/synx/devkit/identity/application/port/out/DeviceRepository.java \
  src/main/java/com/synx/devkit/identity/adapter/out/persistence/JdbcDeviceRepository.java \
  src/main/java/com/synx/devkit/identity/application/port/out/DeviceEnrollmentRepository.java \
  src/main/java/com/synx/devkit/identity/adapter/out/persistence/JdbcDeviceEnrollmentRepository.java \
  src/test/java/com/synx/devkit/identity/IdentityPersistenceIT.java
git commit -m "$(cat <<'EOF'
feat(identity): add device list/revoke persistence ports

Support Phase B self-service revoke with active counts and enrollment cleanup by creator device.
EOF
)"
```

---

### Task 2: HTTP error mapping — 404 and 409

**Files:**
- Create: `dev-kit-backend/src/main/java/com/synx/devkit/shared/error/NotFoundException.java`
- Modify: `dev-kit-backend/src/main/java/com/synx/devkit/shared/adapter/in/web/ApiExceptionHandler.java`
- Create/Modify: `dev-kit-backend/src/test/java/com/synx/devkit/shared/adapter/in/web/ApiExceptionHandlerTest.java` (or existing equivalent)

**Interfaces:**
- Consumes: `DomainException` hierarchy (`ConflictException` already exists with code `"conflict"`)
- Produces: `NotFoundException` code `"not_found"` → HTTP 404; `ConflictException` → HTTP 409 (must not remain 422)

- [ ] **Step 1: Add `NotFoundException`**

```java
package com.synx.devkit.shared.error;

public final class NotFoundException extends DomainException {
    public NotFoundException(String message) {
        super("not_found", message);
    }
}
```

- [ ] **Step 2: Update `ApiExceptionHandler`**

Add handlers **before** the generic `DomainException` handler:

```java
@ExceptionHandler(NotFoundException.class)
ResponseEntity<ApiErrorResponse> notFound(NotFoundException error, HttpServletRequest request) {
    return response(HttpStatus.NOT_FOUND, error.code(), "Resource was not found", request);
}

@ExceptionHandler(ConflictException.class)
ResponseEntity<ApiErrorResponse> conflict(ConflictException error, HttpServletRequest request) {
    return response(HttpStatus.CONFLICT, error.code(), "Request conflicts with current state", request);
}
```

- [ ] **Step 3: Unit-test status codes**

Assert `NotFoundException` → 404 and `ConflictException` → 409 (not 422).

- [ ] **Step 4: Run tests + commit**

Run: `./gradlew test --tests '*ApiExceptionHandler*'`

```bash
git add src/main/java/com/synx/devkit/shared/error/NotFoundException.java \
  src/main/java/com/synx/devkit/shared/adapter/in/web/ApiExceptionHandler.java \
  src/test/java/com/synx/devkit/shared/adapter/in/web/
git commit -m "$(cat <<'EOF'
fix(api): map not-found and conflict to 404/409

Phase B revoke needs distinct last-active conflicts and missing-device responses.
EOF
)"
```

---

### Task 3: ListDevices + RevokeDevice use cases (no Redis yet)

**Files:**
- Create: `.../port/in/ListDevicesUseCase.java`, `ListDevicesCommand.java`, `DeviceSummary.java`
- Create: `.../port/in/RevokeDeviceUseCase.java`, `RevokeDeviceCommand.java`
- Create: `.../service/ListDevicesService.java`, `RevokeDeviceService.java`
- Modify: `.../bootstrap/configuration/ApplicationConfiguration.java`
- Create: `.../test/.../RevokeDeviceServiceTest.java` (pure unit with fakes)

**Interfaces:**
- Consumes: `AuthorizedSyncContext`, `DeviceRepository`, `DeviceEnrollmentRepository`, `AuditEventSink`, `TransactionRunner`, `Clock`
- Produces:
  - `ListDevicesUseCase.list(ListDevicesCommand)` → `List<DeviceSummary>`
  - `RevokeDeviceUseCase.revoke(RevokeDeviceCommand)` → void
  - `DeviceSummary(String deviceId, String status, Instant createdAt, Instant lastSeenAt, boolean current)`
  - `RevokeDeviceCommand(AuthorizedSyncContext context, String subject, String targetDeviceId, String requestId)`
    - `subject` required for later Redis key (Task 5); pass through now even if unused

- [ ] **Step 1: Failing unit test — last ACTIVE → ConflictException**

```java
@Test
void revokeRejectsLastActiveDevice() {
    // one ACTIVE device matching target; countActive==1
    assertThrows(ConflictException.class, () -> service.revoke(command));
}
```

- [ ] **Step 2: Implement `RevokeDeviceService`**

```java
return transactions.required(() -> {
    devices.lockRegistration(command.context().accountId());
    var target = devices.find(command.context().accountId(), command.targetDeviceId())
            .orElseThrow(() -> new NotFoundException("device was not found"));
    if (target.status() == DeviceStatus.REVOKED) {
        return; // idempotent no-op inside TX; denylist refresh in Task 5
    }
    if (devices.countActive(command.context().accountId()) <= 1) {
        throw new ConflictException("cannot revoke the last active device");
    }
    Instant now = clock.instant();
    devices.revoke(command.context().accountId(), command.targetDeviceId(), now);
    enrollments.deleteByCreatedByDeviceId(command.context().accountId(), command.targetDeviceId());
    audit.record(new AuditEvent(
            command.requestId(),
            command.context().accountId(),
            command.context().deviceId(),
            "device.revoked",
            Map.of(
                    "target_device_id", command.targetDeviceId(),
                    "actor_device_id", command.context().deviceId()),
            now));
});
```

- [ ] **Step 3: Implement `ListDevicesService`**

Map `Device.firstSeenAt()` → `createdAt`; `current = device.deviceId().equals(context.deviceId())`; status lower-case `active|revoked` for JSON.

- [ ] **Step 4: Wire `@Bean`s in `ApplicationConfiguration`**

- [ ] **Step 5: Run unit tests + commit**

Run: `./gradlew test --tests com.synx.devkit.identity.application.service.RevokeDeviceServiceTest --tests com.synx.devkit.identity.application.service.ListDevicesServiceTest`

```bash
git commit -m "$(cat <<'EOF'
feat(identity): add list/revoke device use cases

Enforce last-active guard, audit device.revoked, and clear creator enrollments.
EOF
)"
```

---

### Task 4: HTTP controllers + SyncApiIT

**Files:**
- Create: `.../adapter/in/web/DeviceController.java`
- Create: `.../adapter/in/web/DeviceListResponse.java`, `DeviceResponse.java`
- Modify: `.../e2e/SyncApiIT.java`

**Interfaces:**
- Consumes: `SyncRequestAuthorizer`, `ListDevicesUseCase`, `RevokeDeviceUseCase`, `GatewayIdentityResolver` (for `subject` on revoke)
- Produces: routes
  - `GET /v1/sync/devices`
  - `POST /v1/sync/devices/{deviceId}/revoke`

Note: keep `@RequestMapping` so enrollments path `/v1/sync/devices/enrollments` still hits `DeviceEnrollmentController` (more specific mapping). Prefer:

```java
@RestController
@RequestMapping("/v1/sync/devices")
public final class DeviceController {
    @GetMapping
    public DeviceListResponse list(...) { ... }

    @PostMapping("/{deviceId}/revoke")
    public void revoke(..., @PathVariable String deviceId) { ... }
}
```

- [ ] **Step 1: Implement controller**

Pattern matches `DeviceEnrollmentController`:

```java
var context = authorizer.authorize(jwt, deviceIdHeader, protocolText);
var identity = identities.resolve(jwt); // or authorizer already resolved — pass jwt.getSubject()
devices.revoke(new RevokeDeviceCommand(context, jwt.getSubject(), pathDeviceId, requestId(request)));
```

- [ ] **Step 2: SyncApiIT cases**

1. Two devices enrolled → list shows both; `current` true for caller.
2. Revoke second device via API → session/push/pull as revoked device → `403`.
3. Attempt revoke last ACTIVE → `409`.
4. Revoke unknown id → `404`.
5. Idempotent revoke already-revoked → `200`.
6. Cross-account cannot see/revoke other account devices.
7. Replace SQL revoke in `revokedDeviceIsRejectedAndAccountsCannotReadEachOther` with API revoke **after** ensuring a second ACTIVE device exists (or split into dedicated tests).

- [ ] **Step 3: Run**

Run: `./gradlew test --tests com.synx.devkit.e2e.SyncApiIT`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(identity): expose device list and revoke HTTP API

Replace SQL-only operational revoke paths in SyncApiIT with authenticated API flows.
EOF
)"
```

---

### Task 5: API Redis denylist writer

**Files:**
- Modify: `dev-kit-backend/build.gradle` — add `spring-boot-starter-data-redis`
- Modify: `dev-kit-backend/src/main/resources/application.yaml` — `spring.data.redis.*` from `DEVKIT_REDIS_*`
- Create: `.../identity/application/port/out/DeviceRevocationDenylist.java`
- Create: `.../identity/adapter/out/redis/RedisDeviceRevocationDenylist.java`
- Modify: `RevokeDeviceService` — after successful TX (including idempotent already-revoked), call denylist
- Create: unit test with mock denylist; IT optional with Testcontainers/embedded if project already has Redis test infra — otherwise mock + compose smoke later

**Interfaces:**
- Produces: `void put(String subject, String deviceId, Duration ttl)`
- Key helper: `"sync:revoked-device:" + subject + ":" + deviceId`
- Default TTL: `Duration.ofSeconds(60)`
- Fail-open on Redis errors (log warn; revoke still succeeded in PG)

- [ ] **Step 1: Port + Redis adapter**

```java
public interface DeviceRevocationDenylist {
    void put(String subject, String deviceId, Duration ttl);
}

public final class RedisDeviceRevocationDenylist implements DeviceRevocationDenylist {
    public void put(String subject, String deviceId, Duration ttl) {
        try {
            redis.opsForValue().set(key(subject, deviceId), "1", ttl);
        } catch (Exception ex) {
            log.warn("Revocation denylist write failed subject_len={} device_id={}",
                    subject == null ? 0 : subject.length(), deviceId, ex);
        }
    }
}
```

- [ ] **Step 2: Call after TX in `RevokeDeviceService`**

```java
transactions.required(() -> { ... mutate PG ... });
denylist.put(command.subject(), command.targetDeviceId(), Duration.ofSeconds(60));
```

For idempotent already-revoked: still refresh denylist TTL (per spec).

- [ ] **Step 3: Wire bean + properties; unit test verifies put invoked**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(identity): write Redis device revocation denylist

Publish a 60s edge denylist key after durable revoke for Gateway early reject.
EOF
)"
```

---

### Task 6: Compose Redis for local stack

**Files:**
- Modify: `dev-kit-backend/docker-compose.yml`
- Modify: `dev-kit-backend/docs/operations/local-development.md` (Redis env)
- Optionally align `.env.example` if present

**Interfaces:**
- Produces: `redis` service on `sync-private-network` (reuse `Dockerfile.redis` like deploy infra), env:
  - `DEVKIT_REDIS_HOST=redis` / port `6379` / password from `.env`
  - Wire into `devkit-api` and `devkit-gateway`

- [ ] **Step 1: Add redis service**

Follow hardened pattern from `deploy/server/docker-compose.infrastructure.yml` but **always-on** for local compose (not only `bundled-redis` profile), password via `${DEVKIT_REDIS_PASSWORD}`.

- [ ] **Step 2: Env on api + gateway**

```yaml
DEVKIT_REDIS_HOST: redis
DEVKIT_REDIS_PORT: 6379
DEVKIT_REDIS_PASSWORD: ${DEVKIT_REDIS_PASSWORD:?Set DEVKIT_REDIS_PASSWORD in .env}
```

Map in Spring as already used by gateway (`spring.data.redis.password: ${DEVKIT_REDIS_PASSWORD:}`). Mirror same property names on API `application.yaml`.

- [ ] **Step 3: Document + commit**

```bash
git commit -m "$(cat <<'EOF'
chore(compose): add Redis for revocation denylist

Give local API and Gateway a shared Redis on the private sync network.
EOF
)"
```

---

### Task 7: Gateway revoked-device denylist filter

**Files:**
- Create: `gateway/src/main/java/com/synx/devkit/gateway/security/RevokedDeviceDenylist.java` (EXISTS helper, fail-open)
- Create: `gateway/src/main/java/com/synx/devkit/gateway/security/RevokedDeviceDenylistFilter.java`
- Modify: `gateway/.../SecurityConfiguration.java` (bean + filter order)
- Create: `gateway/src/test/java/com/synx/devkit/gateway/security/RevokedDeviceDenylistTest.java`
- Modify: `gateway/src/test/java/com/synx/devkit/gateway/GatewayFlowIT.java` (or new IT) for 403 when key present

**Interfaces:**
- Consumes: `StringRedisTemplate`, Keycloak `JwtAuthenticationToken.getToken().getSubject()`, header `X-DevKit-Device-ID`
- Filter path: `/v1/sync/**` only
- Order: after authentication, **before** `GatewayIdentityRelayFilter` mint (reject early)

- [ ] **Step 1: Unit test fail-open + hit**

```java
@Test
void missingRedisAllows() { when(redis.hasKey(...)).thenThrow(...); assertTrue(denylist.isRevoked(...)); wait — isRevoked should return false on error }

@Test
void presentKeyBlocks() { when(redis.hasKey(key)).thenReturn(true); assertTrue(denylist.isRevoked(sub, device)); }
```

Clarify API: `boolean isDenied(String subject, String deviceId)` returns `true` only when key exists; on error returns `false`.

- [ ] **Step 2: Filter**

```java
if (denylist.isDenied(jwt.getSubject(), deviceIdHeader)) {
    response.sendError(HttpServletResponse.SC_FORBIDDEN);
    return;
}
```

If device header missing/blank, do not special-case beyond existing downstream validation (or reject 400 consistently with other filters — prefer leave to backend if header required later).

- [ ] **Step 3: Run gateway tests**

Run: `./gradlew :gateway:test`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(gateway): reject sync requests on Redis device denylist

Close the post-revoke edge window while Keycloak access tokens remain valid.
EOF
)"
```

---

### Task 8: Desktop HTTP list/revoke

**Files:**
- Modify: `dev-kit-app/internal/sync/httptransport.go`
- Modify: `dev-kit-app/internal/sync/httptransport_test.go`
- Optionally thin wrappers in `internal/syncclient/` if bridge should not import transport details directly — prefer methods on existing authenticator/client used by syncclient

**Interfaces:**
- Produces:
  - `ListDevices(ctx, accessToken, localDeviceID) ([]DeviceInfo, error)`
  - `RevokeDevice(ctx, accessToken, localDeviceID, targetDeviceID string) error`
  - `DeviceInfo` with `DeviceID`, `Status`, `CreatedAt`, `LastSeenAt`, `Current`

Reuse same headers as session (`Authorization`, `X-DevKit-Device-ID`, `X-DevKit-Sync-Protocol: 1`). Map 401/403 to existing transport failure reasons so callers clear session consistently.

- [ ] **Step 1: Failing test — revoke sends POST path**

httptest```go
func TestRevokeDevicePostsPath(t *testing.T) {
    // server expects POST /v1/sync/devices/target-1/revoke with device header
}
```

- [ ] **Step 2: Implement client methods**

- [ ] **Step 3: `go test ./internal/sync/ -count=1` PASS**

- [ ] **Step 4: Commit** (in `dev-kit-app`)

```bash
git commit -m "$(cat <<'EOF'
feat(sync): add HTTP list/revoke device client

Call Phase B device management endpoints with the existing sync auth headers.
EOF
)"
```

---

### Task 9: Bridge + capabilities

**Files:**
- Modify: `dev-kit-app/internal/bridge/sync.go`
- Modify: `dev-kit-app/internal/bridge/sync_test.go`
- Modify: `dev-kit-app/internal/app/container.go` — grants `sync:devices`
- Modify: `dev-kit-app/internal/app/app_test.go` / `app_service_test.go` if grant lists asserted
- Self-revoke success: clear local session via existing disconnect/clear path used on auth failure

**Interfaces:**
- Produces: `SyncListDevices() (...)`, `SyncRevokeDevice(targetDeviceID string) error`
- Capability: `s.call(..., "builtin.sync", "sync:manage", "sync:devices", metadata, handler)`

- [ ] **Step 1: Add grants + failing bridge test for scope**

- [ ] **Step 2: Implement bridge methods calling syncclient/transport with current access token**

- [ ] **Step 3: On successful revoke where `target == local device`, clear session**

- [ ] **Step 4: `go test ./internal/bridge/ ./internal/app/ ./internal/arch/ -count=1` PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(bridge): expose SyncListDevices and SyncRevokeDevice

Gate device revoke behind sync:devices capability without shipping polished UI.
EOF
)"
```

---

### Task 10: G4 — API revoke with two devices

**Files:**
- Modify: `dev-kit-app/cmd/synce2e/g4_auth_test.go`
- Modify: `dev-kit-app/cmd/synce2e/harness_test.go` if helpers needed

**Critical behavior change:** last-ACTIVE guard means single-device self-revoke via API returns `409`. G4 must:

1. Bootstrap device A
2. Enroll + connect device B (existing enroll helpers)
3. From A, `RevokeDevice(B)` via HTTP/API helper (not SQL)
4. Assert B `SyncNow` fails auth and clears session
5. A remains connected

- [ ] **Step 1: Replace `revokeDevice` SQL/docker helpers with API helper**

```go
func revokeDeviceAPI(t *testing.T, baseURL, accessToken, actorDeviceID, targetDeviceID string) {
    // POST {baseURL}/v1/sync/devices/{target}/revoke with actor headers
}
```

Keep SQL helper only if a separate ops test needs it — prefer delete unused SQL revoke helpers once G4 migrated.

- [ ] **Step 2: Rewrite `TestG4RevokedDeviceRejected` for two-device flow**

- [ ] **Step 3: Run matrix when stack up**

Run: `cd /Users/syuro/Workspace/PERSONAL/dev-kit/dev-kit-app && go test ./cmd/synce2e/ -run 'TestG4RevokedDeviceRejected' -count=1 -timeout 15m`

Expected: PASS (with deployed env). Without env: Skip.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
test(synce2e): revoke devices through HTTP API in G4

Exercise Phase B revoke with two devices so last-active protection stays intact.
EOF
)"
```

---

### Task 11: Docs status flip (after verification)

**Files:**
- Modify: `base-doc/content/projects/dev-kit/implementation-status.mdx`
- Modify: `base-doc/content/projects/dev-kit/saas-backend.mdx`
- Modify: `base-doc/content/projects/dev-kit/roadmap.mdx`
- Modify: `base-doc/content/projects/dev-kit/security-controls.mdx`
- Modify: `base-doc/docs/superpowers/specs/2026-08-11-be-phase-b-device-revoke-design.md` — Status: Implemented + evidence commands
- Modify: `dev-kit-backend/docs/specs/2026-08-11-sync-backend-phase-b-device-revoke.md` — Status: Implemented

- [ ] **Step 1: Only after Tasks 1–10 green** — flip Design → Implemented with commit SHAs / test commands

- [ ] **Step 2: Commit docs in both repos**

```bash
# base-doc
git commit -m "$(cat <<'EOF'
docs(dev-kit): mark BE Phase B device revoke Implemented

Record API, Redis denylist, Gateway filter, and G4 API evidence.
EOF
)"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|---|---|
| `GET /v1/sync/devices` | 3–4 |
| `POST .../revoke` + last ACTIVE `409` | 2–4 |
| Idempotent revoked → 200 | 3–4 |
| Audit `device.revoked` | 3 |
| Delete enrollments by creator | 1, 3 |
| Redis key `sync:revoked-device:{sub}:{deviceId}` TTL 60s after commit | 5–6 |
| Gateway EXISTS deny; Redis down fail-open | 7 |
| Desktop bridge tối thiểu | 8–9 |
| G4 uses API (two-device) | 10 |
| Docs update | 11 (after verify) |
| No Keycloak logout / UI polish | Out of scope — not tasked |

**Placeholder scan:** none intentional.  
**Type consistency:** `DeviceSummary` / `DeviceInfo` naming differs by language — map fields identically (`deviceId`, `status`, `createdAt`←`firstSeenAt`, `lastSeenAt`, `current`).
