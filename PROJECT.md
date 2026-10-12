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
comment/log in `backend/src/routes/projects.ts`'s `PUT /projects/:name` handler, added specifically to
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
1. `routes/projects.ts`'s `PUT /projects/:name` handler — the request body as parsed.
2. `updateProjectSettings` — the payload as received, pre-merge (also logs the compose file's
   discovered default for the same key, to rule the empty-default theory in or out on the spot).
3. `updateProjectSettings` — `project.environmentVars` right after the merge + `saveProjects()`.
4. `deployProject` — `project.environmentVars` right before the `docker compose up` call.
Comparing lengths across these four points on one clean save-and-redeploy cycle splits "frontend
never sent the right value" / "merge or save silently dropped it" / "correct in storage but the
deploy step is reading something else" into three distinct, checkable outcomes — decisively, without
needing to decrypt the sqlite-stored value (which needs the encryption key file and should not be
done casually). Generalize past the one hardcoded var name if tracing a different key next time.

### Resource-limits editor clobbered `docker-compose.override.yml` (fixed 2026-10-12)

`applyResourceLimits` used to write per-project CPU/memory limits to `docker-compose.override.yml`,
deleting or overwriting whatever the project kept there (KoodakBook lost a loopback-only port
override this way). Worse, the limits never applied: ACM always runs compose with an explicit
`-f <file>`, and Compose only auto-merges `docker-compose.override.yml` when no `-f` is given.

Now the limits go to `docker-compose.acm-resources.yml`, passed as a second `-f` on `up` only when
the project has non-default limits; ACM never touches `docker-compose.override.yml`.

Consequence to know about: a project's own `docker-compose.override.yml` is **not** applied by ACM
deploys either (same `-f` rule). If a project relies on one (e.g. KoodakBook's loopback-only ports),
move those settings into the compose file ACM deploys.

### Relative bind mounts resolve on the HOST, not inside ACM

ACM runs `docker compose` inside its own container, but the host daemon resolves bind-mount
sources. ACM's compose mounts `./data/projects:/data/projects`, so a project checkout lives at
`<acm repo>/data/projects/<name>` on the host, while a project's `./data:/app/data` is resolved
by the daemon as host `/data/projects/<name>/data`, a different directory. On the home server that
tree holds old clones and the live data of several projects (TradeSignal, NewsFeed, Simorgh,
Doc2Pdf, Trainova), so do not "fix" it by moving or deleting it.

Seen 2026-10: the Portfolio seed container mounted `./data` and kept seeding 12 skills from the old
host clone while the checkout had 41. Fixed on the project side by baking the seed data into the
image.

ACM now detects the mismatch (`utils/host-paths.ts`: inspects its own container's mounts once) and
prints a `[acm] WARNING` line in the deploy log and deploy history for every project whose compose
file uses relative bind mounts. Real fixes, per project: bake files into the image, use a named
volume, or (server-wide, needs a planned data move) mount the projects dir at the same path on host
and container.

### Git webhook was behind auth (fixed 2026-10-12)

`POST /api/webhook/:name` was registered after the auth middleware, so with `requireAuth` on every
GitHub/GitLab push got 401. It is now registered with the other public routes. The HMAC is checked
against the raw request body (GitHub signs the bytes it sent), and a wrong-length signature returns
401 instead of throwing.

### dev/test collided with prod (fixed 2026-10-12)

dev and test ran the project's own compose file under another `-p`. On the server 7 of 8 projects
set `container_name` (so a dev deploy failed with "name already in use"), most publish fixed host
ports (prod already holds them), several bind-mount `./data`-style directories (dev wrote into
prod's data), and a service with both `build:` and `image:` let a dev build overwrite prod's image.
Prod deployed through the env strip also skipped deployProject's lock, history and checks, and
`envOverrides` were stored in plaintext.

Now (`utils/env-compose.ts`, `ProjectService` "Environments" section):

- dev/test run a rendered `docker-compose.acm-<env>.yml`: `container_name` gets `-<env>`, numeric
  host ports shift by +10000 (dev) / +20000 (test) (`ACM_PORT_OFFSET` in the env's variables
  overrides it), writable bind mounts of untracked dirs move to `./.acm-env/<env>/…`, and `image:`
  is dropped on built services. Read-only mounts, files and git-tracked dirs stay shared.
  External or fixed-name volumes and `../` mounts are reported as still shared.
- Prod always uses the project's compose file untouched, through `deployProject`.
- Promotion (`POST /projects/:name/environments/:from/promote {to}`, one stage at a time) retags
  the images `from` is running to the names `to` uses and runs `up --no-build`, so the next stage
  runs exactly what was tested. It refuses when `from` is unhealthy or when a build-time variable
  (build args) differs between the two envs, keeps the target's previous images as
  `:acm-rollback`, waits for health (`ACM_ENV_HEALTH_TIMEOUT_MS`, default 120s) and puts the
  previous images back if the target does not come up.
- Each env records commit, time, source and image IDs in `envState`; history entries carry `env`.
- Env actions share a per-env lock (prod shares deployProject's), `envOverrides` are encrypted at
  rest (plaintext rows still load), `.env.<env>` files are mode 600, and generated files are
  added to `.git/info/exclude`.
- Prod's compose project name is taken from Compose's own rule (`name:`, COMPOSE_PROJECT_NAME,
  directory) since deployProject runs without `-p`; logs, health and status use the same name.

Limits: an isolated data dir starts empty (no copy of prod data). A project's own
`docker-compose.override.yml` is still not applied (KoodakBook relies on one for loopback ports).

## Suggested Next Enhancements

1. Persist `/api/settings` to disk (same config store as projects) with schema validation
2. Add a dedicated API endpoint to return full compose config diff before applying changes
3. Add explicit “port availability check” endpoint that reports:
   - managed project conflicts
   - running container conflicts
   - host process conflicts (optional via `lsof`/`ss`)
4. Add automated tests for `ProjectService.updateProjectSettings` validation paths

### Review fixes (2026-10-12)

- Project name, repo URL, branch and compose file path are validated (`utils/project-input.ts`):
  a name like `../x` used to resolve outside the projects dir, and `file://`/`ext::` URLs or
  option-like branches went straight to git.
- The image runs Node 22 (Node 18 is EOL); `better-sqlite3` and `node-pty` were checked in the
  built image.
- Pages poll through `usePolling`, which stops while the tab is hidden (each poll is a Docker API
  call on the server) and refreshes when it is shown again.
- The Add Project dialog shows its own errors (they used to land in the page banner behind the
  modal), keeps variables with empty values, and disables the button while cloning.

## Code Layout Notes

- `backend/src/routes/index.ts` builds shared dependencies and middleware; the endpoints live in
  per-domain modules (`public`, `system`, `docker`, `security`, `projects`, `analytics`,
  `tunnels`). Public routes are registered before the auth middleware, everything else after.
  Keep route order inside a module when adding endpoints (e.g. `/containers/cached` vs
  `/containers/:id`).
- Tests: `npm test` in `backend/` (wraps jest so it also runs on Node 25+).
