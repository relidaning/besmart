const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
  console.log('Testing database connection...');
  console.log('Host:', process.env.DB_HOST);
  console.log('Port:', process.env.DB_PORT);
  console.log('Database:', process.env.DB_DATABASE);
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
    });
    
    console.log('✅ Database connection successful!');
    
    // Test query
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Test query successful:', rows);
    
    // Check if tables exist
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('📊 Existing tables:', tables.map(t => Object.values(t)[0]));
    
    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();