import * as path from "path";

/**
 * dev/test run beside prod on the same Docker host, from the same checkout.
 * A project's compose file is written for one copy of the app, so running it
 * again under another compose project name collides with prod in four ways:
 *
 *   container_name   fixed names clash ("name already in use")
 *   host ports       "5001:5001" is already bound by prod
 *   bind mounts      ./data is the same host directory for every copy, so a
 *                    dev deploy reads and writes prod's data
 *   image tags       a service with both build: and image: tags the same
 *                    image for every env, so a dev build replaces prod's image
 *
 * renderEnvCompose rewrites a parsed compose document so a non-prod copy is
 * isolated. Prod always uses the project's own compose file untouched.
 */

export const DEFAULT_PORT_OFFSETS: Record<string, number> = { dev: 10000, test: 20000 };

export interface RenderOptions {
  env: string;
  portOffset: number;
  /** True when the (project-relative) path holds files tracked by git, i.e.
   *  code or config that every env should read from the checkout. */
  isTracked: (relPath: string) => boolean;
  /** True when the (project-relative) path is an existing regular file. */
  isFile: (relPath: string) => boolean;
}

export interface RenderResult {
  doc: any;
  /** Human-readable list of what was rewritten. */
  changes: string[];
  /** Things that are still shared with other envs. */
  warnings: string[];
  /** Published host ports after rewriting, for display. */
  hostPorts: Array<{ service: string; host: string; container: string }>;
}

const clone = (v: any) => JSON.parse(JSON.stringify(v ?? null));

/** Directory (relative to the compose file) that holds a non-prod env's own
 *  copies of runtime data directories. */
export const envDataDir = (env: string) => `.acm-env/${env}`;

function shiftPort(value: string, offset: number, where: string): string {
  const range = value.match(/^(\d+)-(\d+)$/);
  const nums = range ? [range[1], range[2]] : [value];
  const shifted = nums.map((n) => {
    const p = parseInt(n, 10) + offset;
    if (p < 1 || p > 65535) {
      throw new Error(`${where}: host port ${n} + offset ${offset} is outside 1-65535; set ACM_PORT_OFFSET for this environment`);
    }
    return String(p);
  });
  return shifted.join("-");
}

/** Rewrites one short-syntax port ("8080:80", "127.0.0.1:8080:80/tcp"). */
function rewriteShortPort(
  entry: string,
  offset: number,
  where: string,
): { value: string; host: string | null; container: string; variable: boolean } {
  // ${PORT:-80} contains a colon of its own; split with variables masked.
  const vars: string[] = [];
  const masked = entry.replace(/\$\{[^}]*\}/g, (m) => `\u0000${vars.push(m) - 1}\u0000`);
  const unmask = (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => vars[Number(i)]);
  if (vars.length) {
    const [maskedSpec, proto] = masked.split("/");
    const segs = maskedSpec.split(":");
    const container = unmask(segs[segs.length - 1]);
    if (segs.length < 2) return { value: entry, host: null, container, variable: false };
    const host = segs[segs.length - 2];
    if (/^\d+(-\d+)?$/.test(host)) {
      segs[segs.length - 2] = shiftPort(host, offset, where);
      return { value: unmask(segs.join(":")) + (proto ? `/${proto}` : ""), host: segs[segs.length - 2], container, variable: false };
    }
    return { value: entry, host: unmask(host), container, variable: host.includes("\u0000") };
  }

  const [spec, proto] = entry.split("/");
  const parts = spec.split(":");
  if (parts.length < 2) return { value: entry, host: null, container: spec, variable: false };
  const container = parts[parts.length - 1];
  const hostIdx = parts.length - 2;
  const host = parts[hostIdx];
  if (!/^\d+(-\d+)?$/.test(host)) {
    return { value: entry, host, container, variable: host.includes("$") };
  }
  parts[hostIdx] = shiftPort(host, offset, where);
  return {
    value: parts.join(":") + (proto ? `/${proto}` : ""),
    host: parts[hostIdx],
    container,
    variable: false,
  };
}

