const fs = require('fs');
const path = require('path');
const { gunzipSync } = require('zlib');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

const SQL_DUMP_PATH = path.join(__dirname, 'todos.sql.gz');
const DB_PATH = path.join(__dirname, 'todos.db');

async function parseAllTodos() {
  console.log('🔍 Parsing SQL dump for all todos...');
  
  try {
    // Read and decompress the gzipped file
    const compressedData = fs.readFileSync(SQL_DUMP_PATH);
    const sqlData = gunzipSync(compressedData).toString('utf8');
    
    // Find the INSERT statement for todos
    const todoInsertMatch = sqlData.match(/INSERT INTO `todos`[^;]+;/s);
    if (!todoInsertMatch) {
      console.log('❌ No todos INSERT statement found');
      return [];
    }
    
    const todoInsert = todoInsertMatch[0];
    
    // Extract the VALUES part
    const valuesMatch = todoInsert.match(/VALUES\s*(.+);/s);
    if (!valuesMatch) {
      console.log('❌ No VALUES found in INSERT statement');
      return [];
    }
    
    const valuesText = valuesMatch[1];
    
    // Parse each row - handle the multiline format
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
        currentRow += char + nextChar;
        escapeNext = true;
        i++; // Skip next char since we added it
        continue;
      }
      
      if (char === "'") {
        inQuotes = !inQuotes;
      }
      
      if (!inQuotes && char === '(' && currentRow === '') {
        // Start of a new row
        continue;
      }
      
      if (!inQuotes && char === ')' && (nextChar === ',' || nextChar === undefined || nextChar === '\n' || nextChar === '\r')) {
        // End of a row
        rows.push(currentRow);
        currentRow = '';
        if (nextChar === ',') i++; // Skip the comma
        continue;
      }
      
      currentRow += char;
    }
    
    console.log(`📊 Found ${rows.length} todo rows in SQL dump`);
    
    // Parse each row
    const todos = [];
    for (const row of rows) {
      // Parse the row values
      const values = [];
      let currentValue = '';
      inQuotes = false;
      escapeNext = false;
      
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        const nextChar = row[i + 1];
        
        if (escapeNext) {
          currentValue += char;
          escapeNext = false;
          continue;
        }
        
        if (char === '\\' && nextChar) {
          currentValue += char + nextChar;
          escapeNext = true;
          i++;
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
        todos.push(todo);
      }
    }
    
    console.log(`✅ Successfully parsed ${todos.length} todos`);
    
    // Show sample
    console.log('\n📋 Sample todos:');
    for (let i = 0; i < Math.min(5, todos.length); i++) {
      console.log(`  ${i+1}. "${todos[i].todo_name?.substring(0, 50)}..." (Completed: ${todos[i].is_completed})`);
    }
    
    return todos;
    
  } catch (error) {
    console.error('❌ Failed to parse SQL dump:', error.message);
    return [];
  }
}

async function migrateAllTodos() {
  console.log('\n🚀 Migrating all todos...');
  
  const todos = await parseAllTodos();
  if (todos.length === 0) {
    console.log('❌ No todos to migrate');
    return;
  }
  
  // Connect to database
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);
  
  try {
    // Get user ID
    const userId = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err) reject(err);
        else if (user) resolve(user.id);
        else reject(new Error('User not found'));
      });
    });
    
    console.log(`👤 Using user ID: ${userId}`);
    
    // Get category map
    const categoryMap = {};
    const categories = await new Promise((resolve, reject) => {
      db.all('SELECT id, name FROM categories WHERE userId = ?', [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    // Map category names to IDs
    categories.forEach(cat => {
      // Try to find matching category
      const matchingTodo = todos.find(t => t.catagory_name === cat.name);
      if (matchingTodo) {
        categoryMap[matchingTodo.catagory_id] = cat.id;
      }
    });
    
    console.log(`📁 Category mapping:`, categoryMap);
    
    // Migrate todos
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const todo of todos) {
      try {
        // Check if todo already exists
        const existing = await new Promise((resolve, reject) => {
          db.get(
            'SELECT id FROM todos WHERE title = ? AND userId = ?',
            [todo.todo_name, userId],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        });
        
        if (existing) {
          skipped++;
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
        const titleLower = todo.todo_name.toLowerCase();
        if (titleLower.includes('urgent') || titleLower.includes('important')) {
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
        if (titleLower.includes('http') || titleLower.includes('github') || titleLower.includes('.com')) {
          tags.push('link');
        }
        if (titleLower.includes('study') || titleLower.includes('learn')) {
          tags.push('learning');
        }
        
        // Estimate time
        let estimatedMinutes = 45;
        if (titleLower.includes('review') || titleLower.includes('quick')) {
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
              todo.todo_name,
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
        
        if (migrated % 10 === 0) {
          console.log(`  ... ${migrated} todos migrated`);
        }
        
      } catch (error) {
        errors++;
        console.log(`  ⚠️  Error migrating todo "${todo.todo_name?.substring(0, 30)}...": ${error.message}`);
      }
    }
    
    console.log(`\n✅ Migration complete:`);
    console.log(`   ✓ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped: ${skipped} (already exist)`);
    console.log(`   ❌ Errors: ${errors}`);
    
    // Show final count
    const finalCount = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM todos WHERE userId = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    console.log(`\n📊 Total todos in database: ${finalCount}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    db.close();
  }
}

// Run the fix
migrateAllTodos().catch(console.error);