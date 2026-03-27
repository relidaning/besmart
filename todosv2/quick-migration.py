#!/usr/bin/env python3
"""
Quick migration script - gets ALL data from SQL dump
"""

import gzip
import re
import json
import sqlite3
import hashlib
from datetime import datetime

def hash_password(password):
    """Simple password hashing"""
    return hashlib.sha256(password.encode()).hexdigest()

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
    
    # Extract todos - get the entire INSERT statement
    print("✅ Extracting todos...")
    todos = []
    
    # Find the INSERT statement (it might be very long)
    todo_pattern = r"INSERT INTO `todos`[^;]+;"
    todo_matches = re.findall(todo_pattern, content, re.DOTALL)
    
    if not todo_matches:
        print("❌ No todo INSERT statement found")
        return categories, todos
    
    print(f"📊 Found {len(todo_matches)} INSERT statements")
    
    for todo_sql in todo_matches:
        # Extract values part
        values_match = re.search(r"VALUES\s*(.+);", todo_sql, re.DOTALL)
        if not values_match:
            continue
            
        values_text = values_match.group(1)
        
        # Parse rows - this is tricky because of multiline values
        # Let's split by ), but handle quoted strings
        rows = []
        current_row = ''
        in_quotes = False
        escaped = False
        
        for char in values_text:
            if escaped:
                current_row += char
                escaped = False
                continue
                
            if char == '\\':
                escaped = True
                continue
                
            if char == "'":
                in_quotes = not in_quotes
                
            if not in_quotes and char == ')' and current_row.startswith('('):
                rows.append(current_row[1:])  # Remove opening (
                current_row = ''
                continue
                
            if not in_quotes and char == '(' and not current_row:
                current_row = '('
                continue
                
            current_row += char
        
        print(f"📝 Parsed {len(rows)} rows from this INSERT")
        
        # Parse each row
        for row in rows:
            if not row.strip():
                continue
                
            # Simple parsing - split by commas but handle quoted strings
            values = []
            current = ''
            in_quotes = False
            
            i = 0
            while i < len(row):
                char = row[i]
                
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
                elif not in_quotes and char == ',':
                    if current == 'NULL':
                        values.append(None)
                    elif current:
                        values.append(current)
                    current = ''
                else:
                    current += char
                
                i += 1
            
            # Last value
            if current == 'NULL':
                values.append(None)
            elif current:
                values.append(current)
            
            if len(values) >= 9:
                try:
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
                except (ValueError, IndexError) as e:
                    print(f"⚠️  Error parsing row: {e}")
    
    print(f"✅ Found {len(todos)} todos total")
    
    # Show statistics
    if todos:
        print(f"\n📊 Statistics:")
        print(f"  Completed: {sum(1 for t in todos if t['is_completed'] == '1')}")
        print(f"  Pending: {sum(1 for t in todos if t['is_completed'] == '0')}")
        print(f"  Max ID: {max(t['id'] for t in todos)}")
        print(f"  Min ID: {min(t['id'] for t in todos)}")
        
        print("\n📋 Sample todos:")
        for i in range(min(5, len(todos))):
            name = todos[i]['todo_name']
            print(f"  {i+1}. ID {todos[i]['id']}: {name[:50]}...")
        
        # Check for gaps in IDs
        ids = [t['id'] for t in todos]
        missing = [id for id in range(min(ids), max(ids) + 1) if id not in ids]
        if missing:
            print(f"  ⚠️  Missing IDs: {len(missing)} gaps")
    
    return categories, todos

