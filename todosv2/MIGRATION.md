# Migration Guide: From besmart/todos to todosv2

This guide will help you migrate from your existing Flask-based todos application to the new TypeScript-based todosv2.

## Overview

### Current System (besmart/todos)
- **Framework**: Flask (Python)
- **Database**: MySQL with SQLAlchemy
- **UI**: Server-side rendered templates
- **Features**: Basic CRUD, completion, postponing

### New System (todosv2)
- **Backend**: Express.js with TypeScript
- **Frontend**: React with TypeScript
- **Database**: MySQL with TypeORM
- **Features**: Enhanced CRUD, categories, priorities, tags, statistics, authentication

## Step 1: Database Migration

### 1.1 Backup Current Database
```sql
-- Backup your current todos database
mysqldump -u root -p todos_db > todos_backup_$(date +%Y%m%d).sql
```

### 1.2 Create New Database Schema
The new schema includes additional fields and relationships:

```sql
-- Create new database
CREATE DATABASE todosv2_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Or use the same database with new tables
-- The migration script will handle table creation
```

### 1.3 Data Migration Script
Create a migration script to transfer data:

```python
# migrate_data.py (run from your old environment)
import mysql.connector
from mysql.connector import Error

def migrate_data():
    try:
        # Connect to old database
        old_conn = mysql.connector.connect(
            host='localhost',
            database='todos_db',
            user='root',
            password='your_password'
        )
        
        # Connect to new database
        new_conn = mysql.connector.connect(
            host='localhost',
            database='todosv2_db',
            user='root',
            password='your_password'
        )
        
        old_cursor = old_conn.cursor(dictionary=True)
        new_cursor = new_conn.cursor()
        
        # Migrate categories
        old_cursor.execute("SELECT * FROM catagory")
        categories = old_cursor.fetchall()
        
        for cat in categories:
            new_cursor.execute("""
                INSERT INTO categories (id, name, userId, createdAt, updatedAt)
                VALUES (%s, %s, %s, NOW(), NOW())
            """, (cat['id'], cat['catagory_name'], cat['user_id']))
        
        # Migrate todos
        old_cursor.execute("""
            SELECT t.*, c.catagory_name 
            FROM todos t 
            LEFT JOIN catagory c ON t.catagory_id = c.id
        """)
        todos = old_cursor.fetchall()
        
        for todo in todos:
            new_cursor.execute("""
                INSERT INTO todos (
                    id, title, userId, categoryId, isCompleted, 
                    postponedCount, createdAt, updatedAt, completedAt
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                todo['id'],
                todo['todo_name'],
                todo['user_id'],
                todo['catagory_id'],
                1 if todo['is_completed'] == '1' else 0,
                todo['postponed'],
                todo['create_time'],
                todo['create_time'],
                todo['acomplished_time']
            ))
        
        new_conn.commit()
        print("Migration completed successfully!")
        
    except Error as e:
        print(f"Error during migration: {e}")
    finally:
        if old_conn.is_connected():
            old_cursor.close()
            old_conn.close()
        if new_conn.is_connected():
            new_cursor.close()
            new_conn.close()

if __name__ == "__main__":
    migrate_data()
```

## Step 2: Environment Configuration

### 2.1 Copy Environment Variables
Copy your database credentials from the old `.env` file to the new one:

```bash
# From besmart/todos/.env
DB_HOST=your_host
DB_PORT=3306
DB_USERNAME=your_username
DB_PASSWORD=your_password

# To todosv2/.env
DB_HOST=your_host
DB_PORT=3306
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_DATABASE=todosv2_db  # or your existing database name
```

### 2.2 Additional Configuration
Add new environment variables for the TypeScript app:

```env
# Server
PORT=5000
NODE_ENV=production
JWT_SECRET=your_secure_jwt_secret

# CORS
CORS_ORIGIN=http://localhost:3000

# App
APP_NAME=TodosV2
APP_VERSION=2.0.0
```

## Step 3: Deployment

### 3.1 Development Setup
```bash
cd /home/lidaning/.openclaw/workspace/todosv2

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npm run db:migrate

# Start development servers
npm run dev
```

### 3.2 Production Deployment

#### Option A: Direct Node.js
```bash
# Build the application
npm run build

# Start production server
npm start
```

#### Option B: Docker
```bash
# Build Docker image
docker build -t todosv2 .

# Run container
docker run -d \
  --name todosv2 \
  -p 5000:5000 \
  --env-file .env \
  todosv2
```

#### Option C: PM2 (Process Manager)
```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start dist/server/server.js --name todosv2

# Save process list
pm2 save

# Setup startup script
pm2 startup
```

## Step 4: Reverse Proxy (if needed)

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name todos.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Static files from React build
    location /assets {
        alias /path/to/todosv2/dist/client/assets;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## Step 5: Testing Migration

### 5.1 Verify Data Migration
```sql
-- Check counts match
SELECT 'Old todos count:' as label, COUNT(*) as count FROM todos_db.todos
UNION ALL
SELECT 'New todos count:', COUNT(*) FROM todosv2_db.todos;

-- Check a sample of data
SELECT * FROM todosv2_db.todos LIMIT 5;
SELECT * FROM todosv2_db.categories LIMIT 5;
```

### 5.2 Test API Endpoints
```bash
# Health check
curl http://localhost:5000/health

# Get todos (with authentication)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:5000/api/todos
```

### 5.3 Test Frontend
1. Open http://localhost:3000
2. Register a new user or use existing credentials
3. Verify todos are displayed correctly
4. Test CRUD operations

## Step 6: Rollback Plan

If issues occur, you can rollback:

### 6.1 Database Rollback
```sql
-- Restore from backup
mysql -u root -p todos_db < todos_backup_$(date +%Y%m%d).sql
```

### 6.2 Application Rollback
```bash
# Stop new application
pm2 stop todosv2  # or docker stop todosv2

# Start old application
cd /home/lidaning/.openclaw/workspace/besmart/todos
# Start your Flask app as before
```

## New Features to Explore

### Enhanced Todo Management
- **Priority levels**: Low, Medium, High
- **Tags**: Organize todos with custom tags
- **Estimated time**: Track how long tasks will take
- **Due dates**: With calendar integration

### Statistics Dashboard
- Completion rates
- Priority distribution
- Category breakdown
- Overdue tasks

### User Experience
- **Responsive design**: Works on mobile and desktop
- **Dark/light mode**: (planned)
- **Keyboard shortcuts**: (planned)
- **Drag and drop**: (planned)

### Security
- **JWT authentication**: Secure API access
- **Password hashing**: Using bcrypt
- **Input validation**: Comprehensive validation on all endpoints

## Support

If you encounter issues during migration:

1. Check the logs: `npm run dev:server` output
2. Verify database connection in `.env`
3. Ensure all dependencies are installed: `npm install`
4. Check TypeScript compilation: `npm run type-check`

For additional help, refer to:
- [README.md](./README.md) - General documentation
- API documentation (available at `/api-docs` when implemented)
- GitHub issues (if public repository)

## Conclusion

The migration to todosv2 provides:
- ✅ Modern TypeScript stack
- ✅ Enhanced features and UI
- ✅ Better performance
- ✅ Improved developer experience
- ✅ Future extensibility

Take your time with the migration and test thoroughly before switching completely. The old system can run alongside the new one during testing.