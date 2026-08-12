const API_URL = 'https://break-time-tracker.onrender.com/api';

let currentUser = null;
let authToken = localStorage.getItem('rmc_token');
let currentPage = 'dashboard';
let refreshInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    loadUser();
  } else {
    showScreen('login-screen');
  }
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  document.getElementById('scan-btn').addEventListener('click', startBreak);
  document.getElementById('end-break-btn').addEventListener('click', endBreak);
  document.getElementById('add-employee-form').addEventListener('submit', handleAddEmployee);
  document.getElementById('add-qr-form').addEventListener('submit', handleAddQR);
}

async function api(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` })
    },
    ...options
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  try {
    const response = await fetch(url, config);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }
    return data;
  } catch (error) {
    showToast(error.message, 'error');
    throw error;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  try {
    const data = await api('/auth/login', { method: 'POST', body: { username, password } });
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('rmc_token', authToken);
    showScreen('app-screen');
    initializeApp();
    showToast('Welcome back, ' + data.user.name);
  } catch (error) {
    document.getElementById('login-error').textContent = error.message;
    document.getElementById('login-error').classList.add('show');
  }
}

async function loadUser() {
  try {
    const data = await api('/auth/me');
    currentUser = data.user;
    showScreen('app-screen');
    initializeApp();
  } catch (error) {
    localStorage.removeItem('rmc_token');
    authToken = null;
    showScreen('login-screen');
  }
}

function handleLogout() {
  localStorage.removeItem('rmc_token');
  authToken = null;
  currentUser = null;
  if (refreshInterval) clearInterval(refreshInterval);
  showScreen('login-screen');
  document.getElementById('login-form').reset();
}

function initializeApp() {
  updateUserInfo();
  setupNavigation();
  loadDashboardData();
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    if (currentPage === 'live-status') loadLiveStatus();
    if (currentPage === 'dashboard') loadDashboardData();
  }, 10000);
}

function updateUserInfo() {
  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-role').textContent = currentUser.designation;
  document.getElementById('user-shift').innerHTML = `
    <i class="fas fa-${currentUser.shift === 'Night' ? 'moon' : 'sun'}"></i> 
    ${currentUser.shift} Shift`;
}

function setupNavigation() {
  const adminRoles = ['Admin', 'Coordinator', 'Supervisor', 'Team Leader'];
  const isAdmin = adminRoles.includes(currentUser.designation);
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });
}

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`${page}-page`).classList.add('active');
  const titles = {
    dashboard: 'Dashboard', scan: 'Scan QR Code', 'my-breaks': 'My Break History',
    'live-status': 'Live Status', employees: 'Employee Management',
    qrcodes: 'QR Code Management', reports: 'Reports'
  };
  document.getElementById('page-title').textContent = titles[page] || page;
  switch(page) {
    case 'dashboard': loadDashboardData(); break;
    case 'my-breaks': loadMyBreaks(); break;
    case 'live-status': loadLiveStatus(); break;
    case 'employees': loadEmployees(); break;
    case 'qrcodes': loadQRCodes(); break;
    case 'reports': loadReports(); break;
    case 'scan': setupScanPage(); break;
  }
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

async function loadDashboardData() {
  try {
    const data = await api('/breaks/my-breaks');
    const totalUsed = data.totalUsed || 0;
    const remaining = Math.max(0, (currentUser.maxBreakTime || 60) - totalUsed);
    const breaksTaken = data.breaks ? data.breaks.filter(b => b.status !== 'ongoing').length : 0;
    document.getElementById('total-break-time').textContent = currentUser.maxBreakTime || 60;
    document.getElementById('used-break-time').textContent = totalUsed;
    document.getElementById('remaining-break-time').textContent = remaining;
    document.getElementById('breaks-taken').textContent = `${breaksTaken}/${currentUser.maxBreaksPerShift || 3}`;

    const recentList = document.getElementById('recent-breaks-list');
    if (data.breaks && data.breaks.length > 0) {
      recentList.innerHTML = data.breaks.slice(0, 5).map(b => `
        <div class="break-item">
          <div class="break-info">
            <span class="break-title">Break #${b.breakNumber}</span>
            <span class="break-meta">${formatTime(b.startTime)} ${b.endTime ? '- ' + formatTime(b.endTime) : '(Ongoing)'}</span>
          </div>
          <div>
            <span class="break-duration">${b.duration || '--'} min</span>
            <span class="status-badge status-${b.status}">${b.status}</span>
          </div>
        </div>
      `).join('');
    } else {
      recentList.innerHTML = '<p class="empty-state">No breaks recorded today</p>';
    }
  } catch (error) {
    console.error('Dashboard load error:', error);
  }
}

function setupScanPage() {
  const ongoingBreak = document.getElementById('end-break-btn').dataset.ongoing === 'true';
  updateScanButtons(ongoingBreak);
}

function updateScanButtons(isOngoing) {
  document.getElementById('scan-btn').style.display = isOngoing ? 'none' : 'block';
  document.getElementById('end-break-btn').style.display = isOngoing ? 'block' : 'none';
  document.getElementById('end-break-btn').dataset.ongoing = isOngoing ? 'true' : 'false';
}

async function startBreak() {
  const qrCodeId = document.getElementById('qr-code-input').value.trim();
  if (!qrCodeId) { showScanResult('Please enter a QR Code ID', 'error'); return; }
  try {
    const data = await api('/breaks/start', { method: 'POST', body: { qrCodeId } });
    showScanResult(`Break #${data.breakRecord.breakNumber} started! Remaining: ${data.remainingBreakTime} min`, 'success');
    updateScanButtons(true);
    loadDashboardData();
  } catch (error) {
    showScanResult(error.message, 'error');
  }
}

