# 🏫 Yasrab School Management System

A **modern, professional, full-featured** education management system with a beautiful UI. Built with **Node.js/Express** (backend) and **HTML5/CSS3/JavaScript** (frontend).

## 🌟 Features

### 📊 Dashboard
- Live statistics (Students, Teachers, Attendance, Fees)
- Quick action buttons
- System status and sync information

### 👨‍🎓 Student Management
- Add, view, search, and delete students
- Student ID, name, and class tracking
- Live search functionality
- Student status display

### 👨‍🏫 Teacher Management
- Add and manage teachers
- Subject/department assignment
- Teacher directory with contact info

### 📋 Attendance Management
- Mark daily attendance
- Status options: Present, Absent, Late, Leave
- Attendance tracking and reports

### 💰 Fee Management
- Record student fee payments
- Track payment methods (Cash, Bank, Cheque)
- Monthly fee tracking
- Student-wise fee history

### 📊 Results & Grades
- Record student marks and grades
- Subject-wise performance tracking
- Marks out of 100
- Student result history

### 📅 Timetable Management
- Create class schedules
- Subject and teacher assignment
- Day and time management
- Multi-class scheduling

### 📢 School Announcements
- Post important announcements
- Priority levels (Normal, High, Urgent)
- Target specific groups (All, Students, Teachers, Parents)
- Timestamps for all announcements

### 📝 Activity Logs
- Complete audit trail
- Track all system activities
- Timestamp for every action
- View who did what and when

### 🎨 Modern UI Features
- Beautiful, responsive design
- Dark/Light theme toggle
- Mobile-friendly interface
- Smooth animations
- Professional color scheme

## 🚀 Quick Start

### Prerequisites
- Node.js v14.0.0 or higher
- npm (comes with Node.js)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
# Navigate to project
cd 99

# Install dependencies
npm install

# Start the server
npm start
```

**Server runs on:** `http://localhost:3000`  
**Frontend:** Open `frontend/index.html` in your browser

### Default Credentials
- **Username:** `admin`
- **Password:** `1234`

> ⚠️ **Important:** Change these credentials in `.env` for production!

## 📁 Project Structure

```
99/
├── backend/
│   ├── server.js           # Express API server (all endpoints)
│   ├── auth.js             # JWT authentication
│   └── db.json             # Database (JSON file)
├── frontend/
│   ├── index.html          # Modern dashboard UI
│   ├── style.css           # Beautiful styling
│   └── app.js              # Frontend logic & API integration
├── package.json            # Dependencies & scripts
├── .env                    # Configuration
├── .env.example            # Configuration template
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## 🔧 Environment Variables

Edit `.env` to customize:

```env
# Server
PORT=3000
NODE_ENV=development

# Authentication
JWT_SECRET=yasrab_secret_key_2024
JWT_EXPIRES_IN=2h

# Admin Credentials (CHANGE FOR PRODUCTION!)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=1234

