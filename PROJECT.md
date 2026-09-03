# Advanced Container Manager - Project Review and Enhancement Log

## Status: In Progress

This file tracks verified behavior from code and recent improvements.

## Review Summary

### Strong Areas

- Core Docker management flows are functional (`containers`, `images`, `networks`, `volumes`)
- Project lifecycle exists end-to-end (`add`, `build`, `sync`, `deploy`, `stop`, `logs`, `health`)
- Compose-based deployment is real (not mocked) via `docker compose`/`docker-compose` fallback
- Frontend structure is clear and modular with route-based pages

### Key Gaps Found

- Global app settings endpoints (`/api/settings*`) are still placeholder/in-memory behavior
- Some docs imply completed features that are still partial or mocked
- Port conflicts were not managed at project-compose editing level
- Project update API previously only handled environment variables

## Implemented Enhancement (This Update)

### Project Compose Settings Update

Added real project settings update capability through existing project update flow:

- Endpoint: `PUT /api/projects/:name`
- Now supports:
  - `environmentVars` updates (existing)
  - `composeFile` update (switch compose file used by project)
  - `portUpdates` update for compose service port mappings

### Port Conflict Handling

Added validation during compose port updates:

- Rejects invalid port values (must be `1..65535`)
- Rejects duplicate host ports inside the same compose file
- Rejects host-port conflicts with other managed projects in app config
- Detects conflicts with currently running Docker containers and logs warnings

### Frontend UX Update (Projects Settings Modal)

Enhanced project settings modal to allow:

- Editing compose file path
- Editing detected compose host ports per service/container/protocol mapping
- Saving compose settings and environment vars in one action

### Live Deploy Logs (WebSocket Streaming)

Deploy logs are now streamed live to the UI while a project deploy is running:

- Backend emits incremental stdout/stderr chunks via Socket.IO events:
  - `project_deploy_log`
  - `project_deploy_status` (`started`/`completed`/`failed`)
- Frontend subscribes per-project to a deploy room and appends chunks to the “Deploy Logs” modal in real time.

## Current API Reality (High-Level)

Implemented and active:

- `/health`
- `/api/system/metrics`, `/api/system/metrics/history`
- `/api/containers`, `/api/containers/:id/*`
- `/api/images`, `/api/networks`, `/api/volumes`
- `/api/projects`, `/api/projects/:name/*` (including logs, deploy, compose settings update)
- `/api/terminal/*`

Still partial or mocked:

- `/api/settings*` persistence and restore behavior
- Some multi-cloud and analytics paths return placeholder responses

## Known Hazards

### Pipeline rollback can revert production against a rewritten history

A failed pipeline run's rollback stage does a real `git reset --hard $ACM_PREVIOUS_SHA` + redeploy
against the live project (`backend/src/services/pipeline-service.ts`) — it is not a dry run or a
staging-only action. `ACM_PREVIOUS_SHA` is captured as the SHA the project was on before the run
started. If that commit is later removed from history by a force-push (rebase, `push --force`,
branch rewrite), the rollback target no longer exists on the remote: the reset can silently land on
whatever `git reset --hard` resolves to locally, which is not necessarily the commit the operator
thinks a "failed test run" should revert to. Practically, this makes "run the pipeline to see if a
change breaks something" and "revert production to a specific prior state" the same action with the
same blast radius — there is no dry-run mode. Anyone testing a pipeline against a branch with
force-pushed history should confirm `ACM_PREVIOUS_SHA` still resolves before trusting a rollback.

### Artifact capture on stage failure (fixed)

`captureArtifacts()` was previously only invoked from the success path of `runStageCommands`
(after `runCommandsOnce` and any healthcheck passed) — a failing stage returned before artifacts
were ever captured. For an `e2e` stage, that meant the Playwright HTML report and traces (exactly
the evidence needed to diagnose *why* the stage failed) were discarded on every failing run and
only ever saved when the stage happened to pass. Fixed: `runStageCommands` now also calls
`captureArtifacts()` on the final failing attempt (after retries are exhausted), so
`data/db/pipeline-artifacts/<runId>/<stage>/` is populated on failure too. `captureArtifacts()`
already tolerated missing/partial paths (logs and skips), so this required no other changes.

### OPEN, UNEXPLAINED: a saved env var sometimes never reaches the deployed container

Observed twice, same signature both times: an operator adds/changes a project env var in the
settings UI, the `PUT /projects/:name` request 200s, `lastUpdated` bumps, and the operator confirms
in the UI (including after a page reload) that the new value is saved — yet the value that actually
shows up in the deployed container's env (`docker exec <container> printenv <VAR>`) is the *old*
value, sometimes several save-and-redeploy cycles later.

Affected so far: `NEXT_PUBLIC_SITE_URL` (KoodakBook, reported first — see the pre-existing diagnostic
comment/log in `backend/src/routes/index.ts`'s `PUT /projects/:name` handler, added specifically to
chase this) and `ADMIN_TELEGRAM_CHAT_ID` (KoodakBook, 2026-09-03 — took four save+redeploy rounds
before the container showed the correct value).

