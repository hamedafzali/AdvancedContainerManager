import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useNotifications } from "@/hooks/useNotifications";

function sendBrowserNotification(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  }
}

export function useSocket() {
  const { addNotification } = useNotifications();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    try {
      const rawSocketUrl = import.meta.env.VITE_SOCKET_URL || "";
      const socketUrl =
        !rawSocketUrl || rawSocketUrl === "auto" ? undefined : rawSocketUrl;
      const token = localStorage.getItem("acm_token");
      socketRef.current = io(socketUrl, {
        path: "/socket.io",
        timeout: 5000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        auth: token ? { token } : undefined,
      });

      const socket = socketRef.current;

      const subscribeProjectDeployListener = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        socket.emit("subscribe_project_deploy", detail);
      };

      const unsubscribeProjectDeployListener = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        socket.emit("unsubscribe_project_deploy", detail);
      };

      const subscribeProjectPipelineListener = (event: Event) => {
        socket.emit("subscribe_project_pipeline", (event as CustomEvent).detail);
      };
      const unsubscribeProjectPipelineListener = (event: Event) => {
        socket.emit("unsubscribe_project_pipeline", (event as CustomEvent).detail);
      };

      window.addEventListener(
        "subscribe_project_deploy",
        subscribeProjectDeployListener,
      );
      window.addEventListener(
        "unsubscribe_project_deploy",
        unsubscribeProjectDeployListener,
      );
      window.addEventListener(
        "subscribe_project_pipeline",
        subscribeProjectPipelineListener,
      );
      window.addEventListener(
        "unsubscribe_project_pipeline",
        unsubscribeProjectPipelineListener,
      );

      socket.on("connect", () => {
        console.log("Connected to Advanced Container Manager WebSocket");
        socket.emit("get_system_metrics");
        if ("Notification" in window && Notification.permission === "default") {
          Notification.requestPermission();
        }
      });

      socket.on("connect_error", (error) => {
        console.log("Unable to connect to backend WebSocket", error);
      });

      // System metrics updates
      socket.on("system_metrics_update", (data) => {
        window.dispatchEvent(
          new CustomEvent("system_metrics_update", { detail: data }),
        );
      });

      // Initial system metrics response
      socket.on("system_metrics", (data) => {
        window.dispatchEvent(
          new CustomEvent("system_metrics_update", { detail: data }),
        );
      });

      // Container events
      socket.on("container_event", (data) => {
        window.dispatchEvent(
          new CustomEvent("container_event", { detail: data }),
        );

        // Show notification for important container events
        if (data.type === "started" || data.type === "stopped" || data.type === "error") {
          addNotification({
            type: data.type === "error" ? "error" : "info",
            message: `Container ${data.name} ${data.type}`,
            duration: 5000,
          });
          if (data.type === "error") {
            sendBrowserNotification(`Container error: ${data.name}`, "Container encountered an error");
          }
        }
      });

      // System notifications
      socket.on("notification", (data) => {
        addNotification({
          type: data.type || "info",
          message: data.message || "",
          duration: data.duration || 5000,
        });
      });

      // Docker events
      socket.on("docker_event", (data) => {
        window.dispatchEvent(new CustomEvent("docker_event", { detail: data }));

        // Show notification for important Docker events
        if (
          data.action === "create" ||
          data.action === "destroy" ||
          data.action === "die"
        ) {
          addNotification({
            type: data.action === "die" ? "warning" : "info",
            message: `${data.type} ${data.action}`,
            duration: 5000,
          });
        }
      });

      // Terminal output
      socket.on("terminal_output", (data) => {
        window.dispatchEvent(
          new CustomEvent("terminal_output", { detail: data }),
        );
      });

      // Project deploy log streaming
      socket.on("project_deploy_log", (data) => {
        window.dispatchEvent(
          new CustomEvent("project_deploy_log", { detail: data }),
        );
      });

      socket.on("project_pipeline_log", (data) => {
        window.dispatchEvent(
          new CustomEvent("project_pipeline_log", { detail: data }),
        );
      });

      socket.on("project_pipeline_status", (data) => {
        window.dispatchEvent(
          new CustomEvent("project_pipeline_status", { detail: data }),
        );
      });

      socket.on("project_deploy_status", (data) => {
        window.dispatchEvent(
          new CustomEvent("project_deploy_status", { detail: data }),
        );
      });

      // Project health polling updates
      socket.on("project_health", (data) => {
        window.dispatchEvent(new CustomEvent("project_health", { detail: data }));
        if (data?.health?.overall === "unhealthy") {
          addNotification({
            type: "warning",
            message: `Project ${data.projectName} is unhealthy`,
            duration: 8000,
          });
          sendBrowserNotification(`Project ${data.projectName} unhealthy`, data.health.issues?.[0] || "");
        }
      });

      // Metrics history response
      socket.on("system_metrics_history", (data) => {
        window.dispatchEvent(
          new CustomEvent("system_metrics_history", { detail: data }),
        );
      });

      socket.on("container_metrics_history", (data) => {
        window.dispatchEvent(
          new CustomEvent("container_metrics_history", { detail: data }),
        );
      });

      return () => {
        if (socket) {
          window.removeEventListener(
            "subscribe_project_deploy",
            subscribeProjectDeployListener,
          );
          window.removeEventListener(
            "unsubscribe_project_deploy",
            unsubscribeProjectDeployListener,
          );
          window.removeEventListener(
            "subscribe_project_pipeline",
            subscribeProjectPipelineListener,
          );
          window.removeEventListener(
            "unsubscribe_project_pipeline",
            unsubscribeProjectPipelineListener,
          );
          socket.disconnect();
        }
      };
    } catch (error) {
      console.log("WebSocket not available:", error);
    }
  }, [addNotification]);

  // Function to emit events to backend
  const emit = (event: string, data: any) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(event, data);
    }
  };

  // Function to subscribe to container updates
  const subscribeToContainer = (containerId: string) => {
    emit("subscribe_container", { containerId });
  };

  // Function to unsubscribe from container updates
  const unsubscribeFromContainer = (containerId: string) => {
    emit("unsubscribe_container", { containerId });
  };

  // Function to request metrics history
  const requestMetricsHistory = (limit?: number) => {
    emit("get_system_metrics_history", { limit });
  };

  return {
    emit,
    subscribeToContainer,
    unsubscribeFromContainer,
    requestMetricsHistory,
  };
}
