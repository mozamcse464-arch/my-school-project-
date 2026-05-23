// ===== GLOBAL STATE & CONSTANTS =====
let AUTH_TOKEN = localStorage.getItem("token") || null;
let CURRENT_MODULE = "dashboard";
let CURRENT_DATA = {};
let IS_DARK_MODE = localStorage.getItem("darkMode") === "true";
const API_BASE = window.location.origin;

// ===== INITIALIZATION =====
document.addEventListener("DOMContentLoaded", async () => {
  // Check theme
  if (IS_DARK_MODE) enableDarkMode();

  const todayInput = document.getElementById("attendanceDate");
  if (todayInput) todayInput.valueAsDate = new Date();

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  // Initial routing
  if (AUTH_TOKEN) {
    try {
      await loadDashboard();
      showApp();
    } catch (err) {
      console.error("Failed to load initial data:", err);
      showLogin();
    }
  } else {
    // Small delay for branding effect
    setTimeout(showLogin, 800);
  }
});

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

    if (!res.ok) throw new Error(data.msg || data.message || "Login failed");
    if (!data.token) throw new Error("No token received");

    AUTH_TOKEN = data.token;
    localStorage.setItem("token", AUTH_TOKEN);
    showToast("Welcome back! Login successful ✓", "success");

    // Clean up and load app
    document.getElementById("username").value = "";
    document.getElementById("password").value = "";
    
    await loadDashboard();
    showApp();
  } catch (err) {
    showToast(err.message || "Login error", "error");
    console.error("Login error:", err);
  } finally {
    loginBtn.innerHTML = originalContent;
    loginBtn.disabled = false;
  }
}

