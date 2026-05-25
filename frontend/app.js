// ===== GLOBAL STATE & CONSTANTS =====
let AUTH_TOKEN = localStorage.getItem("token") || null;
let REFRESH_TOKEN = localStorage.getItem("refreshToken") || null;
let TOKEN_EXPIRY = localStorage.getItem("tokenExpiry") || null;
let CURRENT_MODULE = "dashboard";
let CURRENT_DATA = {};
let IS_DARK_MODE = localStorage.getItem("darkMode") === "true";
const API_BASE = window.location.origin;

const FRONTEND_VALIDATORS = {
  studentId: (id) => /^[A-Za-z0-9\-]{1,20}$/.test(String(id || '').trim()),
  name: (name) => /^[A-Za-z\s]{2,100}$/.test(String(name || '').trim()),
  cls: (cls) => /^[0-9A-Za-z\- ]{1,20}$/.test(String(cls || '').trim()),
  email: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()),
  phone: (phone) => /^[\d+\-\(\)\s]{7,20}$/.test(String(phone || '').trim()),
  amount: (amount) => Number(amount) > 0 && Number(amount) < 10000000,
  marks: (marks) => Number(marks) >= 0 && Number(marks) <= 100,
  required: (value) => String(value || '').trim().length > 0,
  time: (value) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '')),
  date: (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
};

function parseApiError(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  return 'Server error. Please try again.';
}

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", async () => {
  // Check theme
  if (IS_DARK_MODE) enableDarkMode();

  const todayInput = document.getElementById("attendanceDate");
  if (todayInput) todayInput.valueAsDate = new Date();

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  // Keyboard Shortcuts Listener
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      document.getElementById("globalSearch")?.focus();
    }
    if (e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      switchModule('dashboard');
    }
    if (e.key === "Escape") {
      closeModal();
      closeConfirm();
    }
  });

  // Initial routing
  if (AUTH_TOKEN) {
    try {
      await loadDashboard();
      showApp();
      checkServerStatus(); // Start heartbeat
    } catch (err) {
      console.error("Failed to load initial data:", err);
      showLogin();
    }
  } else {
    // Small delay for branding effect
    setTimeout(showLogin, 800);
  }
});

async function checkServerStatus() {
  const dot = document.querySelector(".status-dot");
  const text = document.querySelector(".status-indicator span");
  
  setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) {
        dot.style.background = "var(--success)";
        dot.style.boxShadow = "0 0 10px var(--success)";
        text.textContent = "System Online";
      } else {
        throw new Error();
      }
    } catch (err) {
      dot.style.background = "var(--danger)";
      dot.style.boxShadow = "0 0 10px var(--danger)";
      text.textContent = "System Offline";
    }
  }, 30000); // Check every 30 seconds
}


// ===== AUTHENTICATION =====
async function handleLogin(e) {
  e.preventDefault();
  const loginBtn = e.target.querySelector(".btn-login");
  const originalContent = loginBtn.innerHTML;

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    showToast("Please enter credentials", "error");
    return;
  }

  try {
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in...';
    loginBtn.disabled = true;

    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message || data.msg || "Login failed");
    if (!data.accessToken) throw new Error("No token received");

    AUTH_TOKEN = data.accessToken;
    REFRESH_TOKEN = data.refreshToken;
    TOKEN_EXPIRY = Date.now() + (data.expiresIn * 1000);

    localStorage.setItem("token", AUTH_TOKEN);
    localStorage.setItem("refreshToken", REFRESH_TOKEN);
    localStorage.setItem("tokenExpiry", TOKEN_EXPIRY);

    showToast("Welcome back! Login successful ✓", "success");

    document.getElementById("username").value = "";
    document.getElementById("password").value = "";

    await loadDashboard();
    showApp();
    startTokenRefreshTimer();
  } catch (err) {
    showToast(err.message || "Login error", "error");
    console.error("Login error:", err);
  } finally {
    loginBtn.innerHTML = originalContent;
    loginBtn.disabled = false;
  }
}

