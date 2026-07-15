import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface ContainerData {
  name: string;
  value: number;
  color: string;
}

interface ContainerChartProps {
  data: ContainerData[];
}

export default function ContainerChart({ data }: ContainerChartProps) {
  const total = data.reduce((acc, item) => acc + item.value, 0);
  const runningPercent =
    total > 0 ? Math.round(((data[0]?.value || 0) / total) * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Container states
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {runningPercent}% running
        </span>
      </div>
      {total === 0 && (
        <div className="h-64 flex items-center justify-center text-sm text-gray-400">
          No containers yet.
        </div>
      )}
      {total > 0 && (
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) =>
                `${name} ${((percent || 0) * 100).toFixed(0)}%`
              }
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#1f2937",
                border: "1px solid #374151",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "#f3f4f6" }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
