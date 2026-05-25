require("dotenv").config();
const express = require("express");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const cors = require("cors");
const { createToken, createRefreshToken, verifyToken, verifyRefreshToken, revokeToken } = require("./auth");

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

// ===== MIDDLEWARE - SECURITY HEADERS =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; img-src 'self' data:;");
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

// ===== UTILITIES =====
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Simple lock to prevent concurrent DB writes
let isDbLocked = false;
const dbQueue = [];

async function processDbQueue() {
  if (isDbLocked || dbQueue.length === 0) return;
  isDbLocked = true;
  const { operation, resolve, reject } = dbQueue.shift();
  try {
    const result = await operation();
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    isDbLocked = false;
    processDbQueue();
  }
}

function runInDbQueue(operation) {
  return new Promise((resolve, reject) => {
    dbQueue.push({ operation, resolve, reject });
    processDbQueue();
  });
}

// ===== VALIDATION HELPERS =====
const validators = {
  isValidStudentId: (id) => /^[A-Za-z0-9\-]{1,20}$/.test(String(id || '').trim()),
  isValidName: (name) => /^[A-Za-z\s]{2,100}$/.test(String(name || '').trim()),
  isValidClass: (cls) => /^[0-9A-Za-z\- ]{1,20}$/.test(String(cls || '').trim()),
  isValidEmail: (email) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(String(email || '').trim()),
  isValidPhone: (phone) => /^(\+92|0|92)[0-9]{9,12}$/.test(String(phone || '').replace(/[\s\-\(\)]/g, '')),
  isValidAmount: (amount) => Number(amount) > 0 && Number(amount) < 10000000,
  isValidMarks: (marks) => Number(marks) >= 0 && Number(marks) <= 100,
  isValidMonth: (month) => /^(January|February|March|April|May|June|July|August|September|October|November|December)$/i.test(String(month || '').trim()),
  isValidPaymentMethod: (method) => ['cash', 'bank', 'cheque', 'online', 'card', 'mobile'].includes(String(method || '').toLowerCase()),
  isValidPriority: (priority) => ['normal', 'high'].includes(String(priority || '').toLowerCase()),
  isValidStatus: (status) => ['pending', 'approved', 'rejected', 'present', 'absent', 'leave'].includes(String(status || '').toLowerCase()),
  isValidDay: (day) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(String(day || '')),
  isValidTime: (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(time || '')),
  isValidDate: (dateStr) => /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || '')) && !Number.isNaN(new Date(dateStr).getTime()),
  sanitize: (str) => String(str || '').trim().slice(0, 500),
  normalize: (str) => String(str || '').trim().replace(/\s+/g, ' '),
  isSafe: (text) => !/<script|onerror|onload|javascript:/i.test(String(text))
};

// ===== ERROR CLASSES =====
class AppError extends Error {
  constructor(message, statusCode, code, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ===== VALIDATION MIDDLEWARE =====
const validate = (schema) => (req, res, next) => {
  const errors = {};
  Object.keys(schema).forEach(key => {
    const value = req.body[key];
    const rule = schema[key];
    
    if (rule.required && (value === undefined || value === null || String(value).trim() === '')) {
      errors[key] = `${key} is required`;
    } else if (value !== undefined && value !== null) {
      if (rule.validator && !rule.validator(value)) {
        errors[key] = rule.message || `Invalid ${key}`;
      }
    }
  });

  if (Object.keys(errors).length > 0) {
    return next(new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors));
  }
  next();
};

function sendError(res, status, code, message, details = null) {
  const payload = { success: false, error: code, message };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}

function sendSuccess(res, data = {}) {
  return res.json({ success: true, ...data });
}

function normalizeString(value) {
  return validators.normalize(value);
}

function parseDateKey(dateStr) {
  if (!dateStr || dateStr === 'today') return new Date().toISOString().split('T')[0];
  return String(dateStr).trim();
}

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
async function createBackup() {
  try {
    const backupDir = path.resolve(path.dirname(DB_PATH), "backups");
    if (!fsSync.existsSync(backupDir)) fsSync.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `db-backup-${timestamp}.json`);
    
    await fs.copyFile(DB_PATH, backupPath);
    
    // Keep only last 10 backups
    const files = await fs.readdir(backupDir);
    const backups = files
      .filter(f => f.startsWith("db-backup-"))
      .sort()
      .reverse();
    
    if (backups.length > 10) {
      for (let i = 10; i < backups.length; i++) {
        await fs.unlink(path.join(backupDir, backups[i]));
      }
    }
    return backupPath;
  } catch (err) {
    console.error("❌ Backup failed:", err.message);
    return null;
  }
}

async function initDB() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });

    if (!fsSync.existsSync(DB_PATH)) {
      await fs.writeFile(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
      console.log("✅ Fresh database initialized at", DB_PATH);
      return;
    }

    // Verify integrity
    const data = await fs.readFile(DB_PATH, "utf8");
    let existing;
    try {
      existing = JSON.parse(data);
    } catch (e) {
      console.error("❌ Corrupt database detected. Attempting to restore from latest backup...");
      // In a real app, we'd look for the latest backup here.
      // For now, we'll just rename the corrupt file and start fresh.
      const corruptPath = `${DB_PATH}.corrupt.${Date.now()}`;
      await fs.rename(DB_PATH, corruptPath);
      await fs.writeFile(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
      return;
    }

    let changed = false;
    for (const key of Object.keys(DEFAULT_DB)) {
      if (!(key in existing)) {
        existing[key] = DEFAULT_DB[key];
        changed = true;
      }
    }

    if (changed) {
      await fs.writeFile(DB_PATH, JSON.stringify(existing, null, 2));
      console.log("✅ Database schema migrated");
    }
  } catch (err) {
    console.error("❌ DB init error:", err.message);
    throw err;
  }
}

