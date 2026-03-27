import React from 'react';
import TodoItem from './TodoItem';

interface Todo {
  id: number;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  isCompleted: boolean;
  category?: {
    id: number;
    name: string;
    color: string;
  };
  tags: string[];
  createdAt: string;
  postponedCount?: number;
}

interface TodoListProps {
  todos: Todo[];
  onEdit?: (todo: Todo) => void;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  onPostpone?: (id: number) => void;
  completeButtonText?: string;
  showEdit?: boolean;
  showPostpone?: boolean;
  showCompleted?: boolean;
}

const TodoList: React.FC<TodoListProps> = ({
  todos,
  onEdit,
  onDelete,
  onComplete,
  onPostpone,
  completeButtonText = 'Complete',
  showEdit = true,
  showPostpone = true,
  showCompleted = false, // Default to not showing completed todos
}) => {
  if (todos.length === 0) {
    return null;
  }

  // Filter todos based on showCompleted prop
  const pendingTodos = todos.filter(todo => !todo.isCompleted);
  const completedTodos = todos.filter(todo => todo.isCompleted);

  return (
    <div className="space-y-8">
      {/* Pending Todos */}
      {pendingTodos.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Pending ({pendingTodos.length})</h2>
          <div className="space-y-4">
            {pendingTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onEdit={onEdit}
                onDelete={onDelete}
                onComplete={onComplete}
                onPostpone={onPostpone}
                completeButtonText={completeButtonText}
                showEdit={showEdit}
                showPostpone={showPostpone}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed Todos - Only show if showCompleted is true */}
      {showCompleted && completedTodos.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Completed ({completedTodos.length})</h2>
          <div className="space-y-4">
            {completedTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onEdit={onEdit}
                onDelete={onDelete}
                onComplete={onComplete}
                onPostpone={onPostpone}
                completeButtonText={completeButtonText}
                showEdit={showEdit}
                showPostpone={showPostpone}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TodoList;