import { useState, useEffect } from "react";
import {
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  HardDrive,
  Package,
  CheckCircle,
  AlertCircle,
  MoreVertical,
} from "lucide-react";
import { apiUrl } from "@/utils/api";

interface DockerImage {
  id: string;
  name: string;
  tag: string;
  size: string;
  created: string;
  author: string;
  status: "ready" | "downloading" | "error";
  containers: number;
}

export default function Images() {
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPullModal, setShowPullModal] = useState(false);
  const [pullImage, setPullImage] = useState({ name: "", tag: "latest" });
  const [isPulling, setIsPulling] = useState(false);

  // Fetch images from backend
  const fetchImages = async () => {
    try {
      setLoading(true);
      const response = await fetch(apiUrl("/api/images"));
      if (!response.ok) {
        throw new Error("Failed to fetch images");
      }
      const result = await response.json();
      const data = result.data;

      // Transform backend data to frontend format
      const transformedImages = data.map((image: any) => ({
        id: image.id,
        name: image.tags?.[0]?.split(":")[0] || "unknown",
        tag: image.tags?.[0]?.split(":")[1] || "latest",
        size: image.size
          ? `${(image.size / 1024 / 1024).toFixed(1)}GB`
          : "Unknown",
        created: new Date(image.created * 1000).toLocaleString(),
        author: image.author || "Unknown",
        status: "ready",
        containers: 0, // Will be calculated
      }));

      setImages(transformedImages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch images");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();

    // Set up real-time updates
    const interval = setInterval(fetchImages, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: DockerImage["status"]) => {
    switch (status) {
      case "ready":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "downloading":
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: DockerImage["status"]) => {
    switch (status) {
      case "ready":
        return "text-green-600 bg-green-50";
      case "downloading":
        return "text-blue-600 bg-blue-50";
      case "error":
        return "text-red-600 bg-red-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const handlePullImage = async () => {
    if (!pullImage.name) {
      return;
    }

    try {
      setIsPulling(true);
      setError(null);

      // Add image with downloading status
      const newImage: DockerImage = {
        id: Date.now().toString(),
        name: pullImage.name,
        tag: pullImage.tag,
        size: "Downloading...",
        created: "Just now",
        author: "Unknown",
        status: "downloading",
        containers: 0,
      };

      setImages((prev) => [newImage, ...prev]);
      setPullImage({ name: "", tag: "latest" });
      setShowPullModal(false);

      // Pull image via backend
      const response = await fetch(apiUrl("/api/images/pull"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newImage.name,
          tag: newImage.tag,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to pull image");
      }

      // Update image status to ready
      setImages((prev) =>
        prev.map((img) =>
          img.id === newImage.id
            ? { ...img, status: "ready", size: "Calculating..." }
            : img,
        ),
      );

      // Fetch updated image list
      await fetchImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pull image");
      // Remove failed image from list
      setImages((prev) =>
        prev.filter((img) => img.id !== Date.now().toString()),
      );
    } finally {
      setIsPulling(false);
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!confirm("Are you sure you want to delete this image?")) {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/images/${imageId}`), {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete image");
      }

      // Refresh images after action
      await fetchImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image");
      setTimeout(() => setError(null), 3000);
    }
  };

  const filteredImages = images.filter(
    (image) =>
      image.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      image.tag.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalSize = images
    .filter((img) => img.status === "ready")
    .reduce((total, img) => {
      const size = parseFloat(img.size);
      return total + (isNaN(size) ? 0 : size);
    }, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Loading Images...
          </h2>
          <p className="text-gray-500">Fetching Docker images from registry</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Error Loading Images
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchImages}
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
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-8">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-light text-gray-900 tracking-tight">
                  Images
                </h1>
                <p className="text-gray-500 text-sm tracking-wide">
                  Manage Docker images and repositories
                </p>
              </div>
              <button
                onClick={() => setShowPullModal(true)}
                className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white font-light rounded-lg transition-colors duration-200"
              >
                <Plus className="w-4 h-4 mr-2" />
                Pull Image
              </button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {images.length}
                </div>
                <div className="text-sm text-gray-500">Total Images</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <Package className="w-5 h-5 text-gray-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {totalSize.toFixed(1)}GB
                </div>
                <div className="text-sm text-gray-500">Total Size</div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <HardDrive className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {images.filter((img) => img.status === "ready").length}
                </div>
                <div className="text-sm text-gray-500">Ready</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {images.reduce((total, img) => total + img.containers, 0)}
                </div>
                <div className="text-sm text-gray-500">Containers</div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search images..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        {/* Images List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Image
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Author
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Containers
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredImages.map((image) => (
                  <tr
                    key={image.id}
                    className="hover:bg-gray-50 transition-colors duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="p-2 bg-gray-100 rounded-lg mr-3">
                          <Package className="w-4 h-4 text-gray-600" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {image.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {image.tag}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{image.size}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900">
                        <Clock className="w-4 h-4 text-gray-400 mr-2" />
                        {image.created}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {image.author}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusText(image.status)}`}
                      >
                        {getStatusIcon(image.status)}
                        <span className="ml-1">{image.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {image.containers}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors duration-200">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors duration-200">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(image.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors duration-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pull Image Modal */}
        {showPullModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md border border-gray-200">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-light text-gray-900">
                    Pull Image
                  </h2>
                  <p className="text-gray-500 text-sm mt-1">
                    Download a Docker image from registry
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Image Name
                    </label>
                    <input
                      type="text"
                      value={pullImage.name}
                      onChange={(e) =>
                        setPullImage({ ...pullImage, name: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
                      placeholder="nginx, redis, postgres..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tag
                    </label>
                    <input
                      type="text"
                      value={pullImage.tag}
                      onChange={(e) =>
                        setPullImage({ ...pullImage, tag: e.target.value })
                      }
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
                      placeholder="latest"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end space-x-3">
                  <button
                    onClick={() => setShowPullModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-light transition-colors duration-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePullImage}
                    disabled={isPulling}
                    className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-light transition-colors duration-200 disabled:opacity-50"
                  >
                    {isPulling ? "Pulling..." : "Pull Image"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
