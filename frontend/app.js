
/* ===== YASRAB ERP — FRONTEND LOGIC ===== */

let currentUser = null;
let currentModule = "dashboard";
let apiToken = localStorage.getItem("yasrab_token");

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", () => {
  if (apiToken) {
    showApp();
    loadModuleData(currentModule);
  } else {
    showLogin();
  }

  // Login Form
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  // Sidebar toggle for mobile
  window.toggleSidebar = () => {
    document.getElementById("sidebar").classList.toggle("open");
    document.getElementById("sidebarOverlay").classList.toggle("open");
  };

  window.closeSidebar = () => {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("open");
  };

  // Clock in Dashboard
  setInterval(updateClock, 1000);
  updateClock();
});

// ===== AUTHENTICATION =====
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("user").value;
  const password = document.getElementById("pass").value;

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (data.success) {
      apiToken = data.token;
      localStorage.setItem("yasrab_token", apiToken);
      showToast("Welcome back, Administrator!", "success");
      showApp();
      loadModuleData("dashboard");
    } else {
      showToast(data.msg || "Invalid credentials", "error");
    }
  } catch (err) {
    showToast("Server connection failed", "error");
  }
}

function showApp() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("mainApp").style.display = "flex";
}

function showLogin() {
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("mainApp").style.display = "none";
}

window.logout = () => {
  localStorage.removeItem("yasrab_token");
  apiToken = null;
  location.reload();
};

// ===== API HELPERS =====
async function apiCall(endpoint, method = "GET", body = null) {
  const headers = {
    "Authorization": `Bearer ${apiToken}`
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("API Error:", err);
    showToast("Connection error", "error");
    return null;
  }
}

// ===== NAVIGATION =====
window.openModule = (moduleName, event) => {
  if (event) event.preventDefault();
  
  // Update UI
  document.querySelectorAll(".view").forEach(v => v.style.display = "none");
  const view = document.getElementById(moduleName);
  if (view) view.style.display = "block";
  
  document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
  const navItem = document.querySelector(`.nav-item[data-module="${moduleName}"]`);
  if (navItem) navItem.classList.add("active");

  const pageTitle = document.getElementById("pageTitle");
  if (pageTitle) pageTitle.innerText = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
  currentModule = moduleName;
  
  loadModuleData(moduleName);
  closeSidebar();
};

// ===== DATA LOADING =====
function loadModuleData(module) {
  switch (module) {
    case "dashboard": loadDashboardStats(); break;
    case "admissions": loadAdmissions(); break;
    case "students": loadStudents(); break;
    case "teachers": loadTeachers(); break;
    case "attendance": loadAttendanceSheet(); break;
    case "fees": loadFees(); break;
    case "results": loadResults(); break;
    case "timetable": loadTimetable(); break;
    case "announcements": loadAnnouncements(); break;
    case "logs": showLogs(); break;
    case "settings": loadSettings(); break;
  }
}

// ===== DASHBOARD =====
async function loadDashboardStats() {
  const stats = await apiCall("/stats");
  if (!stats) return;

  if (document.getElementById("sCount")) document.getElementById("sCount").innerText = stats.students || 0;
  if (document.getElementById("tCount")) document.getElementById("tCount").innerText = stats.teachers || 0;
  if (document.getElementById("admCount")) document.getElementById("admCount").innerText = stats.admissions || 0;
  if (document.getElementById("fCount")) document.getElementById("fCount").innerText = (stats.fees || 0).toLocaleString();
  if (document.getElementById("badgeStudents")) document.getElementById("badgeStudents").innerText = stats.students || 0;

  // Recent Logs
  const logsCont = document.getElementById("recentLogs");
  if (logsCont) {
    logsCont.innerHTML = (stats.recentLogs || []).map(log => `
      <div class="stream-item">
        <div class="stream-icon"><i class="fas fa-history"></i></div>
        <div class="stream-meta">
          <strong>${log.action}</strong>
          <small>${timeAgo(log.time)}</small>
        </div>
      </div>
    `).join("") || '<p class="empty-state">No recent activities</p>';
  }

  // Recent Students
  const studentsCont = document.getElementById("recentStudents");
  if (studentsCont) {
    studentsCont.innerHTML = (stats.recentStudents || []).map(s => `
      <div class="stream-item">
        <div class="stream-avatar"><i class="fas fa-user"></i></div>
        <div class="stream-meta">
          <strong>${s.name}</strong>
          <small>Class: ${s.class}</small>
        </div>
      </div>
    `).join("") || '<p class="empty-state">No students enrolled yet</p>';
  }
}

