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

export const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("acm_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const apiFetch = (path: string, init?: RequestInit): Promise<Response> => {
  const url = apiUrl(path);
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...(init?.headers as Record<string, string> | undefined),
  };
  return fetch(url, { ...init, headers });
};

// JSON convenience wrapper: parses the body, throws Error with the backend
// message on non-2xx responses, and returns the parsed payload.
export const apiJson = async <T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await apiFetch(path, init);
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    if (!response.ok) {
      throw new Error(text.slice(0, 300) || `Request failed (${response.status})`);
    }
    throw new Error(`Invalid JSON from ${path}: ${text.slice(0, 200)}`);
  }
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }
  return payload as T;
};

export const apiPost = <T = any>(path: string, body?: unknown): Promise<T> =>
  apiJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
