/**
 * WasteWise Portal - Collector Dashboard Logic
 * Handles assigned pickup workflows: Assigned -> Collected -> Delivered, weight recording, and duty toggles
 */

let activeCollectorPickups = [];
let currentOperatingPickupId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Immediately register submit listeners so native form reloads are prevented
  setupCollectorListeners();

  // 2. Auth guard
  const user = await requireAuth(['collector']);
  if (!user) return;

  // 3. Set duty toggle state
  const dutyToggle = document.getElementById('dutyToggle');
  const dutyStatusText = document.getElementById('dutyStatusText');
  if (dutyToggle && user.collectorInfo) {
    dutyToggle.checked = Boolean(user.collectorInfo.isOnDuty);
    if (dutyStatusText) {
      dutyStatusText.textContent = dutyToggle.checked ? 'On Duty' : 'Off Duty';
    }
  }

  // 4. Load initial dashboard data safely
  await Promise.allSettled([
    loadCollectorDashboard(),
    loadAssignedPickups(),
  ]);
});

// Load collector metrics
async function loadCollectorDashboard() {
  try {
    const res = await apiRequest('/api/dashboard/stats');
    if (res.ok && res.data.success) {
      const m = res.data.metrics || {};
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setTxt('statAssignedJobs', m.assignedJobs || 0);
      setTxt('statCollectedJobs', m.collectedJobs || 0);
      setTxt('statDeliveredJobs', m.deliveredJobs || 0);
      setTxt('statCompletedJobs', m.completedJobs || 0);
      setTxt('statTotalWeightKg', (m.totalCollectedKg || 0) + ' kg');
    }
  } catch (err) {
    console.error('Error loading collector stats:', err);
  }
}

