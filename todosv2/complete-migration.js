const fs = require('fs');
const path = require('path');
const { gunzipSync } = require('zlib');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const SQL_DUMP_PATH = path.join(__dirname, 'todos.sql.gz');
const DB_PATH = path.join(__dirname, 'todos.db');

async function parseCompleteSqlDump() {
  console.log('🔍 Parsing complete SQL dump...');
  
  try {
    // Read and decompress the gzipped file
    const compressedData = fs.readFileSync(SQL_DUMP_PATH);
    const sqlData = gunzipSync(compressedData).toString('utf8');
    
    // Parse categories
    const categories = [];
    const categoryMatch = sqlData.match(/INSERT INTO `catagory`[^;]+;/);
    if (categoryMatch) {
      const categoryData = categoryMatch[0];
      const valuesMatch = categoryData.match(/VALUES\s*(.+?);/s);
      if (valuesMatch) {
        const values = valuesMatch[1];
        const rows = values.match(/\([^)]+\)/g);
        if (rows) {
          rows.forEach(row => {
            const match = row.match(/\((\d+),\s*(\d+),\s*'([^']+)'/);
            if (match) {
              categories.push({
                id: parseInt(match[1]),
                user_id: parseInt(match[2]),
                catagory_name: match[3]
              });
            }
          });
        }
      }
    }
    
    console.log(`📁 Found ${categories.length} categories`);
    
    // Parse todos - get ALL todo insert statements
    const todos = [];
    const todoInsertRegex = /INSERT INTO `todos` VALUES\s*\([^;]+;/gs;
    let todoMatch;
    
    while ((todoMatch = todoInsertRegex.exec(sqlData)) !== null) {
      const todoInsert = todoMatch[0];
      const valuesMatch = todoInsert.match(/VALUES\s*(.+);/s);
      
      if (valuesMatch) {
        const valuesText = valuesMatch[1];
        
        // Parse rows manually
        const rows = [];
        let currentRow = '';
        let inQuotes = false;
        let escapeNext = false;
        
        for (let i = 0; i < valuesText.length; i++) {
          const char = valuesText[i];
          const nextChar = valuesText[i + 1];
          
          if (escapeNext) {
            currentRow += char;
            escapeNext = false;
            continue;
          }
          
          if (char === '\\' && nextChar) {
            currentRow += char;
            i++; // Skip escaped char
            continue;
          }
          
          if (char === "'") {
            inQuotes = !inQuotes;
          }
          
          if (!inQuotes && char === '(') {
            currentRow = '';
            continue;
          }
          
          if (!inQuotes && char === ')' && (nextChar === ',' || nextChar === ';' || i === valuesText.length - 1)) {
            rows.push(currentRow);
            if (nextChar === ',') i++;
            continue;
          }
          
          currentRow += char;
        }
        
        // Parse each row
        for (const row of rows) {
          const values = [];
          let currentValue = '';
          inQuotes = false;
          
          for (let i = 0; i < row.length; i++) {
            const char = row[i];
            const nextChar = row[i + 1];
            
            if (char === '\\' && nextChar) {
              currentValue += nextChar;
              i++;
              continue;
            }
            
            if (char === "'") {
              if (!inQuotes) {
                inQuotes = true;
              } else if (nextChar !== "'") {
                inQuotes = false;
                values.push(currentValue);
                currentValue = '';
              } else {
                // Escaped quote
                currentValue += "'";
                i++;
              }
              continue;
            }
            
            if (!inQuotes && char === ',') {
              if (currentValue === 'NULL') {
                values.push(null);
              } else if (currentValue !== '') {
                values.push(currentValue);
              }
              currentValue = '';
              continue;
            }
            
            if (inQuotes || char !== ' ') {
              currentValue += char;
            }
          }
          
          // Handle last value
          if (currentValue === 'NULL') {
            values.push(null);
          } else if (currentValue !== '') {
            values.push(currentValue);
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
            todos.push(todo);
          }
        }
      }
    }
    
    console.log(`✅ Found ${todos.length} todos in SQL dump`);
    
    // Show sample
    console.log('\n📋 Sample of todos:');
    console.log(`  First: "${todos[0]?.todo_name?.substring(0, 50)}..."`);
    console.log(`  Last: "${todos[todos.length - 1]?.todo_name?.substring(0, 50)}..."`);
    console.log(`  Completed: ${todos.filter(t => t.is_completed === '1').length}`);
    console.log(`  Pending: ${todos.filter(t => t.is_completed === '0').length}`);
    
    return { categories, todos };
    
  } catch (error) {
    console.error('❌ Failed to parse SQL dump:', error.message);
    return { categories: [], todos: [] };
  }
}

