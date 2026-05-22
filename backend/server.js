require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { createToken, verifyToken } = require("./auth");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.resolve(process.env.DB_PATH || "./backend/db.json");
const NODE_ENV = process.env.NODE_ENV || "development";

// ===== REQUEST TRACKING =====
let requestCount = 0;
let activeRequests = 0;
const errorLog = [];
const requestLog = [];

// ===== MIDDLEWARE - LOGGING & TRACKING =====
app.use((req, res, next) => {
  requestCount++;
  activeRequests++;
  const start = Date.now();
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  req.requestId = requestId;
  req.startTime = start;

  res.on('finish', () => {
    activeRequests--;
    const duration = Date.now() - start;
    const logEntry = {
      id: requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      ip: req.ip,
      userAgent: req.get('user-agent')?.substring(0, 50) || 'N/A'
    };
    requestLog.push(logEntry);
    if (requestLog.length > 500) requestLog.shift();
  });

  next();
});

// ===== MIDDLEWARE - CORS & PARSING =====
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ===== MIDDLEWARE - REQUEST VALIDATION =====
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
    if (!req.is('application/json')) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CONTENT_TYPE",
        message: "Content-Type must be application/json"
      });
    }
  }
  next();
});

// ===== MIDDLEWARE - PARSE ERROR HANDLING =====
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: "INVALID_JSON",
      message: "Invalid JSON format",
      details: NODE_ENV === 'development' ? err.message : undefined
    });
  }
  next(err);
});

// ===== MIDDLEWARE - REQUEST SIZE LIMIT =====
app.use((req, res, next) => {
  if (req.get('content-length') > 50 * 1024 * 1024) {
    return res.status(413).json({
      success: false,
      error: "PAYLOAD_TOO_LARGE",
      message: "Request body too large (max 50MB)"
    });
  }
  next();
});

// ===== STATIC FILES =====
app.use(express.static(path.resolve(__dirname, "../frontend")));

// ===== VALIDATION HELPERS =====
const validators = {
  isValidStudentId: (id) => /^[A-Za-z0-9\-]{1,20}$/.test(id),
  isValidName: (name) => /^[A-Za-z\s]{2,100}$/.test(name),
  isValidClass: (cls) => /^[0-9A-Za-z\-]{1,10}$/.test(cls),
  isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  isValidPhone: (phone) => /^[\d+\-\(\)\s]{7,20}$/.test(phone),
  isValidAmount: (amount) => Number(amount) > 0 && Number(amount) < 10000000,
  isValidMarks: (marks) => Number(marks) >= 0 && Number(marks) <= 100,
  isValidUsername: (u) => /^[a-zA-Z0-9_]{3,20}$/.test(u),
  isValidPassword: (p) => p && p.length >= 4,
  sanitize: (str) => String(str).trim().slice(0, 500)
};

// ===== DATABASE SCHEMA =====
const DEFAULT_DB = {
  config: {
    schoolName: "Yasrab School Management System",
    address: "Main Campus, Karachi",
    contact: "+92 123 4567890",
    email: "admin@yasrab.edu"
  },
  students: [],
  teachers: [],
  attendance: {},
  fees: {},
  results: {},
  timetable: {},
  logs: [],
  announcements: [],
  admissions: []
};

// ===== DATABASE FUNCTIONS =====
function initDB() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
      console.log("✅ Fresh database initialized");
      return;
    }

    const existing = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    let changed = false;

    for (const key of Object.keys(DEFAULT_DB)) {
      if (!(key in existing)) {
        existing[key] = DEFAULT_DB[key];
        changed = true;
      }
    }

    if (existing.attendance && !isDateKeyedAttendance(existing.attendance)) {
      console.warn("⚠️  Migrating attendance format...");
      existing.attendance = {};
      changed = true;
    }

    if (existing.fees) {
      for (const key of Object.keys(existing.fees)) {
        if (!Array.isArray(existing.fees[key])) {
          existing.fees[key] = [{
            amount: Number(existing.fees[key]) || 0,
            month: "Migrated",
            method: "cash",
            date: new Date().toISOString()
          }];
          changed = true;
        }
      }
    }

    if (existing.results) {
      for (const key of Object.keys(existing.results)) {
        if (!Array.isArray(existing.results[key])) {
          existing.results[key] = [{
            subject: "Migrated",
            marks: Number(existing.results[key]) || 0,
            total: 100,
            date: new Date().toISOString()
          }];
          changed = true;
        }
      }
    }

    if (existing.students) {
      existing.students = existing.students.map(s => ({
        ...s,
        enrolledDate: s.enrolledDate || new Date().toISOString()
      }));
    }

    if (changed) {
      fs.writeFileSync(DB_PATH, JSON.stringify(existing, null, 2));
      console.log("✅ Database migrated successfully");
    }
  } catch (err) {
    console.error("❌ DB init error:", err.message);
    throw err;
  }
}

