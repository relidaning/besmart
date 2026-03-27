import { Request, Response, NextFunction } from 'express';
import { CategoryService } from '../services/category.service';
import { ApiResponse } from '../../shared/types';

export class CategoryController {
  private categoryService: CategoryService;

  constructor() {
    this.categoryService = new CategoryService();
  }

  createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { name, color, icon } = req.body;

      if (!name) {
        res.status(400).json({
          success: false,
          error: 'Category name is required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const category = await this.categoryService.createCategory(userId, name, color, icon);

      const response: ApiResponse = {
        success: true,
        data: category,
        message: 'Category created successfully',
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  getCategories = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const categories = await this.categoryService.getCategories(userId);

      const response: ApiResponse = {
        success: true,
        data: categories,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  getCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const categoryId = parseInt(req.params.id);

      if (isNaN(categoryId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid category ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const category = await this.categoryService.getCategory(userId, categoryId);

      const response: ApiResponse = {
        success: true,
        data: category,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const categoryId = parseInt(req.params.id);
      const updates = req.body;

      if (isNaN(categoryId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid category ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const category = await this.categoryService.updateCategory(userId, categoryId, updates);

      const response: ApiResponse = {
        success: true,
        data: category,
        message: 'Category updated successfully',
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const categoryId = parseInt(req.params.id);

      if (isNaN(categoryId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid category ID',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await this.categoryService.deleteCategory(userId, categoryId);

      const response: ApiResponse = {
        success: true,
        message: 'Category deleted successfully',
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
}