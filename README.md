# Yasrab School Management System - Complete Setup

## ✅ What's Included

✓ Ultra-modern responsive frontend with all features
✓ Complete backend with error handling
✓ JWT-based authentication
✓ Full CRUD operations
✓ Dark mode support
✓ Real-time search & filtering
✓ Activity logging & auditing
✓ System health monitoring

## 🚀 Quick Start

### 1. Start Backend
```bash
node backend/server.js
```

### 2. Open Browser
```
http://localhost:3000
```

### 3. Login
- Username: `admin`
- Password: `1234`

## 📦 Features

### Dashboard
- Student & teacher count
- Pending admissions
- Total fees collected
- Recent activity log
- Quick action buttons

### People Management
- Student management (add, edit, delete)
- Teacher management
- Admission applications with approval/rejection

### Daily Operations
- Attendance marking by date
- Class timetable scheduling
- Multiple attendance states (Present/Absent/Leave)

### Academic
- Fee collection & receipt tracking
- Student result management with grades
- Marks calculation & grading system

### Administration
- School configuration
- System announcements
- Complete audit logs
- Global search functionality
- Data export/backup

## 🔐 Authentication

- JWT tokens (24-hour expiry)
- Bearer token authentication
- Session auto-refresh
- Auto-logout on token expiry

## 🎨 UI/UX

- Modern Poppins font
- Gradient designs
- Dark mode support
- Smooth animations
- Toast notifications
- Modal forms
- Responsive tables
- Mobile-friendly

## 🛠️ Backend Endpoints

**Auth**: POST /login
**Stats**: GET /stats
**Students**: GET/POST/DELETE /students
**Teachers**: GET/POST/DELETE /teachers
**Attendance**: GET/POST /attendance/:date
**Fees**: GET/POST /fees
**Results**: GET/POST /results
**Timetable**: GET/POST /timetable
**Announcements**: GET/POST /announcements
**Config**: GET/PATCH /config
**Logs**: GET /logs
**Search**: GET /search
**Health**: GET /health, GET /status
**Export**: GET /export

## 📁 Database

All data in `backend/db.json`:
- School configuration
- Student records
- Teacher records
- Attendance records
- Fee payments
- Student results
- Class timetables
- Announcements
- Admission applications
- Activity logs

## 💾 Installation

```bash
# Install dependencies
npm install

# Start backend
node backend/server.js

# Open http://localhost:3000
```

## ⚙️ Environment

File: `.env`
```
PORT=3000
NODE_ENV=development
ADMIN_USERNAME=admin
ADMIN_PASSWORD=1234
DB_PATH=./backend/db.json
```

## 📝 API Response Format

Success:
```json
{
  "success": true,
  "data": {...},
  "message": "Operation successful"
}
```

Error:
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Error description"
}
```

## 🔒 Security Features

- Input validation & sanitization
- CORS enabled
- Error handling
- Token expiry management
- Activity logging
- No sensitive data leakage

## 📱 Responsive Breakpoints

- Mobile: < 768px (collapsible sidebar)
- Tablet: 768px - 1024px
- Desktop: > 1024px

## 🌙 Dark Mode

- Toggle in sidebar
- Saved to localStorage
- System-wide support
- Smooth transitions

## 🚨 Troubleshooting

**Login fails**: Check .env credentials
**Database errors**: Verify db.json permissions
**API 401**: Token expired, login again
**CORS issues**: Check backend CORS config
**CSS not loading**: Clear browser cache

## 📊 Database Schema

```
config: {schoolName, address, contact, email}
students: [{id, name, class, phone, address, enrolledDate, status}]
teachers: [{id, name, subject}]
attendance: {"YYYY-MM-DD": [{id, status, time}]}
fees: {"studentId": [{amount, month, method, receipt, date}]}
results: {"studentId": [{subject, marks, total, percentage, grade, date}]}
timetable: {"className": [{subject, day, time}]}
announcements: [{id, title, message, priority, target, time}]
admissions: [{id, name, class, phone, address, status, date}]
logs: [{id, action, type, time}]
```

## 🎯 Next Steps

1. Customize school name in Settings
2. Add students
3. Add teachers
4. Set timetable
5. Start marking attendance
6. Record fees & results
7. Post announcements

## ✨ Version

Yasrab School Management System v1.0
Built with ❤️ for better school management

