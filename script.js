/* ==========================================================================
   AZURE PORTAL ADMIN PANEL - CORE ENGINE (SCRIPT.JS)
   ========================================================================== */

// --- MOCK IN-MEMORY DATA STATE ---
let resources = [
  { 
    id: 'vm-web', 
    name: 'prod-web-vm', 
    type: 'Virtual Machine', 
    group: 'production-rg', 
    status: 'Running', 
    subscription: 'Pay-As-You-Go', 
    location: 'East US', 
    details: 'Size: Standard B2s (2 vCPUs, 4GB RAM) • OS: Ubuntu Server 22.04 LTS • Public IP: 52.186.24.112' 
  },
  { 
    id: 'app-api', 
    name: 'core-banking-api', 
    type: 'App Service', 
    group: 'production-rg', 
    status: 'Running', 
    subscription: 'Pay-As-You-Go', 
    location: 'East US', 
    details: 'Stack: Node.js 18 LTS • URL: https://core-banking-api.azurewebsites.net' 
  },
  { 
    id: 'db-sql', 
    name: 'transactions-db', 
    type: 'SQL Database', 
    group: 'production-rg', 
    status: 'Stopped', 
    subscription: 'Pay-As-You-Go', 
    location: 'West Europe', 
    details: 'Pricing Tier: General Purpose, Gen5 2 vCPUs • Max Storage: 250 GB' 
  },
  { 
    id: 'st-logs', 
    name: 'applicationlogsstorage', 
    type: 'Storage Account', 
    group: 'shared-infra-rg', 
    status: 'Running', 
    subscription: 'Pay-As-You-Go', 
    location: 'Southeast Asia', 
    details: 'Kind: StorageV2 (general purpose v2) • Replication: RA-GRS • Access Tier: Hot' 
  }
];

let notifications = [
  { id: 1, title: 'Security Check Passed', desc: 'No vulnerabilities identified in Microsoft Defender for Cloud.', time: '10 mins ago', type: 'success' },
  { id: 2, title: 'Storage Replicated', desc: 'Replication complete for applicationlogsstorage to secondary region.', time: '42 mins ago', type: 'success' }
];

let selectedResourceId = null;
let currentTheme = 'light';
let sidebarCollapsed = false;

// --- CHART OBJECTS FOR DISPOSAL/UPDATE ---
let cpuChart = null;
let networkChart = null;
let bladeChart = null;
let chartUpdateInterval = null;

// --- INITIALIZE APPLICATION ON LOAD ---
document.addEventListener('DOMContentLoaded', () => {
  renderResourcesTable();
  updateRecentResources();
  updateNotificationsBadge();
  setupEventListeners();
  initDashboardCharts();
  
  // Apply default light theme active class
  document.getElementById('theme-opt-light').classList.add('active');
  
  // Start simulation of fluctuating metric values
  startMetricSimulation();
});

// --- NAVIGATION & ROUTER VIEW ---
function switchView(viewId, typeFilter = 'All') {
  // Deactivate all views
  document.querySelectorAll('.view-content').forEach(view => {
    view.classList.remove('active');
  });
  
  // Activate selected view
  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) targetView.classList.add('active');
  
  // Update Active Sidebar Link
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
  });
  const matchingMenuItem = document.getElementById(`menu-${viewId}`);
  if (matchingMenuItem) matchingMenuItem.classList.add('active');
  
  // Update Breadcrumbs
  const breadcrumbText = document.getElementById('breadcrumbActiveItem');
  if (viewId === 'home') {
    breadcrumbText.textContent = 'Home Overview';
  } else if (viewId === 'dashboard') {
    breadcrumbText.textContent = 'Operational Dashboard';
    setTimeout(() => { resizeCharts(); }, 150); // let transition finish before resizing charts
  } else if (viewId === 'resources') {
    breadcrumbText.textContent = 'Resource Explorer';
    
    // Handle filters
    const typeDropdown = document.getElementById('resourceTypeFilter');
    if (typeDropdown) {
      typeDropdown.value = typeFilter;
      filterResourcesTable();
    }
  }
}

// --- COLLAPSED SIDEBAR TOGGLE ---
function toggleSidebarDock(isDocked) {
  const container = document.getElementById('appShell');
  if (isDocked) {
    container.classList.remove('collapsed-nav');
    sidebarCollapsed = false;
  } else {
    container.classList.add('collapsed-nav');
    sidebarCollapsed = true;
  }
}

