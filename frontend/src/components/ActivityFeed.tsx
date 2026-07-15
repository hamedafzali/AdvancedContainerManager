import { CheckCircle, XCircle, Clock, Play, Square } from "lucide-react";

interface ActivityItem {
  id: string;
  type:
    | "container_start"
    | "container_stop"
    | "container_error"
    | "build_start"
    | "build_complete"
    | "success"
    | "error"
    | "info"
    | "warning";
  title: string;
  description: string;
  timestamp: Date;
  status:
    | "container_start"
    | "container_stop"
    | "container_error"
    | "build_start"
    | "build_complete"
    | "success"
    | "error"
    | "info"
    | "warning";
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  maxItems?: number;
}

export default function ActivityFeed({
  activities,
  maxItems = 5,
}: ActivityFeedProps) {
  const getStatusIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "container_start":
        return <Play className="w-4 h-4 text-green-600" />;
      case "container_stop":
        return <Square className="w-4 h-4 text-gray-600" />;
      case "container_error":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "build_start":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case "build_complete":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (type: ActivityItem["type"]) => {
    switch (type) {
      case "container_start":
      case "build_complete":
      case "success":
        return "text-green-600 bg-green-50 dark:bg-green-900/30";
      case "container_error":
      case "error":
        return "text-red-600 bg-red-50 dark:bg-red-900/30";
      case "build_start":
      case "warning":
        return "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30";
      case "info":
        return "text-blue-600 bg-blue-50 dark:bg-blue-900/30";
      case "container_stop":
      default:
        return "text-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-gray-300";
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return "Just now";
    }
  };

  const displayActivities = activities.slice(0, maxItems);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Recent Activity
        </h3>
        <span className="text-xs text-gray-400">live events</span>
      </div>

      <div className="space-y-4">
        {displayActivities.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Clock className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">No recent activity yet</p>
            <p className="text-xs mt-1">
              Container starts, stops and errors will appear here in real time.
            </p>
          </div>
        ) : (
          displayActivities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors duration-200"
            >
              <div
                className={`p-2 rounded-full ${getStatusColor(activity.status)}`}
              >
                {getStatusIcon(activity.type)}
              </div>
              <div className="flex-1">
                <div className="mt-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {activity.title}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {activity.description}
                  </p>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {formatTimeAgo(activity.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {activities.length > maxItems && (
        <p className="text-center text-xs text-gray-400 pt-2">
          +{activities.length - maxItems} older events
        </p>
      )}
    </div>
  );
}
