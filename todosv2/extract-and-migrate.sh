#!/bin/bash

echo "🚀 EXTRACTING ALL DATA FROM SQL DUMP"
echo "=========================================="

# Extract the SQL dump
gunzip -c todos.sql.gz > todos.sql

echo "📊 Counting todos in SQL file..."
COUNT=$(grep -c "^\s*([0-9]" todos.sql)
echo "✅ Found approximately $COUNT todo rows"

echo "📋 Sample of todo IDs:"
grep -o "^\s*([0-9][0-9]*" todos.sql | head -10 | sed 's/(//'

echo ""
echo "🔍 First few todos:"
grep "^\s*([0-9]" todos.sql | head -5 | while read line; do
  # Extract todo name (between 5th and 6th single quotes)
  name=$(echo "$line" | cut -d\' -f5)
  id=$(echo "$line" | grep -o "([0-9]*" | tr -d '(')
  echo "  ID $id: ${name:0:50}..."
done

echo ""
echo "🔍 Last few todos:"
grep "^\s*([0-9]" todos.sql | tail -5 | while read line; do
  name=$(echo "$line" | cut -d\' -f5)
  id=$(echo "$line" | grep -o "([0-9]*" | tr -d '(')
  echo "  ID $id: ${name:0:50}..."
done

echo ""
echo "📁 Categories found:"
grep -A5 "INSERT INTO \`catagory\`" todos.sql | grep "^\s*([0-9]" | while read line; do
  name=$(echo "$line" | cut -d\' -f3)
  id=$(echo "$line" | grep -o "([0-9]*" | tr -d '(')
  echo "  ID $id: $name"
done

echo ""
echo "🎯 Creating direct migration script..."

# Create a Node.js script to parse ALL data
cat > direct-migration.js << 'EOF'
const fs = require('fs');
const readline = require('readline');
const sqlite3 = require('sqlite3').verbose();

async function parseAllData() {
  console.log('📥 Reading SQL file line by line...');
  
  const fileStream = fs.createReadStream('todos.sql');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  const categories = [];
  const todos = [];
  let inTodosInsert = false;
  let lineCount = 0;
  
  for await (const line of rl) {
    lineCount++;
    
    // Parse categories
    if (line.includes('INSERT INTO `catagory`')) {
      console.log('📁 Found categories INSERT statement');
      continue;
    }
    
    if (line.match(/^\s*\([0-9]+,\s*[0-9]+,\s*'[^']+'\)/)) {
      // This is a category row
      const match = line.match(/\(([0-9]+),\s*([0-9]+),\s*'([^']+)'/);
      if (match) {
        categories.push({
          id: parseInt(match[1]),
          user_id: parseInt(match[2]),
          catagory_name: match[3]
        });
      }
    }
    
    // Parse todos
    if (line.includes('INSERT INTO `todos`')) {
      inTodosInsert = true;
      console.log('✅ Found todos INSERT statement');
      continue;
    }
    
    if (inTodosInsert && line.match(/^\s*\([0-9]/)) {
      // This is a todo row
      try {
        // Simple parsing - split by commas, handle quotes
        const cleaned = line.trim().replace(/^\(|\),?$/g, '');
        const parts = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < cleaned.length; i++) {
          const char = cleaned[i];
          const nextChar = cleaned[i + 1];
          
          if (char === "'") {
            if (!inQuotes) {
              inQuotes = true;
            } else if (nextChar === "'") {
              // Escaped quote
              current += "'";
              i++;
            } else {
              inQuotes = false;
              parts.push(current);
              current = '';
            }
            continue;
          }
          
          if (!inQuotes && char === ',') {
            if (current === 'NULL') {
              parts.push(null);
            } else if (current !== '') {
              parts.push(current);
            }
            current = '';
            continue;
          }
          
          current += char;
        }
        
        // Last part
        if (current === 'NULL') {
          parts.push(null);
        } else if (current !== '') {
          parts.push(current);
        }
        
        if (parts.length >= 9) {
          const todo = {
            id: parseInt(parts[0]) || 0,
            user_id: parseInt(parts[1]) || 1,
            catagory_id: parts[2] === null ? null : parseInt(parts[2]),
            catagory_name: parts[3],
            todo_name: parts[4],
            acomplished_time: parts[5],
            create_time: parts[6],
            is_completed: parts[7],
            postponed: parseInt(parts[8]) || 0
          };
          todos.push(todo);
        }
      } catch (error) {
        console.log(`⚠️  Error parsing line ${lineCount}: ${error.message}`);
      }
    }
    
    // Show progress
    if (lineCount % 100 === 0) {
      process.stdout.write(`\r📊 Processed ${lineCount} lines, found ${todos.length} todos`);
    }
  }
  
  console.log(`\n✅ Finished parsing: ${categories.length} categories, ${todos.length} todos`);
  
  return { categories, todos };
}

async function migrateToDb(categories, todos) {
  console.log('\n🚀 Migrating to database...');
  
  const db = new sqlite3.Database('todos.db');
  
  try {
    // Get user
    const userId = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err) reject(err);
        else if (user) resolve(user.id);
        else reject(new Error('User not found'));
      });
    });
    
    console.log(`👤 Using user ID: ${userId}`);
    
    // Clear existing data
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM todos WHERE userId = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM categories WHERE userId = ?', [userId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Migrate categories
    console.log('📁 Migrating categories...');
    const categoryMap = {};
    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B'];
    const icons = ['📝', '📚', '💼', '👤', '🛒'];
    
    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      if (!cat.catagory_name || cat.catagory_name === '`catagory_name`') continue;
      
      const color = colors[i % colors.length];
      const icon = icons[i % icons.length];
      
      const newId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)',
          [cat.catagory_name, color, icon, userId],
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
      
      categoryMap[cat.id] = newId;
    }
    
    console.log(`✅ Migrated ${Object.keys(categoryMap).length} categories`);
    
    // Migrate todos
    console.log('✅ Migrating todos...');
    let migrated = 0;
    
    for (const todo of todos) {
      try {
        const title = todo.todo_name.trim();
        if (!title) continue;
        
        // Priority
        const postponed = todo.postponed;
        let priority = 'medium';
        if (postponed >= 3) priority = 'high';
        else if (postponed === 0) priority = 'low';
        
        // Category
        let categoryId = null;
        if (todo.catagory_id && categoryMap[todo.catagory_id]) {
          categoryId = categoryMap[todo.catagory_id];
        }
        
        // Dates
        let createdAt = null;
        if (todo.create_time) {
          createdAt = `${todo.create_time} 00:00:00`;
        }
        
        let completedAt = null;
        const isCompleted = todo.is_completed === '1';
        if (isCompleted && todo.acomplished_time) {
          if (todo.acomplished_time.length === 10) {
            completedAt = `${todo.acomplished_time} 00:00:00`;
          } else {
            completedAt = todo.acomplished_time;
          }
        }
        
        // Insert
        await new Promise((resolve, reject) => {
          db.run(`
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
            JSON.stringify(['migrated']),
            userId,
            categoryId,
            createdAt || new Date().toISOString().replace('T', ' ').substring(0, 19)
          ], function(err) {
            if (err) reject(err);
            else resolve();
          });
        });
        
        migrated++;
        
        if (migrated % 100 === 0) {
          process.stdout.write(`\r  ... ${migrated} todos migrated`);
        }
        
      } catch (error) {
        // Skip errors
      }
    }
    
    console.log(`\n✅ Successfully migrated ${migrated} todos`);
    
    // Show stats
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN isCompleted = 1 THEN 1 ELSE 0 END) as completed
        FROM todos WHERE userId = ?
      `, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log('\n📊 FINAL DATABASE STATS:');
    console.log(`   📝 Total Todos: ${stats.total}`);
    console.log(`   ✅ Completed: ${stats.completed || 0}`);
    console.log(`   ⏳ Pending: ${stats.total - (stats.completed || 0)}`);
    
    console.log('\n🎉 MIGRATION COMPLETE!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
  } finally {
    db.close();
  }
}

async function main() {
  console.log('🚀 DIRECT DATA MIGRATION');
  console.log('='.repeat(50));
  
  const { categories, todos } = await parseAllData();
  
  if (todos.length === 0) {
    console.log('❌ No todos found');
    return;
  }
  
  await migrateToDb(categories, todos);
}

main().catch(console.error);
EOF

echo "📝 Running direct migration..."
node direct-migration.js

echo ""
echo "🔍 Verifying migration..."
sqlite3 todos.db "SELECT COUNT(*) as total_todos FROM todos WHERE userId = 1;"

echo ""
echo "✅ DONE! Your todos should now be migrated."
echo "🌐 Access at: http://localhost:3000"
echo "🔑 Login: test@example.com / password123"