// --- SETTINGS PORTAL THEME TOGGLE ---
function setPortalTheme(themeName) {
  currentTheme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  
  // Update settings dialog buttons
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.remove('active');
  });
  document.getElementById(`theme-opt-${themeName}`).classList.add('active');
  
  // Update header components/body if needed
  showToast('Theme Configuration Applied', `Portal theme switched to Azure ${themeName.charAt(0).toUpperCase() + themeName.slice(1)}.`, 'success');
  
  // Redraw charts with correct theme colors
  destroyCharts();
  initDashboardCharts();
  
  // If blade details is open, recreate blade chart
  if (selectedResourceId) {
    updateBladeChart(selectedResourceId);
  }
}

// --- STACKED BLADES CONTROLLER ---
function openBlade(bladeId) {
  const overlay = document.getElementById('bladeOverlay');
  const blade = document.getElementById(bladeId);
  
  overlay.classList.add('active');
  blade.classList.add('active');
  
  // Manage responsive overlays or layout
  if (window.innerWidth <= 768) {
    document.body.style.overflow = 'hidden';
  }
}

function closeBlade(bladeId) {
  const blade = document.getElementById(bladeId);
  blade.classList.remove('active');
  
  // Remove stacked states
  blade.classList.remove('stacked', 'top-stacked');
  
  // If no active blades are open, shut off overlay
  const activeBlades = document.querySelectorAll('.blade.active');
  if (activeBlades.length === 0) {
    document.getElementById('bladeOverlay').classList.remove('active');
    document.body.style.overflow = '';
  }
}

function closeAllBlades() {
  document.querySelectorAll('.blade').forEach(blade => {
    blade.classList.remove('active', 'stacked', 'top-stacked');
  });
  document.getElementById('bladeOverlay').classList.remove('active');
  document.body.style.overflow = '';
  selectedResourceId = null;
}

