#!/usr/bin/env python3
"""
Migration script to transfer todos from old MySQL database to new SQLite database
"""

import mysql.connector
import sqlite3
import json
from datetime import datetime
import bcrypt

# Configuration
OLD_DB_CONFIG = {
    'host': '43.140.218.248',
    'port': 3306,
    'user': 'root',
    'password': 'lidaning',
    'database': 'todos'
}

NEW_DB_PATH = './todos.db'

def connect_old_db():
    """Connect to the old MySQL database"""
    try:
        conn = mysql.connector.connect(**OLD_DB_CONFIG)
        print("✅ Connected to old MySQL database")
        return conn
    except Exception as e:
        print(f"❌ Failed to connect to old database: {e}")
        return None

def connect_new_db():
    """Connect to the new SQLite database"""
    try:
        conn = sqlite3.connect(NEW_DB_PATH)
        conn.row_factory = sqlite3.Row
        print("✅ Connected to new SQLite database")
        return conn
    except Exception as e:
        print(f"❌ Failed to connect to new database: {e}")
        return None

def get_or_create_user(new_cursor):
    """Get or create a user in the new database"""
    # Check if test user exists
    new_cursor.execute("SELECT id FROM users WHERE email = 'test@example.com'")
    user = new_cursor.fetchone()
    
    if user:
        print(f"✅ Using existing user with ID: {user['id']}")
        return user['id']
    
    # Create test user
    hashed_password = bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt())
    new_cursor.execute(
        "INSERT INTO users (email, username, password) VALUES (?, ?, ?)",
        ('test@example.com', 'Test User', hashed_password.decode('utf-8'))
    )
    user_id = new_cursor.lastrowid
    print(f"✅ Created new user with ID: {user_id}")
    return user_id

def migrate_categories(old_cursor, new_cursor, user_id):
    """Migrate categories from old to new database"""
    print("\n📁 Migrating categories...")
    
    # Get categories from old database
    old_cursor.execute("SELECT id, catagory_name FROM catagory")
    old_categories = old_cursor.fetchall()
    
    category_map = {}  # Map old category ID to new category ID
    
    for old_cat in old_categories:
        old_id = old_cat[0]
        name = old_cat[1]
        
        # Check if category already exists
        new_cursor.execute(
            "SELECT id FROM categories WHERE name = ? AND userId = ?",
            (name, user_id)
        )
        existing = new_cursor.fetchone()
        
        if existing:
            category_map[old_id] = existing['id']
            print(f"  ✓ Category '{name}' already exists (ID: {existing['id']})")
        else:
            # Create new category with default color and icon
            colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B']
            icons = ['💼', '👤', '🛒', '❤️', '📚']
            
            color = colors[len(category_map) % len(colors)]
            icon = icons[len(category_map) % len(icons)]
            
            new_cursor.execute(
                "INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)",
                (name, color, icon, user_id)
            )
            new_id = new_cursor.lastrowid
            category_map[old_id] = new_id
            print(f"  ✓ Created category '{name}' (ID: {new_id})")
    
    print(f"✅ Migrated {len(category_map)} categories")
    return category_map

def migrate_todos(old_cursor, new_cursor, user_id, category_map):
    """Migrate todos from old to new database"""
    print("\n✅ Migrating todos...")
    
    # Get todos from old database
    old_cursor.execute("""
        SELECT id, user_id, catagory_id, catagory_name, todo_name, 
               acomplished_time, create_time, is_completed, postponed
        FROM todos
        ORDER BY id
    """)
    old_todos = old_cursor.fetchall()
    
    migrated_count = 0
    skipped_count = 0
    
    for old_todo in old_todos:
        old_id = old_todo[0]
        old_user_id = old_todo[1]
        old_category_id = old_todo[2]
        old_category_name = old_todo[3]
        todo_name = old_todo[4]
        accomplished_time = old_todo[5]
        create_time = old_todo[6]
        is_completed = old_todo[7] == '1'
        postponed_count = old_todo[8]
        
        # Check if todo already exists (by title and user)
        new_cursor.execute(
            "SELECT id FROM todos WHERE title = ? AND userId = ?",
            (todo_name, user_id)
        )
        existing = new_cursor.fetchone()
        
        if existing:
            skipped_count += 1
            print(f"  ⏭️  Todo '{todo_name[:30]}...' already exists, skipping")
            continue
        
        # Map priority based on postponed count
        if postponed_count >= 3:
            priority = 'high'
        elif postponed_count >= 1:
            priority = 'medium'
        else:
            priority = 'low'
        
        # Map category
        new_category_id = None
        if old_category_id and old_category_id in category_map:
            new_category_id = category_map[old_category_id]
        
        # Convert dates
        created_at = None
        if create_time:
            created_at = create_time.strftime('%Y-%m-%d %H:%M:%S') if isinstance(create_time, datetime) else create_time
        
        completed_at = None
        if is_completed and accomplished_time:
            completed_at = accomplished_time.strftime('%Y-%m-%d %H:%M:%S') if isinstance(accomplished_time, datetime) else accomplished_time
        
        # Insert into new database
        new_cursor.execute("""
            INSERT INTO todos (
                title, description, priority, dueDate, completedAt, 
                isCompleted, postponedCount, estimatedMinutes, tags, 
                userId, categoryId, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            todo_name,
            f"Migrated from old todo ID: {old_id}",
            priority,
            None,  # dueDate
            completed_at,
            1 if is_completed else 0,
            int(postponed_count) if postponed_count else 0,
            30,  # Default estimated minutes
            json.dumps(['migrated']),
            user_id,
            new_category_id,
            created_at or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ))
        
        migrated_count += 1
        status = "✓" if is_completed else "⏳"
        print(f"  {status} Migrated todo '{todo_name[:30]}...' (Priority: {priority})")
    
    print(f"✅ Migrated {migrated_count} todos, skipped {skipped_count} duplicates")
    return migrated_count

def main():
    print("🚀 Starting migration from old MySQL to new SQLite database")
    print("=" * 60)
    
    # Connect to databases
    old_conn = connect_old_db()
    if not old_conn:
        return
    
    new_conn = connect_new_db()
    if not new_conn:
        old_conn.close()
        return
    
    try:
        old_cursor = old_conn.cursor()
        new_cursor = new_conn.cursor()
        
        # Get or create user
        user_id = get_or_create_user(new_cursor)
        
        # Migrate categories
        category_map = migrate_categories(old_cursor, new_cursor, user_id)
        
        # Migrate todos
        migrated_count = migrate_todos(old_cursor, new_cursor, user_id, category_map)
        
        # Commit changes
        new_conn.commit()
        
        print("\n" + "=" * 60)
        print(f"🎉 Migration completed successfully!")
        print(f"📊 Summary:")
        print(f"   • User ID: {user_id}")
        print(f"   • Categories migrated: {len(category_map)}")
        print(f"   • Todos migrated: {migrated_count}")
        print(f"\n🔑 Login credentials:")
        print(f"   Email: test@example.com")
        print(f"   Password: password123")
        print(f"\n🌐 Access the app at: http://localhost:3000")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        new_conn.rollback()
    finally:
        old_cursor.close()
        new_cursor.close()
        old_conn.close()
        new_conn.close()
        print("\n🔒 Database connections closed")

if __name__ == "__main__":
    main()