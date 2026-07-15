import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PerformanceData {
  time: string;
  cpu: number;
  memory: number;
  network: number;
}

interface PerformanceChartProps {
  data: PerformanceData[];
  title?: string;
}

export default function PerformanceChart({
  data,
  title = "System Performance",
}: PerformanceChartProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        <span className="text-xs text-gray-400">live · last {data.length} samples</span>
      </div>
      {data.length === 0 && (
        <div className="h-64 flex items-center justify-center text-sm text-gray-400">
          Collecting samples… data appears as metrics stream in.
        </div>
      )}
      {data.length > 0 && (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" stroke="#6b7280" fontSize={12} />
            <YAxis stroke="#6b7280" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "#f3f4f6" }}
            />
            <Line
              type="monotone"
              dataKey="cpu"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="CPU %"
            />
            <Line
              type="monotone"
              dataKey="memory"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="Memory %"
            />
            <Line
              type="monotone"
              dataKey="network"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="Network MB/s"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
