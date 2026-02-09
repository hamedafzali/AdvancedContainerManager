const RAW_API_BASE = import.meta.env.VITE_API_BASE || "";
const DEFAULT_API_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:5003`
    : "";

const LOCALHOST_BASES = new Set([
  "http://localhost:5003",
  "http://127.0.0.1:5003",
  "https://localhost:5003",
  "https://127.0.0.1:5003",
]);

const RESOLVED_API_BASE =
  !RAW_API_BASE ||
  RAW_API_BASE === "auto" ||
  LOCALHOST_BASES.has(RAW_API_BASE)
    ? DEFAULT_API_BASE
    : RAW_API_BASE;

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