// --- RESOURCE MANAGEMENT: DISPLAY DATA ---
function renderResourcesTable(listToRender = resources) {
  const tbody = document.getElementById('allResourcesBody');
  tbody.innerHTML = '';
  
  if (listToRender.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--text-secondary);">No resources found matching filter criteria.</td></tr>`;
    return;
  }
  
  listToRender.forEach(res => {
    const tr = document.createElement('tr');
    tr.onclick = (e) => {
      // Prevent opening details when clicking actions buttons directly
      if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
        openDetailsBlade(res.id);
      }
    };
    
    const icon = getServiceEmoji(res.type);
    const statusClass = res.status.toLowerCase();
    
    tr.innerHTML = `
      <td>
        <div class="resource-name-cell">
          <span>${icon}</span>
          <span>${res.name}</span>
        </div>
      </td>
      <td>${res.type}</td>
      <td>${res.group}</td>
      <td>
        <span class="status-badge ${statusClass}">
          <span class="status-badge-dot"></span>
          ${res.status}
        </span>
      </td>
      <td>${res.subscription}</td>
      <td>${res.location}</td>
      <td>
        <div style="display:flex; gap:6px;">
          ${res.status === 'Running' 
            ? `<button class="btn-azure-secondary" style="padding: 2px 6px; font-size:10px;" onclick="changeResourceStatus('${res.id}', 'Stopped')" title="Stop Resource">⏹️ Stop</button>`
            : `<button class="btn-azure-secondary" style="padding: 2px 6px; font-size:10px;" onclick="changeResourceStatus('${res.id}', 'Running')" title="Start Resource">▶️ Start</button>`
          }
        </div>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
}

function updateRecentResources() {
  const tbody = document.getElementById('recentResourcesBody');
  tbody.innerHTML = '';
  
  // Show up to 4 items on Home overview
  const recent = resources.slice(-4);
  
  recent.forEach(res => {
    const tr = document.createElement('tr');
    tr.onclick = () => openDetailsBlade(res.id);
    
    const icon = getServiceEmoji(res.type);
    const statusClass = res.status.toLowerCase();
    
    tr.innerHTML = `
      <td>
        <div class="resource-name-cell">
          <span>${icon}</span>
          <span>${res.name}</span>
        </div>
      </td>
      <td>${res.type}</td>
      <td>${res.group}</td>
      <td>
        <span class="status-badge ${statusClass}">
          <span class="status-badge-dot"></span>
          ${res.status}
        </span>
      </td>
      <td>${res.subscription}</td>
      <td>${res.location}</td>
    `;
    tbody.appendChild(tr);
  });
}

function getServiceEmoji(type) {
  switch (type) {
    case 'Virtual Machine': return '🖥️';
    case 'App Service': return '🌐';
    case 'SQL Database': return '🛢️';
    case 'Storage Account': return '📦';
    default: return '⚙️';
  }
}

// --- CREATOR BLADE CONTROLS ---
function openCreateBlade(defaultType = 'Virtual Machine') {
  document.getElementById('newResourceType').value = defaultType;
  onResourceTypeChange();
  
  // Clear previous values
  document.getElementById('newResourceName').value = '';
  
  openBlade('createResourceBlade');
}

function onResourceTypeChange() {
  const type = document.getElementById('newResourceType').value;
  const vmFields = document.getElementById('vmSpecificFields');
  const appFields = document.getElementById('appSpecificFields');
  
  if (type === 'Virtual Machine') {
    vmFields.style.display = 'block';
    appFields.style.display = 'none';
  } else if (type === 'App Service') {
    vmFields.style.display = 'none';
    appFields.style.display = 'block';
  } else {
    vmFields.style.display = 'none';
    appFields.style.display = 'none';
  }
}

function handleResourceSubmit(event) {
  event.preventDefault();
  
  const type = document.getElementById('newResourceType').value;
  const name = document.getElementById('newResourceName').value.trim();
  const group = document.getElementById('newResourceGroup').value;
  const location = document.getElementById('newResourceLocation').value;
  
  // Validation for duplicate name
  if (resources.some(r => r.name.toLowerCase() === name.toLowerCase())) {
    showToast('Deployment Failed', `Resource name '${name}' is already in use in subscription.`, 'danger');
    return;
  }
  
  // Formulate details based on type
  let detailsText = '';
  if (type === 'Virtual Machine') {
    const size = document.getElementById('vmSize').value.split(' - ')[0];
    const os = document.getElementById('vmOs').value;
    detailsText = `Size: ${size} • OS: ${os} • IP: 52.176.108.${Math.floor(Math.random() * 254) + 1}`;
  } else if (type === 'App Service') {
    const stack = document.getElementById('appRuntime').value;
    detailsText = `Stack: ${stack} • URL: https://${name}.azurewebsites.net`;
  } else if (type === 'SQL Database') {
    detailsText = 'Pricing Tier: General Purpose, Gen5 2 vCPUs • Storage Limit: 250 GB';
  } else {
    detailsText = 'Kind: StorageV2 (general purpose v2) • Access Tier: Hot • Replication: LRS';
  }
  
  const newId = `res-${Date.now()}`;
  const newResource = {
    id: newId,
    name,
    type,
    group,
    status: 'Running',
    subscription: 'Pay-As-You-Go',
    location,
    details: detailsText
  };
  
  resources.push(newResource);
  
  // Push Notification Logs
  addNotification(`Deployment Successful`, `Created resource group compartment and deployed '${name}' (${type}) successfully.`, 'success');
  
  // Trigger update lists
  renderResourcesTable();
  updateRecentResources();
  closeBlade('createResourceBlade');
  
  showToast('Resource Created Successfully', `'${name}' has been provisioned and is now Running.`, 'success');
  
  // Add to estimated costs
  const baseCost = type === 'Virtual Machine' ? 24.50 : type === 'App Service' ? 12.00 : 8.50;
  updateEstimatedCosts(baseCost);
}

