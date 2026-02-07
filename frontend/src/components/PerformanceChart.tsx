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
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <select className="text-sm border border-gray-300 rounded-md px-3 py-1">
          <option value="1">Last Hour</option>
          <option value="6">Last 6 Hours</option>
          <option value="24">Last 24 Hours</option>
        </select>
      </div>
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
    </div>
  );
}
