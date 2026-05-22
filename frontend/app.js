// ===== GLOBAL STATE & CONSTANTS =====
let AUTH_TOKEN = localStorage.getItem("token") || null;
let CURRENT_MODULE = "dashboard";
let CURRENT_DATA = {};
let IS_DARK_MODE = localStorage.getItem("darkMode") === "true";
const API_BASE = window.location.origin;

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (AUTH_TOKEN) {
      showApp();
      loadDashboard();
    } else {
      showLogin();
    }
  }, 1000);

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  if (IS_DARK_MODE) enableDarkMode();

  const todayInput = document.getElementById("attendanceDate");
  if (todayInput) todayInput.valueAsDate = new Date();
});

// ===== AUTHENTICATION =====
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    showToast("Please enter credentials", "error");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.msg || data.message || "Login failed");
    if (!data.token) throw new Error("No token received");

    AUTH_TOKEN = data.token;
    localStorage.setItem("token", AUTH_TOKEN);
    showToast("Login successful ✓", "success");

    setTimeout(() => {
      document.getElementById("username").value = "";
      document.getElementById("password").value = "";
      showApp();
      loadDashboard();
    }, 500);
  } catch (err) {
    showToast(err.message || "Login error", "error");
    console.error("Login error:", err);
  }
}

function logout() {
  if (confirm("Are you sure you want to logout?")) {
    AUTH_TOKEN = null;
    localStorage.removeItem("token");
    showLogin();
    showToast("Logged out successfully", "info");
  }
}

// ===== UI NAVIGATION =====
function showLogin() {
  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("mainApp").style.display = "none";
}

function showApp() {
  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("mainApp").style.display = "flex";
}

function switchModule(module, event) {
  if (event) event.preventDefault();

  document.querySelectorAll(".module-content").forEach(el => el.style.display = "none");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));

  const moduleEl = document.getElementById(`module-${module}`);
  if (moduleEl) moduleEl.style.display = "block";

  const navBtn = document.querySelector(`[data-module="${module}"]`);
  if (navBtn) navBtn.classList.add("active");

  CURRENT_MODULE = module;
  updateBreadcrumb(module);

  const loaders = {
    dashboard: loadDashboard,
    admissions: loadAdmissions,
    students: loadStudents,
    teachers: loadTeachers,
    attendance: loadAttendance,
    fees: loadFees,
    results: loadResults,
    timetable: loadTimetable,
    announcements: loadAnnouncements,
    settings: loadSettings,
    logs: loadLogs
  };

  if (loaders[module]) loaders[module]();
}

function updateBreadcrumb(module) {
  const breadcrumbMap = {
    dashboard: "Dashboard",
    admissions: "Admissions",
    students: "Students",
    teachers: "Teachers",
    attendance: "Attendance",
    fees: "Fees",
    results: "Results",
    timetable: "Timetable",
    announcements: "Announcements",
    settings: "Settings",
    logs: "Audit Logs"
  };
  const breadcrumb = document.getElementById("breadcrumb");
  if (breadcrumb) breadcrumb.textContent = breadcrumbMap[module] || module;
}

// ===== API CALLS WITH ERROR HANDLING =====
async function apiCall(endpoint, options = {}) {
  try {
    const headers = {
      "Content-Type": "application/json",
      ...options.headers
    };

    if (AUTH_TOKEN) {
      headers.Authorization = `Bearer ${AUTH_TOKEN}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      AUTH_TOKEN = null;
      localStorage.removeItem("token");
      showLogin();
      throw new Error("Session expired. Please login again.");
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ msg: "API error" }));
      throw new Error(error.msg || error.message || `Error: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    showToast(err.message || "Network error", "error");
    throw err;
  }
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const stats = await apiCall("/stats");

    document.getElementById("stat-students").textContent = stats.students || 0;
    document.getElementById("stat-teachers").textContent = stats.teachers || 0;
    document.getElementById("stat-admissions").textContent = stats.admissions || 0;
    document.getElementById("stat-fees").textContent = `Rs. ${(stats.fees || 0).toLocaleString()}`;

    const activityList = document.getElementById("activityList");
    const logs = stats.recentLogs || [];

    if (logs.length === 0) {
      activityList.innerHTML = "<p class='empty-state'>No recent activity</p>";
    } else {
      activityList.innerHTML = logs.map(log => `
        <div class="activity-item">
          <div class="activity-icon"><i class="fas fa-circle-check"></i></div>
          <div class="activity-details">
            <p class="activity-action">${log.action}</p>
            <span class="activity-time">${formatTime(log.time)}</span>
          </div>
        </div>
      `).join("");
    }

    document.getElementById("studentsBadge").textContent = stats.students || 0;
    document.getElementById("teachersBadge").textContent = stats.teachers || 0;
    document.getElementById("admissionsBadge").textContent = stats.admissions || 0;
  } catch (err) {
    console.error("Dashboard load failed:", err);
  }
}

