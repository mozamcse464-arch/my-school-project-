require("dotenv").config();
const express = require("express");
const fs = require("fs").promises;
const fsSync = require("fs");
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
async function initDB() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });

    if (!fsSync.existsSync(DB_PATH)) {
      await fs.writeFile(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
      console.log("✅ Fresh database initialized");
      return;
    }

    const data = await fs.readFile(DB_PATH, "utf8");
    const existing = JSON.parse(data);
    let changed = false;

    for (const key of Object.keys(DEFAULT_DB)) {
      if (!(key in existing)) {
        existing[key] = DEFAULT_DB[key];
        changed = true;
      }
    }

    if (changed) {
      await fs.writeFile(DB_PATH, JSON.stringify(existing, null, 2));
      console.log("✅ Database migrated successfully");
    }
  } catch (err) {
    console.error("❌ DB init error:", err.message);
    throw err;
  }
}

async function readDB() {
  try {
    const data = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ DB read error:", err.message);
    return { ...DEFAULT_DB };
  }
}

async function writeDB(data) {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("❌ DB write error:", err.message);
    return false;
  }
}

async function logAction(action, type = "SYSTEM", userId = "system") {
  try {
    const db = await readDB();
    db.logs.unshift({
      id: Date.now(),
      action,
      type,
      userId,
      time: new Date().toISOString()
    });
    if (db.logs.length > 1000) db.logs = db.logs.slice(0, 1000);
    await writeDB(db);
  } catch (err) {
    console.error("❌ Log error:", err.message);
  }
}

// ===== INITIALIZE DATABASE =====
initDB().catch(err => {
  console.error("Failed to initialize database. Exiting...");
  process.exit(1);
});

// ===== HEALTH & STATUS ENDPOINTS =====
app.get("/health", async (req, res) => {
  try {
    const db = await readDB();
    res.json({
      status: "✅ OK",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        records: {
          students: db.students?.length || 0,
          teachers: db.teachers?.length || 0,
          logs: db.logs?.length || 0
        }
      }
    });
  } catch (err) {
    res.status(500).json({ status: "❌ ERROR", message: err.message });
  }
});

app.get("/status", async (req, res) => {
  try {
    const db = await readDB();
    res.json({
      serverStatus: "Running",
      databaseStatus: "Connected",
      statistics: {
        totalStudents: db.students?.length || 0,
        totalTeachers: db.teachers?.length || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: "STATUS_ERROR", message: err.message });
  }
});

// ===== AUTHENTICATION ENDPOINTS =====
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const adminUser = process.env.ADMIN_USERNAME || "admin";
    const adminPass = process.env.ADMIN_PASSWORD || "1234";

    if (username === adminUser && password === adminPass) {
      const token = createToken({ username, role: "admin", id: Date.now() });
      await logAction(`✅ Admin login successful: ${username}`, "AUTH", username);
      
      return res.json({
        success: true,
        token,
        role: "admin",
        user: { username, id: "admin" },
        message: "Login successful"
      });
    }

    await logAction(`❌ Failed login attempt: ${username}`, "SECURITY", username);
    res.status(401).json({ success: false, message: "Invalid username or password" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error during authentication" });
  }
});

// ===== MIDDLEWARE - AUTH CHECK =====
app.use((req, res, next) => {
  if (req.path === '/login' || req.path === '/health' || req.path === '/status' || req.path === '/') {
    return next();
  }
  verifyToken(req, res, next);
});

// ===== CONFIG ENDPOINTS =====
app.get("/config", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.config || DEFAULT_DB.config);
  } catch (err) {
    res.status(500).json({ error: "CONFIG_READ_ERROR", message: err.message });
  }
});

app.patch("/config", async (req, res) => {
  try {
    const db = await readDB();
    db.config = { ...db.config, ...req.body };
    await writeDB(db);
    await logAction("🔧 School configuration updated", "SYSTEM");
    res.json({ success: true, message: "Configuration updated", config: db.config });
  } catch (err) {
    res.status(500).json({ error: "CONFIG_UPDATE_ERROR", message: err.message });
  }
});

// ===== DASHBOARD STATS =====
app.get("/stats", async (req, res) => {
  try {
    const db = await readDB();
    const totalFees = Object.values(db.fees || {})
      .flat()
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

    res.json({
      students: db.students.length,
      teachers: db.teachers.length,
      admissions: (db.admissions || []).filter(a => a.status === "pending").length,
      fees: totalFees,
      recentLogs: (db.logs || []).slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({ error: "STATS_ERROR", message: err.message });
  }
});

// ===== ADMISSIONS ENDPOINTS =====
app.get("/admissions", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.admissions || []);
  } catch (err) {
    res.status(500).json({ error: "ADMISSIONS_READ_ERROR", message: err.message });
  }
});