// Load pickups assigned to this collector
async function loadAssignedPickups() {
  const statusFilter = document.getElementById('collectorStatusFilter')?.value || 'All';
  const url = `/api/collector/pickups?status=${encodeURIComponent(statusFilter)}`;

  const res = await apiRequest(url);
  const container = document.getElementById('assignedPickupsList');
  const emptyState = document.getElementById('collectorEmptyState');

  if (!container) return;

  if (res.ok && res.data.success) {
    activeCollectorPickups = res.data.pickups || [];

    if (activeCollectorPickups.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('d-none');
      return;
    }

    if (emptyState) emptyState.classList.add('d-none');

    container.innerHTML = activeCollectorPickups
      .map((p) => {
        const addr = p.address ? `${p.address.street}, ${p.address.city} - ${p.address.postalCode}` : '—';
        const centerName = p.recyclingCenter?.name || 'Assigned Center Pending';
        const centerAddr = p.recyclingCenter?.address ? `${p.recyclingCenter.address.street}, ${p.recyclingCenter.address.city}` : '';

        // Determine action buttons based on status
        let actionHtml = '';
        if (p.status === 'Assigned') {
          actionHtml = `
            <button class="btn btn-primary btn-sm fw-medium" 
              data-action="collect" 
              data-id="${p._id}" 
              onclick="window.openCollectionModal && window.openCollectionModal('${p._id}')">
              <i class="bi bi-box-seam me-1"></i> Record Waste Collection
            </button>
          `;
        } else if (p.status === 'Collected') {
          actionHtml = `
            <button class="btn btn-warning btn-sm text-dark fw-bold" 
              data-action="deliver" 
              data-id="${p._id}" 
              onclick="window.openDeliveryModal && window.openDeliveryModal('${p._id}')">
              <i class="bi bi-truck me-1"></i> Record Facility Delivery
            </button>
          `;
        } else if (p.status === 'Delivered') {
          actionHtml = `
            <span class="badge bg-secondary p-2">
              <i class="bi bi-hourglass-split me-1"></i> Awaiting Facility Verification
            </span>
          `;
        } else if (p.status === 'Completed') {
          actionHtml = `
            <span class="badge bg-success p-2">
              <i class="bi bi-check2-circle me-1"></i> Completed & Processed
            </span>
          `;
        } else {
          actionHtml = `<span class="badge bg-light text-muted border p-2">${p.status}</span>`;
        }

        return `
        <div class="col-12 col-xl-6 mb-3" data-collector-pickup="${p._id}">
          <div class="card h-100 shadow-sm border-0 border-start border-4 border-success">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <h6 class="fw-bold mb-0 text-dark">Consignment #${p._id.slice(-6).toUpperCase()}</h6>
                  <small class="text-muted"><i class="bi bi-calendar-event me-1"></i>Schedule: ${formatDate(p.preferredDate)} (${p.preferredTimeSlot})</small>
                </div>
                ${getStatusBadge(p.status)}
              </div>

              <div class="my-3 p-2 rounded bg-light">
                <div class="d-flex justify-content-between mb-1">
                  <span class="text-muted">Material:</span>
                  ${getCategoryBadge(p.wasteCategory)}
                </div>
                <div class="d-flex justify-content-between mb-1">
                  <span class="text-muted">Estimated Load:</span>
                  <span class="fw-bold">${p.estimatedQuantity} ${p.estimatedUnit}</span>
                </div>
                ${
                  p.collectionDetails?.collectedWeight
                    ? `<div class="d-flex justify-content-between mb-1 text-success">
                        <span>Actual Collected Weight:</span>
                        <span class="fw-bold">${p.collectionDetails.collectedWeight} kg</span>
                       </div>`
                    : ''
                }
              </div>

              <div class="row g-2 mb-3">
                <div class="col-12 col-md-6">
                  <div class="p-2 border rounded h-100 bg-white">
                    <small class="text-muted fw-bold d-block"><i class="bi bi-person me-1"></i>Citizen / Pickup Point:</small>
                    <span class="fw-semibold text-dark">${p.citizen?.name || 'Citizen'}</span><br>
                    <small><i class="bi bi-telephone me-1"></i><a href="tel:${p.citizen?.phone}" class="text-decoration-none">${p.citizen?.phone || '—'}</a></small><br>
                    <small class="text-muted"><i class="bi bi-geo-alt me-1"></i>${addr}</small>
                  </div>
                </div>
                <div class="col-12 col-md-6">
                  <div class="p-2 border rounded h-100 bg-white">
                    <small class="text-muted fw-bold d-block"><i class="bi bi-building me-1"></i>Destination Facility:</small>
                    <span class="fw-semibold text-dark">${centerName}</span><br>
                    <small class="text-muted">${centerAddr}</small>
                  </div>
                </div>
              </div>

              ${p.description ? `<p class="small text-muted mb-3"><strong>Notes:</strong> ${p.description}</p>` : ''}

              <div class="d-flex justify-content-end align-items-center gap-2 pt-2 border-top">
                ${actionHtml}
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  } else {
    showToast(res.data?.message || 'Error loading pickups', 'danger');
  }
}

// Open Collection Modal
function openCollectionModal(id, category, estimatedQty) {
  currentOperatingPickupId = id;
  const pickup = activeCollectorPickups.find((p) => p._id === id);
  const cat = category || pickup?.wasteCategory || 'Waste';
  const est = (estimatedQty !== undefined && estimatedQty !== null && !isNaN(estimatedQty))
    ? estimatedQty
    : (pickup?.estimatedQuantity || 0);

  const idEl = document.getElementById('modalCollectId');
  if (idEl) idEl.textContent = '#' + id.slice(-6).toUpperCase();
  const catEl = document.getElementById('modalCollectCategory');
  if (catEl) catEl.textContent = cat;
  const estEl = document.getElementById('modalCollectEstimated');
  if (estEl) estEl.textContent = `${est} kg`;
  const wtInput = document.getElementById('collectedWeight');
  if (wtInput) wtInput.value = est;
  const notesInput = document.getElementById('collectionNotes');
  if (notesInput) notesInput.value = '';

  const modalEl = document.getElementById('recordCollectionModal');
  if (modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

// Open Delivery Modal
function openDeliveryModal(id, centerName) {
  currentOperatingPickupId = id;
  const pickup = activeCollectorPickups.find((p) => p._id === id);
  const facility = centerName || pickup?.recyclingCenter?.name || 'Assigned Center Pending';

  const idEl = document.getElementById('modalDeliverId');
  if (idEl) idEl.textContent = '#' + id.slice(-6).toUpperCase();
  const centerEl = document.getElementById('modalDeliverCenter');
  if (centerEl) centerEl.textContent = facility;
  const notesInput = document.getElementById('deliveryNotes');
  if (notesInput) notesInput.value = 'Delivered to facility intake reception.';

  const modalEl = document.getElementById('recordDeliveryModal');
  if (modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

// Helper to clean modal backdrop
function cleanModalBackdrops() {
  document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('padding-right');
}

// Setup Collector Event Listeners
function setupCollectorListeners() {
  // Delegated table button clicks for collection and delivery
  const container = document.getElementById('assignedPickupsList');
  if (container && !container.dataset.delegatedClicks) {
    container.dataset.delegatedClicks = 'true';
    container.addEventListener('click', (e) => {
      const collectBtn = e.target.closest('[data-action="collect"]');
      if (collectBtn) {
        e.preventDefault();
        const id = collectBtn.getAttribute('data-id');
        openCollectionModal(id);
        return;
      }
      const deliverBtn = e.target.closest('[data-action="deliver"]');
      if (deliverBtn) {
        e.preventDefault();
        const id = deliverBtn.getAttribute('data-id');
        openDeliveryModal(id);
        return;
      }
    });
  }

  // 1. Submit Collection
  const collectionForm = document.getElementById('collectionForm');
  if (collectionForm && !collectionForm.dataset.listenerAttached) {
    collectionForm.dataset.listenerAttached = 'true';
    collectionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentOperatingPickupId) {
        showToast('No pickup selected for collection.', 'warning');
        return;
      }

      const weight = parseFloat(document.getElementById('collectedWeight')?.value);
      const notes = document.getElementById('collectionNotes')?.value || '';

      if (isNaN(weight) || weight <= 0) {
        showToast('Please enter a valid weight in kilograms', 'danger');
        return;
      }

      const submitBtn = collectionForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Recording...';
      }

      try {
        const res = await apiRequest(`/api/collector/pickups/${currentOperatingPickupId}/collect`, 'POST', {
          collectedWeight: weight,
          collectionNotes: notes,
        });

        if (res.ok && res.data.success) {
          showToast('Collection recorded successfully! Proceeding to facility drop-off.', 'success');
          const modalEl = document.getElementById('recordCollectionModal');
          if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          cleanModalBackdrops();
          currentOperatingPickupId = null;

          await Promise.allSettled([
            loadCollectorDashboard(),
            loadAssignedPickups(),
          ]);
        } else {
          showToast(res.data?.message || 'Failed to record collection', 'danger');
        }
      } catch (err) {
        console.error('Error submitting collection:', err);
        showToast('Network error while recording collection.', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Confirm Collection';
        }
      }
    });
  }

  // 2. Submit Delivery
  const deliveryForm = document.getElementById('deliveryForm');
  if (deliveryForm && !deliveryForm.dataset.listenerAttached) {
    deliveryForm.dataset.listenerAttached = 'true';
    deliveryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentOperatingPickupId) {
        showToast('No pickup selected for delivery drop-off.', 'warning');
        return;
      }

      const notes = document.getElementById('deliveryNotes')?.value || '';
      const submitBtn = deliveryForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Recording...';
      }

      try {
        const res = await apiRequest(`/api/collector/pickups/${currentOperatingPickupId}/deliver`, 'POST', {
          deliveryNotes: notes,
        });

        if (res.ok && res.data.success) {
          showToast('Delivery recorded! Facility notified for certified intake verification.', 'success');
          const modalEl = document.getElementById('recordDeliveryModal');
          if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          cleanModalBackdrops();
          currentOperatingPickupId = null;

          await Promise.allSettled([
            loadCollectorDashboard(),
            loadAssignedPickups(),
          ]);
        } else {
          showToast(res.data?.message || 'Failed to record delivery', 'danger');
        }
      } catch (err) {
        console.error('Error submitting delivery:', err);
        showToast('Network error while recording delivery.', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i> Confirm Delivery';
        }
      }
    });
  }

  // 3. Toggle Duty Status
  const dutyToggle = document.getElementById('dutyToggle');
  if (dutyToggle && !dutyToggle.dataset.listenerAttached) {
    dutyToggle.dataset.listenerAttached = 'true';
    dutyToggle.addEventListener('change', async () => {
      const isOnDuty = dutyToggle.checked;
      const statusText = document.getElementById('dutyStatusText');
      if (statusText) statusText.textContent = isOnDuty ? 'On Duty' : 'Off Duty';

      try {
        const res = await apiRequest('/api/collector/status', 'PUT', { isOnDuty });
        if (res.ok && res.data.success) {
          showToast(`Status updated to ${isOnDuty ? 'On Duty' : 'Off Duty'}`, 'info');
        } else {
          showToast('Failed to update duty status', 'danger');
          dutyToggle.checked = !isOnDuty;
          if (statusText) statusText.textContent = !isOnDuty ? 'On Duty' : 'Off Duty';
        }
      } catch (err) {
        dutyToggle.checked = !isOnDuty;
        if (statusText) statusText.textContent = !isOnDuty ? 'On Duty' : 'Off Duty';
      }
    });
  }
}

// Window exports for HTML event attributes & dynamic triggers
window.openCollectionModal = openCollectionModal;
window.openDeliveryModal = openDeliveryModal;
window.loadAssignedPickups = loadAssignedPickups;
window.loadCollectorDashboard = loadCollectorDashboard;

