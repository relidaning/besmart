#!/usr/bin/env python3
"""
Final migration script to extract ALL todos from SQL dump
"""

import gzip
import re
import json
import sqlite3
import bcrypt
from datetime import datetime

def parse_sql_dump(filepath):
    """Parse the SQL dump file and extract all data"""
    print("📥 Reading SQL dump file...")
    
    with gzip.open(filepath, 'rt', encoding='utf-8') as f:
        content = f.read()
    
    # Extract categories
    print("📁 Extracting categories...")
    categories = []
    category_pattern = r"INSERT INTO `catagory`[^;]+;"
    category_match = re.search(category_pattern, content, re.DOTALL)
    
    if category_match:
        category_sql = category_match.group(0)
        # Extract values
        values_match = re.search(r"VALUES\s*(.+);", category_sql, re.DOTALL)
        if values_match:
            values_text = values_match.group(1)
            # Parse each row
            rows = re.findall(r"\(([^)]+)\)", values_text)
            for row in rows:
                parts = [p.strip().strip("'") for p in row.split(',')]
                if len(parts) >= 3:
                    categories.append({
                        'id': int(parts[0]),
                        'user_id': int(parts[1]),
                        'catagory_name': parts[2]
                    })
    
    print(f"✅ Found {len(categories)} categories")
    
    # Extract todos - find ALL INSERT statements
    print("✅ Extracting todos...")
    todos = []
    
    # Find all INSERT statements for todos
    todo_inserts = re.findall(r"INSERT INTO `todos`[^;]+;", content, re.DOTALL)
    
    for todo_sql in todo_inserts:
        # Extract values
        values_match = re.search(r"VALUES\s*(.+);", todo_sql, re.DOTALL)
        if values_match:
            values_text = values_match.group(1)
            # Parse each row - handle multiline
            rows = re.findall(r"\(([^)]+)\)", values_text, re.DOTALL)
            
            for row in rows:
                # Parse the row values
                values = []
                current = ''
                in_quotes = False
                escaped = False
                
                for i, char in enumerate(row):
                    if escaped:
                        current += char
                        escaped = False
                        continue
                    
                    if char == '\\':
                        escaped = True
                        continue
                    
                    if char == "'":
                        if not in_quotes:
                            in_quotes = True
                        elif i + 1 < len(row) and row[i + 1] == "'":
                            # Escaped quote
                            current += "'"
                            i += 1
                        else:
                            in_quotes = False
                            values.append(current)
                            current = ''
                        continue
                    
                    if not in_quotes and char == ',':
                        if current == 'NULL':
                            values.append(None)
                        elif current:
                            values.append(current)
                        current = ''
                        continue
                    
                    if in_quotes or (char != ' ' and char != '\n' and char != '\t'):
                        current += char
                
                # Handle last value
                if current == 'NULL':
                    values.append(None)
                elif current:
                    values.append(current)
                
                if len(values) >= 9:
                    todo = {
                        'id': int(values[0]) if values[0] else 0,
                        'user_id': int(values[1]) if values[1] else 1,
                        'catagory_id': int(values[2]) if values[2] and values[2] != 'NULL' else None,
                        'catagory_name': values[3] if values[3] and values[3] != 'NULL' else None,
                        'todo_name': values[4] if values[4] else '',
                        'acomplished_time': values[5] if values[5] and values[5] != 'NULL' else None,
                        'create_time': values[6] if values[6] else '',
                        'is_completed': values[7] if values[7] else '0',
                        'postponed': int(values[8]) if values[8] and values[8] != 'NULL' else 0
                    }
                    todos.append(todo)
    
    print(f"✅ Found {len(todos)} todos")
    
    # Show sample
    print("\n📋 Sample todos:")
    for i in range(min(5, len(todos))):
        print(f"  {i+1}. ID {todos[i]['id']}: {todos[i]['todo_name'][:50]}...")
    
    print(f"\n📊 Statistics:")
    print(f"  Completed: {sum(1 for t in todos if t['is_completed'] == '1')}")
    print(f"  Pending: {sum(1 for t in todos if t['is_completed'] == '0')}")
    print(f"  Max ID: {max(t['id'] for t in todos) if todos else 0}")
    
    return categories, todos

