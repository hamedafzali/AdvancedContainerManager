import React, { useState, useEffect } from "react";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Cpu,
  HardDrive,
  Shield,
  Zap,
  BarChart3,
  Activity,
  RefreshCw,
  Play,
  Pause,
} from "lucide-react";
import { apiUrl } from "@/utils/api";

interface OptimizationRecommendation {
  type: 'resource' | 'performance' | 'security' | 'cost';
  priority: 'low' | 'medium' | 'high' | 'critical';
  containerId?: string;
  title: string;
  description: string;
  recommendation: string;
  expectedImpact: string;
  estimatedSavings?: {
    cpu?: number;
    memory?: number;
    cost?: number;
  };
}

interface AIOptimizationResult {
  timestamp: string;
  recommendations: OptimizationRecommendation[];
  overallScore: number;
  potentialSavings: {
    cpu: number;
    memory: number;
    cost: number;
  };
}

const AIOptimization: React.FC = () => {
  const [optimizationResult, setOptimizationResult] = useState<AIOptimizationResult | null>(null);
  const [history, setHistory] = useState<AIOptimizationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoOptimize, setAutoOptimize] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<OptimizationRecommendation | null>(null);

  useEffect(() => {
    fetchOptimizationHistory();
    if (autoOptimize) {
      const interval = setInterval(() => {
        performOptimization();
      }, 300000); // Every 5 minutes
      return () => clearInterval(interval);
    }
  }, [autoOptimize]);

  const performOptimization = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/ai/optimization/analyze"), {
        method: "POST",
      });
      const data = await response.json();
      if (data.success) {
        setOptimizationResult(data.data);
        fetchOptimizationHistory();
      }
    } catch (error) {
      console.error("Error performing optimization:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptimizationHistory = async () => {
    try {
      const response = await fetch(apiUrl("/api/ai/optimization/history"));
      const data = await response.json();
      if (data.success) {
        setHistory(data.data);
      }
    } catch (error) {
      console.error("Error fetching optimization history:", error);
    }
  };

  const applyRecommendation = async (recommendationId: string) => {
    try {
      const response = await fetch(
        apiUrl(`/api/ai/optimization/apply/${recommendationId}`),
        {
        method: "POST",
        },
      );
      const data = await response.json();
      if (data.success) {
        // Refresh optimization data
        performOptimization();
      }
    } catch (error) {
      console.error("Error applying recommendation:", error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return "text-red-600 bg-red-100 border-red-200";
      case "high":
        return "text-orange-600 bg-orange-100 border-orange-200";
      case "medium":
        return "text-yellow-600 bg-yellow-100 border-yellow-200";
      case "low":
        return "text-green-600 bg-green-100 border-green-200";
      default:
        return "text-gray-600 bg-gray-100 border-gray-200";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "resource":
        return <Cpu className="w-5 h-5" />;
      case "performance":
        return <Zap className="w-5 h-5" />;
      case "security":
        return <Shield className="w-5 h-5" />;
      case "cost":
        return <DollarSign className="w-5 h-5" />;
      default:
        return <Activity className="w-5 h-5" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    if (score >= 40) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Brain className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">AI Optimization</h1>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setAutoOptimize(!autoOptimize)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg border ${
                autoOptimize
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              {autoOptimize ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{autoOptimize ? "Auto-Optimize ON" : "Auto-Optimize OFF"}</span>
            </button>
            <button
              onClick={performOptimization}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              <span>Analyze Now</span>
            </button>
          </div>
        </div>

        {optimizationResult && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Optimization Score</span>
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <div className={`text-2xl font-bold ${getScoreColor(optimizationResult.overallScore)}`}>
                {optimizationResult.overallScore}%
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">CPU Savings</span>
                <Cpu className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl font-bold text-green-600">
                {optimizationResult.potentialSavings.cpu.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Memory Savings</span>
                <HardDrive className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {optimizationResult.potentialSavings.memory.toFixed(1)}%
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">Cost Savings</span>
                <DollarSign className="w-5 h-5 text-yellow-600" />
              </div>
              <div className="text-2xl font-bold text-yellow-600">
                ${optimizationResult.potentialSavings.cost.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Optimization Recommendations</h2>
            </div>
            <div className="p-6">
              {optimizationResult?.recommendations.length ? (
                <div className="space-y-4">
                  {optimizationResult.recommendations.map((rec, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${getPriorityColor(rec.priority)} cursor-pointer transition-all hover:shadow-md`}
                      onClick={() => setSelectedRecommendation(rec)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className="mt-1">{getTypeIcon(rec.type)}</div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{rec.title}</h3>
                            <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                            <p className="text-sm text-gray-700 mt-2">
                              <strong>Recommendation:</strong> {rec.recommendation}
                            </p>
                            <p className="text-sm text-gray-700 mt-1">
                              <strong>Expected Impact:</strong> {rec.expectedImpact}
                            </p>
                            {rec.estimatedSavings && (
                              <div className="flex items-center space-x-4 mt-2 text-sm">
                                {rec.estimatedSavings.cpu && (
                                  <span className="text-green-600">
                                    CPU: {rec.estimatedSavings.cpu.toFixed(1)}%
                                  </span>
                                )}
                                {rec.estimatedSavings.memory && (
                                  <span className="text-purple-600">
                                    Memory: {rec.estimatedSavings.memory.toFixed(1)}%
                                  </span>
                                )}
                                {rec.estimatedSavings.cost && (
                                  <span className="text-yellow-600">
                                    Cost: ${rec.estimatedSavings.cost.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(rec.priority)}`}>
                            {rec.priority.toUpperCase()}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              applyRecommendation(`rec-${index}`);
                            }}
                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                  <p className="text-gray-600">No optimization recommendations at this time.</p>
                  <p className="text-sm text-gray-500 mt-2">Your system is running optimally!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Optimization History</h2>
            </div>
            <div className="p-6">
              {history.length ? (
                <div className="space-y-3">
                  {history.slice(0, 10).map((result, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {new Date(result.timestamp).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-gray-500">
                            {result.recommendations.length} recommendations
                          </p>
                        </div>
                      </div>
                      <div className={`text-sm font-medium ${getScoreColor(result.overallScore)}`}>
                        {result.overallScore}%
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-4">No history available</p>
              )}
            </div>
          </div>

          {selectedRecommendation && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Selected Recommendation</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    {getTypeIcon(selectedRecommendation.type)}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(selectedRecommendation.priority)}`}>
                      {selectedRecommendation.priority.toUpperCase()}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900">{selectedRecommendation.title}</h3>
                  <p className="text-sm text-gray-600">{selectedRecommendation.description}</p>
                  <div className="pt-4 border-t border-gray-200">
                    <button
                      onClick={() => applyRecommendation(`selected-${Date.now()}`)}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Apply This Recommendation
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIOptimization;