def migrate_data(categories, todos):
    """Migrate data to SQLite"""
    print("\n🚀 Migrating data to SQLite...")
    
    conn = sqlite3.connect('todos.db')
    cursor = conn.cursor()
    
    try:
        # Get or create user
        print("👤 Setting up user...")
        cursor.execute("SELECT id FROM users WHERE email = 'test@example.com'")
        user = cursor.fetchone()
        
        if user:
            user_id = user[0]
            print(f"✅ Using existing user ID: {user_id}")
        else:
            # Create user with simple hash
            hashed_pw = hash_password('password123')
            cursor.execute(
                "INSERT INTO users (email, username, password) VALUES (?, ?, ?)",
                ('test@example.com', 'Test User', hashed_pw)
            )
            user_id = cursor.lastrowid
            print(f"✅ Created new user ID: {user_id}")
        
        # Clear existing data
        print("🧹 Clearing existing data...")
        cursor.execute("DELETE FROM todos WHERE userId = ?", (user_id,))
        cursor.execute("DELETE FROM categories WHERE userId = ?", (user_id,))
        
        # Migrate categories
        print("📁 Migrating categories...")
        category_map = {}
        colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B']
        icons = ['📝', '📚', '💼', '👤', '🛒']
        
        valid_categories = [c for c in categories if c['catagory_name'] and c['catagory_name'] != '`catagory_name`']
        
        for i, cat in enumerate(valid_categories):
            color = colors[i % len(colors)]
            icon = icons[i % len(icons)]
            
            cursor.execute(
                "INSERT INTO categories (name, color, icon, userId) VALUES (?, ?, ?, ?)",
                (cat['catagory_name'], color, icon, user_id)
            )
            new_id = cursor.lastrowid
            category_map[cat['id']] = new_id
            print(f"  ✓ {cat['catagory_name']}")
        
        print(f"✅ Migrated {len(category_map)} categories")
        
        # Migrate todos
        print("✅ Migrating todos...")
        migrated = 0
        
        for todo in todos:
            try:
                title = todo['todo_name'].strip()
                if not title:
                    continue
                
                # Priority
                postponed = todo['postponed']
                priority = 'medium'
                if postponed >= 3:
                    priority = 'high'
                elif postponed == 0:
                    priority = 'low'
                
                # Category
                category_id = None
                if todo['catagory_id'] and todo['catagory_id'] in category_map:
                    category_id = category_map[todo['catagory_id']]
                
                # Dates
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
                
                # Tags
                tags = ['migrated']
                title_lower = title.lower()
                if any(word in title_lower for word in ['http', 'github', '.com', 'youtube']):
                    tags.append('link')
                
                # Insert
                cursor.execute("""
                    INSERT INTO todos (
                        title, description, priority, dueDate, completedAt,
                        isCompleted, postponedCount, estimatedMinutes, tags,
                        userId, categoryId, createdAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    title[:255],
                    f"Migrated from ID: {todo['id']}",
                    priority,
                    None,
                    completed_at,
                    1 if is_completed else 0,
                    postponed,
                    30,
                    json.dumps(tags),
                    user_id,
                    category_id,
                    created_at or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ))
                
                migrated += 1
                if migrated % 100 == 0:
                    print(f"  ... {migrated} todos migrated")
                    
            except Exception as e:
                print(f"  ⚠️  Error with todo ID {todo['id']}: {str(e)[:50]}")
        
        conn.commit()
        
        print(f"\n✅ Successfully migrated {migrated} todos")
        
        # Show stats
        cursor.execute("SELECT COUNT(*) FROM todos WHERE userId = ?", (user_id,))
        total = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM todos WHERE userId = ? AND isCompleted = 1", (user_id,))
        completed = cursor.fetchone()[0]
        
        print(f"\n📊 Database now has:")
        print(f"   📝 Total Todos: {total}")
        print(f"   ✅ Completed: {completed}")
        print(f"   ⏳ Pending: {total - completed}")
        
        print("\n🎉 MIGRATION COMPLETE!")
        print("\n🔑 Login: test@example.com / password123")
        print("🌐 URL: http://localhost:3000")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        conn.rollback()
    finally:
        conn.close()

def main():
    print("🚀 QUICK DATA MIGRATION")
    print("=" * 60)
    
    # Parse data
    categories, todos = parse_sql_dump('todos.sql.gz')
    
    if not todos:
        print("❌ No todos to migrate")
        return
    
    # Migrate
    migrate_data(categories, todos)

if __name__ == "__main__":
    main()