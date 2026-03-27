const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const NEW_DB_PATH = path.join(__dirname, 'todos.db');

class OldDbMigrator {
  constructor(oldDbPath) {
    this.oldDbPath = oldDbPath;
    this.oldDb = null;
    this.newDb = null;
    this.userId = null;
    this.categoryMap = {};
  }

  async connectOldDb() {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.oldDbPath)) {
        reject(new Error(`Old database file not found: ${this.oldDbPath}`));
        return;
      }

      this.oldDb = new sqlite3.Database(this.oldDbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          console.error('❌ Failed to connect to old database:', err.message);
          reject(err);
        } else {
          console.log(`✅ Connected to old database: ${path.basename(this.oldDbPath)}`);
          resolve();
        }
      });
    });
  }

  async connectNewDb() {
    return new Promise((resolve, reject) => {
      this.newDb = new sqlite3.Database(NEW_DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
        if (err) {
          console.error('❌ Failed to connect to new database:', err.message);
          reject(err);
        } else {
          console.log('✅ Connected to new database');
          resolve();
        }
      });
    });
  }

  async disconnect() {
    const closePromises = [];
    
    if (this.oldDb) {
      closePromises.push(new Promise((resolve) => {
        this.oldDb.close((err) => {
          if (err) console.error('❌ Failed to close old database:', err.message);
          else console.log('✅ Old database connection closed');
          resolve();
        });
      }));
    }
    
    if (this.newDb) {
      closePromises.push(new Promise((resolve) => {
        this.newDb.close((err) => {
          if (err) console.error('❌ Failed to close new database:', err.message);
          else console.log('✅ New database connection closed');
          resolve();
        });
      }));
    }
    
    await Promise.all(closePromises);
  }

  async detectOldStructure() {
    return new Promise((resolve, reject) => {
      this.oldDb.all(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        (err, tables) => {
          if (err) {
            reject(err);
            return;
          }

          const tableNames = tables.map(t => t.name.toLowerCase());
          console.log('📋 Old database tables:', tableNames);

          const structure = {
            hasCatagory: tableNames.includes('catagory'),
            hasCategories: tableNames.includes('categories'),
            hasTodos: tableNames.includes('todos'),
            hasUsers: tableNames.includes('users')
          };

          console.log('🔍 Detected structure:', structure);
          resolve(structure);
        }
      );
    });
  }

  async getOrCreateUser() {
    return new Promise((resolve, reject) => {
      // Check if user exists in new database
      this.newDb.get(
        'SELECT id FROM users WHERE email = ?',
        ['test@example.com'],
        async (err, user) => {
          if (err) {
            reject(err);
            return;
          }

          if (user) {
            this.userId = user.id;
            console.log(`✅ Using existing user: test@example.com (ID: ${user.id})`);
            resolve(user.id);
            return;
          }

          // Create new user
          const hashedPassword = await bcrypt.hash('password123', 10);
          this.newDb.run(
            'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
            ['test@example.com', 'Test User', hashedPassword],
            function(err) {
              if (err) {
                reject(err);
                return;
              }
              this.userId = this.lastID;
              console.log(`✅ Created new user: test@example.com (ID: ${this.lastID})`);
              resolve(this.lastID);
            }
          );
        }
      );
    });
  }

  async migrateCategories() {
    console.log('\n📁 Migrating categories...');
    
    return new Promise((resolve, reject) => {
      // Try to get categories from old database
      const query = "SELECT * FROM catagory";
      
      this.oldDb.all(query, async (err, oldCategories) => {
        if (err) {
          console.log('  ⚠️  No categories table found or error:', err.message);
          resolve({});
          return;
        }

        if (!oldCategories || oldCategories.length === 0) {
          console.log('  ℹ️  No categories found in old database');
          resolve({});
          return;
        }

        console.log(`  Found ${oldCategories.length} categories in old database`);

        const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B'];
        const icons = ['💼', '👤', '🛒', '❤️', '📚'];
        
        let created = 0;
        let existing = 0;

        for (const oldCat of oldCategories) {
          const oldId = oldCat.id;
          const name = oldCat.catagory_name || oldCat.name;
          
          if (!name) {
            console.log(`  ⚠️  Skipping category with no name (ID: ${oldId})`);
            continue;
          }

          // Check if category already exists in new database
          const existingCat = await new Promise((resolveCat, rejectCat) => {
            this.newDb.get(
              'SELECT id FROM categories WHERE name = ? AND userId = ?',
              [name, this.userId],
              (err, row) => {
                if (err) rejectCat(err);
                else resolveCat(row);
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

          const newId = await new Promise((resolveCat, rejectCat) => {
            this.newDb.run(
              'INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)',
              [name, color, icon, this.userId],
              function(err) {
                if (err) rejectCat(err);
                else resolveCat(this.lastID);
              }
            );
          });

          this.categoryMap[oldId] = newId;
          created++;
          console.log(`  ✓ Created category "${name}" (ID: ${newId})`);
        }

        console.log(`✅ Categories: ${created} created, ${existing} existing`);
        resolve(this.categoryMap);
      });
    });
  }

  async migrateTodos() {
    console.log('\n✅ Migrating todos...');
    
    return new Promise((resolve, reject) => {
      // Try to get todos from old database
      const query = "SELECT * FROM todos";
      
      this.oldDb.all(query, async (err, oldTodos) => {
        if (err) {
          console.log('  ⚠️  No todos table found or error:', err.message);
          resolve(0);
          return;
        }

        if (!oldTodos || oldTodos.length === 0) {
          console.log('  ℹ️  No todos found in old database');
          resolve(0);
          return;
        }

        console.log(`  Found ${oldTodos.length} todos in old database`);

        let migrated = 0;
        let skipped = 0;

        for (const oldTodo of oldTodos) {
          const title = oldTodo.todo_name || oldTodo.title || oldTodo.name;
          
          if (!title) {
            console.log(`  ⚠️  Skipping todo with no title (ID: ${oldTodo.id})`);
            continue;
          }

          // Check if todo already exists in new database
          const existingTodo = await new Promise((resolveTodo, rejectTodo) => {
            this.newDb.get(
              'SELECT id FROM todos WHERE title = ? AND userId = ?',
              [title, this.userId],
              (err, row) => {
                if (err) rejectTodo(err);
                else resolveTodo(row);
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
          await new Promise((resolveTodo, rejectTodo) => {
            this.newDb.run(
              `INSERT INTO todos (
                title, description, priority, dueDate, completedAt,
                isCompleted, postponedCount, estimatedMinutes, tags,
                userId, categoryId, createdAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                title,
                oldTodo.description || `Migrated from old todo ID: ${oldTodo.id}`,
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
                if (err) rejectTodo(err);
                else resolveTodo();
              }
            );
          });

          migrated++;
          const status = isCompleted ? '✓' : '⏳';
          console.log(`  ${status} Todo "${title.substring(0, 30)}..." (Priority: ${priority})`);
        }

        console.log(`✅ Todos: ${migrated} migrated, ${skipped} skipped`);
        resolve(migrated);
      });
    });
  }

  formatDate(dateValue) {
    if (!dateValue) return null;
    
    try {
      // Handle string dates
      if (typeof dateValue === 'string') {
        // Try to parse as ISO string or other formats
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return date.toISOString().replace('T', ' ').substring(0, 19);
        }
        
        // Try to parse as SQLite date string
        const sqliteDateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (sqliteDateMatch) {
          return `${dateValue} 00:00:00`;
        }
      }
      
      // Handle Date objects
      if (dateValue instanceof Date) {
        return dateValue.toISOString().replace('T', ' ').substring(0, 19);
      }
      
      return null;
    } catch (error) {
      console.warn(`  ⚠️  Could not parse date: ${dateValue}`, error.message);
      return null;
    }
  }

  async showStats() {
    return new Promise((resolve, reject) => {
      this.newDb.all(
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
  console.log('🚀 Old Database Migration Tool');
  console.log('='.repeat(60));

  // Look for potential old database files
  const possibleFiles = [
    'old_todos.db',
    'todos_old.db', 
    'backup.db',
    'original.db',
    'flask_todos.db',
    'besmart_todos.db'
  ];

  let oldDbFile = null;
  
  for (const file of possibleFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      oldDbFile = filePath;
      console.log(`📁 Found potential old database: ${file}`);
      break;
    }
  }

  if (!oldDbFile) {
    console.log('❌ No old database file found.');
    console.log('\n💡 Please copy your old database file to one of these names:');
    possibleFiles.forEach(file => console.log(`   - ${file}`));
    console.log('\n📋 Or specify the filename:');
    console.log('   node migrate-old-db.js <filename.db>');
    return;
  }

  const migrator = new OldDbMigrator(oldDbFile);

  try {
    await migrator.connectOldDb();
    await migrator.connectNewDb();
    
    // Detect old structure
    await migrator.detectOldStructure();
    
    // Get or create user
    await migrator.getOrCreateUser();
    
    // Migrate categories
    await migrator.migrateCategories();
    
    // Migrate todos
    await migrator.migrateTodos();
    
    // Show final stats
    const stats = await migrator.showStats();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 MIGRATION COMPLETE!');
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