#!/usr/bin/env node

const fs = require('fs');
const readline = require('readline');
const sqlite3 = require('sqlite3').verbose();

async function parseCompletionStatus() {
  console.log('📥 Parsing SQL dump for completion status...');
  
  const fileStream = fs.createReadStream('todos.sql');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  const completionMap = new Map(); // old_id -> is_completed
  let lineCount = 0;
  
  for await (const line of rl) {
    lineCount++;
    
    if (line.includes('INSERT INTO `todos`')) {
      continue;
    }
    
    if (line.match(/^\s*\([0-9]/)) {
      try {
        // Extract ID and completion status
        const match = line.match(/\(([0-9]+),/);
        if (match) {
          const oldId = parseInt(match[1]);
          
          // Find is_completed field (8th field, index 7)
          // Simple parsing: count single quotes
          let quoteCount = 0;
          let fieldIndex = 0;
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            if (line[i] === "'" && (i === 0 || line[i-1] !== "'")) {
              if (!inQuotes) {
                inQuotes = true;
              } else {
                inQuotes = false;
                quoteCount++;
              }
            } else if (!inQuotes && line[i] === ',') {
              fieldIndex++;
            }
            
            // When we reach the 8th field (is_completed)
            if (fieldIndex === 7 && !inQuotes && line[i] !== ',' && line[i] !== "'") {
              const nextComma = line.indexOf(',', i);
              const value = line.substring(i, nextComma > i ? nextComma : line.length).trim();
              completionMap.set(oldId, value === '1');
              break;
            }
          }
        }
      } catch (error) {
        // Skip errors
      }
    }
    
    if (lineCount % 100 === 0) {
      process.stdout.write(`\r📊 Processed ${lineCount} lines, found ${completionMap.size} todos`);
    }
  }
  
  console.log(`\n✅ Parsed completion status for ${completionMap.size} todos`);
  
  // Count completed
  const completed = Array.from(completionMap.values()).filter(v => v).length;
  console.log(`📊 Original completed count: ${completed}`);
  
  return completionMap;
}

async function updateDatabase(completionMap) {
  console.log('\n🔄 Updating database completion status...');
  
  const db = new sqlite3.Database('todos.db');
  
  try {
    // Get all todos for user 1
    const todos = await new Promise((resolve, reject) => {
      db.all('SELECT id, title FROM todos WHERE userId = 1', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`📝 Found ${todos.length} todos in database`);
    
    // Try to match by title/ID mapping
    let updated = 0;
    
    for (const todo of todos) {
      // Extract old ID from description if possible
      const descMatch = todo.title.match(/ID:\s*([0-9]+)/);
      if (descMatch) {
        const oldId = parseInt(descMatch[1]);
        if (completionMap.has(oldId)) {
          const isCompleted = completionMap.get(oldId) ? 1 : 0;
          
          await new Promise((resolve, reject) => {
            db.run('UPDATE todos SET isCompleted = ? WHERE id = ?', [isCompleted, todo.id], (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          
          updated++;
        }
      }
    }
    
    console.log(`✅ Updated completion status for ${updated} todos`);
    
    // Show stats
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as total,
          SUM(isCompleted) as completed
        FROM todos WHERE userId = 1
      `, [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    console.log('\n📊 UPDATED DATABASE STATS:');
    console.log(`   📝 Total Todos: ${stats.total}`);
    console.log(`   ✅ Completed: ${stats.completed || 0}`);
    console.log(`   ⏳ Pending: ${stats.total - (stats.completed || 0)}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    db.close();
  }
}

async function main() {
  console.log('🔄 FIXING COMPLETION STATUS');
  console.log('='.repeat(50));
  
  const completionMap = await parseCompletionStatus();
  await updateDatabase(completionMap);
  
  console.log('\n🎉 Completion status fixed!');
}

main().catch(console.error);