// --- DETAILS BLADE CONTROLS ---
function openDetailsBlade(id) {
  selectedResourceId = id;
  const res = resources.find(r => r.id === id);
  if (!res) return;
  
  document.getElementById('detName').textContent = res.name;
  document.getElementById('detType').textContent = res.type;
  document.getElementById('detGroup').textContent = res.group;
  document.getElementById('detStatus').textContent = res.status;
  document.getElementById('detLocation').textContent = res.location;
  
  // Detail visual badges for status inside details
  const statusSpan = document.getElementById('detStatus');
  statusSpan.className = ''; // wipe
  statusSpan.classList.add('status-badge', res.status.toLowerCase());
  statusSpan.innerHTML = `<span class="status-badge-dot"></span>${res.status}`;
  
  // Set details context text boxes
  document.getElementById('detContextTitle').textContent = `${res.type} Configurations`;
  document.getElementById('detContextDesc').textContent = res.details;
  
  // Handle start/stop button states dynamically
  const startBtn = document.getElementById('controlStartBtn');
  const stopBtn = document.getElementById('controlStopBtn');
  
  if (res.status === 'Running') {
    startBtn.style.opacity = '0.5';
    startBtn.disabled = true;
    stopBtn.style.opacity = '1';
    stopBtn.disabled = false;
  } else {
    startBtn.style.opacity = '1';
    startBtn.disabled = false;
    stopBtn.style.opacity = '0.5';
    stopBtn.disabled = true;
  }
  
  openBlade('detailsResourceBlade');
  
  // Render details interactive chart
  setTimeout(() => {
    updateBladeChart(id);
  }, 100);
}

function changeResourceStatus(id, newStatus) {
  const res = resources.find(r => r.id === id);
  if (!res) return;
  
  const oldStatus = res.status;
  res.status = newStatus;
  
  // Handle logging
  addNotification(`State Change Request`, `Transitioned '${res.name}' state from ${oldStatus} to ${newStatus}.`, newStatus === 'Running' ? 'success' : 'warning');
  
  renderResourcesTable();
  updateRecentResources();
  showToast('State Transition Triggered', `'${res.name}' status changed to ${newStatus}.`, newStatus === 'Running' ? 'success' : 'warning');
}

function triggerResourceCommand(command) {
  if (!selectedResourceId) return;
  
  const res = resources.find(r => r.id === selectedResourceId);
  if (!res) return;
  
  if (command === 'delete') {
    if (confirm(`Are you absolutely sure you want to permanently delete resource '${res.name}'?`)) {
      const idx = resources.findIndex(r => r.id === selectedResourceId);
      resources.splice(idx, 1);
      
      addNotification(`Resource Terminated`, `Resource '${res.name}' has been permanently deleted from resource group '${res.group}'.`, 'danger');
      showToast('Resource Terminated', `'${res.name}' deleted.`, 'danger');
      
      // Update UI tables and close
      renderResourcesTable();
      updateRecentResources();
      closeBlade('detailsResourceBlade');
      
      selectedResourceId = null;
    }
    return;
  }
  
  let newStatus = '';
  if (command === 'start') newStatus = 'Running';
  if (command === 'stop') newStatus = 'Stopped';
  if (command === 'restart') newStatus = 'Running'; // triggers bounce
  
  res.status = newStatus;
  
  // Toast, log, and redraw details
  addNotification(`Command Triggered`, `Executed instruction '${command}' for '${res.name}'.`, 'info');
  showToast('Operational Command Sent', `Sent command '${command}' successfully.`, 'info');
  
  renderResourcesTable();
  updateRecentResources();
  openDetailsBlade(res.id); // reload values
}

// --- SEARCH & FILTER LOGIC ---
function setupEventListeners() {
  // Sidebar Toggle Hamburger Click
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    const container = document.getElementById('appShell');
    container.classList.toggle('collapsed-nav');
    sidebarCollapsed = !sidebarCollapsed;
  });
  
  // Hotkey hook for search trigger (Pressing '/' opens search)
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== document.getElementById('globalSearchInput')) {
      e.preventDefault();
      document.getElementById('globalSearchInput').focus();
    }
    
    // Esc closes all blades
    if (e.key === 'Escape') {
      closeAllBlades();
      closeModalDialog();
    }
  });
  
  // Notifications Bell Click Toggle Drawer
  document.getElementById('notificationsBtn').addEventListener('click', () => {
    openBlade('notificationsBlade');
    renderNotificationsDrawer();
    // Wipe badge on read
    document.getElementById('notifBadge').style.display = 'none';
  });
  
  // Portal Settings Click Toggle Drawer
  document.getElementById('settingsBtn').addEventListener('click', () => {
    openBlade('settingsBlade');
  });
  
  // Click listener for search input autocomplete display
  const searchInput = document.getElementById('globalSearchInput');
  const dropdown = document.getElementById('searchDropdown');
  
  searchInput.addEventListener('focus', () => {
    updateRecentSearchPanel();
    dropdown.classList.add('active');
  });
  
  // Close search dropdown on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.header-search-container')) {
      dropdown.classList.remove('active');
    }
  });
  
  // Real-time Autocomplete Filter as user types
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterSearchDropdown(query);
  });
  
  // Resource List Live Filter Box
  document.getElementById('resourceFilterInput').addEventListener('input', filterResourcesTable);
  document.getElementById('resourceTypeFilter').addEventListener('change', filterResourcesTable);
}

