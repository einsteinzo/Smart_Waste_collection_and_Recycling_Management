/**
 * WasteWise Portal - Frontend API Service & Utilities
 * Manages HTTP communication, CSRF tokens, dynamic status badges, and toast notifications
 */

let csrfTokenCache = null;

// Fetch anti-CSRF token from server
async function getCsrfToken(forceRefresh = false) {
  if (csrfTokenCache && !forceRefresh) return csrfTokenCache;
  try {
    const res = await fetch('/api/auth/csrf-token', { credentials: 'same-origin' });
    const data = await res.json();
    if (data.success && data.csrfToken) {
      csrfTokenCache = data.csrfToken;
      return csrfTokenCache;
    }
  } catch (err) {
    console.error('Failed to fetch CSRF token:', err);
  }
  return '';
}

// Invalidate cached token on session shifts
function resetApiSession() {
  csrfTokenCache = null;
}

// Unified API Request Wrapper
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = {};

  if (method !== 'GET' && method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    const token = await getCsrfToken();
    if (token) {
      headers['x-csrf-token'] = token;
    }
  }

  const options = {
    method,
    headers,
    credentials: 'same-origin',
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    let res = await fetch(endpoint, options);
    let data = await res.json().catch(() => ({
      success: false,
      message: 'Server returned a non-JSON response.',
    }));

    // Auto-heal on CSRF token mismatch: fetch a fresh token and retry once
    if (res.status === 403 && data?.message && data.message.includes('CSRF')) {
      console.warn('CSRF token mismatch detected. Refreshing token and retrying request...');
      csrfTokenCache = null;
      const freshToken = await getCsrfToken(true);
      if (freshToken) {
        options.headers['x-csrf-token'] = freshToken;
        res = await fetch(endpoint, options);
        data = await res.json().catch(() => ({
          success: false,
          message: 'Server returned a non-JSON response on retry.',
        }));
      }
    }

    if (
      res.status === 401 &&
      !endpoint.includes('/api/auth/login') &&
      !endpoint.includes('/api/auth/register') &&
      !endpoint.includes('/api/auth/me') &&
      !endpoint.includes('/api/auth/logout')
    ) {
      // Session expired: only redirect if user was actively on a protected dashboard page
      const isDashboard = window.location.pathname.includes('-dashboard');
      if (isDashboard && !window.location.pathname.includes('login.html')) {
        window.location.href = '/login.html?expired=1';
      }
    }

    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    console.error(`API Error on [${method}] ${endpoint}:`, error);
    return {
      ok: false,
      status: 0,
      data: {
        success: false,
        message: 'Network error or server unreachable. Please check your connection.',
      },
    };
  }
}

// Toast notification helper
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toastId = 'toast-' + Date.now();
  const bgClass =
    type === 'success'
      ? 'bg-success text-white'
      : type === 'danger'
      ? 'bg-danger text-white'
      : type === 'warning'
      ? 'bg-warning text-dark'
      : 'bg-primary text-white';

  const toastHtml = `
    <div id="${toastId}" class="toast align-items-center ${bgClass} border-0 shadow-lg mb-2" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body fw-medium py-2 px-3">
          ${message}
        </div>
        <button type="button" class="btn-close ${type !== 'warning' ? 'btn-close-white' : ''} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', toastHtml);
  const toastEl = document.getElementById(toastId);
  if (toastEl && typeof bootstrap !== 'undefined' && bootstrap.Toast) {
    const toast = new bootstrap.Toast(toastEl, { delay: duration });
    toast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  }
}

// Generate colored status badge HTML
function getStatusBadge(status) {
  const normalized = (status || 'Requested').toLowerCase();
  switch (normalized) {
    case 'requested':
      return `<span class="badge badge-status badge-status-requested"><i class="bi bi-clock me-1"></i>Requested</span>`;
    case 'assigned':
      return `<span class="badge badge-status badge-status-assigned"><i class="bi bi-person-check me-1"></i>Assigned</span>`;
    case 'collected':
      return `<span class="badge badge-status badge-status-collected"><i class="bi bi-truck me-1"></i>Collected</span>`;
    case 'delivered':
      return `<span class="badge badge-status badge-status-delivered"><i class="bi bi-building-check me-1"></i>Delivered</span>`;
    case 'completed':
      return `<span class="badge badge-status badge-status-completed"><i class="bi bi-check2-circle me-1"></i>Completed</span>`;
    case 'cancelled':
      return `<span class="badge badge-status badge-status-cancelled"><i class="bi bi-x-circle me-1"></i>Cancelled</span>`;
    default:
      return `<span class="badge bg-secondary">${status}</span>`;
  }
}

// Format date nicely
function formatDate(dateInput) {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format date with time
function formatDateTime(dateInput) {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Category Badge Helper
function getCategoryBadge(category) {
  const cat = (category || '').toLowerCase();
  let cls = 'cat-mixed';
  if (cat.includes('organic')) cls = 'cat-organic';
  else if (cat.includes('plastic')) cls = 'cat-plastic';
  else if (cat.includes('paper')) cls = 'cat-paper';
  else if (cat.includes('glass')) cls = 'cat-glass';
  else if (cat.includes('metal')) cls = 'cat-metal';
  else if (cat.includes('electronic') || cat.includes('e-waste')) cls = 'cat-ewaste';
  return `<span class="cat-pill ${cls}">${category}</span>`;
}
