import { Repository, Between } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { Todo } from '../../database/entities/Todo';
import { Category } from '../../database/entities/Category';
import { TodoStats } from '../../shared/types';
import { CreateTodoDto, UpdateTodoDto, TodoQueryDto } from '../../shared/dto/todo.dto';
import { AppError } from '../middleware/error.middleware';

export class TodoService {
  private todoRepository: Repository<Todo>;
  private categoryRepository: Repository<Category>;

  constructor() {
    this.todoRepository = AppDataSource.getRepository(Todo);
    this.categoryRepository = AppDataSource.getRepository(Category);
  }

  async createTodo(userId: number, createTodoDto: CreateTodoDto): Promise<Todo> {
    const todo = this.todoRepository.create({
      ...createTodoDto,
      userId,
      dueDate: createTodoDto.dueDate ? new Date(createTodoDto.dueDate) : undefined,
    });

    if (createTodoDto.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: createTodoDto.categoryId, userId },
      });

      if (!category) {
        throw new AppError(404, 'Category not found');
      }

      todo.category = category;
    }

    return await this.todoRepository.save(todo);
  }

  async getTodos(userId: number, query: TodoQueryDto): Promise<{ todos: Todo[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      categoryId,
      priority,
      isCompleted,
      dueDateFrom,
      dueDateTo,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * limit;

    const queryBuilder = this.todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.category', 'category')
      .where('todo.userId = :userId', { userId });

    if (categoryId) {
      queryBuilder.andWhere('todo.categoryId = :categoryId', { categoryId });
    }

    if (priority) {
      queryBuilder.andWhere('todo.priority = :priority', { priority });
    }

    if (typeof isCompleted === 'boolean') {
      queryBuilder.andWhere('todo.isCompleted = :isCompleted', { isCompleted });
    }

    if (dueDateFrom) {
      queryBuilder.andWhere('todo.dueDate >= :dueDateFrom', { dueDateFrom: new Date(dueDateFrom) });
    }

    if (dueDateTo) {
      queryBuilder.andWhere('todo.dueDate <= :dueDateTo', { dueDateTo: new Date(dueDateTo) });
    }

    if (search) {
      queryBuilder.andWhere('(todo.title LIKE :search OR todo.description LIKE :search)', {
        search: `%${search}%`,
      });
    }

    const [todos, total] = await queryBuilder
      .orderBy(`todo.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { todos, total };
  }

  async getTodoById(userId: number, todoId: number): Promise<Todo> {
    const todo = await this.todoRepository.findOne({
      where: { id: todoId, userId },
      relations: ['category'],
    });

    if (!todo) {
      throw new AppError(404, 'Todo not found');
    }

    return todo;
  }

  async updateTodo(userId: number, todoId: number, updateTodoDto: UpdateTodoDto): Promise<Todo> {
    const todo = await this.getTodoById(userId, todoId);

    if (updateTodoDto.categoryId && updateTodoDto.categoryId !== todo.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: updateTodoDto.categoryId, userId },
      });

      if (!category) {
        throw new AppError(404, 'Category not found');
      }

      todo.category = category;
    }

    if (updateTodoDto.dueDate) {
      todo.dueDate = new Date(updateTodoDto.dueDate);
    }

    if (updateTodoDto.isCompleted === true && !todo.isCompleted) {
      todo.completedAt = new Date();
    } else if (updateTodoDto.isCompleted === false) {
      todo.completedAt = null as any;
    }

    Object.assign(todo, updateTodoDto);

    return await this.todoRepository.save(todo);
  }

  async deleteTodo(userId: number, todoId: number): Promise<void> {
    const todo = await this.getTodoById(userId, todoId);
    await this.todoRepository.remove(todo);
  }

  async completeTodo(userId: number, todoId: number): Promise<Todo> {
    const todo = await this.getTodoById(userId, todoId);
    
    if (todo.isCompleted) {
      throw new AppError(400, 'Todo is already completed');
    }

    todo.isCompleted = true;
    todo.completedAt = new Date();

    return await this.todoRepository.save(todo);
  }

  async postponeTodo(userId: number, todoId: number): Promise<Todo> {
    const todo = await this.getTodoById(userId, todoId);
    
    if (todo.isCompleted) {
      throw new AppError(400, 'Cannot postpone completed todo');
    }

    todo.postponedCount += 1;

    return await this.todoRepository.save(todo);
  }

  async getStats(userId: number): Promise<TodoStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      total,
      completed,
      pending,
      overdue,
      todayCount,
      lowPriority,
      mediumPriority,
      highPriority,
    ] = await Promise.all([
      this.todoRepository.count({ where: { userId } }),
      this.todoRepository.count({ where: { userId, isCompleted: true } }),
      this.todoRepository.count({ where: { userId, isCompleted: false } }),
      this.todoRepository.count({
        where: {
          userId,
          isCompleted: false,
          dueDate: Between(new Date(0), new Date(today)),
        },
      }),
      this.todoRepository.count({
        where: {
          userId,
          dueDate: Between(today, tomorrow),
        },
      }),
      this.todoRepository.count({ where: { userId, priority: 'low' } }),
      this.todoRepository.count({ where: { userId, priority: 'medium' } }),
      this.todoRepository.count({ where: { userId, priority: 'high' } }),
    ]);

    const categories = await this.todoRepository
      .createQueryBuilder('todo')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('COUNT(todo.id)', 'count')
      .leftJoin('todo.category', 'category')
      .where('todo.userId = :userId', { userId })
      .groupBy('category.id, category.name')
      .getRawMany();

    return {
      total,
      completed,
      pending,
      overdue,
      today: todayCount,
      byPriority: {
        low: lowPriority,
        medium: mediumPriority,
        high: highPriority,
      },
      byCategory: categories.map((cat: any) => ({
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        count: parseInt(cat.count),
      })),
    };
  }
}