function isDateKeyedAttendance(att) {
  const keys = Object.keys(att);
  if (!keys.length) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(keys[0]);
}

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (err) {
    console.error("❌ DB read error:", err.message);
    return { ...DEFAULT_DB };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("❌ DB write error:", err.message);
    return false;
  }
}

function logAction(action, type = "SYSTEM", userId = "system") {
  try {
    const db = readDB();
    db.logs.unshift({
      id: Date.now(),
      action,
      type,
      userId,
      time: new Date().toISOString()
    });
    if (db.logs.length > 1000) db.logs = db.logs.slice(0, 1000);
    writeDB(db);
  } catch (err) {
    console.error("❌ Log error:", err.message);
  }
}

// ===== INITIALIZE DATABASE =====
try {
  initDB();
} catch (err) {
  console.error("Failed to initialize database. Exiting...");
  process.exit(1);
}

// ===== STARTUP INFO =====
console.log("\n" + "=".repeat(70));
console.log("🚀 YASRAB SCHOOL MANAGEMENT SYSTEM - BACKEND STARTUP");
console.log("=".repeat(70));

try {
  const db = readDB();
  console.log("\n✅ DATABASE CONNECTION STATUS:");
  console.log(`   📁 Location: ${DB_PATH}`);
  console.log(`   💾 Size: ${(fs.statSync(DB_PATH).size / 1024).toFixed(2)} KB`);
  console.log("\n📈 DATABASE RECORDS:");
  console.log(`   👥 Students: ${db.students?.length || 0}`);
  console.log(`   🎓 Teachers: ${db.teachers?.length || 0}`);
  console.log(`   📋 Logs: ${db.logs?.length || 0}`);
  console.log(`   💰 Fee Records: ${Object.keys(db.fees || {}).length}`);
  console.log(`   📊 Result Records: ${Object.keys(db.results || {}).length}`);
  console.log(`   ✔️  Attendance Records: ${Object.keys(db.attendance || {}).length}`);
  console.log("\n🔐 CONFIGURATION:");
  console.log(`   🔑 Admin User: ${process.env.ADMIN_USERNAME || "admin"}`);
  console.log(`   🌐 Environment: ${NODE_ENV}`);
  console.log(`   🔗 API Version: v1.0`);
  console.log("\n✅ ALL SYSTEMS OPERATIONAL");
  console.log("=".repeat(70) + "\n");
} catch (err) {
  console.error("❌ STARTUP ERROR:", err.message);
  process.exit(1);
}

