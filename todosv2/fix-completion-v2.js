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
        // Simple parsing: split by commas but handle quoted strings
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
          const oldId = parseInt(parts[0]) || 0;
          const isCompleted = parts[7] === '1';
          completionMap.set(oldId, isCompleted);
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
      db.all('SELECT id, description FROM todos WHERE userId = 1', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`📝 Found ${todos.length} todos in database`);
    
    // Try to match by old ID in description
    let updated = 0;
    
    for (const todo of todos) {
      // Extract old ID from description
      if (todo.description) {
        const match = todo.description.match(/old ID:\s*([0-9]+)/i);
        if (match) {
          const oldId = parseInt(match[1]);
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
  console.log('🔄 FIXING COMPLETION STATUS V2');
  console.log('='.repeat(50));
  
  const completionMap = await parseCompletionStatus();
  await updateDatabase(completionMap);
  
  console.log('\n🎉 Completion status fixed!');
}

main().catch(console.error);