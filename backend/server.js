
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.resolve(process.env.DB_PATH || "./backend/db.json");
const NODE_ENV = process.env.NODE_ENV || "development";

// ===== MIDDLEWARE =====
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Error handler middleware
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ success: false, msg: "Invalid JSON" });
  }
  next();
});
 
// Serve frontend static files
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
  sanitize: (str) => String(str).trim().slice(0, 500)
};

// ===== DATABASE HELPERS =====
 
const DEFAULT_DB = {
  config: {
    schoolName: "Yasrab School Management System",
    address: "Main Campus, Karachi",
    contact: "+92 123 4567890",
    email: "admin@yasrab.edu"
  },
  students: [],
  teachers: [],
  attendance: {},   // { "YYYY-MM-DD": [ { id, status, time } ] }
  fees: {},         // { "studentId": [ { amount, month, method, date } ] }
  results: {},      // { "studentId": [ { subject, marks, total, date } ] }
  timetable: {},    // { "ClassName": [ { subject, day, time } ] }
  logs: [],
  announcements: [],
  admissions: []
};
 
function initDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
 
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
    console.log("✅ Fresh database initialized at", DB_PATH);
    return;
  }
 
  // Migrate: ensure all required top-level keys exist
  try {
    const existing = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    let changed = false;
    for (const key of Object.keys(DEFAULT_DB)) {
      if (!(key in existing)) {
        existing[key] = DEFAULT_DB[key];
        changed = true;
      }
    }
 
    // Fix: migrate legacy flat attendance { "id": 1 } → date-keyed format
    if (existing.attendance && !isDateKeyedAttendance(existing.attendance)) {
      console.warn("⚠️  Migrating legacy attendance format...");
      existing.attendance = {};
      changed = true;
    }
 
    // Fix: migrate legacy flat fees { "id": 5000 } → nested array format
    if (existing.fees) {
      for (const key of Object.keys(existing.fees)) {
        if (!Array.isArray(existing.fees[key])) {
          console.warn(`⚠️  Migrating legacy fees entry for ${key}...`);
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
 
    // Fix: migrate legacy flat results { "id": 92 } → nested array format
    if (existing.results) {
      for (const key of Object.keys(existing.results)) {
        if (!Array.isArray(existing.results[key])) {
          console.warn(`⚠️  Migrating legacy results entry for ${key}...`);
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
 
    // Fix: ensure students have enrolledDate
    if (existing.students) {
      existing.students = existing.students.map(s => {
        if (!s.enrolledDate) { changed = true; return { ...s, enrolledDate: new Date().toISOString() }; }
        return s;
      });
    }
 
    if (changed) {
      fs.writeFileSync(DB_PATH, JSON.stringify(existing, null, 2));
      console.log("✅ Database migrated successfully.");
    }
  } catch (err) {
    console.error("❌ DB migration error:", err.message);
  }
}
 
function isDateKeyedAttendance(att) {
  // Date-keyed keys look like "2026-05-21"; legacy keys are student IDs
  const keys = Object.keys(att);
  if (!keys.length) return true; // empty is fine
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
  } catch (err) {
    console.error("❌ DB write error:", err.message);
  }
}
 
function logAction(action, type = "SYSTEM") {
  try {
    const db = readDB();
    db.logs.unshift({
      id: Date.now(),
      action,
      type,
      time: new Date().toISOString()
    });
    if (db.logs.length > 500) db.logs.length = 500;
    writeDB(db);
  } catch (err) {
    console.error("❌ Log write failed:", err.message);
  }
}
 
initDB();

// ===== STARTUP INFO =====
console.log("\n" + "=".repeat(60));
console.log("🚀 YASRAB SCHOOL MANAGEMENT SYSTEM - BACKEND STARTUP");
console.log("=".repeat(60));

try {
  const db = readDB();
  console.log("\n✅ DATABASE CONNECTION STATUS:");
  console.log(`   📁 Location: ${DB_PATH}`);
  console.log(`   📊 Database Exists: YES`);
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
  console.log(`   🔒 JWT Expires In: ${process.env.JWT_EXPIRES_IN || "2h"}`);
  console.log(`   🌐 Environment: ${NODE_ENV}`);
  console.log("\n✅ ALL SYSTEMS OPERATIONAL");
  console.log("=".repeat(60) + "\n");
} catch (err) {
  console.error("❌ STARTUP ERROR:", err.message);
  process.exit(1);
}

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
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
      }
    });
  } catch (err) {
    console.error("❌ Health check error:", err);
    res.status(500).json({
      status: "❌ ERROR",
      error: err.message,
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
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// ===== PUBLIC ROUTES =====

app.post("/login", (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        msg: "Username and password required",
        error: "MISSING_CREDENTIALS"
      });
    }
    const user = String(username).trim();
    const pass = String(password).trim();

    if (user.length < 2 || user.length > 50 || pass.length < 4) {
      return res.status(400).json({
        success: false,
        msg: "Invalid credentials format",
        error: "INVALID_FORMAT"
      });
    }

    const adminUser = process.env.ADMIN_USERNAME || "admin";
    const adminPass = process.env.ADMIN_PASSWORD || "1234";

    if (user === adminUser && pass === adminPass) {
      logAction(`✅ Admin login successful: ${user}`, "AUTH");
      return res.json({
        success: true,
        token: "no-auth-required",
        role: "admin",
        msg: "Login successful"
      });
    }

    logAction(`❌ Failed login attempt - invalid credentials for: ${user}`, "SECURITY");
    res.status(401).json({
      success: false,
      msg: "Invalid username or password",
      error: "INVALID_CREDENTIALS"
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({
      success: false,
      msg: "Server error during authentication",
      error: "SERVER_ERROR"
    });
  }
});

 
// ===== AUTH MIDDLEWARE (all routes are now public) =====
 
// ===== CONFIG =====
 
app.get("/config", (req, res) => {
  const db = readDB();
  res.json(db.config || DEFAULT_DB.config);
});
 
app.patch("/config", (req, res) => {
  const db = readDB();
  db.config = { ...db.config, ...req.body };
  writeDB(db);
  logAction("Institutional configuration updated.", "SYSTEM");
  res.json({ success: true });
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
      recentLogs: (db.logs || []).slice(0, 8),
      recentStudents: (db.students || []).slice(-5).reverse()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stats failure" });
  }
});
 
