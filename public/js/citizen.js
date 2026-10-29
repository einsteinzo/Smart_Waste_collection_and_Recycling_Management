/**
 * WasteWise Portal - Citizen Dashboard Logic
 * Handles pickup creation, status tracking with interactive 5-stage timeline, and profile management
 */

let activeCitizenPickups = [];
let cachedCitizenUser = null;
let pickupToCancelId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Immediately bind form listeners
  setupFormListeners();

  // 2. Auth guard
  const user = await requireAuth(['citizen']);
  if (!user) return;
  cachedCitizenUser = user;

  // 3. Pre-fill default addresses
  prefillCitizenData(user);

  // 4. Load initial metrics and requests safely
  await Promise.allSettled([
    loadCitizenDashboard(),
    loadPickupRequests(),
  ]);
});

// Pre-fill default addresses
function prefillCitizenData(user) {
  if (user && user.address) {
    const streetInput = document.getElementById('pickupStreet');
    const cityInput = document.getElementById('pickupCity');
    const stateInput = document.getElementById('pickupState');
    const zipInput = document.getElementById('pickupPostalCode');

    if (streetInput && user.address.street) streetInput.value = user.address.street;
    if (cityInput && user.address.city) cityInput.value = user.address.city;
    if (stateInput && user.address.state) stateInput.value = user.address.state;
    if (zipInput && user.address.postalCode) zipInput.value = user.address.postalCode;

    // Profile settings form
    const pName = document.getElementById('profileName');
    const pPhone = document.getElementById('profilePhone');
    const pStreet = document.getElementById('profileStreet');
    const pCity = document.getElementById('profileCity');
    const pState = document.getElementById('profileState');
    const pZip = document.getElementById('profilePostalCode');

    if (pName) pName.value = user.name || '';
    if (pPhone) pPhone.value = user.phone || '';
    if (pStreet) pStreet.value = user.address.street || '';
    if (pCity) pCity.value = user.address.city || '';
    if (pState) pState.value = user.address.state || 'Karnataka';
    if (pZip) pZip.value = user.address.postalCode || '';
  }

  // Set min date for pickup scheduling to today
  const dateInput = document.getElementById('preferredDate');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    if (!dateInput.value) dateInput.value = today;
  }
}

