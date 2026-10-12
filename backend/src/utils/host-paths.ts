import * as fs from "fs";
import * as os from "os";

/** One entry of `docker inspect` → `.Mounts`. */
export interface ContainerMount {
  Type?: string;
  Source: string;
  Destination: string;
}

/**
 * ACM runs `docker compose` inside its own container, but bind-mount sources
 * are resolved by the host daemon. A project's `./data:/app/data` therefore
 * means `<projectsDir>/<name>/data` on the HOST, not inside ACM. When ACM's
 * projects dir is mounted from a different host path (e.g.
 * `./data/projects:/data/projects`), those two paths differ and the project
 * silently reads/writes a host directory that is not its checkout.
 *
 * Returns the host path that backs `containerPath`, or null when it is not on
 * a bind mount.
 */
export function resolveHostPath(
  mounts: ContainerMount[],
  containerPath: string,
): string | null {
  const target = containerPath.replace(/\/+$/, "");
  let best: ContainerMount | null = null;
  for (const m of mounts) {
    if (m.Type && m.Type !== "bind") continue;
    const dest = m.Destination.replace(/\/+$/, "");
    if (target !== dest && !target.startsWith(dest + "/")) continue;
    if (!best || dest.length > best.Destination.replace(/\/+$/, "").length) best = m;
  }
  if (!best) return null;
  const dest = best.Destination.replace(/\/+$/, "");
  return best.Source.replace(/\/+$/, "") + target.slice(dest.length);
}

/** Relative bind-mount sources (`./x`, `../x`, `.`) declared in a compose
 *  document, as `service: source` strings. Named volumes and absolute paths
 *  are unaffected by the host/container path mismatch and are skipped. */
export function findRelativeBindMounts(compose: any): string[] {
  const found: string[] = [];
  const services = compose?.services || {};
  for (const [name, svc] of Object.entries<any>(services)) {
    for (const vol of svc?.volumes || []) {
      const source =
        typeof vol === "string"
          ? vol.split(":")[0]
          : vol?.type === "bind" || vol?.type === undefined
            ? vol?.source
            : undefined;
      if (typeof source === "string" && /^\.\.?(\/|$)/.test(source)) {
        found.push(`${name}: ${source}`);
      }
    }
  }
  return found;
}

/** Mounts of the container ACM itself runs in, or null when ACM is not in a
 *  container (dev mode) or the daemon cannot be reached. */
export async function inspectOwnMounts(
  socketPath: string,
): Promise<ContainerMount[] | null> {
  if (!fs.existsSync("/.dockerenv")) return null;
  try {
    const Docker = require("dockerode");
    const docker = new Docker({ socketPath });
    const info = await docker.getContainer(os.hostname()).inspect();
    return (info?.Mounts || []) as ContainerMount[];
  } catch {
    return null;
  }
}
