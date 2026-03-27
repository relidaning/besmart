import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import * as dotenv from 'dotenv';
import { initializeDatabase } from '../database/data-source';
import todoRoutes from './routes/todo.routes';
import categoryRoutes from './routes/category.routes';
import authRoutes from './routes/auth.routes';
import { errorHandler } from './middleware/error.middleware';
import { notFoundHandler } from './middleware/not-found.middleware';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5071');

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Allow all origins for development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: process.env.APP_NAME || 'TodosV2',
    version: process.env.APP_VERSION || '2.0.0',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/todos', todoRoutes);
app.use('/api/categories', categoryRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async (): Promise<void> => {
  try {
    // Initialize database
    try {
      await initializeDatabase();
      console.log('✅ Database connection established');
    } catch (dbError) {
      const error = dbError as Error;
      // Check if it's the "already connected" error
      if (error.message.includes('already established') || error.message.includes('already connected')) {
        console.log('✅ Database already connected');
      } else {
        console.warn('⚠️  Could not connect to database:', error.message);
        console.warn('⚠️  Starting server without database connection');
      }
    }
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`
🚀 Server is running!
📡 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
🌍 Accessible from: http://YOUR_IP:${PORT}
📅 Started at: ${new Date().toISOString()}
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

startServer();