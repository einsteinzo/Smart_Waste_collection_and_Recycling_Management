/**
 * WasteWise Portal - Administrator Dashboard Logic
 * Handles interactive analytics charts, collector assignment, user management, facilities, and audit logs
 */

let statusChartInstance = null;
let categoryChartInstance = null;
let currentAssigningPickupId = null;
let cachedCollectors = null;
let cachedCenters = null;
let activeAdminPickups = [];

// Cache-aware fetchers for instant modal population
async function getAvailableCollectors(forceRefresh = false) {
  if (cachedCollectors && !forceRefresh) return cachedCollectors;
  try {
    const res = await apiRequest('/api/admin/collectors');
    if (res.ok && res.data?.collectors) {
      cachedCollectors = res.data.collectors;
      return cachedCollectors;
    }
  } catch (err) {
    console.error('Error fetching collectors:', err);
  }
  return cachedCollectors || [];
}

async function getAvailableCenters(forceRefresh = false) {
  if (cachedCenters && !forceRefresh) return cachedCenters;
  try {
    const res = await apiRequest('/api/admin/centers');
    if (res.ok && res.data?.centers) {
      cachedCenters = res.data.centers;
      return cachedCenters;
    }
  } catch (err) {
    console.error('Error fetching recycling centers:', err);
  }
  return cachedCenters || [];
}

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Immediately register all form submit and click listeners so native reloads are prevented
  setupAdminListeners();

  // 2. Enforce admin authentication
  const user = await requireAuth(['admin']);
  if (!user) return;

  // 3. Handle URL hash navigation e.g. #pickups
  if (window.location.hash) {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'pickups' || hash === 'tabAdminPickups') {
      switchAdminTab('tabAdminPickups');
    } else if (hash === 'users' || hash === 'tabAdminUsers') {
      switchAdminTab('tabAdminUsers');
    } else if (hash === 'centers' || hash === 'tabAdminCenters') {
      switchAdminTab('tabAdminCenters');
    } else if (hash === 'logs' || hash === 'tabAdminLogs') {
      switchAdminTab('tabAdminLogs');
    }
  }

  // 4. Load initial dashboard data safely & pre-cache assignment dropdowns
  await Promise.allSettled([
    loadAdminStats(),
    loadAdminPickups(),
    loadAdminUsers(),
    loadAdminCenters(),
    loadAdminLogs(),
    getAvailableCollectors(true),
    getAvailableCenters(true),
  ]);
});

// Load admin metrics & initialize Chart.js
async function loadAdminStats() {
  try {
    const res = await apiRequest('/api/dashboard/stats');
    if (res.ok && res.data.success) {
      const m = res.data.metrics || {};
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setTxt('statTotalUsers', m.totalUsers || 0);
      setTxt('statTotalPickups', m.totalPickups || 0);
      setTxt('statPendingPickups', m.pendingPickups || 0);
      setTxt('statCompletedPickups', m.completedPickups || 0);
      setTxt('statTotalCollectedKg', (m.totalCollectedKg || 0) + ' kg');
      setTxt('statTotalRecycledKg', (m.totalRecycledKg || 0) + ' kg');

      if (typeof Chart !== 'undefined') {
        renderStatusChart(res.data.statusCounts || {});
        renderCategoryChart(res.data.categoryCounts || {});
      }
    }
  } catch (err) {
    console.error('Error loading admin stats:', err);
  }
}

// Chart 1: Status Distribution
function renderStatusChart(statusCounts) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('statusChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (statusChartInstance) {
    statusChartInstance.destroy();
  }

  const labels = ['Requested', 'Assigned', 'Collected', 'Delivered', 'Completed', 'Cancelled'];
  const data = labels.map((l) => statusCounts[l] || 0);

  statusChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: [
            '#f59e0b', // Requested (amber)
            '#0284c7', // Assigned (sky blue)
            '#8b5cf6', // Collected (purple)
            '#ea580c', // Delivered (orange)
            '#10b981', // Completed (green)
            '#ef4444', // Cancelled (red)
          ],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });
}

