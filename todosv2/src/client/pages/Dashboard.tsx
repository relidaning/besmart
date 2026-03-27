import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface TodoStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  today: number;
  byPriority: {
    low: number;
    medium: number;
    high: number;
  };
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<TodoStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/todos/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const statCards = [
    {
      title: 'Active Todos',
      value: stats.pending,
      icon: '📝',
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      description: 'Incomplete (shown in Todos tab)',
    },
    {
      title: 'Completed',
      value: stats.completed,
      icon: '✅',
      color: 'bg-green-500',
      textColor: 'text-green-600',
      description: 'Done (shown in Finished tab)',
    },
    {
      title: 'Total',
      value: stats.total,
      icon: '📊',
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      description: 'All todos',
    },
    {
      title: 'Overdue',
      value: stats.overdue,
      icon: '⚠️',
      color: 'bg-red-500',
      textColor: 'text-red-600',
      description: 'Incomplete & past due',
    },
    {
      title: 'Due Today',
      value: stats.today,
      icon: '📅',
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600',
      description: 'Due today',
    },
  ];

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1 lg:mt-2 text-sm lg:text-base">Overview of your todo statistics</p>
      </div>

      {/* Completion Rate */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Completion Rate</h2>
        <div className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Progress</span>
            <span className="font-semibold">{completionRate}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            ></div>
          </div>
          <div className="text-sm text-gray-500">
            {stats.completed} of {stats.total} todos completed
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 lg:gap-6">
        {statCards.map((stat) => (
            <div key={stat.title} className="bg-white rounded-lg shadow p-4 lg:p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs lg:text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-xl lg:text-2xl font-bold text-gray-900 mt-1 lg:mt-2">{stat.value}</p>
                  {stat.description && (
                    <p className="text-xs text-gray-500 mt-1">{stat.description}</p>
                  )}
                </div>
                <div className={`p-2 lg:p-3 rounded-full ${stat.color} bg-opacity-10`}>
                  <span className={`text-lg lg:text-xl ${stat.textColor}`}>{stat.icon}</span>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Priority Distribution */}
      <div className="bg-white rounded-lg shadow p-4 lg:p-6">
        <h2 className="text-base lg:text-lg font-semibold text-gray-900 mb-3 lg:mb-4">Priority Distribution</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
          {[
            { label: 'High Priority', value: stats.byPriority.high, color: 'bg-red-500' },
            { label: 'Medium Priority', value: stats.byPriority.medium, color: 'bg-yellow-500' },
            { label: 'Low Priority', value: stats.byPriority.low, color: 'bg-green-500' },
          ].map((priority) => (
            <div key={priority.label} className="space-y-2">
              <div className="flex justify-between text-xs lg:text-sm">
                <span className="text-gray-600">{priority.label}</span>
                <span className="font-semibold">{priority.value}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 lg:h-2">
                <div
                  className={`${priority.color} h-1.5 lg:h-2 rounded-full transition-all duration-500`}
                  style={{
                    width: `${
                      stats.total > 0 ? (priority.value / stats.total) * 100 : 0
                    }%`,
                  }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-4 lg:p-6">
        <h2 className="text-base lg:text-lg font-semibold text-gray-900 mb-3 lg:mb-4">Quick Actions</h2>
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Note:</span> The "Todos" tab now shows only <span className="font-semibold">incomplete todos</span>. 
            Completed todos are in the "Finished" tab.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:gap-4">
          <Link
            to="/todos"
            className="px-3 lg:px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            View Incomplete Todos
          </Link>
          <Link
            to="/todos/finished"
            className="px-3 lg:px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            View Completed Todos
          </Link>
          <Link
            to="/todos?priority=high"
            className="px-3 lg:px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            High Priority
          </Link>
          <Link
            to="/categories"
            className="px-3 lg:px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
          >
            Manage Categories
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;