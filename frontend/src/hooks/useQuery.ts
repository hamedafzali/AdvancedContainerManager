import React from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiUrl } from "@/utils/api";

// Create a client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof Error && error.message.includes("4")) {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: 1,
    },
  },
});

// React Query Provider Component
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(
    QueryClientProvider,
    { client: queryClient },
    children,
  );
}

// Custom hooks for common API operations
export function useContainers() {
  return useQuery({
    queryKey: ["containers"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/containers"));
      if (!response.ok) throw new Error("Failed to fetch containers");
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds for container data
  });
}

export function useContainerStats(containerId: string) {
  return useQuery({
    queryKey: ["container-stats", containerId],
    queryFn: async () => {
      const response = await fetch(
        apiUrl(`/api/containers/${containerId}/stats`),
      );
      if (!response.ok) throw new Error("Failed to fetch container stats");
      return response.json();
    },
    enabled: !!containerId,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time data
  });
}

export function useSystemMetrics() {
  return useQuery({
    queryKey: ["system-metrics"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/system/metrics"));
      if (!response.ok) throw new Error("Failed to fetch system metrics");
      return response.json();
    },
    refetchInterval: 2000, // Refetch every 2 seconds for near real-time data
  });
}

// Mutation hooks for container operations
export function useContainerAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const response = await fetch(apiUrl(`/api/containers/${id}/${action}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(`Failed to ${action} container`);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch container queries
      queryClient.invalidateQueries({ queryKey: ["containers"] });
    },
  });
}
