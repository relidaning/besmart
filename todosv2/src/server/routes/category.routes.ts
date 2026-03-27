import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const categoryController = new CategoryController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Category CRUD operations
router.get('/', categoryController.getCategories);
router.post('/', categoryController.createCategory);
router.get('/:id', categoryController.getCategory);
router.put('/:id', categoryController.updateCategory);
router.delete('/:id', categoryController.deleteCategory);

export default router;