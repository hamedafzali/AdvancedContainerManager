import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useNotifications } from "@/hooks/useNotifications";

export function useSocket() {
  const { addNotification } = useNotifications();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    try {
      const rawSocketUrl = import.meta.env.VITE_SOCKET_URL || "";
      const defaultSocketUrl =
        typeof window !== "undefined"
          ? `${window.location.protocol}//${window.location.hostname}:5003`
          : "";
      const localhostSocketUrls = new Set([
        "http://localhost:5003",
        "http://127.0.0.1:5003",
        "https://localhost:5003",
        "https://127.0.0.1:5003",
      ]);
      const socketUrl =
        !rawSocketUrl ||
        rawSocketUrl === "auto" ||
        localhostSocketUrls.has(rawSocketUrl)
          ? defaultSocketUrl || undefined
          : rawSocketUrl;
      socketRef.current = io(socketUrl, {
        path: "/socket.io",
        timeout: 5000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      const socket = socketRef.current;

      socket.on("connect", () => {
        console.log("Connected to Advanced Container Manager WebSocket");

        // Request initial data
        socket.emit("get_system_metrics");
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
        if (
          data.type === "started" ||
          data.type === "stopped" ||
          data.type === "error"
        ) {
          addNotification({
            type: data.type === "error" ? "error" : "info",
            message: `Container ${data.name} ${data.type}`,
            duration: 5000,
          });
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