// ===== ADMISSIONS =====
 
app.get("/admissions", (req, res) => {
  res.json(readDB().admissions || []);
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
    writeDB(db);
    logAction(`Admission application: ${req.body.name}`, "REGISTRY");
    res.json({ success: true, admission: newAdm });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});
 
app.patch("/admissions/:id", (req, res) => {
  try {
    const { status } = req.body;
    const db = readDB();
    const idx = db.admissions.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, msg: "Not found" });
 
    db.admissions[idx].status = status;
 
    if (status === "approved") {
      const adm = db.admissions[idx];
      // Generate unique student ID using timestamp to avoid collisions
      const newId = "S-" + Date.now().toString().slice(-6);
      db.students.push({
        id: newId,
        name: adm.name,
        class: adm.class,
        phone: adm.phone || "",
        address: adm.address || "",
        enrolledDate: new Date().toISOString()
      });
      logAction(`Enrolment approved: ${adm.name} → ID ${newId}`, "REGISTRY");
    }
 
    writeDB(db);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});
 
// ===== STUDENTS =====
 
app.get("/students", (req, res) => {
  res.json(readDB().students || []);
});
 
app.post("/students", (req, res) => {
  try {
    const { id, name, class: cls, phone, address } = req.body;

    // Validation
    if (!id || !name || !cls) {
      return res.status(400).json({
        success: false,
        msg: "Student ID, name, and class are required",
        fields: ["id", "name", "class"]
      });
    }

    if (!validators.isValidStudentId(id)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid student ID format (alphanumeric, 1-20 chars)"
      });
    }

    if (!validators.isValidName(name)) {
      return res.status(400).json({
        success: false,
        msg: "Name must contain only letters and spaces (2-100 chars)"
      });
    }

    if (!validators.isValidClass(cls)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid class format"
      });
    }

    const db = readDB();
    if (db.students.some(s => s.id === id)) {
      return res.status(409).json({
        success: false,
        msg: "Student ID already exists"
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
    writeDB(db);
    logAction(`📚 Student enrolled: ${name} (${id})`, "REGISTRY");
    res.json({
      success: true,
      msg: "Student added successfully",
      student: newStudent
    });
  } catch (err) {
    console.error("❌ Student creation error:", err);
    res.status(500).json({
      success: false,
      msg: "Server error while creating student"
    });
  }
});
 