async function readDB() {
  return runInDbQueue(async () => {
    try {
      const data = await fs.readFile(DB_PATH, "utf8");
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') return { ...DEFAULT_DB };
      throw new AppError('Failed to read database', 500, 'DB_READ_ERROR');
    }
  });
}

async function writeDB(data) {
  return runInDbQueue(async () => {
    let tempPath;
    try {
      if (!data || typeof data !== 'object') throw new Error('Invalid data format');
      
      tempPath = `${DB_PATH}.${Date.now()}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tempPath, DB_PATH);
      return true;
    } catch (err) {
      console.error('❌ DB write error:', err.message);
      if (tempPath && fsSync.existsSync(tempPath)) await fs.unlink(tempPath).catch(() => {});
      throw new AppError('Failed to save changes to database', 500, 'DB_WRITE_ERROR');
    }
  });
}

// Transaction helper for read-modify-write operations
async function transaction(fn) {
  return runInDbQueue(async () => {
    let data;
    try {
      const raw = await fs.readFile(DB_PATH, "utf8");
      data = JSON.parse(raw);
    } catch (err) {
      if (err.code === 'ENOENT') data = { ...DEFAULT_DB };
      else throw new AppError('Failed to read database', 500, 'DB_READ_ERROR');
    }

    const modifiedData = await fn(data);
    
    let tempPath;
    try {
      tempPath = `${DB_PATH}.${Date.now()}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(modifiedData, null, 2), 'utf8');
      await fs.rename(tempPath, DB_PATH);
      return modifiedData;
    } catch (err) {
      if (tempPath && fsSync.existsSync(tempPath)) await fs.unlink(tempPath).catch(() => {});
      throw new AppError('Failed to save transaction changes', 500, 'DB_WRITE_ERROR');
    }
  });
}

async function logAction(action, type = "SYSTEM", userId = "system", db = null) {
  try {
    if (db) {
      db.logs.unshift({
        id: Date.now(),
        action,
        type,
        userId,
        time: new Date().toISOString()
      });
      if (db.logs.length > 1000) db.logs = db.logs.slice(0, 1000);
      return;
    }

    await transaction(async (data) => {
      data.logs.unshift({
        id: Date.now(),
        action,
        type,
        userId,
        time: new Date().toISOString()
      });
      if (data.logs.length > 1000) data.logs = data.logs.slice(0, 1000);
      return data;
    });
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

// ===== RATE LIMITING (Basic Implementation) =====
const loginAttempts = new Map();
const rateLimit = (max, windowMs) => (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const userData = loginAttempts.get(ip) || { count: 0, last: now };

  if (now - userData.last > windowMs) {
    userData.count = 0;
  }

  userData.count++;
  userData.last = now;
  loginAttempts.set(ip, userData);

  if (userData.count > max) {
    return sendError(res, 429, 'TOO_MANY_REQUESTS', 'Too many attempts. Please try again later.');
  }
  next();
};

// ===== AUTHENTICATION ENDPOINTS =====
app.post("/login", rateLimit(5, 60000), catchAsync(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!username || !password) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Username and password are required');
  }

  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "1234";

  if (username === adminUser && password === adminPass) {
    const user = { username, role: "admin", id: Date.now() };
    const accessToken = createToken(user);
    const refreshToken = createRefreshToken(user);

    await logAction(`✅ Admin login successful: ${username}`, "AUTH", username);

    return sendSuccess(res, {
      accessToken,
      refreshToken,
      role: "admin",
      user: { username, id: "admin" },
      expiresIn: 86400,
      message: "Login successful"
    });
  }

  await logAction(`❌ Failed login attempt: ${username}`, "SECURITY", username);
  return sendError(res, 401, 'AUTH_FAILED', 'Invalid username or password');
}));

app.post("/refresh-token", rateLimit(10, 60000), catchAsync(async (req, res) => {
  const refreshToken = req.body.refreshToken || req.headers['x-refresh-token'];
  if (!refreshToken) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Refresh token is required');
  }

  const decoded = verifyRefreshToken(refreshToken);
  const user = { username: decoded.username, role: decoded.role, id: decoded.id };
  const newAccessToken = createToken(user);

  return sendSuccess(res, {
    accessToken: newAccessToken,
    expiresIn: 86400,
    message: "Token refreshed successfully"
  });
}));

app.post("/logout", catchAsync(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    revokeToken(token);
    await logAction(`👋 Admin logout: ${req.user?.username}`, "AUTH", req.user?.username);
  }

  return sendSuccess(res, { message: "Logged out successfully" });
}));

// ===== MIDDLEWARE - AUTH CHECK =====
app.use((req, res, next) => {
  if (req.path === '/login' || req.path === '/health' || req.path === '/status' || req.path === '/') {
    return next();
  }
  verifyToken(req, res, next);
});

// ===== CONFIG ENDPOINTS =====
app.get("/config", catchAsync(async (req, res) => {
  const db = await readDB();
  res.json(db.config || DEFAULT_DB.config);
}));

