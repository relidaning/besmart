#!/bin/bash

echo "Starting TodosV2 development servers..."
echo ""

# Start backend server in background
echo "Starting backend server (port 5071)..."
cd /home/lidaning/.openclaw/workspace/besmart/todosv2
npm run dev:server > server.log 2>&1 &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 3

# Start frontend server
echo "Starting frontend server (port 3000)..."
echo "Frontend will be available at: http://localhost:3000"
echo "Backend API will be available at: http://localhost:5071"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

npm run dev:client

# Cleanup on exit
trap "kill $BACKEND_PID 2>/dev/null; echo 'Servers stopped'" EXIT