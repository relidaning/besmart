import React, { useState, useEffect } from 'react';

interface Category {
  id: number;
  name: string;
}

interface TodoFiltersProps {
  filters: {
    isCompleted?: boolean;
    priority?: string;
    categoryId?: string;
    search?: string;
  };
  onFilterChange: (filters: any) => void;
  hideCompletedFilter?: boolean;
}

const TodoFilters: React.FC<TodoFiltersProps> = ({ filters, onFilterChange, hideCompletedFilter = false }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/categories', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCategories(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const newFilters = { ...localFilters, search: value || undefined };
    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    const clearedFilters = {
      isCompleted: undefined,
      priority: '',
      categoryId: '',
      search: '',
    };
    setLocalFilters(clearedFilters);
    onFilterChange(clearedFilters);
  };

  const hasActiveFilters = 
    localFilters.isCompleted !== undefined ||
    localFilters.priority ||
    localFilters.categoryId ||
    localFilters.search;

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="flex-1">
          <div className="relative">
            <input
              type="text"
              value={localFilters.search || ''}
              onChange={handleSearchChange}
              placeholder="Search todos..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Filter Toggle Button */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <span className="mr-2">🔍</span>
            Filters
            {hasActiveFilters && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                Active
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center px-4 py-2 text-red-600 border border-red-200 rounded-md hover:bg-red-50"
            >
              <span className="mr-2">🗑️</span>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Filter Options */}
      {showFilters && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className={`grid gap-4 ${hideCompletedFilter ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
            {/* Status Filter - hidden when hideCompletedFilter is true */}
            {!hideCompletedFilter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      checked={localFilters.isCompleted === undefined}
                      onChange={() => handleFilterChange('isCompleted', undefined)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2 text-sm text-gray-700">All</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      checked={localFilters.isCompleted === false}
                      onChange={() => handleFilterChange('isCompleted', false)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2 text-sm text-gray-700">Pending</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="status"
                      checked={localFilters.isCompleted === true}
                      onChange={() => handleFilterChange('isCompleted', true)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <span className="ml-2 text-sm text-gray-700">Completed</span>
                  </label>
                </div>
              </div>
            )}

            {/* Priority Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Priority
              </label>
              <select
                value={localFilters.priority || ''}
                onChange={(e) => handleFilterChange('priority', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={localFilters.categoryId || ''}
                onChange={(e) => handleFilterChange('categoryId', e.target.value || undefined)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Categories</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Active Filters:</h4>
              <div className="flex flex-wrap gap-2">
                {localFilters.isCompleted !== undefined && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Status: {localFilters.isCompleted ? 'Completed' : 'Pending'}
                    <button
                      onClick={() => handleFilterChange('isCompleted', undefined)}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      ×
                    </button>
                  </span>
                )}
                {localFilters.priority && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    Priority: {localFilters.priority}
                    <button
                      onClick={() => handleFilterChange('priority', '')}
                      className="ml-2 text-yellow-600 hover:text-yellow-800"
                    >
                      ×
                    </button>
                  </span>
                )}
                {localFilters.categoryId && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Category: {categories.find(c => c.id.toString() === localFilters.categoryId)?.name}
                    <button
                      onClick={() => handleFilterChange('categoryId', '')}
                      className="ml-2 text-green-600 hover:text-green-800"
                    >
                      ×
                    </button>
                  </span>
                )}
                {localFilters.search && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    Search: "{localFilters.search}"
                    <button
                      onClick={() => handleFilterChange('search', '')}
                      className="ml-2 text-purple-600 hover:text-purple-800"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TodoFilters;