app.patch("/config", catchAsync(async (req, res) => {
  const payload = {
    schoolName: normalizeString(req.body.schoolName || ''),
    address: normalizeString(req.body.address || ''),
    contact: normalizeString(req.body.contact || ''),
    email: String(req.body.email || '').trim()
  };

  if (!payload.schoolName || !payload.address || !payload.contact || !payload.email) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'All configuration fields are required');
  }

  if (!validators.isValidEmail(payload.email)) {
    return sendError(res, 400, 'INVALID_EMAIL', 'A valid school email address is required');
  }

  if (!validators.isValidPhone(payload.contact)) {
    return sendError(res, 400, 'INVALID_PHONE', 'A valid contact number is required');
  }

  const db = await transaction(async (data) => {
    data.config = { ...data.config, ...payload };
    return data;
  });

  await logAction("🔧 School configuration updated", "SYSTEM");
  return sendSuccess(res, { message: "Configuration updated", config: db.config });
}));

// ===== DASHBOARD STATS =====
app.get("/stats", catchAsync(async (req, res) => {
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
}));

// ===== ADMISSIONS ENDPOINTS =====
app.get("/admissions", catchAsync(async (req, res) => {
  const db = await readDB();
  res.json(db.admissions || []);
}));

app.post("/admissions", catchAsync(async (req, res) => {
  const name = normalizeString(req.body.name || '');
  const cls = normalizeString(req.body.class || '');
  const phone = String(req.body.phone || '').trim();
  const address = normalizeString(req.body.address || '');

  if (!name || !cls) {
    throw new AppError('Student name and target class are required', 400, 'VALIDATION_ERROR');
  }

  if (!validators.isValidName(name)) {
    throw new AppError('Name must contain 2-100 letters only', 400, 'INVALID_NAME_FORMAT');
  }

  if (!validators.isValidClass(cls)) {
    throw new AppError('Target class uses an invalid format', 400, 'INVALID_CLASS');
  }

  if (phone && !validators.isValidPhone(phone)) {
    throw new AppError('Invalid phone number format', 400, 'INVALID_PHONE');
  }

  const newAdm = {
    id: `ADM-${Date.now()}`,
    name,
    class: cls,
    phone: phone || '',
    address: address || '',
    status: 'pending',
    date: new Date().toISOString()
  };

  await transaction(async (db) => {
    const existingPending = db.admissions.find(a => a.name.toLowerCase() === name.toLowerCase() && a.status === 'pending');
    if (existingPending) throw new AppError(`An application for ${name} is already pending approval`, 409, 'DUPLICATE_APPLICATION');

    const existingStudent = db.students.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (existingStudent) throw new AppError(`Student ${name} is already enrolled (ID: ${existingStudent.id})`, 409, 'ALREADY_ENROLLED');

    db.admissions.unshift(newAdm);
    return db;
  });

  await logAction(`📝 Admission application: ${name}`, 'REGISTRY');
  return sendSuccess(res, { message: 'Application submitted', admission: newAdm });
}));

app.patch("/admissions/:id", catchAsync(async (req, res) => {
  const status = String(req.body.status || '').toLowerCase();
  
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    throw new AppError('Status must be approved, rejected, or pending', 400, 'INVALID_STATUS');
  }

  await transaction(async (db) => {
    const idx = db.admissions.findIndex(a => a.id === req.params.id);
    if (idx === -1) throw new AppError('Application not found', 404, 'ADMISSION_NOT_FOUND');

    const admission = db.admissions[idx];
    if (admission.status === status) return db;

    admission.status = status;

    if (status === 'approved') {
      const existingByName = db.students.find(s => s.name.toLowerCase() === admission.name.toLowerCase());
      if (existingByName) throw new AppError(`Student ${admission.name} is already enrolled (ID: ${existingByName.id}).`, 409, 'DUPLICATE_NAME');

      const newStudent = {
        id: `S-${Date.now().toString().slice(-6)}`,
        name: admission.name,
        class: admission.class,
        phone: admission.phone || '',
        address: admission.address || '',
        status: 'active',
        enrolledDate: new Date().toISOString()
      };
      db.students.push(newStudent);
      await logAction(`✅ Admission approved: ${admission.name}`, 'REGISTRY', req.user?.username, db);
    } else if (status === 'rejected') {
      await logAction(`❌ Admission rejected: ${admission.name}`, 'REGISTRY', req.user?.username, db);
    }
    return db;
  });

  return sendSuccess(res, { message: `Application ${status}` });
}));

// ===== VALIDATION SCHEMAS =====
const studentSchema = {
  id: { required: true, validator: validators.isValidStudentId, message: 'Student ID must be 1-20 alphanumeric characters' },
  name: { required: true, validator: validators.isValidName, message: 'Name must be 2-100 letters only' },
  class: { required: true, validator: validators.isValidClass, message: 'Invalid class format' },
  phone: { required: false, validator: val => !val || validators.isValidPhone(val), message: 'Invalid phone number format' }
};

const studentUpdateSchema = {
  name: { required: false, validator: validators.isValidName, message: 'Name must be 2-100 letters only' },
  class: { required: false, validator: validators.isValidClass, message: 'Invalid class format' },
  phone: { required: false, validator: val => !val || validators.isValidPhone(val), message: 'Invalid phone number format' }
};

