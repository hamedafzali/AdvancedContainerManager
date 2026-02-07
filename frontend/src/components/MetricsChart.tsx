import { useRef } from "react";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MetricsChartProps {
  data: Array<{
    timestamp: string;
    cpu: number;
    memory: number;
    networkIn: number;
    networkOut: number;
  }>;
  title: string;
  dataKey: string;
  color: string;
  unit: string;
}

export function MetricsChart({
  data,
  title,
  dataKey,
  color,
  unit,
}: MetricsChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  // Format data for Recharts
  const chartData = data.map((item) => ({
    time: new Date(item.timestamp).toLocaleTimeString(),
    value: item[dataKey as keyof typeof item],
  }));

  return (
    <div
      ref={chartRef}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="time"
            stroke="#6b7280"
            fontSize={12}
            tick={{ fill: "#6b7280" }}
          />
          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tick={{ fill: "#6b7280" }}
            label={{
              value: unit,
              position: "insideLeft",
              style: { fill: "#6b7280" },
            }}
          />
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
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface SystemMetricsChartProps {
  data: Array<{
    timestamp: string;
    cpuPercent: number;
    memoryPercent: number;
    networkIO: {
      bytesRecv: number;
      bytesSent: number;
    };
  }>;
}

export function SystemMetricsChart({ data }: SystemMetricsChartProps) {
  const cpuData = data.map((item) => ({
    timestamp: item.timestamp,
    cpu: item.cpuPercent,
    memory: item.memoryPercent,
    networkIn: item.networkIO.bytesRecv / 1024 / 1024, // Convert to MB
    networkOut: item.networkIO.bytesSent / 1024 / 1024, // Convert to MB
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <MetricsChart
        data={cpuData}
        title="CPU Usage"
        dataKey="cpu"
        color="#3b82f6"
        unit="%"
      />
      <MetricsChart
        data={cpuData}
        title="Memory Usage"
        dataKey="memory"
        color="#10b981"
        unit="%"
      />
      <MetricsChart
        data={cpuData}
        title="Network In"
        dataKey="networkIn"
        color="#f59e0b"
        unit="MB"
      />
      <MetricsChart
        data={cpuData}
        title="Network Out"
        dataKey="networkOut"
        color="#ef4444"
        unit="MB"
      />
    </div>
  );
}
