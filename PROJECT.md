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

## Suggested Next Enhancements
1. Persist `/api/settings` to disk (same config store as projects) with schema validation
2. Add a dedicated API endpoint to return full compose config diff before applying changes
3. Add explicit “port availability check” endpoint that reports:
   - managed project conflicts
   - running container conflicts
   - host process conflicts (optional via `lsof`/`ss`)
4. Add automated tests for `ProjectService.updateProjectSettings` validation paths
