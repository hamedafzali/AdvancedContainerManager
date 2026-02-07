import { useState, useEffect } from "react";
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Zap,
  CheckCircle,
  X,
} from "lucide-react";

interface AISuggestion {
  id: string;
  type: "optimization" | "security" | "performance" | "maintenance";
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  actionLabel: string;
  onAction?: () => void;
  autoApply?: boolean;
  dismissed?: boolean;
}

interface AISuggestionsProps {
  context: {
    currentPage?: string;
    userActions?: string[];
    systemState?: Record<string, any>;
  };
  className?: string;
}

export function AISuggestions({ context, className = "" }: AISuggestionsProps) {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(
    new Set(),
  );

  // Generate AI-powered suggestions based on context
  useEffect(() => {
    const generateSuggestions = (): AISuggestion[] => {
      const newSuggestions: AISuggestion[] = [];

      // Performance optimization suggestions
      if (context.currentPage === "/containers") {
        const stoppedContainers =
          context.systemState?.containers?.filter(
            (c: any) => c.status === "exited",
          ) || [];
        if (stoppedContainers.length > 3) {
          newSuggestions.push({
            id: "cleanup-stopped-containers",
            type: "maintenance",
            title: "Clean up stopped containers",
            description: `Found ${stoppedContainers.length} stopped containers that can be removed to free up disk space.`,
            impact: "medium",
            actionLabel: "Clean up",
            onAction: () => console.log("Cleaning up stopped containers"),
          });
        }
      }

      // Security suggestions
      if (context.currentPage === "/images") {
        newSuggestions.push({
          id: "scan-vulnerabilities",
          type: "security",
          title: "Security scan recommended",
          description:
            "Regular vulnerability scanning helps maintain container security.",
          impact: "high",
          actionLabel: "Run scan",
          onAction: () => console.log("Running security scan"),
        });
      }

      // Resource optimization
      if (context.systemState?.cpuUsage > 80) {
        newSuggestions.push({
          id: "high-cpu-optimization",
          type: "performance",
          title: "High CPU usage detected",
          description:
            "Consider scaling resources or optimizing container configurations.",
          impact: "high",
          actionLabel: "View details",
          onAction: () => console.log("Showing CPU optimization details"),
        });
      }

      // Memory optimization
      if (context.systemState?.memoryUsage > 85) {
        newSuggestions.push({
          id: "memory-optimization",
          type: "optimization",
          title: "Memory usage optimization available",
          description:
            "AI detected potential memory optimization opportunities.",
          impact: "medium",
          actionLabel: "Optimize",
          onAction: () => console.log("Applying memory optimizations"),
          autoApply: true,
        });
      }

      // Network optimization
      if (context.systemState?.networkTraffic > 1000) {
        newSuggestions.push({
          id: "network-optimization",
          type: "performance",
          title: "Network optimization opportunity",
          description:
            "High network traffic detected. Consider load balancing or caching.",
          impact: "medium",
          actionLabel: "Analyze",
          onAction: () => console.log("Analyzing network traffic"),
        });
      }

      // Maintenance suggestions
      if (context.systemState?.diskUsage > 90) {
        newSuggestions.push({
          id: "disk-cleanup",
          type: "maintenance",
          title: "Disk space running low",
          description:
            "Clean up unused images and volumes to free up disk space.",
          impact: "high",
          actionLabel: "Clean up",
          onAction: () => console.log("Cleaning up disk space"),
        });
      }

      return newSuggestions.filter(
        (suggestion) => !dismissedSuggestions.has(suggestion.id),
      );
    };

    setSuggestions(generateSuggestions());
  }, [context, dismissedSuggestions]);

  const handleDismiss = (suggestionId: string) => {
    setDismissedSuggestions((prev) => new Set([...prev, suggestionId]));
  };

  const handleAction = (suggestion: AISuggestion) => {
    if (suggestion.onAction) {
      suggestion.onAction();
      if (suggestion.autoApply) {
        handleDismiss(suggestion.id);
      }
    }
  };

  const getTypeIcon = (type: AISuggestion["type"]) => {
    switch (type) {
      case "optimization":
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case "security":
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case "performance":
        return <Zap className="w-5 h-5 text-yellow-500" />;
      case "maintenance":
        return <CheckCircle className="w-5 h-5 text-blue-500" />;
    }
  };

  const getImpactColor = (impact: AISuggestion["impact"]) => {
    switch (impact) {
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "low":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    }
  };

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center space-x-2 mb-4">
        <Lightbulb className="w-5 h-5 text-yellow-500" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          AI Suggestions
        </h3>
      </div>

      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                {getTypeIcon(suggestion.type)}
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      {suggestion.title}
                    </h4>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getImpactColor(suggestion.impact)}`}
                    >
                      {suggestion.impact} impact
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {suggestion.description}
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleAction(suggestion)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md transition-colors"
                    >
                      {suggestion.actionLabel}
                    </button>
                    {suggestion.autoApply && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Auto-applies on action
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDismiss(suggestion.id)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label="Dismiss suggestion"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <div className="text-center pt-2">
          <button
            onClick={() => setDismissedSuggestions(new Set())}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Reset dismissed suggestions
          </button>
        </div>
      )}
    </div>
  );
}