// ===== STUDENTS ENDPOINTS =====
app.get("/students", catchAsync(async (req, res) => {
  const db = await readDB();
  res.json(db.students || []);
}));

app.post("/students", validate(studentSchema), catchAsync(async (req, res) => {
  const { id, name, class: cls, phone, address } = req.body;
  
  const newStudent = {
    id: validators.sanitize(id),
    name: validators.sanitize(name),
    class: validators.sanitize(cls),
    phone: phone ? validators.sanitize(phone) : '',
    address: address ? validators.sanitize(address) : '',
    status: 'active',
    enrolledDate: new Date().toISOString()
  };

  await transaction(async (db) => {
    if (db.students.some(s => s.id === id)) {
      throw new AppError(`Student with ID "${id}" already exists`, 409, 'DUPLICATE_ID');
    }
    db.students.push(newStudent);
    return db;
  });

  await logAction(`📚 Student enrolled: ${name} (${id})`, 'REGISTRY', req.user?.username);

  return res.status(201).json({
    success: true,
    message: 'Student registered successfully',
    student: newStudent
  });
}));

app.patch("/students/:id", validate(studentUpdateSchema), catchAsync(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const result = await transaction(async (db) => {
    const idx = db.students.findIndex(s => s.id === id);
    if (idx === -1) throw new AppError(`Student with ID "${id}" not found`, 404, 'STUDENT_NOT_FOUND');

    const student = db.students[idx];
    ['name', 'class', 'phone', 'address', 'status'].forEach(field => {
      if (updates[field] !== undefined) {
        student[field] = validators.sanitize(updates[field]);
      }
    });
    student.updatedAt = new Date().toISOString();
    return db;
  });

  const student = result.students.find(s => s.id === id);
  await logAction(`✏️ Student updated: ${student.name} (${id})`, 'REGISTRY', req.user?.username);
  return sendSuccess(res, { message: 'Student record updated', student });
}));

app.delete("/students/:id", catchAsync(async (req, res) => {
  const { id } = req.params;
  
  await transaction(async (db) => {
    const student = db.students.find(s => s.id === id);
    if (!student) throw new AppError(`Student with ID "${id}" not found`, 404, 'STUDENT_NOT_FOUND');

    const hasFees = db.fees[id] && db.fees[id].length > 0;
    if (hasFees) throw new AppError('Cannot delete student with existing fee records. Please archive instead.', 400, 'DEPENDENCY_ERROR');

    db.students = db.students.filter(s => s.id !== id);
    Object.keys(db.attendance).forEach(date => {
      db.attendance[date] = db.attendance[date].filter(a => a.id !== id);
    });
    
    db._deletedStudentName = student.name; // Temp storage
    return db;
  });

  await logAction(`🗑️ Student record deleted: (ID: ${id})`, 'SECURITY', req.user?.username);
  return sendSuccess(res, { message: 'Student record and associated attendance deleted' });
}));

// ===== TEACHERS ENDPOINTS =====
app.get("/teachers", catchAsync(async (req, res) => {
  const db = await readDB();
  res.json(db.teachers || []);
}));

app.post("/teachers", validate({
  name: { required: true, validator: validators.isValidName, message: 'Name must be 2-100 letters only' },
  subject: { required: true, validator: validators.isValidClass, message: 'Subject format is invalid' }
}), catchAsync(async (req, res) => {
  const { name, subject } = req.body;
  
  const newTeacher = {
    id: `T-${Date.now()}`,
    name: validators.sanitize(name),
    subject: validators.sanitize(subject)
  };

  await transaction(async (db) => {
    if (db.teachers.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      throw new AppError(`Teacher "${name}" is already registered`, 409, 'DUPLICATE_TEACHER');
    }
    db.teachers.push(newTeacher);
    return db;
  });

  await logAction(`👨‍🏫 Faculty registered: ${name}`, 'STAFF', req.user?.username);

  return res.status(201).json({
    success: true,
    message: 'Teacher added successfully',
    teacher: newTeacher
  });
}));

app.delete("/teachers/:id", catchAsync(async (req, res) => {
  const { id } = req.params;
  
  await transaction(async (db) => {
    const teacher = db.teachers.find(t => t.id === id);
    if (!teacher) throw new AppError('Teacher not found', 404, 'TEACHER_NOT_FOUND');

    db.teachers = db.teachers.filter(t => t.id !== id);
    return db;
  });

  await logAction(`🗑️ Teacher removed: (ID: ${id})`, "STAFF", req.user?.username);
  return sendSuccess(res, { message: "Teacher record deleted" });
}));

// DELETE admissions entry
app.delete("/admissions/:id", catchAsync(async (req, res) => {
  const { id } = req.params;
  await transaction(async (db) => {
    const idx = db.admissions.findIndex(a => a.id === id);
    if (idx === -1) throw new AppError('Admission record not found', 404, 'ADMISSION_NOT_FOUND');
    db.admissions.splice(idx, 1);
    return db;
  });
  await logAction(`🗑️ Admission record removed: (ID: ${id})`, 'REGISTRY', req.user?.username);
  return sendSuccess(res, { message: 'Admission record deleted' });
}));

