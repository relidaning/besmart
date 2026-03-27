const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { gunzipSync } = require('zlib');
const bcrypt = require('bcrypt');

const NEW_DB_PATH = path.join(__dirname, 'todos.db');
const SQL_DUMP_PATH = path.join(__dirname, 'todos.sql.gz');

class SqlDumpMigrator {
  constructor() {
    this.newDb = null;
    this.userId = null;
    this.categoryMap = {};
    this.parsedData = {
      categories: [],
      todos: []
    };
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
    return new Promise((resolve, reject) => {
      if (this.newDb) {
        this.newDb.close((err) => {
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

  parseSqlDump() {
    console.log('📥 Parsing SQL dump file...');
    
    try {
      // Read and decompress the gzipped file
      const compressedData = fs.readFileSync(SQL_DUMP_PATH);
      const sqlData = gunzipSync(compressedData).toString('utf8');
      
      // Parse categories
      const categoryMatch = sqlData.match(/INSERT INTO `catagory`[^;]+;/);
      if (categoryMatch) {
        const categoryData = categoryMatch[0];
        // Extract values from INSERT statement
        const valuesMatch = categoryData.match(/VALUES\s*(.+?);/s);
        if (valuesMatch) {
          const values = valuesMatch[1];
          // Parse each row
          const rows = values.match(/\([^)]+\)/g);
          if (rows) {
            rows.forEach(row => {
              const match = row.match(/\((\d+),\s*(\d+),\s*'([^']+)'/);
              if (match) {
                this.parsedData.categories.push({
                  id: parseInt(match[1]),
                  user_id: parseInt(match[2]),
                  catagory_name: match[3]
                });
              }
            });
          }
        }
      }
      
      // Parse todos
      const todoMatch = sqlData.match(/INSERT INTO `todos`[^;]+;/);
      if (todoMatch) {
        const todoData = todoMatch[0];
        // Extract values from INSERT statement
        const valuesMatch = todoData.match(/VALUES\s*(.+?);/s);
        if (valuesMatch) {
          const values = valuesMatch[1];
          // Parse each row - handle multiline values
          const rows = values.match(/\([^)]+\)/g);
          if (rows) {
            rows.forEach(row => {
              // Parse the row values
              const match = row.match(/\((\d+),\s*(\d+),\s*(\d+|NULL),\s*(NULL|'[^']*'),\s*'([^']*)',\s*(NULL|'[^']*'),\s*'([^']*)',\s*'([^']*)',\s*(\d+)\)/);
              if (match) {
                this.parsedData.todos.push({
                  id: parseInt(match[1]),
                  user_id: parseInt(match[2]),
                  catagory_id: match[3] === 'NULL' ? null : parseInt(match[3]),
                  catagory_name: match[4] === 'NULL' ? null : match[4].replace(/'/g, ''),
                  todo_name: match[5],
                  acomplished_time: match[6] === 'NULL' ? null : match[6].replace(/'/g, ''),
                  create_time: match[7],
                  is_completed: match[8],
                  postponed: parseInt(match[9])
                });
              }
            });
          }
        }
      }
      
      console.log(`✅ Parsed ${this.parsedData.categories.length} categories and ${this.parsedData.todos.length} todos`);
      console.log('📋 Sample data:');
      console.log('  Categories:', this.parsedData.categories.map(c => c.catagory_name));
      console.log('  First todo:', this.parsedData.todos[0]?.todo_name?.substring(0, 50) + '...');
      
    } catch (error) {
      console.error('❌ Failed to parse SQL dump:', error.message);
      throw error;
    }
  }

  async getOrCreateUser() {
    return new Promise((resolve, reject) => {
      // Check if user exists
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
    
    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B'];
    const icons = ['📝', '📚', '💼', '👤', '🛒'];
    
    let created = 0;
    let existing = 0;

    for (const oldCat of this.parsedData.categories) {
      const oldId = oldCat.id;
      const name = oldCat.catagory_name;
      
      if (!name) {
        console.log(`  ⚠️  Skipping category with no name (ID: ${oldId})`);
        continue;
      }

      // Check if category already exists
      const existingCat = await new Promise((resolve, reject) => {
        this.newDb.get(
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
        this.newDb.run(
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

  async migrateTodos() {
    console.log('\n✅ Migrating todos...');
    
    let migrated = 0;
    let skipped = 0;

    for (const oldTodo of this.parsedData.todos) {
      const title = oldTodo.todo_name;
      
      if (!title) {
        console.log(`  ⚠️  Skipping todo with no title (ID: ${oldTodo.id})`);
        continue;
      }

      // Check if todo already exists
      const existingTodo = await new Promise((resolve, reject) => {
        this.newDb.get(
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
      const isCompleted = oldTodo.is_completed === '1';
      const postponedCount = oldTodo.postponed || 0;
      
      // Determine priority based on postponed count and content
      let priority = 'medium';
      if (postponedCount >= 3) {
        priority = 'high';
      } else if (postponedCount === 0) {
        priority = 'low';
      }
      
      // Adjust priority based on todo content
      const titleLower = title.toLowerCase();
      if (titleLower.includes('urgent') || titleLower.includes('important') || titleLower.includes('critical')) {
        priority = 'high';
      } else if (titleLower.includes('review') || titleLower.includes('study')) {
        priority = 'medium';
      }

      // Map category
      const oldCategoryId = oldTodo.catagory_id;
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

      // Extract tags from todo content
      const tags = this.extractTags(title);
      
      // Estimate minutes based on content
      const estimatedMinutes = this.estimateMinutes(title);

      // Insert into new database
      await new Promise((resolve, reject) => {
        this.newDb.run(
          `INSERT INTO todos (
            title, description, priority, dueDate, completedAt,
            isCompleted, postponedCount, estimatedMinutes, tags,
            userId, categoryId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            title,
            `Original category: ${oldTodo.catagory_name || 'None'}\nCreated: ${oldTodo.create_time}\nMigrated from old todo ID: ${oldTodo.id}`,
            priority,
            null, // dueDate
            completedAt,
            isCompleted ? 1 : 0,
            postponedCount,
            estimatedMinutes,
            JSON.stringify(tags),
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
      console.log(`  ${status} "${title.substring(0, 40)}..." (${priority} priority)`);
    }

    console.log(`✅ Todos: ${migrated} migrated, ${skipped} skipped`);
    return migrated;
  }

  formatDate(dateValue) {
    if (!dateValue) return null;
    
    try {
      // Handle MySQL datetime format
      if (typeof dateValue === 'string') {
        // Check if it's just a date (YYYY-MM-DD)
        if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return `${dateValue} 00:00:00`;
        }
        // Check if it's a datetime (YYYY-MM-DD HH:MM:SS)
        if (dateValue.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
          return dateValue;
        }
      }
      
      return null;
    } catch (error) {
      console.warn(`  ⚠️  Could not parse date: ${dateValue}`);
      return null;
    }
  }

  extractTags(title) {
    const tags = ['migrated'];
    const titleLower = title.toLowerCase();
    
    // Add content-based tags
    if (titleLower.includes('github') || titleLower.includes('http')) {
      tags.push('link');
    }
    if (titleLower.includes('study') || titleLower.includes('learn')) {
      tags.push('learning');
    }
    if (titleLower.includes('review')) {
      tags.push('review');
    }
    if (titleLower.includes('quiz')) {
      tags.push('quiz');
    }
    if (titleLower.includes('demo') || titleLower.includes('example')) {
      tags.push('demo');
    }
    if (titleLower.includes('css') || titleLower.includes('html')) {
      tags.push('frontend');
    }
    if (titleLower.includes('mysql') || titleLower.includes('database')) {
      tags.push('database');
    }
    if (titleLower.includes('java') || titleLower.includes('jvm')) {
      tags.push('java');
    }
    if (titleLower.includes('redis')) {
      tags.push('redis');
    }
    
    return tags;
  }

  estimateMinutes(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('review') || titleLower.includes('quick')) {
      return 15;
    } else if (titleLower.includes('study') || titleLower.includes('learn')) {
      return 60;
    } else if (titleLower.includes('implement') || titleLower.includes('build')) {
      return 120;
    } else if (titleLower.includes('demo') || titleLower.includes('example')) {
      return 30;
    } else {
      return 45; // Default
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
          (SELECT COUNT(*) FROM todos WHERE isCompleted = 0) as pending,
          (SELECT COUNT(*) FROM todos WHERE priority = 'high') as high_priority,
          (SELECT COUNT(*) FROM todos WHERE priority = 'medium') as medium_priority,
          (SELECT COUNT(*) FROM todos WHERE priority = 'low') as low_priority`,
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
  console.log('🚀 SQL Dump Migration Tool');
  console.log('='.repeat(60));
  
  if (!fs.existsSync(SQL_DUMP_PATH)) {
    console.log(`❌ SQL dump file not found: ${SQL_DUMP_PATH}`);
    console.log('💡 Please ensure todos.sql.gz is in the current directory');
    return;
  }

  const migrator = new SqlDumpMigrator();

  try {
    // Parse the SQL dump
    migrator.parseSqlDump();
    
    // Connect to new database
    await migrator.connectNewDb();
    
    // Get or create user
    await migrator.getOrCreateUser();
    
    // Migrate categories
    await migrator.migrateCategories();
    
    // Migrate todos
    const migratedCount = await migrator.migrateTodos();
    
    // Show final stats
    const stats = await migrator.showStats();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 MIGRATION COMPLETE!');
    console.log('📊 FINAL DATABASE STATISTICS:');
    console.log(`   👤 Users: ${stats.users}`);
    console.log(`   📁 Categories: ${stats.categories}`);
    console.log(`   ✅ Total Todos: ${stats.todos}`);
    console.log(`   ✓ Completed: ${stats.completed}`);
    console.log(`   ⏳ Pending: ${stats.pending}`);
    console.log(`   🔴 High Priority: ${stats.high_priority}`);
    console.log(`   🟡 Medium Priority: ${stats.medium_priority}`);
    console.log(`   🟢 Low Priority: ${stats.low_priority}`);
    console.log('\n📋 Category Breakdown:');
    
    // Show categories with counts
    const categoryStats = await new Promise((resolve, reject) => {
      migrator.newDb.all(
        `SELECT c.name, COUNT(t.id) as todo_count 
         FROM categories c 
         LEFT JOIN todos t ON c.id = t.categoryId 
         WHERE c.userId = ? 
         GROUP BY c.id 
         ORDER BY todo_count DESC`,
        [migrator.userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    categoryStats.forEach(cat => {
      console.log(`   • ${cat.name}: ${cat.todo_count} todos`);
    });
    
    console.log('\n🔑 Login credentials:');
    console.log('   Email: test@example.com');
    console.log('   Password: password123');
    console.log('\n🌐 Access the app at: http://localhost:3000');
    console.log('\n💡 Features of migrated data:');
    console.log('   • Intelligent priority assignment based on content');
    console.log('   • Automatic tag generation');
    console.log('   • Time estimates for each todo');
    console.log('   • Preserved completion status and dates');
    
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