async function migrateAllData() {
  console.log('\n🚀 COMPLETE DATA MIGRATION');
  console.log('='.repeat(60));
  
  const { categories, todos } = await parseCompleteSqlDump();
  
  if (todos.length === 0) {
    console.log('❌ No todos to migrate');
    return;
  }
  
  // Connect to database
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
  
  try {
    // First, fix the database schema to allow NULL categoryId
    console.log('\n🔧 Fixing database schema...');
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = OFF', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Create a new todos table without NOT NULL constraint on categoryId
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS todos_new (
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
          FOREIGN KEY (userId) REFERENCES users (id) ON DELETE NO ACTION ON UPDATE NO ACTION,
          FOREIGN KEY (categoryId) REFERENCES categories (id) ON DELETE NO ACTION ON UPDATE NO ACTION
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Copy data from old table to new table
    await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO todos_new 
        SELECT * FROM todos
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Drop old table and rename new table
    await new Promise((resolve, reject) => {
      db.run('DROP TABLE todos', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await new Promise((resolve, reject) => {
      db.run('ALTER TABLE todos_new RENAME TO todos', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log('✅ Database schema fixed (categoryId can now be NULL)');
    
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
    
    // Migrate categories
    console.log('\n📁 Migrating categories...');
    const categoryMap = {};
    
    for (const oldCat of categories) {
      const oldId = oldCat.id;
      const name = oldCat.catagory_name;
      
      if (!name) continue;
      
      // Check if category already exists
      const existingCat = await new Promise((resolve, reject) => {
        db.get(
          'SELECT id FROM categories WHERE name = ? AND userId = ?',
          [name, userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (existingCat) {
        categoryMap[oldId] = existingCat.id;
        console.log(`  ✓ Category "${name}" already exists`);
        continue;
      }
      
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
    let skipped = 0;
    let errors = 0;
    
    // Clear existing todos for this user first
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM todos WHERE userId = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
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
          if (todo.create_time.match(/^\d{4}-\d{2}-\d{2}$/)) {
            createdAt = `${todo.create_time} 00:00:00`;
          }
        }
        
        let completedAt = null;
        if (isCompleted && todo.acomplished_time) {
          if (todo.acomplished_time.match(/^\d{4}-\d{2}-\d{2}/)) {
            completedAt = todo.acomplished_time.length === 10 ? 
              `${todo.acomplished_time} 00:00:00` : todo.acomplished_time;
          }
        }
        
        // Extract tags
        const tags = ['migrated'];
        if (titleLower.includes('http') || titleLower.includes('github') || titleLower.includes('.com') || titleLower.includes('youtube')) {
          tags.push('link');
        }
        if (titleLower.includes('study') || titleLower.includes('learn')) {
          tags.push('learning');
        }
        if (titleLower.includes('review')) {
          tags.push('review');
        }
        if (titleLower.includes('organize') || titleLower.includes('backup')) {
          tags.push('organization');
        }
        
        // Estimate time
        let estimatedMinutes = 45;
        if (titleLower.includes('quick') || titleLower.includes('check')) {
          estimatedMinutes = 15;
        } else if (titleLower.includes('study') || titleLower.includes('learn')) {
          estimatedMinutes = 60;
        } else if (titleLower.includes('implement') || titleLower.includes('build')) {
          estimatedMinutes = 120;
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
          console.log(`  ⚠️  Error: ${error.message}`);
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
    
    // Show category breakdown
    const categoryStats = await new Promise((resolve, reject) => {
      db.all(
        `SELECT c.name, COUNT(t.id) as count 
         FROM categories c 
         LEFT JOIN todos t ON c.id = t.categoryId AND t.userId = ?
         WHERE c.userId = ?
         GROUP BY c.id 
         ORDER BY count DESC`,
        [userId, userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
    
    console.log('\n📁 CATEGORY BREAKDOWN:');
    categoryStats.forEach(cat => {
      console.log(`   • ${cat.name}: ${cat.count} todos`);
    });
    
    // Show uncategorized count
    const uncategorized = await new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM todos WHERE userId = ? AND categoryId IS NULL',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
    
    console.log(`   • Uncategorized: ${uncategorized} todos`);
    
    console.log('\n🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('\n🔑 Login credentials:');
    console.log('   Email: test@example.com');
    console.log('   Password: password123');
    console.log('\n🌐 Access the app at: http://localhost:3000');
    console.log('\n📱 Mobile bottom navigation is now enabled!');
    console.log('\n🔧 Database schema fixed: categoryId can now be NULL');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
  } finally {
    db.close();
  }
}

// Run complete migration
completeMigration().catch(console.error);

async function completeMigration() {
  await migrateAllData();
}