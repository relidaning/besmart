import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';
import { Category } from '../entities/Category';
import { Todo } from '../entities/Todo';
import bcrypt from 'bcrypt';

async function seedDatabase() {
  try {
    console.log('Initializing database connection...');
    
    // Check if data source is already initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    
    console.log('Seeding database...');
    
    // Clear existing data
    await AppDataSource.getRepository(Todo).clear();
    await AppDataSource.getRepository(Category).clear();
    await AppDataSource.getRepository(User).clear();
    
    // Create test user
    const hashedPassword = await bcrypt.hash('password123', 10);
    const user = AppDataSource.getRepository(User).create({
      email: 'test@example.com',
      username: 'Test User',
      password: hashedPassword,
    });
    await AppDataSource.getRepository(User).save(user);
    console.log('✅ Created test user:', user.email);
    
    // Create categories
    const categories = [
      { name: 'Work', color: '#3B82F6', icon: '💼' },
      { name: 'Personal', color: '#10B981', icon: '👤' },
      { name: 'Shopping', color: '#8B5CF6', icon: '🛒' },
      { name: 'Health', color: '#EF4444', icon: '❤️' },
    ];
    
    const savedCategories = [];
    for (const catData of categories) {
      const category = AppDataSource.getRepository(Category).create({
        ...catData,
        user,
      });
      const savedCat = await AppDataSource.getRepository(Category).save(category);
      savedCategories.push(savedCat);
      console.log(`✅ Created category: ${catData.name}`);
    }
    
    // Create sample todos
    const todos = [
      {
        title: 'Complete project proposal',
        description: 'Finish writing the project proposal document',
        priority: 'high' as const,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
        category: savedCategories[0], // Work
        tags: ['work', 'important'],
        estimatedMinutes: 120,
      },
      {
        title: 'Buy groceries',
        description: 'Milk, eggs, bread, fruits',
        priority: 'medium' as const,
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
        category: savedCategories[2], // Shopping
        tags: ['shopping', 'home'],
        estimatedMinutes: 45,
      },
      {
        title: 'Morning exercise',
        description: '30 minutes of cardio',
        priority: 'low' as const,
        category: savedCategories[3], // Health
        tags: ['health', 'routine'],
        estimatedMinutes: 30,
      },
      {
        title: 'Read book',
        description: 'Finish reading current chapter',
        priority: 'low' as const,
        category: savedCategories[1], // Personal
        tags: ['personal', 'learning'],
        estimatedMinutes: 60,
        isCompleted: true,
        completedAt: new Date(),
      },
      {
        title: 'Plan weekend trip',
        description: 'Research destinations and book accommodations',
        priority: 'medium' as const,
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        tags: ['personal', 'travel'],
        estimatedMinutes: 90,
      },
    ];
    
    for (const todoData of todos) {
      const todo = AppDataSource.getRepository(Todo).create({
        ...todoData,
        user,
      });
      await AppDataSource.getRepository(Todo).save(todo);
      console.log(`✅ Created todo: ${todoData.title}`);
    }
    
    console.log('\n🎉 Database seeded successfully!');
    console.log('Test user credentials:');
    console.log('  Email: test@example.com');
    console.log('  Password: password123');
    console.log('\nYou can now log in and test the application.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  seedDatabase();
}

export { seedDatabase };