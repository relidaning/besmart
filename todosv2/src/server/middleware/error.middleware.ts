import { Request, Response, NextFunction } from 'express';
import { ValidationError } from 'class-validator';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  error: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('Error:', error);

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (Array.isArray(error) && error[0] instanceof ValidationError) {
    const validationErrors = error.map((err: ValidationError) => ({
      property: err.property,
      constraints: err.constraints,
    }));

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: validationErrors,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Default error
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString(),
  });
};