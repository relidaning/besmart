# TodosV2 - Modern TypeScript Todo Application

A modern, full-featured todo application built with TypeScript, React, Express, and MySQL.

## Features

### Core Features
- ✅ Create, read, update, and delete todos
- ✅ Mark todos as complete/incomplete
- ✅ Postpone todos (with count tracking)
- ✅ Priority levels (low, medium, high)
- ✅ Due dates and reminders
- ✅ Categories with colors and icons
- ✅ Tags for organization
- ✅ Estimated time tracking

### Advanced Features
- 📊 Comprehensive statistics dashboard
- 🔍 Advanced filtering and search
- 📱 Responsive design
- 🔐 User authentication (JWT)
- 📈 Progress tracking
- 🏷️ Category management
- 📅 Calendar view (planned)
- 🔔 Notifications (planned)

## Tech Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MySQL with TypeORM
- **Authentication**: JWT with bcrypt
- **Validation**: class-validator + class-transformer
- **API Documentation**: OpenAPI/Swagger (planned)

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: React Context + hooks
- **Routing**: React Router v6
- **UI Components**: Custom components with Radix UI (planned)
- **Charts**: Recharts (for statistics)

## Project Structure

```
todosv2/
├── src/
│   ├── client/                 # React frontend
│   │   ├── components/         # Reusable components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── contexts/          # React contexts
│   │   ├── utils/             # Frontend utilities
│   │   └── styles/            # CSS/Tailwind styles
│   │
│   ├── server/                # Express backend
│   │   ├── controllers/       # Request handlers
│   │   ├── middleware/        # Express middleware
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   └── utils/            # Server utilities
│   │
│   ├── database/             # Database layer
│   │   ├── entities/         # TypeORM entities
│   │   ├── migrations/       # Database migrations
│   │   └── seeds/           # Seed data
│   │
│   └── shared/               # Shared code
│       ├── dto/              # Data transfer objects
│       ├── types/            # TypeScript types
│       └── utils/            # Shared utilities
│
├── public/                   # Static assets
├── dist/                     # Build output
└── config/                   # Configuration files
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- MySQL 8+
- Git

### Installation

1. **Clone and setup**
```bash
git clone <repository-url>
cd todosv2
cp .env.example .env
```

2. **Configure environment variables**
Edit `.env` file with your database credentials:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=your_password
DB_DATABASE=todos_db
PORT=5000
JWT_SECRET=your_jwt_secret_key
```

3. **Install dependencies**
```bash
npm install
```

4. **Database setup**
```bash
# Create database
mysql -u root -p -e "CREATE DATABASE todos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Run migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

5. **Start development servers**
```bash
# Start both frontend and backend
npm run dev

# Or start separately
npm run dev:server  # Backend on http://localhost:5000
npm run dev:client  # Frontend on http://localhost:3000
```

### Production Build
```bash
npm run build
npm start
```

## API Documentation

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Todos
- `GET /api/todos` - Get todos with pagination and filters
- `GET /api/todos/:id` - Get specific todo
- `POST /api/todos` - Create new todo
- `PUT /api/todos/:id` - Update todo
- `DELETE /api/todos/:id` - Delete todo
- `POST /api/todos/:id/complete` - Mark todo as complete
- `POST /api/todos/:id/postpone` - Postpone todo
- `GET /api/todos/stats` - Get todo statistics

### Categories
- `GET /api/categories` - Get categories
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

## Database Schema

### Users Table
- `id` (PK)
- `email` (unique)
- `username`
- `password` (hashed)
- `isActive`
- `createdAt`
- `updatedAt`

### Categories Table
- `id` (PK)
- `name`
- `color` (hex)
- `icon`
- `userId` (FK)
- `isActive`
- `createdAt`
- `updatedAt`

### Todos Table
- `id` (PK)
- `title`
- `description`
- `priority` (enum: low, medium, high)
- `dueDate`
- `completedAt`
- `isCompleted`
- `postponedCount`
- `estimatedMinutes`
- `tags` (JSON array)
- `userId` (FK)
- `categoryId` (FK)
- `createdAt`
- `updatedAt`

## Development

### Code Style
- TypeScript strict mode enabled
- ESLint for linting
- Prettier for formatting
- Husky for git hooks

### Available Scripts
- `npm run dev` - Start development servers
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - TypeScript type checking
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database

### Testing
```bash
# Run tests (to be implemented)
npm test
npm run test:coverage
```

## Deployment

### Docker
```bash
# Build Docker image
docker build -t todosv2 .

# Run container
docker run -p 5000:5000 --env-file .env todosv2
```

### Kubernetes
Kubernetes manifests are available in the `k8s/` directory.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.

## Support

For issues and feature requests, please use the GitHub Issues page.

---

**Built with ❤️ for productivity**