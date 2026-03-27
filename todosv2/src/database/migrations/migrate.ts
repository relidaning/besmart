import 'reflect-metadata';
import { AppDataSource } from '../data-source';

async function runMigrations() {
  try {
    console.log('Initializing database connection...');
    console.log('Database type:', process.env.DB_TYPE || 'mysql');
    console.log('Database:', process.env.DB_DATABASE || 'todos_db');
    
    await AppDataSource.initialize();
    
    console.log('✅ Database connection established');
    
    console.log('Running migrations...');
    await AppDataSource.runMigrations();
    
    console.log('✅ Migrations completed successfully!');
    
    // Show created tables
    const tables = await AppDataSource.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    console.log('📊 Created tables:', tables.map((t: any) => t.name).join(', '));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Only run if called directly
if (require.main === module) {
  runMigrations();
}

export { runMigrations };