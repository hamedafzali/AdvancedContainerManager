import { useState } from "react";
import { FileText, FileSpreadsheet, FileJson } from "lucide-react";

interface ExportData {
  containers?: any[];
  images?: any[];
  networks?: any[];
  volumes?: any[];
  metrics?: any;
  logs?: string[];
  systemMetrics?: any;
  containerStats?: any;
  projectStats?: any;
  performanceData?: any;
  containerChartData?: any;
  activities?: any[];
}

interface DataExportProps {
  data: ExportData;
  filename?: string;
  className?: string;
}

export function DataExport({
  data,
  filename = "advanced-container-manager-export",
  className = "",
}: DataExportProps) {
  const [exportFormat, setExportFormat] = useState<"json" | "csv" | "txt">(
    "json",
  );
  const [isExporting, setIsExporting] = useState(false);

  const exportToJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToCSV = (data: any, filename: string) => {
    let csv = "";

    // Handle different data types
    if (Array.isArray(data)) {
      if (data.length > 0) {
        // Get headers from first object
        const headers = Object.keys(data[0]);
        csv += headers.join(",") + "\n";

        // Add data rows
        data.forEach((item) => {
          const row = headers.map((header) => {
            const value = item[header];
            // Escape commas and quotes in CSV
            if (
              typeof value === "string" &&
              (value.includes(",") || value.includes('"'))
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value || "";
          });
          csv += row.join(",") + "\n";
        });
      }
    } else {
      // Handle single object
      const headers = Object.keys(data);
      csv += headers.join(",") + "\n";
      const row = headers.map((header) => data[header] || "");
      csv += row.join(",") + "\n";
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToTXT = (data: any, filename: string) => {
    let txt = "";

    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        txt += `=== Item ${index + 1} ===\n`;
        txt += JSON.stringify(item, null, 2) + "\n\n";
      });
    } else {
      txt = JSON.stringify(data, null, 2);
    }

    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/:/g, "-");
      const exportFilename = `${filename}-${timestamp}`;

      switch (exportFormat) {
        case "json":
          exportToJSON(data, exportFilename);
          break;
        case "csv":
          exportToCSV(data, exportFilename);
          break;
        case "txt":
          exportToTXT(data, exportFilename);
          break;
      }
    } catch (error) {
      console.error("Export failed:", error);
      // Could add error notification here
    } finally {
      setIsExporting(false);
    }
  };

  const getFormatIcon = (format: string) => {
    switch (format) {
      case "json":
        return <FileJson className="w-4 h-4" />;
      case "csv":
        return <FileSpreadsheet className="w-4 h-4" />;
      case "txt":
        return <FileText className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className={`inline-flex items-center space-x-2 ${className}`}>
      <div className="flex items-center space-x-1">
        <select
          value={exportFormat}
          onChange={(e) =>
            setExportFormat(e.target.value as "json" | "csv" | "txt")
          }
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          disabled={isExporting}
        >
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
          <option value="txt">TXT</option>
        </select>
      </div>

      <button
        onClick={handleExport}
        disabled={isExporting}
        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
        title={`Export data as ${exportFormat.toUpperCase()}`}
      >
        {isExporting ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Exporting...
          </>
        ) : (
          <>
            {getFormatIcon(exportFormat)}
            <span className="ml-2">Export</span>
          </>
        )}
      </button>
    </div>
  );
}

// Hook for managing export data
export function useExportData() {
  const [exportData, setExportData] = useState<ExportData>({});

  const addExportData = (key: keyof ExportData, data: any) => {
    setExportData((prev) => ({
      ...prev,
      [key]: data,
    }));
  };

  const clearExportData = () => {
    setExportData({});
  };

  return {
    exportData,
    addExportData,
    clearExportData,
  };
}
