import React, { useState, useEffect } from 'react';
import { Todo } from '../../../shared/types';

interface Category {
  id: number;
  name: string;
  color: string;
}

interface TodoFormProps {
  todo?: Todo | null;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

const TodoForm: React.FC<TodoFormProps> = ({ todo, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    dueDate: '',
    categoryId: '',
    tags: '',
    estimatedMinutes: '',
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, _setIsLoading] = useState(false);

  useEffect(() => {
    if (todo) {
      setFormData({
        title: todo.title,
        description: todo.description || '',
        priority: todo.priority,
        dueDate: todo.dueDate ? todo.dueDate.split('T')[0] : '',
        categoryId: todo.categoryId?.toString() || '',
        tags: todo.tags?.join(', ') || '',
        estimatedMinutes: todo.estimatedMinutes?.toString() || '',
      });
    } else {
      // Reset form when todo is null (create mode)
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        dueDate: '',
        categoryId: '',
        tags: '',
        estimatedMinutes: '',
      });
    }
    fetchCategories();
  }, [todo]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData: any = {
      title: formData.title.trim(),
      priority: formData.priority,
    };

    if (formData.description.trim()) {
      submitData.description = formData.description.trim();
    }

    if (formData.dueDate) {
      submitData.dueDate = formData.dueDate;
    }

    if (formData.categoryId) {
      submitData.categoryId = parseInt(formData.categoryId);
    }

    if (formData.tags.trim()) {
      submitData.tags = formData.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }

    if (formData.estimatedMinutes) {
      submitData.estimatedMinutes = parseInt(formData.estimatedMinutes);
    }

    onSubmit(submitData);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Title *
        </label>
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleInputChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="What needs to be done?"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description (optional)
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Add more details..."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Priority
          </label>
          <select
            name="priority"
            value={formData.priority}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Due Date (optional)
          </label>
          <input
            type="date"
            name="dueDate"
            value={formData.dueDate}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category (optional)
          </label>
          <select
            name="categoryId"
            value={formData.categoryId}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Estimated Time (minutes, optional)
          </label>
          <input
            type="number"
            name="estimatedMinutes"
            value={formData.estimatedMinutes}
            onChange={handleInputChange}
            min="0"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., 30"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tags (optional, comma-separated)
        </label>
        <input
          type="text"
          name="tags"
          value={formData.tags}
          onChange={handleInputChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="work, personal, urgent"
        />
        <p className="text-xs text-gray-500 mt-1">
          Separate multiple tags with commas
        </p>
      </div>

      <div className="sticky bottom-0 bg-white pt-6 border-t border-gray-200 mt-6">
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || !formData.title.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : todo ? 'Update Todo' : 'Create Todo'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default TodoForm;