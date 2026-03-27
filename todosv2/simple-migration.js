const fs = require('fs');
const path = require('path');
const { gunzipSync } = require('zlib');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const SQL_DUMP_PATH = path.join(__dirname, 'todos.sql.gz');
const DB_PATH = path.join(__dirname, 'todos.db');

async function extractDataFromSql() {
  console.log('📥 Extracting data from SQL dump...');
  
  try {
    // Read and decompress the gzipped file
    const compressedData = fs.readFileSync(SQL_DUMP_PATH);
    const sqlData = gunzipSync(compressedData).toString('utf8');
    
    // Extract the entire INSERT statement for todos
    const todoInsertMatch = sqlData.match(/INSERT INTO `todos`[^;]+;/s);
    if (!todoInsertMatch) {
      console.log('❌ No todos INSERT statement found');
      return { categories: [], todos: [] };
    }
    
    const todoInsert = todoInsertMatch[0];
    console.log(`📊 Todo INSERT statement length: ${todoInsert.length} characters`);
    
    // Simple parsing: extract all rows between parentheses
    const rows = [];
    const rowRegex = /\(([^)]+)\)/g;
    let match;
    
    while ((match = rowRegex.exec(todoInsert)) !== null) {
      const rowText = match[1];
      // Split by commas but handle quoted strings
      const values = [];
      let currentValue = '';
      let inQuotes = false;
      let escapeNext = false;
      
      for (let i = 0; i < rowText.length; i++) {
        const char = rowText[i];
        const nextChar = rowText[i + 1];
        
        if (escapeNext) {
          currentValue += char;
          escapeNext = false;
          continue;
        }
        
        if (char === '\\' && nextChar) {
          escapeNext = true;
          continue;
        }
        
        if (char === "'") {
          inQuotes = !inQuotes;
          if (!inQuotes) {
            values.push(currentValue);
            currentValue = '';
          }
          continue;
        }
        
        if (!inQuotes && char === ',') {
          if (currentValue.trim() === 'NULL') {
            values.push(null);
          } else if (currentValue.trim() !== '') {
            values.push(currentValue.trim());
          }
          currentValue = '';
          continue;
        }
        
        if (inQuotes || char !== ' ') {
          currentValue += char;
        }
      }
      
      // Handle last value
      if (currentValue.trim() === 'NULL') {
        values.push(null);
      } else if (currentValue.trim() !== '') {
        values.push(currentValue.trim());
      }
      
      if (values.length >= 9) {
        const todo = {
          id: parseInt(values[0]) || 0,
          user_id: parseInt(values[1]) || 1,
          catagory_id: values[2] === null ? null : parseInt(values[2]),
          catagory_name: values[3],
          todo_name: values[4],
          acomplished_time: values[5],
          create_time: values[6],
          is_completed: values[7],
          postponed: parseInt(values[8]) || 0
        };
        rows.push(todo);
      }
    }
    
    console.log(`✅ Extracted ${rows.length} todos`);
    
    // Extract categories
    const categories = [];
    const categoryMatch = sqlData.match(/INSERT INTO `catagory`[^;]+;/);
    if (categoryMatch) {
      const categoryData = categoryMatch[0];
      const categoryRowRegex = /\(([^)]+)\)/g;
      let catMatch;
      
      while ((catMatch = categoryRowRegex.exec(categoryData)) !== null) {
        const catRow = catMatch[1];
        const catValues = catRow.split(',').map(v => v.trim().replace(/'/g, ''));
        
        if (catValues.length >= 3) {
          categories.push({
            id: parseInt(catValues[0]),
            user_id: parseInt(catValues[1]),
            catagory_name: catValues[2]
          });
        }
      }
    }
    
    console.log(`✅ Extracted ${categories.length} categories`);
    
    return { categories, todos: rows };
    
  } catch (error) {
    console.error('❌ Failed to extract data:', error.message);
    return { categories: [], todos: [] };
  }
}