// ===== ADMISSIONS =====
async function loadAdmissions() {
  const data = await apiCall("/admissions");
  if (!data) return;
  const tbody = document.getElementById("admissionsTableBody");
  if (tbody) {
    tbody.innerHTML = data.map(adm => `
      <tr>
        <td>${adm.id}</td>
        <td><strong>${adm.name}</strong><br><small>${adm.phone || ""}</small></td>
        <td>${adm.class}</td>
        <td><span class="badge ${adm.status}">${adm.status}</span></td>
        <td>
          ${adm.status === 'pending' ? `
            <button class="tbl-btn approve" onclick="updateAdmissionStatus('${adm.id}', 'approved')">Approve</button>
            <button class="tbl-btn del" onclick="updateAdmissionStatus('${adm.id}', 'rejected')"><i class="fas fa-times"></i></button>
          ` : '--'}
        </td>
      </tr>
    `).join("");
  }
}

window.submitAdmission = async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById("admName").value,
    father: document.getElementById("admFather").value,
    class: document.getElementById("admClass").value,
    phone: document.getElementById("admPhone").value,
    address: document.getElementById("admAddress").value
  };
  const res = await apiCall("/admissions", "POST", body);
  if (res && res.success) {
    showToast("Application submitted successfully", "success");
    e.target.reset();
    toggleForm("admissionForm");
    loadAdmissions();
  }
};

window.updateAdmissionStatus = async (id, status) => {
  const res = await apiCall("/admissions/" + id, "PATCH", { status });
  if (res && res.success) {
    showToast("Admission " + status, "info");
    loadAdmissions();
    loadDashboardStats();
  }
};

// ===== STUDENTS =====
async function loadStudents() {
  const data = await apiCall("/students");
  if (!data) return;
  window.allStudents = data;
  renderStudents(data);
}