function updateRecentSearchPanel() {
  const container = document.getElementById('searchRecentContainer');
  container.innerHTML = '';
  
  if (resources.length === 0) {
    container.innerHTML = `<div style="padding:10px 16px; font-size:11px; color:var(--text-muted);">No active resources.</div>`;
    return;
  }
  
  resources.slice(-3).forEach(res => {
    const icon = getServiceEmoji(res.type);
    const item = document.createElement('div');
    item.className = 'search-item';
    item.onclick = () => {
      openDetailsBlade(res.id);
      document.getElementById('searchDropdown').classList.remove('active');
    };
    item.innerHTML = `
      <div class="search-item-icon">${icon}</div>
      <div class="search-item-info">
        <span class="search-item-name">${res.name}</span>
        <span class="search-item-desc">${res.type} • ${res.group}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function filterSearchDropdown(query) {
  const items = document.querySelectorAll('#searchDropdown .search-item');
  let matchCount = 0;
  
  items.forEach(item => {
    const name = item.querySelector('.search-item-name').textContent.toLowerCase();
    const desc = item.querySelector('.search-item-desc').textContent.toLowerCase();
    
    if (name.includes(query) || desc.includes(query)) {
      item.style.display = 'flex';
      matchCount++;
    } else {
      item.style.display = 'none';
    }
  });
}

function handleSearchSelect(shorthand) {
  document.getElementById('searchDropdown').classList.remove('active');
  document.getElementById('globalSearchInput').value = '';
  
  if (shorthand === 'vm') switchView('resources', 'Virtual Machine');
  if (shorthand === 'app') switchView('resources', 'App Service');
  if (shorthand === 'db') switchView('resources', 'SQL Database');
}

function filterResourcesTable() {
  const textQuery = document.getElementById('resourceFilterInput').value.toLowerCase();
  const typeFilter = document.getElementById('resourceTypeFilter').value;
  
  const filtered = resources.filter(res => {
    const matchesText = res.name.toLowerCase().includes(textQuery) || res.group.toLowerCase().includes(textQuery);
    const matchesType = typeFilter === 'All' || res.type === typeFilter;
    return matchesText && matchesType;
  });
  
  renderResourcesTable(filtered);
}

// --- OPERATIONAL BILLING SUM ESTIMATOR ---
function updateEstimatedCosts(addValue) {
  const billLabel = document.getElementById('billingValue');
  const progressBar = document.getElementById('costProgressBar');
  
  let currentVal = parseFloat(billLabel.textContent.replace('$', ''));
  let newVal = currentVal + addValue;
  
  billLabel.textContent = `$${newVal.toFixed(2)}`;
  
  // Percent bar updates based on $500 threshold
  let percent = (newVal / 500.00) * 100;
  if (percent > 100) percent = 100;
  progressBar.style.width = `${percent}%`;
}

// --- NOTIFICATION UTILITY CONTROLLERS ---
function addNotification(title, desc, type = 'info') {
  notifications.unshift({
    id: Date.now(),
    title,
    desc,
    time: 'Just now',
    type
  });
  
  updateNotificationsBadge();
}

function updateNotificationsBadge() {
  const badge = document.getElementById('notifBadge');
  const count = notifications.length;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function renderNotificationsDrawer() {
  const list = document.getElementById('notificationsContentList');
  list.innerHTML = '';
  
  if (notifications.length === 0) {
    list.innerHTML = `
      <div style="padding:40px; text-align:center; color:var(--text-muted);">
        <span>📭</span>
        <p style="margin-top:8px; font-size:12px;">No notification events registered yet.</p>
      </div>`;
    return;
  }
  
  notifications.forEach(n => {
    const item = document.createElement('div');
    item.className = 'notification-item';
    
    let borderCol = 'var(--primary-color)';
    if (n.type === 'success') borderCol = 'var(--color-success)';
    if (n.type === 'warning') borderCol = 'var(--color-warning)';
    if (n.type === 'danger') borderCol = 'var(--color-danger)';
    
    item.style.borderLeft = `3px solid ${borderCol}`;
    
    item.innerHTML = `
      <div class="notification-item-header">
        <span class="notification-item-title">${n.title}</span>
        <span class="notification-item-time">${n.time}</span>
      </div>
      <span class="notification-item-desc">${n.desc}</span>
    `;
    list.appendChild(item);
  });
}

function clearAllNotifications() {
  notifications = [];
  renderNotificationsDrawer();
  updateNotificationsBadge();
  showToast('Notification logs purged', 'All history events have been cleared.', 'info');
}

// --- DIALOG MODALS FOR MOCK SYSTEMS ---
function openModalMessage(title, detail) {
  document.getElementById('modalTitle').innerHTML = `<span>📂</span> ${title}`;
  document.getElementById('modalBody').textContent = `Evaluating resource allocation policies for '${title}'... ${detail}`;
  document.getElementById('modalDialogShell').style.display = 'flex';
}

function closeModalDialog() {
  document.getElementById('modalDialogShell').style.display = 'none';
}

// --- TOAST DISPATCH SYSTEM ---
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let emoji = 'ℹ️';
  if (type === 'success') emoji = '🟢';
  if (type === 'warning') emoji = '⚠️';
  if (type === 'danger') emoji = '🔴';
  
  toast.innerHTML = `
    <div style="font-size: 14px;">${emoji}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  container.appendChild(toast);
  
  // Auto destroy after 5 seconds
  setTimeout(() => {
    toast.style.animation = 'slide-in-toast 0.25s reverse ease-in forwards';
    setTimeout(() => toast.remove(), 260);
  }, 5000);
}

// --- REFRESH DASHBOARD BTN ---
function refreshDashboard() {
  showToast('Dashboard Data Refreshed', 'Successfully fetched latest performance telemetry logs.', 'success');
  updateRecentResources();
  renderResourcesTable();
  
  // Bump estimated cost randomly
  updateEstimatedCosts(Math.random() * 0.45);
}

// --- OPERATIONS METRIC SIMULATION (LIVE NUMBERS CHANGES) ---
function startMetricSimulation() {
  if (chartUpdateInterval) clearInterval(chartUpdateInterval);
  
  chartUpdateInterval = setInterval(() => {
    // Add real-time fluctuation points to charts
    if (cpuChart && cpuChart.data.datasets.length > 0) {
      // Calculate average CPU based on number of active Running VMs vs total
      const runningVms = resources.filter(r => r.type === 'Virtual Machine' && r.status === 'Running').length;
      const totalVms = resources.filter(r => r.type === 'Virtual Machine').length;
      
      let baseCpu = 20;
      if (totalVms > 0) {
        baseCpu = (runningVms / totalVms) * 65;
      }
      
      // Add random wiggle
      const latestCpuVal = Math.max(5, Math.min(98, baseCpu + (Math.random() * 12 - 6)));
      
      cpuChart.data.labels.shift();
      cpuChart.data.labels.push(getTimestampString());
      cpuChart.data.datasets[0].data.shift();
      cpuChart.data.datasets[0].data.push(latestCpuVal);
      cpuChart.update('none'); // silent update
    }
    
    if (networkChart && networkChart.data.datasets.length > 0) {
      const activeEndpoints = resources.filter(r => r.status === 'Running').length;
      const factor = activeEndpoints * 12.5;
      
      const newIngress = Math.max(1, factor + (Math.random() * 15 - 7));
      const newEgress = Math.max(1, (factor * 0.8) + (Math.random() * 10 - 5));
      
      networkChart.data.labels.shift();
      networkChart.data.labels.push(getTimestampString());
      networkChart.data.datasets[0].data.shift();
      networkChart.data.datasets[0].data.push(newIngress);
      networkChart.data.datasets[1].data.shift();
      networkChart.data.datasets[1].data.push(newEgress);
      networkChart.update('none');
    }
  }, 3000);
}

function getTimestampString() {
  const d = new Date();
  return d.toTimeString().split(' ')[0].substring(3); // returns "MM:SS"
}

// --- HIGH FIDELITY OPERATION CHARTS (CHART.JS CONFIGS) ---
function initDashboardCharts() {
  // Check if Chart.js loaded
  if (typeof Chart === 'undefined') return;
  
  // Setup colors matching the current theme variables
  const isDark = currentTheme !== 'light';
  const textColor = isDark ? '#f3f2f1' : '#323130';
  const gridColor = isDark ? '#292929' : '#edebe9';
  const primaryLineColor = '#0078d4';
  const secondaryLineColor = isDark ? '#2899f5' : '#20b2aa';
  
  // CPU utilization chart setup
  const cpuCtx = document.getElementById('cpuChart');
  if (cpuCtx) {
    const labels = Array.from({length: 10}, (_, i) => getTimestampString());
    const data = [32, 28, 35, 41, 38, 30, 26, 33, 44, 38];
    
    cpuChart = new Chart(cpuCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Overall CPU Usage (%)',
          data: data,
          borderColor: primaryLineColor,
          backgroundColor: 'rgba(0, 120, 212, 0.08)',
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 } }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 } }
          }
        }
      }
    });
  }
  
  // Network chart setup
  const netCtx = document.getElementById('networkChart');
  if (netCtx) {
    const labels = Array.from({length: 10}, (_, i) => getTimestampString());
    
    networkChart = new Chart(netCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Ingress Traffic (Mbps)',
            data: [42, 50, 48, 55, 62, 59, 72, 80, 85, 78],
            borderColor: primaryLineColor,
            backgroundColor: 'transparent',
            tension: 0.25,
            borderWidth: 2,
            pointRadius: 2
          },
          {
            label: 'Egress Traffic (Mbps)',
            data: [30, 32, 38, 41, 44, 40, 55, 62, 59, 64],
            borderColor: secondaryLineColor,
            backgroundColor: 'transparent',
            tension: 0.25,
            borderWidth: 2,
            pointRadius: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: textColor, boxWidth: 12, font: { size: 10 } }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 } }
          },
          y: {
            min: 0,
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 } }
          }
        }
      }
    });
  }
}

