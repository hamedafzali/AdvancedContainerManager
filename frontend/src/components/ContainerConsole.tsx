import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, Loader2, Maximize2, Minimize2, Terminal as TerminalIcon } from "lucide-react";
import { apiFetch, apiJson } from "@/utils/api";
import { Button } from "@/components/ui";

interface Line {
  id: number;
  kind: "input" | "output" | "error" | "info";
  text: string;
}

type Status = "idle" | "connecting" | "connected";

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

let lineSeq = 0;

/**
 * Shell for one container. Each command runs through `docker exec` on the
 * server, so state like `cd` does not persist between commands; the hint
 * line says so. `clear` and `exit` are handled locally.
 */
export function ContainerConsole({
  containerId,
  containerName,
  disabledReason,
  autoConnect = false,
  className,
}: {
  containerId: string;
  containerName?: string;
  /** Set when the container can't take a shell (e.g. it's stopped). */
  disabledReason?: string;
  autoConnect?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyPos, setHistoryPos] = useState<number | null>(null);
  const [maximized, setMaximized] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string | null>(null);
  // Bumped on unmount/container change so a connect that resolves late
  // (e.g. StrictMode's double effect) closes its session instead of using it.
  const generation = useRef(0);

  const add = useCallback((kind: Line["kind"], text: string) => {
    setLines((prev) => [...prev, { id: ++lineSeq, kind, text }]);
  }, []);

  const connect = useCallback(async () => {
    if (disabledReason) return;
    const gen = generation.current;
    setStatus("connecting");
    try {
      const res = await apiJson<{ data: { id: string } }>(`/api/terminal/${containerId}/session`, {
        method: "POST",
      });
      if (gen !== generation.current) {
        apiFetch(`/api/terminal/sessions/${res.data.id}`, { method: "DELETE" }).catch(() => undefined);
        return;
      }
      sessionRef.current = res.data.id;
      setSessionId(res.data.id);
      setStatus("connected");
      add("info", `Connected to ${containerName ?? containerId.slice(0, 12)}. Each command runs in a fresh shell; chain with && to keep state (e.g. cd /app && ls).`);
    } catch (err) {
      if (gen !== generation.current) return;
      setStatus("idle");
      add("error", err instanceof Error ? err.message : "Could not open a session");
    }
  }, [add, containerId, containerName, disabledReason]);

  const disconnect = useCallback(async (note = "Session closed") => {
    const id = sessionRef.current;
    sessionRef.current = null;
    setSessionId(null);
    setStatus("idle");
    if (id) {
      add("info", note);
      await apiFetch(`/api/terminal/sessions/${id}`, { method: "DELETE" }).catch(() => undefined);
    }
  }, [add]);

  // New container: drop the old session and output.
  useEffect(() => {
    setLines([]);
    setHistory([]);
    if (autoConnect && !disabledReason) connect();
    return () => {
      generation.current += 1;
      const id = sessionRef.current;
      sessionRef.current = null;
      if (id) apiFetch(`/api/terminal/sessions/${id}`, { method: "DELETE" }).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [lines, running]);

  useEffect(() => {
    if (status === "connected" && !running) inputRef.current?.focus();
  }, [status, running]);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setMaximized(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  const run = async (command: string) => {
    add("input", command);
    setHistory((prev) => (prev[prev.length - 1] === command ? prev : [...prev, command]));
    setHistoryPos(null);
    setInput("");
    if (command === "clear") return setLines([]);
    if (command === "exit") return disconnect();
    setRunning(true);
    try {
      const res = await apiFetch(`/api/terminal/sessions/${sessionId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 404) {
        await disconnect(body?.message || "Session expired");
        return;
      }
      if (!res.ok) throw new Error(body?.message || `Command failed (${res.status})`);
      if (body.data?.output) add("output", body.data.output.replace(/\n$/, ""));
      if (body.data?.error) add("error", body.data.error.replace(/\n$/, ""));
    } catch (err) {
      add("error", err instanceof Error ? err.message : "Command failed");
    } finally {
      setRunning(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = input.trim();
      if (cmd && !running) run(cmd);
    } else if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const pos = historyPos === null ? history.length - 1 : Math.max(0, historyPos - 1);
      setHistoryPos(pos);
      setInput(history[pos]);
    } else if (e.key === "ArrowDown" && historyPos !== null) {
      e.preventDefault();
      const pos = historyPos + 1;
      if (pos >= history.length) {
        setHistoryPos(null);
        setInput("");
      } else {
        setHistoryPos(pos);
        setInput(history[pos]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  const transcript = () => lines.map((l) => (l.kind === "input" ? `$ ${l.text}` : l.text)).join("\n");

  const download = () => {
    const url = URL.createObjectURL(new Blob([transcript()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${containerName ?? containerId}-terminal.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toolButton = "p-1.5 rounded-md text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-40";

  return (
    <div
      className={cx(
        "flex flex-col overflow-hidden bg-gray-950 text-gray-200",
        maximized ? "fixed inset-0 z-50" : "rounded-xl border border-gray-800 shadow-raised",
        !maximized && className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <TerminalIcon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-300">
          {containerName ?? containerId.slice(0, 12)}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray-400" role="status">
          <span
            className={cx(
              "h-2 w-2 rounded-full",
              status === "connected" ? "bg-emerald-500" : status === "connecting" ? "bg-amber-400 animate-pulse" : "bg-gray-600",
            )}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">
            {status === "connected" ? "Connected" : status === "connecting" ? "Connecting" : "Disconnected"}
          </span>
        </span>
        <button type="button" className={toolButton} onClick={() => navigator.clipboard?.writeText(transcript())}
          disabled={!lines.length} aria-label="Copy output" title="Copy output">
          <Copy className="h-4 w-4" />
        </button>
        <button type="button" className={toolButton} onClick={download} disabled={!lines.length}
          aria-label="Download output" title="Download output">
          <Download className="h-4 w-4" />
        </button>
        <button type="button" className={toolButton} onClick={() => setMaximized((m) => !m)}
          aria-label={maximized ? "Exit full screen" : "Full screen"} title={maximized ? "Exit full screen (Esc)" : "Full screen"}>
          {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <div
        ref={outputRef}
        onClick={() => window.getSelection()?.isCollapsed && inputRef.current?.focus()}
        className={cx("min-h-0 flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed", !maximized && "h-[60vh] min-h-[320px]")}
      >
        {lines.map((line) => (
          <pre
            key={line.id}
            className={cx(
              "whitespace-pre-wrap break-words",
              line.kind === "input" && "text-white",
              line.kind === "output" && "text-gray-300",
              line.kind === "error" && "text-red-400",
              line.kind === "info" && "text-sky-400/90",
            )}
          >
            {line.kind === "input" && <span className="select-none text-emerald-400">$ </span>}
            {line.text}
          </pre>
        ))}

        {running && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> running…
          </div>
        )}

        {status === "connected" && !running && (
          <label className="flex items-center gap-2">
            <span className="select-none text-emerald-400">$</span>
            <span className="sr-only">Command</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-white caret-emerald-400 outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </label>
        )}

        {status !== "connected" && (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center font-sans">
            <p className="text-sm text-gray-400">
              {disabledReason ?? "Open a shell inside this container."}
            </p>
            {!disabledReason && (
              <Button variant="primary" onClick={connect} disabled={status === "connecting"}>
                {status === "connecting" ? "Connecting…" : "Connect"}
              </Button>
            )}
          </div>
        )}
      </div>

      {status === "connected" && (
        <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-white/10 px-3 text-xs text-gray-500">
          <span className="truncate">↑↓ history · Ctrl+L clear · exit to close</span>
          <button type="button" onClick={() => disconnect()} className="shrink-0 text-gray-400 hover:text-red-400">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