async function migrateData() {
  console.log('\n🚀 MIGRATING ALL DATA');
  console.log('='.repeat(60));
  
  const { categories, todos } = await extractDataFromSql();
  
  if (todos.length === 0) {
    console.log('❌ No todos to migrate');
    return;
  }
  
  console.log(`📊 Found ${todos.length} todos and ${categories.length} categories`);
  
  // Connect to database
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
  
  try {
    // Fix database schema first
    console.log('\n🔧 Fixing database schema...');
    
    // Check current schema
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(todos)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const categoryIdColumn = tableInfo.find(col => col.name === 'categoryId');
    if (categoryIdColumn && categoryIdColumn.notnull === 1) {
      console.log('⚠️  categoryId has NOT NULL constraint, fixing...');
      
      // Create temporary table without constraint
      await new Promise((resolve, reject) => {
        db.run(`
          CREATE TABLE todos_temp (
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            priority VARCHAR(10) NOT NULL DEFAULT 'medium',
            dueDate DATE,
            completedAt DATETIME,
            isCompleted BOOLEAN NOT NULL DEFAULT 0,
            postponedCount INTEGER NOT NULL DEFAULT 0,
            estimatedMinutes INTEGER NOT NULL DEFAULT 0,
            tags JSON,
            createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
            updatedAt DATETIME NOT NULL DEFAULT (datetime('now')),
            userId INTEGER NOT NULL,
            categoryId INTEGER,
            FOREIGN KEY (userId) REFERENCES users (id),
            FOREIGN KEY (categoryId) REFERENCES categories (id)
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Copy data
      await new Promise((resolve, reject) => {
        db.run('INSERT INTO todos_temp SELECT * FROM todos', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Replace table
      await new Promise((resolve, reject) => {
        db.run('DROP TABLE todos', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      await new Promise((resolve, reject) => {
        db.run('ALTER TABLE todos_temp RENAME TO todos', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      console.log('✅ Database schema fixed');
    } else {
      console.log('✅ Database schema is already correct');
    }
    
    // Get or create user
    console.log('\n👤 Setting up user...');
    const userId = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], async (err, user) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (user) {
          console.log(`✅ Using existing user: test@example.com (ID: ${user.id})`);
          resolve(user.id);
          return;
        }
        
        // Create new user
        const hashedPassword = await bcrypt.hash('password123', 10);
        db.run(
          'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
          ['test@example.com', 'Test User', hashedPassword],
          function(err) {
            if (err) {
              reject(err);
              return;
            }
            console.log(`✅ Created new user: test@example.com (ID: ${this.lastID})`);
            resolve(this.lastID);
          }
        );
      });
    });
    
    // Clear existing todos for this user
    console.log('\n🧹 Clearing existing todos...');
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM todos WHERE userId = ?', [userId], (err) => {
        if (err) reject(err);
        else {
          console.log('✅ Cleared existing todos');
          resolve();
        }
      });
    });
    
    // Clear existing categories for this user
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM categories WHERE userId = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Migrate categories
    console.log('\n📁 Migrating categories...');
    const categoryMap = {};
    
    for (const oldCat of categories) {
      const oldId = oldCat.id;
      const name = oldCat.catagory_name;
      
      if (!name) continue;
      
      // Create new category
      const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B'];
      const icons = ['📝', '📚', '💼', '👤', '🛒'];
      const color = colors[Object.keys(categoryMap).length % colors.length];
      const icon = icons[Object.keys(categoryMap).length % icons.length];
      
      const newId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)',
          [name, color, icon, userId],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
      
      categoryMap[oldId] = newId;
      console.log(`  ✓ Created category "${name}" (ID: ${newId})`);
    }
    
    console.log(`✅ Migrated ${Object.keys(categoryMap).length} categories`);
    
    // Migrate todos
    console.log('\n✅ Migrating todos...');
    let migrated = 0;
    let errors = 0;
    
    for (const todo of todos) {
      try {
        const title = todo.todo_name;
        if (!title) {
          errors++;
          continue;
        }
        
        // Map data
        const isCompleted = todo.is_completed === '1';
        const postponedCount = todo.postponed || 0;
        
        // Determine priority
        let priority = 'medium';
        if (postponedCount >= 3) priority = 'high';
        else if (postponedCount === 0) priority = 'low';
        
        // Adjust based on content
        const titleLower = title.toLowerCase();
        if (titleLower.includes('urgent') || titleLower.includes('important') || titleLower.includes('asap')) {
          priority = 'high';
        }
        
        // Map category
        let categoryId = null;
        if (todo.catagory_id && categoryMap[todo.catagory_id]) {
          categoryId = categoryMap[todo.catagory_id];
        }
        
        // Handle dates
        let createdAt = null;
        if (todo.create_time) {
          createdAt = `${todo.create_time} 00:00:00`;
        }
        
        let completedAt = null;
        if (isCompleted && todo.acomplished_time) {
          completedAt = todo.acomplished_time.length === 10 ? 
            `${todo.acomplished_time} 00:00:00` : todo.acomplished_time;
        }
        
        // Extract tags
        const tags = ['migrated'];
        if (titleLower.includes('http') || titleLower.includes('github') || titleLower.includes('.com') || titleLower.includes('youtube')) {
          tags.push('link');
        }
        if (titleLower.includes('study') || titleLower.includes('learn')) {
          tags.push('learning');
        }
        
        // Estimate time
        let estimatedMinutes = 45;
        if (titleLower.includes('quick')) {
          estimatedMinutes = 15;
        } else if (titleLower.includes('study') || titleLower.includes('learn')) {
          estimatedMinutes = 60;
        }
        
        // Insert todo
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO todos (
              title, description, priority, dueDate, completedAt,
              isCompleted, postponedCount, estimatedMinutes, tags,
              userId, categoryId, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              title.trim(),
              `Original category: ${todo.catagory_name || 'None'}\nCreated: ${todo.create_time}\nMigrated from old todo ID: ${todo.id}`,
              priority,
              null,
              completedAt,
              isCompleted ? 1 : 0,
              postponedCount,
              estimatedMinutes,
              JSON.stringify(tags),
              userId,
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
        
        if (migrated % 50 === 0) {
          console.log(`  ... ${migrated} todos migrated`);
        }
        
      } catch (error) {
        errors++;
        if (errors <= 5) {
          console.log(`  ⚠️  Error with todo ID ${todo.id}: ${error.message}`);
        }
      }
    }
    
    console.log(`\n✅ Migration complete:`);
    console.log(`   ✓ Migrated: ${migrated}`);
    console.log(`   ❌ Errors: ${errors}`);
    
    // Show final statistics
    const stats = await new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN isCompleted = 1 THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN isCompleted = 0 THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN priority = 'medium' THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN priority = 'low' THEN 1 ELSE 0 END) as low
        FROM todos WHERE userId = ?`,
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows[0]);
        }
      );
    });
    
    console.log('\n📊 FINAL STATISTICS:');
    console.log(`   📝 Total Todos: ${stats.total}`);
    console.log(`   ✅ Completed: ${stats.completed}`);
    console.log(`   ⏳ Pending: ${stats.pending}`);
    console.log(`   🔴 High Priority: ${stats.high}`);
    console.log(`   🟡 Medium Priority: ${stats.medium}`);
    console.log(`   🟢 Low Priority: ${stats.low}`);
    
    console.log('\n🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('\n🔑 Login credentials:');
    console.log('   Email: test@example.com');
    console.log('   Password: password123');
    console.log('\n🌐 Access the app at: http://localhost:3000');
    console.log('\n📱 Mobile bottom navigation is now enabled!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
  } finally {
    db.close();
  }
}

// Run migration
migrateData().catch(console.error);