export function renderEnvCompose(source: any, opts: RenderOptions): RenderResult {
  const { env, portOffset } = opts;
  const doc = clone(source) || {};
  const changes: string[] = [];
  const warnings: string[] = [];
  const hostPorts: RenderResult["hostPorts"] = [];

  if (doc.name) {
    delete doc.name;
    changes.push("top-level name removed (ACM sets the project name per env)");
  }

  for (const [svcName, svc] of Object.entries<any>(doc.services || {})) {
    if (!svc || typeof svc !== "object") continue;

    if (svc.container_name) {
      const renamed = `${svc.container_name}-${env}`;
      changes.push(`${svcName}: container_name ${svc.container_name} -> ${renamed}`);
      svc.container_name = renamed;
    }

    if (svc.build && svc.image) {
      changes.push(`${svcName}: image tag ${svc.image} dropped so this env builds its own image`);
      delete svc.image;
    }

    if (Array.isArray(svc.ports)) {
      svc.ports = svc.ports.map((p: any) => {
        const where = `${svcName} port ${typeof p === "object" ? JSON.stringify(p) : p}`;
        if (typeof p === "number") {
          hostPorts.push({ service: svcName, host: "random", container: String(p) });
          return p;
        }
        if (typeof p === "string") {
          const r = rewriteShortPort(p, portOffset, where);
          if (r.variable) {
            warnings.push(`${svcName}: host port ${r.host} comes from a variable; set it in this environment's variables so it does not clash with prod`);
          } else if (r.host && r.value !== p) {
            changes.push(`${svcName}: port ${p} -> ${r.value}`);
          }
          hostPorts.push({ service: svcName, host: r.host ?? "random", container: r.container });
          return r.value;
        }
        if (p && typeof p === "object") {
          const published = p.published != null ? String(p.published) : "";
          if (/^\d+(-\d+)?$/.test(published)) {
            const next = shiftPort(published, portOffset, where);
            changes.push(`${svcName}: port ${published}:${p.target} -> ${next}:${p.target}`);
            hostPorts.push({ service: svcName, host: next, container: String(p.target) });
            return { ...p, published: /^\d+$/.test(next) ? Number(next) : next };
          }
          if (published.includes("$")) {
            warnings.push(`${svcName}: host port ${published} comes from a variable; set it in this environment's variables`);
          }
          hostPorts.push({ service: svcName, host: published || "random", container: String(p.target) });
        }
        return p;
      });
    }

    if (Array.isArray(svc.volumes)) {
      svc.volumes = svc.volumes.map((v: any) => {
        let source: string | undefined;
        let readOnly = false;
        if (typeof v === "string") {
          const parts = v.split(":");
          source = parts[0];
          readOnly = parts.slice(2).join(",").split(",").includes("ro");
        } else if (v && typeof v === "object" && (v.type === "bind" || v.type === undefined)) {
          source = v.source;
          readOnly = !!v.read_only;
        }
        if (!source || !/^\.\.?(\/|$)/.test(source)) return v;

        const rel = path.posix.normalize(source);
        if (rel.startsWith("..")) {
          warnings.push(`${svcName}: ${source} is outside the project and stays shared with prod`);
          return v;
        }
        if (readOnly || opts.isFile(rel) || opts.isTracked(rel)) return v; // code/config: read from the checkout

        const isolated = `./${envDataDir(env)}/${rel === "." ? "root" : rel}`;
        changes.push(`${svcName}: data dir ${source} -> ${isolated}`);
        if (typeof v === "string") {
          const parts = v.split(":");
          parts[0] = isolated;
          return parts.join(":");
        }
        return { ...v, source: isolated };
      });
    }
  }

  for (const [volName, vol] of Object.entries<any>(doc.volumes || {})) {
    if (vol && (vol.external || vol.name)) {
      warnings.push(`volume ${volName} is ${vol.external ? "external" : `named ${vol.name}`} and is shared with prod`);
    }
  }

  return { doc, changes, warnings, hostPorts };
}

