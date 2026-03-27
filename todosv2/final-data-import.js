#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function parseSQLValue(value) {
  if (value === null || value === 'NULL') return null;
  if (typeof value === 'string') {
    // Remove surrounding quotes and unescape
    let result = value.replace(/^'|'$/g, '');
    result = result.replace(/''/g, "'"); // Unescape single quotes
    result = result.replace(/\\\\/g, '\\'); // Unescape backslashes
    return result;
  }
  return value;
}

async function parseSQLDump() {
  console.log('📥 Parsing SQL dump with proper escaping...');
  
  const fileStream = fs.createReadStream('todos.sql');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  const categories = [];
  const todos = [];
  let currentTable = null;
  let buffer = '';
  
  for await (const line of rl) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('INSERT INTO `catagory`')) {
      currentTable = 'categories';
      buffer = trimmed;
    } else if (trimmed.startsWith('INSERT INTO `todos`')) {
      currentTable = 'todos';
      buffer = trimmed;
    } else if (currentTable && trimmed) {
      buffer += ' ' + trimmed;
      
      // Check if we have a complete statement
      if (trimmed.endsWith(';')) {
        await processBuffer(buffer, currentTable, categories, todos);
        currentTable = null;
        buffer = '';
      }
    }
  }
  
  // Process any remaining buffer
  if (buffer && currentTable) {
    await processBuffer(buffer, currentTable, categories, todos);
  }
  
  console.log(`✅ Parsed: ${categories.length} categories, ${todos.length} todos`);
  
  // Show stats
  const completed = todos.filter(t => t.is_completed === '1').length;
  console.log(`📊 Original data: ${completed} completed, ${todos.length - completed} pending`);
  
  return { categories, todos };
}

