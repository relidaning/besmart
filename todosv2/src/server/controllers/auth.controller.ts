import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../../shared/types';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, username, password } = req.body;

      if (!email || !username || !password) {
        res.status(400).json({
          success: false,
          error: 'Email, username, and password are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const user = await this.authService.register(email, username, password);

      const response: ApiResponse = {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt,
        },
        message: 'User registered successfully',
        timestamp: new Date().toISOString(),
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          error: 'Email and password are required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { user, token } = await this.authService.login(email, password);

      const response: ApiResponse = {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
          },
          token,
        },
        message: 'Login successful',
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  getCurrentUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const user = await this.authService.getCurrentUser(userId);

      const response: ApiResponse = {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const updates = req.body;

      const user = await this.authService.updateUser(userId, updates);

      const response: ApiResponse = {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          username: user.username,
          updatedAt: user.updatedAt,
        },
        message: 'Profile updated successfully',
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  };
}