function logout() {
  showConfirm("Are you sure you want to logout? your session will be ended.", () => {
    AUTH_TOKEN = null;
    localStorage.removeItem("token");
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
    }, 300);
  } else {
    document.getElementById("loginPage").style.display = "flex";
    document.getElementById("mainApp").style.display = "none";
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
    }, 300);
  } else {
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainApp").style.display = "flex";
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
      activityList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-clock-rotate-left"></i>
          <p>No recent activity found</p>
        </div>
      `;
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
  showToast("Refreshing data...", "info");
  loadDashboard();
}

// ===== ADMISSIONS =====
async function loadAdmissions() {
  try {
    const admissions = await apiCall("/admissions");
    const tbody = document.getElementById("admissionsTable");

    if (admissions.length === 0) {
      tbody.innerHTML = "<tr><td colspan='7' class='text-center'><div class='empty-state'><i class='fas fa-folder-open'></i><p>No admission applications</p></div></td></tr>";
      return;
    }

    tbody.innerHTML = admissions.map(adm => `
      <tr>
        <td data-label="ID">${adm.id}</td>
        <td data-label="Name">${adm.name}</td>
        <td data-label="Class">${adm.class}</td>
        <td data-label="Phone">${adm.phone}</td>
        <td data-label="Date">${formatDate(adm.date)}</td>
        <td data-label="Status"><span class="badge" style="background: ${adm.status === 'pending' ? '#f39c12' : '#27ae60'}">${adm.status}</span></td>
        <td data-label="Actions">
          ${adm.status === 'pending' ? `
            <button class="btn-small" onclick="approveAdmission('${adm.id}')" title="Approve"><i class="fas fa-check"></i></button>
            <button class="btn-small reject" onclick="rejectAdmission('${adm.id}')" title="Reject"><i class="fas fa-times"></i></button>
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
      <div class="form-group"><label>Full Name</label><input type="text" id="admName" placeholder="Enter student's name" required></div>
      <div class="form-group"><label>Target Class</label><input type="text" id="admClass" placeholder="e.g. 10th" required></div>
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
  try {
    const payload = {
      name: document.getElementById("admName").value.trim(),
      class: document.getElementById("admClass").value.trim(),
      phone: document.getElementById("admPhone").value.trim(),
      address: document.getElementById("admAddress").value.trim()
    };

    if (!payload.name || !payload.class) throw new Error("Name and class are required");

    await apiCall("/admissions", { method: "POST", body: JSON.stringify(payload) });
    showToast("Application submitted successfully ✓", "success");
    closeModal();
    loadAdmissions();
  } catch (err) {
    showToast(err.message, "error");
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
  try {
    const students = await apiCall("/students");
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
          <button class="btn-small" onclick="editStudent('${s.id}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-small reject" onclick="deleteStudent('${s.id}')" title="Delete"><i class="fas fa-trash"></i></button>
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
  document.getElementById("modalTitle").textContent = "Register New Student";

  body.innerHTML = `
    <form id="studentFormContent" class="form-grid">
      <div class="form-group"><label>Student ID</label><input type="text" id="stdId" placeholder="e.g. S-101" required></div>
      <div class="form-group"><label>Full Name</label><input type="text" id="stdName" required></div>
      <div class="form-group"><label>Class</label><input type="text" id="stdClass" required></div>
      <div class="form-group"><label>Phone</label><input type="tel" id="stdPhone"></div>
      <div class="form-group" style="grid-column: 1/-1;"><label>Address</label><input type="text" id="stdAddress"></div>
      <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 10px;">
        <button type="button" class="btn btn-primary" onclick="submitStudent()" style="flex: 1;">Add Student</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
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

    if (!payload.id || !payload.name || !payload.class) {
      throw new Error("Student ID, name, and class are required");
    }

    if (!/^[A-Za-z0-9\-]{1,20}$/.test(payload.id)) {
      throw new Error("Student ID must be 1-20 alphanumeric characters");
    }

    if (!/^[A-Za-z\s]{2,100}$/.test(payload.name)) {
      throw new Error("Name must contain 2-100 letters only");
    }

    if (payload.phone && !/^[\d+\-\(\)\s]{7,20}$/.test(payload.phone)) {
      throw new Error("Invalid phone number format");
    }

    const students = await apiCall("/students");
    const existingById = students.find(s => s.id === payload.id);
    if (existingById) {
      throw new Error(`Student ID "${payload.id}" already exists`);
    }

    const existingByName = students.find(s => s.name.toLowerCase() === payload.name.toLowerCase());
    if (existingByName) {
      throw new Error(`Student "${payload.name}" already enrolled (ID: ${existingByName.id})`);
    }

    await apiCall("/students", { method: "POST", body: JSON.stringify(payload) });
    showToast("Student registered successfully ✓", "success");
    closeModal();
    loadStudents();
  } catch (err) {
    showToast(err.message, "error");
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
  showToast("Quick Edit feature is under development", "info");
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
      <div class="form-group"><label>Department/Subject</label><input type="text" id="tchSubject" required></div>
      <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 10px;">
        <button type="button" class="btn btn-primary" onclick="submitTeacher()" style="flex: 1;">Add Teacher</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
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

    if (!payload.name || !payload.subject) throw new Error("Name and subject are required");

    if (!/^[A-Za-z\s]{2,100}$/.test(payload.name)) {
      throw new Error("Name must contain 2-100 letters only");
    }

    const teachers = await apiCall("/teachers");
    const existingTeacher = teachers.find(t => t.name.toLowerCase() === payload.name.toLowerCase());
    if (existingTeacher) {
      throw new Error(`Teacher "${payload.name}" is already registered (ID: ${existingTeacher.id})`);
    }

    await apiCall("/teachers", { method: "POST", body: JSON.stringify(payload) });
    showToast("Teacher added successfully ✓", "success");
    closeModal();
    loadTeachers();
  } catch (err) {
    showToast(err.message, "error");
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
              <select id="att-${s.id}" class="att-select ${status}">
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
  } catch (err) {
    console.error("Attendance load failed:", err);
  }
}

