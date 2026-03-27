import { Repository } from 'typeorm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../../database/data-source';
import { User } from '../../database/entities/User';
import { UserPayload } from '../../shared/types';
import { AppError } from '../middleware/error.middleware';

export class AuthService {
  private userRepository: Repository<User>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  async register(email: string, username: string, password: string): Promise<User> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new AppError(400, 'User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = this.userRepository.create({
      email,
      username,
      password: hashedPassword,
    });

    return await this.userRepository.save(user);
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    // Find user
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new AppError(403, 'Account is disabled');
    }

    // Generate JWT token
    const payload: UserPayload = {
      userId: user.id,
      email: user.email,
      username: user.username,
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT secret not configured');
    }

    const token = jwt.sign(payload, secret, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    } as jwt.SignOptions);

    return { user, token };
  }

  async getCurrentUser(userId: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    return user;
  }

  async updateUser(userId: number, updates: Partial<User>): Promise<User> {
    const user = await this.getCurrentUser(userId);
    
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    Object.assign(user, updates);
    return await this.userRepository.save(user);
  }
}