// DELETE fee record
app.delete("/fees/:studentId/:receipt", catchAsync(async (req, res) => {
  const { studentId, receipt } = req.params;
  await transaction(async (db) => {
    if (!db.fees[studentId]) throw new AppError('No fees found for this student', 404, 'FEES_NOT_FOUND');
    const idx = db.fees[studentId].findIndex(f => f.receipt === receipt);
    if (idx === -1) throw new AppError('Fee record with this receipt not found', 404, 'RECEIPT_NOT_FOUND');
    db.fees[studentId].splice(idx, 1);
    return db;
  });
  await logAction(`🗑️ Fee record voided: (Student: ${studentId}, Receipt: ${receipt})`, 'FINANCE', req.user?.username);
  return sendSuccess(res, { message: 'Fee record deleted' });
}));

// DELETE timetable entry
app.post("/timetable/remove", catchAsync(async (req, res) => {
  const { className, subject, day, time } = req.body;
  await transaction(async (db) => {
    if (!db.timetable[className]) throw new AppError('Class schedule not found', 404, 'CLASS_NOT_FOUND');
    db.timetable[className] = db.timetable[className].filter(entry => 
      !(entry.subject === subject && entry.day === day && entry.time === time)
    );
    return db;
  });
  await logAction(`🗑️ Timetable entry removed for ${className}`, 'ACADEMIC', req.user?.username);
  return sendSuccess(res, { message: 'Schedule entry removed' });
}));

// DELETE announcement
app.delete("/announcements/:id", catchAsync(async (req, res) => {
  const { id } = req.params;
  const idNum = Number(id);
  await transaction(async (db) => {
    const idx = db.announcements.findIndex(a => a.id === idNum);
    if (idx === -1) throw new AppError('Announcement not found', 404, 'NOTICE_NOT_FOUND');
    db.announcements.splice(idx, 1);
    return db;
  });
  await logAction(`🗑️ Announcement removed: (ID: ${id})`, 'BROADCAST', req.user?.username);
  return sendSuccess(res, { message: 'Announcement deleted' });
}));

// ===== ATTENDANCE ENDPOINTS =====
app.get("/attendance/:date", catchAsync(async (req, res) => {
  const db = await readDB();
  let key = parseDateKey(req.params.date);
  if (!validators.isValidDate(key)) {
    throw new AppError('Attendance date must be in YYYY-MM-DD format', 400, 'INVALID_DATE');
  }
  return res.json(db.attendance[key] || []);
}));

app.post("/attendance/bulk", catchAsync(async (req, res) => {
  const { date, records } = req.body;
  const dateKey = parseDateKey(date || 'today');

  if (!records || !Array.isArray(records)) {
    throw new AppError('Records array is required', 400, 'VALIDATION_ERROR');
  }

  await transaction(async (db) => {
    if (!db.attendance[dateKey]) db.attendance[dateKey] = [];

    records.forEach(rec => {
      const { id, status } = rec;
      if (id && status && validators.isValidStatus(status)) {
        db.attendance[dateKey] = db.attendance[dateKey].filter(a => a.id !== id);
        db.attendance[dateKey].push({ id, status, time: new Date().toISOString() });
      }
    });
    return db;
  });

  await logAction(`📋 Bulk attendance: ${records.length} records on ${dateKey}`, 'REGISTRY', req.user?.username);
  return sendSuccess(res, { message: 'Bulk attendance recorded successfully' });
}));

// ===== FEES ENDPOINTS =====
app.get("/fees", catchAsync(async (req, res) => {
  const db = await readDB();
  return res.json(db.fees || {});
}));

app.post("/fees", validate({
  id: { required: true, validator: validators.isValidStudentId },
  amount: { required: true, validator: validators.isValidAmount },
  month: { required: true, validator: validators.isValidMonth },
  method: { required: true, validator: validators.isValidPaymentMethod }
}), catchAsync(async (req, res) => {
  const { id, amount, month, method } = req.body;
  const receipt = `RCP-${Date.now()}`;
  
  const feeRecord = {
    amount: Number(amount),
    month: validators.sanitize(month),
    method: validators.sanitize(method),
    date: new Date().toISOString(),
    receipt
  };

  await transaction(async (db) => {
    const student = db.students.find(s => s.id === id);
    if (!student) throw new AppError(`Student with ID "${id}" does not exist`, 404, 'STUDENT_NOT_FOUND');

    if (!db.fees[id]) db.fees[id] = [];
    if (db.fees[id].some(f => f.month.toLowerCase() === month.toLowerCase() && f.method !== 'pending')) {
      throw new AppError(`Fee for ${month} already recorded for student ${id}`, 409, 'DUPLICATE_FEE');
    }

    // Update existing pending fee or add new one
    const pendingIdx = db.fees[id].findIndex(f => f.month.toLowerCase() === month.toLowerCase() && f.method === 'pending');
    if (pendingIdx !== -1) {
      db.fees[id][pendingIdx] = feeRecord;
    } else {
      db.fees[id].push(feeRecord);
    }
    return db;
  });

  await logAction(`💰 Fee payment: PKR ${amount} from ${id} for ${month}`, 'FINANCE', req.user?.username);

  return res.status(201).json({
    success: true,
    message: 'Fee payment recorded',
    receipt,
    feeRecord
  });
}));

// ===== RESULTS ENDPOINTS =====
app.get("/results", catchAsync(async (req, res) => {
  const db = await readDB();
  return res.json(db.results || {});
}));