async function saveAttendance() {
  const saveBtn = document.querySelector("#module-attendance .btn-primary");
  const originalHtml = saveBtn.innerHTML;
  
  try {
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    saveBtn.disabled = true;

    const date = document.getElementById("attendanceDate").value;
    const students = await apiCall("/students");

    for (const student of students) {
      const status = document.getElementById(`att-${student.id}`)?.value || "present";
      await apiCall("/attendance", {
        method: "POST",
        body: JSON.stringify({ id: student.id, status })
      });
    }

    showToast(`Attendance saved successfully for ${date} ✓`, "success");
    loadAttendanceForDate();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    saveBtn.innerHTML = originalHtml;
    saveBtn.disabled = false;
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
            <td data-label="Student ID">${studentId}</td>
            <td data-label="Amount" class="state-success">Rs. ${fee.amount.toLocaleString()}</td>
            <td data-label="Month">${fee.month}</td>
            <td data-label="Method"><span class="label">${fee.method}</span></td>
            <td data-label="Receipt"><code>${fee.receipt || 'N/A'}</code></td>
            <td data-label="Date">${formatDate(fee.date)}</td>
          </tr>
        `);
      });
    }

    tbody.innerHTML = rows.length > 0 ? rows.join("") : "<tr><td colspan='6' class='text-center'><div class='empty-state'><i class='fas fa-money-bill-transfer'></i><p>No fee records found</p></div></td></tr>";
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
  try {
    const payload = {
      id: document.getElementById("feeStdId").value.trim(),
      amount: Number(document.getElementById("feeAmount").value),
      month: document.getElementById("feeMonth").value.trim(),
      method: document.getElementById("feeMethod").value
    };

    if (!payload.id || !payload.amount || !payload.month) {
      throw new Error("Please fill all required fields");
    }

    if (payload.amount <= 0 || payload.amount >= 10000000) {
      throw new Error("Amount must be between 1 and 10000000");
    }

    const students = await apiCall("/students");
    const student = students.find(s => s.id === payload.id);
    if (!student) {
      throw new Error(`Student ID "${payload.id}" does not exist. Please check and try again.`);
    }

    const fees = await apiCall("/fees");
    const existingFee = fees[payload.id]?.find(f => f.month === payload.month);
    if (existingFee) {
      throw new Error(`Fee for ${payload.month} already recorded for ${payload.id}. Cannot add duplicate payment.`);
    }

    await apiCall("/fees", { method: "POST", body: JSON.stringify(payload) });
    showToast("Fee payment recorded successfully ✓", "success");
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
        const gradeClass = result.grade === 'A+' || result.grade === 'A' ? 'state-success' : result.grade === 'F' ? 'state-error' : 'state-warning';
        rows.push(`
          <tr>
            <td data-label="Student ID">${studentId}</td>
            <td data-label="Subject">${result.subject}</td>
            <td data-label="Marks">${result.marks} / ${result.total}</td>
            <td data-label="Percentage">${result.percentage}%</td>
            <td data-label="Grade"><span class="badge ${gradeClass}">${result.grade}</span></td>
            <td data-label="Date">${formatDate(result.date)}</td>
          </tr>
        `);
      });
    }

    tbody.innerHTML = rows.length > 0 ? rows.join("") : "<tr><td colspan='6' class='text-center'><div class='empty-state'><i class='fas fa-graduation-cap'></i><p>No results published yet</p></div></td></tr>";
  } catch (err) {
    console.error("Results load failed:", err);
  }
}

function openResultForm() {
  const modal = document.getElementById("formModal");
  const body = document.getElementById("modalBody");
  document.getElementById("modalTitle").textContent = "Publish Academic Result";

  body.innerHTML = `
    <form id="resultFormContent" class="form-grid">
      <div class="form-group"><label>Student ID</label><input type="text" id="resStdId" placeholder="e.g. S-101" required></div>
      <div class="form-group"><label>Subject</label><input type="text" id="resSubject" placeholder="Mathematics" required></div>
      <div class="form-group"><label>Obtained Marks</label><input type="number" id="resMarks" min="0" required></div>
      <div class="form-group"><label>Total Marks</label><input type="number" id="resTotal" value="100" min="1" required></div>
      <div style="grid-column: 1/-1; display: flex; gap: 10px; margin-top: 10px;">
        <button type="button" class="btn btn-primary" onclick="submitResult()" style="flex: 1;">Publish Result</button>
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      </div>
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

    if (!payload.id || !payload.subject || payload.marks === "") throw new Error("All fields are required");
    if (payload.marks > payload.total) throw new Error("Obtained marks cannot be greater than total marks");

    if (payload.marks < 0 || payload.marks > 100) throw new Error("Marks must be between 0 and 100");
    if (payload.total <= 0) throw new Error("Total marks must be greater than 0");

    const students = await apiCall("/students");
    const student = students.find(s => s.id === payload.id);
    if (!student) {
      throw new Error(`Student "${payload.id}" does not exist. Please check and try again.`);
    }

    await apiCall("/results", { method: "POST", body: JSON.stringify(payload) });
    showToast("Result published successfully ✓", "success");
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
          <li>
            <div class="schedule-time"><i class="far fa-clock"></i> ${entry.day || 'N/A'} at ${entry.time}</div>
            <div class="schedule-subject">${entry.subject}</div>
          </li>`;
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
  try {
    const payload = {
      className: document.getElementById("ttClassName").value.trim(),
      subject: document.getElementById("ttSubject").value.trim(),
      day: document.getElementById("ttDay").value.trim(),
      time: document.getElementById("ttTime").value
    };

    if (!payload.className || !payload.subject || !payload.day || !payload.time) throw new Error("All fields are required");

    await apiCall("/timetable", { method: "POST", body: JSON.stringify(payload) });
    showToast("Schedule updated successfully ✓", "success");
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
      list.innerHTML = "<div class='empty-state'><i class='fas fa-bullhorn'></i><p>No recent announcements</p></div>";
      return;
    }

    list.innerHTML = announcements.map(a => `
      <div class="announcement-item ${a.priority === 'high' ? 'priority-high' : ''}">
        <div class="announcement-header">
          <h4>${a.title}</h4>
          <span class="badge ${a.priority === 'high' ? 'state-error' : 'state-warning'}">${a.priority}</span>
        </div>
        <p>${a.message}</p>
        <div class="announcement-footer">
          <span><i class="far fa-clock"></i> ${formatTime(a.time)}</span>
          <span><i class="far fa-user"></i> Admin</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    console.error("Announcements load failed:", err);
  }
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
  try {
    const payload = {
      title: document.getElementById("annTitle").value.trim(),
      message: document.getElementById("annMessage").value.trim(),
      priority: document.getElementById("annPriority").value
    };

    if (!payload.title || !payload.message) throw new Error("Title and message are required");

    await apiCall("/announcements", { method: "POST", body: JSON.stringify(payload) });
    showToast("Announcement published ✓", "success");
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
  const saveBtn = document.querySelector("#module-settings .btn-primary");
  try {
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    const payload = {
      schoolName: document.getElementById("schoolName").value.trim(),
      address: document.getElementById("schoolAddress").value.trim(),
      contact: document.getElementById("schoolContact").value.trim(),
      email: document.getElementById("schoolEmail").value.trim()
    };

    await apiCall("/config", { method: "PATCH", body: JSON.stringify(payload) });
    showToast("System settings updated successfully ✓", "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
  }
}

// ===== LOGS =====
async function loadLogs() {
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
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ===== UI UTILITIES =====
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: 'check-circle',
    error: 'circle-exclamation',
    info: 'info-circle',
    warning: 'triangle-exclamation'
  };
  
  toast.innerHTML = `<i class="fas fa-${icons[type] || 'bell'}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
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

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("active");
}

function toggleUserMenu() {
  document.getElementById("userDropdown").classList.toggle("active");
  
  // Close when clicking outside
  const closeMenu = (e) => {
    if (!e.target.closest(".user-menu")) {
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

function exportFullBackup() {
  showToast("Export feature coming soon", "info");
}
