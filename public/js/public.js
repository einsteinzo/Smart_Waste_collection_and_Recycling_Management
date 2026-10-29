/**
 * WasteWise Portal - Public Pages Logic
 * Handles Homepage live counters, directory listings, registration, and login submission
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Homepage Live Counters
  const publicCounterEl = document.getElementById('homeTotalPickups');
  if (publicCounterEl) {
    loadHomepageStats();
  }

  // 2. Recycling Centers Directory Page
  const centersDirContainer = document.getElementById('centersDirectoryGrid');
  if (centersDirContainer) {
    loadCentersDirectory();
  }

  // 3. Login Page Setup
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    setupLoginHandler(loginForm);
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('logged_out')) {
      showToast('You have been logged out successfully.', 'info', 3000);
    } else if (urlParams.get('expired')) {
      showToast('Your session has expired. Please log in again.', 'warning', 4000);
    }
  }

  // 4. Registration Page Setup
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    setupRegisterHandler(registerForm);
  }

  // 5. Contact Page Form
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      showToast('Thank you for reaching out! Our municipal help desk has received your ticket.', 'success');
      contactForm.reset();
    });
  }
});

// Load live public metrics from the database
async function loadHomepageStats() {
  try {
    const res = await apiRequest('/api/dashboard/public-stats');
    if (res.ok && res.data.success) {
      const s = res.data.stats;
      document.getElementById('homeTotalPickups').textContent = s.totalPickups || 0;
      document.getElementById('homeCompletedPickups').textContent = s.completedPickups || 0;
      document.getElementById('homeTotalRecycledKg').textContent = (s.totalRecycledKg || 0).toLocaleString() + ' kg';
      document.getElementById('homeTotalCitizens').textContent = s.totalCitizens || 0;
      document.getElementById('homePartnerCenters').textContent = s.partnerCenters || 0;
    }
  } catch (err) {
    console.error('Error loading public stats:', err);
  }
}

// Load Recycling Centers Directory
async function loadCentersDirectory() {
  const container = document.getElementById('centersDirectoryGrid');
  const searchInput = document.getElementById('centerSearchInput');
  const catSelect = document.getElementById('centerCategoryFilter');

  const res = await apiRequest('/api/admin/centers');
  if (res.ok && res.data.centers) {
    let centers = res.data.centers.filter((c) => c.isActive);

    const render = () => {
      const query = (searchInput?.value || '').toLowerCase();
      const filterCat = catSelect?.value || 'All';

      const filtered = centers.filter((c) => {
        const matchesQuery =
          c.name.toLowerCase().includes(query) ||
          c.address?.city.toLowerCase().includes(query) ||
          c.address?.street.toLowerCase().includes(query);
        const matchesCat = filterCat === 'All' || c.acceptedCategories.includes(filterCat);
        return matchesQuery && matchesCat;
      });

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="col-12 text-center py-5">
            <i class="bi bi-geo-alt text-muted display-4"></i>
            <h5 class="mt-3 text-muted">No recycling facilities match your search criteria.</h5>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered
        .map((c) => {
          return `
          <div class="col-12 col-md-6 col-lg-4 mb-4">
            <div class="card h-100 shadow-sm border-0 border-top border-4 border-success">
              <div class="card-body">
                <span class="badge bg-success-subtle text-success fw-bold mb-2">
                  <i class="bi bi-shield-check me-1"></i> Authorized Municipal Facility
                </span>
                <h5 class="fw-bold mb-1">${c.name}</h5>
                <p class="small text-muted mb-3"><i class="bi bi-geo-alt me-1"></i>${c.address.street}, ${c.address.city} - ${c.address.postalCode}</p>

                <div class="mb-3">
                  <small class="text-muted d-block fw-bold mb-1">Accepted Recyclables:</small>
                  <div class="d-flex flex-wrap gap-1">
                    ${c.acceptedCategories.map((cat) => getCategoryBadge(cat)).join('')}
                  </div>
                </div>

                <div class="p-2 rounded bg-light small mb-3">
                  <div><strong>Operating Hours:</strong> ${c.operatingHours || '08:00 AM - 06:00 PM'}</div>
                  <div><strong>Daily Intake Capacity:</strong> ${c.dailyCapacityKg} kg/day</div>
                </div>

                <div class="d-flex justify-content-between align-items-center pt-2 border-top small">
                  <span><i class="bi bi-telephone me-1"></i>${c.contactPhone}</span>
                  <a href="mailto:${c.contactEmail}" class="text-decoration-none"><i class="bi bi-envelope me-1"></i>Email</a>
                </div>
              </div>
            </div>
          </div>
        `;
        })
        .join('');
    };

    if (searchInput) searchInput.addEventListener('input', render);
    if (catSelect) catSelect.addEventListener('change', render);
    render();
  }
}

// Setup Login Form Handler
function setupLoginHandler(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;

    if (!email || !password) {
      showToast('Please enter both email and password.', 'warning');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Authenticating...';

    if (typeof resetApiSession === 'function') resetApiSession();
    if (typeof currentUser !== 'undefined') currentUser = null;

    const res = await apiRequest('/api/auth/login', 'POST', { email, password });
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Log In';

    if (res.ok && res.data.success) {
      showToast(res.data.message || 'Login successful!', 'success');
      const role = res.data.user?.role;
      setTimeout(() => {
        window.location.href = getDashboardUrl(role);
      }, 400);
    } else {
      showToast(res.data?.message || 'Login failed. Please check your credentials.', 'danger');
    }
  });
}

// Setup Citizen Registration Handler
function setupRegisterHandler(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const street = document.getElementById('street').value.trim();
    const city = document.getElementById('city').value.trim();
    const state = document.getElementById('state').value.trim();
    const postalCode = document.getElementById('postalCode').value.trim();
    const terms = document.getElementById('terms');

    if (!name || !email || !phone || !password || !confirmPassword) {
      showToast('Please complete all required fields.', 'warning');
      return;
    }

    if (password.length < 6) {
      showToast('Password must be at least 6 characters long.', 'warning');
      return;
    }

    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'danger');
      return;
    }

    if (terms && !terms.checked) {
      showToast('Please agree to the municipal segregation rules.', 'warning');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating Account...';

    const res = await apiRequest('/api/auth/register', 'POST', {
      name,
      email,
      phone,
      password,
      confirmPassword,
      street,
      city,
      state,
      postalCode,
    });

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i> Create Citizen Account';

    if (res.ok && res.data.success) {
      showToast('Registration successful! Redirecting to your citizen dashboard...', 'success');
      // Reset cached token so new authenticated session generates fresh tokens
      if (typeof csrfTokenCache !== 'undefined') csrfTokenCache = null;
      setTimeout(() => {
        window.location.href = '/citizen-dashboard.html';
      }, 700);
    } else {
      const errMsg =
        res.data?.message ||
        (res.data?.errors ? res.data.errors.map((err) => err.message).join(' | ') : null) ||
        'Registration failed. Please check your information and try again.';
      showToast(errMsg, 'danger');
    }
  });
}