app.post("/admissions", async (req, res) => {
  try {
    const db = await readDB();
    const newAdm = {
      id: "ADM-" + Date.now(),
      ...req.body,
      status: "pending",
      date: new Date().toISOString()
    };
    db.admissions.unshift(newAdm);
    await writeDB(db);
    await logAction(`📝 Admission application: ${req.body.name}`, "REGISTRY");
    res.json({ success: true, message: "Application submitted", admission: newAdm });
  } catch (err) {
    res.status(500).json({ error: "ADMISSIONS_CREATE_ERROR", message: err.message });
  }
});

app.patch("/admissions/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const db = await readDB();
    const idx = db.admissions.findIndex(a => a.id === req.params.id);

    if (idx === -1) {
      return res.status(404).json({
        success: false,
        error: "ADMISSION_NOT_FOUND",
        message: "Application not found"
      });
    }

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "Status must be approved, rejected, or pending"
      });
    }

    db.admissions[idx].status = status;

    if (status === "approved") {
      const adm = db.admissions[idx];

      const existingByName = db.students.find(s => s.name.toLowerCase() === adm.name.toLowerCase());
      if (existingByName) {
        return res.status(409).json({
          success: false,
          error: "DUPLICATE_NAME",
          message: `Student "${adm.name}" is already enrolled (ID: ${existingByName.id}). Cannot enroll again.`
        });
      }

      db.students.push({
        id: "S-" + Date.now().toString().slice(-6),
        name: adm.name,
        class: adm.class,
        phone: adm.phone || "",
        address: adm.address || "",
        status: "active",
        enrolledDate: new Date().toISOString()
      });

      await logAction(`✅ Admission approved: ${adm.name}`, "REGISTRY");
    } else if (status === "rejected") {
      await logAction(`❌ Admission rejected: ${db.admissions[idx].name}`, "REGISTRY");
    }

    await writeDB(db);
    res.json({ success: true, message: `Application ${status}` });
  } catch (err) {
    console.error("Admission update error:", err);
    res.status(500).json({ error: "ADMISSIONS_UPDATE_ERROR", message: err.message });
  }
});

// ===== STUDENTS ENDPOINTS =====
app.get("/students", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.students || []);
  } catch (err) {
    res.status(500).json({ error: "STUDENTS_READ_ERROR", message: err.message });
  }
});

app.post("/students", async (req, res) => {
  try {
    const db = await readDB();
    const { id, name, class: cls, phone, address } = req.body;

    if (!id || !name || !cls) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Student ID, name, and class are required"
      });
    }

    if (!validators.isValidStudentId(id)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_ID_FORMAT",
        message: "Student ID must be 1-20 alphanumeric characters"
      });
    }

    if (!validators.isValidName(name)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_NAME_FORMAT",
        message: "Name must contain 2-100 letters only"
      });
    }

    if (!validators.isValidClass(cls)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CLASS",
        message: "Invalid class format"
      });
    }

    if (phone && !validators.isValidPhone(phone)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PHONE",
        message: "Invalid phone number format"
      });
    }

    const existingById = db.students.find(s => s.id === id);
    if (existingById) {
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_ID",
        message: `Student with ID "${id}" already exists`
      });
    }

    const existingByName = db.students.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (existingByName) {
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_NAME",
        message: `Student "${name}" already enrolled in the system (ID: ${existingByName.id})`
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
    await writeDB(db);
    await logAction(`📚 Student enrolled: ${name} (${id})`, "REGISTRY");

    res.status(201).json({
      success: true,
      message: "Student registered successfully",
      student: newStudent
    });
  } catch (err) {
    console.error("Student creation error:", err);
    res.status(500).json({
      success: false,
      error: "STUDENT_CREATE_ERROR",
      message: "Failed to register student"
    });
  }
});

app.delete("/students/:id", async (req, res) => {
  try {
    const db = await readDB();
    db.students = db.students.filter(s => s.id !== req.params.id);
    await writeDB(db);
    await logAction(`🗑️ Student record deleted: ${req.params.id}`, "SECURITY");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "STUDENT_DELETE_ERROR", message: err.message });
  }
});

// ===== TEACHERS ENDPOINTS =====
app.get("/teachers", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.teachers || []);
  } catch (err) {
    res.status(500).json({ error: "TEACHERS_READ_ERROR", message: err.message });
  }
});

