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

### RESOLVED: a saved env var sometimes never reaches the deployed container

Was tracked here as open and unexplained; has a mundane cause, confirmed 2026-09-03. **A project's
env vars only reach the container when the deploy that recreates it runs through ACM's own
`deployProject` path.** That path passes `project.environmentVars` (settings-store value, merged
over compose-discovered defaults) in-memory straight to the `docker compose up` child process.
Any deploy that instead runs `docker compose up`/`--build` directly (SSH into the host, or into
this container, bypassing the API) invokes compose with none of that in-memory env — compose falls
back to its own `${VAR:-default}` substitution against the project directory's checked-out `.env`
file, silently: a var that lives only in ACM's settings store (never written to `.env`) resolves to
its default (typically empty), and a var that *is* in `.env` — because someone, at some point,
wrote to that file directly instead of through ACM — silently wins over whatever ACM's UI shows as
saved. No error, no log, nothing to page-reload-and-recheck: the request that "saved" the value was
never wrong, the *next* deploy just didn't use it.

Confirmed directly on KoodakBook, same day: `TELEGRAM_BOT_TOKEN` was set in ACM's project settings,
but a `docker compose up -d --build backend` run by hand over SSH left it at length 0 in the running
container — while `ADMIN_PASSWORD`, previously written directly into `.env` outside ACM (a process
mistake, now corrected), came through as *that* stale file value instead of ACM's current one. A
subsequent deploy through ACM's own UI fixed both in one pass: `TELEGRAM_BOT_TOKEN` landed non-empty
and `ADMIN_PASSWORD` switched to ACM's stored value. Same signature as the `NEXT_PUBLIC_SITE_URL`
and `ADMIN_TELEGRAM_CHAT_ID` incidents below the fold in this project's history — treat those as
almost certainly the same mechanism (an out-of-band `docker compose` run, or a stale `.env`
override, at some point in that project's deploy history), though it wasn't confirmed live at the
time.

**Standing rule: never deploy a project with a raw `docker compose` command over SSH — always
deploy through ACM's own UI/API.** A manual `docker compose up`/`--build` silently drops every
ACM-only env var back to its compose-file default the moment it recreates the container, and lets
any stale `.env`-file value silently outrank ACM's current setting. If a deploy has to happen
outside ACM for some reason, treat every ACM-only var as suspect afterward and redeploy through ACM
before trusting the result.

The original investigation (env-var merge order, sqlite persistence, encryption, in-memory
`this.projects` reads) genuinely found nothing wrong in `deployProject`'s own code — because there
wasn't anything wrong there; the deploys that failed to pick up the new value weren't going through
that code path at all. No fix was needed in ACM itself. The `debug/admin-telegram-chat-id-env-trace`
branch's four presence+length-only log points are no longer needed and have been removed; if a
value still doesn't land after a deploy confirmed to have gone through ACM's own UI/API, that would
be a genuinely new symptom worth re-instrumenting for, not a recurrence of this one.

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
