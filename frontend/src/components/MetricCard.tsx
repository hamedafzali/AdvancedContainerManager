import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "stable";
  color: string;
}

export default function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend = "stable",
  color,
}: MetricCardProps) {
  return (
    <div className={`metric-card rounded-xl p-6 text-white ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/80 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold mt-2">
            {value}
            {unit && <span className="text-lg ml-1">{unit}</span>}
          </p>
          {trend !== "stable" && (
            <p className="text-white/60 text-xs mt-1 flex items-center">
              {trend === "up" ? (
                <>
                  <TrendingUp className="w-3 h-3 inline mr-1" />
                  +5% from last hour
                </>
              ) : (
                <>
                  <TrendingDown className="w-3 h-3 inline mr-1" />
                  -2% from last hour
                </>
              )}
            </p>
          )}
        </div>
        <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}