# Database Path
DB_PATH=./backend/db.json
```

## 📡 API Endpoints

### Authentication
```
POST /login                    - Login with credentials
```

### Students
```
GET    /students               - Get all students
POST   /students               - Add new student
DELETE /students/:id           - Delete student
GET    /search/:key            - Search students
```

### Teachers
```
GET    /teachers               - Get all teachers
POST   /teachers               - Add new teacher
```

### Attendance
```
POST   /attendance             - Mark attendance
```

### Fees
```
POST   /fees                   - Record fee payment
```

### Results
```
POST   /results                - Save student result
```

### Timetable
```
POST   /timetable              - Add timetable entry
GET    /timetable/:className   - Get class timetable
```

### Stats & Logs
```
GET    /stats                  - Get dashboard statistics
GET    /logs                   - Get activity logs
POST   /log                    - Add activity log
```

## 🎯 How to Use

### Adding a Student
1. Click "Student Management" in sidebar
2. Click "Add Student" button
3. Fill in Student ID, Name, Class
4. Click "Save Student"
5. Student appears in the list

### Marking Attendance
1. Click "Attendance Management"
2. Enter Student ID
3. Select status (Present, Absent, Late, Leave)
4. Click "Mark Attendance"

### Recording Fees
1. Click "Fee Management"
2. Click "Record Fee"
3. Enter Student ID, Amount, Month
4. Select payment method
5. Click "Record Payment"

### Posting Announcements
1. Click "School Announcements"
2. Click "New Announcement"
3. Enter title and message
4. Set priority and target audience
5. Click "Post Announcement"

## 🔒 Security Features

✅ **JWT Authentication** - Secure token-based auth  
✅ **Input Validation** - All inputs validated server-side  
✅ **Environment Variables** - Secrets in .env, not in code  
✅ **Error Handling** - Proper error messages and status codes  
✅ **CORS Enabled** - Safe cross-origin requests  
✅ **Password Protection** - Protected admin panel  

## 📱 Responsive Design

The system works perfectly on:
- 🖥️ Desktop computers
- 💻 Tablets
- 📱 Mobile phones

## 🎨 UI/UX Features

- Modern gradient design
- Smooth animations
- Easy navigation
- Color-coded status indicators
- Interactive forms with validation
- Real-time notifications
- Mobile sidebar toggle
- Theme switcher (Dark/Light mode)

## 🐛 Troubleshooting

### Port already in use
```bash
# Change PORT in .env
PORT=3001
npm start
```

### Cannot login
- Verify credentials are correct
- Check server is running (`npm start`)
- Look for error messages in browser console

### Data not showing
1. Refresh the page
2. Logout and login again
3. Check browser console for errors

### Database error
```bash
# Delete database and restart (loses data!)
rm backend/db.json
npm start
```

### Module not found
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm start
```

## 📚 Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | HTML5, CSS3, JavaScript ES6 |
| **Backend** | Node.js, Express.js |
| **Database** | JSON file (db.json) |
| **Auth** | JWT (JSON Web Tokens) |
| **API** | REST API |

## 🌐 Deployment

### Local Testing
```bash
npm start
# Opens on http://localhost:3000
```

### Production Deployment
1. Set `NODE_ENV=production` in `.env`
2. Change `JWT_SECRET` to a secure random string
3. Change admin credentials in `.env`
4. Deploy to hosting platform (Heroku, AWS, etc.)

## 📋 Database Schema

```json
{
  "students": [
    { "id": "S001", "name": "Ahmed Ali", "class": "10A" }
  ],
  "teachers": [
    { "name": "Mr. Khan", "subject": "Mathematics" }
  ],
  "attendance": {
    "S001": 20
  },
  "fees": {
    "S001": 5000
  },
  "results": {
    "S001": 85
  },
  "timetable": {
    "10A": [
      { "subject": "Math", "time": "Monday 10:00 AM" }
    ]
  },
  "logs": [
    { "action": "Student Added", "time": "2026-05-21T08:30:00Z" }
  ]
}
```

## 🚀 Future Enhancements

- [ ] Database migration to SQLite/MongoDB
- [ ] Student portal for parents
- [ ] Mobile app (React Native)
- [ ] Email notifications
- [ ] SMS alerts
- [ ] Advanced reporting and analytics
- [ ] Staff management
- [ ] Exam scheduling
- [ ] Grade calculation engine
- [ ] Real-time notifications

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify Node.js is installed: `node --version`
3. Check dependencies: `npm install`
4. Check if server is running: `npm start`
5. Open browser developer tools (F12) for error details

## 📄 License

ISC License

## 👨‍💻 About

**Yasrab School Management System** is a complete solution for educational institutions to manage students, teachers, attendance, fees, results, and more. Designed for ease of use and maximum efficiency.

**Version:** 1.0.0  
**Last Updated:** May 2026

---

<div align="center">

**Happy Teaching! 📚**

Made with ❤️ for educators

</div>
