import { useState, useEffect } from "react";

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
}

export default function Cloudflare() {
  const [apiToken, setApiToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [zones, setZones] = useState<CloudflareZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [showAddDomain, setShowAddDomain] = useState(false);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/cloudflare/zones");
      if (response.ok) {
        setIsAuthenticated(true);
        const data = await response.json();
        setZones(data.data || []);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/cloudflare/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiToken, accountId }),
      });

      const data = await response.json();

      if (data.success) {
        setIsAuthenticated(true);
        setSuccess("Cloudflare authentication successful!");
        setApiToken("");
        setAccountId("");
        // Fetch zones after successful auth
        await fetchZones();
      } else {
        setError(data.message || "Authentication failed");
        setIsAuthenticated(false);
      }
    } catch (error) {
      setError("Failed to authenticate with Cloudflare");
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchZones = async () => {
    try {
      const response = await fetch("/api/cloudflare/zones");
      const data = await response.json();
      if (data.success) {
        setZones(data.data || []);
      }
    } catch (error) {
      setError("Failed to fetch zones");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setZones([]);
    setSuccess("Logged out from Cloudflare");
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/cloudflare/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(data.message || "Domain added successfully!");
        setNewDomain("");
        setShowAddDomain(false);
        await fetchZones();
      } else {
        setError(data.message || "Failed to add domain");
      }
    } catch (error) {
      setError("Failed to add domain to Cloudflare");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Cloudflare Settings
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Configure Cloudflare for custom domain tunnels
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-800 dark:text-green-200">{success}</p>
        </div>
      )}

      {!isAuthenticated ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Authenticate with Cloudflare
          </h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Token
              </label>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Enter your Cloudflare API token"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create an API token in Cloudflare dashboard with Zone:Zone and
                Zone:DNS permissions
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account ID (Optional)
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="Enter your Cloudflare account ID"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Found in Cloudflare dashboard under Workers & Pages
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Authenticating..." : "Authenticate"}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Your Cloudflare Zones
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowAddDomain(!showAddDomain)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {showAddDomain ? "Cancel" : "Add Domain"}
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>

            {showAddDomain && (
              <form
                onSubmit={handleCreateZone}
                className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                  Add New Domain
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Domain Name
                    </label>
                    <input
                      type="text"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="example.com"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? "Adding..." : "Add Domain"}
                  </button>
                </div>
              </form>
            )}

            {zones.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">
                No zones found. Add a domain to Cloudflare to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {zones.map((zone) => (
                  <div
                    key={zone.id}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {zone.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Status: {zone.status}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          zone.paused
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        }`}
                      >
                        {zone.paused ? "Paused" : "Active"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
              How to use custom domains
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-blue-800 dark:text-blue-300">
              <li>Add your domain to Cloudflare (if not already added)</li>
              <li>Authenticate here with your Cloudflare API token</li>
              <li>
                Create a tunnel with your custom domain in the Tunnels page
              </li>
              <li>
                The tunnel will use your custom domain instead of
                trycloudflare.com
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