**Investigated, not found.** For the `ADMIN_TELEGRAM_CHAT_ID` case, code review of the whole path —
`updateProjectSettings`'s env-var merge order, `saveProjects`/`loadProjects` (sqlite persistence),
`encryptEnvVars`/`decryptEnvVars` (AES-256-GCM, fresh IV per call), `deployProject`/`runCompose`
(env passed in-memory to the child process, no file I/O), `pullLatestProject`'s own separate merge —
found nothing that explains a submitted value being silently dropped or overwritten. In particular:
- `project.environmentVars = { ...discoveredEnvVars, ...(environmentVars || {}) }` spreads the
  submitted/stored value *last*, so it should always win over a compose-file-derived default.
- Confirmed directly: `${ADMIN_TELEGRAM_CHAT_ID:-}`'s empty default resolves to a real `""` entry in
  `discoveredEnvVars` (via `resolveComposeValue`), but since it's spread first, this alone cannot be
  the mechanism.
- `GET /projects/:name` and `deployProject` both read `this.projects.get(name)` — the same in-memory
  object, same single Node process (confirmed one process, one `ProjectService` instantiation) — so
  a naive "UI reads stale state" theory doesn't hold either.
- No periodic/background reload of `this.projects` exists; `loadProjects()` runs once at startup.

On the fourth attempt at the `ADMIN_TELEGRAM_CHAT_ID` case, the value *did* land correctly — but this
was not attributed to any specific fix. It's possible some earlier "still wrong" observations were
timing artifacts (checking the container before a redeploy had finished swapping it in — this
happened at least once during the investigation itself, caught only because the container's own
`StartedAt` was cross-checked against the deploy log timestamp). It's equally possible this is a real
intermittent bug that happened not to reproduce once tooling was in place to catch it. Neither has
been confirmed.

**If this recurs**: don't start from scratch. A branch named `debug/admin-telegram-chat-id-env-trace`
(may be deleted by the time you read this — recreate from this diff if so) adds four presence+length-
only log points (never the actual value) tracing one env var end to end:
1. `routes/index.ts`'s `PUT /projects/:name` handler — the request body as parsed.
2. `updateProjectSettings` — the payload as received, pre-merge (also logs the compose file's
   discovered default for the same key, to rule the empty-default theory in or out on the spot).
3. `updateProjectSettings` — `project.environmentVars` right after the merge + `saveProjects()`.
4. `deployProject` — `project.environmentVars` right before the `docker compose up` call.
Comparing lengths across these four points on one clean save-and-redeploy cycle splits "frontend
never sent the right value" / "merge or save silently dropped it" / "correct in storage but the
deploy step is reading something else" into three distinct, checkable outcomes — decisively, without
needing to decrypt the sqlite-stored value (which needs the encryption key file and should not be
done casually). Generalize past the one hardcoded var name if tracing a different key next time.

### Resource-limits editor silently deletes/overwrites any project's own `docker-compose.override.yml`

`ProjectService.applyResourceLimits` (`backend/src/services/project-service.ts:2222`) treats
`docker-compose.override.yml` as ACM's own private scratch file for per-project CPU/memory limits.
When limits are unset or at default, it unconditionally `fs.unlinkSync`s that path; when limits are
set, it overwrites the whole file with a fresh `{ services: { <name>: { deploy: { resources: ... } } } }`
document. Either way, anything else that was in that file is destroyed with no warning, no diff, no
backup.

`docker-compose.override.yml` is not an ACM-private name — it's the standard Docker Compose
convention for local/environment-specific overrides (auto-merged by `docker compose up` with no
extra flag), so any managed project has an entirely legitimate, ACM-unrelated reason to have one.
Confirmed live: KoodakBook committed one to restrict two ports to loopback-only (a security fix,
unrelated to resource limits); a resource-limits save on that project in ACM (including one that
lands back at defaults) deleted it, and the ports it was meant to protect were live-exposed on
`0.0.0.0` as a result. Any other managed project using this filename for its own purposes is
equally at risk, silently, the next time its resource limits are touched in ACM.

Two ways to close this, from least to most invasive: (a) `applyResourceLimits` should merge into
an existing override file's `services.<name>.deploy.resources` keys rather than clobbering the
whole document, and delete only its own keys (not the file) when limits reset to default; (b)
simpler and more robust — stop using the standard filename at all and write ACM's own limits to a
distinctly-named file (e.g. `docker-compose.acm-resources.yml`) that Compose won't auto-merge
unless explicitly listed with `-f`, requiring ACM to pass `-f docker-compose.yml -f
docker-compose.acm-resources.yml` explicitly wherever it invokes compose for a project with limits
set. (b) fully removes the collision; (a) only reduces its blast radius.

## Suggested Next Enhancements

1. Persist `/api/settings` to disk (same config store as projects) with schema validation
2. Add a dedicated API endpoint to return full compose config diff before applying changes
3. Add explicit “port availability check” endpoint that reports:
   - managed project conflicts
   - running container conflicts
   - host process conflicts (optional via `lsof`/`ss`)
4. Add automated tests for `ProjectService.updateProjectSettings` validation paths
