import { Router } from 'express';
import { TodoController } from '../controllers/todo.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const todoController = new TodoController();

// Apply authentication middleware to all routes
router.use(authenticate);

// Todo CRUD operations
router.post('/', todoController.createTodo);
router.get('/', todoController.getTodos);
router.get('/stats', todoController.getStats);
router.get('/:id', todoController.getTodo);
router.put('/:id', todoController.updateTodo);
router.delete('/:id', todoController.deleteTodo);

// Todo actions
router.post('/:id/complete', todoController.completeTodo);
router.post('/:id/postpone', todoController.postponeTodo);

export default router;