// Load citizen statistics
async function loadCitizenDashboard() {
  try {
    const res = await apiRequest('/api/dashboard/stats');
    if (res.ok && res.data.success) {
      const m = res.data.metrics || {};
      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setTxt('statTotalRequests', m.totalRequests || 0);
      setTxt('statPendingRequests', m.pending || 0);
      setTxt('statInTransit', m.inTransit || 0);
      setTxt('statCompleted', m.completed || 0);
      setTxt('statTotalRecycledKg', (m.totalRecycledKg || 0) + ' kg');
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

// Sync filters between Overview and My Pickups tab
function syncAndLoadRequests(val, type) {
  if (type === 'status') {
    const s1 = document.getElementById('filterStatus');
    const s2 = document.getElementById('tabFilterStatus');
    if (s1) s1.value = val;
    if (s2) s2.value = val;
  } else if (type === 'category') {
    const c1 = document.getElementById('filterCategory');
    const c2 = document.getElementById('tabFilterCategory');
    if (c1) c1.value = val;
    if (c2) c2.value = val;
  }
  loadPickupRequests();
}

// Load requests table
async function loadPickupRequests() {
  const statusFilter = document.getElementById('filterStatus')?.value || 'All';
  const categoryFilter = document.getElementById('filterCategory')?.value || 'All';

  let url = `/api/pickups?status=${encodeURIComponent(statusFilter)}&category=${encodeURIComponent(categoryFilter)}`;
  const res = await apiRequest(url);

  const tableBody = document.getElementById('requestsTableBody');
  const allTableBody = document.getElementById('allRequestsTableBody');
  const emptyState = document.getElementById('requestsEmptyState');
  const allEmptyState = document.getElementById('allRequestsEmptyState');

  if (res.ok && res.data.success) {
    activeCitizenPickups = res.data.pickups || [];

    if (activeCitizenPickups.length === 0) {
      if (tableBody) tableBody.innerHTML = '';
      if (allTableBody) allTableBody.innerHTML = '';
      if (emptyState) emptyState.classList.remove('d-none');
      if (allEmptyState) allEmptyState.classList.remove('d-none');
      return;
    }

    if (emptyState) emptyState.classList.add('d-none');
    if (allEmptyState) allEmptyState.classList.add('d-none');

    const rowsHtml = activeCitizenPickups
      .map((p) => {
        const canCancel = p.status === 'Requested' || p.status === 'Assigned';
        const isCompleted = p.status === 'Completed';

        return `
        <tr data-citizen-pickup="${p._id}">
          <td class="fw-bold">#${p._id.slice(-6).toUpperCase()}</td>
          <td>${getCategoryBadge(p.wasteCategory)}</td>
          <td>${p.estimatedQuantity} ${p.estimatedUnit}</td>
          <td>
            <small class="text-muted"><i class="bi bi-calendar3 me-1"></i>${formatDate(p.preferredDate)}</small><br>
            <small class="text-secondary">${p.preferredTimeSlot || 'Standard slot'}</small>
          </td>
          <td>${getStatusBadge(p.status)}</td>
          <td>
            ${
              p.collector?.name
                ? `<small><i class="bi bi-person-check text-success me-1"></i><strong>${p.collector.name}</strong> (${p.collector.phone})</small>`
                : '<small class="text-muted"><i class="bi bi-clock me-1"></i>Awaiting Dispatch</small>'
            }
          </td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary me-1" 
              data-action="track" 
              data-id="${p._id}" 
              onclick="window.viewPickupDetails && window.viewPickupDetails('${p._id}')" 
              title="View Progress">
              <i class="bi bi-eye"></i> Track
            </button>
            ${
              canCancel
                ? `<button class="btn btn-sm btn-outline-danger" 
                     data-action="cancel" 
                     data-id="${p._id}" 
                     onclick="window.promptCancelPickup && window.promptCancelPickup('${p._id}')" 
                     title="Cancel Request">
                     <i class="bi bi-x-circle"></i> Cancel
                   </button>`
                : isCompleted
                ? '<span class="badge bg-success-subtle text-success"><i class="bi bi-check2"></i> Recycled</span>'
                : '<span class="badge bg-light text-muted border">In Progress</span>'
            }
          </td>
        </tr>
      `;
      })
      .join('');

    if (tableBody) tableBody.innerHTML = rowsHtml;
    if (allTableBody) allTableBody.innerHTML = rowsHtml;
  } else {
    showToast(res.data?.message || 'Failed to load pickup requests', 'danger');
  }
}

// Open Schedule Pickup Modal
function openNewPickupModal() {
  const modalEl = document.getElementById('newPickupModal');
  if (modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

// View pickup details in tracking modal
function viewPickupDetails(id) {
  const pickup = activeCitizenPickups.find((p) => p._id === id);
  if (!pickup) return;

  const setModalTxt = (elemId, val) => {
    const el = document.getElementById(elemId);
    if (el) el.textContent = val;
  };

  setModalTxt('modalPickupId', '#' + pickup._id.slice(-6).toUpperCase());
  
  const modalWasteCat = document.getElementById('modalWasteCategory');
  if (modalWasteCat) modalWasteCat.innerHTML = getCategoryBadge(pickup.wasteCategory);

  setModalTxt('modalQuantity', `${pickup.estimatedQuantity} ${pickup.estimatedUnit}`);
  
  const modalStat = document.getElementById('modalStatus');
  if (modalStat) modalStat.innerHTML = getStatusBadge(pickup.status);

  setModalTxt('modalPreferredDate', `${formatDate(pickup.preferredDate)} (${pickup.preferredTimeSlot || 'Standard slot'})`);

  const addr = pickup.address ? `${pickup.address.street}, ${pickup.address.city} - ${pickup.address.postalCode}` : '—';
  setModalTxt('modalAddress', addr);

  setModalTxt('modalInstructions', pickup.additionalInstructions || pickup.description || 'No special instructions provided.');

  // Collector info
  const collectorEl = document.getElementById('modalCollectorInfo');
  if (collectorEl) {
    if (pickup.collector?.name) {
      collectorEl.innerHTML = `
        <strong>${pickup.collector.name}</strong><br>
        <small class="text-muted"><i class="bi bi-telephone me-1"></i>${pickup.collector.phone || 'Phone pending'}</small><br>
        <small class="text-muted"><i class="bi bi-truck me-1"></i>${pickup.collector.collectorInfo?.vehicleType || 'Collection vehicle'}</small>
      `;
    } else {
      collectorEl.innerHTML = '<span class="text-muted fst-italic">Field collector will be dispatched once scheduled.</span>';
    }
  }

  // Recycling Facility info
  const centerEl = document.getElementById('modalCenterInfo');
  if (centerEl) {
    if (pickup.recyclingCenter?.name) {
      centerEl.innerHTML = `
        <strong>${pickup.recyclingCenter.name}</strong><br>
        <small class="text-muted"><i class="bi bi-geo-alt me-1"></i>${pickup.recyclingCenter.address?.city || ''}</small>
      `;
    } else {
      centerEl.innerHTML = '<span class="text-muted fst-italic">Assigned recycling facility details will appear here.</span>';
    }
  }

  // Certified Outcome / Recovery Details
  const completionCard = document.getElementById('modalCompletionDetails');
  if (completionCard) {
    if (pickup.status === 'Completed' || pickup.recyclingDetails?.processingOutcome) {
      completionCard.classList.remove('d-none');
      const rec = pickup.recyclingDetails || {};
      const col = pickup.collectionDetails || {};
      setModalTxt('modalCollectedWeight', `${col.collectedWeight || pickup.estimatedQuantity || 0} kg`);
      setModalTxt('modalReceivedWeight', `${rec.receivedWeight || 0} kg`);
      setModalTxt('modalRejectedWeight', `${rec.rejectedWeight || 0} kg`);
      setModalTxt('modalOutcome', rec.processingOutcome || 'Recycled');
      setModalTxt('modalOutcomeNotes', rec.processingNotes || 'Material verified and processed.');
    } else if (pickup.status === 'Collected' || pickup.status === 'Delivered') {
      completionCard.classList.remove('d-none');
      const col = pickup.collectionDetails || {};
      setModalTxt('modalCollectedWeight', `${col.collectedWeight || pickup.estimatedQuantity || 0} kg`);
      setModalTxt('modalReceivedWeight', 'Pending facility scale');
      setModalTxt('modalRejectedWeight', '0 kg');
      setModalTxt('modalOutcome', pickup.status === 'Delivered' ? 'Delivered at facility' : 'En route to facility');
      setModalTxt('modalOutcomeNotes', pickup.deliveryDetails?.deliveryNotes || 'Consignment en route to recycling facility.');
    } else {
      completionCard.classList.add('d-none');
    }
  }

  // Update dynamic workflow timeline
  renderTrackingTimeline(pickup.status);

  const modalEl = document.getElementById('pickupDetailsModal');
  if (modalEl) {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

// Render dynamic tracking workflow
function renderTrackingTimeline(status) {
  const timelineEl = document.getElementById('modalTimeline') || document.getElementById('workflowTimeline');
  if (!timelineEl) return;

  const steps = ['Requested', 'Assigned', 'Collected', 'Delivered', 'Completed'];

  if (status === 'Cancelled') {
    timelineEl.innerHTML = `
      <div class="alert alert-danger w-100 text-center mb-0">
        <i class="bi bi-x-circle me-1"></i> This pickup request was cancelled.
      </div>
    `;
    return;
  }

  const currentIndex = steps.indexOf(status);

  timelineEl.innerHTML = steps
    .map((step, idx) => {
      let stateClass = '';
      let icon = idx + 1;
      if (idx < currentIndex) {
        stateClass = 'completed';
        icon = '<i class="bi bi-check-lg"></i>';
      } else if (idx === currentIndex) {
        stateClass = 'active';
      }

      return `
      <div class="workflow-step ${stateClass}">
        <div class="workflow-circle">${icon}</div>
        <div class="workflow-label">${step}</div>
      </div>
    `;
    })
    .join('');
}

// Prompt cancel modal
function promptCancelPickup(id) {
  pickupToCancelId = id;
  const reasonInput = document.getElementById('cancelReason');
  if (reasonInput) reasonInput.value = '';

  const modalEl = document.getElementById('cancelPickupModal');
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

// Setup form submit listeners
function setupFormListeners() {
  // Delegated table button clicks for Track and Cancel
  ['requestsTableBody', 'allRequestsTableBody'].forEach((tbodyId) => {
    const tbody = document.getElementById(tbodyId);
    if (tbody && !tbody.dataset.delegatedClicks) {
      tbody.dataset.delegatedClicks = 'true';
      tbody.addEventListener('click', (e) => {
        const trackBtn = e.target.closest('[data-action="track"]');
        if (trackBtn) {
          e.preventDefault();
          const id = trackBtn.getAttribute('data-id');
          viewPickupDetails(id);
          return;
        }
        const cancelBtn = e.target.closest('[data-action="cancel"]');
        if (cancelBtn) {
          e.preventDefault();
          const id = cancelBtn.getAttribute('data-id');
          promptCancelPickup(id);
          return;
        }
      });
    }
  });

  // 1. Submit New Pickup Request
  const createForm = document.getElementById('newPickupForm');
  if (createForm && !createForm.dataset.listenerAttached) {
    createForm.dataset.listenerAttached = 'true';
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const wasteCategory = document.getElementById('wasteCategory')?.value;
      const estimatedQuantityVal = document.getElementById('estimatedQuantity')?.value;
      const estimatedQuantity = parseFloat(estimatedQuantityVal);
      const estimatedUnit = document.getElementById('estimatedUnit')?.value || 'kg';
      const description = document.getElementById('pickupDescription')?.value.trim() || '';
      const street = document.getElementById('pickupStreet')?.value.trim();
      const city = document.getElementById('pickupCity')?.value.trim();
      const state = document.getElementById('pickupState')?.value.trim() || 'Karnataka';
      const postalCode = document.getElementById('pickupPostalCode')?.value.trim();
      const landmark = document.getElementById('pickupLandmark')?.value.trim() || '';
      const preferredDate = document.getElementById('preferredDate')?.value;
      const preferredTimeSlot = document.getElementById('preferredTimeSlot')?.value || 'Morning (8am - 12pm)';
      const additionalInstructions = document.getElementById('additionalInstructions')?.value.trim() || '';

      if (!wasteCategory) {
        showToast('Please select a waste category stream.', 'warning');
        return;
      }

      if (isNaN(estimatedQuantity) || estimatedQuantity <= 0) {
        showToast('Please enter a valid estimated quantity greater than 0.', 'warning');
        return;
      }

      if (!street || !city || !postalCode) {
        showToast('Please complete the pickup street, city, and postal code.', 'warning');
        return;
      }

      if (!preferredDate) {
        showToast('Please select a preferred pickup date.', 'warning');
        return;
      }

      const submitBtn = createForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Submitting...';
      }

      const payload = {
        wasteCategory,
        estimatedQuantity,
        estimatedUnit,
        description,
        street,
        city,
        state,
        postalCode,
        landmark,
        preferredDate,
        preferredTimeSlot,
        additionalInstructions,
      };

      try {
        const res = await apiRequest('/api/pickups', 'POST', payload);

        if (res.ok && res.data.success) {
          showToast('Pickup request created successfully! An administrator will assign a collector shortly.', 'success');
          createForm.reset();
          if (cachedCitizenUser) prefillCitizenData(cachedCitizenUser);

          const modalEl = document.getElementById('newPickupModal');
          if (modalEl) {
            bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          }
          cleanModalBackdrops();

          await Promise.allSettled([loadCitizenDashboard(), loadPickupRequests()]);
        } else {
          const errMsg =
            res.data?.message ||
            (res.data?.errors ? res.data.errors.map((err) => err.message).join(' | ') : null) ||
            'Failed to submit pickup request. Please check your entries.';
          showToast(errMsg, 'danger');
        }
      } catch (err) {
        console.error('Error submitting pickup request:', err);
        showToast('Network error while submitting request.', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="bi bi-send me-1"></i> Submit Request';
        }
      }
    });
  }

  // 2. Cancel Pickup Confirmation
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');
  if (confirmCancelBtn && !confirmCancelBtn.dataset.listenerAttached) {
    confirmCancelBtn.dataset.listenerAttached = 'true';
    confirmCancelBtn.addEventListener('click', async () => {
      if (!pickupToCancelId) return;
      const reason = document.getElementById('cancelReason')?.value.trim() || 'Citizen requested cancellation';

      confirmCancelBtn.disabled = true;
      confirmCancelBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Cancelling...';

      try {
        const res = await apiRequest(`/api/pickups/${pickupToCancelId}/cancel`, 'POST', { reason });

        if (res.ok && res.data.success) {
          showToast('Pickup request has been cancelled.', 'warning');
          const modalEl = document.getElementById('cancelPickupModal');
          if (modalEl) {
            bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          }
          cleanModalBackdrops();
          pickupToCancelId = null;
          await Promise.allSettled([loadCitizenDashboard(), loadPickupRequests()]);
        } else {
          showToast(res.data?.message || 'Failed to cancel request', 'danger');
        }
      } catch (err) {
        console.error('Error cancelling pickup:', err);
        showToast('Network error while cancelling request.', 'danger');
      } finally {
        confirmCancelBtn.disabled = false;
        confirmCancelBtn.innerHTML = 'Confirm Cancellation';
      }
    });
  }

  // 3. Profile Update Form
  const profileForm = document.getElementById('profileForm');
  if (profileForm && !profileForm.dataset.listenerAttached) {
    profileForm.dataset.listenerAttached = 'true';
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('profileName')?.value.trim(),
        phone: document.getElementById('profilePhone')?.value.trim(),
        street: document.getElementById('profileStreet')?.value.trim() || '',
        city: document.getElementById('profileCity')?.value.trim() || '',
        state: document.getElementById('profileState')?.value.trim() || 'Karnataka',
        postalCode: document.getElementById('profilePostalCode')?.value.trim() || '',
      };

      const submitBtn = profileForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
      }

      try {
        const res = await apiRequest('/api/users/profile', 'PUT', payload);
        if (res.ok && res.data.success) {
          showToast('Your address profile has been updated.', 'success');
          currentUser = res.data.user;
          cachedCitizenUser = res.data.user;
          prefillCitizenData(res.data.user);
        } else {
          showToast(res.data?.message || 'Failed to update profile.', 'danger');
        }
      } catch (err) {
        console.error('Error updating profile:', err);
        showToast('Network error while updating profile.', 'danger');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="bi bi-check2 me-1"></i> Save Changes';
        }
      }
    });
  }
}

// Window exports for HTML event attributes & dynamic triggers
window.viewPickupDetails = viewPickupDetails;
window.promptCancelPickup = promptCancelPickup;
window.openNewPickupModal = openNewPickupModal;
window.loadPickupRequests = loadPickupRequests;
window.loadCitizenDashboard = loadCitizenDashboard;

