import { Repository } from 'typeorm';
import { AppDataSource } from '../../database/data-source';
import { Category } from '../../database/entities/Category';
import { AppError } from '../middleware/error.middleware';

export class CategoryService {
  private categoryRepository: Repository<Category>;

  constructor() {
    this.categoryRepository = AppDataSource.getRepository(Category);
  }

  async createCategory(userId: number, name: string, color?: string, icon?: string): Promise<Category> {
    const category = this.categoryRepository.create({
      name,
      color: color || '#3B82F6',
      icon,
      userId,
    });

    return await this.categoryRepository.save(category);
  }

  async getCategories(userId: number): Promise<Category[]> {
    return await this.categoryRepository.find({
      where: { userId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async getCategory(userId: number, categoryId: number): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId, userId },
    });

    if (!category) {
      throw new AppError(404, 'Category not found');
    }

    return category;
  }

  async updateCategory(
    userId: number,
    categoryId: number,
    updates: Partial<Category>
  ): Promise<Category> {
    const category = await this.getCategory(userId, categoryId);
    Object.assign(category, updates);
    return await this.categoryRepository.save(category);
  }

  async deleteCategory(userId: number, categoryId: number): Promise<void> {
    const category = await this.getCategory(userId, categoryId);
    
    // Soft delete by marking as inactive
    category.isActive = false;
    await this.categoryRepository.save(category);
  }
}