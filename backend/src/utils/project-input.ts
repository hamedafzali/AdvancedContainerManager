import * as path from "path";

/**
 * Project inputs end up in filesystem paths (`<projectsDir>/<name>`), compose
 * project names and git command lines, so they are checked before use.
 */

export function validateProjectName(name: unknown): string {
  if (typeof name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name) || name.includes("..")) {
    throw new Error("Project name must be 1-64 letters, digits, '.', '_' or '-', starting with a letter or digit");
  }
  return name;
}

/** https/http/ssh URLs and scp-style `git@host:owner/repo`. Rejects local
 *  paths, `file://`, `ext::` transports and anything git would parse as an
 *  option. */
export function validateRepoUrl(url: unknown): string {
  const value = typeof url === "string" ? url.trim() : "";
  const ok =
    /^(https?|ssh|git):\/\/[^\s]+$/i.test(value) || /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^\s]+$/.test(value);
  if (!ok || value.startsWith("-")) {
    throw new Error("Repository URL must be an https://, ssh:// or git@host:owner/repo address");
  }
  return value;
}

export function validateBranch(branch: unknown): string {
  const value = typeof branch === "string" ? branch.trim() : "";
  if (
    !value ||
    value.startsWith("-") ||
    value.includes("..") ||
    !/^[A-Za-z0-9._\/-]{1,200}$/.test(value) ||
    value.endsWith("/") ||
    value.endsWith(".lock")
  ) {
    throw new Error(`Invalid branch name: ${String(branch)}`);
  }
  return value;
}

/** A compose file path relative to the project, which must stay inside it. */
export function validateComposePath(projectPath: string, file: unknown): string {
  if (typeof file !== "string" || !file.trim() || path.isAbsolute(file)) {
    throw new Error("Compose file must be a path relative to the project");
  }
  const root = path.resolve(projectPath);
  const resolved = path.resolve(root, file.trim());
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Compose file must be inside the project directory");
  }
  return file.trim();
}
