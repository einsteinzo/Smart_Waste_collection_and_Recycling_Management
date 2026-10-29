/**
 * WasteWise Portal - Recycling Center Dashboard Logic
 * Handles incoming deliveries, weight verification, material intake, processing outcomes, and facility history
 */

let activeDeliveries = [];
let currentVerifyingDeliveryId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Immediately register submit listeners so native reloads are prevented
  setupCenterListeners();

  // 2. Auth guard
  const user = await requireAuth(['center']);
  if (!user) return;

  // 3. Load initial dashboard data safely
  await Promise.allSettled([
    loadCenterDashboard(),
    loadDeliveries(),
    loadIntakeRecords(),
  ]);
});

// Load facility metrics
async function loadCenterDashboard() {
  try {
    const res = await apiRequest('/api/dashboard/stats');
    if (res.ok && res.data.success) {
      const m = res.data.metrics || {};
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setTxt('statIncomingDeliveries', m.incoming || 0);
      setTxt('statCompletedDeliveries', m.completed || 0);
      setTxt('statTotalReceivedKg', (m.totalReceivedKg || 0) + ' kg');
      setTxt('statTotalRejectedKg', (m.totalRejectedKg || 0) + ' kg');
      setTxt('statTotalRecycledKg', (m.totalRecycledKg || 0) + ' kg');
      if (res.data.centerName) {
        setTxt('facilityTitle', res.data.centerName);
      }
    }
  } catch (err) {
    console.error('Error loading center stats:', err);
  }
}

// Load deliveries sent to this center
async function loadDeliveries() {
  const statusFilter = document.getElementById('deliveryStatusFilter')?.value || 'All';
  const url = `/api/center/deliveries?status=${encodeURIComponent(statusFilter)}`;

  const res = await apiRequest(url);
  const container = document.getElementById('deliveriesTableBody');
  const emptyState = document.getElementById('deliveriesEmptyState');

  if (!container) return;

  if (res.ok && res.data.success) {
    activeDeliveries = res.data.deliveries || [];

    if (activeDeliveries.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('d-none');
      return;
    }

    if (emptyState) emptyState.classList.add('d-none');

    container.innerHTML = activeDeliveries
      .map((d) => {
        const canVerify = d.status === 'Delivered';
        const collectedWt = d.collectionDetails?.collectedWeight ? `${d.collectionDetails.collectedWeight} kg` : `${d.estimatedQuantity} ${d.estimatedUnit}`;
        const deliveredTime = d.deliveryDetails?.deliveredAt ? formatDateTime(d.deliveryDetails.deliveredAt) : 'Pending Drop-off';

        let actionCell = '';
        if (canVerify) {
          actionCell = `
            <button class="btn btn-sm btn-success fw-bold" 
              data-action="verify" 
              data-id="${d._id}" 
              onclick="window.openVerificationModal && window.openVerificationModal('${d._id}')">
              <i class="bi bi-check2-circle me-1"></i> Verify & Process
            </button>
          `;
        } else if (d.status === 'Completed') {
          actionCell = `
            <span class="badge bg-light text-success border border-success p-2">
              <i class="bi bi-check-all me-1"></i> ${d.recyclingDetails?.processingOutcome || 'Completed'} (${d.recyclingDetails?.receivedWeight || 0} kg)
            </span>
          `;
        } else {
          actionCell = `
            <span class="badge bg-light text-muted border p-2">
              <i class="bi bi-truck me-1"></i> ${d.status}
            </span>
          `;
        }

        return `
        <tr data-delivery-id="${d._id}">
          <td class="fw-bold">#${d._id.slice(-6).toUpperCase()}</td>
          <td>${getCategoryBadge(d.wasteCategory)}</td>
          <td><span class="fw-bold">${collectedWt}</span></td>
          <td>
            <span class="fw-medium">${d.collector?.name || 'Collector'}</span><br>
            <small class="text-muted"><i class="bi bi-telephone me-1"></i>${d.collector?.phone || '—'}</small>
          </td>
          <td><small class="text-muted">${deliveredTime}</small></td>
          <td>${getStatusBadge(d.status)}</td>
          <td class="text-end">
            ${actionCell}
          </td>
        </tr>
      `;
      })
      .join('');
  } else {
    showToast(res.data?.message || 'Error loading deliveries', 'danger');
  }
}

