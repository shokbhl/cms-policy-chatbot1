// admin.js (PROFESSIONAL FULL VERSION - Shared for dashboard.html and logs.html)
// Provides admin authentication checks, token management, and fetch utilities
// Used to ensure admin access and handle API calls with authorization

const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev";

const LS = {
  adminToken: "cms_admin_token",
  adminUntil: "cms_admin_until"
};

/**
 * Checks if the admin session is active based on token and expiration.
 * @returns {boolean} True if active, false otherwise.
 */
function isAdminActive() {
  const token = localStorage.getItem(LS.adminToken);
  const until = Number(localStorage.getItem(LS.adminUntil) || "0");
  return !!token && Date.now() < until;
}

/**
 * Retrieves the admin token from localStorage.
 * @returns {string} The token or empty string if not found.
 */
function getAdminToken() {
  return localStorage.getItem(LS.adminToken) || "";
}

/**
 * Requires admin access or redirects to the main app.
 * Displays an alert if session expired.
 * @returns {boolean} True if admin active, false otherwise (redirects if false).
 */
function requireAdminOrRedirect() {
  if (!isAdminActive()) {
    alert("Admin session expired. Please enable Admin Mode again in the main app.");
    window.location.href = "index.html";
    return false;
  }
  return true;
}

/**
 * Fetches data from an admin endpoint with authorization.
 * Handles 401 unauthorized and general errors.
 * @param {string} path - The API path (e.g., "/admin/stats").
 * @returns {Promise<Object|null>} The response data or null on error (with redirect on 401).
 */
async function adminFetch(path) {
  try {
    const res = await fetch(`${WORKER_BASE}${path}`, {
      headers: { Authorization: `Bearer ${getAdminToken()}` }
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      alert(data.error || "Unauthorized. Re-enable Admin Mode.");
      window.location.href = "index.html";
      return null;
    }

    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }

    return data;
  } catch (err) {
    console.error("Admin fetch error:", err);
    alert(err.message || "Network error occurred.");
    return null;
  }
}

/**
 * Escapes HTML characters to prevent XSS in rendered content.
 * @param {any} s - The string to escape.
 * @returns {string} The escaped string.
 */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}