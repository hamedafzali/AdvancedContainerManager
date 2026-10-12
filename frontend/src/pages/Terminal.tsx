import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  Terminal as TerminalIcon,
  Copy,
  Download,
  Settings,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  Play,
  Square,
  RefreshCw,
  Command,
  History,
  Monitor,
  Wifi,
  HardDrive,
} from "lucide-react";
import { apiUrl, apiFetch } from "@/utils/api";
import { Button, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

interface TerminalLine {
  id: string;
  type: "input" | "output" | "error" | "success" | "info";
  content: string;
  timestamp: string;
}

interface Container {
  id: string;
  name: string;
  status: string;
  image: string;
}

interface TerminalSession {
  id: string;
  containerId: string;
  containerName: string;
  createdAt: string;
  isActive: boolean;
}

export default function Terminal() {
  const { containerId: urlContainerId } = useParams<{ containerId?: string }>();
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<string>(
    urlContainerId || "",
  );
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [currentSession, setCurrentSession] = useState<string>("");
  const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch containers
  const fetchContainers = async () => {
    try {
      const response = await apiFetch("/api/containers");
      if (!response.ok) {
        throw new Error("Failed to fetch containers");
      }
      const result = await response.json();
      const data = result.data;

      const transformedContainers = data.map((container: any) => ({
        id: container.id,
        name: container.name,
        status: container.status,
        image: container.image,
      }));

      setContainers(transformedContainers);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch containers",
      );
    } finally {
      setLoading(false);
    }
  };

  // Fetch terminal sessions
  const fetchSessions = async () => {
    try {
      const response = await apiFetch("/api/terminal/sessions");
      if (!response.ok) {
        throw new Error("Failed to fetch sessions");
      }
      const result = await response.json();
      setSessions(result.data || []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  // Create terminal session
  const createSession = async (containerId: string) => {
    try {
      const response = await fetch(
        apiUrl(`/api/terminal/${containerId}/session`),
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to create terminal session");
      }

      const result = await response.json();
      const sessionId =
        result?.data?.id || result?.id || result?.data?.sessionId;
      if (!sessionId) {
        throw new Error("Terminal session id not returned by server");
      }
      setCurrentSession(sessionId);
      setIsConnected(true);
      addLine(
        "success",
        `Connected to container ${containerId} (session ${sessionId})`,
      );

      // Refresh sessions list
      await fetchSessions();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create terminal session",
      );
    }
  };

  // Close terminal session
  const closeSession = async () => {
    if (!currentSession) return;

    try {
      const response = await fetch(
        apiUrl(`/api/terminal/sessions/${currentSession}`),
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to close terminal session");
      }

      setIsConnected(false);
      setCurrentSession("");
      addLine("info", "Terminal session closed");

      // Refresh sessions list
      await fetchSessions();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to close terminal session",
      );
    }
  };

  // Send command
  const sendCommand = async (command: string) => {
    if (!isConnected || !currentSession) {
      addLine("error", "No active terminal session. Click Connect first.");
      return;
    }

    addLine("input", `$ ${command}`);
    setCurrentInput("");

    try {
      const response = await fetch(
        apiUrl(`/api/terminal/sessions/${currentSession}/execute`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ command }),
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to execute command");
      }
      const payload = result?.data || result;

      const output = payload?.output ?? "";
      const err = payload?.error ?? "";

      if (output) {
        addLine("output", output);
      }

      if (err) {
        addLine("error", err);
      }

      if (!output && !err) {
        addLine("info", "(command completed with no output)");
      }
    } catch (err) {
      addLine(
        "error",
        err instanceof Error ? err.message : "Failed to execute command",
      );
    }
  };

  // Add line to terminal
  const addLine = (type: TerminalLine["type"], content: string) => {
    setLines((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type,
        content,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  // Common commands for suggestions
  const commonCommands = [
    "ls",
    "cd",
    "pwd",
    "cat",
    "grep",
    "find",
    "ps",
    "kill",
    "top",
    "df",
    "du",
    "free",
    "uname",
    "whoami",
    "exit",
    "clear",
    "help",
    "docker ps",
    "docker logs",
    "docker exec",
    "docker stop",
    "docker start",
  ];

  // Get command suggestions
  const getCommandSuggestions = useCallback((input: string) => {
    if (!input) return [];
    return commonCommands.filter((cmd) => cmd.startsWith(input.toLowerCase()));
  }, []);

  // Handle keyboard input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isConnected) return;

    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (currentInput.trim()) {
          sendCommand(currentInput.trim());
          setHistory((prev) => [...prev, currentInput.trim()]);
          setHistoryIndex(-1);
          setShowSuggestions(false);
          setSuggestionIndex(0);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (showSuggestions && suggestionIndex > 0) {
          setSuggestionIndex((prev) => prev - 1);
          setCurrentInput(commandSuggestions[suggestionIndex - 1]);
        } else if (historyIndex < history.length - 1) {
          setHistoryIndex((prev) => prev + 1);
          setCurrentInput(history[history.length - 1 - historyIndex]);
          setShowSuggestions(false);
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (
          showSuggestions &&
          suggestionIndex < commandSuggestions.length - 1
        ) {
          setSuggestionIndex((prev) => prev + 1);
          setCurrentInput(commandSuggestions[suggestionIndex + 1]);
        } else if (historyIndex > 0) {
          setHistoryIndex((prev) => prev - 1);
          setCurrentInput(history[history.length - 1 - historyIndex]);
          setShowSuggestions(false);
        }
        break;
      case "Tab":
        e.preventDefault();
        if (commandSuggestions.length > 0) {
          setCurrentInput(commandSuggestions[0]);
          setShowSuggestions(false);
          setSuggestionIndex(0);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowSuggestions(false);
        setSuggestionIndex(0);
        break;
      case "c":
        if (e.ctrlKey) {
          e.preventDefault();
          setCurrentInput("");
          setShowSuggestions(false);
          setSuggestionIndex(0);
        }
        break;
      case "l":
        if (e.ctrlKey) {
          e.preventDefault();
          // Clear terminal
          setLines([]);
        }
        break;
    }
  };

  // Update command suggestions when input changes
  useEffect(() => {
    const suggestions = getCommandSuggestions(currentInput);
    setCommandSuggestions(suggestions);
    setShowSuggestions(suggestions.length > 0 && currentInput.length > 0);
    setSuggestionIndex(0);
  }, [currentInput, getCommandSuggestions]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input when connected
  useEffect(() => {
    if (isConnected && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isConnected]);

  // Initialize
  useEffect(() => {
    fetchContainers();
    fetchSessions();
  }, []);

  const handleCopy = () => {
    const text = lines.map((line) => line.content).join("\n");
    navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    const text = lines.map((line) => line.content).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terminal-${selectedContainer}-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingState label="Loading containers…" />;

  if (error) {
    return (
      <div className="max-w-screen-2xl mx-auto">
        <ErrorBanner message={error} onRetry={() => setError(null)} />
      </div>
    );
  }

  const selectedName = containers.find((c) => c.id === selectedContainer)?.name;

  return (
    <div className={isMaximized ? "fixed inset-0 z-50 flex flex-col bg-gray-950" : "max-w-screen-2xl mx-auto space-y-4"}>
      {!isMaximized && (
        <PageHeader
          title="Terminal"
          subtitle="Open a shell in a running container"
          actions={
            <>
              <select
                aria-label="Container"
                value={selectedContainer}
                onChange={(e) => setSelectedContainer(e.target.value)}
                disabled={isConnected}
                className="field w-full sm:w-64 disabled:opacity-60"
              >
                <option value="">Select container…</option>
                {containers
                  .filter((c) => c.status === "running")
                  .map((container) => (
                    <option key={container.id} value={container.id}>
                      {container.name}
                    </option>
                  ))}
              </select>
              <Button
                variant={isConnected ? "danger" : "primary"}
                disabled={!selectedContainer}
                onClick={isConnected ? closeSession : () => createSession(selectedContainer)}
              >
                {isConnected ? "Disconnect" : "Connect"}
              </Button>
            </>
          }
        />
      )}

      <div
        className={`bg-gray-900 border border-gray-800 overflow-hidden flex flex-col ${isMaximized ? "flex-1" : "rounded-xl shadow-raised h-[70vh]"}`}
      >
        <div className="bg-gray-900 border-b border-gray-800 px-3 h-11 shrink-0 flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-green-400 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium text-gray-100 truncate min-w-0 flex-1">
            {selectedName ?? "No container selected"}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-600"}`} aria-hidden="true" />
            <span className="hidden sm:inline">{isConnected ? "Connected" : "Idle"}</span>
          </span>
          <button type="button" onClick={handleCopy} aria-label="Copy output" title="Copy output"
            className="p-1.5 rounded text-gray-300 hover:bg-gray-800 hover:text-white">
            <Copy className="w-4 h-4" />
          </button>
          <button type="button" onClick={handleDownload} aria-label="Download output" title="Download output"
            className="p-1.5 rounded text-gray-300 hover:bg-gray-800 hover:text-white">
            <Download className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setIsMaximized(!isMaximized)}
            aria-label={isMaximized ? "Exit full screen" : "Full screen"} title={isMaximized ? "Exit full screen" : "Full screen"}
            className="p-1.5 rounded text-gray-300 hover:bg-gray-800 hover:text-white">
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Terminal Output */}
        <div
          ref={terminalRef}
          className="flex-1 min-h-0 bg-black p-4 font-mono text-sm text-green-400 overflow-auto"
        >
          {lines.length === 0 && !isConnected ? (
            <div className="text-gray-500 dark:text-gray-400 text-sm">
              Select a container and click Connect to start a session.
            </div>
          ) : (
            lines.map((line) => (
            <div key={line.id} className="flex">
              <span className="text-gray-500 dark:text-gray-400 mr-2 text-xs">
                {new Date(line.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={
                  line.type === "error"
                    ? "text-red-400"
                    : line.type === "success"
                      ? "text-green-400"
                      : line.type === "input"
                        ? "text-primary-400"
                        : "text-gray-300"
                }
              >
                {line.content}
              </span>
            </div>
            ))
          )}

          {/* Input Line */}
          {isConnected && (
            <div className="flex items-center">
              <span className="text-gray-500 dark:text-gray-400 mr-2 text-xs">
                {new Date().toLocaleTimeString()}
              </span>
              <span className="text-primary-400">$</span>
              <input
                ref={inputRef}
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent outline-none text-green-400"
                placeholder="Enter command..."
              />
            </div>
          )}

          {/* Command Suggestions */}
          {isConnected && showSuggestions && commandSuggestions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {commandSuggestions.map((suggestion, index) => (
                <div
                  key={suggestion}
                  className={`px-3 py-2 cursor-pointer text-sm ${
                    index === suggestionIndex
                      ? "bg-primary-600 text-white"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                  onClick={() => {
                    setCurrentInput(suggestion);
                    setShowSuggestions(false);
                    setSuggestionIndex(0);
                    inputRef.current?.focus();
                  }}
                >
                  <div className="flex items-center">
                    <Command className="w-3 h-3 mr-2 text-gray-400" />
                    {suggestion}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
