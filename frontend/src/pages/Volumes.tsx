import { useState, useEffect } from "react";
import {
  Search,
  Plus,
  Trash2,
  HardDrive,
  Database,
} from "lucide-react";
import { apiUrl } from "@/utils/api";

interface Volume {
  id: string;
  name: string;
  driver: string;
  mountPoint: string;
  created: string;
  size: string;
  containers: number;
  labels: Record<string, string>;
  status: "active" | "inactive";
}

export default function Volumes() {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchVolumes = async () => {
    try {
      setLoading(true);
      const response = await fetch(apiUrl("/api/volumes"));
      if (!response.ok) {
        throw new Error("Failed to fetch volumes");
      }
      const result = await response.json();
      const data = result.data;
      
      const transformedVolumes = data.map((volume: any) => ({
        id: volume.name,
        name: volume.name,
        driver: volume.driver,
        mountPoint: volume.mountpoint,
        created: new Date(volume.created).toLocaleString(),
        size: volume.usage?.Size 
          ? `${(volume.usage.Size / 1024 / 1024).toFixed(1)}MB`
          : "Unknown",
        containers: volume.usage?.RefCount || 0,
        labels: volume.labels || {},
        status: "active" as const,
      }));

      setVolumes(transformedVolumes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch volumes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolumes();
    const interval = setInterval(fetchVolumes, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredVolumes = volumes.filter(volume =>
    volume.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    volume.driver.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateVolume = async () => {
    const name = prompt("Enter volume name:");
    if (!name) return;

    try {
      const response = await fetch(apiUrl("/api/volumes"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        throw new Error("Failed to create volume");
      }

      await fetchVolumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create volume");
    }
  };

  const handleDelete = async (volumeId: string) => {
    if (!confirm("Are you sure you want to delete this volume?")) {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/volumes/${volumeId}`), {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete volume");
      }

      await fetchVolumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete volume");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-light text-gray-900 mb-2">Loading Volumes...</h2>
          <p className="text-gray-500">Fetching Docker volumes</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Database className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-light text-gray-900 mb-2">Error Loading Volumes</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchVolumes}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-light text-gray-900 tracking-tight">Volumes</h1>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search volumes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleCreateVolume}
              className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Volume
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVolumes.map((volume) => (
            <div key={volume.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-2 ${volume.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                  <h3 className="text-lg font-semibold text-gray-900">{volume.name}</h3>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={() => handleDelete(volume.id)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <Trash2 className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Driver:</span>
                  <span className="font-medium">{volume.driver}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Mount Point:</span>
                  <span className="font-medium text-xs truncate max-w-[150px]" title={volume.mountPoint}>
                    {volume.mountPoint}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Size:</span>
                  <span className="font-medium">{volume.size}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Containers:</span>
                  <span className="font-medium">{volume.containers}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created:</span>
                  <span className="font-medium">{volume.created}</span>
                </div>
                {Object.keys(volume.labels).length > 0 && (
                  <div className="flex items-start justify-between text-sm">
                    <span className="text-gray-500">Labels:</span>
                    <div className="flex flex-wrap gap-1 max-w-[150px]">
                      {Object.entries(volume.labels).slice(0, 2).map(([key, value]) => (
                        <span key={key} className="text-xs bg-gray-100 px-1 py-0.5 rounded" title={`${key}: ${value}`}>
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredVolumes.length === 0 && (
          <div className="text-center py-12">
            <HardDrive className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No volumes found</h3>
            <p className="text-gray-500">Get started by creating your first Docker volume</p>
          </div>
        )}
      </div>
    </div>
  );
}