app.post("/teachers", async (req, res) => {
  try {
    const { name, subject } = req.body;
    const db = await readDB();

    if (!name || !subject) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Name and subject are required"
      });
    }

    if (!validators.isValidName(name)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_NAME_FORMAT",
        message: "Name must contain 2-100 letters only"
      });
    }

    const existingTeacher = db.teachers.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existingTeacher) {
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_TEACHER",
        message: `Teacher "${name}" is already registered in the system (ID: ${existingTeacher.id})`
      });
    }

    const newTeacher = {
      id: "T-" + Date.now(),
      name: validators.sanitize(name),
      subject: validators.sanitize(subject)
    };

    db.teachers.push(newTeacher);
    await writeDB(db);
    await logAction(`👨‍🏫 Faculty registered: ${name}`, "STAFF");

    res.status(201).json({
      success: true,
      message: "Teacher added successfully",
      teacher: newTeacher
    });
  } catch (err) {
    console.error("Teacher creation error:", err);
    res.status(500).json({
      success: false,
      error: "TEACHER_CREATE_ERROR",
      message: "Failed to register teacher"
    });
  }
});

app.delete("/teachers/:id", async (req, res) => {
  try {
    const db = await readDB();
    const teacher = db.teachers.find(t => t.id === req.params.id);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        error: "TEACHER_NOT_FOUND",
        message: "Teacher not found"
      });
    }
    db.teachers = db.teachers.filter(t => t.id !== req.params.id);
    await writeDB(db);
    await logAction(`🗑️ Teacher removed: ${teacher.name}`, "STAFF");
    res.json({ success: true, message: "Teacher record deleted" });
  } catch (err) {
    res.status(500).json({ error: "TEACHER_DELETE_ERROR", message: err.message });
  }
});

// ===== ATTENDANCE ENDPOINTS =====
app.get("/attendance/:date", async (req, res) => {
  try {
    const db = await readDB();
    let key = req.params.date;
    if (key === "today") key = new Date().toISOString().split("T")[0];
    res.json(db.attendance[key] || []);
  } catch (err) {
    res.status(500).json({ error: "ATTENDANCE_READ_ERROR", message: err.message });
  }
});

app.post("/attendance", async (req, res) => {
  try {
    const { id, status } = req.body;
    const db = await readDB();

    if (!id || !status) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Student ID and status are required"
      });
    }

    const validStatuses = ["present", "absent", "leave"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: `Status must be one of: ${validStatuses.join(", ")}`
      });
    }

    const student = db.students.find(s => s.id === id);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: "STUDENT_NOT_FOUND",
        message: `Student with ID "${id}" does not exist`
      });
    }

    const today = new Date().toISOString().split("T")[0];
    if (!db.attendance[today]) db.attendance[today] = [];
    db.attendance[today] = db.attendance[today].filter(a => a.id !== id);
    db.attendance[today].push({ id, status, time: new Date().toISOString() });
    await writeDB(db);
    await logAction(`📋 Attendance marked: ${id} - ${status}`, "REGISTRY");
    res.json({ success: true, message: "Attendance recorded" });
  } catch (err) {
    console.error("Attendance error:", err);
    res.status(500).json({ error: "ATTENDANCE_ERROR", message: err.message });
  }
});

// ===== FEES ENDPOINTS =====
app.get("/fees", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.fees || {});
  } catch (err) {
    res.status(500).json({ error: "FEES_READ_ERROR", message: err.message });
  }
});

app.post("/fees", async (req, res) => {
  try {
    const { id, amount, month, method } = req.body;
    const db = await readDB();

    if (!id || !amount || !month || !method) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Student ID, amount, month, and method are required"
      });
    }

    if (!validators.isValidAmount(amount)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_AMOUNT",
        message: "Amount must be between 1 and 10000000"
      });
    }

    const student = db.students.find(s => s.id === id);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: "STUDENT_NOT_FOUND",
        message: `Student with ID "${id}" does not exist`
      });
    }

    if (!db.fees[id]) db.fees[id] = [];

    const monthExists = db.fees[id].find(f => f.month === month);
    if (monthExists) {
      return res.status(409).json({
        success: false,
        error: "DUPLICATE_FEE",
        message: `Fee for ${month} has already been recorded for student ${id}. Cannot add duplicate payment.`,
        existingRecord: monthExists
      });
    }

    const receipt = `RCP-${Date.now()}`;
    const feeRecord = {
      amount: Number(amount),
      month: validators.sanitize(month),
      method: validators.sanitize(method),
      date: new Date().toISOString(),
      receipt
    };

    db.fees[id].push(feeRecord);
    await writeDB(db);
    await logAction(`💰 Fee payment: PKR ${amount} from ${id} for ${month}`, "FINANCE");

    res.status(201).json({
      success: true,
      message: "Fee payment recorded successfully",
      receipt,
      feeRecord
    });
  } catch (err) {
    console.error("Fee creation error:", err);
    res.status(500).json({
      success: false,
      error: "FEE_ERROR",
      message: "Failed to record fee payment"
    });
  }
});

