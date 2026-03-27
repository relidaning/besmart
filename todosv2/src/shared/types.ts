export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface UserPayload {
  userId: number;
  email: string;
  username: string;
}

export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoFilters {
  categoryId?: number;
  priority?: TodoPriority;
  isCompleted?: boolean;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  tags?: string[];
  search?: string;
}

export interface TodoStats {
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
  byCategory: Array<{
    categoryId: number;
    categoryName: string;
    count: number;
  }>;
}

export interface Todo {
  id: number;
  title: string;
  description?: string;
  priority: TodoPriority;
  dueDate?: string;
  completedAt?: string;
  isCompleted: boolean;
  postponedCount: number;
  estimatedMinutes?: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  userId: number;
  categoryId?: number;
  category?: {
    id: number;
    name: string;
    color: string;
    icon?: string;
  };
}