app.post("/results/bulk", catchAsync(async (req, res) => {
  const { id, results } = req.body;
  if (!id || !Array.isArray(results)) {
    throw new AppError('Student ID and an array of results are required', 400, 'VALIDATION_ERROR');
  }

  const processed = results.map(r => {
    const marks = Number(r.marks);
    const total = Number(r.total);
    if (isNaN(marks) || isNaN(total) || total <= 0 || marks > total) {
      throw new AppError(`Invalid marks for subject ${r.subject}`, 400, 'VALIDATION_ERROR');
    }
    
    const percentage = Math.round((marks / total) * 100);
    const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : 'F';
    
    return {
      subject: validators.sanitize(r.subject),
      marks,
      total,
      percentage,
      grade,
      date: new Date().toISOString()
    };
  });

  await transaction(async (db) => {
    if (!db.students.some(s => s.id === id)) throw new AppError(`Student with ID "${id}" does not exist`, 404, 'STUDENT_NOT_FOUND');
    if (!db.results[id]) db.results[id] = [];
    db.results[id].push(...processed);
    return db;
  });

  await logAction(`📊 Bulk results posted for ${id} (${processed.length} subjects)`, 'ACADEMIC', req.user?.username);
  return sendSuccess(res, { message: `${processed.length} results published successfully` });
}));

