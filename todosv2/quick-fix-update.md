# Quick Fix for Todo Update Issue

If clicking "Update Todo" shows "Create New Todo" instead of "Edit Todo", try this:

## 1. First, check if servers are running:
```bash
# Backend
curl http://localhost:5071/health

# Frontend - open in browser
http://localhost:3000
```

## 2. Login credentials:
- Email: test@example.com
- Password: password123

## 3. If update still doesn't work:

### Option A: Refresh and try again
Sometimes React state needs a refresh.

### Option B: Clear browser cache
Clear localStorage for the site.

### Option C: Manual fix in code
Edit `/home/lidaning/.openclaw/workspace/besmart/todosv2/src/client/pages/Todos.tsx`:

Add debug logging to `handleEditTodo`:
```typescript
const handleEditTodo = (todo: Todo) => {
  console.log('Editing todo:', todo); // Add this line
  setEditingTodo(todo);
  setShowForm(true);
};
```

Then check browser console (F12) when clicking "Update".

## 4. Mobile bottom navigation:
- Should appear at bottom on phones
- Shows Dashboard, Todos, Categories icons
- Automatically highlights current page

## 5. Data verification:
- 385 todos migrated
- Categories: "Todo" and "StudyPlan"
- API endpoints all working

## Quick Test Commands:
```bash
# Test API
curl -X POST http://localhost:5071/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Get todos
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5071/api/todos?limit=5

# Update todo (ID 34)
curl -X PUT http://localhost:5071/api/todos/34 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Update"}'
```

The backend is confirmed working. The issue is likely frontend React state management.