// ===== HEALTH & STATUS ENDPOINTS =====
app.get("/health", (req, res) => {
  try {
    const db = readDB();
    const dbExists = fs.existsSync(DB_PATH);
    const dbSize = dbExists ? fs.statSync(DB_PATH).size : 0;

    res.json({
      status: "✅ OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: NODE_ENV,
      requests: {
        total: requestCount,
        active: activeRequests
      },
      database: {
        connected: true,
        path: DB_PATH,
        exists: dbExists,
        size: `${(dbSize / 1024).toFixed(2)} KB`,
        records: {
          students: db.students?.length || 0,
          teachers: db.teachers?.length || 0,
          attendance: Object.keys(db.attendance || {}).length,
          fees: Object.keys(db.fees || {}).length,
          results: Object.keys(db.results || {}).length,
          logs: db.logs?.length || 0
        }
      },
      port: PORT,
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`
      }
    });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({
      status: "❌ ERROR",
      error: "HEALTH_CHECK_FAILED",
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/status", (req, res) => {
  try {
    const db = readDB();
    res.json({
      serverStatus: "Running",
      databaseStatus: "Connected",
      databaseSize: fs.statSync(DB_PATH).size,
      lastUpdated: new Date().toISOString(),
      dataIntegrity: {
        students: Array.isArray(db.students),
        teachers: Array.isArray(db.teachers),
        attendance: typeof db.attendance === "object",
        fees: typeof db.fees === "object",
        results: typeof db.results === "object",
        logs: Array.isArray(db.logs)
      },
      statistics: {
        totalStudents: db.students?.length || 0,
        totalTeachers: db.teachers?.length || 0,
        totalLogs: db.logs?.length || 0,
        recentActivity: db.logs?.[0]?.action || "No activity"
      }
    });
  } catch (err) {
    res.status(500).json({
      error: "STATUS_ERROR",
      message: "Failed to retrieve status",
      details: NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.get("/system/logs", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    res.json({
      requests: requestLog.slice(-limit),
      total: requestLog.length,
      errors: errorLog.slice(-limit),
      errorCount: errorLog.length
    });
  } catch (err) {
    res.status(500).json({ error: "SYSTEM_LOG_ERROR", message: err.message });
  }
});

// ===== AUTHENTICATION ENDPOINTS =====
app.post("/login", (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "MISSING_CREDENTIALS",
        message: "Username and password are required",
        fields: ["username", "password"]
      });
    }

    if (!validators.isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_USERNAME_FORMAT",
        message: "Username must be 3-20 alphanumeric characters"
      });
    }

    if (!validators.isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PASSWORD_FORMAT",
        message: "Password must be at least 4 characters"
      });
    }

    const adminUser = process.env.ADMIN_USERNAME || "admin";
    const adminPass = process.env.ADMIN_PASSWORD || "1234";

    if (username === adminUser && password === adminPass) {
      const token = createToken({ username, role: "admin", id: Date.now() });
      logAction(`✅ Admin login successful: ${username}`, "AUTH", username);
      
      return res.json({
        success: true,
        token,
        role: "admin",
        user: { username, id: "admin" },
        message: "Login successful",
        expiresIn: "24h"
      });
    }

    logAction(`❌ Failed login attempt: ${username}`, "SECURITY", username);
    res.status(401).json({
      success: false,
      error: "INVALID_CREDENTIALS",
      message: "Invalid username or password"
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      success: false,
      error: "LOGIN_ERROR",
      message: "Server error during authentication",
      details: NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ===== MIDDLEWARE - AUTH CHECK (for protected routes) =====
app.use((req, res, next) => {
  if (req.path === '/login' || req.path === '/health' || req.path === '/status' || 
      req.path === '/' || req.path.startsWith('/system')) {
    return next();
  }
  verifyToken(req, res, next);
});

// ===== CONFIG ENDPOINTS =====
app.get("/config", (req, res) => {
  try {
    const db = readDB();
    res.json(db.config || DEFAULT_DB.config);
  } catch (err) {
    res.status(500).json({ error: "CONFIG_READ_ERROR", message: err.message });
  }
});

app.patch("/config", (req, res) => {
  try {
    const db = readDB();
    db.config = { ...db.config, ...req.body };
    if (!writeDB(db)) throw new Error("Write failed");
    logAction("🔧 School configuration updated", "SYSTEM");
    res.json({ success: true, message: "Configuration updated", config: db.config });
  } catch (err) {
    res.status(500).json({ error: "CONFIG_UPDATE_ERROR", message: err.message });
  }
});

// ===== DASHBOARD STATS =====
app.get("/stats", (req, res) => {
  try {
    const db = readDB();
    const totalFees = Object.values(db.fees || {})
      .flat()
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

    res.json({
      students: db.students.length,
      teachers: db.teachers.length,
      admissions: (db.admissions || []).filter(a => a.status === "pending").length,
      fees: totalFees,
      recentLogs: (db.logs || []).slice(0, 10),
      recentStudents: (db.students || []).slice(-5).reverse(),
      summary: {
        totalAttendanceRecords: Object.keys(db.attendance || {}).length,
        totalAnnouncements: (db.announcements || []).length,
        totalResults: Object.keys(db.results || {}).length
      }
    });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "STATS_ERROR", message: err.message });
  }
});

// ===== ADMISSIONS ENDPOINTS =====
app.get("/admissions", (req, res) => {
  try {
    res.json(readDB().admissions || []);
  } catch (err) {
    res.status(500).json({ error: "ADMISSIONS_READ_ERROR", message: err.message });
  }
});

app.post("/admissions", (req, res) => {
  try {
    const db = readDB();
    const newAdm = {
      id: "ADM-" + Date.now(),
      ...req.body,
      status: "pending",
      date: new Date().toISOString()
    };
    db.admissions.unshift(newAdm);
    if (!writeDB(db)) throw new Error("Write failed");
    logAction(`📝 Admission application: ${req.body.name}`, "REGISTRY");
    res.json({ success: true, message: "Application submitted", admission: newAdm });
  } catch (err) {
    res.status(500).json({ error: "ADMISSIONS_CREATE_ERROR", message: err.message });
  }
});

app.patch("/admissions/:id", (req, res) => {
  try {
    const { status } = req.body;
    const db = readDB();
    const idx = db.admissions.findIndex(a => a.id === req.params.id);
    
    if (idx === -1) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Application not found" });
    }

    db.admissions[idx].status = status;

    if (status === "approved") {
      const adm = db.admissions[idx];
      const newId = "S-" + Date.now().toString().slice(-6);
      db.students.push({
        id: newId,
        name: adm.name,
        class: adm.class,
        phone: adm.phone || "",
        address: adm.address || "",
        enrolledDate: new Date().toISOString()
      });
      logAction(`✅ Enrolment approved: ${adm.name} → ID ${newId}`, "REGISTRY");
    }

    if (!writeDB(db)) throw new Error("Write failed");
    res.json({ success: true, message: `Application ${status}` });
  } catch (err) {
    res.status(500).json({ error: "ADMISSIONS_UPDATE_ERROR", message: err.message });
  }
});

// ===== STUDENTS ENDPOINTS =====
app.get("/students", (req, res) => {
  try {
    res.json(readDB().students || []);
  } catch (err) {
    res.status(500).json({ error: "STUDENTS_READ_ERROR", message: err.message });
  }
});

app.post("/students", (req, res) => {
  try {
    const { id, name, class: cls, phone, address } = req.body;

    if (!id || !name || !cls) {
      return res.status(400).json({
        success: false,
        error: "MISSING_FIELDS",
        message: "Student ID, name, and class are required",
        fields: ["id", "name", "class"]
      });
    }

    if (!validators.isValidStudentId(id)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STUDENT_ID",
        message: "Invalid student ID format"
      });
    }

    const db = readDB();
    if (db.students.some(s => s.id === id)) {
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_ID",
        message: "Student ID already exists"
      });
    }

    const newStudent = {
      id: validators.sanitize(id),
      name: validators.sanitize(name),
      class: validators.sanitize(cls),
      phone: phone ? validators.sanitize(phone) : "",
      address: address ? validators.sanitize(address) : "",
      status: "active",
      enrolledDate: new Date().toISOString()
    };

    db.students.push(newStudent);
    if (!writeDB(db)) throw new Error("Write failed");
    logAction(`📚 Student enrolled: ${name} (${id})`, "REGISTRY");
    
    res.json({
      success: true,
      message: "Student added successfully",
      student: newStudent
    });
  } catch (err) {
    console.error("Student creation error:", err);
    res.status(500).json({
      success: false,
      error: "STUDENT_CREATE_ERROR",
      message: "Server error while creating student"
    });
  }
});

app.delete("/students/:id", (req, res) => {
  try {
    const db = readDB();
    const before = db.students.length;
    db.students = db.students.filter(s => s.id !== req.params.id);
    
    if (db.students.length === before) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Student not found" });
    }
    
    if (!writeDB(db)) throw new Error("Write failed");
    logAction(`🗑️  Student record deleted: ${req.params.id}`, "SECURITY");
    res.json({ success: true, message: "Student deleted" });
  } catch (err) {
    res.status(500).json({ error: "STUDENT_DELETE_ERROR", message: err.message });
  }
});

// ===== SEARCH ENDPOINT =====
app.get("/search", (req, res) => {
  try {
    const query = String(req.query.q || "").toLowerCase().trim();
    if (!query || query.length < 2) {
      return res.json({ results: { students: [], teachers: [], announcements: [] } });
    }

    const db = readDB();
    const results = {
      students: db.students.filter(s =>
        s.id.toLowerCase().includes(query) ||
        s.name.toLowerCase().includes(query) ||
        (s.class && s.class.toLowerCase().includes(query))
      ).slice(0, 10),
      teachers: db.teachers.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.subject.toLowerCase().includes(query)
      ).slice(0, 10),
      announcements: (db.announcements || []).filter(a =>
        a.title.toLowerCase().includes(query) ||
        a.message.toLowerCase().includes(query)
      ).slice(0, 5)
    };

    res.json({ results });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ success: false, error: "SEARCH_ERROR", message: "Search failed" });
  }
});

// ===== TEACHERS ENDPOINTS =====
app.get("/teachers", (req, res) => {
  try {
    res.json(readDB().teachers || []);
  } catch (err) {
    res.status(500).json({ error: "TEACHERS_READ_ERROR", message: err.message });
  }
});

app.post("/teachers", (req, res) => {
  try {
    const { name, subject } = req.body;

    if (!name || !subject) {
      return res.status(400).json({
        success: false,
        error: "MISSING_FIELDS",
        message: "Name and subject are required",
        fields: ["name", "subject"]
      });
    }

    const db = readDB();
    const newTeacher = {
      id: "T-" + Date.now(),
      name: validators.sanitize(name),
      subject: validators.sanitize(subject)
    };

    db.teachers.push(newTeacher);
    if (!writeDB(db)) throw new Error("Write failed");
    logAction(`👨‍🏫 Faculty registered: ${name}`, "STAFF");
    
    res.json({
      success: true,
      message: "Teacher added successfully",
      teacher: newTeacher
    });
  } catch (err) {
    console.error("Teacher creation error:", err);
    res.status(500).json({
      success: false,
      error: "TEACHER_CREATE_ERROR",
      message: "Server error while adding teacher"
    });
  }
});

app.delete("/teachers/:id", (req, res) => {
  try {
    const db = readDB();
    const before = db.teachers.length;
    db.teachers = db.teachers.filter(t => t.id !== req.params.id);
    
    if (db.teachers.length === before) {
      return res.status(404).json({ success: false, error: "NOT_FOUND", message: "Teacher not found" });
    }
    
    if (!writeDB(db)) throw new Error("Write failed");
    logAction(`Delete teacher: ${req.params.id}`, "STAFF");
    res.json({ success: true, message: "Teacher deleted" });
  } catch (err) {
    res.status(500).json({ error: "TEACHER_DELETE_ERROR", message: err.message });
  }
});

// ===== ATTENDANCE ENDPOINTS =====
app.get("/attendance/:date", (req, res) => {
  try {
    const db = readDB();
    let key = req.params.date;
    if (key === "today") key = new Date().toISOString().split("T")[0];
    if (key === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      key = y.toISOString().split("T")[0];
    }
    res.json(db.attendance[key] || []);
  } catch (err) {
    console.error("Attendance read error:", err);
    res.status(500).json({ error: "ATTENDANCE_READ_ERROR", message: err.message });
  }
});

app.post("/attendance", (req, res) => {
  try {
    const { id, status } = req.body;
    if (!id || !status) {
      return res.status(400).json({
        success: false,
        error: "MISSING_FIELDS",
        message: "ID and status are required"
      });
    }
    
    const db = readDB();
    const today = new Date().toISOString().split("T")[0];
    if (!db.attendance[today]) db.attendance[today] = [];
    
    db.attendance[today] = db.attendance[today].filter(a => a.id !== id);
    db.attendance[today].push({ id, status, time: new Date().toISOString() });
    
    if (!writeDB(db)) throw new Error("Write failed");
    res.json({ success: true, message: "Attendance recorded" });
  } catch (err) {
    res.status(500).json({ error: "ATTENDANCE_ERROR", message: err.message });
  }
});

// ===== FEES ENDPOINTS =====
app.get("/fees", (req, res) => {
  try {
    res.json(readDB().fees || {});
  } catch (err) {
    res.status(500).json({ error: "FEES_READ_ERROR", message: err.message });
  }
});

app.post("/fees", (req, res) => {
  try {
    const { id, amount, month, method = "cash" } = req.body;

    if (!id || !amount || !month) {
      return res.status(400).json({
        success: false,
        error: "MISSING_FIELDS",
        message: "Student ID, amount, and month are required",
        fields: ["id", "amount", "month"]
      });
    }

    if (!validators.isValidAmount(amount)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_AMOUNT",
        message: "Invalid amount (must be 1-9999999)"
      });
    }

    if (!["cash", "bank", "cheque", "online"].includes(method)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_METHOD",
        message: "Invalid payment method"
      });
    }

    const db = readDB();
    const student = db.students.find(s => s.id === id);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: "STUDENT_NOT_FOUND",
        message: "Student not found"
      });
    }

    if (!db.fees[id]) db.fees[id] = [];
    const receipt = `RCP-${Date.now()}`;
    db.fees[id].push({
      amount: Number(amount),
      month: validators.sanitize(month),
      method,
      date: new Date().toISOString(),
      receipt
    });

    if (!writeDB(db)) throw new Error("Write failed");
    logAction(`💰 Fee payment recorded: PKR ${amount} from ${id}`, "FINANCE");
    
    res.json({
      success: true,
      message: "Fee payment recorded successfully",
      receipt
    });
  } catch (err) {
    console.error("Fee recording error:", err);
    res.status(500).json({
      success: false,
      error: "FEE_RECORD_ERROR",
      message: "Server error while recording fee"
    });
  }
});

// ===== RESULTS ENDPOINTS =====
app.get("/results", (req, res) => {
  try {
    res.json(readDB().results || {});
  } catch (err) {
    res.status(500).json({ error: "RESULTS_READ_ERROR", message: err.message });
  }
});

app.post("/results", (req, res) => {
  try {
    const { id, subject, marks, total = 100 } = req.body;

    if (!id || !subject || marks == null) {
      return res.status(400).json({
        success: false,
        error: "MISSING_FIELDS",
        message: "Student ID, subject, and marks are required"
      });
    }

    if (!validators.isValidMarks(marks)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_MARKS",
        message: "Marks must be between 0 and 100"
      });
    }

    if (Number(total) <= 0 || Number(total) > 1000) {
      return res.status(400).json({
        success: false,
        error: "INVALID_TOTAL",
        message: "Invalid total marks"
      });
    }

    const db = readDB();
    const student = db.students.find(s => s.id === id);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: "STUDENT_NOT_FOUND",
        message: "Student not found"
      });
    }

    if (!db.results[id]) db.results[id] = [];
    const percentage = Math.round((marks / total) * 100);
    const grade = percentage >= 90 ? "A+" : percentage >= 80 ? "A" : percentage >= 70 ? "B" : percentage >= 60 ? "C" : "F";

    db.results[id].push({
      subject: validators.sanitize(subject),
      marks: Number(marks),
      total: Number(total),
      percentage,
      grade,
      date: new Date().toISOString()
    });

    if (!writeDB(db)) throw new Error("Write failed");
    logAction(`📊 Result posted: ${id} → ${subject} ${marks}/${total} (${grade})`, "ACADEMIC");
    
    res.json({
      success: true,
      message: "Result recorded successfully",
      result: { subject, marks, total, percentage, grade }
    });
  } catch (err) {
    console.error("Result recording error:", err);
    res.status(500).json({
      success: false,
      error: "RESULT_RECORD_ERROR",
      message: "Server error while recording result"
    });
  }
});

// ===== TIMETABLE ENDPOINTS =====
app.get("/timetable", (req, res) => {
  try {
    res.json(readDB().timetable || {});
  } catch (err) {
    res.status(500).json({ error: "TIMETABLE_READ_ERROR", message: err.message });
  }
});

app.post("/timetable", (req, res) => {
  try {
    const { className, subject, day, time } = req.body;
    if (!className || !subject || !day || !time) {
      return res.status(400).json({
        success: false,
        error: "MISSING_FIELDS",
        message: "All fields are required"
      });
    }

    const db = readDB();
    if (!db.timetable[className]) db.timetable[className] = [];
    db.timetable[className].push({ subject, day, time });
    
    if (!writeDB(db)) throw new Error("Write failed");
    logAction(`📅 Timetable updated: ${className} — ${day} ${subject}`, "SYSTEM");
    res.json({ success: true, message: "Schedule added" });
  } catch (err) {
    res.status(500).json({ error: "TIMETABLE_ERROR", message: err.message });
  }
});

// ===== ANNOUNCEMENTS ENDPOINTS =====
app.get("/announcements", (req, res) => {
  try {
    res.json(readDB().announcements || []);
  } catch (err) {
    res.status(500).json({ error: "ANNOUNCEMENTS_READ_ERROR", message: err.message });
  }
});

app.post("/announcements", (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: "MISSING_FIELDS",
        message: "Title and message are required"
      });
    }

    const db = readDB();
    db.announcements.unshift({
      id: Date.now(),
      title,
      message,
      priority: req.body.priority || "normal",
      target: req.body.target || "all",
      time: new Date().toISOString()
    });
    
    if (!writeDB(db)) throw new Error("Write failed");
    logAction(`📢 Notice published: ${title}`, "BROADCAST");
    res.json({ success: true, message: "Announcement posted" });
  } catch (err) {
    res.status(500).json({ error: "ANNOUNCEMENT_ERROR", message: err.message });
  }
});

// ===== LOGS ENDPOINT =====
app.get("/logs", (req, res) => {
  try {
    const db = readDB();
    res.json(db.logs || []);
  } catch (err) {
    res.status(500).json({ error: "LOGS_READ_ERROR", message: err.message });
  }
});

// ===== DATA EXPORT =====
app.get("/export", (req, res) => {
  try {
    const db = readDB();
    const filename = `yasrab_backup_${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    logAction("💾 System backup exported", "SYSTEM");
    res.send(JSON.stringify(db, null, 2));
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "EXPORT_ERROR", message: err.message });
  }
});

// ===== FALLBACK SPA ROUTE =====
app.get("*", (req, res) => {
  const frontendIndex = path.resolve(__dirname, "../frontend/index.html");
  if (fs.existsSync(frontendIndex)) {
    res.sendFile(frontendIndex);
  } else {
    res.status(404).json({
      error: "NOT_FOUND",
      message: "Frontend not found. Serve index.html separately or place it in the frontend/ folder."
    });
  }
});

// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  
  errorLog.push({
    timestamp: new Date().toISOString(),
    error: err.message,
    stack: NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });
  
  if (errorLog.length > 500) errorLog.shift();

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: NODE_ENV === 'development' ? err.message : "An error occurred",
    timestamp: new Date().toISOString(),
    requestId: req.requestId
  });
});

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
    availableEndpoints: "/health, /status, /login, /stats, /students, /teachers, /admissions, /attendance, /fees, /results, /timetable, /announcements, /config, /logs, /search, /export"
  });
});

// ===== SERVER START =====
const server = app.listen(PORT, () => {
  console.log(`\n✨ Yasrab ERP running at http://localhost:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
  console.log(`🔐 Default Login: ${process.env.ADMIN_USERNAME || "admin"} / ****`);
  console.log(`🌐 API Documentation available at http://localhost:${PORT}/health\n`);
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// ===== UNCAUGHT EXCEPTION HANDLER =====
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  logAction(`CRITICAL: Uncaught exception: ${err.message}`, "ERROR");
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logAction(`CRITICAL: Unhandled rejection: ${reason}`, "ERROR");
});

module.exports = app;
