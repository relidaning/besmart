import React, { useState, useRef, useEffect } from 'react';

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

interface TodoItemProps {
  todo: Todo;
  onEdit?: (todo: Todo) => void;
  onDelete: (id: number) => void;
  onComplete: (id: number) => void;
  onPostpone?: (id: number) => void;
  completeButtonText?: string;
  showEdit?: boolean;
  showPostpone?: boolean;
}

const TodoItem: React.FC<TodoItemProps> = ({
  todo,
  onEdit,
  onDelete,
  onComplete,
  onPostpone,
  completeButtonText = 'Complete',
  showEdit = true,
  showPostpone = true,
}) => {
  const [isMobile, setIsMobile] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const itemRef = useRef<HTMLDivElement>(null);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Touch handlers for swipe gestures
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile || todo.isCompleted) return;
    
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(true);
    setSwipeDirection(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !isSwiping || todo.isCompleted) return;
    
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    
    // Check if it's mostly horizontal swipe
    const deltaX = touchX - touchStartX.current;
    const deltaY = touchY - touchStartY.current;
    
    if (Math.abs(deltaX) > Math.abs(deltaY) * 2) {
      e.preventDefault(); // Prevent vertical scroll during horizontal swipe
      
      // Limit swipe distance
      const maxSwipe = 120;
      const limitedDeltaX = Math.max(-maxSwipe, Math.min(maxSwipe, deltaX));
      
      setSwipeOffset(limitedDeltaX);
      
      // Determine direction
      if (limitedDeltaX > 30) {
        setSwipeDirection('right');
      } else if (limitedDeltaX < -30) {
        setSwipeDirection('left');
      } else {
        setSwipeDirection(null);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isMobile || !isSwiping || todo.isCompleted) return;
    
    // Trigger action based on swipe distance and direction - with smoother thresholds
    if (swipeOffset > 80 && swipeDirection === 'right' && onPostpone) {
      // Right swipe - postpone with animation
      setTimeout(() => onPostpone(todo.id), 150);
      setSwipeOffset(300); // Swipe off to right
    } else if (swipeOffset < -80 && swipeDirection === 'left') {
      // Left swipe - complete with animation
      setTimeout(() => onComplete(todo.id), 150);
      setSwipeOffset(-300); // Swipe off to left
    } else {
      // Not enough swipe - spring back
      setSwipeOffset(0);
    }
    
    setSwipeDirection(null);
    setTimeout(() => setIsSwiping(false), 300);
  };

  // Mouse handlers for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isMobile || todo.isCompleted) return;
    
    touchStartX.current = e.clientX;
    touchStartY.current = e.clientY;
    setIsSwiping(true);
    setSwipeDirection(null);
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isSwiping || todo.isCompleted) return;
      
      const deltaX = moveEvent.clientX - touchStartX.current;
      const deltaY = moveEvent.clientY - touchStartY.current;
      
      if (Math.abs(deltaX) > Math.abs(deltaY) * 2) {
        const maxSwipe = 120;
        const limitedDeltaX = Math.max(-maxSwipe, Math.min(maxSwipe, deltaX));
        
        setSwipeOffset(limitedDeltaX);
        
        if (limitedDeltaX > 30) {
          setSwipeDirection('right');
        } else if (limitedDeltaX < -30) {
          setSwipeDirection('left');
        } else {
          setSwipeDirection(null);
        }
      }
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      handleTouchEnd();
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Swipe action indicators - make them more visible
  const showLeftAction = swipeDirection === 'left' && swipeOffset < -20;
  const showRightAction = swipeDirection === 'right' && swipeOffset > 20 && onPostpone;

  return (
    <div className="relative overflow-hidden">
      {/* Swipe action indicators - improved for better visibility */}
      {isMobile && !todo.isCompleted && (
        <>
          {/* Left swipe indicator (Complete) - more prominent */}
          <div 
            className={`absolute left-0 top-0 bottom-0 w-full flex items-center justify-start pl-6 transition-all duration-150 ${
              showLeftAction ? 'opacity-100' : 'opacity-70'
            } ${swipeOffset < 0 ? 'bg-gradient-to-r from-green-500 to-green-600' : 'bg-gradient-to-r from-green-400 to-green-500'}`}
            style={{ 
              transform: `translateX(${Math.max(-200, swipeOffset - 60)}px)`,
              opacity: Math.min(1, Math.abs(swipeOffset) / 40)
            }}
          >
            <div className="text-white font-bold flex items-center text-lg">
              <span className="mr-3 text-2xl">✓</span>
              <div>
                <div className="font-bold">COMPLETE</div>
                <div className="text-sm font-normal opacity-90">Release to mark as done</div>
              </div>
            </div>
          </div>
          
          {/* Right swipe indicator (Postpone) - more prominent */}
          {onPostpone && (
            <div 
              className={`absolute right-0 top-0 bottom-0 w-full flex items-center justify-end pr-6 transition-all duration-150 ${
                showRightAction ? 'opacity-100' : 'opacity-70'
              } ${swipeOffset > 0 ? 'bg-gradient-to-l from-yellow-500 to-yellow-600' : 'bg-gradient-to-l from-yellow-400 to-yellow-500'}`}
              style={{ 
                transform: `translateX(${Math.min(200, swipeOffset + 60)}px)`,
                opacity: Math.min(1, Math.abs(swipeOffset) / 40)
              }}
            >
              <div className="text-white font-bold flex items-center text-lg">
                <div className="text-right mr-3">
                  <div className="font-bold">POSTPONE</div>
                  <div className="text-sm font-normal opacity-90">Release to postpone</div>
                </div>
                <span className="text-2xl">⏰</span>
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Todo item */}
      <div
        ref={itemRef}
        className={`
          bg-white rounded-lg shadow-sm border border-gray-200
          transition-transform duration-150 ease-out
          ${isSwiping ? 'cursor-grabbing scale-[0.995]' : 'cursor-grab'}
          ${todo.isCompleted ? 'opacity-75' : ''}
          relative z-10
        `}
        style={{
          transform: isMobile ? `translateX(${swipeOffset}px) scale(${isSwiping ? 0.995 : 1})` : 'none',
          touchAction: isMobile ? 'pan-y' : 'auto',
          boxShadow: isSwiping ? '0 4px 20px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.1)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        <div className="p-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <h3 className={`font-medium ${todo.isCompleted ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                  {todo.title}
                </h3>
                {todo.isCompleted && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✓ Completed
                  </span>
                )}
              </div>
              
              {todo.description && (
                <p className="text-gray-600 text-sm mb-3">{todo.description}</p>
              )}
              
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(todo.priority)}`}>
                  {todo.priority}
                </span>
                
                {todo.category && (
                  <span 
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: `${todo.category.color}20`, color: todo.category.color }}
                  >
                    {todo.category.name}
                  </span>
                )}
                
                {todo.dueDate && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    📅 {formatDate(todo.dueDate)}
                  </span>
                )}
                
                {todo.postponedCount && todo.postponedCount > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                    ⏰ {todo.postponedCount}x
                  </span>
                )}
                
                {todo.tags && todo.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {todo.tags.slice(0, 3).map((tag, index) => (
                      <span key={index} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        #{tag}
                      </span>
                    ))}
                    {todo.tags.length > 3 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                        +{todo.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Action buttons (desktop) */}
            {!isMobile && (
              <div className="flex space-x-2 ml-4">
                {showEdit && onEdit && !todo.isCompleted && (
                  <button
                    onClick={() => onEdit(todo)}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                  >
                    Edit
                  </button>
                )}
                
                <button
                  onClick={() => onComplete(todo.id)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    todo.isCompleted
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {todo.isCompleted ? 'Undo' : completeButtonText}
                </button>
                
                {showPostpone && onPostpone && !todo.isCompleted && (
                  <button
                    onClick={() => onPostpone(todo.id)}
                    className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
                  >
                    Postpone
                  </button>
                )}
                
                <button
                  onClick={() => onDelete(todo.id)}
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
          
          {/* Mobile action buttons (when not swiping) */}
          {isMobile && !isSwiping && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
              <div className="flex space-x-2">
                {showEdit && onEdit && !todo.isCompleted && (
                  <button
                    onClick={() => onEdit(todo)}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                  >
                    Edit
                  </button>
                )}
                
                {showPostpone && onPostpone && !todo.isCompleted && (
                  <button
                    onClick={() => onPostpone(todo.id)}
                    className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 transition-colors"
                  >
                    Postpone
                  </button>
                )}
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={() => onComplete(todo.id)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    todo.isCompleted
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {todo.isCompleted ? 'Undo' : completeButtonText}
                </button>
                
                <button
                  onClick={() => onDelete(todo.id)}
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
          
          {/* Swipe instruction hint for mobile - more visible */}
          {isMobile && !todo.isCompleted && !isSwiping && swipeOffset === 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-center space-x-6">
                <div className="flex items-center text-green-600">
                  <span className="mr-2 text-lg">←</span>
                  <span className="text-sm font-medium">Swipe to complete</span>
                </div>
                <div className="h-4 w-px bg-gray-300"></div>
                <div className="flex items-center text-yellow-600">
                  <span className="text-sm font-medium">Swipe to postpone</span>
                  <span className="ml-2 text-lg">→</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center mt-2">
                Try it! The card will follow your finger
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TodoItem;