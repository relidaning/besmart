#!/usr/bin/env node

const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();

async function fixPassword() {
  console.log('🔐 Fixing password hash...');
  
  const db = new sqlite3.Database('todos.db');
  
  try {
    // Get the user
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, email, password FROM users WHERE email = ?', 
        ['test@example.com'], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
    });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log(`👤 Found user: ${user.email} (ID: ${user.id})`);
    console.log(`🔑 Current password hash: ${user.password.substring(0, 20)}...`);
    
    // Hash password with bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('password123', saltRounds);
    
    // Update user with bcrypt hash
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, user.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
    });
    
    console.log('✅ Password updated with bcrypt hash');
    console.log(`🔑 New password hash: ${hashedPassword.substring(0, 20)}...`);
    
    // Test the hash
    const isValid = await bcrypt.compare('password123', hashedPassword);
    console.log(`✅ Bcrypt test: ${isValid ? 'PASS' : 'FAIL'}`);
    
    console.log('\n🎉 Password fixed!');
    console.log('🔑 Login: test@example.com / password123');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    db.close();
  }
}

// Check if bcrypt is installed
try {
  require('bcrypt');
  fixPassword().catch(console.error);
} catch (error) {
  console.log('Installing bcrypt...');
  const { execSync } = require('child_process');
  execSync('npm install bcrypt', { stdio: 'inherit' });
  fixPassword().catch(console.error);
}