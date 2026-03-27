const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'todos.db');

// Sample data structure from old app (for reference)
const OLD_SAMPLE_DATA = {
  categories: [
    { id: 1, user_id: 1, catagory_name: 'Work' },
    { id: 2, user_id: 1, catagory_name: 'Personal' },
    { id: 3, user_id: 1, catagory_name: 'Shopping' }
  ],
  todos: [
    { 
      id: 1, 
      user_id: 1, 
      catagory_id: 1, 
      catagory_name: 'Work', 
      todo_name: 'Complete project', 
      acomplished_time: null, 
      create_time: '2024-01-15', 
      is_completed: '0', 
      postponed: 2 
    },
    { 
      id: 2, 
      user_id: 1, 
      catagory_id: 2, 
      catagory_name: 'Personal', 
      todo_name: 'Buy groceries', 
      acomplished_time: '2024-01-10', 
      create_time: '2024-01-09', 
      is_completed: '1', 
      postponed: 0 
    }
  ]
};

class DataMigrator {
  constructor() {
    this.db = null;
    this.userId = null;
    this.categoryMap = {};
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
        if (err) {
          console.error('❌ Failed to connect to database:', err.message);
          reject(err);
        } else {
          console.log('✅ Connected to database');
          resolve();
        }
      });
    });
  }

  async disconnect() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('❌ Failed to close database:', err.message);
            reject(err);
          } else {
            console.log('✅ Database connection closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  async getOrCreateUser(email = 'test@example.com', username = 'Test User') {
    return new Promise((resolve, reject) => {
      // Check if user exists
      this.db.get(
        'SELECT id FROM users WHERE email = ?',
        [email],
        async (err, user) => {
          if (err) {
            reject(err);
            return;
          }

          if (user) {
            this.userId = user.id;
            console.log(`✅ Using existing user: ${email} (ID: ${user.id})`);
            resolve(user.id);
            return;
          }

          // Create new user
          const hashedPassword = await bcrypt.hash('password123', 10);
          this.db.run(
            'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
            [email, username, hashedPassword],
            function(err) {
              if (err) {
                reject(err);
                return;
              }
              this.userId = this.lastID;
              console.log(`✅ Created new user: ${email} (ID: ${this.lastID})`);
              resolve(this.lastID);
            }
          );
        }
      );
    });
  }

  async migrateCategories(categories) {
    console.log('\n📁 Migrating categories...');
    
    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B', '#8B5CF6'];
    const icons = ['💼', '👤', '🛒', '❤️', '📚', '🏠'];
    
    let created = 0;
    let existing = 0;

    for (const oldCat of categories) {
      const oldId = oldCat.id || oldCat.catagory_id;
      const name = oldCat.catagory_name || oldCat.name || oldCat.category_name;
      
      if (!name) {
        console.log(`  ⚠️  Skipping category with no name:`, oldCat);
        continue;
      }

      // Check if category already exists
      const existingCat = await new Promise((resolve, reject) => {
        this.db.get(
          'SELECT id FROM categories WHERE name = ? AND userId = ?',
          [name, this.userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (existingCat) {
        this.categoryMap[oldId] = existingCat.id;
        existing++;
        console.log(`  ✓ Category "${name}" already exists (ID: ${existingCat.id})`);
        continue;
      }

      // Create new category
      const color = colors[created % colors.length];
      const icon = icons[created % icons.length];

      const newId = await new Promise((resolve, reject) => {
        this.db.run(
          'INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)',
          [name, color, icon, this.userId],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });

      this.categoryMap[oldId] = newId;
      created++;
      console.log(`  ✓ Created category "${name}" (ID: ${newId})`);
    }

    console.log(`✅ Categories: ${created} created, ${existing} existing`);
    return this.categoryMap;
  }

  async migrateTodos(todos) {
    console.log('\n✅ Migrating todos...');
    
    let migrated = 0;
    let skipped = 0;

    for (const oldTodo of todos) {
      const title = oldTodo.todo_name || oldTodo.title || oldTodo.name;
      
      if (!title) {
        console.log(`  ⚠️  Skipping todo with no title:`, oldTodo);
        continue;
      }

      // Check if todo already exists
      const existingTodo = await new Promise((resolve, reject) => {
        this.db.get(
          'SELECT id FROM todos WHERE title = ? AND userId = ?',
          [title, this.userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (existingTodo) {
        skipped++;
        console.log(`  ⏭️  Todo "${title.substring(0, 30)}..." already exists, skipping`);
        continue;
      }

      // Map data to new format
      const isCompleted = oldTodo.is_completed === '1' || oldTodo.is_completed === true || oldTodo.isCompleted;
      const postponedCount = oldTodo.postponed || oldTodo.postponedCount || 0;
      
      // Determine priority based on postponed count
      let priority = 'medium';
      if (postponedCount >= 3) priority = 'high';
      else if (postponedCount === 0) priority = 'low';

      // Map category
      const oldCategoryId = oldTodo.catagory_id || oldTodo.category_id;
      let categoryId = null;
      if (oldCategoryId && this.categoryMap[oldCategoryId]) {
        categoryId = this.categoryMap[oldCategoryId];
      }

      // Handle dates
      let createdAt = null;
      if (oldTodo.create_time) {
        createdAt = this.formatDate(oldTodo.create_time);
      }

      let completedAt = null;
      if (isCompleted && oldTodo.acomplished_time) {
        completedAt = this.formatDate(oldTodo.acomplished_time);
      }

      // Insert into new database
      await new Promise((resolve, reject) => {
        this.db.run(
          `INSERT INTO todos (
            title, description, priority, dueDate, completedAt,
            isCompleted, postponedCount, estimatedMinutes, tags,
            userId, categoryId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            title,
            oldTodo.description || `Migrated from old todo`,
            priority,
            null, // dueDate
            completedAt,
            isCompleted ? 1 : 0,
            postponedCount,
            oldTodo.estimatedMinutes || 30,
            JSON.stringify(oldTodo.tags || ['migrated']),
            this.userId,
            categoryId,
            createdAt || new Date().toISOString().replace('T', ' ').substring(0, 19)
          ],
          function(err) {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      migrated++;
      const status = isCompleted ? '✓' : '⏳';
      console.log(`  ${status} Todo "${title.substring(0, 30)}..." (Priority: ${priority})`);
    }

    console.log(`✅ Todos: ${migrated} migrated, ${skipped} skipped`);
    return migrated;
  }

  formatDate(dateValue) {
    if (!dateValue) return null;
    
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return null;
      
      return date.toISOString().replace('T', ' ').substring(0, 19);
    } catch (error) {
      console.warn(`  ⚠️  Could not parse date: ${dateValue}`, error.message);
      return null;
    }
  }

  async migrateFromJSON(jsonData) {
    console.log('📥 Migrating from JSON data...');
    
    const categories = jsonData.categories || jsonData.catagories || [];
    const todos = jsonData.todos || [];
    
    await this.migrateCategories(categories);
    await this.migrateTodos(todos);
  }

  async migrateFromCSV(csvContent) {
    console.log('📥 Migrating from CSV data...');
    // CSV parsing would go here
    console.log('⚠️  CSV migration not implemented yet');
  }

  async showCurrentStats() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          (SELECT COUNT(*) FROM users) as users,
          (SELECT COUNT(*) FROM categories) as categories,
          (SELECT COUNT(*) FROM todos) as todos,
          (SELECT COUNT(*) FROM todos WHERE isCompleted = 1) as completed,
          (SELECT COUNT(*) FROM todos WHERE isCompleted = 0) as pending`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows[0]);
          }
        }
      );
    });
  }
}

async function main() {
  console.log('🚀 Data Migration Tool');
  console.log('='.repeat(50));

  const migrator = new DataMigrator();

  try {
    await migrator.connect();
    
    // Get or create user
    await migrator.getOrCreateUser();
    
    // Check for data files
    const dataFiles = [
      'data.json',
      'todos.json', 
      'categories.json',
      'export.json',
      'backup.json'
    ];
    
    let dataMigrated = false;
    
    for (const file of dataFiles) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        console.log(`\n📄 Found data file: ${file}`);
        try {
          const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          await migrator.migrateFromJSON(jsonData);
          dataMigrated = true;
          break;
        } catch (error) {
          console.log(`  ⚠️  Could not parse ${file}: ${error.message}`);
        }
      }
    }
    
    if (!dataMigrated) {
      console.log('\n📝 No data files found. Using sample migration...');
      console.log('💡 To migrate your data:');
      console.log('   1. Create a JSON file with your data');
      console.log('   2. Name it data.json in this directory');
      console.log('   3. Run this script again');
      console.log('\n📋 Sample JSON structure:');
      console.log(JSON.stringify(OLD_SAMPLE_DATA, null, 2));
    }
    
    // Show final stats
    const stats = await migrator.showCurrentStats();
    console.log('\n' + '='.repeat(50));
    console.log('📊 FINAL DATABASE STATISTICS:');
    console.log(`   👤 Users: ${stats.users}`);
    console.log(`   📁 Categories: ${stats.categories}`);
    console.log(`   ✅ Todos: ${stats.todos}`);
    console.log(`   ✓ Completed: ${stats.completed}`);
    console.log(`   ⏳ Pending: ${stats.pending}`);
    console.log('\n🔑 Login credentials:');
    console.log('   Email: test@example.com');
    console.log('   Password: password123');
    console.log('\n🌐 Access the app at: http://localhost:3000');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
  } finally {
    await migrator.disconnect();
  }
}

// Run migration
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { DataMigrator };