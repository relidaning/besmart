const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const dbPath = path.join(__dirname, 'todos.db');
const db = new sqlite3.Database(dbPath);

async function seedDatabase() {
  console.log('Seeding database with test data...');
  
  try {
    // Hash password
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Create test user
    db.run(`INSERT INTO users (email, username, password) VALUES (?, ?, ?)`, 
      ['test@example.com', 'Test User', hashedPassword], 
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            console.log('User already exists, skipping...');
          } else {
            console.error('Error creating user:', err.message);
            return;
          }
        } else {
          console.log('✅ Created test user: test@example.com');
        }
        
        const userId = this.lastID || 1;
        
        // Create categories
        const categories = [
          ['Work', '#3B82F6', '💼', userId],
          ['Personal', '#10B981', '👤', userId],
          ['Shopping', '#8B5CF6', '🛒', userId],
          ['Health', '#EF4444', '❤️', userId],
        ];
        
        let categoriesCreated = 0;
        const categoryIds = [];
        
        categories.forEach((cat, index) => {
          db.run(`INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)`, 
            cat, 
            function(err) {
              if (err) {
                console.error('Error creating category:', err.message);
              } else {
                console.log(`✅ Created category: ${cat[0]}`);
                categoryIds.push(this.lastID);
              }
              
              categoriesCreated++;
              
              if (categoriesCreated === categories.length) {
                createTodos(userId, categoryIds);
              }
            }
          );
        });
      }
    );
  } catch (error) {
    console.error('Seeding failed:', error);
  }
}

function createTodos(userId, categoryIds) {
  const todos = [
    ['Complete project proposal', 'Finish writing the project proposal document', 'high', 
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
      null, 0, 0, 120, JSON.stringify(['work', 'important']), userId, categoryIds[0]],
    
    ['Buy groceries', 'Milk, eggs, bread, fruits', 'medium', 
      new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
      null, 0, 0, 45, JSON.stringify(['shopping', 'home']), userId, categoryIds[2]],
    
    ['Morning exercise', '30 minutes of cardio', 'low', 
      null, null, 0, 0, 30, JSON.stringify(['health', 'routine']), userId, categoryIds[3]],
    
    ['Read book', 'Finish reading current chapter', 'low', 
      null, new Date().toISOString(), 1, 0, 60, JSON.stringify(['personal', 'learning']), userId, categoryIds[1]],
    
    ['Plan weekend trip', 'Research destinations and book accommodations', 'medium', 
      new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
      null, 0, 0, 90, JSON.stringify(['personal', 'travel']), userId, null],
  ];
  
  let todosCreated = 0;
  
  todos.forEach((todo, index) => {
    db.run(`INSERT INTO todos (title, description, priority, dueDate, completedAt, isCompleted, postponedCount, estimatedMinutes, tags, userId, categoryId) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      todo, 
      function(err) {
        if (err) {
          console.error('Error creating todo:', err.message);
        } else {
          console.log(`✅ Created todo: ${todo[0]}`);
        }
        
        todosCreated++;
        
        if (todosCreated === todos.length) {
          console.log('\n🎉 Database seeded successfully!');
          console.log('Test user credentials:');
          console.log('  Email: test@example.com');
          console.log('  Password: password123');
          console.log('\nYou can now log in and test the application.');
          db.close();
        }
      }
    );
  });
}

seedDatabase();