/** Services that compose builds from source (and so produce a per-env image). */
export function builtServices(doc: any): string[] {
  return Object.entries<any>(doc?.services || {})
    .filter(([, svc]) => svc && svc.build)
    .map(([name]) => name);
}

/** The image name compose uses for a built service. */
export function builtImageName(doc: any, composeProject: string, service: string): string {
  return doc?.services?.[service]?.image || `${composeProject}-${service}`;
}

/** "repo:tag" → "repo:<tag>", keeping registry ports ("host:5000/app") intact. */
export function withTag(image: string, tag: string): string {
  const slash = image.lastIndexOf("/");
  const colon = image.lastIndexOf(":");
  const repo = colon > slash ? image.slice(0, colon) : image;
  return `${repo}:${tag}`;
}

export interface ServiceState {
  Service: string;
  State: string;
  Health?: string;
  ExitCode?: number;
}

/** Parses `docker compose ps --format json` (a JSON array in newer Compose,
 *  one object per line in older). */
export function parseComposePs(stdout: string): ServiceState[] {
  const text = stdout.trim();
  if (!text) return [];
  if (text.startsWith("[")) return JSON.parse(text);
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/** "healthy" when every service is up (and healthy if it has a healthcheck)
 *  or finished cleanly (one-shot jobs); "failed" on any crash or unhealthy
 *  container; otherwise "pending". */
export function evaluateHealth(
  states: ServiceState[],
  expected: string[],
): { verdict: "healthy" | "pending" | "failed"; detail: string } {
  const bad = states.filter(
    (s) => (s.State === "exited" && (s.ExitCode ?? 0) !== 0) || s.State === "dead" || s.Health === "unhealthy",
  );
  if (bad.length) {
    return { verdict: "failed", detail: bad.map((s) => `${s.Service}: ${s.Health === "unhealthy" ? "unhealthy" : s.State}`).join(", ") };
  }
  const seen = new Set(states.map((s) => s.Service));
  const missing = expected.filter((e) => !seen.has(e));
  const waiting = states.filter(
    (s) => !(s.State === "exited" && (s.ExitCode ?? 0) === 0) && (s.State !== "running" || s.Health === "starting"),
  );
  if (missing.length || waiting.length) {
    return {
      verdict: "pending",
      detail: [...missing.map((m) => `${m}: not created`), ...waiting.map((s) => `${s.Service}: ${s.Health || s.State}`)].join(", "),
    };
  }
  return { verdict: "healthy", detail: "all services up" };
}

/** The compose project name `docker compose -f <file>` picks when no -p is
 *  given: top-level name:, then COMPOSE_PROJECT_NAME, then the compose file's
 *  directory name, normalised the way Compose does it. */
export function defaultComposeProjectName(
  doc: any,
  composeFile: string,
  env: Record<string, string> = {},
): string {
  const raw = doc?.name || env.COMPOSE_PROJECT_NAME || path.basename(path.dirname(path.resolve(composeFile)));
  return String(raw).toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

/** Variables a service's build section interpolates (build args, context,
 *  dockerfile). Their values are baked into the image, so an image built for
 *  one env carries them along when promoted to the next. */
export function buildVariableRefs(doc: any, service: string): string[] {
  const build = doc?.services?.[service]?.build;
  if (!build) return [];
  const refs = new Set<string>();
  const text = JSON.stringify(build);
  for (const m of text.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)/g)) refs.add(m[1]);
  // List-form build args without a value ("- VITE_API_URL") are read from the env.
  const args = build.args;
  if (Array.isArray(args)) {
    for (const a of args) if (typeof a === "string" && !a.includes("=")) refs.add(a);
  } else if (args && typeof args === "object") {
    for (const [k, v] of Object.entries(args)) if (v === null || v === undefined) refs.add(k);
  }
  return [...refs].sort();
}