def migrate_to_sqlite(categories, todos, db_path='todos.db'):
    """Migrate data to SQLite database"""
    print("\n🚀 Migrating to SQLite database...")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Fix schema if needed
        print("🔧 Checking database schema...")
        cursor.execute("PRAGMA foreign_keys = OFF")
        
        # Check if categoryId has NOT NULL constraint
        cursor.execute("PRAGMA table_info(todos)")
        columns = cursor.fetchall()
        category_col = next((c for c in columns if c[1] == 'categoryId'), None)
        
        if category_col and category_col[3] == 1:  # notnull = 1
            print("⚠️  Fixing categoryId NOT NULL constraint...")
            # Create new table without constraint
            cursor.execute("""
                CREATE TABLE todos_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    priority VARCHAR(10) NOT NULL DEFAULT 'medium',
                    dueDate DATE,
                    completedAt DATETIME,
                    isCompleted BOOLEAN NOT NULL DEFAULT 0,
                    postponedCount INTEGER NOT NULL DEFAULT 0,
                    estimatedMinutes INTEGER NOT NULL DEFAULT 0,
                    tags JSON,
                    createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
                    updatedAt DATETIME NOT NULL DEFAULT (datetime('now')),
                    userId INTEGER NOT NULL,
                    categoryId INTEGER,
                    FOREIGN KEY (userId) REFERENCES users (id),
                    FOREIGN KEY (categoryId) REFERENCES categories (id)
                )
            """)
            
            # Copy data
            cursor.execute("INSERT INTO todos_new SELECT * FROM todos")
            cursor.execute("DROP TABLE todos")
            cursor.execute("ALTER TABLE todos_new RENAME TO todos")
            print("✅ Schema fixed")
        
        cursor.execute("PRAGMA foreign_keys = ON")
        
        # Get or create user
        print("\n👤 Setting up user...")
        cursor.execute("SELECT id FROM users WHERE email = 'test@example.com'")
        user = cursor.fetchone()
        
        if user:
            user_id = user[0]
            print(f"✅ Using existing user ID: {user_id}")
        else:
            # Create user
            hashed_password = bcrypt.hashpw('password123'.encode('utf-8'), bcrypt.gensalt())
            cursor.execute(
                "INSERT INTO users (email, username, password) VALUES (?, ?, ?)",
                ('test@example.com', 'Test User', hashed_password.decode('utf-8'))
            )
            user_id = cursor.lastrowid
            print(f"✅ Created new user ID: {user_id}")
        
        # Clear existing data for this user
        print("\n🧹 Clearing existing data...")
        cursor.execute("DELETE FROM todos WHERE userId = ?", (user_id,))
        cursor.execute("DELETE FROM categories WHERE userId = ?", (user_id,))
        
        # Migrate categories
        print("\n📁 Migrating categories...")
        category_map = {}
        colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B']
        icons = ['📝', '📚', '💼', '👤', '🛒']
        
        for i, cat in enumerate(categories):
            if not cat['catagory_name'] or cat['catagory_name'] == '`catagory_name`':
                continue
                
            color = colors[i % len(colors)]
            icon = icons[i % len(icons)]
            
            cursor.execute(
                "INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)",
                (cat['catagory_name'], color, icon, user_id)
            )
            new_id = cursor.lastrowid
            category_map[cat['id']] = new_id
            print(f"  ✓ {cat['catagory_name']} (ID: {new_id})")
        
        print(f"✅ Migrated {len(category_map)} categories")
        
        # Migrate todos
        print("\n✅ Migrating todos...")
        migrated = 0
        errors = 0
        
        for todo in todos:
            try:
                title = todo['todo_name'].strip()
                if not title:
                    errors += 1
                    continue
                
                # Determine priority
                postponed = todo['postponed']
                priority = 'medium'
                if postponed >= 3:
                    priority = 'high'
                elif postponed == 0:
                    priority = 'low'
                
                # Adjust based on content
                title_lower = title.lower()
                if 'urgent' in title_lower or 'important' in title_lower or 'asap' in title_lower:
                    priority = 'high'
                
                # Map category
                category_id = None
                if todo['catagory_id'] and todo['catagory_id'] in category_map:
                    category_id = category_map[todo['catagory_id']]
                
                # Handle dates
                created_at = None
                if todo['create_time']:
                    created_at = f"{todo['create_time']} 00:00:00"
                
                completed_at = None
                is_completed = todo['is_completed'] == '1'
                if is_completed and todo['acomplished_time']:
                    if len(todo['acomplished_time']) == 10:
                        completed_at = f"{todo['acomplished_time']} 00:00:00"
                    else:
                        completed_at = todo['acomplished_time']
                
                # Extract tags
                tags = ['migrated']
                if any(word in title_lower for word in ['http', 'github', '.com', 'youtube']):
                    tags.append('link')
                if any(word in title_lower for word in ['study', 'learn']):
                    tags.append('learning')
                if 'review' in title_lower:
                    tags.append('review')
                
                # Estimate time
                estimated_minutes = 45
                if 'quick' in title_lower:
                    estimated_minutes = 15
                elif any(word in title_lower for word in ['study', 'learn']):
                    estimated_minutes = 60
                elif any(word in title_lower for word in ['implement', 'build']):
                    estimated_minutes = 120
                
                # Insert todo
                cursor.execute("""
                    INSERT INTO todos (
                        title, description, priority, dueDate, completedAt,
                        isCompleted, postponedCount, estimatedMinutes, tags,
                        userId, categoryId, createdAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    title,
                    f"Original category: {todo['catagory_name'] or 'None'}\nCreated: {todo['create_time']}\nMigrated from old todo ID: {todo['id']}",
                    priority,
                    None,
                    completed_at,
                    1 if is_completed else 0,
                    postponed,
                    estimated_minutes,
                    json.dumps(tags),
                    user_id,
                    category_id,
                    created_at or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ))
                
                migrated += 1
                if migrated % 50 == 0:
                    print(f"  ... {migrated} todos migrated")
                    
            except Exception as e:
                errors += 1
                if errors <= 5:
                    print(f"  ⚠️  Error with todo ID {todo['id']}: {str(e)[:50]}")
        
        conn.commit()
        
        print(f"\n✅ Migration complete:")
        print(f"   ✓ Migrated: {migrated}")
        print(f"   ❌ Errors: {errors}")
        
        # Show statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN isCompleted = 1 THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN isCompleted = 0 THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high,
                SUM(CASE WHEN priority = 'medium' THEN 1 ELSE 0 END) as medium,
                SUM(CASE WHEN priority = 'low' THEN 1 ELSE 0 END) as low
            FROM todos WHERE userId = ?
        """, (user_id,))
        
        stats = cursor.fetchone()
        
        print("\n📊 FINAL STATISTICS:")
        print(f"   📝 Total Todos: {stats[0]}")
        print(f"   ✅ Completed: {stats[1]}")
        print(f"   ⏳ Pending: {stats[2]}")
        print(f"   🔴 High Priority: {stats[3]}")
        print(f"   🟡 Medium Priority: {stats[4]}")
        print(f"   🟢 Low Priority: {stats[5]}")
        
        # Category breakdown
        cursor.execute("""
            SELECT c.name, COUNT(t.id) as count 
            FROM categories c 
            LEFT JOIN todos t ON c.id = t.categoryId AND t.userId = ?
            WHERE c.userId = ?
            GROUP BY c.id 
            ORDER BY count DESC
        """, (user_id, user_id))
        
        print("\n📁 CATEGORY BREAKDOWN:")
        for cat in cursor.fetchall():
            print(f"   • {cat[0]}: {cat[1]} todos")
        
        # Uncategorized count
        cursor.execute("""
            SELECT COUNT(*) as count FROM todos 
            WHERE userId = ? AND categoryId IS NULL
        """, (user_id,))
        
        uncategorized = cursor.fetchone()[0]
        print(f"   • Uncategorized: {uncategorized} todos")
        
        print("\n🎉 MIGRATION COMPLETED SUCCESSFULLY!")
        print("\n🔑 Login credentials:")
        print("   Email: test@example.com")
        print("   Password: password123")
        print("\n🌐 Access the app at: http://localhost:3000")
        print("\n📱 Mobile bottom navigation is now enabled!")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {str(e)}")
        conn.rollback()
        raise
    finally:
        conn.close()

def main():
    print("🚀 FINAL DATA MIGRATION")
    print("=" * 60)
    
    # Parse SQL dump
    categories, todos = parse_sql_dump('todos.sql.gz')
    
    if not todos:
        print("❌ No todos found in SQL dump")
        return
    
    # Migrate to SQLite
    migrate_to_sqlite(categories, todos)

if __name__ == "__main__":
    main()