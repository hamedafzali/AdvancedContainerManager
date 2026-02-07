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
        return "text-green-600 bg-green-50";
      case "container_stop":
        return "text-gray-600 bg-gray-50";
      case "container_error":
        return "text-red-600 bg-red-50";
      case "build_start":
        return "text-yellow-600 bg-yellow-50";
      case "build_complete":
        return "text-green-600 bg-green-50";
      case "success":
        return "text-green-600 bg-green-50";
      case "error":
        return "text-red-600 bg-red-50";
      case "info":
        return "text-blue-600 bg-blue-50";
      case "warning":
        return "text-yellow-600 bg-yellow-50";
      default:
        return "text-gray-600 bg-gray-50";
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
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
        <button className="text-sm text-gray-600 hover:text-gray-900">
          View All
        </button>
      </div>

      <div className="space-y-4">
        {displayActivities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          displayActivities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors duration-200"
            >
              <div
                className={`p-2 rounded-full ${getStatusColor(activity.status)}`}
              >
                {getStatusIcon(activity.type)}
              </div>
              <div className="flex-1">
                <div className="mt-1">
                  <div className="font-medium text-gray-900">
                    {activity.title}
                  </div>
                  <p className="text-sm text-gray-600">
                    {activity.description}
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  {formatTimeAgo(activity.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {activities.length > maxItems && (
        <div className="text-center py-8 text-gray-500">
          <Clock className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No recent activity</p>
        </div>
      )}
    </div>
  );
}
