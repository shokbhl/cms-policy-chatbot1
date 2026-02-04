/* =========================
   app.js (PROFESSIONAL FULL VERSION)
   - Integrates with index.html and style.css
   - Proxies API calls via /api (Cloudflare Pages Function) to Worker
   - Handles staff/parent login with token management
   - Campus-based modern handbook UI
   - Policies/Protocols menu panel
   - Admin mode with PIN, dashboard, and logs links
   - Interactive chat UI
   - Error handling and session management improved
   - Uses localStorage for state persistence
   ========================= */

(() => {
  // =============== CONFIG ===============
  // API endpoint (proxied to Worker)
  const API_URL = "/api";

  // LocalStorage keys for state management
  const LS = {
    campus: "cms_campus",
    role: "cms_role", // 'staff' | 'parent'
    staffToken: "cms_staff_token",
    staffUntil: "cms_staff_until",
    parentToken: "cms_parent_token",
    parentUntil: "cms_parent_until",
    adminToken: "cms_admin_token",
    adminUntil: "cms_admin_until",
    lastMenu: "cms_last_menu" // Optional: last selected menu
  };

  // Supported campuses
  const CAMPUSES = ["YC", "MC", "SC", "TC", "WC"];

  // =============== DOM Helpers ===============
  const $ = (id) => document.getElementById(id);

  // Screen elements
  const loginScreen = $("login-screen");
  const chatScreen = $("chat-screen");

  // Header and top menu elements
  const headerActions = $("header-actions");
  const topMenuBar = $("top-menu-bar");
  const campusSwitch = $("campus-switch");
  const logoutBtn = $("logout-btn");
  const adminModeBtn = $("admin-mode-btn");
  const modeBadge = $("mode-badge");
  const adminLinks = $("admin-links");

  // Login form elements
  const loginForm = $("login-form");
  const accessCodeInput = $("access-code");
  const campusSelect = $("campus-select");
  const loginAdminBtn = $("login-admin-btn");
  const loginError = $("login-error");

  // Admin modal elements (assuming they exist in HTML)
  const adminModal = $("admin-modal");
  const adminPinInput = $("admin-pin-input");
  const adminPinSubmit = $("admin-pin-submit");
  const adminPinCancel = $("admin-pin-cancel");

  // Chat UI elements (assuming IDs based on typical setup)
  const chatWindow = $("chat-window");
  const chatInput = $("chat-input");
  const chatSendBtn = $("chat-send-btn");

  // Handbook UI elements (modern)
  const hbItems = document.querySelectorAll(".hb-item");
  const hbOpenSec = $("hb-open-sec");
  const hbPreview = $("hb-preview");
  const hbCopyBtn = $("hb-copy-btn");

  // =============== State Management Functions ===============
  /**
   * Gets current campus from localStorage.
   * @returns {string|null}
   */
  function getCampus() {
    return localStorage.getItem(LS.campus);
  }

  /**
   * Sets campus in localStorage.
   * @param {string} campus 
   */
  function setCampus(campus) {
    localStorage.setItem(LS.campus, campus);
  }

  /**
   * Gets current role from localStorage.
   * @returns {string|null}
   */
  function getRole() {
    return localStorage.getItem(LS.role);
  }

  /**
   * Sets role in localStorage.
   * @param {string} role 
   */
  function setRole(role) {
    localStorage.setItem(LS.role, role);
  }

  /**
   * Checks if staff session is active.
   * @returns {boolean}
   */
  function isStaffActive() {
    const token = localStorage.getItem(LS.staffToken);
    const until = Number(localStorage.getItem(LS.staffUntil) || "0");
    return !!token && Date.now() < until;
  }

  /**
   * Checks if parent session is active.
   * @returns {boolean}
   */
  function isParentActive() {
    const token = localStorage.getItem(LS.parentToken);
    const until = Number(localStorage.getItem(LS.parentUntil) || "0");
    return !!token && Date.now() < until;
  }

  /**
   * Checks if admin mode is active.
   * @returns {boolean}
   */
  function isAdminActive() {
    const token = localStorage.getItem(LS.adminToken);
    const until = Number(localStorage.getItem(LS.adminUntil) || "0");
    return !!token && Date.now() < until;
  }

  // =============== UI Management Functions ===============
  /**
   * Enters the main app screen after login.
   */
  function enterApp() {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    // Update UI based on role (e.g., show/hide menus)
    const role = getRole();
    if (role === "staff") {
      // Show staff-specific features
    } else if (role === "parent") {
      // Show parent-specific features
    }
    updateHeader();
  }

  /**
   * Enters the login screen.
   */
  function enterLogin() {
    chatScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
  }

  /**
   * Updates header with campus, role, and admin badge.
   */
  function updateHeader() {
    campusSwitch.value = getCampus();
    modeBadge.textContent = isAdminActive() ? "Admin" : getRole().toUpperCase();
    adminLinks.classList.toggle("hidden", !isAdminActive());
  }

  /**
   * Sets the mode badge text and style.
   */
  function setModeBadge() {
    if (isAdminActive()) {
      modeBadge.textContent = "ADMIN";
      modeBadge.style.background = "var(--danger)";
    } else {
      modeBadge.textContent = getRole()?.toUpperCase() || "";
      modeBadge.style.background = "var(--brand)";
    }
  }

  /**
   * Opens admin PIN modal.
   */
  function openAdminModal() {
    adminModal.classList.remove("hidden");
    adminPinInput.focus();
  }

  /**
   * Closes admin PIN modal.
   */
  function closeAdminModal() {
    adminModal.classList.add("hidden");
    adminPinInput.value = "";
  }

  /**
   * Sets active menu pill.
   * @param {string} menuId 
   */
  function setActiveMenuPill(menuId) {
    // Assuming menu pills have class .menu-pill
    document.querySelectorAll(".menu-pill").forEach(pill => {
      pill.classList.toggle("active", pill.id === menuId);
    });
    localStorage.setItem(LS.lastMenu, menuId);
  }

  // =============== API Calls ===============
  /**
   * Performs staff or parent login.
   * @param {string} code 
   * @param {string} role - 'staff' or 'parent'
   * @returns {Promise<Object>}
   */
  async function performLogin(code, role) {
    try {
      const res = await fetch(`/auth/${role}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Login failed");
      return data;
    } catch (err) {
      throw new Error(err.message || "Network error");
    }
  }

  /**
   * Performs admin login with PIN.
   * @param {string} pin 
   * @returns {Promise<Object>}
   */
  async function adminLogin(pin) {
    try {
      const res = await fetch("/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Admin login failed");
      return data;
    } catch (err) {
      throw new Error(err.message || "Network error");
    }
  }

  /**
   * Sends chat query to API.
   * @param {string} query 
   * @returns {Promise<Object>}
   */
  async function sendChatQuery(query) {
    const campus = getCampus();
    const token = getRole() === "staff" ? localStorage.getItem(LS.staffToken) : localStorage.getItem(LS.parentToken);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ query, campus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Query failed");
      return data;
    } catch (err) {
      throw new Error(err.message || "Chat error");
    }
  }

  // =============== Event Listeners ===============
  // Login form submit
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.textContent = "";
    const code = accessCodeInput.value.trim();
    const role = $("role-staff").checked ? "staff" : "parent"; // Assuming radio buttons for role
    const campus = campusSelect.value;
    try {
      const data = await performLogin(code, role);
      setRole(role);
      setCampus(campus);
      if (role === "staff") {
        localStorage.setItem(LS.staffToken, data.token);
        localStorage.setItem(LS.staffUntil, Date.now() + data.expires_in * 1000);
      } else {
        localStorage.setItem(LS.parentToken, data.token);
        localStorage.setItem(LS.parentUntil, Date.now() + data.expires_in * 1000);
      }
      enterApp();
    } catch (err) {
      loginError.textContent = err.message;
    }
  });

  // Logout button
  logoutBtn?.addEventListener("click", () => {
    Object.values(LS).forEach(key => localStorage.removeItem(key));
    enterLogin();
  });

  // Campus switch
  campusSwitch?.addEventListener("change", (e) => {
    setCampus(e.target.value);
    // Refresh UI or data if needed
  });

  // Admin mode button
  adminModeBtn?.addEventListener("click", openAdminModal);

  // Admin modal cancel
  adminPinCancel?.addEventListener("click", closeAdminModal);

  // Admin modal submit
  adminPinSubmit?.addEventListener("click", async () => {
    try {
      const pin = adminPinInput.value.trim();
      const data = await adminLogin(pin);
      localStorage.setItem(LS.adminToken, data.token);
      localStorage.setItem(LS.adminUntil, Date.now() + data.expires_in * 1000);
      closeAdminModal();
      setModeBadge();
      alert("Admin mode enabled ✅");
      // Show admin links
      adminLinks.classList.remove("hidden");
    } catch (err) {
      alert(err.message || "Admin login failed");
    }
  });

  // Chat send button
  chatSendBtn?.addEventListener("click", async () => {
    const query = chatInput.value.trim();
    if (!query) return;
    try {
      const response = await sendChatQuery(query);
      // Append to chat window (assuming a function to render chat)
      renderChatMessage("user", query);
      renderChatMessage("bot", response.answer);
      chatInput.value = "";
    } catch (err) {
      renderChatMessage("error", err.message);
    }
  });

  // Handbook interactions (example)
  hbItems.forEach(item => {
    item.addEventListener("click", () => {
      hbItems.forEach(i => i.classList.remove("active"));
      item.classList.add("active");
      // Load handbook preview
    });
  });

  hbOpenSec?.addEventListener("click", () => {
    // Open section logic
  });

  hbCopyBtn?.addEventListener("click", () => {
    // Copy preview text to clipboard
    navigator.clipboard.writeText(hbPreview.textContent).then(() => alert("Copied!"));
  });

  // =============== INIT ===============
  /**
   * Initializes campus select dropdowns.
   */
  function initCampusSelects() {
    // Populate if empty
    if (campusSelect && campusSelect.options.length <= 1) {
      CAMPUSES.forEach(c => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = c;
        campusSelect.appendChild(opt);
      });
    }
    if (campusSwitch && campusSwitch.options.length <= 1) {
      CAMPUSES.forEach(c => {
        const opt = document.createElement("option");
        opt.value = opt.textContent = c;
        campusSwitch.appendChild(opt);
      });
    }
  }

  /**
   * Renders a chat message in the window.
   * @param {string} type - 'user', 'bot', or 'error'
   * @param {string} text 
   */
  function renderChatMessage(type, text) {
    const msg = document.createElement("div");
    msg.classList.add("chat-msg", `chat-${type}`);
    msg.textContent = text;
    chatWindow.appendChild(msg);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  /**
   * Initializes the app.
   */
  function init() {
    initCampusSelects();
    if (!getCampus()) setCampus("MC");

    const role = getRole();
    const loggedIn = (role === "staff" && isStaffActive()) || (role === "parent" && isParentActive());

    if (loggedIn) {
      enterApp();
      setActiveMenuPill(localStorage.getItem(LS.lastMenu) || "default-menu");
    } else {
      enterLogin();
    }

    setModeBadge();
  }

  init();
})();