function renderStudents(students) {
  const tbody = document.getElementById("studentsTableBody");
  if (tbody) {
    tbody.innerHTML = students.map(s => `
      <tr>
        <td><code>${s.id}</code></td>
        <td>${s.name}</td>
        <td>${s.class}</td>
        <td><span class="tag">Active</span></td>
        <td>
          <button class="tbl-btn view" onclick="viewStudent('${s.id}')"><i class="fas fa-eye"></i></button>
          <button class="tbl-btn del" onclick="deleteStudent('${s.id}')"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join("");
  }
}

window.liveSearch = () => {
  const val = document.getElementById("searchStudent").value.toLowerCase();
  const filtered = (window.allStudents || []).filter(s => 
    s.name.toLowerCase().includes(val) || s.id.toLowerCase().includes(val) || s.class.toLowerCase().includes(val)
  );
  renderStudents(filtered);
};

window.addStudent = async (e) => {
  e.preventDefault();
  clearFormErrors("studentForm");

  const studentId = document.getElementById("studentId")?.value || "";
  const studentName = document.getElementById("studentName")?.value || "";
  const studentClass = document.getElementById("studentClass")?.value || "";
  const phone = document.getElementById("studentPhone")?.value || "";
  const address = document.getElementById("studentAddress")?.value || "";

  // Client-side validation
  const errors = validateForm(
    { studentId, studentName, studentClass, phone, address },
    [
      { name: "studentId", type: "studentId", required: true },
      { name: "studentName", type: "name", required: true },
      { name: "studentClass", type: "", required: true },
      { name: "phone", type: "phone", required: false },
      { name: "address", type: "", required: false }
    ]
  );

  if (Object.keys(errors).length > 0) {
    displayErrors(errors, "studentForm");
    showToast("Please fix the errors in the form", "error");
    return;
  }

  const body = {
    id: studentId.trim(),
    name: studentName.trim(),
    class: studentClass.trim(),
    phone: phone.trim(),
    address: address.trim()
  };

  const res = await apiCall("/students", "POST", body);
  if (res && res.success) {
    showToast("✅ Student added successfully", "success");
    e.target.reset();
    clearFormErrors("studentForm");
    toggleForm("studentForm");
    loadStudents();
  } else {
    const errorMsg = res?.msg || res?.error || "Failed to add student";
    showToast(errorMsg, "error");
    if (res?.fields) {
      const fieldErrors = {};
      res.fields.forEach(f => fieldErrors[f] = `Invalid ${f}`);
      displayErrors(fieldErrors, "studentForm");
    }
  }
};

window.deleteStudent = async (id) => {
  if (!confirm("Are you sure you want to delete this student?")) return;
  const res = await apiCall("/students/" + id, "DELETE");
  if (res && res.success) {
    showToast("Student deleted", "info");
    loadStudents();
  }
};

window.viewStudent = async (id) => {
  const s = (window.allStudents || []).find(st => st.id === id);
  if (!s) return;
  
  const modalBody = document.getElementById("modalBody");
  if (modalBody) {
    modalBody.innerHTML = `
      <div class="profile-wrap">
        <div class="profile-avatar"><i class="fas fa-user"></i></div>
        <div class="profile-name">${s.name}</div>
        <div class="profile-id">ID: ${s.id}</div>
        <div class="profile-fields">
          <div class="pf-row"><span>Class:</span><span>${s.class}</span></div>
          <div class="pf-row"><span>Enrolled:</span><span>${s.enrolledDate ? new Date(s.enrolledDate).toLocaleDateString() : 'N/A'}</span></div>
          <div class="pf-row"><span>Status:</span><span>Active</span></div>
        </div>
      </div>
    `;
    document.getElementById("profileModal").style.display = "flex";
  }
};

// ===== TEACHERS =====
async function loadTeachers() {
  const data = await apiCall("/teachers");
  if (!data) return;
  const cont = document.getElementById("teachersList");
  if (cont) {
    cont.innerHTML = data.map(t => `
      <div class="faculty-card">
        <div class="faculty-avatar"><i class="fas fa-chalkboard-user"></i></div>
        <div class="faculty-name">${t.name}</div>
        <div class="faculty-subject">${t.subject}</div>
      </div>
    `).join("") || '<p class="empty-state">No faculty members registered</p>';
  }
}

window.addTeacher = async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById("teacherName").value,
    subject: document.getElementById("teacherSubject").value
  };
  const res = await apiCall("/teachers", "POST", body);
  if (res && res.success) {
    showToast("Faculty registered", "success");
    e.target.reset();
    toggleForm("teacherForm");
    loadTeachers();
  }
};

// ===== ATTENDANCE =====
async function loadAttendanceSheet() {
  let date = document.getElementById("attendanceDate").value;
  if (!date) {
    date = new Date().toISOString().split("T")[0];
    document.getElementById("attendanceDate").value = date;
  }
  const data = await apiCall("/attendance/" + date);
  if (!data) return;
  const tbody = document.getElementById("attendanceSheet");
  if (tbody) {
    tbody.innerHTML = data.length ? data.map(a => `
      <tr>
        <td><code>${a.id}</code></td>
        <td><span class="badge ${a.status}">${a.status}</span></td>
        <td>${new Date(a.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
      </tr>
    `).join("") : '<tr><td colspan="3" class="empty-state">No attendance records for this date</td></tr>';
  }
}

window.loadAttendanceSheet = loadAttendanceSheet;

window.markAttendance = async (e) => {
  e.preventDefault();
  const body = {
    id: document.getElementById("attendanceStudentId").value,
    status: document.getElementById("attendanceStatus").value
  };
  const res = await apiCall("/attendance", "POST", body);
  if (res && res.success) {
    showToast("Attendance marked", "success");
    e.target.reset();
    loadAttendanceSheet();
  }
};

window.onAttendanceDateChange = () => {
  loadAttendanceSheet();
};

// ===== FEES =====
async function loadFees() {
  const data = await apiCall("/fees");
  if (!data) return;
  const tbody = document.getElementById("feesList");
  if (tbody) {
    tbody.innerHTML = Object.keys(data).flatMap(id => data[id].map(f => `
      <tr>
        <td>#F-${Math.random().toString(36).substr(2, 5).toUpperCase()}</td>
        <td><code>${id}</code></td>
        <td>PKR ${f.amount}</td>
        <td>${f.month}</td>
        <td>${new Date(f.date).toLocaleDateString()}</td>
      </tr>
    `)).join("") || '<tr><td colspan="5" class="empty-state">No fee records found</td></tr>';
  }
}

window.payFee = async (e) => {
  e.preventDefault();
  const body = {
    id: document.getElementById("feeStudentId").value,
    amount: document.getElementById("feeAmount").value,
    month: document.getElementById("feeMonth").value
  };
  const res = await apiCall("/fees", "POST", body);
  if (res && res.success) {
    showToast("Fee payment recorded", "success");
    e.target.reset();
    toggleForm("feeForm");
    loadFees();
    loadDashboardStats();
  }
};

// ===== RESULTS =====
async function loadResults() {
  const data = await apiCall("/results");
  if (!data) return;
  const cont = document.getElementById("resultsList");
  if (cont) {
    cont.innerHTML = Object.keys(data).flatMap(id => data[id].map(r => `
      <div class="result-card">
        <div class="result-left">
          <strong>${r.subject}</strong>
          <small>Student: ${id} • ${new Date(r.date).toLocaleDateString()}</small>
          <div class="grade-bar"><div class="grade-fill" style="width: ${r.marks}%"></div></div>
        </div>
        <div class="result-score">
          <div class="marks">${r.marks}</div>
          <div class="total">/ ${r.total}</div>
        </div>
      </div>
    `)).join("") || '<p class="empty-state">No examination results posted</p>';
  }
}

window.addResult = async (e) => {
  e.preventDefault();
  const body = {
    id: document.getElementById("resultStudentId").value,
    subject: document.getElementById("resultSubject").value,
    marks: document.getElementById("resultMarks").value,
    total: document.getElementById("resultTotal").value
  };
  const res = await apiCall("/results", "POST", body);
  if (res && res.success) {
    showToast("Result posted successfully", "success");
    e.target.reset();
    toggleForm("resultForm");
    loadResults();
  }
};

// ===== TIMETABLE =====
async function loadTimetable() {
  const data = await apiCall("/timetable");
  if (!data) return;
  const cont = document.getElementById("timetableList");
  if (cont) {
    cont.innerHTML = Object.keys(data).map(cls => `
      <div class="tt-class-block">
        <div class="tt-class-title">${cls}</div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Day</th><th>Subject</th><th>Time</th></tr></thead>
            <tbody>
              ${data[cls].map(t => `
                <tr><td>${t.day}</td><td><strong>${t.subject}</strong></td><td>${t.time}</td></tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `).join("") || '<p class="empty-state">No schedules defined</p>';
  }
}

window.addTimetable = async (e) => {
  e.preventDefault();
  const body = {
    className: document.getElementById("timetableClass").value,
    subject: document.getElementById("timetableSubject").value,
    day: document.getElementById("timetableDay").value,
    time: document.getElementById("timetableTime").value
  };
  const res = await apiCall("/timetable", "POST", body);
  if (res && res.success) {
    showToast("Schedule updated", "success");
    e.target.reset();
    toggleForm("timetableForm");
    loadTimetable();
  }
};

// ===== ANNOUNCEMENTS =====
async function loadAnnouncements() {
  const data = await apiCall("/announcements");
  if (!data) return;
  const cont = document.getElementById("announcementsList");
  if (cont) {
    cont.innerHTML = data.map(ann => `
      <div class="notice-card">
        <strong>${ann.title}</strong>
        <p>${ann.message}</p>
        <small><i class="far fa-clock"></i> ${new Date(ann.time).toLocaleString()}</small>
      </div>
    `).join("") || '<p class="empty-state">No announcements published</p>';
  }
}

window.addAnnouncement = async (e) => {
  e.preventDefault();
  const body = {
    title: document.getElementById("annTitle").value,
    message: document.getElementById("annMsg").value
  };
  const res = await apiCall("/announcements", "POST", body);
  if (res && res.success) {
    showToast("Notice published", "success");
    e.target.reset();
    toggleForm("annForm");
    loadAnnouncements();
  }
};

// ===== LOGS =====
async function showLogs() {
  const data = await apiCall("/logs");
  if (!data) return;
  const cont = document.getElementById("logsList");
  if (cont) {
    cont.innerHTML = data.map(log => `
      <div class="log-item">
        <div class="log-dot ${log.type}"></div>
        <div class="log-meta">
          <strong>${log.action}</strong>
          <small>${new Date(log.time).toLocaleString()}</small>
        </div>
        <div class="log-type">${log.type}</div>
      </div>
    `).join("");
  }
}

// ===== SETTINGS =====
async function loadSettings() {
  const config = await apiCall("/config");
  if (config) {
    if (document.getElementById("confName")) document.getElementById("confName").value = config.schoolName;
    if (document.getElementById("confAddress")) document.getElementById("confAddress").value = config.address;
    if (document.getElementById("confContact")) document.getElementById("confContact").value = config.contact;
    if (document.getElementById("confEmail")) document.getElementById("confEmail").value = config.email;
  }
}

window.saveConfig = async () => {
  const body = {
    schoolName: document.getElementById("confName").value,
    address: document.getElementById("confAddress").value,
    contact: document.getElementById("confContact").value,
    email: document.getElementById("confEmail").value
  };
  const res = await apiCall("/config", "PATCH", body);
  if (res && res.success) {
    showToast("Settings updated", "success");
    loadSettings();
  }
};

// ===== UTILS =====
window.toggleForm = (id) => {
  const form = document.getElementById(id);
  if (form) form.style.display = form.style.display === "none" ? "block" : "none";
};

window.closeModal = () => {
  const modal = document.getElementById("profileModal");
  if (modal) modal.style.display = "none";
};

window.showToast = (msg, type) => {
  const cont = document.getElementById("toastContainer");
  if (!cont) return;
  const toast = document.createElement("div");
  toast.className = "toast " + (type || "info");
  toast.innerHTML = '<i class="fas ' + (type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info') + '"></i> <span>' + msg + '</span>';
  cont.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
};

window.toggleTheme = () => {
  const theme = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("yasrab_theme", theme);
};

if (localStorage.getItem("yasrab_theme") === "dark") {
  document.body.setAttribute("data-theme", "dark");
}

function updateClock() {
  const now = new Date();
  if (document.getElementById("dashTime")) {
    document.getElementById("dashTime").innerText = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }
  if (document.getElementById("dashDate")) {
    document.getElementById("dashDate").innerText = now.toLocaleDateString([], {weekday: 'long', month: 'short', day: 'numeric'});
  }
  if (document.getElementById("greetTime")) {
    const hrs = now.getHours();
    document.getElementById("greetTime").innerText = hrs < 12 ? "Morning" : hrs < 17 ? "Afternoon" : "Evening";
  }
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval > 1) return interval + " years ago";
  interval = Math.floor(seconds / 2592000);
  if (interval > 1) return interval + " months ago";
  interval = Math.floor(seconds / 86400);
  if (interval > 1) return interval + " days ago";
  interval = Math.floor(seconds / 3600);
  if (interval > 1) return interval + " hours ago";
  interval = Math.floor(seconds / 60);
  if (interval > 1) return interval + " minutes ago";
  return "just now";
}

window.exportData = () => {
  window.open("/export", "_blank");
};