// Chart 2: Waste Category Breakdown
function renderCategoryChart(categoryCounts) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('categoryChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  const categories = [
    'Organic waste',
    'Plastic',
    'Paper and cardboard',
    'Glass',
    'Metal',
    'Electronic waste',
    'Mixed or other waste',
  ];
  const data = categories.map((c) => categoryCounts[c] || 0);

  categoryChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Organic', 'Plastic', 'Paper', 'Glass', 'Metal', 'E-Waste', 'Mixed'],
      datasets: [
        {
          label: 'Requests by Category',
          data,
          backgroundColor: '#2e7d32',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 },
        },
      },
      plugins: {
        legend: { display: false },
      },
    },
  });
}

// Load Pickups for Assignment & Management
async function loadAdminPickups() {
  const status = document.getElementById('adminPickupStatusFilter')?.value || 'All';
  const category = document.getElementById('adminPickupCategoryFilter')?.value || 'All';
  const search = document.getElementById('adminPickupSearch')?.value || '';

  const url = `/api/admin/pickups?status=${encodeURIComponent(status)}&category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}`;
  const res = await apiRequest(url);

  const tbody = document.getElementById('adminPickupsTableBody');
  if (!tbody) return;

  if (res.ok && res.data.success) {
    const pickups = res.data.pickups || [];
    activeAdminPickups = pickups;
    if (pickups.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No pickup requests found matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = pickups
      .map((p) => {
        const canAssign = p.status === 'Requested' || p.status === 'Assigned';
        const isAssigned = Boolean(p.collector && p.collector.name);
        const hasCenter = Boolean(p.recyclingCenter && p.recyclingCenter.name);

        return `
        <tr data-pickup-id="${p._id}" class="align-middle transition-all">
          <td class="fw-bold">#${p._id.slice(-6).toUpperCase()}</td>
          <td>
            <span class="fw-semibold text-dark">${p.citizen?.name || 'Citizen'}</span><br>
            <small class="text-muted"><i class="bi bi-geo-alt me-1"></i>${p.address?.city || ''}</small>
          </td>
          <td>${getCategoryBadge(p.wasteCategory)}</td>
          <td><span class="fw-bold">${p.estimatedQuantity}</span> <small class="text-muted">${p.estimatedUnit}</small></td>
          <td>${getStatusBadge(p.status)}</td>
          <td>
            <div class="small">
              <div>
                <span class="text-muted">Collector:</span> 
                ${
                  isAssigned
                    ? `<strong class="text-primary"><i class="bi bi-person-check-fill me-1"></i>${p.collector.name}</strong>`
                    : '<span class="badge bg-warning text-dark"><i class="bi bi-clock me-1"></i>Unassigned</span>'
                }
              </div>
              <div class="mt-1">
                <span class="text-muted">Facility:</span> 
                ${
                  hasCenter
                    ? `<strong class="text-success"><i class="bi bi-building-check me-1"></i>${p.recyclingCenter.name}</strong>`
                    : '<span class="badge bg-light text-muted border"><i class="bi bi-dash-circle me-1"></i>Unassigned</span>'
                }
              </div>
            </div>
          </td>
          <td class="text-end">
            ${
              canAssign
                ? `<button type="button" 
                    class="btn btn-sm ${p.status === 'Assigned' ? 'btn-outline-primary' : 'btn-primary'} fw-medium btn-assign-action"
                    data-action="assign"
                    data-pickup-id="${p._id}"
                    data-category="${encodeURIComponent(p.wasteCategory || '')}"
                    data-collector-id="${p.collector?._id || ''}"
                    data-center-id="${p.recyclingCenter?._id || ''}"
                    onclick="window.openAssignModal && window.openAssignModal('${p._id}', '${p.wasteCategory || ''}', '${p.collector?._id || ''}', '${p.recyclingCenter?._id || ''}')"
                    title="${p.status === 'Assigned' ? 'Reassign Collector / Facility' : 'Assign Collector & Facility'}">
                    <i class="bi ${p.status === 'Assigned' ? 'bi-arrow-repeat' : 'bi-person-plus'} me-1"></i> ${p.status === 'Assigned' ? 'Reassign' : 'Assign'}
                   </button>`
                : `<span class="badge bg-light text-muted border">Locked (${p.status})</span>`
            }
          </td>
        </tr>
      `;
      })
      .join('');
  }
}

// Open Assign Collector & Center Modal
async function openAssignModal(pickupId, category, currentCollectorId = '', currentCenterId = '') {
  currentAssigningPickupId = pickupId;
  const targetPickup = (activeAdminPickups || []).find((p) => p._id === pickupId);
  if (targetPickup) {
    category = category || targetPickup.wasteCategory || '';
    currentCollectorId = currentCollectorId || targetPickup.collector?._id || '';
    currentCenterId = currentCenterId || targetPickup.recyclingCenter?._id || '';
  }

  const idInput = document.getElementById('assignPickupIdInput');
  if (idInput) idInput.value = pickupId;

  const idDisplay = document.getElementById('assignPickupIdDisplay');
  if (idDisplay) idDisplay.textContent = '#' + pickupId.slice(-6).toUpperCase();
  const catDisplay = document.getElementById('assignCategoryDisplay');
  if (catDisplay) catDisplay.innerHTML = getCategoryBadge(category);

  const colSelect = document.getElementById('assignCollectorSelect');
  const cenSelect = document.getElementById('assignCenterSelect');

  // Immediately display the modal
  const modalEl = document.getElementById('assignModal');
  if (modalEl) {
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    } else {
      modalEl.classList.add('show');
      modalEl.style.display = 'block';
    }
  }

  if (colSelect && (!colSelect.options || colSelect.options.length <= 1)) {
    colSelect.innerHTML = '<option value="">Loading active collectors...</option>';
  }
  if (cenSelect && (!cenSelect.options || cenSelect.options.length <= 1)) {
    cenSelect.innerHTML = '<option value="">Loading facilities...</option>';
  }

  // Fetch or retrieve cached collectors and centers
  try {
    const [collectors, centers] = await Promise.all([
      getAvailableCollectors(),
      getAvailableCenters(),
    ]);

    if (colSelect) {
      if (collectors.length === 0) {
        colSelect.innerHTML = '<option value="">No active collectors available</option>';
      } else {
        colSelect.innerHTML = '<option value="">-- Choose an active collector --</option>' +
          collectors.map((c, idx) => {
            const isSelected = currentCollectorId ? (c._id === currentCollectorId) : (idx === 0);
            return `<option value="${c._id}" ${isSelected ? 'selected' : ''}>${c.name} (${c.collectorInfo?.vehicleType || 'Collector'} - ${c.phone})</option>`;
          }).join('');
      }
    }

    if (cenSelect) {
      if (centers.length === 0) {
        cenSelect.innerHTML = '<option value="">No active facilities available</option>';
      } else {
        let matchedIndex = -1;
        const optionsHtml = centers.map((c, idx) => {
          const accepts = c.acceptedCategories?.includes(category);
          if (accepts && matchedIndex === -1) matchedIndex = idx;
          const matchesLabel = accepts ? ' ✓ Accepts ' + category : '';
          const isSelected = currentCenterId ? (c._id === currentCenterId) : (matchedIndex === idx);
          return `<option value="${c._id}" ${isSelected ? 'selected' : ''}>${c.name} (${c.address?.city || 'Facility'} - Cap: ${c.dailyCapacityKg} kg/day)${matchesLabel}</option>`;
        }).join('');

        cenSelect.innerHTML = '<option value="">-- Choose an authorized recycling facility --</option>' + optionsHtml;

        // Auto-select preferred center if not already assigned
        if (!currentCenterId && matchedIndex >= 0 && centers[matchedIndex]) {
          cenSelect.value = centers[matchedIndex]._id;
        } else if (!currentCenterId && centers.length > 0) {
          cenSelect.value = centers[0]._id;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load collectors or facilities:', err);
    showToast('Failed to load collectors or facilities list.', 'danger');
  }
}

// Load Users
async function loadAdminUsers() {
  const role = document.getElementById('userRoleFilter')?.value || 'All';
  const status = document.getElementById('userStatusFilter')?.value || 'All';
  const search = document.getElementById('userSearchInput')?.value || '';

  const url = `/api/admin/users?role=${encodeURIComponent(role)}&status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`;
  const res = await apiRequest(url);

  const tbody = document.getElementById('adminUsersTableBody');
  if (!tbody) return;

  if (res.ok && res.data.success) {
    const users = res.data.users || [];
    tbody.innerHTML = users
      .map((u) => {
        const isSelf = currentUser && currentUser._id === u._id;
        const statusBadge =
          u.accountStatus === 'active'
            ? '<span class="badge bg-success">Active</span>'
            : u.accountStatus === 'pending_approval'
            ? '<span class="badge bg-warning text-dark">Pending</span>'
            : '<span class="badge bg-danger">Inactive</span>';

        return `
        <tr>
          <td>
            <strong>${u.name}</strong> ${isSelf ? '<span class="badge bg-info ms-1">You</span>' : ''}<br>
            <small class="text-muted">${u.email}</small>
          </td>
          <td><span class="badge bg-secondary text-uppercase">${u.role}</span></td>
          <td><small>${u.phone}</small></td>
          <td>${statusBadge}</td>
          <td>${formatDate(u.createdAt)}</td>
          <td class="text-end">
            ${
              !isSelf
                ? `<div class="btn-group btn-group-sm">
                    ${
                      u.accountStatus !== 'active'
                        ? `<button class="btn btn-outline-success" onclick="toggleUserStatus('${u._id}', 'active')">Activate</button>`
                        : `<button class="btn btn-outline-danger" onclick="toggleUserStatus('${u._id}', 'inactive')">Deactivate</button>`
                    }
                   </div>`
                : '<span class="text-muted small">Protected</span>'
            }
          </td>
        </tr>
      `;
      })
      .join('');
  }
}

// Toggle user status
async function toggleUserStatus(userId, newStatus) {
  const res = await apiRequest(`/api/admin/users/${userId}/status`, 'PATCH', { status: newStatus });
  if (res.ok && res.data.success) {
    showToast(`User status updated to ${newStatus}`, 'success');
    await loadAdminUsers();
    await loadAdminStats();
  } else {
    showToast(res.data.message || 'Failed to update user status', 'danger');
  }
}

// Load Recycling Centers
async function loadAdminCenters() {
  const res = await apiRequest('/api/admin/centers');
  const tbody = document.getElementById('adminCentersTableBody');
  if (!tbody) return;

  if (res.ok && res.data.success) {
    const centers = res.data.centers || [];
    tbody.innerHTML = centers
      .map((c) => {
        return `
        <tr>
          <td>
            <strong>${c.name}</strong><br>
            <small class="text-muted">${c.address?.street}, ${c.address?.city}</small>
          </td>
          <td><small>${c.contactEmail}<br>${c.contactPhone}</small></td>
          <td>${c.acceptedCategories.map((cat) => getCategoryBadge(cat)).join(' ')}</td>
          <td>${c.dailyCapacityKg} kg/day</td>
          <td>${c.isActive ? '<span class="badge bg-success">Active</span>' : '<span class="badge bg-danger">Inactive</span>'}</td>
        </tr>
      `;
      })
      .join('');
  }
}

// Load Audit / Activity Logs
async function loadAdminLogs() {
  const res = await apiRequest('/api/admin/activity-logs?limit=50');
  const tbody = document.getElementById('adminLogsTableBody');
  if (!tbody) return;

  if (res.ok && res.data.success) {
    const logs = res.data.logs || [];
    tbody.innerHTML = logs
      .map((l) => {
        return `
        <tr>
          <td><small class="text-muted">${formatDateTime(l.createdAt)}</small></td>
          <td><strong>${l.userName}</strong> <span class="badge bg-light text-dark">${l.userRole}</span></td>
          <td><span class="badge bg-secondary font-monospace">${l.action}</span></td>
          <td><small>${l.description}</small></td>
        </tr>
      `;
      })
      .join('');
  }
}

// Setup Event Listeners
function setupAdminListeners() {
  // Event Delegation for Table Action Buttons
  const pickupsTableBody = document.getElementById('adminPickupsTableBody');
  if (pickupsTableBody && !pickupsTableBody.dataset.listenerAttached) {
    pickupsTableBody.dataset.listenerAttached = 'true';
    pickupsTableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="assign"]');
      if (btn) {
        e.preventDefault();
        const pickupId = btn.getAttribute('data-pickup-id');
        let category = btn.getAttribute('data-category') || '';
        try { category = decodeURIComponent(category); } catch (_) {}
        const collectorId = btn.getAttribute('data-collector-id') || '';
        const centerId = btn.getAttribute('data-center-id') || '';
        openAssignModal(pickupId, category, collectorId, centerId);
      }
    });
  }

  // 1. Submit Assignment
  const assignForm = document.getElementById('assignForm');
  if (assignForm && !assignForm.dataset.listenerAttached) {
    assignForm.dataset.listenerAttached = 'true';
    assignForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetPickupId = currentAssigningPickupId || document.getElementById('assignPickupIdInput')?.value;
      if (!targetPickupId) {
        showToast('No pickup selected for assignment.', 'warning');
        return;
      }

      const collectorSelect = document.getElementById('assignCollectorSelect');
      const centerSelect = document.getElementById('assignCenterSelect');
      const collectorId = collectorSelect?.value;
      const recyclingCenterId = centerSelect?.value;

      if (!collectorId || !recyclingCenterId) {
        showToast('Please select both a collector and a destination recycling facility.', 'danger');
        return;
      }

      const collectorName = collectorSelect.options[collectorSelect.selectedIndex]?.text.split('(')[0].trim() || 'Collector';
      const centerName = centerSelect.options[centerSelect.selectedIndex]?.text.split('(')[0].trim() || 'Facility';

      const submitBtn = assignForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Assigning...';
      }

      try {
        const res = await apiRequest(`/api/admin/pickups/${targetPickupId}/assign`, 'POST', {
          collectorId,
          recyclingCenterId,
        });

        if (res.ok && res.data.success) {
          const assignedId = targetPickupId;
          currentAssigningPickupId = null;

          const modalEl = document.getElementById('assignModal');
          if (modalEl) {
            if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
              bootstrap.Modal.getOrCreateInstance(modalEl).hide();
            } else {
              modalEl.classList.remove('show');
              modalEl.style.display = 'none';
            }
          }

          // Clean up any remaining backdrop
          document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
          document.body.classList.remove('modal-open');
          document.body.style.removeProperty('overflow');
          document.body.style.removeProperty('padding-right');

          // Ensure the filter shows assigned pickups so it doesn't vanish from view
          const statusFilter = document.getElementById('adminPickupStatusFilter');
          if (statusFilter && statusFilter.value === 'Requested') {
            statusFilter.value = 'All';
          }

          showToast(`Assigned to ${collectorName} & routed to ${centerName}!`, 'success');

          // Refresh tables, cache and stats
          await Promise.allSettled([
            loadAdminStats(),
            loadAdminPickups(),
            loadAdminLogs(),
          ]);

          // Flash highlight the updated pickup row
          const assignedRow = document.querySelector(`tr[data-pickup-id="${assignedId}"]`);
          if (assignedRow) {
            assignedRow.classList.add('table-success');
            assignedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setTimeout(() => assignedRow.classList.remove('table-success'), 4000);
          }
        } else {
          showToast(res.data?.message || 'Assignment failed. Please try again.', 'danger');
        }
      } catch (err) {
        console.error('Error submitting assignment:', err);
        showToast('Network error while assigning pickup.', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Confirm Assignment';
        }
      }
    });
  }

  // 2. Create User Modal Form
  const createUserForm = document.getElementById('createUserForm');
  if (createUserForm && !createUserForm.dataset.listenerAttached) {
    createUserForm.dataset.listenerAttached = 'true';
    createUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('newUserName').value,
        email: document.getElementById('newUserEmail').value,
        phone: document.getElementById('newUserPhone').value,
        password: document.getElementById('newUserPassword').value,
        role: document.getElementById('newUserRole').value,
        vehicleType: document.getElementById('newUserVehicleType')?.value || '',
        vehicleNumber: document.getElementById('newUserVehicleNumber')?.value || '',
      };

      const submitBtn = createUserForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await apiRequest('/api/admin/users', 'POST', payload);
        if (res.ok && res.data.success) {
          showToast(`User account created successfully!`, 'success');
          createUserForm.reset();
          const modalEl = document.getElementById('createUserModal');
          if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          cleanModalBackdrops();
          await loadAdminUsers();
          await loadAdminStats();
        } else {
          showToast(res.data?.message || 'Failed to create user', 'danger');
        }
      } catch (err) {
        console.error('Error creating user:', err);
        showToast('Network error while creating user', 'danger');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // 3. Create Center Modal Form
  const createCenterForm = document.getElementById('createCenterForm');
  if (createCenterForm && !createCenterForm.dataset.listenerAttached) {
    createCenterForm.dataset.listenerAttached = 'true';
    createCenterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const selectedCats = Array.from(document.querySelectorAll('input[name="acceptedCats"]:checked')).map(
        (cb) => cb.value
      );

      if (selectedCats.length === 0) {
        showToast('Please select at least one accepted waste category.', 'danger');
        return;
      }

      const payload = {
        name: document.getElementById('centerName').value,
        street: document.getElementById('centerStreet').value,
        city: document.getElementById('centerCity').value,
        state: document.getElementById('centerState').value,
        postalCode: document.getElementById('centerPostalCode').value,
        contactPhone: document.getElementById('centerPhone').value,
        contactEmail: document.getElementById('centerEmail').value,
        dailyCapacityKg: parseFloat(document.getElementById('centerCapacity').value) || 5000,
        acceptedCategories: selectedCats,
      };

      const submitBtn = createCenterForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await apiRequest('/api/admin/centers', 'POST', payload);
        if (res.ok && res.data.success) {
          showToast('Recycling facility registered successfully!', 'success');
          createCenterForm.reset();
          const modalEl = document.getElementById('createCenterModal');
          if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          cleanModalBackdrops();
          await getAvailableCenters(true);
          await loadAdminCenters();
          await loadAdminStats();
        } else {
          showToast(res.data?.message || 'Failed to register facility', 'danger');
        }
      } catch (err) {
        console.error('Error creating facility:', err);
        showToast('Network error while registering facility', 'danger');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

// Clean modal backdrop utility
function cleanModalBackdrops() {
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}

// Programmatic modal openers
function openCreateUserModal() {
  const form = document.getElementById('createUserForm');
  if (form) form.reset();
  toggleCollectorFields('collector');
  const modalEl = document.getElementById('createUserModal');
  if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function openCreateCenterModal() {
  const form = document.getElementById('createCenterForm');
  if (form) form.reset();
  const modalEl = document.getElementById('createCenterModal');
  if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function toggleCollectorFields(role) {
  const el = document.getElementById('collectorFields');
  if (el) el.style.display = role === 'collector' ? 'block' : 'none';
}

// Tab Switching Utility
function switchAdminTab(targetTabId) {
  const triggerEl = document.querySelector(`[data-bs-target="#${targetTabId}"]`);
  if (triggerEl) {
    if (typeof bootstrap !== 'undefined' && bootstrap.Tab) {
      bootstrap.Tab.getOrCreateInstance(triggerEl).show();
    } else {
      triggerEl.click();
    }
  }
}

// Global window exposure for HTML onclick attributes & external scripts
window.openAssignModal = openAssignModal;
window.openCreateUserModal = openCreateUserModal;
window.openCreateCenterModal = openCreateCenterModal;
window.toggleCollectorFields = toggleCollectorFields;
window.loadAdminPickups = loadAdminPickups;
window.loadAdminStats = loadAdminStats;
window.loadAdminUsers = loadAdminUsers;
window.loadAdminCenters = loadAdminCenters;
window.loadAdminLogs = loadAdminLogs;
window.switchAdminTab = switchAdminTab;
window.getAvailableCollectors = getAvailableCollectors;
window.getAvailableCenters = getAvailableCenters;
window.toggleUserStatus = toggleUserStatus;