async function refreshAccessToken() {
  try {
    if (!REFRESH_TOKEN) throw new Error('No refresh token available');

    const res = await fetch(`${API_BASE}/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: REFRESH_TOKEN })
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        logout();
        return false;
      }
      throw new Error(data.message);
    }

    AUTH_TOKEN = data.accessToken;
    TOKEN_EXPIRY = Date.now() + (data.expiresIn * 1000);
    localStorage.setItem("token", AUTH_TOKEN);
    localStorage.setItem("tokenExpiry", TOKEN_EXPIRY);

    console.log("✅ Token refreshed successfully");
    return true;
  } catch (err) {
    console.error("Token refresh failed:", err);
    logout();
    return false;
  }
}

function startTokenRefreshTimer() {
  setInterval(() => {
    if (TOKEN_EXPIRY && Date.now() > TOKEN_EXPIRY - 300000) {
      refreshAccessToken();
    }
  }, 60000);
}

function logout() {
  showConfirm("Are you sure you want to logout? Your session will be ended.", async () => {
    try {
      await apiCall("/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout API error:", err);
    }

    AUTH_TOKEN = null;
    REFRESH_TOKEN = null;
    TOKEN_EXPIRY = null;
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("tokenExpiry");
    showLogin();
    showToast("Logged out successfully", "info");
  });
}

// ===== UI NAVIGATION =====
function showLogin() {
  const loader = document.getElementById("loadingScreen");
  if (loader) {
    loader.style.opacity = "0";
    setTimeout(() => {
      loader.style.display = "none";
      document.getElementById("loginPage").style.display = "flex";
      document.getElementById("mainApp").style.display = "none";
      document.getElementById("speedDial").style.display = "none";
    }, 300);
  } else {
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("mainApp").style.display = "none";
    document.getElementById("speedDial").style.display = "none";
  }
}

function showApp() {
  const loader = document.getElementById("loadingScreen");
  if (loader) {
    loader.style.opacity = "0";
    setTimeout(() => {
      loader.style.display = "none";
      document.getElementById("loginPage").style.display = "none";
      document.getElementById("mainApp").style.display = "flex";
      document.getElementById("speedDial").style.display = "block";
    }, 300);
  } else {
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainApp").style.display = "flex";
    document.getElementById("speedDial").style.display = "block";
  }
}

function switchModule(module, event) {
  if (event) event.preventDefault();

  document.querySelectorAll(".module-content").forEach(el => el.style.display = "none");
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));

  const moduleEl = document.getElementById(`module-${module}`);
  if (moduleEl) {
    moduleEl.style.display = "block";
    moduleEl.classList.add("active");
  }

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
  
  // Close sidebar on mobile after selection
  if (window.innerWidth <= 768) {
    document.getElementById("sidebar").classList.remove("active");
  }
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
  if (breadcrumb) {
    breadcrumb.innerHTML = `
      <i class="fas fa-home" style="margin-right: 8px; opacity: 0.5;"></i>
      <span>Yasrab ERP</span>
      <i class="fas fa-chevron-right" style="margin: 0 10px; font-size: 0.8rem; opacity: 0.3;"></i>
      <span style="font-weight: 700; color: var(--primary);">${breadcrumbMap[module] || module}</span>
    `;
  }
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

    let res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      const data = await res.json().catch(() => ({}));
      if (data.error === 'TOKEN_EXPIRED' && REFRESH_TOKEN) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          headers.Authorization = `Bearer ${AUTH_TOKEN}`;
          res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
          });
        } else {
          logout();
          throw new Error("Session expired. Please login again.");
        }
      } else {
        logout();
        throw new Error(data.message || "Session expired. Please login again.");
      }
    }

    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

    if (!res.ok) {
      const err = new Error(body?.message || body?.msg || body?.error || `Error: ${res.status}`);
      err.code = body?.error;
      err.details = body?.details;
      throw err;
    }

    return body !== null ? body : {};
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      showToast("Network Error: Please check your connection", "error");
    }
    throw err;
  }
}

// ===== ULTRA PRODUCTION ENHANCEMENTS (Additive) =====
function toggleSpeedDial() {
  document.getElementById("speedDial").classList.toggle("active");
  // Close speed dial when clicking outside
  const closeDial = (e) => {
    if (!e.target.closest("#speedDial")) {
      document.getElementById("speedDial").classList.remove("active");
      document.removeEventListener("click", closeDial);
    }
  };
  setTimeout(() => document.addEventListener("click", closeDial), 10);
}

function showSkeleton(tableId, cols = 5) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;
  
  const rows = 5;
  let html = '';
  for(let i=0; i<rows; i++) {
    html += '<tr class="skeleton-row">';
    for(let j=0; j<cols; j++) {
      html += '<td><div class="skeleton-box"></div></td>';
    }
    html += '</tr>';
  }
  tbody.innerHTML = html;
}

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const stats = await apiCall("/stats");

    // Enhanced stats cards with better styling
    document.getElementById("stat-students").innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 2.2rem; font-weight: 800;">${stats.students || 0}</span>
        <span style="font-size: 0.75rem; opacity: 0.7;">students</span>
      </div>
    `;

    document.getElementById("stat-teachers").innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 2.2rem; font-weight: 800;">${stats.teachers || 0}</span>
        <span style="font-size: 0.75rem; opacity: 0.7;">faculty</span>
      </div>
    `;

    document.getElementById("stat-admissions").innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 2.2rem; font-weight: 800;">${stats.admissions || 0}</span>
        <span style="font-size: 0.75rem; opacity: 0.7;">pending</span>
      </div>
    `;

    document.getElementById("stat-fees").innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 2rem; font-weight: 800;">Rs. ${(stats.fees || 0).toLocaleString().slice(0, -3)}K</span>
        <span style="font-size: 0.75rem; opacity: 0.7;">collected</span>
      </div>
    `;

    // Enhanced activity feed with timeline
    const activityList = document.getElementById("activityList");
    const logs = stats.recentLogs || [];

    if (logs.length === 0) {
      activityList.innerHTML = `
        <div class="empty-state" style="padding: 40px; text-align: center;">
          <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3; margin-bottom: 10px;"></i>
          <p style="color: var(--text-muted);">No recent activity</p>
        </div>
      `;
    } else {
      activityList.innerHTML = logs.slice(0, 10).map(log => `
        <div style="display: flex; gap: 12px; padding: 12px; margin-bottom: 8px; background: var(--bg-main); border-radius: 8px; border-left: 3px solid var(--primary); transition: all 0.2s; cursor: pointer;" onmouseover="this.style.transform='translateX(4px)'" onmouseout="this.style.transform='translateX(0)'">
          <div style="flex-shrink: 0;">
            <div style="width: 32px; height: 32px; background: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.9rem;">
              <i class="fas fa-check"></i>
            </div>
          </div>
          <div style="flex: 1; min-width: 0;">
            <p style="margin: 0; font-weight: 600; font-size: 0.95rem; word-break: break-word;">${log.action}</p>
            <span style="font-size: 0.8rem; color: var(--text-muted);"><i class="fas fa-clock"></i> ${formatTime(log.time)}</span>
          </div>
        </div>
      `).join("");
    }

    document.getElementById("studentsBadge").textContent = stats.students || 0;
    document.getElementById("teachersBadge").textContent = stats.teachers || 0;
    document.getElementById("admissionsBadge").textContent = stats.admissions || 0;
  } catch (err) {
    showToast("Unable to load dashboard. Retrying...", "error");
    console.error("Dashboard load failed:", err);
    setTimeout(() => loadDashboard(), 3000);
  }
}

function refreshDashboard() {
  showToast("Refreshing data...", "info");
  loadDashboard();
}

// ===== ADMISSIONS =====
async function loadAdmissions() {
  showSkeleton("admissionsTable", 7);
  try {
    const admissions = await apiCall("/admissions");
    const tbody = document.getElementById("admissionsTable");

    if (admissions.length === 0) {
      tbody.innerHTML = "<tr><td colspan='7' class='text-center'><div class='empty-state' style='padding: 40px;'><i class='fas fa-inbox'></i><p>No admission applications yet</p><p style='font-size: 0.85rem; color: var(--text-muted);'>New applications will appear here</p></div></td></tr>";
      return;
    }

    tbody.innerHTML = admissions.map(adm => {
      const statusColor = adm.status === 'pending' ? '#f59e0b' : adm.status === 'approved' ? '#10b981' : '#ef4444';
      const statusIcon = adm.status === 'pending' ? 'hourglass' : adm.status === 'approved' ? 'check-circle' : 'times-circle';

      return `
        <tr style="transition: all 0.2s; cursor: pointer;" onmouseover="this.style.background='var(--primary-glow)'" onmouseout="this.style.background=''">
          <td data-label="ID"><code style="background: var(--primary-glow); padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">${adm.id}</code></td>
          <td data-label="Name"><strong>${adm.name}</strong></td>
          <td data-label="Class"><span style="background: var(--primary)20; padding: 4px 8px; border-radius: 4px; font-size: 0.9rem;">${adm.class}</span></td>
          <td data-label="Phone"><i class="fas fa-phone" style="margin-right: 5px; opacity: 0.6;"></i>${adm.phone || '-'}</td>
          <td data-label="Date"><i class="fas fa-calendar" style="margin-right: 5px; opacity: 0.6;"></i>${formatDate(adm.date)}</td>
          <td data-label="Status"><span class="badge" style="background: ${statusColor}; display: inline-flex; align-items: center; gap: 6px;"><i class="fas fa-${statusIcon}" style="font-size: 0.8rem;"></i> ${adm.status}</span></td>
          <td data-label="Actions" style="display: flex; gap: 8px;">
            ${adm.status === 'pending' ? `
              <button class="btn-small" onclick="approveAdmission('${adm.id}')" title="Approve" style="background: #10b981; color: white;"><i class="fas fa-check"></i></button>
              <button class="btn-small reject" onclick="rejectAdmission('${adm.id}')" title="Reject"><i class="fas fa-times"></i></button>
            ` : '-'}
          </td>
        </tr>
      `;
    }).join("");
  } catch (err) {
    showToast("Unable to load admissions.", "error");
    console.error("Admissions load failed:", err);
  }
}

function openAdmissionForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "New Admission Application";

  body.innerHTML = `
    <form id="admissionFormContent" class="form-grid">
      <div class="form-group"><label>Full Name</label><input type="text" id="admName" placeholder="Enter student's name" required></div>
      <div class="form-group"><label>Target Class</label><input type="text" id="admClass" placeholder="e.g. 10th" list="classList" required></div>
      <div class="form-group"><label>Guardian Phone</label><input type="tel" id="admPhone" placeholder="+92 ..."></div>
      <div class="form-group"><label>Residential Address</label><input type="text" id="admAddress" placeholder="Full address"></div>
      <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 10px;">
        <button type="button" class="btn btn-primary" onclick="submitAdmission()" style="flex: 1;">Submit Application</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitAdmission() {
  const formId = "admissionFormContent";
  clearFormErrors(formId);

  try {
    const payload = {
      name: document.getElementById("admName").value.trim(),
      class: document.getElementById("admClass").value.trim(),
      phone: document.getElementById("admPhone").value.trim(),
      address: document.getElementById("admAddress").value.trim()
    };

    const schema = [
      { name: "admName", type: "name", required: true },
      { name: "admClass", type: "cls", required: true },
      { name: "admPhone", type: "phone", required: false }
    ];

    const { isValid, errors } = validateForm({
      admName: payload.name,
      admClass: payload.class,
      admPhone: payload.phone
    }, schema);
    if (!isValid) {
      displayErrors(errors, formId);
      return;
    }

    await apiCall("/admissions", { method: "POST", body: JSON.stringify(payload) });
    showToast("Application submitted successfully ✓", "success");
    closeModal();
    loadAdmissions();
  } catch (err) {
    if (err.message.includes("already pending") || err.message.includes("already enrolled")) {
      displayErrors({ admName: err.message }, formId);
    }
    showToast(parseApiError(err), "error");
  }
}

async function approveAdmission(id) {
  showConfirm("Approve this admission application? This will create a student record.", async () => {
    try {
      await apiCall(`/admissions/${id}`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
      showToast("Application approved ✓", "success");
      loadAdmissions();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

async function rejectAdmission(id) {
  showConfirm("Are you sure you want to reject this application?", async () => {
    try {
      await apiCall(`/admissions/${id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) });
      showToast("Application rejected", "info");
      loadAdmissions();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
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
  showSkeleton("studentsTable", 7);
  try {
    const students = await apiCall("/students");
    CURRENT_DATA.students = students; // Store for quick access
    const tbody = document.getElementById("studentsTable");

    if (students.length === 0) {
      tbody.innerHTML = "<tr><td colspan='7' class='text-center'><div class='empty-state'><i class='fas fa-user-slash'></i><p>No student records found</p></div></td></tr>";
      return;
    }

    tbody.innerHTML = students.map(s => `
      <tr>
        <td data-label="ID"><strong>${s.id}</strong></td>
        <td data-label="Name">${s.name}</td>
        <td data-label="Class">${s.class}</td>
        <td data-label="Phone">${s.phone || '-'}</td>
        <td data-label="Enrolled">${formatDate(s.enrolledDate)}</td>
        <td data-label="Status"><span class="badge" style="background: #27ae60;">${s.status || 'active'}</span></td>
        <td data-label="Actions">
          <button class="btn-small" onclick="viewStudentProfile('${s.id}')" title="View Profile"><i class="fas fa-user-circle"></i></button>
          <button class="btn-small" onclick="editStudent('${s.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-small reject" onclick="deleteStudent('${s.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join("");

    document.getElementById("studentsBadge").textContent = students.length;
  } catch (err) {
    showToast("Unable to load students. Please try again.", "error");
    console.error("Students load failed:", err);
  }
}

function openStudentForm(student = null) {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  const isEdit = !!student;
  document.getElementById("modalTitle").textContent = isEdit ? `Edit Student: ${student.name}` : "Register New Student";

  body.innerHTML = `
    <form id="studentFormContent" class="form-grid">
      <div class="form-group">
        <label>Student ID</label>
        <input type="text" id="stdId" placeholder="e.g. S-101" required ${isEdit ? 'disabled' : ''} value="${student ? student.id : ''}">
      </div>
      <div class="form-group">
        <label>Full Name</label>
        <input type="text" id="stdName" required value="${student ? student.name : ''}">
      </div>
      <div class="form-group">
        <label>Class</label>
        <input type="text" id="stdClass" list="classList" required value="${student ? student.class : ''}">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="tel" id="stdPhone" value="${student ? student.phone : ''}">
      </div>
      <div class="form-group" style="grid-column: 1/-1;">
        <label>Address</label>
        <input type="text" id="stdAddress" value="${student ? student.address : ''}">
      </div>
      <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 10px;">
        <button type="button" class="btn btn-primary" onclick="submitStudent(${isEdit ? `'${student.id}'` : ''})" style="flex: 1;">
          ${isEdit ? 'Save Changes' : 'Add Student'}
        </button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;
  modal.style.display = "flex";
}

async function openBulkImportForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Bulk Import Students";

  body.innerHTML = `
    <div style="margin-bottom: 20px;">
      <p style="color: var(--text-muted); margin-bottom: 15px;">
        <i class="fas fa-info-circle"></i> Paste JSON data with student records.
      </p>
      <textarea id="bulkStudentData" style="width: 100%; height: 250px; padding: 10px; border: 1px solid var(--border); border-radius: 5px; font-family: monospace; font-size: 0.85rem;" placeholder='[{"id":"S-001","name":"John Doe","class":"10th"}]'></textarea>
      <div style="margin-top: 10px; padding: 10px; background: var(--bg-main); border-radius: 5px; font-size: 0.85rem; color: var(--text-muted);">
        <strong>Format:</strong> [{"id":"S-001","name":"John Doe","class":"10th","phone":"+92...","address":"..."}]
      </div>
    </div>
    <div style="display: flex; gap: 10px; margin-top: 20px;">
      <button type="button" class="btn btn-primary" onclick="processBulkImport()" style="flex: 1;">
        <i class="fas fa-upload"></i> Import Students
      </button>
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `;
  modal.style.display = "flex";
}

async function processBulkImport() {
  try {
    const jsonText = document.getElementById("bulkStudentData").value.trim();
    if (!jsonText) {
      showToast("Please paste student data", "error");
      return;
    }

    let students;
    try {
      students = JSON.parse(jsonText);
    } catch (err) {
      showToast("Invalid JSON format", "error");
      return;
    }

    if (!Array.isArray(students)) {
      showToast("Data must be an array", "error");
      return;
    }

    const result = await apiCall("/students/bulk-import", {
      method: "POST",
      body: JSON.stringify({ students })
    });

    showToast(`${result.success} imported successfully, ${result.failed} failed`, result.failed === 0 ? "success" : "warning");
    closeModal();
    loadStudents();
  } catch (err) {
    showToast(parseApiError(err), "error");
  }
}

async function submitStudent(editId = null) {
  const formId = "studentFormContent";
  clearFormErrors(formId);

  try {
    const payload = {
      id: document.getElementById("stdId").value.trim(),
      name: document.getElementById("stdName").value.trim(),
      class: document.getElementById("stdClass").value.trim(),
      phone: document.getElementById("stdPhone").value.trim(),
      address: document.getElementById("stdAddress").value.trim()
    };

    const schema = [
      { name: "stdId", type: "studentId", required: true },
      { name: "stdName", type: "name", required: true },
      { name: "stdClass", type: "cls", required: true },
      { name: "stdPhone", type: "phone", required: false }
    ];

    const { isValid, errors } = validateForm({
      stdId: payload.id,
      stdName: payload.name,
      stdClass: payload.class,
      stdPhone: payload.phone
    }, schema);

    if (!isValid) {
      displayErrors(errors, formId);
      return;
    }

    const method = editId ? "PATCH" : "POST";
    const endpoint = editId ? `/students/${editId}` : "/students";

    await apiCall(endpoint, { method, body: JSON.stringify(payload) });
    showToast(`Student ${editId ? 'updated' : 'registered'} successfully ✓`, "success");
    closeModal();
    loadStudents();
  } catch (err) {
    if (err.details) {
      // Map backend fields to frontend IDs if they differ
      const mapping = { id: 'stdId', name: 'stdName', class: 'stdClass', phone: 'stdPhone' };
      const mappedErrors = {};
      Object.entries(err.details).forEach(([key, msg]) => {
        mappedErrors[mapping[key] || key] = msg;
      });
      displayErrors(mappedErrors, formId);
    } else if (err.code === 'DUPLICATE_ID') {
      displayErrors({ stdId: err.message }, formId);
    } else {
      showToast(err.message, "error");
    }
  }
}

async function deleteStudent(id) {
  showConfirm(`Are you sure you want to delete student ${id}? This action cannot be undone.`, async () => {
    try {
      await apiCall(`/students/${id}`, { method: "DELETE" });
      showToast("Student record deleted", "info");
      loadStudents();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
}

function editStudent(id) {
  const student = CURRENT_DATA.students?.find(s => s.id === id);
  if (!student) {
    showToast("Student data not found. Please refresh.", "error");
    return;
  }
  openStudentForm(student);
}

function filterStudents() {
  const query = document.getElementById("studentsSearch").value.toLowerCase();
  document.querySelectorAll("#studentsTable tr").forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? "" : "none";
  });
}

async function viewStudentProfile(studentId) {
  try {
    const profile = await apiCall(`/students/${studentId}/profile`);
    const modal = document.getElementById("formModal");
    const body = document.getElementById("modalBody");
    document.getElementById("modalTitle").textContent = `Student Profile: ${profile.student.name}`;

    body.innerHTML = `
      <div class="student-profile-container">
        <div class="profile-header" style="background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h2 style="margin: 0; font-size: 1.8rem;">${profile.student.name}</h2>
              <p style="margin: 5px 0; opacity: 0.9;">ID: ${profile.student.id}</p>
              <p style="margin: 0; opacity: 0.9;">Class: ${profile.student.class}</p>
            </div>
            <div style="text-align: center; font-size: 3rem; opacity: 0.3;">
              <i class="fas fa-user-circle"></i>
            </div>
          </div>
        </div>

        <div class="profile-stats" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
          <div class="stat-box" style="padding: 15px; background: var(--bg-main); border-radius: 8px; border-left: 4px solid #3498db;">
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">Attendance</p>
            <h3 style="margin: 8px 0 0 0; font-size: 1.5rem;">${profile.statistics.attendancePercentage}%</h3>
            <p style="margin: 5px 0 0 0; font-size: 0.8rem;">Present: ${profile.statistics.presentDays}/${profile.statistics.totalAttendance}</p>
          </div>
          <div class="stat-box" style="padding: 15px; background: var(--bg-main); border-radius: 8px; border-left: 4px solid #2ecc71;">
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">Academic Average</p>
            <h3 style="margin: 8px 0 0 0; font-size: 1.5rem;">${profile.statistics.averagePercentage}%</h3>
            <p style="margin: 5px 0 0 0; font-size: 0.8rem;">Subjects: ${profile.statistics.subjectsCount}</p>
          </div>
          <div class="stat-box" style="padding: 15px; background: var(--bg-main); border-radius: 8px; border-left: 4px solid #f39c12;">
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">Fees Paid</p>
            <h3 style="margin: 8px 0 0 0; font-size: 1.5rem;">Rs. ${profile.statistics.totalFeesPaid.toLocaleString()}</h3>
            <p style="margin: 5px 0 0 0; font-size: 0.8rem;">Total Payments</p>
          </div>
          <div class="stat-box" style="padding: 15px; background: var(--bg-main); border-radius: 8px; border-left: 4px solid #9b59b6;">
            <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted);">Status</p>
            <h3 style="margin: 8px 0 0 0; font-size: 1.5rem; text-transform: capitalize;">${profile.student.status}</h3>
            <p style="margin: 5px 0 0 0; font-size: 0.8rem;">Enrolled: ${formatDate(profile.student.enrolledDate)}</p>
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <h4 style="margin-bottom: 10px; font-weight: 700;">Contact Information</h4>
          <div style="background: var(--bg-main); padding: 15px; border-radius: 8px;">
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${profile.student.phone || 'Not provided'}</p>
            <p style="margin: 5px 0;"><strong>Address:</strong> ${profile.student.address || 'Not provided'}</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div>
            <h4 style="margin-bottom: 10px; font-weight: 700;">Recent Results</h4>
            ${profile.recentResults.length > 0 ? `
              <div style="background: var(--bg-main); padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                ${profile.recentResults.map(r => `
                  <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
                    <span>${r.subject}</span>
                    <strong style="color: ${r.percentage >= 60 ? '#2ecc71' : '#e74c3c'};">${r.percentage}%</strong>
                  </div>
                `).join('')}
              </div>
            ` : '<p style="color: var(--text-muted);">No results yet</p>'}
          </div>
          <div>
            <h4 style="margin-bottom: 10px; font-weight: 700;">Recent Fees</h4>
            ${profile.recentFees.length > 0 ? `
              <div style="background: var(--bg-main); padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
                ${profile.recentFees.map(f => `
                  <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);">
                    <span>${f.month}</span>
                    <strong>Rs. ${f.amount.toLocaleString()}</strong>
                  </div>
                `).join('')}
              </div>
            ` : '<p style="color: var(--text-muted);">No payments yet</p>'}
          </div>
        </div>
      </div>
    `;
    modal.style.display = "flex";
  } catch (err) {
    showToast("Unable to load student profile", "error");
    console.error("Profile load error:", err);
  }
}

// ===== TEACHERS =====
async function loadTeachers() {
  showSkeleton("teachersTable", 4);
  try {
    const teachers = await apiCall("/teachers");
    const tbody = document.getElementById("teachersTable");

    if (teachers.length === 0) {
      tbody.innerHTML = "<tr><td colspan='4' class='text-center'><div class='empty-state'><i class='fas fa-chalkboard-user'></i><p>No faculty members registered</p></div></td></tr>";
      return;
    }

    tbody.innerHTML = teachers.map(t => `
      <tr>
        <td data-label="ID">${t.id}</td>
        <td data-label="Name">${t.name}</td>
        <td data-label="Subject">${t.subject}</td>
        <td data-label="Actions">
          <button class="btn-small reject" onclick="deleteTeacher('${t.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join("");

    document.getElementById("teachersBadge").textContent = teachers.length;
  } catch (err) {
    showToast("Unable to load teachers. Please try again.", "error");
    console.error("Teachers load failed:", err);
  }
}

function openTeacherForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Add New Faculty";

  body.innerHTML = `
    <form id="teacherFormContent" class="form-grid">
      <div class="form-group"><label>Full Name</label><input type="text" id="tchName" required></div>
      <div class="form-group"><label>Department/Subject</label><input type="text" id="tchSubject" list="subjectList" required></div>
      <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 10px;">
        <button type="button" class="btn btn-primary" onclick="submitTeacher()" style="flex: 1;">Add Teacher</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitTeacher() {
  const formId = "teacherFormContent";
  clearFormErrors(formId);

  try {
    const payload = {
      name: document.getElementById("tchName").value.trim(),
      subject: document.getElementById("tchSubject").value.trim()
    };

    const schema = [
      { name: "tchName", type: "name", required: true },
      { name: "tchSubject", type: "cls", required: true }
    ];

    const { isValid, errors } = validateForm({
      tchName: payload.name,
      tchSubject: payload.subject
    }, schema);

    if (!isValid) {
      displayErrors(errors, formId);
      return;
    }

    const teachers = await apiCall("/teachers");
    const existingTeacher = teachers.find(t => t.name.toLowerCase() === payload.name.toLowerCase());
    if (existingTeacher) {
      displayErrors({ tchName: `Teacher "${payload.name}" is already registered (ID: ${existingTeacher.id})` }, formId);
      return;
    }

    await apiCall("/teachers", { method: "POST", body: JSON.stringify(payload) });
    showToast("Teacher added successfully ✓", "success");
    closeModal();
    loadTeachers();
  } catch (err) {
    showToast(parseApiError(err), "error");
  }
}

async function deleteTeacher(id) {
  showConfirm("Remove this faculty member from the system?", async () => {
    try {
      await apiCall(`/teachers/${id}`, { method: "DELETE" });
      showToast("Teacher record removed", "info");
      loadTeachers();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
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
    
    if (students.length === 0) {
      tbody.innerHTML = "<tr><td colspan='4' class='text-center'><div class='empty-state'><i class='fas fa-users-slash'></i><p>Add students first to mark attendance</p></div></td></tr>";
      return;
    }

    tbody.innerHTML = students.map(s => {
      const att = attendanceData.find(a => a.id === s.id) || {};
      const status = att.status || 'present';
      return `
        <tr>
          <td data-label="ID">${s.id}</td>
          <td data-label="Name">${s.name}</td>
          <td data-label="Status">
            <div class="custom-select-wrapper">
              <select id="att-${s.id}" class="att-select ${status}" onchange="this.className = 'att-select ' + this.value">
                <option value="present" ${status === 'present' ? 'selected' : ''}>Present</option>
                <option value="absent" ${status === 'absent' ? 'selected' : ''}>Absent</option>
                <option value="leave" ${status === 'leave' ? 'selected' : ''}>Leave</option>
              </select>
            </div>
          </td>
          <td data-label="Last Marked">${att.time ? formatTime(att.time) : 'Never'}</td>
        </tr>
      `;
    }).join("");

    // Add "Mark All Present" shortcut
    const toolbar = document.querySelector("#module-attendance .date-selector");
    if (toolbar && !document.getElementById("markAllBtn")) {
      const btn = document.createElement("button");
      btn.id = "markAllBtn";
      btn.className = "btn btn-secondary";
      btn.style.marginLeft = "10px";
      btn.innerHTML = '<i class="fas fa-check-double"></i> All Present';
      btn.onclick = () => {
        document.querySelectorAll(".att-select").forEach(sel => {
          sel.value = "present";
          sel.className = "att-select present";
        });
        showToast("Marked all as present locally. Don't forget to save!", "info");
      };
      toolbar.appendChild(btn);
    }
  } catch (err) {
    showToast("Unable to load attendance records.", "error");
    console.error("Attendance load failed:", err);
  }
}

async function saveAttendance() {
  const saveBtn = document.querySelector("#module-attendance .btn-primary");
  const originalHtml = saveBtn.innerHTML;
  
  try {
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Synchronizing...';
    saveBtn.disabled = true;

    const date = document.getElementById("attendanceDate").value || new Date().toISOString().split("T")[0];
    const selects = document.querySelectorAll(".att-select");
    const records = Array.from(selects).map(sel => ({
      id: sel.id.replace("att-", ""),
      status: sel.value
    }));

    if (records.length === 0) throw new Error("No students found to mark attendance");

    await apiCall("/attendance/bulk", {
      method: "POST",
      body: JSON.stringify({ date, records })
    });

    showToast(`Attendance synchronized for ${records.length} students ✓`, "success");
    loadAttendanceForDate();
  } catch (err) {
    showToast(err.message || "Failed to save attendance", "error");
  } finally {
    saveBtn.innerHTML = originalHtml;
    saveBtn.disabled = false;
  }
}

// Unified Validation Helper
function getValidator() {
  return typeof validators !== 'undefined' ? validators : FRONTEND_VALIDATORS;
}

// Validation logic is now consolidated in validators.js


// ===== FEES =====
async function loadFees() {
  showSkeleton("feesTable", 6);
  try {
    const fees = await apiCall("/fees");
    const tbody = document.getElementById("feesTable");

    let rows = [];
    for (const [studentId, feeList] of Object.entries(fees)) {
      feeList.forEach(fee => {
        rows.push(`
          <tr>
            <td data-label="Student ID">${studentId}</td>
            <td data-label="Amount" class="state-success">Rs. ${fee.amount.toLocaleString()}</td>
            <td data-label="Month">${fee.month}</td>
            <td data-label="Method"><span class="label">${fee.method}</span></td>
            <td data-label="Receipt"><code>${fee.receipt || 'N/A'}</code></td>
            <td data-label="Date">${formatDate(fee.date)}</td>
            <td data-label="Actions">
              <button class="btn-small reject" onclick="deleteFee('${studentId}', '${fee.receipt}')" title="Void Payment"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        `);
      });
    }

    tbody.innerHTML = rows.length > 0 ? rows.join("") : "<tr><td colspan='7' class='text-center'><div class='empty-state'><i class='fas fa-money-bill-transfer'></i><p>No fee records found</p></div></td></tr>";
  } catch (err) {
    showToast("Unable to load fee records.", "error");
    console.error("Fees load failed:", err);
  }
}

async function deleteFee(studentId, receipt) {
  showConfirm(`Void this fee payment (Receipt: ${receipt})? This will remove the record permanently.`, async () => {
    try {
      await apiCall(`/fees/${studentId}/${receipt}`, { method: "DELETE" });
      showToast("Fee record deleted", "info");
      loadFees();
    } catch (err) {
      showToast(parseApiError(err), "error");
    }
  });
}

function openFeeForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Record Fee Payment";

  body.innerHTML = `
    <form id="feeFormContent" class="form-grid">
      <div class="form-group"><label>Student ID</label><input type="text" id="feeStdId" placeholder="e.g. S-101" required></div>
      <div class="form-group"><label>Amount (PKR)</label><input type="number" id="feeAmount" min="1" placeholder="5000" required></div>
      <div class="form-group"><label>Month</label>
        <select id="feeMonth">
          ${["January","February","March","April","May","June","July","August","September","October","November","December"].map(m => `<option value="${m}">${m}</option>`).join("")}
        </select>
      </div>
      <div class="form-group"><label>Payment Method</label>
        <select id="feeMethod">
          <option value="cash">Cash</option>
          <option value="bank">Bank Transfer</option>
          <option value="cheque">Cheque</option>
          <option value="online">Online Payment</option>
        </select>
      </div>
      <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 10px;">
        <button type="button" class="btn btn-primary" onclick="submitFee()" style="flex: 1;">Confirm Payment</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitFee() {
  const formId = "feeFormContent";
  clearFormErrors(formId);

  try {
    const payload = {
      id: document.getElementById("feeStdId").value.trim(),
      amount: Number(document.getElementById("feeAmount").value),
      month: document.getElementById("feeMonth").value.trim(),
      method: document.getElementById("feeMethod").value
    };

    const schema = [
      { name: "feeStdId", type: "studentId", required: true },
      { name: "feeAmount", type: "amount", required: true },
      { name: "feeMonth", type: "cls", required: true },
      { name: "feeMethod", required: true }
    ];

    const { isValid, errors } = validateForm({
      feeStdId: payload.id,
      feeAmount: payload.amount,
      feeMonth: payload.month,
      feeMethod: payload.method
    }, schema);

    if (!isValid) {
      displayErrors(errors, formId);
      return;
    }

    const students = await apiCall("/students");
    const student = students.find(s => s.id === payload.id);
    if (!student) {
      displayErrors({ feeStdId: `Student ID "${payload.id}" does not exist.` }, formId);
      return;
    }

    const fees = await apiCall("/fees");
    const existingFee = fees[payload.id]?.find(f => f.month.toLowerCase() === payload.month.toLowerCase() && f.method !== 'pending');
    if (existingFee) {
      displayErrors({ feeMonth: `Fee for ${payload.month} already recorded.` }, formId);
      return;
    }

    await apiCall("/fees", { method: "POST", body: JSON.stringify(payload) });
    showToast("Fee payment recorded successfully ✓", "success");
    closeModal();
    loadFees();
  } catch (err) {
    showToast(parseApiError(err), "error");
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
  showSkeleton("resultsTable", 6);
  try {
    const results = await apiCall("/results");
    const tbody = document.getElementById("resultsTable");

    let rows = [];
    for (const [studentId, resultList] of Object.entries(results)) {
      if (!Array.isArray(resultList)) continue;
      
      resultList.forEach(result => {
        const percentage = result.percentage !== undefined ? result.percentage : Math.round(((result.marks || 0) / (result.total || 100)) * 100);
        const grade = result.grade || (percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : 'F');
        
        let gradeClass = 'grade-B';
        if (grade === 'A+' || grade === 'A') gradeClass = 'grade-A-plus';
        else if (grade === 'F') gradeClass = 'grade-F';

        rows.push(`
          <tr class="result-row">
            <td data-label="Student ID"><strong>${studentId}</strong></td>
            <td data-label="Subject">${result.subject || 'N/A'}</td>
            <td data-label="Marks">${result.marks || 0} / ${result.total || 100}</td>
            <td data-label="Performance">
               <div class="progress-container-pro">
                  <div class="progress-fill-pro" style="width: ${percentage}%; background: ${percentage >= 60 ? '#10b981' : '#ef4444'}"></div>
               </div>
               <span style="font-size: 0.7rem; font-weight: 800; color: var(--text-muted); margin-top: 4px; display: block;">${percentage}% ACQUIRED</span>
            </td>
            <td data-label="Grade"><span class="grade-badge-ultra ${gradeClass}">${grade}</span></td>
            <td data-label="Actions">
               <button class="btn-small" onclick="viewReportCard('${studentId}')" title="View Full Report Card"><i class="fas fa-file-invoice"></i></button>
               <button class="btn-small" onclick="window.print()" title="Print Row"><i class="fas fa-print"></i></button>
            </td>
          </tr>
        `);
      });
    }

    tbody.innerHTML = rows.length > 0 ? rows.join("") : "<tr><td colspan='6' class='text-center'><div class='empty-state'><i class='fas fa-graduation-cap'></i><p>No results published yet</p></div></td></tr>";
    
    // Add "Print All" button to view header if data exists
    const actions = document.querySelector("#module-results .view-actions");
    if (actions && rows.length > 0 && !document.getElementById("printResultsBtn")) {
      const btn = document.createElement("button");
      btn.id = "printResultsBtn";
      btn.className = "btn btn-print";
      btn.innerHTML = '<i class="fas fa-print"></i> Print All Reports';
      btn.onclick = () => window.print();
      actions.appendChild(btn);
    }
  } catch (err) {
    showToast("Unable to load examination results. Please try again.", "error");
    console.error("Results load failed:", err);
  }
}

function openResultForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Bulk Academic Posting";

  body.innerHTML = `
    <div style="margin-bottom: 20px;">
      <div class="form-group"><label>Student ID</label><input type="text" id="resStdId" placeholder="e.g. S-101" required></div>
    </div>
    <div id="bulkResultRows">
      <div class="bulk-row form-grid" style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed var(--border);">
        <div class="form-group"><label>Subject</label><input type="text" class="resSubject" list="subjectList" required></div>
        <div class="form-group"><label>Marks</label><input type="number" class="resMarks" min="0" required></div>
        <div class="form-group"><label>Total</label><input type="number" class="resTotal" value="100" min="1" required></div>
      </div>
    </div>
    <button class="btn btn-secondary" onclick="addBulkResultRow()" style="margin-bottom: 20px;"><i class="fas fa-plus"></i> Add Subject</button>
    <div style="display: flex; gap: 10px;">
      <button type="button" class="btn btn-primary" onclick="submitBulkResults()" style="flex: 1;">Publish All Results</button>
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `;
  modal.style.display = "flex";
}

function addBulkResultRow() {
  const container = document.getElementById("bulkResultRows");
  const row = document.createElement("div");
  row.className = "bulk-row form-grid";
  row.style.cssText = "margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed var(--border);";
  row.innerHTML = `
    <div class="form-group"><label>Subject</label><input type="text" class="resSubject" list="subjectList" required></div>
    <div class="form-group"><label>Marks</label><input type="number" class="resMarks" min="0" required></div>
    <div class="form-group"><label>Total</label><input type="number" class="resTotal" value="100" min="1" required></div>
    <button class="btn btn-small reject" onclick="this.parentElement.remove()" style="align-self: flex-end; margin-bottom: 12px;"><i class="fas fa-trash"></i></button>
  `;
  container.appendChild(row);
}

async function submitBulkResults() {
  try {
    const studentId = document.getElementById("resStdId").value.trim();
    if (!studentId) throw new Error("Student ID is required");

    const rows = document.querySelectorAll(".bulk-row");
    const results = Array.from(rows).map(row => ({
      subject: row.querySelector(".resSubject").value.trim(),
      marks: row.querySelector(".resMarks").value,
      total: row.querySelector(".resTotal").value
    }));

    if (results.some(r => !r.subject || !r.marks || !r.total)) {
      throw new Error("All subject fields are required");
    }

    await apiCall("/results/bulk", { method: "POST", body: JSON.stringify({ id: studentId, results }) });
    showToast("Bulk results published successfully ✓", "success");
    closeModal();
    loadResults();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function viewReportCard(studentId) {
  try {
    const allResults = await apiCall("/results");
    const studentResults = allResults[studentId] || [];
    const student = CURRENT_DATA.students?.find(s => s.id === studentId);

    const modal = document.getElementById("formModal");
    const body = document.getElementById("modalBody");
    document.getElementById("modalTitle").textContent = "Academic Progress Report";

    const renderRows = (results) => results.map(r => `
      <tr class="report-row-item">
        <td>${r.subject}</td>
        <td>${r.marks} / ${r.total}</td>
        <td>${r.percentage}%</td>
        <td><strong class="grade-badge-ultra ${r.grade === 'A+' || r.grade === 'A' ? 'grade-A-plus' : r.grade === 'F' ? 'grade-F' : 'grade-B'}">${r.grade}</strong></td>
        <td class="no-print"><button class="btn-small reject" onclick="this.closest('tr').remove()"><i class="fas fa-trash"></i></button></td>
      </tr>
    `).join("");

    body.innerHTML = `
      <div class="report-card-scroll-wrapper">
        <div class="report-card-container" id="printableReportCard">
          <div class="report-header">
            <h2>YASRAB ELITE ACADEMY</h2>
            <p style="font-weight: 700; color: var(--primary); letter-spacing: 2px;">CERTIFICATE OF ACADEMIC ACHIEVEMENT</p>
          </div>
          <div class="report-info-grid">
            <div><strong>NAME:</strong> ${student?.name || 'N/A'}</div>
            <div><strong>STUDENT ID:</strong> ${studentId}</div>
            <div><strong>GRADE/CLASS:</strong> ${student?.class || 'N/A'}</div>
            <div><strong>SESSION:</strong> 2024-2025</div>
          </div>
          <table class="report-table">
            <thead>
              <tr><th>SUBJECT</th><th>MARKS</th><th>PERCENTAGE</th><th>GRADE</th><th class="no-print">ACTION</th></tr>
            </thead>
            <tbody id="reportCardTableBody">${renderRows(studentResults)}</tbody>
          </table>
          
          <div class="no-print" style="margin-top: 20px; padding: 15px; background: var(--bg-main); border-radius: 8px;">
            <p style="font-size: 0.8rem; font-weight: 700; margin-bottom: 10px;">ADD TEMPORARY SUBJECT TO REPORT:</p>
            <div style="display: flex; gap: 10px;">
               <input type="text" id="tempSub" placeholder="Subject" list="subjectList" style="flex: 2; padding: 8px; border: 1px solid var(--border); border-radius: 5px;">
               <input type="number" id="tempMarks" placeholder="Marks" style="flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 5px;">
               <input type="number" id="tempTotal" placeholder="Total" value="100" style="flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 5px;">
               <button class="btn btn-primary" onclick="addTempSubjectToReport()"><i class="fas fa-plus"></i></button>
            </div>
          </div>

          <div style="margin-top: 60px; display: flex; justify-content: space-between;">
             <div style="border-top: 1px solid #000; padding-top: 10px; width: 180px; text-align: center; font-size: 0.8rem; font-weight: 700;">REGISTRAR SIGNATURE</div>
             <div style="border-top: 1px solid #000; padding-top: 10px; width: 180px; text-align: center; font-size: 0.8rem; font-weight: 700;">PRINCIPAL SIGNATURE</div>
          </div>
        </div>
      </div>
      <div class="report-card-actions">
        <button class="no-print-btn btn-secondary" onclick="closeModal()">Close Preview</button>
        <button class="no-print-btn btn-primary" onclick="window.print()"><i class="fas fa-file-pdf"></i> Export & Print Report</button>
      </div>
    `;
    modal.style.display = "flex";
  } catch (err) {
    showToast(err.message, "error");
  }
}

function addTempSubjectToReport() {
  const sub = document.getElementById("tempSub").value.trim();
  const marks = Number(document.getElementById("tempMarks").value);
  const total = Number(document.getElementById("tempTotal").value);

  if (!sub || isNaN(marks) || isNaN(total)) {
    showToast("Please fill all temporary subject fields", "warning");
    return;
  }

  const percentage = Math.round((marks / total) * 100);
  const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : 'F';
  const gradeClass = grade === 'A+' || grade === 'A' ? 'grade-A-plus' : grade === 'F' ? 'grade-F' : 'grade-B';

  const tbody = document.getElementById("reportCardTableBody");
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${sub}</td>
    <td>${marks} / ${total}</td>
    <td>${percentage}%</td>
    <td><strong class="grade-badge-ultra ${gradeClass}">${grade}</strong></td>
    <td class="no-print"><button class="btn-small reject" onclick="this.closest('tr').remove()"><i class="fas fa-trash"></i></button></td>
  `;
  tbody.appendChild(row);
  
  // Clear inputs
  document.getElementById("tempSub").value = "";
  document.getElementById("tempMarks").value = "";
  showToast("Temporary subject added to preview", "info");
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
      content.innerHTML = "<div class='empty-state'><i class='fas fa-calendar-xmark'></i><p>No class schedules defined</p></div>";
      return;
    }

    let html = "<div class='timetable-grid'>";
    for (const [className, schedule] of Object.entries(timetable)) {
      html += `
        <div class="class-schedule">
          <div class="schedule-header">
            <h4><i class="fas fa-chalkboard"></i> ${className}</h4>
          </div>
          <ul>`;
      schedule.forEach(entry => {
        html += `
          <li style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div class="schedule-time"><i class="far fa-clock"></i> ${entry.day || 'N/A'} at ${entry.time}</div>
              <div class="schedule-subject">${entry.subject}</div>
            </div>
            <button class="btn-small reject" onclick="removeTimetableEntry('${className}', '${entry.subject}', '${entry.day}', '${entry.time}')" title="Remove Entry"><i class="fas fa-times"></i></button>
          </li>`;
      });
      html += `</ul></div>`;
    }
    html += "</div>";
    content.innerHTML = html;
  } catch (err) {
    showToast("Unable to load timetable. Please try again.", "error");
    console.error("Timetable load failed:", err);
  }
}

async function removeTimetableEntry(className, subject, day, time) {
  showConfirm(`Remove ${subject} from ${className}'s schedule?`, async () => {
    try {
      await apiCall("/timetable/remove", { 
        method: "POST", 
        body: JSON.stringify({ className, subject, day, time }) 
      });
      showToast("Schedule entry removed", "info");
      loadTimetable();
    } catch (err) {
      showToast(parseApiError(err), "error");
    }
  });
}

function openTimetableForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Add Timetable Entry";

  body.innerHTML = `
    <form id="timetableFormContent" class="form-grid">
      <div class="form-group"><label>Class Name</label><input type="text" id="ttClassName" placeholder="e.g. 10th-A" required></div>
      <div class="form-group"><label>Subject</label><input type="text" id="ttSubject" placeholder="Physics" required></div>
      <div class="form-group"><label>Day of Week</label>
        <select id="ttDay">
          <option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option>
        </select>
      </div>
      <div class="form-group"><label>Start Time</label><input type="time" id="ttTime" required></div>
      <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 10px;">
        <button type="button" class="btn btn-primary" onclick="submitTimetable()" style="flex: 1;">Add to Schedule</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitTimetable() {
  const formId = "timetableFormContent";
  clearFormErrors(formId);

  try {
    const payload = {
      className: document.getElementById("ttClassName").value.trim(),
      subject: document.getElementById("ttSubject").value.trim(),
      day: document.getElementById("ttDay").value.trim(),
      time: document.getElementById("ttTime").value
    };

    const schema = [
      { name: "ttClassName", type: "cls", required: true },
      { name: "ttSubject", type: "name", required: true },
      { name: "ttDay", required: true },
      { name: "ttTime", type: "time", required: true }
    ];

    const { isValid, errors } = validateForm({
      ttClassName: payload.className,
      ttSubject: payload.subject,
      ttDay: payload.day,
      ttTime: payload.time
    }, schema);

    if (!isValid) {
      displayErrors(errors, formId);
      return;
    }

    await apiCall("/timetable", { method: "POST", body: JSON.stringify(payload) });
    showToast("Schedule updated successfully ✓", "success");
    closeModal();
    loadTimetable();
  } catch (err) {
    showToast(parseApiError(err), "error");
  }
}

// ===== ANNOUNCEMENTS =====
async function loadAnnouncements() {
  try {
    const announcements = await apiCall("/announcements");
    const list = document.getElementById("announcementsList");

    if (announcements.length === 0) {
      list.innerHTML = "<div class='empty-state'><i class='fas fa-bullhorn'></i><p>No recent announcements</p></div>";
      return;
    }

    list.innerHTML = announcements.map(a => `
      <div class="announcement-item ${a.priority === 'high' ? 'priority-high' : ''}">
        <div class="announcement-header">
          <h4>${a.title}</h4>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="badge ${a.priority === 'high' ? 'state-error' : 'state-warning'}">${a.priority}</span>
            <button class="btn-small reject" onclick="deleteAnnouncement(${a.id})" style="padding: 2px 6px; font-size: 0.7rem;"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <p>${a.message}</p>
        <div class="announcement-footer">
          <span><i class="far fa-clock"></i> ${formatTime(a.time)}</span>
          <span><i class="far fa-user"></i> Admin</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    showToast("Unable to load announcements.", "error");
    console.error("Announcements load failed:", err);
  }
}

async function deleteAnnouncement(id) {
  showConfirm("Remove this announcement for all users?", async () => {
    try {
      await apiCall(`/announcements/${id}`, { method: "DELETE" });
      showToast("Announcement removed", "info");
      loadAnnouncements();
    } catch (err) {
      showToast(parseApiError(err), "error");
    }
  });
}

function openAnnouncementForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "New System Announcement";

  body.innerHTML = `
    <form id="announcementFormContent" class="form-grid">
      <div class="form-group" style="grid-column: 1/-1;"><label>Title</label><input type="text" id="annTitle" placeholder="Announcement Heading" required></div>
      <div class="form-group" style="grid-column: 1/-1;"><label>Detailed Message</label><textarea id="annMessage" rows="4" placeholder="Type your message here..." required></textarea></div>
      <div class="form-group"><label>Priority Level</label>
        <select id="annPriority">
          <option value="normal">Normal</option>
          <option value="high">Urgent/High</option>
        </select>
      </div>
      <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 10px;">
        <button type="button" class="btn btn-primary" onclick="submitAnnouncement()" style="flex: 1;">Broadcast Message</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
    </form>
  `;
  modal.style.display = "flex";
}

async function submitAnnouncement() {
  const formId = "announcementFormContent";
  clearFormErrors(formId);

  try {
    const payload = {
      title: document.getElementById("annTitle").value.trim(),
      message: document.getElementById("annMessage").value.trim(),
      priority: document.getElementById("annPriority").value
    };

    const schema = [
      { name: "annTitle", type: "name", required: true },
      { name: "annMessage", required: true }
    ];

    const { isValid, errors } = validateForm({
      annTitle: payload.title,
      annMessage: payload.message
    }, schema);

    if (!isValid) {
      displayErrors(errors, formId);
      return;
    }

    if (payload.message.length < 10) {
      displayErrors({ annMessage: "Message must be at least 10 characters long" }, formId);
      return;
    }

    await apiCall("/announcements", { method: "POST", body: JSON.stringify(payload) });
    showToast("Announcement published ✓", "success");
    closeModal();
    loadAnnouncements();
  } catch (err) {
    showToast(parseApiError(err), "error");
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
    showToast("Unable to load settings. Please refresh the page.", "error");
    console.error("Settings load failed:", err);
  }
}

async function saveConfig() {
  const saveBtn = document.querySelector("#module-settings .btn-primary");
  const formId = "configForm";
  clearFormErrors(formId);

  try {
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    const payload = {
      schoolName: document.getElementById("schoolName").value.trim(),
      address: document.getElementById("schoolAddress").value.trim(),
      contact: document.getElementById("schoolContact").value.trim(),
      email: document.getElementById("schoolEmail").value.trim()
    };

    const schema = [
      { name: "schoolName", type: "cls", required: true },
      { name: "schoolAddress", required: true },
      { name: "schoolContact", type: "phone", required: true },
      { name: "schoolEmail", type: "email", required: true }
    ];

    const { isValid, errors } = validateForm({
      schoolName: payload.schoolName,
      schoolAddress: payload.address,
      schoolContact: payload.contact,
      schoolEmail: payload.email
    }, schema);

    if (!isValid) {
      displayErrors(errors, formId);
      return;
    }

    await apiCall("/config", { method: "PATCH", body: JSON.stringify(payload) });
    showToast("System settings updated successfully ✓", "success");
  } catch (err) {
    showToast(parseApiError(err), "error");
  } finally {
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
  }
}

// ===== LOGS =====
async function loadLogs() {
  showSkeleton("logsTable", 3);
  try {
    const logs = await apiCall("/logs");
    const tbody = document.getElementById("logsTable");

    if (logs.length === 0) {
      tbody.innerHTML = "<tr><td colspan='3' class='text-center'><div class='empty-state'><i class='fas fa-receipt'></i><p>No activity logs found</p></div></td></tr>";
      return;
    }

    tbody.innerHTML = logs.slice(0, 100).map(log => `
      <tr>
        <td data-label="Time">${formatTime(log.time)}</td>
        <td data-label="Action">${log.action}</td>
        <td data-label="Type"><span class="badge" style="background: var(--primary);">${log.type}</span></td>
      </tr>
    `).join("");
  } catch (err) {
    showToast("Unable to load activity logs.", "error");
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
    showToast("Please enter at least 2 characters", "info");
    return;
  }

  try {
    const results = await apiCall(`/search?q=${encodeURIComponent(query)}`);
    const totalFound = (results.results.students?.length || 0) + (results.results.teachers?.length || 0);
    showToast(`Found ${totalFound} relevant records`, "info");
    
    if (results.results.students?.length > 0) {
      switchModule('students', null);
      document.getElementById("studentsSearch").value = query;
      filterStudents();
    } else if (results.results.teachers?.length > 0) {
      switchModule('teachers', null);
      document.getElementById("teachersSearch").value = query;
      filterTeachers();
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== ENHANCED TOAST NOTIFICATIONS WITH ACTIONS =====
function showToastWithAction(message, type = "info", actionText = null, actionCallback = null) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icons = {
    success: 'check-circle',
    error: 'circle-exclamation',
    info: 'info-circle',
    warning: 'triangle-exclamation'
  };

  let html = `<i class="fas fa-${icons[type] || 'bell'}"></i> <span>${message}</span>`;
  if (actionText && actionCallback) {
    html += `<button class="toast-action-btn" onclick="window.toastAction()">${actionText}</button>`;
    window.toastAction = actionCallback;
  }

  toast.innerHTML = html;
  toast.style.cssText += 'display: flex; align-items: center; gap: 10px; justify-content: space-between;';
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function showToast(message, type = "info") {
  showToastWithAction(message, type);
}

function closeModal() {
  const modal = document.getElementById("formModal");
  modal.style.opacity = "0";
  setTimeout(() => {
    modal.style.display = "none";
    modal.style.opacity = "1";
    document.getElementById("modalBody").innerHTML = "";
  }, 200);
}

// ===== ENHANCED MODAL WITH ANIMATION & VALIDATION =====
function openFormModal(title, content, onSubmit = null) {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = title;
  body.innerHTML = content;

  modal.style.display = "flex";
  modal.style.animation = "modalSlideIn 0.3s ease";

  if (onSubmit) {
    window.onModalSubmit = onSubmit;
  }
}

// ===== DATA TABLE ENHANCEMENTS =====
function addTableSorting(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const headers = table.querySelectorAll('th');
  headers.forEach((header, index) => {
    header.style.cursor = 'pointer';
    header.innerHTML += ' <i class="fas fa-sort" style="margin-left: 5px; opacity: 0.5;"></i>';

    header.addEventListener('click', () => {
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));

      rows.sort((a, b) => {
        const aText = a.cells[index].textContent.trim();
        const bText = b.cells[index].textContent.trim();
        return aText.localeCompare(bText);
      });

      tbody.innerHTML = '';
      rows.forEach(row => tbody.appendChild(row));
    });
  });
}

// ===== ENHANCED DASHBOARD WIDGETS =====
function createStatsWidget(title, value, icon, color, trend = null) {
  return `
    <div class="stats-card" style="border-left: 4px solid ${color}; position: relative; overflow: hidden;">
      <div style="position: absolute; right: 0; top: 0; opacity: 0.1; font-size: 3rem;">
        <i class="fas fa-${icon}"></i>
      </div>
      <div class="stats-icon" style="background: ${color}20;"><i class="fas fa-${icon}" style="color: ${color};"></i></div>
      <div class="stats-data">
        <span class="stats-label">${title}</span>
        <h2 style="margin: 8px 0; font-size: 1.8rem;">${value}</h2>
        ${trend ? `<span class="stats-trend" style="color: ${trend.includes('↑') ? '#10b981' : '#ef4444'};"><i class="fas ${trend.includes('↑') ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> ${trend}</span>` : ''}
      </div>
    </div>
  `;
}

// ===== ENHANCED FORM BUILDER =====
function buildForm(fields, submitButtonText = "Submit") {
  let html = '<form id="dynamicForm" class="form-grid">';

  fields.forEach(field => {
    const { name, label, type, placeholder, required, options, grid = 1 } = field;
    html += `
      <div class="form-group" style="grid-column: span ${grid};">
        <label>${label} ${required ? '<span style="color: #ef4444;">*</span>' : ''}</label>
        <div class="input-wrapper">
    `;

    if (type === 'select') {
      html += `<select id="${name}" ${required ? 'required' : ''}>
        <option value="">Select ${label}</option>
        ${options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
      </select>`;
    } else if (type === 'textarea') {
      html += `<textarea id="${name}" placeholder="${placeholder || ''}" rows="4" ${required ? 'required' : ''}></textarea>`;
    } else {
      html += `<input type="${type}" id="${name}" placeholder="${placeholder || ''}" ${required ? 'required' : ''}>`;
    }

    html += '</div></div>';
  });

  html += `
    <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 15px;">
      <button type="button" class="btn btn-primary" onclick="submitDynamicForm()" style="flex: 1;">
        <i class="fas fa-check"></i> ${submitButtonText}
      </button>
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  </form>
  `;

  return html;
}

// ===== PROGRESS BAR WITH LABEL =====
function createProgressBar(percentage, label = "", color = "#10b981") {
  return `
    <div style="margin: 10px 0;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
        <span style="font-size: 0.85rem; font-weight: 600;">${label}</span>
        <span style="font-size: 0.85rem; font-weight: 700; color: ${color};">${percentage}%</span>
      </div>
      <div style="width: 100%; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
        <div style="width: ${percentage}%; height: 100%; background: ${color}; transition: width 0.3s ease; border-radius: 4px;"></div>
      </div>
    </div>
  `;
}

// ===== ACTIVITY TIMELINE =====
function createActivityTimeline(activities) {
  return activities.map((activity, idx) => `
    <div style="display: flex; gap: 15px; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid var(--border);">
      <div style="width: 30px; height: 30px; background: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.8rem; flex-shrink: 0;">
        <i class="fas fa-${activity.icon}"></i>
      </div>
      <div style="flex: 1;">
        <p style="margin: 0; font-weight: 600; color: var(--text-main);">${activity.title}</p>
        <p style="margin: 4px 0; font-size: 0.85rem; color: var(--text-muted);">${activity.description}</p>
        <span style="font-size: 0.8rem; color: var(--text-muted);"><i class="far fa-clock"></i> ${activity.time}</span>
      </div>
    </div>
  `).join('');
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("active");
}

function toggleUserMenu() {
  document.getElementById("userDropdown").classList.toggle("active");
  
  // Close when clicking outside the profile dropdown
  const closeMenu = (e) => {
    if (!e.target.closest(".user-profile")) {
      document.getElementById("userDropdown").classList.remove("active");
      document.removeEventListener("click", closeMenu);
    }
  };
  setTimeout(() => document.addEventListener("click", closeMenu), 10);
}

function togglePassword() {
  const input = document.getElementById("password");
  const icon = document.querySelector(".toggle-password i");
  if (input) {
    input.type = input.type === "password" ? "text" : "password";
    icon.classList.toggle("fa-eye");
    icon.classList.toggle("fa-eye-slash");
  }
}

function toggleTheme() {
  IS_DARK_MODE = !IS_DARK_MODE;
  localStorage.setItem("darkMode", IS_DARK_MODE);
  if (IS_DARK_MODE) enableDarkMode();
  else disableDarkMode();
  
  showToast(`${IS_DARK_MODE ? 'Dark' : 'Light'} mode enabled`, "info");
}

function enableDarkMode() {
  document.body.classList.add("dark-mode");
}

function disableDarkMode() {
  document.body.classList.remove("dark-mode");
}

function showConfirm(message, callback) {
  const dialog = document.getElementById("confirmDialog");
  const msgEl = document.getElementById("confirmMessage");
  const btn = document.getElementById("confirmBtn");
  
  msgEl.textContent = message;
  window.confirmCallback = callback;
  dialog.style.display = "flex";
}

function closeConfirm() {
  document.getElementById("confirmDialog").style.display = "none";
}

function executeConfirm() {
  if (window.confirmCallback) {
    window.confirmCallback();
  }
  closeConfirm();
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

function showNotifications() {
  showToast("No new notifications", "info");
}

function showBackupModal() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "System Backup & Export";

  body.innerHTML = `
    <div class="backup-grid">
      <button class="backup-item" onclick="exportFullBackup()" style="width: 100%; padding: 20px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-main); cursor: pointer;">
        <i class="fas fa-file-export" style="font-size: 2rem; color: var(--primary); margin-bottom: 10px;"></i>
        <div class="backup-info" style="text-align: left;"><strong>JSON Database</strong><p>Full system dump for developers</p></div>
      </button>
    </div>
  `;
  modal.style.display = "flex";
}

async function exportFullBackup() {
  try {
    showToast("Preparing system backup...", "info");
    const response = await fetch(`${API_BASE}/db/export`, {
      headers: { "Authorization": `Bearer ${AUTH_TOKEN}` }
    });
    
    if (!response.ok) throw new Error("Export failed");
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yasrab-erp-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    
    showToast("Backup exported successfully ✓", "success");
    closeModal();
  } catch (err) {
    showToast("Backup failed: " + err.message, "error");
  }
}
