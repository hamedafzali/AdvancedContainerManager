import { Fragment } from "react";
import {
  ChevronRight, CheckCircle, XCircle, Clock, Circle, MinusCircle, Play, GitBranch,
} from "lucide-react";

export interface GraphStage {
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  durationMs?: number;
}

const STYLE: Record<GraphStage["status"], { box: string; icon: JSX.Element; label: string }> = {
  success: { box: "border-green-300 bg-green-50", icon: <CheckCircle className="w-4 h-4 text-green-600" />, label: "Passed" },
  failed:  { box: "border-red-300 bg-red-50", icon: <XCircle className="w-4 h-4 text-red-600" />, label: "Failed" },
  running: { box: "border-amber-300 bg-amber-50 animate-pulse", icon: <Clock className="w-4 h-4 text-amber-500" />, label: "Running" },
  pending: { box: "border-gray-200 bg-white", icon: <Circle className="w-4 h-4 text-gray-300" />, label: "Pending" },
  skipped: { box: "border-dashed border-gray-200 bg-gray-50", icon: <MinusCircle className="w-4 h-4 text-gray-400" />, label: "Skipped" },
};

export default function PipelineGraph({
  stages,
  selected,
  running,
  onSelect,
  onRunStage,
}: {
  stages: GraphStage[];
  selected?: string;
  running?: boolean;
  onSelect: (name: string) => void;
  onRunStage?: (name: string) => void;
}) {
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
      {stages.map((s, i) => {
        const st = STYLE[s.status];
        const isSel = selected === s.name;
        const isCheckout = s.name === "checkout";
        return (
          <Fragment key={s.name}>
            {i > 0 && (
              <div className="flex items-center shrink-0 px-0.5">
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </div>
            )}
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(s.name)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(s.name)}
              className={`group relative shrink-0 w-44 rounded-xl border-2 p-3 cursor-pointer transition-all ${st.box} ${
                isSel ? "ring-2 ring-offset-1 ring-blue-400 shadow-md" : "hover:shadow-sm"
              }`}
              title={s.name}
            >
              <div className="flex items-center gap-2 pr-6">
                {isCheckout ? <GitBranch className="w-4 h-4 text-gray-500" /> : st.icon}
                <span className="font-semibold text-sm text-gray-800 truncate">{s.name}</span>
              </div>
              <div className="text-[11px] mt-1 text-gray-500 flex items-center gap-1">
                <span>{st.label}</span>
                {typeof s.durationMs === "number" && (
                  <span className="text-gray-400">· {(Math.round(s.durationMs / 100) / 10).toFixed(1)}s</span>
                )}
              </div>
              {!isCheckout && onRunStage && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRunStage(s.name); }}
                  disabled={running}
                  className="absolute top-2 right-2 p-1 rounded-md text-gray-400 hover:text-gray-800 hover:bg-white disabled:opacity-30"
                  title={`Run only "${s.name}"`}
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