async function processBuffer(buffer, table, categories, todos) {
  try {
    // Extract VALUES part
    const valuesMatch = buffer.match(/VALUES\s*(.+);/s);
    if (!valuesMatch) return;
    
    const valuesText = valuesMatch[1];
    
    // Parse rows - split by ), but handle nested parentheses and quotes
    const rows = [];
    let current = '';
    let inQuotes = false;
    let parenDepth = 0;
    
    for (let i = 0; i < valuesText.length; i++) {
      const char = valuesText[i];
      const nextChar = valuesText[i + 1];
      
      if (char === "'") {
        if (!inQuotes) {
          inQuotes = true;
        } else if (nextChar === "'") {
          // Escaped quote
          current += "'";
          i++;
        } else {
          inQuotes = false;
        }
        current += char;
      } else if (char === '(' && !inQuotes) {
        parenDepth++;
        if (parenDepth === 1) {
          // Start of new row
          current = '(';
        } else {
          current += char;
        }
      } else if (char === ')' && !inQuotes) {
        parenDepth--;
        if (parenDepth === 0) {
          // End of row
          current += ')';
          rows.push(current);
          current = '';
        } else {
          current += char;
        }
      } else {
        current += char;
      }
    }
    
    // Parse each row
    for (const row of rows) {
      if (!row.trim()) continue;
      
      // Extract values between parentheses
      const valuesMatch = row.match(/^\((.*)\)$/);
      if (!valuesMatch) continue;
      
      const valuesText = valuesMatch[1];
      const values = [];
      let currentValue = '';
      let inQuotes = false;
      
      for (let i = 0; i < valuesText.length; i++) {
        const char = valuesText[i];
        const nextChar = valuesText[i + 1];
        
        if (char === "'") {
          if (!inQuotes) {
            inQuotes = true;
          } else if (nextChar === "'") {
            // Escaped quote
            currentValue += "'";
            i++;
          } else {
            inQuotes = false;
          }
          currentValue += char;
        } else if (char === ',' && !inQuotes) {
          values.push(parseSQLValue(currentValue.trim()));
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      
      // Last value
      if (currentValue.trim()) {
        values.push(parseSQLValue(currentValue.trim()));
      }
      
      if (table === 'categories' && values.length >= 3) {
        categories.push({
          id: parseInt(values[0]) || 0,
          user_id: parseInt(values[1]) || 1,
          catagory_name: values[2]
        });
      } else if (table === 'todos' && values.length >= 9) {
        todos.push({
          id: parseInt(values[0]) || 0,
          user_id: parseInt(values[1]) || 1,
          catagory_id: values[2] ? parseInt(values[2]) : null,
          catagory_name: values[3],
          todo_name: values[4],
          acomplished_time: values[5],
          create_time: values[6],
          is_completed: values[7],
          postponed: parseInt(values[8]) || 0
        });
      }
    }
    
  } catch (error) {
    console.log(`⚠️  Error parsing buffer: ${error.message}`);
  }
}

async function importData(categories, todos) {
  console.log('\n🚀 Importing data with proper handling...');
  
  const db = new sqlite3.Database('todos.db');
  
  try {
    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await dbRun(db, 'DELETE FROM todos');
    await dbRun(db, 'DELETE FROM categories');
    await dbRun(db, 'DELETE FROM users');
    
    // Create user
    console.log('👤 Creating user...');
    const userId = await dbRun(db, 
      'INSERT INTO users (email, username, password) VALUES (?, ?, ?)',
      ['test@example.com', 'Test User', hashPassword('password123')]
    );
    
    console.log(`✅ User created with ID: ${userId}`);
    
    // Import categories
    console.log('📁 Importing categories...');
    const categoryMap = new Map();
    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B'];
    const icons = ['📝', '📚', '💼', '👤', '🛒'];
    
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      if (!cat.catagory_name || cat.catagory_name === '`catagory_name`') continue;
      
      const color = colors[i % colors.length];
      const icon = icons[i % icons.length];
      
      const newId = await dbRun(db,
        'INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)',
        [cat.catagory_name, color, icon, userId]
      );
      
      categoryMap.set(cat.id, newId);
      console.log(`  ✓ ${cat.catagory_name}`);
    }
    
    console.log(`✅ Imported ${categoryMap.size} categories`);
    
    // Import todos
    console.log('✅ Importing todos...');
    let imported = 0;
    let errors = 0;
    
    for (const todo of todos) {
      try {
        const title = todo.todo_name ? todo.todo_name.trim() : '';
        if (!title) {
          errors++;
          continue;
        }
        
        // Priority
        const postponed = todo.postponed || 0;
        let priority = 'medium';
        if (postponed >= 3) priority = 'high';
        else if (postponed === 0) priority = 'low';
        
        // Category
        let categoryId = null;
        if (todo.catagory_id && categoryMap.has(todo.catagory_id)) {
          categoryId = categoryMap.get(todo.catagory_id);
        }
        
        // Dates
        let createdAt = null;
        if (todo.create_time) {
          createdAt = `${todo.create_time} 00:00:00`;
        }
        
        let completedAt = null;
        const isCompleted = todo.is_completed === '1';
        if (isCompleted && todo.acomplished_time) {
          if (String(todo.acomplished_time).length === 10) {
            completedAt = `${todo.acomplished_time} 00:00:00`;
          } else {
            completedAt = todo.acomplished_time;
          }
        }
        
        // Tags
        const tags = ['migrated'];
        const titleLower = title.toLowerCase();
        if (titleLower.includes('http') || titleLower.includes('github') || 
            titleLower.includes('.com') || titleLower.includes('youtube')) {
          tags.push('link');
        }
        
        // Insert
        await dbRun(db, `
          INSERT INTO todos (
            title, description, priority, dueDate, completedAt,
            isCompleted, postponedCount, estimatedMinutes, tags,
            userId, categoryId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          title.substring(0, 255),
          `Migrated from old ID: ${todo.id}`,
          priority,
          null,
          completedAt,
          isCompleted ? 1 : 0,
          postponed,
          30,
          JSON.stringify(tags),
          userId,
          categoryId,
          createdAt || new Date().toISOString().replace('T', ' ').substring(0, 19)
        ]);
        
        imported++;
        
        if (imported % 100 === 0) {
          process.stdout.write(`\r  ... ${imported} todos imported`);
        }
        
      } catch (error) {
        errors++;
        if (errors <= 5) {
          console.log(`\n⚠️  Error with todo ID ${todo.id}: ${error.message}`);
        }
      }
    }
    
    console.log(`\n✅ Successfully imported ${imported} todos (${errors} errors)`);
    
    // Show final stats
    const stats = await dbGet(db, `
      SELECT 
        COUNT(*) as total,
        SUM(isCompleted) as completed,
        SUM(CASE WHEN isCompleted = 0 THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high,
        SUM(CASE WHEN priority = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN priority = 'low' THEN 1 ELSE 0 END) as low
      FROM todos WHERE userId = ?
    `, [userId]);
    
    console.log('\n📊 FINAL DATABASE STATS:');
    console.log(`   📝 Total Todos: ${stats.total}`);
    console.log(`   ✅ Completed: ${stats.completed || 0}`);
    console.log(`   ⏳ Pending: ${stats.pending || 0}`);
    console.log(`   🔴 High Priority: ${stats.high || 0}`);
    console.log(`   🟡 Medium Priority: ${stats.medium || 0}`);
    console.log(`   🟢 Low Priority: ${stats.low || 0}`);
    
    // Show sample completed todos
    const completedTodos = await dbAll(db, 
      'SELECT id, title FROM todos WHERE userId = ? AND isCompleted = 1 LIMIT 5',
      [userId]
    );
    
    if (completedTodos.length > 0) {
      console.log('\n✅ Sample completed todos:');
      completedTodos.forEach(todo => {
        console.log(`   ${todo.id}. ${todo.title.substring(0, 50)}...`);
      });
    }
    
    console.log('\n🎉 DATA IMPORT COMPLETE!');
    
  } catch (error) {
    console.error('\n❌ Import failed:', error.message);
    throw error;
  } finally {
    db.close();
  }
}

// Database helper functions
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function main() {
  console.log('🚀 FINAL DATA IMPORT WITH PROPER ESCAPING');
  console.log('='.repeat(60));
  
  // Extract SQL file
  console.log('📦 Extracting SQL file...');
  const { execSync } = require('child_process');
  try {
    execSync('gunzip -c todos.sql.gz > todos.sql 2>/dev/null || true');
  } catch (error) {
    // Ignore errors
  }
  
  // Parse and import
  const { categories, todos } = await parseSQLDump();
  
  if (todos.length === 0) {
    console.log('❌ No todos found to import');
    return;
  }
  
  await importData(categories, todos);
  
  console.log('\n🔑 Login: test@example.com / password123');
  console.log('🌐 Access: http://localhost:3000');
}

main().catch(console.error);