async function endBreak() {
  const qrCodeId = document.getElementById('qr-code-input').value.trim();
  if (!qrCodeId) { showScanResult('Please enter a QR Code ID', 'error'); return; }
  try {
    const data = await api('/breaks/end', { method: 'POST', body: { qrCodeId } });
    const msg = data.exceeded
      ? `Break ended. Duration: ${data.duration} min. WARNING: Break time exceeded!`
      : `Break ended. Duration: ${data.duration} min. Remaining: ${data.remainingBreakTime} min`;
    showScanResult(msg, data.exceeded ? 'error' : 'success');
    updateScanButtons(false);
    loadDashboardData();
  } catch (error) {
    showScanResult(error.message, 'error');
  }
}

function showScanResult(message, type) {
  const result = document.getElementById('scan-result');
  result.textContent = message;
  result.className = `scan-result ${type}`;
}

async function loadMyBreaks() {
  try {
    const data = await api('/breaks/my-breaks');
    document.getElementById('my-total-time').textContent = `${currentUser.maxBreakTime || 60} min`;
    document.getElementById('my-used-time').textContent = `${data.totalUsed || 0} min`;
    document.getElementById('my-remaining-time').textContent = `${data.remaining || 60} min`;
    const tbody = document.getElementById('my-breaks-tbody');
    if (data.breaks && data.breaks.length > 0) {
      tbody.innerHTML = data.breaks.map(b => `
        <tr>
          <td>${b.breakNumber}</td>
          <td>${formatDateTime(b.startTime)}</td>
          <td>${b.endTime ? formatDateTime(b.endTime) : '-'}</td>
          <td>${b.duration || '--'} min</td>
          <td><span class="status-badge status-${b.status}">${b.status}</span></td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No breaks recorded</td></tr>';
    }
  } catch (error) {
    console.error('My breaks load error:', error);
  }
}

async function loadLiveStatus() {
  try {
    const data = await api('/breaks/live-status');
    document.getElementById('live-on-break').textContent = data.totalOnBreak;
    document.getElementById('live-available').textContent = data.totalAvailable;

    const onBreakList = document.getElementById('on-break-list');
    if (data.onBreak && data.onBreak.length > 0) {
      onBreakList.innerHTML = data.onBreak.map(b => `
        <div class="staff-item">
          <div class="staff-info">
            <div class="staff-avatar">${b.employee.name.charAt(0)}</div>
            <div>
              <div class="staff-name">${b.employee.name}</div>
              <div class="staff-meta">${b.employee.designation} &bull; ${b.employee.shift}</div>
            </div>
          </div>
          <div class="break-timer" data-start="${b.startTime}">${calculateElapsed(b.startTime)}</div>
        </div>
      `).join('');
    } else {
      onBreakList.innerHTML = '<p class="empty-state">No one is currently on break</p>';
    }

    const availableList = document.getElementById('available-list');
    if (data.available && data.available.length > 0) {
      availableList.innerHTML = data.available.map(u => `
        <div class="staff-item">
          <div class="staff-info">
            <div class="staff-avatar">${u.name.charAt(0)}</div>
            <div>
              <div class="staff-name">${u.name}</div>
              <div class="staff-meta">${u.shift}</div>
            </div>
          </div>
          <span class="status-badge status-completed">Available</span>
        </div>
      `).join('');
    } else {
      availableList.innerHTML = '<p class="empty-state">No available staff</p>';
    }

    const exceeded = data.completed ? data.completed.filter(b => b.status === 'exceeded').length : 0;
    document.getElementById('live-exceeded').textContent = exceeded;
  } catch (error) {
    console.error('Live status load error:', error);
  }
}

async function loadEmployees() {
  try {
    const data = await api('/users');
    const tbody = document.getElementById('employees-tbody');
    tbody.innerHTML = data.map(u => `
      <tr>
        <td>${u.employeeId}</td>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.designation}</td>
        <td>${u.shift}</td>
        <td><span class="status-badge ${u.isActive ? 'status-completed' : 'status-exceeded'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn btn-sm" onclick="deleteEmployee('${u._id}')" ${u.designation === 'Admin' ? 'disabled' : ''}>
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Employees load error:', error);
  }
}

async function handleAddEmployee(e) {
  e.preventDefault();
  const body = {
    employeeId: document.getElementById('new-emp-id').value,
    name: document.getElementById('new-emp-name').value,
    email: document.getElementById('new-emp-email').value,
    password: document.getElementById('new-emp-password').value,
    designation: document.getElementById('new-emp-designation').value,
    shift: document.getElementById('new-emp-shift').value,
    maxBreakTime: parseInt(document.getElementById('new-emp-max-break').value),
    maxBreaksPerShift: parseInt(document.getElementById('new-emp-max-breaks').value)
  };
  try {
    await api('/users', { method: 'POST', body });
    closeModal('add-employee-modal');
    document.getElementById('add-employee-form').reset();
    loadEmployees();
    showToast('Employee created successfully');
  } catch (error) {
    console.error('Add employee error:', error);
  }
}

async function deleteEmployee(id) {
  if (!confirm('Are you sure you want to deactivate this employee?')) return;
  try {
    await api(`/users/${id}`, { method: 'DELETE' });
    loadEmployees();
    showToast('Employee deactivated');
  } catch (error) {
    console.error('Delete employee error:', error);
  }
}

async function loadQRCodes() {
  try {
    const data = await api('/qrcodes');
    const tbody = document.getElementById('qrcodes-tbody');
    tbody.innerHTML = data.map(qr => `
      <tr>
        <td><code>${qr.codeId}</code></td>
        <td>${qr.location}</td>
        <td>${qr.description || '-'}</td>
        <td><span class="status-badge ${qr.isActive ? 'status-completed' : 'status-exceeded'}">${qr.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>
          <button class="btn btn-sm" onclick="deleteQRCode('${qr._id}')">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('QR codes load error:', error);
  }
}

async function handleAddQR(e) {
  e.preventDefault();
  const body = {
    location: document.getElementById('new-qr-location').value,
    description: document.getElementById('new-qr-description').value
  };
  try {
    await api('/qrcodes', { method: 'POST', body });
    closeModal('add-qr-modal');
    document.getElementById('add-qr-form').reset();
    loadQRCodes();
    showToast('QR Code created successfully');
  } catch (error) {
    console.error('Add QR error:', error);
  }
}

async function deleteQRCode(id) {
  if (!confirm('Are you sure you want to delete this QR code?')) return;
  try {
    await api(`/qrcodes/${id}`, { method: 'DELETE' });
    loadQRCodes();
    showToast('QR Code deleted');
  } catch (error) {
    console.error('Delete QR error:', error);
  }
}

async function loadReports() {
  document.getElementById('report-date').valueAsDate = new Date();
}

async function generateReport() {
  const type = document.getElementById('report-type').value;
  const date = document.getElementById('report-date').value;
  try {
    let data;
    if (type === 'daily') {
      data = await api(`/reports/daily?date=${date}`);
    } else if (type === 'weekly') {
      data = await api(`/reports/weekly?startDate=${date}`);
    } else {
      const d = new Date(date);
      data = await api(`/reports/monthly?year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
    }

    const summaryDiv = document.getElementById('report-summary');
    summaryDiv.innerHTML = `
      <div class="stats-grid" style="margin-bottom: 20px;">
        <div class="stat-card">
          <div class="stat-icon blue"><i class="fas fa-list"></i></div>
          <div class="stat-info">
            <span class="stat-value">${data.summary.totalBreaks}</span>
            <span class="stat-label">Total Breaks</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green"><i class="fas fa-clock"></i></div>
          <div class="stat-info">
            <span class="stat-value">${data.summary.totalDuration || data.summary.avgDuration * data.summary.totalBreaks}</span>
            <span class="stat-label">Total Minutes</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon orange"><i class="fas fa-exclamation"></i></div>
          <div class="stat-info">
            <span class="stat-value">${data.summary.exceededCount || data.summary.exceededBreaks || 0}</span>
            <span class="stat-label">Exceeded</span>
          </div>
        </div>
      </div>
    `;

    const table = document.getElementById('report-table');
    const employeeStats = data.employeeStats || [];
    table.innerHTML = `
      <thead>
        <tr><th>Employee</th><th>Total Breaks</th><th>Total Duration</th><th>Exceeded</th></tr>
      </thead>
      <tbody>
        ${employeeStats.length > 0 ? employeeStats.map(s => `
          <tr>
            <td>${s.employee ? s.employee.name : 'Unknown'}</td>
            <td>${s.totalBreaks}</td>
            <td>${s.totalDuration} min</td>
            <td>${s.exceeded}</td>
          </tr>
        `).join('') : '<tr><td colspan="4" class="empty-state">No data available</td></tr>'}
      </tbody>
    `;
  } catch (error) {
    console.error('Report generation error:', error);
  }
}

function showAddEmployeeModal() { document.getElementById('add-employee-modal').classList.add('show'); }
function showAddQRModal() { document.getElementById('add-qr-modal').classList.add('show'); }
function closeModal(modalId) { document.getElementById(modalId).classList.remove('show'); }

function formatTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function calculateElapsed(startTime) {
  const start = new Date(startTime);
  const now = new Date();
  const diff = Math.floor((now - start) / 1000);
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  const icon = toast.querySelector('i');
  msgEl.textContent = message;
  icon.className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
  icon.style.color = type === 'error' ? 'var(--danger)' : 'var(--success)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.classList.remove('show');
  }
};
