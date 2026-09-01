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

### Stale blank env vars in ACM's store silently override a correct on-disk `.env` value

ACM injects a project's stored `environmentVars` as process environment for every spawned
`docker compose` command (`pipeline-service.ts` and `ProjectService.runCompose`/`runCommand`) —
it never writes them to a file. Docker Compose's variable interpolation gives a variable that is
*set* in the shell/process environment priority over the same variable in the project's `.env`
file, and this holds even when the process-env value is an empty string: an empty string still
counts as "set," so `${SOME_VAR:-default}` does not fall through to `.env`'s value or to the
compose-file default — it resolves to empty. Concretely, this is what caused the
`koodakbook-db-backup-1` crash loop on 2026-08-30/31: ACM's stored record for
`HEARTBEAT_BACKUP_URL`/`HEARTBEAT_DRILL_URL` had gone stale at `""` from before those were
configured, `.env` had the real values, and every ACM-triggered deploy silently re-blanked them in
the container regardless — for ~21 hours, until the stored record was corrected directly and ACM
restarted to reload it.

This is a **general hazard, not specific to those two variables**: any key that is blank in ACM's
store but has a real value in the project's `.env` will silently lose to the blank on every deploy,
with no warning that the file value is being shadowed. The safe fix is at the injection site —
`ProjectService` should skip passing through `environmentVars` entries whose value is empty/blank
(rather than injecting `KEY=""`) so an unset-in-ACM key falls through to whatever `.env` or the
compose file provides, instead of ACM's blank silently winning. Worth auditing whether the same
empty-string passthrough happens anywhere `environmentVars` is spread into a command environment
outside the deploy path (e.g. one-off `runCommand` calls), not just the main deploy stage.

**Precedence, and how to actually check "is this variable set?":** ACM's stored record wins at
deploy time (per above), so it is the only answer that matters operationally — checking a project's
`.env` on disk and reporting that as the variable's state is misleading even when read correctly,
because ACM's store can (and did, twice, for KoodakBook: `HEARTBEAT_BACKUP_URL`/`_DRILL_URL` and
`TTS_ELEVENLABS_KEY`) silently override it. Check ACM's own record first: `projects.payload` in
`/data/db/manager.sqlite` (`SELECT payload FROM projects WHERE name = ?`, then
`JSON.parse(payload).environmentVars[<KEY>]`) — no `sqlite3` CLI is installed in the
`advanced-container-manager` container, but `better-sqlite3` is already a dependency, so query it
via `docker exec advanced-container-manager node -e "..."` (open the DB with `{ readonly: true }`).

A second wrinkle found 2026-08-31: the ACM **dashboard UI** showing a variable as filled in is not
proof it was persisted, either. A KoodakBook edit made during an ISP outage looked "set" in the
project-settings form, but the sqlite record's `environmentVars.TTS_ELEVENLABS_KEY` was still `""`
— the save request most likely never completed before the connection dropped, and the form's local
state didn't reflect that. So there are three places a value can look different: the UI form
(can hold an unsaved edit), ACM's persisted record (the one that's actually injected), and `.env`
(shadowed by the persisted record, even when blank). Treat the sqlite record as the single source
of truth for "will this actually be used" — confirm a UI edit stuck by re-reading the record after
saving, don't take the form's display at face value.

A third, distinct case surfaced during the same 2026-08-31 incident: deploying **outside** ACM's
service layer altogether. `ProjectService.deployProject()` is the only code path that reads a
project's decrypted `environmentVars` out of the in-memory `this.projects` map and spreads them
into the spawned `docker compose` process's environment (`runCompose`/`runCommand`, both in
`backend/src/services/project-service.ts`). A manual `docker exec advanced-container-manager sh -c
"cd <project> && docker compose up -d --build"` — run directly against the ACM container's shell
instead of through its API/dashboard — never touches that code at all: it's a bare shell invoking
`docker compose` with whatever environment that shell process happens to have, which does not
include any project's `environmentVars`. The result isn't a stale or blank value shadowing a good
one (cases above); it's every ACM-only secret coming up completely unset in the new container, with
no error anywhere — compose silently falls through to `${VAR:-default}` (usually empty) exactly as
if the key had never been configured. This is what left `TTS_ELEVENLABS_KEY` empty inside
`koodakbook-backend-1` after one such manual deploy, even though the correct value was sitting,
correctly saved, in ACM's own store the entire time. There is no way to tell from inside the
resulting container that this is what happened — it looks identical to "the value was never set."
The fix is procedural, not code: any deploy of a project with ACM-managed secrets must go through
ACM's own Deploy/Sync & Deploy action (dashboard or API), never a raw `docker compose`/`docker exec`
invocation against the project directory, even when that directory is reachable and the compose
file is otherwise correct.

## Suggested Next Enhancements

1. Persist `/api/settings` to disk (same config store as projects) with schema validation
2. Add a dedicated API endpoint to return full compose config diff before applying changes
3. Add explicit “port availability check” endpoint that reports:
   - managed project conflicts
   - running container conflicts
   - host process conflicts (optional via `lsof`/`ss`)
4. Add automated tests for `ProjectService.updateProjectSettings` validation paths
