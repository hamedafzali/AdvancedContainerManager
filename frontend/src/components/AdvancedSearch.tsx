import { useState, useEffect, useMemo } from "react";
import { Search, Filter, X } from "lucide-react";

interface SearchableItem {
  id: string;
  name: string;
  type: "container" | "image" | "network" | "volume" | "project";
  status?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

interface AdvancedSearchProps {
  items: SearchableItem[];
  onSearch: (query: string, filters: SearchFilters) => void;
  placeholder?: string;
  className?: string;
}

interface SearchFilters {
  type?: string[];
  status?: string[];
  tags?: string[];
}

export function AdvancedSearch({
  items,
  onSearch,
  placeholder = "Search resources...",
  className = "",
}: AdvancedSearchProps) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Generate search suggestions based on existing data
  const searchSuggestions = useMemo(() => {
    const suggestions = new Set<string>();

    items.forEach((item) => {
      // Add names
      if (item.name) suggestions.add(item.name);

      // Add types
      suggestions.add(item.type);

      // Add statuses
      if (item.status) suggestions.add(item.status);

      // Add tags
      item.tags?.forEach((tag) => suggestions.add(tag));
    });

    return Array.from(suggestions).slice(0, 10);
  }, [items]);

  // Fuzzy search implementation
  const fuzzySearch = (text: string, pattern: string): boolean => {
    const textLower = text.toLowerCase();
    const patternLower = pattern.toLowerCase();

    let patternIndex = 0;
    for (
      let textIndex = 0;
      textIndex < textLower.length && patternIndex < patternLower.length;
      textIndex++
    ) {
      if (textLower[textIndex] === patternLower[patternIndex]) {
        patternIndex++;
      }
    }

    return patternIndex === patternLower.length;
  };

  // Filter items based on query and filters
  const filteredItems = useMemo(() => {
    let filtered = items;

    // Apply text search with fuzzy matching
    if (query.trim()) {
      filtered = filtered.filter((item) => {
        const searchText =
          `${item.name} ${item.type} ${item.status || ""} ${item.tags?.join(" ") || ""}`.toLowerCase();
        return (
          fuzzySearch(searchText, query) ||
          searchText.includes(query.toLowerCase())
        );
      });
    }

    // Apply filters
    if (filters.type?.length) {
      filtered = filtered.filter((item) => filters.type!.includes(item.type));
    }

    if (filters.status?.length) {
      filtered = filtered.filter(
        (item) => item.status && filters.status!.includes(item.status),
      );
    }

    if (filters.tags?.length) {
      filtered = filtered.filter((item) =>
        item.tags?.some((tag) => filters.tags!.includes(tag)),
      );
    }

    return filtered;
  }, [items, query, filters]);

  // Update suggestions based on query
  useEffect(() => {
    if (query.length > 0) {
      const matchingSuggestions = searchSuggestions.filter(
        (suggestion) =>
          fuzzySearch(suggestion, query) ||
          suggestion.toLowerCase().includes(query.toLowerCase()),
      );
      setSuggestions(matchingSuggestions.slice(0, 5));
    } else {
      setSuggestions([]);
    }
  }, [query, searchSuggestions]);

  // Notify parent of search changes
  useEffect(() => {
    onSearch(query, filters);
  }, [query, filters, onSearch]);

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setSuggestions([]);
  };

  const toggleFilter = (category: keyof SearchFilters, value: string) => {
    setFilters((prev) => {
      const current = prev[category] || [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];

      return {
        ...prev,
        [category]: updated.length > 0 ? updated : undefined,
      };
    });
  };

  const clearFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.values(filters).some(
    (filter) => filter && filter.length > 0,
  );

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-3 pl-12 pr-24 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
        />
        <Search className="w-5 h-5 text-gray-400 absolute left-4 top-3.5" />

        <div className="absolute right-2 top-2 flex items-center space-x-1">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-md transition-colors ${
              showFilters || hasActiveFilters
                ? "bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
            aria-label="Toggle filters"
          >
            <Filter className="w-4 h-4" />
          </button>

          {(query || hasActiveFilters) && (
            <button
              onClick={() => {
                setQuery("");
                clearFilters();
              }}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Search Suggestions */}
      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors first:rounded-t-lg last:rounded-b-lg"
            >
              <div className="flex items-center">
                <Search className="w-4 h-4 text-gray-400 mr-3" />
                <span className="text-gray-900 dark:text-gray-100">
                  {suggestion}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Filters
            </h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Resource Type
              </label>
              <div className="space-y-1">
                {["container", "image", "network", "volume", "project"].map(
                  (type) => (
                    <label key={type} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.type?.includes(type) || false}
                        onChange={() => toggleFilter("type", type)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                      />
                      <span className="ml-2 text-sm text-gray-900 dark:text-gray-100 capitalize">
                        {type}
                      </span>
                    </label>
                  ),
                )}
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <div className="space-y-1">
                {["running", "stopped", "paused", "created", "exited"].map(
                  (status) => (
                    <label key={status} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.status?.includes(status) || false}
                        onChange={() => toggleFilter("status", status)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                      />
                      <span className="ml-2 text-sm text-gray-900 dark:text-gray-100 capitalize">
                        {status}
                      </span>
                    </label>
                  ),
                )}
              </div>
            </div>

            {/* Tags Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tags
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {Array.from(new Set(items.flatMap((item) => item.tags || [])))
                  .slice(0, 10)
                  .map((tag) => (
                    <label key={tag} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.tags?.includes(tag) || false}
                        onChange={() => toggleFilter("tags", tag)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 dark:bg-gray-700"
                      />
                      <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">
                        {tag}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>{filteredItems.length} results found</span>
              <button
                onClick={() => setShowFilters(false)}
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
