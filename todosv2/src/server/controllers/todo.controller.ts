import { Request, Response, NextFunction } from 'express';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { TodoService } from '../services/todo.service';
import { CreateTodoDto, UpdateTodoDto, TodoQueryDto } from '../../shared/dto/todo.dto';
import { ApiResponse, PaginatedResponse } from '../../shared/types';

export class TodoController {
  private todoService: TodoService;

  constructor() {
    this.todoService = new TodoService();
  }

  createTodo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const createTodoDto = plainToClass(CreateTodoDto, req.body);
      
      const errors = await validate(createTodoDto);
      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const todo = await this.todoService.createTodo(userId, createTodoDto);

      const response: ApiResponse = {
        success: true,
        data: todo,
        message: 'Todo created successfully',
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  getTodos = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const queryDto = plainToClass(TodoQueryDto, req.query);
      
      const errors = await validate(queryDto);
      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { todos, total } = await this.todoService.getTodos(userId, queryDto);
      const { page = 1, limit = 20 } = queryDto;

      const response: PaginatedResponse<typeof todos[0]> = {
        success: true,
        data: todos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  getTodo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const todoId = parseInt(req.params.id);

      if (isNaN(todoId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid todo ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const todo = await this.todoService.getTodoById(userId, todoId);

      const response: ApiResponse = {
        success: true,
        data: todo,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  updateTodo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const todoId = parseInt(req.params.id);
      const updateTodoDto = plainToClass(UpdateTodoDto, req.body);

      if (isNaN(todoId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid todo ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const errors = await validate(updateTodoDto);
      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const todo = await this.todoService.updateTodo(userId, todoId, updateTodoDto);

      const response: ApiResponse = {
        success: true,
        data: todo,
        message: 'Todo updated successfully',
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  deleteTodo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const todoId = parseInt(req.params.id);

      if (isNaN(todoId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid todo ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await this.todoService.deleteTodo(userId, todoId);

      const response: ApiResponse = {
        success: true,
        message: 'Todo deleted successfully',
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  completeTodo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const todoId = parseInt(req.params.id);

      if (isNaN(todoId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid todo ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const todo = await this.todoService.completeTodo(userId, todoId);

      const response: ApiResponse = {
        success: true,
        data: todo,
        message: 'Todo marked as completed',
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  postponeTodo = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const todoId = parseInt(req.params.id);

      if (isNaN(todoId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid todo ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const todo = await this.todoService.postponeTodo(userId, todoId);

      const response: ApiResponse = {
        success: true,
        data: todo,
        message: 'Todo postponed',
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const stats = await this.todoService.getStats(userId);

      const response: ApiResponse = {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
}