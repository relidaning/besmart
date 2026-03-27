#!/bin/bash

# Test API endpoints for todo app fixes

echo "Testing Todo App API Endpoints..."
echo "=================================="

# Get a valid JWT token from server logs
TOKEN=$(grep -o '"token":"[^"]*"' server.log | tail -1 | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo "ERROR: No JWT token found in server.log"
    echo "Make sure the server is running and a user has logged in."
    exit 1
fi

echo "Using token: ${TOKEN:0:20}..."
echo ""

# Test 1: Get todos with isCompleted=false (should only return pending todos)
echo "Test 1: GET /api/todos?isCompleted=false"
echo "----------------------------------------"
curl -s "http://localhost:5071/api/todos?isCompleted=false" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.data[] | "\(.title) - completed: \(.isCompleted)"' 2>/dev/null || \
  echo "No todos returned or jq not installed"
echo ""

# Test 2: Get todos with isCompleted=true (should only return completed todos)
echo "Test 2: GET /api/todos?isCompleted=true"
echo "---------------------------------------"
curl -s "http://localhost:5071/api/todos?isCompleted=true" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.data[] | "\(.title) - completed: \(.isCompleted)"' 2>/dev/null || \
  echo "No todos returned or jq not installed"
echo ""

# Test 3: Get todos without isCompleted filter (should return all todos)
echo "Test 3: GET /api/todos (no filter)"
echo "----------------------------------"
curl -s "http://localhost:5071/api/todos" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.pagination.total' 2>/dev/null | \
  xargs echo "Total todos:" || \
  echo "Failed to get total count"
echo ""

# Test 4: Get stats
echo "Test 4: GET /api/todos/stats"
echo "----------------------------"
curl -s "http://localhost:5071/api/todos/stats" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.data | "Total: \(.total), Completed: \(.completed), Pending: \(.pending)"' 2>/dev/null || \
  echo "Failed to get stats"
echo ""

echo "API Tests Complete!"
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:5071"