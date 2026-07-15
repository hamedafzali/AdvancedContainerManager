import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import {
  CheckCircle,
  XCircle,
  Loader2,
  ListChecks,
  ChevronDown,
} from "lucide-react";
import { Modal } from "@/components/ui";
import { useNotifications } from "@/hooks/useNotifications";

export type TaskStatus = "running" | "success" | "failed";

export interface Task {
  id: string;
  title: string;
  detail?: string;
  status: TaskStatus;
  log: string;
  startedAt: number;
  finishedAt?: number;
}

interface TasksContextType {
  tasks: Task[];
  startTask: (title: string, detail?: string) => string;
  appendTaskLog: (id: string, chunk: string) => void;
  finishTask: (id: string, status: Exclude<TaskStatus, "running">, detail?: string) => void;
  openTask: (id: string) => void;
}

const TasksContext = createContext<TasksContextType | undefined>(undefined);

let taskCounter = 0;

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { addNotification } = useNotifications();
  // Ref mirror so websocket handlers can append without stale closures
  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;

  const startTask = useCallback((title: string, detail?: string) => {
    const id = `task-${Date.now()}-${taskCounter++}`;
    setTasks((prev) => [
      { id, title, detail, status: "running" as TaskStatus, log: "", startedAt: Date.now() },
      ...prev.slice(0, 24),
    ]);
    return id;
  }, []);

  const appendTaskLog = useCallback((id: string, chunk: string) => {
    if (!chunk) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, log: t.log + chunk } : t)),
    );
  }, []);

  const finishTask = useCallback(
    (id: string, status: Exclude<TaskStatus, "running">, detail?: string) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (task && task.status !== "running") return;
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status,
                detail: detail ?? t.detail,
                finishedAt: Date.now(),
              }
            : t,
        ),
      );
      if (task) {
        addNotification({
          type: status === "success" ? "success" : "error",
          message:
            status === "success"
              ? `${task.title} completed`
              : `${task.title} failed${detail ? `: ${detail}` : ""}`,
          duration: 6000,
        });
      }
    },
    [addNotification],
  );

  const openTask = useCallback((id: string) => setOpenTaskId(id), []);

  const value = useMemo(
    () => ({ tasks, startTask, appendTaskLog, finishTask, openTask }),
    [tasks, startTask, appendTaskLog, finishTask, openTask],
  );

  const openedTask = tasks.find((t) => t.id === openTaskId) || null;

  return (
    <TasksContext.Provider value={value}>
      {children}
      <Modal
        open={openedTask !== null}
        onClose={() => setOpenTaskId(null)}
        title={
          openedTask ? (
            <span className="flex items-center gap-2">
              {statusIcon(openedTask.status)}
              {openedTask.title}
            </span>
          ) : (
            ""
          )
        }
        wide
      >
        {openedTask && (
          <div>
            {openedTask.detail && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {openedTask.detail}
              </p>
            )}
            <pre className="bg-gray-900 text-gray-100 text-xs font-mono rounded-xl p-4 overflow-x-auto whitespace-pre-wrap min-h-[200px] max-h-[55vh] overflow-y-auto">
              {openedTask.log || (openedTask.status === "running" ? "Waiting for output…" : "(no output)")}
            </pre>
          </div>
        )}
      </Modal>
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return context;
}

function statusIcon(status: TaskStatus) {
  switch (status) {
    case "running":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case "success":
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-500" />;
  }
}

function formatElapsed(task: Task) {
  const end = task.finishedAt ?? Date.now();
  const seconds = Math.max(0, Math.round((end - task.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/* Header dropdown listing running/recent tasks */
export function TaskTray() {
  const { tasks, openTask } = useTasks();
  const [open, setOpen] = useState(false);
  const runningCount = tasks.filter((t) => t.status === "running").length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        aria-label="Background tasks"
      >
        {runningCount > 0 ? (
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        ) : (
          <ListChecks className="w-4 h-4" />
        )}
        Tasks
        {runningCount > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-semibold rounded-full bg-blue-600 text-white">
            {runningCount}
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-96 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 max-h-96 overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No background tasks yet. Deploys, builds and image pulls will
                show up here.
              </div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => {
                    setOpen(false);
                    openTask(task.id);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {statusIcon(task.status)}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-900 dark:text-gray-100 truncate">
                      {task.title}
                    </span>
                    {task.detail && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                        {task.detail}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {formatElapsed(task)}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
