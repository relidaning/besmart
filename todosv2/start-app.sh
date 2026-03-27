#!/bin/bash

echo "Starting TodosV2 Application..."
echo ""

# Kill any existing processes
pkill -f "node.*todosv2" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

echo "1. Starting backend server (port 5071)..."
cd /home/lidaning/.openclaw/workspace/besmart/todosv2
npm run dev:server > server.log 2>&1 &

echo "   Waiting for backend to start..."
sleep 5

echo "2. Starting frontend server (port 3000)..."
npm run dev:client > client.log 2>&1 &

echo ""
echo "✅ Application started successfully!"
echo ""
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:5071"
echo "📊 Health check: http://localhost:5071/health"
echo ""
echo "📝 Test credentials:"
echo "   Email: test@example.com"
echo "   Password: password123"
echo ""
echo "📋 Logs:"
echo "   Backend: tail -f server.log"
echo "   Frontend: tail -f client.log"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Wait for user interrupt
wait