// ===== RESULTS ENDPOINTS =====
app.get("/results", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.results || {});
  } catch (err) {
    res.status(500).json({ error: "RESULTS_READ_ERROR", message: err.message });
  }
});

app.post("/results", async (req, res) => {
  try {
    const { id, subject, marks, total } = req.body;
    const db = await readDB();

    if (!id || !subject || marks === "" || !total) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Student ID, subject, marks, and total are required"
      });
    }

    if (!validators.isValidMarks(marks)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_MARKS",
        message: "Marks must be between 0 and 100"
      });
    }

    if (!validators.isValidMarks(total) || total <= 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_TOTAL",
        message: "Total marks must be greater than 0"
      });
    }

    if (marks > total) {
      return res.status(400).json({
        success: false,
        error: "INVALID_MARKS",
        message: "Obtained marks cannot exceed total marks"
      });
    }

    const student = db.students.find(s => s.id === id);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: "STUDENT_NOT_FOUND",
        message: `Student with ID "${id}" does not exist`
      });
    }

    if (!db.results[id]) db.results[id] = [];

    const percentage = Math.round((marks / total) * 100);
    const grade = percentage >= 90 ? "A+" : percentage >= 80 ? "A" : percentage >= 70 ? "B" : percentage >= 60 ? "C" : "F";

    const resultRecord = {
      subject: validators.sanitize(subject),
      marks: Number(marks),
      total: Number(total),
      percentage,
      grade,
      date: new Date().toISOString()
    };

    db.results[id].push(resultRecord);
    await writeDB(db);
    await logAction(`📊 Result posted: ${id} - ${subject} (${marks}/${total})`, "ACADEMIC");

    res.status(201).json({
      success: true,
      message: "Result published successfully",
      result: resultRecord
    });
  } catch (err) {
    console.error("Result creation error:", err);
    res.status(500).json({
      success: false,
      error: "RESULT_ERROR",
      message: "Failed to publish result"
    });
  }
});

// ===== TIMETABLE ENDPOINTS =====
app.get("/timetable", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.timetable || {});
  } catch (err) {
    res.status(500).json({ error: "TIMETABLE_READ_ERROR", message: err.message });
  }
});

app.post("/timetable", async (req, res) => {
  try {
    const { className, subject, day, time } = req.body;
    const db = await readDB();
    if (!db.timetable[className]) db.timetable[className] = [];
    db.timetable[className].push({ subject, day, time });
    await writeDB(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "TIMETABLE_ERROR", message: err.message });
  }
});

// ===== ANNOUNCEMENTS ENDPOINTS =====
app.get("/announcements", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.announcements || []);
  } catch (err) {
    res.status(500).json({ error: "ANNOUNCEMENTS_READ_ERROR", message: err.message });
  }
});

app.post("/announcements", async (req, res) => {
  try {
    const db = await readDB();
    db.announcements.unshift({ id: Date.now(), ...req.body, time: new Date().toISOString() });
    await writeDB(db);
    await logAction(`📢 Notice: ${req.body.title}`, "BROADCAST");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "ANNOUNCEMENT_ERROR", message: err.message });
  }
});

// ===== LOGS ENDPOINT =====
app.get("/logs", async (req, res) => {
  try {
    const db = await readDB();
    res.json(db.logs || []);
  } catch (err) {
    res.status(500).json({ error: "LOGS_READ_ERROR", message: err.message });
  }
});

// ===== SEARCH ENDPOINT =====
app.get("/search", async (req, res) => {
  try {
    const query = String(req.query.q || "").toLowerCase();
    const db = await readDB();
    res.json({
      results: {
        students: db.students.filter(s => s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query)),
        teachers: db.teachers.filter(t => t.name.toLowerCase().includes(query))
      }
    });
  } catch (err) {
    res.status(500).json({ error: "SEARCH_ERROR" });
  }
});

// ===== FALLBACK =====
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/index.html"));
});

// ===== SERVER START =====
app.listen(PORT, () => {
  console.log(`✨ Yasrab ERP running at http://localhost:${PORT}`);
});
