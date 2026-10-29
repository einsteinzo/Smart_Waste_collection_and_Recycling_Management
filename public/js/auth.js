/**
 * WasteWise Portal - Authentication & Session Management
 * Handles login, registration, role-based protection, and header navigation state
 */

let currentUser = null;

// Get current session user
async function getCurrentUser() {
  if (currentUser) return currentUser;
  const res = await apiRequest('/api/auth/me');
  if (res.ok && res.data.success) {
    currentUser = res.data.user;
    return currentUser;
  }
  return null;
}

// Route Guard: Ensures user is logged in with an authorized role
async function requireAuth(allowedRoles = []) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // If user is logged in under a different role, route them to their own dashboard
    const ownDashboard = getDashboardUrl(user.role);
    showToast(`Redirecting to your ${user.role} workspace...`, 'info', 2000);
    setTimeout(() => {
      window.location.href = ownDashboard;
    }, 500);
    return null;
  }

  // Update header/sidebar with user profile
  updateUserInterface(user);
  return user;
}

// Update UI elements displaying user information
function updateUserInterface(user) {
  const nameEls = document.querySelectorAll('.user-display-name');
  nameEls.forEach((el) => (el.textContent = user.name));

  const emailEls = document.querySelectorAll('.user-display-email');
  emailEls.forEach((el) => (el.textContent = user.email));

  const roleEls = document.querySelectorAll('.user-display-role');
  roleEls.forEach((el) => {
    const roleCapitalized = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    el.textContent = roleCapitalized;
  });

  const authNav = document.getElementById('auth-nav-container');
  if (authNav) {
    const dashboardLink = getDashboardUrl(user.role);
    authNav.innerHTML = `
      <div class="d-flex align-items-center gap-2">
        <a href="${dashboardLink}" class="btn btn-outline-primary btn-sm">
          <i class="bi bi-speedometer2 me-1"></i> Dashboard
        </a>
        <button type="button" id="logoutBtn" onclick="handleLogout(event)" class="btn btn-sm btn-outline-danger logout-btn">
          <i class="bi bi-box-arrow-right me-1"></i> Logout
        </button>
      </div>
    `;
  }
}

// Resolve dashboard URL based on role
function getDashboardUrl(role) {
  switch (role) {
    case 'citizen':
      return '/citizen-dashboard.html';
    case 'collector':
      return '/collector-dashboard.html';
    case 'center':
      return '/center-dashboard.html';
    case 'admin':
      return '/admin-dashboard.html';
    default:
      return '/index.html';
  }
}

let isLoggingOut = false;

// Log out handler with immediate visual feedback and fail-safe redirection
async function handleLogout(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }
  if (isLoggingOut) return;
  isLoggingOut = true;

  // Immediate visual feedback on all logout buttons across the view
  const logoutButtons = document.querySelectorAll(
    '#logoutBtn, .logout-btn, button[onclick*="handleLogout"], button[onclick*="logout"]'
  );
  logoutButtons.forEach((btn) => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Logging out...';
  });

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      if (controller) controller.abort();
    }, 2000);

    // Call logout endpoint (exempt from CSRF to guarantee clean session termination)
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      signal: controller ? controller.signal : undefined,
    }).catch((err) => {
      console.warn('Network issue during logout POST, falling back to direct navigation:', err);
    });

    clearTimeout(timeoutId);
  } catch (err) {
    console.warn('Logout warning:', err);
  } finally {
    currentUser = null;
    if (typeof resetApiSession === 'function') resetApiSession();

    try {
      sessionStorage.clear();
    } catch (_) {}

    // Navigate cleanly to login page
    window.location.replace('/login.html?logged_out=1');
  }
}

// Expose on global window object for inline HTML triggers and direct script execution
window.handleLogout = handleLogout;
window.logout = handleLogout;

// Global delegated event listener to catch any logout clicks across the DOM
document.addEventListener('click', (e) => {
  const trigger = e.target.closest(
    '#logoutBtn, .logout-btn, [data-action="logout"], a[href="/api/auth/logout"], a[href="#logout"]'
  );
  if (trigger) {
    e.preventDefault();
    handleLogout(e);
  }
});

// Quick fill demo credentials for evaluation & viva presentation
function fillDemo(role) {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  if (!emailInput || !passwordInput) return;

  const defaultPass = 'Password@123';
  let email = '';
  switch (role) {
    case 'admin':
      email = 'admin@wastewise.org';
      break;
    case 'collector':
      email = 'collector1@wastewise.org';
      break;
    case 'center':
      email = 'center1@wastewise.org';
      break;
    case 'citizen':
      email = 'citizen1@wastewise.org';
      break;
  }

  emailInput.value = email;
  passwordInput.value = defaultPass;
  showToast(`Demo filled for ${role}: ${email}`, 'info', 2500);
}

// Public header authentication sync
document.addEventListener('DOMContentLoaded', async () => {
  // Check if we are on a public page and update nav buttons if logged in
  const isDashboard = window.location.pathname.includes('-dashboard');
  if (!isDashboard) {
    const user = await getCurrentUser();
    if (user) {
      updateUserInterface(user);
    }
  }
});