// ===== BACKUP EXPORT =====
app.get("/db/export", async (req, res, next) => {
  try {
    const db = await readDB();
    const backupPath = await createBackup();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=yasrab-erp-backup-${new Date().toISOString().split('T')[0]}.json`);
    res.send(JSON.stringify(db, null, 2));
  } catch (err) {
    next(err);
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
    const className = normalizeString(req.body.className || '');
    const subject = normalizeString(req.body.subject || '');
    const day = String(req.body.day || '').trim();
    const time = String(req.body.time || '').trim();
    const db = await readDB();

    if (!className || !subject || !day || !time) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Class, subject, day, and time are required');
    }

    if (!validators.isValidDay(day)) {
      return sendError(res, 400, 'INVALID_DAY', 'Day must be a valid weekday');
    }

    if (!validators.isValidTime(time)) {
      return sendError(res, 400, 'INVALID_TIME', 'Time must be in HH:MM format');
    }

    if (!db.timetable[className]) db.timetable[className] = [];
    const duplicate = db.timetable[className].find(entry => entry.day === day && entry.time === time && entry.subject.toLowerCase() === subject.toLowerCase());
    if (duplicate) {
      return sendError(res, 409, 'DUPLICATE_TIMETABLE_ENTRY', 'This schedule entry already exists');
    }

    db.timetable[className].push({ subject, day, time });
    await writeDB(db);
    return sendSuccess(res, { message: 'Schedule updated successfully' });
  } catch (err) {
    console.error('Timetable error:', err);
    return sendError(res, 500, 'TIMETABLE_ERROR', err.message);
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
    const title = normalizeString(req.body.title || '');
    const message = normalizeString(req.body.message || '');
    const priority = String(req.body.priority || 'normal').toLowerCase();

    if (!title || !message) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Title and message are required');
    }

    if (!validators.isValidPriority(priority)) {
      return sendError(res, 400, 'INVALID_PRIORITY', 'Priority must be normal or high');
    }

    const db = await readDB();
    const newAnnouncement = {
      id: Date.now(),
      title,
      message,
      priority,
      time: new Date().toISOString()
    };

    db.announcements.unshift(newAnnouncement);
    await writeDB(db);
    await logAction(`📢 Notice: ${title}`, 'BROADCAST');
    return sendSuccess(res, { message: 'Announcement published successfully', announcement: newAnnouncement });
  } catch (err) {
    console.error('Announcement creation error:', err);
    return sendError(res, 500, 'ANNOUNCEMENT_ERROR', err.message);
  }
});

// ===== LOGS ENDPOINT =====
app.get("/logs", async (req, res) => {
  try {
    const db = await readDB();
    return res.json(db.logs || []);
  } catch (err) {
    console.error('Logs read error:', err);
    return sendError(res, 500, 'LOGS_READ_ERROR', err.message);
  }
});

// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';
  
  if (NODE_ENV === 'development') {
    return res.status(statusCode).json({
      success: false,
      error: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message,
      details: err.details,
      stack: err.stack
    });
  }

  // Production response
  if (err.isOperational) {
    return res.status(statusCode).json({
      success: false,
      error: err.code,
      message: err.message,
      details: err.details
    });
  }

  // Programming or unknown errors: don't leak details
  console.error('❌ UNEXPECTED ERROR:', err);
  return res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred. Please contact support.'
  });
});

// ===== STUDENT PROFILE & REPORTS =====
app.get("/students/:id/profile", async (req, res) => {
  try {
    const db = await readDB();
    const student = db.students.find(s => s.id === req.params.id);

    if (!student) {
      return sendError(res, 404, 'STUDENT_NOT_FOUND', `Student with ID "${req.params.id}" not found`);
    }

    const attendance = Object.values(db.attendance || {})
      .flat()
      .filter(a => a.id === req.params.id);

    const fees = db.fees[req.params.id] || [];
    const results = db.results[req.params.id] || [];

    const totalAttendance = attendance.length;
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const attendancePercentage = totalAttendance > 0 ? Math.round((presentDays / totalAttendance) * 100) : 0;

    const totalFeesPaid = fees.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
    const averagePercentage = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.percentage || 0), 0) / results.length)
      : 0;

    return sendSuccess(res, {
      student,
      statistics: {
        totalAttendance,
        presentDays,
        attendancePercentage,
        totalFeesPaid,
        averagePercentage,
        subjectsCount: results.length
      },
      recentResults: results.slice(-5),
      recentFees: fees.slice(-5),
      recentAttendance: attendance.slice(-10)
    });
  } catch (err) {
    console.error('Student profile error:', err);
    return sendError(res, 500, 'PROFILE_ERROR', err.message);
  }
});

// ===== BULK OPERATIONS =====
app.post("/students/bulk-import", async (req, res) => {
  try {
    const { students } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Students array is required and cannot be empty');
    }

    const db = await readDB();
    const results = { success: 0, failed: 0, errors: [] };

    for (const student of students) {
      try {
        const id = String(student.id || '').trim();
        const name = normalizeString(student.name || '');
        const cls = normalizeString(student.class || '');

        if (!id || !name || !cls) {
          results.failed++;
          results.errors.push({ row: student, reason: 'Missing required fields' });
          continue;
        }

        if (!validators.isValidStudentId(id)) {
          results.failed++;
          results.errors.push({ row: student, reason: 'Invalid student ID format' });
          continue;
        }

        if (db.students.some(s => s.id === id)) {
          results.failed++;
          results.errors.push({ row: student, reason: `Duplicate ID: ${id}` });
          continue;
        }

        db.students.push({
          id: validators.sanitize(id),
          name: validators.sanitize(name),
          class: validators.sanitize(cls),
          phone: student.phone ? validators.sanitize(student.phone) : '',
          address: student.address ? validators.sanitize(student.address) : '',
          status: 'active',
          enrolledDate: new Date().toISOString()
        });

        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push({ row: student, reason: err.message });
      }
    }

    await writeDB(db);
    await logAction(`📚 Bulk import completed: ${results.success} students added`, 'REGISTRY');

    return sendSuccess(res, {
      message: `Import completed: ${results.success} succeeded, ${results.failed} failed`,
      ...results
    });
  } catch (err) {
    console.error('Bulk import error:', err);
    return sendError(res, 500, 'BULK_IMPORT_ERROR', err.message);
  }
});

// ===== ANALYTICS & REPORTS =====
app.get("/reports/summary", catchAsync(async (req, res) => {
  const db = await readDB();

  const totalFees = Object.values(db.fees || {})
    .flat()
    .filter(f => f.method !== 'pending')
    .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  const totalPendingFees = Object.values(db.fees || {})
    .flat()
    .filter(f => f.method === 'pending')
    .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  const averageAttendance = db.students.length > 0
    ? Math.round(
        Object.values(db.attendance || {})
          .flat()
          .filter(a => a.status === 'present').length /
        (Object.values(db.attendance || {}).flat().length || 1) * 100
      )
    : 0;

  const highPerformers = db.students.map(student => {
    const results = db.results[student.id] || [];
    const avgPercentage = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.percentage || 0), 0) / results.length)
      : 0;
    return { ...student, averagePercentage: avgPercentage };
  }).filter(s => s.averagePercentage >= 80).sort((a, b) => b.averagePercentage - a.averagePercentage).slice(0, 10);

  return sendSuccess(res, {
    schoolName: db.config?.schoolName,
    totalStudents: db.students.length,
    totalTeachers: db.teachers.length,
    pendingAdmissions: db.admissions.filter(a => a.status === 'pending').length,
    totalFeesCollected: totalFees,
    totalFeesPending: totalPendingFees,
    averageAttendancePercentage: averageAttendance,
    highPerformers,
    recentLogs: db.logs.slice(0, 20)
  });
}));

app.get("/reports/class-performance/:className", catchAsync(async (req, res) => {
  const db = await readDB();
  const className = req.params.className;

  const classStudents = db.students.filter(s => s.class === className);
  const performance = classStudents.map(student => {
    const results = db.results[student.id] || [];
    const avgPercentage = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.percentage || 0), 0) / results.length)
      : 0;

    const attendance = Object.values(db.attendance || {})
      .flat()
      .filter(a => a.id === student.id);
    const attendancePercentage = attendance.length > 0
      ? Math.round(attendance.filter(a => a.status === 'present').length / attendance.length * 100)
      : 0;

    return {
      id: student.id,
      name: student.name,
      averagePercentage,
      attendancePercentage,
      totalFees: (db.fees[student.id] || []).filter(f => f.method !== 'pending').reduce((sum, f) => sum + (f.amount || 0), 0)
    };
  });

  const classAverage = performance.length > 0
    ? Math.round(performance.reduce((sum, p) => sum + p.averagePercentage, 0) / performance.length)
    : 0;

  return sendSuccess(res, {
    className,
    totalStudents: classStudents.length,
    classAverage,
    students: performance.sort((a, b) => b.averagePercentage - a.averagePercentage)
  });
}));

app.get("/reports/financial", catchAsync(async (req, res) => {
  const db = await readDB();

  const monthlyCollection = {};
  Object.values(db.fees || {}).flat().filter(f => f.method !== 'pending').forEach(fee => {
    const month = fee.month || 'Unknown';
    monthlyCollection[month] = (monthlyCollection[month] || 0) + (fee.amount || 0);
  });

  const byMethod = {};
  Object.values(db.fees || {}).flat().filter(f => f.method !== 'pending').forEach(fee => {
    const method = fee.method || 'unknown';
    byMethod[method] = (byMethod[method] || 0) + (fee.amount || 0);
  });

  const totalCollected = Object.values(db.fees || {})
    .flat()
    .filter(f => f.method !== 'pending')
    .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

  return sendSuccess(res, {
    totalCollected,
    monthlyCollection,
    collectionByMethod: byMethod,
    totalRecords: Object.values(db.fees || {}).flat().filter(f => f.method !== 'pending').length
  });
}));

// ===== ADVANCED SCHOOL LOGIC =====

/**
 * Promote students of a class to the next class
 */
app.post("/students/promote", catchAsync(async (req, res) => {
  const { fromClass, toClass } = req.body;
  if (!fromClass || !toClass) {
    throw new AppError("fromClass and toClass are required", 400, "VALIDATION_ERROR");
  }

  const result = await transaction(async (db) => {
    const studentsToPromote = db.students.filter(s => s.class === fromClass && s.status === 'active');
    studentsToPromote.forEach(s => {
      s.class = toClass;
      s.updatedAt = new Date().toISOString();
    });
    return db;
  });

  await logAction(`📈 Promoted students from ${fromClass} to ${toClass}`, "ACADEMIC", req.user?.username);
  
  return sendSuccess(res, { 
    message: `Promotion successful from ${fromClass} to ${toClass}`,
    count: result.students.filter(s => s.class === toClass).length
  });
}));

/**
 * Generate monthly fees for all active students
 */
app.post("/fees/generate", catchAsync(async (req, res) => {
  const { month, amount } = req.body;
  if (!month || !amount) {
    throw new AppError("Month and default amount are required", 400, "VALIDATION_ERROR");
  }

  if (!validators.isValidMonth(month)) {
    throw new AppError("Invalid month name", 400, "INVALID_MONTH");
  }

  const result = await transaction(async (db) => {
    let generatedCount = 0;
    db.students.forEach(student => {
      if (student.status === 'active') {
        if (!db.fees[student.id]) db.fees[student.id] = [];
        const alreadyExists = db.fees[student.id].some(f => f.month.toLowerCase() === month.toLowerCase());
        if (!alreadyExists) {
          db.fees[student.id].push({
            amount: Number(amount),
            month: validators.sanitize(month),
            method: 'pending',
            date: new Date().toISOString(),
            receipt: `GEN-${Date.now()}-${student.id}`
          });
          generatedCount++;
        }
      }
    });
    db._lastGeneratedCount = generatedCount;
    return db;
  });

  await logAction(`💰 Generated pending fees for ${month} (${result._lastGeneratedCount} students)`, "FINANCE", req.user?.username);
  return sendSuccess(res, { 
    message: `Fee generation completed for ${month}`,
    generated: result._lastGeneratedCount
  });
}));

/**
 * Detailed attendance report for a student
 */
app.get("/reports/attendance/:studentId", catchAsync(async (req, res) => {
  const { studentId } = req.params;
  const db = await readDB();
  
  const student = db.students.find(s => s.id === studentId);
  if (!student) {
    throw new AppError("Student not found", 404, "STUDENT_NOT_FOUND");
  }

  const attendanceEntries = [];
  Object.keys(db.attendance).forEach(date => {
    const record = db.attendance[date].find(a => a.id === studentId);
    if (record) attendanceEntries.push({ date, status: record.status });
  });

  const monthlyStats = {};
  attendanceEntries.forEach(entry => {
    const month = entry.date.substring(0, 7);
    if (!monthlyStats[month]) monthlyStats[month] = { present: 0, absent: 0, leave: 0, total: 0 };
    monthlyStats[month][entry.status]++;
    monthlyStats[month].total++;
  });

  return sendSuccess(res, {
    studentName: student.name,
    studentId,
    totalRecords: attendanceEntries.length,
    monthlyStats,
    history: attendanceEntries.sort((a, b) => b.date.localeCompare(a.date))
  });
}));

// ===== SEARCH ENDPOINT =====
app.get("/search", catchAsync(async (req, res) => {
  const query = String(req.query.q || "").trim().toLowerCase();
  if (!query || query.length < 2) {
    return res.json({ results: { students: [], teachers: [] } });
  }

  const db = await readDB();
  const studentMatches = db.students.filter(s =>
    s.name.toLowerCase().includes(query) ||
    s.id.toLowerCase().includes(query) ||
    (s.class && s.class.toLowerCase().includes(query))
  );
  const teacherMatches = db.teachers.filter(t =>
    t.name.toLowerCase().includes(query) ||
    t.subject.toLowerCase().includes(query) ||
    (t.id && t.id.toLowerCase().includes(query))
  );

  return res.json({ results: { students: studentMatches, teachers: teacherMatches } });
}));

// ===== STARTUP CHECK =====
function checkEnv() {
  const required = ['ADMIN_USERNAME', 'ADMIN_PASSWORD'];
  if (NODE_ENV === 'production') required.push('JWT_SECRET', 'JWT_REFRESH_SECRET');
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`⚠️ Warning: Missing environment variables: ${missing.join(', ')}`);
  }
}

checkEnv();

// ===== FALLBACK =====
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/index.html"));
});

// ===== SERVER START =====
const server = app.listen(PORT, () => {
  console.log(`✨ Yasrab ERP running at http://localhost:${PORT}`);
});

// ===== GRACEFUL SHUTDOWN =====
const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
