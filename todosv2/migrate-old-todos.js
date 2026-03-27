const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// Configuration
const OLD_DB_CONFIG = {
  host: '43.140.218.248',
  port: 3306,
  user: 'root',
  password: 'lidaning',
  database: 'todos',
  connectTimeout: 10000
};

const NEW_DB_PATH = path.join(__dirname, 'todos.db');

async function connectOldDb() {
  try {
    const connection = await mysql.createConnection(OLD_DB_CONFIG);
    console.log("✅ Connected to old MySQL database");
    return connection;
  } catch (error) {
    console.error("❌ Failed to connect to old database:", error.message);
    return null;
  }
}

function connectNewDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(NEW_DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error("❌ Failed to connect to new database:", err.message);
        reject(err);
      } else {
        console.log("✅ Connected to new SQLite database");
        resolve(db);
      }
    });
  });
}

async function getOrCreateUser(db) {
  return new Promise((resolve, reject) => {
    // Check if test user exists
    db.get("SELECT id FROM users WHERE email = 'test@example.com'", async (err, user) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (user) {
        console.log(`✅ Using existing user with ID: ${user.id}`);
        resolve(user.id);
        return;
      }
      
      // Create test user
      const hashedPassword = await bcrypt.hash('password123', 10);
      db.run(
        "INSERT INTO users (email, username, password) VALUES (?, ?, ?)",
        ['test@example.com', 'Test User', hashedPassword],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          const userId = this.lastID;
          console.log(`✅ Created new user with ID: ${userId}`);
          resolve(userId);
        }
      );
    });
  });
}

async function migrateCategories(oldConn, newDb, userId) {
  console.log("\n📁 Migrating categories...");
  
  try {
    const [oldCategories] = await oldConn.execute("SELECT id, catagory_name FROM catagory");
    
    const categoryMap = {};
    let createdCount = 0;
    let existingCount = 0;
    
    for (const oldCat of oldCategories) {
      const oldId = oldCat.id;
      const name = oldCat.catagory_name;
      
      // Check if category already exists
      const existing = await new Promise((resolve, reject) => {
        newDb.get(
          "SELECT id FROM categories WHERE name = ? AND userId = ?",
          [name, userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (existing) {
        categoryMap[oldId] = existing.id;
        existingCount++;
        console.log(`  ✓ Category '${name}' already exists (ID: ${existing.id})`);
      } else {
        // Create new category with default color and icon
        const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B'];
        const icons = ['💼', '👤', '🛒', '❤️', '📚'];
        
        const color = colors[createdCount % colors.length];
        const icon = icons[createdCount % icons.length];
        
        const newId = await new Promise((resolve, reject) => {
          newDb.run(
            "INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)",
            [name, color, icon, userId],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });
        
        categoryMap[oldId] = newId;
        createdCount++;
        console.log(`  ✓ Created category '${name}' (ID: ${newId})`);
      }
    }
    
    console.log(`✅ Migrated ${oldCategories.length} categories (${createdCount} created, ${existingCount} existing)`);
    return categoryMap;
  } catch (error) {
    console.error("❌ Failed to migrate categories:", error.message);
    return {};
  }
}

async function migrateTodos(oldConn, newDb, userId, categoryMap) {
  console.log("\n✅ Migrating todos...");
  
  try {
    const [oldTodos] = await oldConn.execute(`
      SELECT id, user_id, catagory_id, catagory_name, todo_name, 
             acomplished_time, create_time, is_completed, postponed
      FROM todos
      ORDER BY id
    `);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const oldTodo of oldTodos) {
      const oldId = oldTodo.id;
      const todoName = oldTodo.todo_name;
      const isCompleted = oldTodo.is_completed === '1';
      const postponedCount = oldTodo.postponed || 0;
      const oldCategoryId = oldTodo.catagory_id;
      
      // Check if todo already exists
      const existing = await new Promise((resolve, reject) => {
        newDb.get(
          "SELECT id FROM todos WHERE title = ? AND userId = ?",
          [todoName, userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (existing) {
        skippedCount++;
        console.log(`  ⏭️  Todo '${todoName.substring(0, 30)}...' already exists, skipping`);
        continue;
      }
      
      // Map priority based on postponed count
      let priority = 'low';
      if (postponedCount >= 3) {
        priority = 'high';
      } else if (postponedCount >= 1) {
        priority = 'medium';
      }
      
      // Map category
      let newCategoryId = null;
      if (oldCategoryId && categoryMap[oldCategoryId]) {
        newCategoryId = categoryMap[oldCategoryId];
      }
      
      // Convert dates
      const createdAt = oldTodo.create_time 
        ? new Date(oldTodo.create_time).toISOString().replace('T', ' ').substring(0, 19)
        : new Date().toISOString().replace('T', ' ').substring(0, 19);
      
      let completedAt = null;
      if (isCompleted && oldTodo.acomplished_time) {
        completedAt = new Date(oldTodo.acomplished_time).toISOString().replace('T', ' ').substring(0, 19);
      }
      
      // Insert into new database
      await new Promise((resolve, reject) => {
        newDb.run(`
          INSERT INTO todos (
            title, description, priority, dueDate, completedAt, 
            isCompleted, postponedCount, estimatedMinutes, tags, 
            userId, categoryId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          todoName,
          `Migrated from old todo ID: ${oldId}`,
          priority,
          null, // dueDate
          completedAt,
          isCompleted ? 1 : 0,
          postponedCount,
          30, // Default estimated minutes
          JSON.stringify(['migrated']),
          userId,
          newCategoryId,
          createdAt
        ], function(err) {
          if (err) reject(err);
          else resolve();
        });
      });
      
      migratedCount++;
      const status = isCompleted ? "✓" : "⏳";
      console.log(`  ${status} Migrated todo '${todoName.substring(0, 30)}...' (Priority: ${priority})`);
    }
    
    console.log(`✅ Migrated ${migratedCount} todos, skipped ${skippedCount} duplicates`);
    return migratedCount;
  } catch (error) {
    console.error("❌ Failed to migrate todos:", error.message);
    return 0;
  }
}

async function main() {
  console.log("🚀 Starting migration from old MySQL to new SQLite database");
  console.log("=" .repeat(60));
  
  let oldConn = null;
  let newDb = null;
  
  try {
    // Connect to databases
    oldConn = await connectOldDb();
    if (!oldConn) {
      throw new Error("Failed to connect to old database");
    }
    
    newDb = await connectNewDb();
    
    // Get or create user
    const userId = await getOrCreateUser(newDb);
    
    // Migrate categories
    const categoryMap = await migrateCategories(oldConn, newDb, userId);
    
    // Migrate todos
    const migratedCount = await migrateTodos(oldConn, newDb, userId, categoryMap);
    
    console.log("\n" + "=" .repeat(60));
    console.log("🎉 Migration completed successfully!");
    console.log("📊 Summary:");
    console.log(`   • User ID: ${userId}`);
    console.log(`   • Categories mapped: ${Object.keys(categoryMap).length}`);
    console.log(`   • Todos migrated: ${migratedCount}`);
    console.log("\n🔑 Login credentials:");
    console.log("   Email: test@example.com");
    console.log("   Password: password123");
    console.log("\n🌐 Access the app at: http://localhost:3000");
    
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
  } finally {
    // Close connections
    if (oldConn) {
      await oldConn.end();
    }
    if (newDb) {
      newDb.close();
    }
    console.log("\n🔒 Database connections closed");
  }
}

// Run migration
main().catch(console.error);