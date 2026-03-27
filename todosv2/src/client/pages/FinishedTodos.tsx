import React, { useState, useEffect, useCallback } from 'react';
import TodoList from '../components/Todo/TodoList';
import TodoFilters from '../components/Todo/TodoFilters';
import { Todo } from '../../shared/types';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const FinishedTodos: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    priority: '' as string,
    categoryId: '' as string,
    search: '',
  });
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [isMobile, setIsMobile] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Infinite scroll for mobile
  useEffect(() => {
    if (!isMobile || !pagination.hasNext || loadingMore) return;

    const handleScroll = () => {
      const scrollTop = document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;

      if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobile, pagination.hasNext, loadingMore]);

  const fetchTodos = useCallback(async (page = 1, append = false) => {
    try {
      if (page === 1) {
        setIsLoading(true);
      } else {
        setLoadingMore(true);
      }
      
      const token = localStorage.getItem('token');
      
      // Build query string from filters - ALWAYS filter for completed todos
      const queryParams = new URLSearchParams();
      queryParams.append('isCompleted', 'true'); // Only completed todos
      if (filters.priority) {
        queryParams.append('priority', filters.priority);
      }
      if (filters.categoryId) {
        queryParams.append('categoryId', filters.categoryId);
      }
      if (filters.search) {
        queryParams.append('search', filters.search);
      }
      queryParams.append('page', page.toString());
      queryParams.append('limit', pagination.limit.toString());

      const url = `/api/todos?${queryParams.toString()}`;
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch todos');
      }

      const data = await response.json();
      
      if (append) {
        setTodos(prev => [...prev, ...data.data]);
      } else {
        setTodos(data.data);
      }
      
      if (data.pagination) {
        setPagination(data.pagination);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load todos');
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    fetchTodos(1, false);
  }, [fetchTodos]);

  const loadMore = () => {
    if (pagination.hasNext && !loadingMore) {
      fetchTodos(pagination.page + 1, true);
    }
  };

  const handleDeleteTodo = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this completed todo?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/todos/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete todo');
      }

      fetchTodos(pagination.page, false); // Refresh current page
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete todo');
    }
  };

  const handleUncompleteTodo = async (id: number) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/todos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isCompleted: false }),
      });

      if (!response.ok) {
        throw new Error('Failed to uncomplete todo');
      }

      fetchTodos(pagination.page, false); // Refresh current page
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to uncomplete todo');
    }
  };

  const handlePageChange = (page: number) => {
    fetchTodos(page, false);
  };

  if (isLoading && todos.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Finished Todos</h1>
          <p className="text-gray-600 mt-2">Review your completed tasks</p>
          <p className="text-sm text-gray-500">
            Showing {todos.length} of {pagination.total} completed todos
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      <TodoFilters 
        filters={{ ...filters, isCompleted: true }} 
        onFilterChange={(newFilters) => setFilters({
          priority: newFilters.priority,
          categoryId: newFilters.categoryId,
          search: newFilters.search,
        })}
        hideCompletedFilter={true}
      />

      <TodoList
        todos={todos}
        onDelete={handleDeleteTodo}
        onComplete={handleUncompleteTodo}
        completeButtonText="Mark as Pending"
        showEdit={false}
        showPostpone={false}
        showCompleted={true} // Show completed todos in Finished tab
      />

      {/* Pagination for desktop */}
      {!isMobile && pagination.totalPages > 1 && (
        <div className="flex justify-center items-center space-x-2 pt-4 border-t">
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={!pagination.hasPrev}
            className={`px-3 py-1 rounded ${pagination.hasPrev ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
          >
            ← Previous
          </button>
          
          <div className="flex space-x-1">
            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
              let pageNum;
              if (pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (pagination.page <= 3) {
                pageNum = i + 1;
              } else if (pagination.page >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i;
              } else {
                pageNum = pagination.page - 2 + i;
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`px-3 py-1 rounded ${pagination.page === pageNum ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={!pagination.hasNext}
            className={`px-3 py-1 rounded ${pagination.hasNext ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
          >
            Next →
          </button>
          
          <span className="text-sm text-gray-600 ml-4">
            Page {pagination.page} of {pagination.totalPages}
          </span>
        </div>
      )}

      {/* Infinite scroll loading indicator for mobile */}
      {isMobile && loadingMore && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {isMobile && pagination.hasNext && !loadingMore && (
        <div className="text-center py-4 text-gray-500 text-sm">
          Scroll down to load more...
        </div>
      )}

      {todos.length === 0 && !isLoading && (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No completed todos found</h3>
          <p className="text-gray-600 mb-4">
            {filters.search || filters.priority || filters.categoryId
              ? 'Try changing your filters'
              : 'Complete some todos to see them here!'}
          </p>
        </div>
      )}
    </div>
  );
};

export default FinishedTodos;