// Open Verification Modal
function openVerificationModal(pickupId, category, collectedWeight) {
  currentVerifyingDeliveryId = pickupId;
  const delivery = activeDeliveries.find((d) => d._id === pickupId);
  const cat = category || delivery?.wasteCategory || 'Waste';
  const wt = (collectedWeight !== undefined && collectedWeight !== null && !isNaN(collectedWeight))
    ? collectedWeight
    : (delivery?.collectionDetails?.collectedWeight || delivery?.estimatedQuantity || 0);

  const idEl = document.getElementById('verifyPickupId');
  if (idEl) idEl.textContent = '#' + pickupId.slice(-6).toUpperCase();
  const catEl = document.getElementById('verifyCategory');
  if (catEl) catEl.textContent = cat;
  const wtEl = document.getElementById('verifyCollectorWeight');
  if (wtEl) wtEl.textContent = `${wt} kg`;

  const receivedInput = document.getElementById('receivedWeight');
  const rejectedInput = document.getElementById('rejectedWeight');
  const netDisplay = document.getElementById('netRecycledDisplay');
  const reasonInput = document.getElementById('rejectionReason');
  const notesInput = document.getElementById('processingNotes');

  if (receivedInput) receivedInput.value = wt;
  if (rejectedInput) rejectedInput.value = 0;
  if (netDisplay) netDisplay.textContent = `${wt} kg`;
  if (reasonInput) reasonInput.value = '';
  if (notesInput) notesInput.value = '';

  // Real-time calculation of net weight
  const updateNet = () => {
    const rec = parseFloat(receivedInput?.value) || 0;
    const rej = parseFloat(rejectedInput?.value) || 0;
    const net = Math.max(0, rec - rej);
    if (netDisplay) netDisplay.textContent = `${net.toFixed(1)} kg`;
  };

  if (receivedInput) receivedInput.oninput = updateNet;
  if (rejectedInput) rejectedInput.oninput = updateNet;

  const modalEl = document.getElementById('verifyReceiptModal');
  if (modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

// Load facility material intake history
async function loadIntakeRecords() {
  const res = await apiRequest('/api/center/records');
  const tbody = document.getElementById('recordsTableBody');
  if (!tbody) return;

  if (res.ok && res.data.success) {
    const records = res.data.records || [];
    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No processing records found yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = records
      .map((r) => {
        return `
        <tr>
          <td>${formatDate(r.createdAt)}</td>
          <td>${getCategoryBadge(r.materialCategories?.[0] || 'Mixed')}</td>
          <td><strong>${r.receivedWeight} kg</strong></td>
          <td class="text-danger">${r.rejectedWeight ? `${r.rejectedWeight} kg` : '0 kg'}</td>
          <td class="text-success fw-bold">${r.netRecycledWeight} kg</td>
          <td><span class="badge bg-primary">${r.processingOutcome}</span></td>
        </tr>
      `;
      })
      .join('');
  }
}

// Helper to clean modal backdrop
function cleanModalBackdrops() {
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}

// Setup Event Listeners
function setupCenterListeners() {
  // Delegated table button clicks for Verify & Process
  const tbody = document.getElementById('deliveriesTableBody');
  if (tbody && !tbody.dataset.delegatedClicks) {
    tbody.dataset.delegatedClicks = 'true';
    tbody.addEventListener('click', (e) => {
      const verifyBtn = e.target.closest('[data-action="verify"]');
      if (verifyBtn) {
        e.preventDefault();
        const id = verifyBtn.getAttribute('data-id');
        openVerificationModal(id);
      }
    });
  }

  const verifyForm = document.getElementById('verifyReceiptForm');
  if (verifyForm && !verifyForm.dataset.listenerAttached) {
    verifyForm.dataset.listenerAttached = 'true';
    verifyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentVerifyingDeliveryId) {
        showToast('No consignment selected for verification.', 'warning');
        return;
      }

      const receivedWeight = parseFloat(document.getElementById('receivedWeight')?.value);
      const rejectedWeight = parseFloat(document.getElementById('rejectedWeight')?.value) || 0;
      const rejectionReason = document.getElementById('rejectionReason')?.value || '';
      const processingOutcome = document.getElementById('processingOutcome')?.value || 'Recycled';
      const processingNotes = document.getElementById('processingNotes')?.value || '';

      if (isNaN(receivedWeight) || receivedWeight <= 0) {
        showToast('Please enter a valid received weight in kilograms.', 'danger');
        return;
      }

      if (rejectedWeight > receivedWeight) {
        showToast('Rejected weight cannot exceed total received weight.', 'danger');
        return;
      }

      const submitBtn = verifyForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Recording...';
      }

      try {
        const res = await apiRequest(`/api/center/deliveries/${currentVerifyingDeliveryId}/confirm`, 'POST', {
          receivedWeight,
          rejectedWeight,
          rejectionReason,
          processingOutcome,
          processingNotes,
        });

        if (res.ok && res.data.success) {
          const verifiedId = currentVerifyingDeliveryId;
          currentVerifyingDeliveryId = null;

          const modalEl = document.getElementById('verifyReceiptModal');
          if (modalEl) {
            bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          }
          cleanModalBackdrops();

          showToast('Delivery verified and certified processing record created!', 'success');

          await Promise.allSettled([
            loadCenterDashboard(),
            loadDeliveries(),
            loadIntakeRecords(),
          ]);

          const verifiedRow = document.querySelector(`tr[data-delivery-id="${verifiedId}"]`);
          if (verifiedRow) {
            verifiedRow.classList.add('table-success');
            setTimeout(() => verifiedRow.classList.remove('table-success'), 3500);
          }
        } else {
          showToast(res.data?.message || 'Verification failed. Please check entries.', 'danger');
        }
      } catch (err) {
        console.error('Error submitting verification:', err);
        showToast('Network error during receipt verification.', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="bi bi-shield-check me-1"></i> Authorize & Complete Record';
        }
      }
    });
  }
}

// Window exports for HTML event attributes & dynamic triggers
window.openVerificationModal = openVerificationModal;
window.loadDeliveries = loadDeliveries;
window.loadCenterDashboard = loadCenterDashboard;
window.loadIntakeRecords = loadIntakeRecords;

