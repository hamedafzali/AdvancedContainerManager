const RAW_API_BASE = import.meta.env.VITE_API_BASE || "";
const RESOLVED_API_BASE =
  !RAW_API_BASE || RAW_API_BASE === "auto" ? "" : RAW_API_BASE;

export const apiUrl = (path: string): string => {
  if (!RESOLVED_API_BASE) {
    return path;
  }

  const base = RESOLVED_API_BASE.endsWith("/")
    ? RESOLVED_API_BASE.slice(0, -1)
    : RESOLVED_API_BASE;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (base.endsWith("/api") && normalizedPath.startsWith("/api")) {
    return `${base}${normalizedPath.slice(4)}`;
  }

  return `${base}${normalizedPath}`;
};
