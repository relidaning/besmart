#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Setting up TodosV2...${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version must be 18 or higher. Current version: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) is installed${NC}"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install npm.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ npm $(npm -v) is installed${NC}"

# Check if MySQL is installed
if ! command -v mysql &> /dev/null; then
    echo -e "${YELLOW}⚠️  MySQL is not installed. You'll need to install MySQL separately.${NC}"
    echo -e "${YELLOW}   On Ubuntu: sudo apt install mysql-server${NC}"
    echo -e "${YELLOW}   On macOS: brew install mysql${NC}"
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}📝 Creating .env file from example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please edit .env file with your database credentials before continuing.${NC}"
    read -p "Press Enter to continue after editing .env file..."
fi

# Install dependencies
echo -e "${GREEN}📦 Installing dependencies...${NC}"
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Dependencies installed successfully${NC}"

# Ask about database setup
echo -e "${YELLOW}📊 Do you want to set up the database? (y/n)${NC}"
read -r setup_db

if [[ $setup_db =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Enter MySQL root password:${NC}"
    read -s mysql_password
    
    # Try to create database
    echo -e "${GREEN}🗄️  Creating database...${NC}"
    
    # Read database name from .env
    DB_NAME=$(grep DB_DATABASE .env | cut -d'=' -f2)
    
    if [ -z "$DB_NAME" ]; then
        DB_NAME="todos_db"
    fi
    
    mysql -u root -p"$mysql_password" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Database '$DB_NAME' created successfully${NC}"
        
        # Run migrations
        echo -e "${GREEN}🔄 Running database migrations...${NC}"
        npm run db:migrate
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Database migrations completed${NC}"
        else
            echo -e "${RED}❌ Database migrations failed${NC}"
        fi
    else
        echo -e "${RED}❌ Failed to create database. Please check your MySQL credentials.${NC}"
        echo -e "${YELLOW}⚠️  You can manually create the database:${NC}"
        echo -e "${YELLOW}   mysql -u root -p -e \"CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\"${NC}"
    fi
fi

# Build the application
echo -e "${GREEN}🔨 Building application...${NC}"
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Application built successfully${NC}"
else
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

# Display next steps
echo -e "\n${GREEN}🎉 Setup completed!${NC}"
echo -e "\n${YELLOW}📋 Next steps:${NC}"
echo -e "1. ${GREEN}Start development server:${NC} npm run dev"
echo -e "2. ${GREEN}Frontend will run on:${NC} http://localhost:3000"
echo -e "3. ${GREEN}Backend API will run on:${NC} http://localhost:5000"
echo -e "4. ${GREEN}Health check:${NC} http://localhost:5000/health"
echo -e "\n${YELLOW}For production:${NC}"
echo -e "1. ${GREEN}Start server:${NC} npm start"
echo -e "2. ${GREEN}Or use PM2:${NC} pm2 start dist/server/server.js --name todosv2"
echo -e "\n${YELLOW}Need to migrate data from old version?${NC}"
echo -e "Check ${GREEN}MIGRATION.md${NC} for detailed instructions."

echo -e "\n${GREEN}✨ TodosV2 is ready to use! ✨${NC}"