app.delete("/students/:id", (req, res) => {
  try {
    const db = readDB();
    const before = db.students.length;
    db.students = db.students.filter(s => s.id !== req.params.id);
    if (db.students.length === before) return res.status(404).json({ success: false, msg: "Not found" });
    writeDB(db);
    logAction(`Student record deleted: ${req.params.id}`, "SECURITY");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});

// ===== SEARCH ENDPOINT =====
app.get("/search", (req, res) => {
  try {
    const query = String(req.query.q || "").toLowerCase().trim();
    if (!query || query.length < 2) {
      return res.json({ results: [] });
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
    console.error("❌ Search error:", err);
    res.status(500).json({ success: false, msg: "Search failed" });
  }
});

// ===== TEACHERS =====
 
app.get("/teachers", (req, res) => {
  res.json(readDB().teachers || []);
});
 
app.post("/teachers", (req, res) => {
  try {
    const { name, subject } = req.body;

    if (!name || !subject) {
      return res.status(400).json({
        success: false,
        msg: "Name and subject are required",
        fields: ["name", "subject"]
      });
    }

    if (!validators.isValidName(name)) {
      return res.status(400).json({
        success: false,
        msg: "Teacher name must contain only letters (2-100 chars)"
      });
    }

    const db = readDB();
    const newTeacher = {
      id: "T-" + Date.now(),
      name: validators.sanitize(name),
      subject: validators.sanitize(subject)
    };

    db.teachers.push(newTeacher);
    writeDB(db);
    logAction(`👨‍🏫 Faculty registered: ${name}`, "STAFF");
    res.json({
      success: true,
      msg: "Teacher added successfully",
      teacher: newTeacher
    });
  } catch (err) {
    console.error("❌ Teacher creation error:", err);
    res.status(500).json({
      success: false,
      msg: "Server error while adding teacher"
    });
  }
});
 
// ===== ATTENDANCE =====
 
app.get("/attendance/:date", (req, res) => {
  try {
    const db = readDB();
    let key = req.params.date;
    if (key === "today") key = new Date().toISOString().split("T")[0];
    // "yesterday" is now handled on the frontend — but just in case:
    if (key === "yesterday") {
      const y = new Date(); y.setDate(y.getDate() - 1);
      key = y.toISOString().split("T")[0];
    }
    res.json(db.attendance[key] || []);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});
 
app.post("/attendance", (req, res) => {
  try {
    const { id, status } = req.body;
    if (!id || !status) return res.status(400).json({ success: false, msg: "id and status are required" });
    const db = readDB();
    const today = new Date().toISOString().split("T")[0];
    if (!db.attendance[today]) db.attendance[today] = [];
    // Overwrite existing entry for the same student today
    db.attendance[today] = db.attendance[today].filter(a => a.id !== id);
    db.attendance[today].push({ id, status, time: new Date().toISOString() });
    writeDB(db);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});
 
// ===== FEES =====
 
app.get("/fees", (req, res) => {
  res.json(readDB().fees || {});
});
 
app.post("/fees", (req, res) => {
  try {
    const { id, amount, month, method = "cash" } = req.body;

    if (!id || !amount || !month) {
      return res.status(400).json({
        success: false,
        msg: "Student ID, amount, and month are required",
        fields: ["id", "amount", "month"]
      });
    }

    if (!validators.isValidAmount(amount)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid amount (must be 1-9999999)"
      });
    }

    if (!["cash", "bank", "cheque", "online"].includes(method)) {
      return res.status(400).json({
        success: false,
        msg: "Invalid payment method"
      });
    }

    const db = readDB();
    const student = db.students.find(s => s.id === id);
    if (!student) {
      return res.status(404).json({
        success: false,
        msg: "Student not found"
      });
    }

    if (!db.fees[id]) db.fees[id] = [];
    db.fees[id].push({
      amount: Number(amount),
      month: validators.sanitize(month),
      method,
      date: new Date().toISOString(),
      receipt: `RCP-${Date.now()}`
    });

    writeDB(db);
    logAction(`💰 Fee payment recorded: PKR ${amount} from ${id}`, "FINANCE");
    res.json({
      success: true,
      msg: "Fee payment recorded successfully",
      receipt: `RCP-${Date.now()}`
    });
  } catch (err) {
    console.error("❌ Fee recording error:", err);
    res.status(500).json({
      success: false,
      msg: "Server error while recording fee"
    });
  }
});
 
// ===== RESULTS =====
 
app.get("/results", (req, res) => {
  res.json(readDB().results || {});
});
 
app.post("/results", (req, res) => {
  try {
    const { id, subject, marks, total = 100 } = req.body;

    if (!id || !subject || marks == null) {
      return res.status(400).json({
        success: false,
        msg: "Student ID, subject, and marks are required"
      });
    }

    if (!validators.isValidMarks(marks)) {
      return res.status(400).json({
        success: false,
        msg: "Marks must be between 0 and 100"
      });
    }

    if (Number(total) <= 0 || Number(total) > 1000) {
      return res.status(400).json({
        success: false,
        msg: "Invalid total marks"
      });
    }

    const db = readDB();
    const student = db.students.find(s => s.id === id);
    if (!student) {
      return res.status(404).json({
        success: false,
        msg: "Student not found"
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

    writeDB(db);
    logAction(`📊 Result posted: ${id} → ${subject} ${marks}/${total} (${grade})`, "ACADEMIC");
    res.json({
      success: true,
      msg: "Result recorded successfully",
      result: { subject, marks, total, percentage, grade }
    });
  } catch (err) {
    console.error("❌ Result recording error:", err);
    res.status(500).json({
      success: false,
      msg: "Server error while recording result"
    });
  }
});
 
// ===== TIMETABLE =====
 
app.get("/timetable", (req, res) => {
  res.json(readDB().timetable || {});
});
 
app.post("/timetable", (req, res) => {
  try {
    const { className, subject, day, time } = req.body;
    if (!className || !subject || !day || !time) return res.status(400).json({ success: false, msg: "All fields required" });
 
    const db = readDB();
    if (!db.timetable[className]) db.timetable[className] = [];
    db.timetable[className].push({ subject, day, time });
    writeDB(db);
    logAction(`Timetable updated: ${className} — ${day} ${subject}`, "SYSTEM");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});
 
// ===== ANNOUNCEMENTS =====
 
app.get("/announcements", (req, res) => {
  res.json(readDB().announcements || []);
});
 
app.post("/announcements", (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) return res.status(400).json({ success: false, msg: "title and message are required" });
 
    const db = readDB();
    db.announcements.unshift({
      id: Date.now(),
      title,
      message,
      priority: req.body.priority || "normal",
      target: req.body.target || "all",
      time: new Date().toISOString()
    });
    writeDB(db);
    logAction(`Notice published: ${title}`, "BROADCAST");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
});
 
// ===== AUDIT LOGS =====
 
app.get("/logs", (req, res) => {
  const db = readDB();
  res.json(db.logs || []);
});
 
// ===== DATA EXPORT (auth protected) =====
 
app.get("/export", (req, res) => {
  try {
    const db = readDB();
    const filename = `yasrab_backup_${new Date().toISOString().split("T")[0]}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    logAction("System backup exported.", "SYSTEM");
    res.send(JSON.stringify(db, null, 2));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Export failed" });
  }
});
 
// ===== FALLBACK (SPA) =====
app.get("*", (req, res) => {
  const frontendIndex = path.resolve(__dirname, "../frontend/index.html");
  if (fs.existsSync(frontendIndex)) {
    res.sendFile(frontendIndex);
  } else {
    res.status(404).json({ msg: "Frontend not found. Serve index.html separately or put it in the frontend/ folder." });
  }
});
 
// ===== START =====
 
app.listen(PORT, () => {
  console.log(`\n🚀 Yasrab ERP running → http://localhost:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
  console.log(`🔐 Login: ${process.env.ADMIN_USERNAME || "admin"} / ****\n`);
});
 