#!/bin/bash

echo "Starting TodosV2 with external access..."
echo ""

# Kill any existing processes
pkill -f "node.*todosv2" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# Get local IP address
IP_ADDRESS=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")

echo "Local IP address: $IP_ADDRESS"
echo ""

echo "1. Starting backend server (port 5071)..."
cd /home/lidaning/.openclaw/workspace/besmart/todosv2
npm run dev:server > server.log 2>&1 &

echo "   Waiting for backend to start..."
sleep 5

echo "2. Starting frontend server (port 3000)..."
npm run dev:client > client.log 2>&1 &

echo ""
echo "✅ Application started with external access!"
echo ""
echo "🌐 Frontend URLs:"
echo "   Local:      http://localhost:3000"
echo "   Network:    http://$IP_ADDRESS:3000"
echo ""
echo "🔧 Backend API URLs:"
echo "   Local:      http://localhost:5071"
echo "   Network:    http://$IP_ADDRESS:5071"
echo "   Health:     http://$IP_ADDRESS:5071/health"
echo ""
echo "📝 Test credentials:"
echo "   Email: test@example.com"
echo "   Password: password123"
echo ""
echo "📋 Logs:"
echo "   Backend:  tail -f server.log"
echo "   Frontend: tail -f client.log"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Show backend log
echo "=== Backend Log (last 10 lines) ==="
tail -10 server.log 2>/dev/null || echo "No backend log yet"
echo ""

# Show frontend log  
echo "=== Frontend Log (last 10 lines) ==="
tail -10 client.log 2>/dev/null || echo "No frontend log yet"
echo ""

# Wait for user interrupt
wait