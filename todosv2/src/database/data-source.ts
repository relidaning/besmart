import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const isSqlite = process.env.DB_TYPE === 'sqlite' || !process.env.DB_HOST;

const dataSourceConfig = isSqlite ? {
  type: 'sqlite',
  database: process.env.DB_DATABASE || './todos.db',
  synchronize: false, // Don't auto-create tables since we already have them
  logging: process.env.NODE_ENV === 'development',
  entities: [path.join(__dirname, '/entities/*.ts')],
  migrations: [], // Disable migrations for now
  subscribers: [],
} : {
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'todos_db',
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  entities: [path.join(__dirname, '/entities/*.ts')],
  migrations: [], // Disable migrations for now
  subscribers: [],
  connectorPackage: 'mysql2',
  extra: {
    charset: 'utf8mb4_unicode_ci',
  },
};

export const AppDataSource = new DataSource(dataSourceConfig as any);

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
};