// --- UPDATE CHART INSIDE BLADE DETAILS ---
function updateBladeChart(resourceId) {
  const ctx = document.getElementById('bladeMetricChart');
  if (!ctx || typeof Chart === 'undefined') return;
  
  // Clean previous chart instance in details
  if (bladeChart) {
    bladeChart.destroy();
  }
  
  const res = resources.find(r => r.id === resourceId);
  const isDark = currentTheme !== 'light';
  const textColor = isDark ? '#f3f2f1' : '#323130';
  const gridColor = isDark ? '#292929' : '#edebe9';
  
  // Establish variable metrics based on service type
  let label = 'Metrics (Active)';
  let dataSet = [10, 20, 15, 30, 25, 40, 35];
  let lineColor = '#0078d4';
  
  if (res) {
    if (res.status === 'Stopped') {
      dataSet = [0, 0, 0, 0, 0, 0, 0];
    } else if (res.type === 'Virtual Machine') {
      label = 'CPU Operations (%)';
      dataSet = Array.from({length: 7}, () => Math.floor(Math.random() * 40) + 15);
      lineColor = '#0078d4';
    } else if (res.type === 'App Service') {
      label = 'HTTP Requests / Sec';
      dataSet = Array.from({length: 7}, () => Math.floor(Math.random() * 200) + 50);
      lineColor = '#20b2aa';
    } else if (res.type === 'SQL Database') {
      label = 'DTU Usage Indicator (%)';
      dataSet = Array.from({length: 7}, () => Math.floor(Math.random() * 30) + 5);
      lineColor = '#e81123';
    } else {
      label = 'Storage IOPS Rate';
      dataSet = Array.from({length: 7}, () => Math.floor(Math.random() * 80) + 10);
      lineColor = '#ff8c00';
    }
  }
  
  const timeLabels = ['-60m', '-50m', '-40m', '-30m', '-20m', '-10m', 'Now'];
  
  bladeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: timeLabels,
      datasets: [{
        label: label,
        data: dataSet,
        borderColor: lineColor,
        backgroundColor: `${lineColor}10`,
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 9 } }
        },
        y: {
          min: 0,
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 9 } }
        }
      }
    }
  });
}

// --- UTILITY CLEANUP AND RESIZING ---
function destroyCharts() {
  if (cpuChart) cpuChart.destroy();
  if (networkChart) networkChart.destroy();
}

function resizeCharts() {
  if (cpuChart) cpuChart.resize();
  if (networkChart) networkChart.resize();
}