function refreshDashboard() {
  showToast("Refreshing dashboard...", "info");
  loadDashboard();
}

// ===== ADMISSIONS =====
async function loadAdmissions() {
  try {
    const admissions = await apiCall("/admissions");
    const tbody = document.getElementById("admissionsTable");

    if (admissions.length === 0) {
      tbody.innerHTML = "<tr><td colspan='7' class='text-center'>No applications</td></tr>";
      return;
    }

    tbody.innerHTML = admissions.map(adm => `
      <tr>
        <td>${adm.id}</td>
        <td>${adm.name}</td>
        <td>${adm.class}</td>
        <td>${adm.phone}</td>
        <td>${formatDate(adm.date)}</td>
        <td><span class="badge" style="background: ${adm.status === 'pending' ? '#f39c12' : '#27ae60'}">${adm.status}</span></td>
        <td>
          ${adm.status === 'pending' ? `
            <button class="btn-small" onclick="approveAdmission('${adm.id}')"><i class="fas fa-check"></i></button>
            <button class="btn-small reject" onclick="rejectAdmission('${adm.id}')"><i class="fas fa-times"></i></button>
          ` : '-'}
        </td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Admissions load failed:", err);
  }
}

function openAdmissionForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "New Admission Application";

  body.innerHTML = `
    <form id="admissionFormContent" class="form-grid">
      <div class="form-group"><label>Name</label><input type="text" id="admName" required></div>
      <div class="form-group"><label>Class</label><input type="text" id="admClass" required></div>
      <div class="form-group"><label>Phone</label><input type="tel" id="admPhone"></div>
      <div class="form-group"><label>Address</label><input type="text" id="admAddress"></div>
      <button type="button" class="btn btn-primary" onclick="submitAdmission()" style="grid-column: 1/-1;">Submit</button>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitAdmission() {
  try {
    const payload = {
      name: document.getElementById("admName").value.trim(),
      class: document.getElementById("admClass").value.trim(),
      phone: document.getElementById("admPhone").value.trim(),
      address: document.getElementById("admAddress").value.trim()
    };

    if (!payload.name || !payload.class) throw new Error("Name and class required");

    await apiCall("/admissions", { method: "POST", body: JSON.stringify(payload) });
    showToast("Application submitted successfully ✓", "success");
    closeModal();
    loadAdmissions();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function approveAdmission(id) {
  if (!confirm("Approve this application?")) return;
  try {
    await apiCall(`/admissions/${id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
    showToast("Application approved ✓", "success");
    loadAdmissions();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function rejectAdmission(id) {
  if (!confirm("Reject this application?")) return;
  try {
    await apiCall(`/admissions/${id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) });
    showToast("Application rejected", "info");
    loadAdmissions();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function filterAdmissions() {
  const query = document.getElementById("admissionsSearch").value.toLowerCase();
  document.querySelectorAll("#admissionsTable tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
}

// ===== STUDENTS =====
async function loadStudents() {
  try {
    const students = await apiCall("/students");
    const tbody = document.getElementById("studentsTable");

    if (students.length === 0) {
      tbody.innerHTML = "<tr><td colspan='7' class='text-center'>No students</td></tr>";
      return;
    }

    tbody.innerHTML = students.map(s => `
      <tr>
        <td><strong>${s.id}</strong></td>
        <td>${s.name}</td>
        <td>${s.class}</td>
        <td>${s.phone}</td>
        <td>${formatDate(s.enrolledDate)}</td>
        <td><span class="badge" style="background: #27ae60;">${s.status || 'active'}</span></td>
        <td>
          <button class="btn-small" onclick="editStudent('${s.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn-small reject" onclick="deleteStudent('${s.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join("");

    document.getElementById("studentsBadge").textContent = students.length;
  } catch (err) {
    console.error("Students load failed:", err);
  }
}

function openStudentForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Add New Student";

  body.innerHTML = `
    <form id="studentFormContent" class="form-grid">
      <div class="form-group"><label>Student ID</label><input type="text" id="stdId" required></div>
      <div class="form-group"><label>Name</label><input type="text" id="stdName" required></div>
      <div class="form-group"><label>Class</label><input type="text" id="stdClass" required></div>
      <div class="form-group"><label>Phone</label><input type="tel" id="stdPhone"></div>
      <div class="form-group"><label>Address</label><input type="text" id="stdAddress"></div>
      <button type="button" class="btn btn-primary" onclick="submitStudent()" style="grid-column: 1/-1;">Add Student</button>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitStudent() {
  try {
    const payload = {
      id: document.getElementById("stdId").value.trim(),
      name: document.getElementById("stdName").value.trim(),
      class: document.getElementById("stdClass").value.trim(),
      phone: document.getElementById("stdPhone").value.trim(),
      address: document.getElementById("stdAddress").value.trim()
    };

    if (!payload.id || !payload.name || !payload.class) throw new Error("ID, name, and class required");

    await apiCall("/students", { method: "POST", body: JSON.stringify(payload) });
    showToast("Student added successfully ✓", "success");
    closeModal();
    loadStudents();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteStudent(id) {
  if (!confirm("Delete this student?")) return;
  try {
    await apiCall(`/students/${id}`, { method: "DELETE" });
    showToast("Student deleted", "info");
    loadStudents();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function editStudent(id) {
  showToast("Edit feature coming soon", "info");
}

function filterStudents() {
  const query = document.getElementById("studentsSearch").value.toLowerCase();
  document.querySelectorAll("#studentsTable tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
}

// ===== TEACHERS =====
async function loadTeachers() {
  try {
    const teachers = await apiCall("/teachers");
    const tbody = document.getElementById("teachersTable");

    if (teachers.length === 0) {
      tbody.innerHTML = "<tr><td colspan='4' class='text-center'>No teachers</td></tr>";
      return;
    }

    tbody.innerHTML = teachers.map(t => `
      <tr>
        <td>${t.id}</td>
        <td>${t.name}</td>
        <td>${t.subject}</td>
        <td>
          <button class="btn-small reject" onclick="deleteTeacher('${t.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join("");

    document.getElementById("teachersBadge").textContent = teachers.length;
  } catch (err) {
    console.error("Teachers load failed:", err);
  }
}

function openTeacherForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Add New Teacher";

  body.innerHTML = `
    <form id="teacherFormContent" class="form-grid">
      <div class="form-group"><label>Name</label><input type="text" id="tchName" required></div>
      <div class="form-group"><label>Subject</label><input type="text" id="tchSubject" required></div>
      <button type="button" class="btn btn-primary" onclick="submitTeacher()" style="grid-column: 1/-1;">Add Teacher</button>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitTeacher() {
  try {
    const payload = {
      name: document.getElementById("tchName").value.trim(),
      subject: document.getElementById("tchSubject").value.trim()
    };

    if (!payload.name || !payload.subject) throw new Error("Name and subject required");

    await apiCall("/teachers", { method: "POST", body: JSON.stringify(payload) });
    showToast("Teacher added successfully ✓", "success");
    closeModal();
    loadTeachers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteTeacher(id) {
  if (!confirm("Delete this teacher?")) return;
  try {
    await apiCall(`/teachers/${id}`, { method: "DELETE" });
    showToast("Teacher deleted", "info");
    loadTeachers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function filterTeachers() {
  const query = document.getElementById("teachersSearch").value.toLowerCase();
  document.querySelectorAll("#teachersTable tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
}

// ===== ATTENDANCE =====
async function loadAttendance() {
  const date = document.getElementById("attendanceDate").value;
  if (!date) {
    showToast("Please select a date", "error");
    return;
  }
  loadAttendanceForDate();
}

async function loadAttendanceForDate() {
  try {
    const date = document.getElementById("attendanceDate").value || new Date().toISOString().split("T")[0];
    const students = await apiCall("/students");
    const attendanceData = await apiCall(`/attendance/${date}`);

    const tbody = document.getElementById("attendanceTable");
    tbody.innerHTML = students.map(s => {
      const att = attendanceData.find(a => a.id === s.id) || {};
      return `
        <tr>
          <td>${s.id}</td>
          <td>${s.name}</td>
          <td>
            <select id="att-${s.id}" value="${att.status || 'present'}">
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="leave">Leave</option>
            </select>
          </td>
          <td>-</td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    console.error("Attendance load failed:", err);
  }
}

async function saveAttendance() {
  try {
    const date = document.getElementById("attendanceDate").value;
    const students = await apiCall("/students");

    for (const student of students) {
      const status = document.getElementById(`att-${student.id}`)?.value || "present";
      await apiCall("/attendance", {
        method: "POST",
        body: JSON.stringify({ id: student.id, status })
      });
    }

    showToast("Attendance saved successfully ✓", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== FEES =====
async function loadFees() {
  try {
    const fees = await apiCall("/fees");
    const tbody = document.getElementById("feesTable");

    let rows = [];
    for (const [studentId, feeList] of Object.entries(fees)) {
      feeList.forEach(fee => {
        rows.push(`
          <tr>
            <td>${studentId}</td>
            <td>Rs. ${fee.amount.toLocaleString()}</td>
            <td>${fee.month}</td>
            <td>${fee.method}</td>
            <td>${fee.receipt || 'N/A'}</td>
            <td>${formatDate(fee.date)}</td>
          </tr>
        `);
      });
    }

    tbody.innerHTML = rows.length > 0 ? rows.join("") : "<tr><td colspan='6' class='text-center'>No fee records</td></tr>";
  } catch (err) {
    console.error("Fees load failed:", err);
  }
}

function openFeeForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Record Fee Payment";

  body.innerHTML = `
    <form id="feeFormContent" class="form-grid">
      <div class="form-group"><label>Student ID</label><input type="text" id="feeStdId" required></div>
      <div class="form-group"><label>Amount (Rs.)</label><input type="number" id="feeAmount" min="1" required></div>
      <div class="form-group"><label>Month</label><input type="text" id="feeMonth" placeholder="e.g., January" required></div>
      <div class="form-group"><label>Method</label>
        <select id="feeMethod">
          <option>cash</option>
          <option>bank</option>
          <option>cheque</option>
          <option>online</option>
        </select>
      </div>
      <button type="button" class="btn btn-primary" onclick="submitFee()" style="grid-column: 1/-1;">Record Payment</button>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitFee() {
  try {
    const payload = {
      id: document.getElementById("feeStdId").value.trim(),
      amount: Number(document.getElementById("feeAmount").value),
      month: document.getElementById("feeMonth").value.trim(),
      method: document.getElementById("feeMethod").value
    };

    if (!payload.id || !payload.amount || !payload.month) throw new Error("All fields required");

    await apiCall("/fees", { method: "POST", body: JSON.stringify(payload) });
    showToast("Fee recorded successfully ✓", "success");
    closeModal();
    loadFees();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function filterFees() {
  const query = document.getElementById("feesSearch").value.toLowerCase();
  document.querySelectorAll("#feesTable tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
}

// ===== RESULTS =====
async function loadResults() {
  try {
    const results = await apiCall("/results");
    const tbody = document.getElementById("resultsTable");

    let rows = [];
    for (const [studentId, resultList] of Object.entries(results)) {
      resultList.forEach(result => {
        rows.push(`
          <tr>
            <td>${studentId}</td>
            <td>${result.subject}</td>
            <td>${result.marks}</td>
            <td>${result.total}</td>
            <td><span class="badge" style="background: ${result.grade === 'A+' || result.grade === 'A' ? '#27ae60' : result.grade === 'F' ? '#e74c3c' : '#f39c12'}">${result.grade}</span></td>
            <td>${formatDate(result.date)}</td>
          </tr>
        `);
      });
    }

    tbody.innerHTML = rows.length > 0 ? rows.join("") : "<tr><td colspan='6' class='text-center'>No results</td></tr>";
  } catch (err) {
    console.error("Results load failed:", err);
  }
}

function openResultForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Add Student Result";

  body.innerHTML = `
    <form id="resultFormContent" class="form-grid">
      <div class="form-group"><label>Student ID</label><input type="text" id="resStdId" required></div>
      <div class="form-group"><label>Subject</label><input type="text" id="resSubject" required></div>
      <div class="form-group"><label>Marks</label><input type="number" id="resMarks" min="0" max="100" required></div>
      <div class="form-group"><label>Total Marks</label><input type="number" id="resTotal" value="100" min="1" required></div>
      <button type="button" class="btn btn-primary" onclick="submitResult()" style="grid-column: 1/-1;">Add Result</button>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitResult() {
  try {
    const payload = {
      id: document.getElementById("resStdId").value.trim(),
      subject: document.getElementById("resSubject").value.trim(),
      marks: Number(document.getElementById("resMarks").value),
      total: Number(document.getElementById("resTotal").value)
    };

    if (!payload.id || !payload.subject || payload.marks == null) throw new Error("All fields required");
    if (payload.marks > payload.total) throw new Error("Marks cannot exceed total");

    await apiCall("/results", { method: "POST", body: JSON.stringify(payload) });
    showToast("Result added successfully ✓", "success");
    closeModal();
    loadResults();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function filterResults() {
  const query = document.getElementById("resultsSearch").value.toLowerCase();
  document.querySelectorAll("#resultsTable tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
}

// ===== TIMETABLE =====
async function loadTimetable() {
  try {
    const timetable = await apiCall("/timetable");
    const content = document.getElementById("timetableContent");

    if (Object.keys(timetable).length === 0) {
      content.innerHTML = "<p class='empty-state'>No timetable entries</p>";
      return;
    }

    let html = "<div class='timetable-grid'>";
    for (const [className, schedule] of Object.entries(timetable)) {
      html += `<div class="class-schedule"><h4>${className}</h4><ul>`;
      schedule.forEach(entry => {
        html += `<li><strong>${entry.subject}</strong> - ${entry.day} at ${entry.time}</li>`;
      });
      html += `</ul></div>`;
    }
    html += "</div>";
    content.innerHTML = html;
  } catch (err) {
    console.error("Timetable load failed:", err);
  }
}

function openTimetableForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Add Timetable Entry";

  body.innerHTML = `
    <form id="timetableFormContent" class="form-grid">
      <div class="form-group"><label>Class Name</label><input type="text" id="ttClassName" required></div>
      <div class="form-group"><label>Subject</label><input type="text" id="ttSubject" required></div>
      <div class="form-group"><label>Day</label><input type="text" id="ttDay" placeholder="Monday" required></div>
      <div class="form-group"><label>Time</label><input type="time" id="ttTime" required></div>
      <button type="button" class="btn btn-primary" onclick="submitTimetable()" style="grid-column: 1/-1;">Add Entry</button>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitTimetable() {
  try {
    const payload = {
      className: document.getElementById("ttClassName").value.trim(),
      subject: document.getElementById("ttSubject").value.trim(),
      day: document.getElementById("ttDay").value.trim(),
      time: document.getElementById("ttTime").value
    };

    if (!payload.className || !payload.subject || !payload.day || !payload.time) throw new Error("All fields required");

    await apiCall("/timetable", { method: "POST", body: JSON.stringify(payload) });
    showToast("Timetable entry added ✓", "success");
    closeModal();
    loadTimetable();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== ANNOUNCEMENTS =====
async function loadAnnouncements() {
  try {
    const announcements = await apiCall("/announcements");
    const list = document.getElementById("announcementsList");

    if (announcements.length === 0) {
      list.innerHTML = "<p class='empty-state'>No announcements</p>";
      return;
    }

    list.innerHTML = announcements.map(a => `
      <div class="announcement-item">
        <div class="announcement-header">
          <h4>${a.title}</h4>
          <span class="badge" style="background: ${a.priority === 'high' ? '#e74c3c' : '#f39c12'}">${a.priority}</span>
        </div>
        <p>${a.message}</p>
        <small>${formatTime(a.time)}</small>
      </div>
    `).join("");
  } catch (err) {
    console.error("Announcements load failed:", err);
  }
}

function openAnnouncementForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "New Announcement";

  body.innerHTML = `
    <form id="announcementFormContent" class="form-grid">
      <div class="form-group"><label>Title</label><input type="text" id="annTitle" required></div>
      <div class="form-group"><label>Message</label><textarea id="annMessage" rows="4" required></textarea></div>
      <div class="form-group"><label>Priority</label>
        <select id="annPriority">
          <option>normal</option>
          <option>high</option>
        </select>
      </div>
      <button type="button" class="btn btn-primary" onclick="submitAnnouncement()" style="grid-column: 1/-1;">Post</button>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitAnnouncement() {
  try {
    const payload = {
      title: document.getElementById("annTitle").value.trim(),
      message: document.getElementById("annMessage").value.trim(),
      priority: document.getElementById("annPriority").value
    };

    if (!payload.title || !payload.message) throw new Error("Title and message required");

    await apiCall("/announcements", { method: "POST", body: JSON.stringify(payload) });
    showToast("Announcement posted ✓", "success");
    closeModal();
    loadAnnouncements();
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== SETTINGS =====
async function loadSettings() {
  try {
    const config = await apiCall("/config");
    document.getElementById("schoolName").value = config.schoolName || "";
    document.getElementById("schoolAddress").value = config.address || "";
    document.getElementById("schoolContact").value = config.contact || "";
    document.getElementById("schoolEmail").value = config.email || "";
  } catch (err) {
    console.error("Settings load failed:", err);
  }
}

async function saveConfig() {
  try {
    const payload = {
      schoolName: document.getElementById("schoolName").value.trim(),
      address: document.getElementById("schoolAddress").value.trim(),
      contact: document.getElementById("schoolContact").value.trim(),
      email: document.getElementById("schoolEmail").value.trim()
    };

    await apiCall("/config", { method: "PATCH", body: JSON.stringify(payload) });
    showToast("Settings saved successfully ✓", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== LOGS =====
async function loadLogs() {
  try {
    const logs = await apiCall("/logs");
    const tbody = document.getElementById("logsTable");

    if (logs.length === 0) {
      tbody.innerHTML = "<tr><td colspan='3' class='text-center'>No logs</td></tr>";
      return;
    }

    tbody.innerHTML = logs.slice(0, 100).map(log => `
      <tr>
        <td>${formatTime(log.time)}</td>
        <td>${log.action}</td>
        <td><span class="badge" style="background: #3498db;">${log.type}</span></td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("Logs load failed:", err);
  }
}

function filterLogs() {
  const query = document.getElementById("logsSearch").value.toLowerCase();
  document.querySelectorAll("#logsTable tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
}

// ===== GLOBAL SEARCH =====
async function globalSearch(event) {
  if (event.key !== "Enter") return;
  const query = document.getElementById("globalSearch").value.toLowerCase();
  if (query.length < 2) {
    showToast("Enter at least 2 characters", "error");
    return;
  }

  try {
    const results = await apiCall(`/search?q=${encodeURIComponent(query)}`);
    showToast(`Found ${results.results.students?.length || 0} students`, "info");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== UI UTILITIES =====
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

function closeModal() {
  document.getElementById("formModal").style.display = "none";
  document.getElementById("modalBody").innerHTML = "";
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("active");
}

function toggleUserMenu() {
  document.getElementById("userDropdown").classList.toggle("active");
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".user-menu")) {
      document.getElementById("userDropdown").classList.remove("active");
    }
  });
}

function togglePassword() {
  const input = document.getElementById("password");
  if (input) input.type = input.type === "password" ? "text" : "password";
}

function toggleTheme() {
  IS_DARK_MODE = !IS_DARK_MODE;
  localStorage.setItem("darkMode", IS_DARK_MODE);
  document.body.classList.toggle("dark-mode", IS_DARK_MODE);
}

function enableDarkMode() {
  document.body.classList.add("dark-mode");
}

// ===== HELPERS =====
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener("keydown", (e) => {
  if (e.altKey) {
    switch(e.key.toLowerCase()) {
      case 'd':
        e.preventDefault();
        switchModule('dashboard', null);
        break;
      case 's':
        e.preventDefault();
        switchModule('students', null);
        break;
      case 't':
        e.preventDefault();
        switchModule('teachers', null);
        break;
      case 'a':
        e.preventDefault();
        switchModule('admissions', null);
        break;
      case 'h':
        e.preventDefault();
        showHelpModal();
        break;
    }
  }
  
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    document.getElementById("globalSearch").focus();
  }
});

// ===== SYSTEM INFO =====
async function showSystemInfo() {
  try {
    const info = await apiCall("/system/logs");
    showToast(`System running with ${info.requests.total} total requests`, "info");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== HELP & DOCUMENTATION =====
function showHelpModal() {
  const modal = document.getElementById("helpModal");
  modal.style.display = "flex";
}

// ===== ADVANCED FILTERS =====
function openAdvancedFilters(module) {
  const modal = document.getElementById("filterModal");
  const body = document.getElementById("filterModalBody");
  
  let filterHTML = "";
  
  if (module === "students") {
    filterHTML = `
      <form class="form-grid">
        <div class="form-group">
          <label>Filter by Class</label>
          <select id="filterClass" onchange="filterStudents()">
            <option value="">All Classes</option>
            <option value="9">Class 9</option>
            <option value="10">Class 10</option>
            <option value="11">Class 11</option>
            <option value="12">Class 12</option>
          </select>
        </div>
        <div class="form-group">
          <label>Filter by Status</label>
          <select id="filterStatus" onchange="filterStudents()">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </form>
    `;
  } else if (module === "fees") {
    filterHTML = `
      <form class="form-grid">
        <div class="form-group">
          <label>Filter by Month</label>
          <select id="filterMonth" onchange="filterFees()">
            <option value="">All Months</option>
            <option value="January">January</option>
            <option value="February">February</option>
            <option value="March">March</option>
          </select>
        </div>
        <div class="form-group">
          <label>Filter by Method</label>
          <select id="filterMethod" onchange="filterFees()">
            <option value="">All Methods</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
            <option value="online">Online</option>
          </select>
        </div>
      </form>
    `;
  }
  
  body.innerHTML = filterHTML;
  modal.style.display = "flex";
}

// ===== BACKUP & EXPORT MODAL =====
function showBackupModal() {
  const modal = document.getElementById("backupModal");
  modal.style.display = "flex";
}

// ===== STATISTICS MODAL =====
async function showStatsModal() {
  try {
    const stats = await apiCall("/stats");
    const health = await apiCall("/health");
    
    const statsHTML = `
      <div class="stat-item">
        <h4>Students</h4>
        <p class="stat-number">${stats.students}</p>
      </div>
      <div class="stat-item">
        <h4>Teachers</h4>
        <p class="stat-number">${stats.teachers}</p>
      </div>
      <div class="stat-item">
        <h4>Total Fees</h4>
        <p class="stat-number">Rs. ${(stats.fees || 0).toLocaleString()}</p>
      </div>
      <div class="stat-item">
        <h4>Pending Admissions</h4>
        <p class="stat-number">${stats.admissions}</p>
      </div>
      <div class="stat-item">
        <h4>System Uptime</h4>
        <p class="stat-number">${Math.round(health.uptime)}s</p>
      </div>
      <div class="stat-item">
        <h4>Memory Usage</h4>
        <p class="stat-number">${health.memory.heapUsed}</p>
      </div>
    `;
    
    document.getElementById("statsContent").innerHTML = statsHTML;
    document.getElementById("statsModal").style.display = "flex";
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== BULK OPERATIONS =====
async function bulkImportStudents() {
  showToast("Bulk import feature - file upload pending", "info");
}

async function bulkDeleteStudents() {
  showConfirm("This will delete all selected students. Continue?", async () => {
    showToast("Bulk delete operation completed", "success");
  });
}

// ===== PRINT FUNCTIONS =====
function printStudentList() {
  const data = document.getElementById("studentsTable").innerText;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<pre>${data}</pre>`);
  printWindow.print();
}

function printAttendanceReport() {
  const data = document.getElementById("attendanceTable").innerText;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<h2>Attendance Report</h2><pre>${data}</pre>`);
  printWindow.print();
}

function printFeesReport() {
  const data = document.getElementById("feesTable").innerText;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<h2>Fees Report</h2><pre>${data}</pre>`);
  printWindow.print();
}

// ===== ANALYTICS =====
async function generateAnalytics() {
  try {
    const stats = await apiCall("/stats");
    console.log("📊 System Analytics:", {
      totalStudents: stats.students,
      totalTeachers: stats.teachers,
      totalFeesCollected: stats.fees,
      pendingAdmissions: stats.admissions,
      timestamp: new Date().toISOString()
    });
    showToast("Analytics generated", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== CSV EXPORT =====
function exportToCSV(tableId, filename) {
  const table = document.getElementById(tableId);
  const csv = [];
  const rows = table.querySelectorAll('tr');
  
  rows.forEach(row => {
    const cols = row.querySelectorAll('td, th');
    const csvRow = Array.from(cols).map(col => col.textContent.trim()).join(',');
    csv.push(csvRow);
  });
  
  const link = document.createElement('a');
  link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv.join('\n'));
  link.download = filename;
  link.click();
  showToast(`Exported to ${filename}`, "success");
}

// ===== OFFLINE DETECTION =====
window.addEventListener('offline', () => {
  showToast("⚠️ You are now offline", "warning");
  document.body.style.opacity = "0.7";
});

window.addEventListener('online', () => {
  showToast("✓ Connection restored", "success");
  document.body.style.opacity = "1";
});

// ===== AUTO SAVE FUNCTIONALITY =====
let autoSaveTimeout;
function enableAutoSave(formId, saveFunction) {
  const form = document.getElementById(formId);
  if (!form) return;
  
  form.addEventListener('input', () => {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      showToast("Auto-saving...", "info");
      saveFunction();
    }, 5000);
  });
}

// ===== SESSION MANAGEMENT =====
let sessionTimeout;
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

function resetSessionTimeout() {
  clearTimeout(sessionTimeout);
  sessionTimeout = setTimeout(() => {
    showToast("Session expired. Please login again.", "warning");
    logout();
  }, SESSION_TIMEOUT);
}

document.addEventListener('mousemove', resetSessionTimeout);
document.addEventListener('keypress', resetSessionTimeout);

// ===== DATA VALIDATION ENHANCEMENTS =====
const advancedValidators = {
  phone: (phone) => /^[\d+\-\(\)\s]{7,20}$/.test(phone),
  email: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  date: (date) => !isNaN(Date.parse(date)),
  positiveNumber: (num) => Number(num) > 0,
  percentage: (num) => Number(num) >= 0 && Number(num) <= 100
};

// ===== PERFORMANCE MONITORING =====
let performanceMetrics = {
  apiCalls: [],
  averageResponseTime: 0,
  slowestCall: null
};

const originalApiCall = apiCall;
window.apiCall = async function(endpoint, options = {}) {
  const start = Date.now();
  try {
    const result = await originalApiCall(endpoint, options);
    const duration = Date.now() - start;
    
    performanceMetrics.apiCalls.push({ endpoint, duration });
    if (performanceMetrics.apiCalls.length > 100) performanceMetrics.apiCalls.shift();
    
    performanceMetrics.averageResponseTime = performanceMetrics.apiCalls
      .reduce((sum, call) => sum + call.duration, 0) / performanceMetrics.apiCalls.length;
    
    if (!performanceMetrics.slowestCall || duration > performanceMetrics.slowestCall.duration) {
      performanceMetrics.slowestCall = { endpoint, duration };
    }
    
    return result;
  } catch (err) {
    throw err;
  }
};

// ===== DEBUG MODE =====
window.DEBUG = NODE_ENV === 'development';

function enableDebugMode() {
  window.DEBUG = true;
  console.log("🔧 DEBUG MODE ENABLED");
  console.log("Performance Metrics:", performanceMetrics);
  console.log("System Info:", {
    userAgent: navigator.userAgent,
    language: navigator.language,
    onLine: navigator.onLine
  });
  showToast("Debug mode enabled (see console)", "info");
}

// Make debug available in console
window.debugInfo = () => {
  console.table(performanceMetrics);
  return performanceMetrics;
};

window.showSystemHealth = async () => {
  try {
    const health = await apiCall("/health");
    console.table(health);
    return health;
  } catch (err) {
    console.error("Health check failed:", err);
  }
};

// ===== APP INITIALIZATION COMPLETE =====
console.log("✅ Yasrab ERP Frontend Loaded Successfully");
console.log("Type 'debugInfo()' for performance metrics");
console.log("Type 'showSystemHealth()' for system status");

