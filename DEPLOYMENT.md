# 🚀 Yasrab ERP - Deployment Guide

This guide covers deploying Yasrab School Management System to various environments.

## Table of Contents
1. [Local Development](#local-development)
2. [Docker Deployment](#docker-deployment)
3. [Production Deployment](#production-deployment)
4. [Environment Setup](#environment-setup)
5. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Local Development

### Prerequisites
- Node.js v14.0.0 or higher
- npm v6.0.0 or higher
- Git

### Quick Setup
```bash
# Clone or navigate to project
cd 99

# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env

# Edit .env with your settings
nano .env

# Start development server
npm run dev
```

**Access at:** `http://localhost:3000`

---

## Docker Deployment

### Build Docker Image
```bash
# Build production-ready image
npm run docker:build

# Or manually:
docker build -t yasrab-erp:latest .
```

### Run Single Container
```bash
# Create .env file first
cp .env.example .env

# Run container
npm run docker:run

# Or manually:
docker run -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/backend/db.json:/app/backend/db.json \
  yasrab-erp:latest
```

### Docker Compose (Recommended)
```bash
# Create .env file
cp .env.example .env

# Start all services
npm run docker:compose:up

# View logs
docker-compose logs -f yasrab-erp

# Stop services
npm run docker:compose:down
```

---

## Production Deployment

### Heroku
```bash
# Login to Heroku
heroku login

# Create app
heroku create yasrab-erp

# Set environment variables
heroku config:set \
  NODE_ENV=production \
  JWT_SECRET="your-secure-random-key" \
  ADMIN_USERNAME="your-admin-user" \
  ADMIN_PASSWORD="your-secure-password"

# Deploy
git push heroku main
```

### AWS (EC2)
```bash
# 1. Launch EC2 instance (Ubuntu 20.04 LTS)
# 2. SSH into instance
ssh -i key.pem ubuntu@your-instance-ip

# 3. Install dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install nodejs npm -y

# 4. Clone repository
git clone https://github.com/yourusername/yasrab-erp.git
cd yasrab-erp

# 5. Setup environment
cp .env.example .env
nano .env  # Configure for production

# 6. Install and run
npm install
npm run prod

# 7. Setup PM2 for persistence
sudo npm install -g pm2
pm2 start backend/server.js --name "yasrab-erp"
pm2 startup
pm2 save
```

### DigitalOcean
```bash
# 1. Create Droplet (Ubuntu 20.04)
# 2. SSH into droplet
ssh root@your-droplet-ip

# 3. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 4. Setup application
cd /opt
git clone https://github.com/yourusername/yasrab-erp.git
cd yasrab-erp
cp .env.example .env

# 5. Configure .env
nano .env

# 6. Install and setup PM2
npm install
sudo npm install -g pm2
pm2 start backend/server.js --name "yasrab-erp"
pm2 startup systemd -u root --hp /root
pm2 save
```

### Railway.app
```bash
# 1. Connect GitHub repository
# 2. Create new project
# 3. Add environment variables:
#    - NODE_ENV=production
#    - JWT_SECRET=your-secure-key
#    - ADMIN_USERNAME=your-user
#    - ADMIN_PASSWORD=your-pass
# 4. Deploy automatically
```

---

## Environment Setup

### Essential Variables (Production)
```env
NODE_ENV=production
PORT=3000

# Strong random JWT secret (CRITICAL!)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_EXPIRES_IN=2h

# Secure credentials
ADMIN_USERNAME=secure_admin_username
ADMIN_PASSWORD=$(openssl rand -base64 16)

# Database (use persistent storage)
DB_PATH=/data/yasrab/db.json
```

### Security Checklist
- [ ] Change admin username and password
- [ ] Generate secure JWT secret
- [ ] Set NODE_ENV=production
- [ ] Use absolute DB_PATH
- [ ] Enable CORS for specific domains only
- [ ] Setup SSL/TLS certificate
- [ ] Configure firewall rules
- [ ] Regular database backups
- [ ] Monitor application logs

### SSL/TLS Setup (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot certonly --standalone -d yourdomain.com
```

---

## Monitoring & Maintenance

### Database Backup
```bash
# Manual backup
npm run db:backup

# Or manually:
cp backend/db.json backend/db.backup.$(date +%Y%m%d_%H%M%S).json
```

### Automated Backup (Linux Cron)
```bash
# Edit crontab
crontab -e

# Add backup job (daily at 2 AM)
0 2 * * * cd /path/to/yasrab && npm run db:backup

# Backup to cloud
0 2 * * * cd /path/to/yasrab && cp backend/db.json /cloud/backup/db.$(date +\%Y\%m\%d).json
```

### Health Check
```bash
curl http://localhost:3000/stats -H "Authorization: Bearer YOUR_TOKEN"
```

### Viewing Logs
```bash
# Application logs
pm2 logs yasrab-erp

# System logs
tail -f /var/log/syslog
```

### Performance Optimization
1. **Enable compression:** Install `compression` middleware
2. **Use CDN:** Serve static assets via CDN
3. **Database indexing:** Index frequently searched fields
4. **Caching:** Implement Redis for session caching
5. **Load balancing:** Use Nginx reverse proxy

### Update Process
```bash
# 1. Backup database
npm run db:backup

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
npm install

# 4. Restart application
pm2 restart yasrab-erp

# 5. Verify
curl http://localhost:3000/stats -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 PID
```

### Database Corrupted
```bash
# Backup corrupted database
mv backend/db.json backend/db.corrupt.json

# Reset (starts fresh)
npm run db:reset
```

### Out of Memory
```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

---

## Support & Resources

- **GitHub Issues:** Report bugs and features
- **Documentation:** See README.md for features
- **Environment Variables:** See .env.example
- **API Reference:** See API.md

---

**Last Updated:** May 2026  
**Version:** 1.0.0
