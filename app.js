/* ==========================================================
   CMS Assistant - app.js (FULL FEATURE)
   - Staff/Parent/Admin login from first screen
   - Campus required (blank default)
   - Parent: only Parent Handbook menu
   - Staff/Admin: Policies + Protocols + Parent Handbook
   - Handbook list per campus + sections clickable
   - Admin mode badge + admin links (Dashboard/Logs)
   - Campus switch inside app + "Campus switched" message
   ========================================================== */

(() => {
  /* -------------------- CONFIG -------------------- */

  // You can define in index.html:
  // <script>window.CMS_CONFIG = { API_BASE: "https://YOUR-WORKER.workers.dev" };</script>
  const API_BASE =
    (window.CMS_CONFIG && window.CMS_CONFIG.API_BASE) ||
    localStorage.getItem("CMS_API_BASE") ||
    ""; // "" means same origin (ONLY works if you proxy via Pages/Worker route)

  const LS = {
    role: "cms_role",          // "parent" | "staff" | "admin"
    token: "cms_token",        // bearer token for staff/parent
    adminToken: "cms_admin_token", // bearer token for admin endpoints
    campus: "cms_campus",      // "YC" | "MC" ...
    name: "cms_name",          // optional
  };

  const ROLES = { parent: "parent", staff: "staff", admin: "admin" };
  const CAMPUSES = ["MC", "SC", "TC", "WC", "YC"];

  /* -------------------- DOM HELPERS -------------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function safeText(el, txt) { if (el) el.textContent = txt; }
  function show(el) { if (el) el.classList.remove("hidden"); }
  function hide(el) { if (el) el.classList.add("hidden"); }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toast(msg) {
    // minimal toast (doesn't need extra CSS)
    const t = document.createElement("div");
    t.style.position = "fixed";
    t.style.left = "50%";
    t.style.bottom = "18px";
    t.style.transform = "translateX(-50%)";
    t.style.background = "rgba(17,24,39,.92)";
    t.style.color = "#fff";
    t.style.padding = "10px 12px";
    t.style.borderRadius = "12px";
    t.style.fontWeight = "700";
    t.style.zIndex = "9999";
    t.style.maxWidth = "92vw";
    t.style.textAlign = "center";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function apiUrl(path) {
    // If API_BASE empty, use relative path
    return (API_BASE ? API_BASE.replace(/\/$/, "") : "") + path;
  }

  async function http(path, { method = "GET", headers = {}, body } = {}) {
    const res = await fetch(apiUrl(path), {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function getRole() { return localStorage.getItem(LS.role) || ""; }
  function getCampus() { return (localStorage.getItem(LS.campus) || "").toUpperCase(); }
  function setCampus(c) { localStorage.setItem(LS.campus, (c || "").toUpperCase()); }

  function getToken() { return localStorage.getItem(LS.token) || ""; }
  function getAdminToken() { return localStorage.getItem(LS.adminToken) || ""; }

  function setAuth({ role, token, adminToken, campus }) {
    if (role) localStorage.setItem(LS.role, role);
    if (typeof token === "string") localStorage.setItem(LS.token, token);
    if (typeof adminToken === "string") localStorage.setItem(LS.adminToken, adminToken);
    if (campus) setCampus(campus);
  }

  function clearAuth() {
    localStorage.removeItem(LS.role);
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.adminToken);
    // keep campus optional:
    // localStorage.removeItem(LS.campus);
  }

  /* -------------------- FIND IMPORTANT ELEMENTS -------------------- */

  // Header
  const elHeaderCampus = $("#campusSelect") || $(".campus-switch") || $("#campusSwitch");
  const elBtnAdminTop = $("#adminBtn") || $("#btnAdmin") || $('[data-action="admin-login"]') || $(".btn-admin");
  const elBtnLogout = $("#logoutBtn") || $("#btnLogout") || $('[data-action="logout"]');

  const elBadge = $("#modeBadge") || $(".mode-badge");
  const elBadgeAdmin = $("#adminBadge") || $("#badgeAdmin");

  const elAdminLinksWrap = $("#adminLinks") || $(".admin-links");
  const elLinkDashboard = $("#dashboardLink") || $('a[href="dashboard.html"]');
  const elLinkLogs = $("#logsLink") || $('a[href="logs.html"]');

  // Screens
  const elScreenLogin = $("#screenLogin") || $("#loginScreen") || $("#loginCard") || $(".login-card")?.closest(".screen") || $("#login");
  const elScreenApp = $("#screenApp") || $("#appScreen") || $("#mainScreen") || $("#app");

  // Login form
  const elAccessCode = $("#accessCode") || $("#code") || $('input[name="accessCode"]') || $('input[placeholder*="Access"]');
  const elCampusLogin = $("#campusLogin") || $("#campus") || $('select[name="campus"]') || $(".campus-select");
  const elBtnLogin = $("#loginBtn") || $("#btnLogin") || $('button[type="submit"]') || $('button:contains("Login")');
  const elLoginError = $("#loginError") || $("#error") || $(".error-text");

  // Top menu
  const elMenuPolicies = $("#menuPolicies") || $('[data-menu="policies"]');
  const elMenuProtocols = $("#menuProtocols") || $('[data-menu="protocols"]');
  const elMenuHandbook = $("#menuHandbook") || $("#menuParentHandbook") || $('[data-menu="handbook"]');

  // Chat
  const elChatWrap = $("#chatWrap") || $(".chat-shell");
  const elChatWindow = $("#chatWindow") || $("#messages") || $(".chat-window");
  const elChatInput = $("#chatInput") || $("#prompt") || $('input[placeholder*="Ask"]') || $('textarea');
  const elChatSend = $("#chatSend") || $("#askBtn") || $('button:contains("Ask")') || $(".ask-btn");
  const elChatHint = $("#chatHint") || $(".chat-top-hint");

  // Modals / Panels (optional in HTML)
  const elOverlay = $("#overlay") || $(".overlay");
  const elMenuPanel = $("#menuPanel") || $(".menu-panel");
  const elMenuPanelTitle = $("#menuPanelTitle") || $(".menu-panel-title");
  const elMenuPanelBody = $("#menuPanelBody") || $(".menu-panel-body");
  const elMenuClose = $("#menuClose") || $('[data-action="close-menu"]') || $(".menu-close");

  /* -------------------- RUNTIME STATE -------------------- */

  let state = {
    role: getRole(),
    campus: getCampus(),
    token: getToken(),
    adminToken: getAdminToken(),
    activeMenu: "", // policies|protocols|handbook
    handbooksCache: {}, // campus -> array
    policiesCache: null,
    protocolsCache: null,
  };

  /* -------------------- UI CORE -------------------- */

  function ensureInputsPrivacy() {
    // Hide access code text even if HTML has type="text"
    if (elAccessCode) {
      elAccessCode.setAttribute("type", "password");
      elAccessCode.setAttribute("autocomplete", "current-password");
    }
  }

  function ensureCampusOptions(selectEl) {
    if (!selectEl) return;
    const opts = Array.from(selectEl.options || []);
    const hasBlank = opts.some(o => (o.value || "") === "");
    if (!hasBlank) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "Select campus";
      o.selected = true;
      selectEl.insertBefore(o, selectEl.firstChild);
    }
    // If options empty, populate
    if ((selectEl.options?.length || 0) <= 1) {
      CAMPUSES.forEach(c => {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        selectEl.appendChild(o);
      });
    }
  }

  function setActiveMenu(menu) {
    state.activeMenu = menu;
    // toggle active class if present
    const items = [
      [elMenuPolicies, "policies"],
      [elMenuProtocols, "protocols"],
      [elMenuHandbook, "handbook"],
    ];
    items.forEach(([el, key]) => {
      if (!el) return;
      if (key === menu) el.classList.add("active");
      else el.classList.remove("active");
    });
  }

  function setBadge() {
    if (!elBadge) return;

    const r = state.role;
    const c = state.campus || "";
    if (!r) {
      elBadge.className = "mode-badge hidden";
      return;
    }

    elBadge.className = "mode-badge";
    if (r === ROLES.admin) elBadge.classList.add("admin");
    if (r === ROLES.staff) elBadge.classList.add("staff");
    if (r === ROLES.parent) elBadge.classList.add("parent");

    elBadge.textContent = (r === "admin" ? "ADMIN" : r.toUpperCase()) + (c ? ` · ${c}` : "");
  }

  function renderRoleMenus() {
    // Parent: only handbook
    const isParent = state.role === ROLES.parent;
    const isStaff = state.role === ROLES.staff;
    const isAdmin = state.role === ROLES.admin;

    if (elMenuPolicies) (isParent ? hide(elMenuPolicies) : show(elMenuPolicies));
    if (elMenuProtocols) (isParent ? hide(elMenuProtocols) : show(elMenuProtocols));
    if (elMenuHandbook) show(elMenuHandbook);

    // Admin links only for admin
    if (elAdminLinksWrap) (isAdmin ? show(elAdminLinksWrap) : hide(elAdminLinksWrap));
    if (elLinkDashboard) elLinkDashboard.style.display = isAdmin ? "" : "none";
    if (elLinkLogs) elLinkLogs.style.display = isAdmin ? "" : "none";
  }

  function renderCampusControls() {
    ensureCampusOptions(elCampusLogin);
    ensureCampusOptions(elHeaderCampus);

    const c = state.campus || "";

    if (elCampusLogin) elCampusLogin.value = c || "";
    if (elHeaderCampus) elHeaderCampus.value = c || "";
  }

  function renderScreens() {
    const loggedIn = !!state.role;
    if (loggedIn) {
      if (elScreenLogin) hide(elScreenLogin);
      if (elScreenApp) show(elScreenApp);
    } else {
      if (elScreenApp) hide(elScreenApp);
      if (elScreenLogin) show(elScreenLogin);
    }
  }

  function renderChatAvailability() {
    // rule: admin alone can browse but to ask chat must be staff/parent
    // (your earlier logic)
    const canAsk = state.role === ROLES.staff || state.role === ROLES.parent;
    if (!elChatInput || !elChatSend) return;

    elChatInput.disabled = !canAsk;
    elChatSend.disabled = !canAsk;

    if (elChatHint) {
      if (state.role === ROLES.admin) {
        safeText(elChatHint, "Admin mode enabled. You can browse menus and access Dashboard/Logs. To ask in chat, login with a Staff or Parent code.");
      } else if (state.role) {
        safeText(elChatHint, "Ask any CMS policy, protocol, or parent handbook question (campus-based).");
      } else {
        safeText(elChatHint, "");
      }
    }
  }

  function applyAllUI() {
    ensureInputsPrivacy();
    renderScreens();
    renderCampusControls();
    setBadge();
    renderRoleMenus();
    renderChatAvailability();
  }

  /* -------------------- MENU PANEL -------------------- */

  function openMenuPanel(title) {
    if (elOverlay) show(elOverlay);
    if (elMenuPanel) show(elMenuPanel);
    if (elMenuPanelTitle) safeText(elMenuPanelTitle, title || "");
  }

  function closeMenuPanel() {
    if (elOverlay) hide(elOverlay);
    if (elMenuPanel) hide(elMenuPanel);
  }

  function menuBodyHtml(html) {
    if (!elMenuPanelBody) return;
    elMenuPanelBody.innerHTML = html;
  }

  /* -------------------- AUTH / LOGIN -------------------- */

  async function loginStaffOrParent(code, campus) {
    // Worker should validate STAFF_CODE/PARENT_CODE and return role+token
    // Expected response:
    // { ok:true, role:"staff"|"parent", token:"...", campus:"YC" }
    const data = await http("/auth/login", {
      method: "POST",
      body: { code, campus },
    });

    if (!data || !data.role) throw new Error("Login failed");

    setAuth({ role: data.role, token: data.token || "", campus: data.campus || campus });
    state.role = data.role;
    state.token = data.token || "";
    state.campus = (data.campus || campus || "").toUpperCase();

    // clear input
    if (elAccessCode) elAccessCode.value = "";
    toast(`Logged in as ${state.role.toUpperCase()} · ${state.campus}`);
    applyAllUI();

    // default menu
    if (state.role === ROLES.parent) {
      setActiveMenu("handbook");
      await showHandbooksMenu();
    } else {
      setActiveMenu("policies");
      await showPoliciesMenu();
    }
  }

  async function loginAdmin(pin) {
    // Worker should validate ADMIN_PIN and return adminToken
    // Expected: { ok:true, adminToken:"..." }
    const data = await http("/admin/login", {
      method: "POST",
      body: { pin },
    });

    if (!data || !data.adminToken) throw new Error("Admin login failed");

    setAuth({ role: ROLES.admin, adminToken: data.adminToken, campus: state.campus || "YC" });
    state.role = ROLES.admin;
    state.adminToken = data.adminToken;
    state.token = ""; // admin is separate
    if (!state.campus) state.campus = "YC";
    setCampus(state.campus);

    toast(`Admin mode · ${state.campus}`);
    applyAllUI();

    // open handbook by default in admin mode
    setActiveMenu("handbook");
    await showHandbooksMenu();
  }

  function logout() {
    clearAuth();
    state.role = "";
    state.token = "";
    state.adminToken = "";
    // keep campus
    state.campus = getCampus();
    applyAllUI();
    closeMenuPanel();
    if (elChatWindow) elChatWindow.innerHTML = "";
    toast("Logged out");
  }

  /* -------------------- ADMIN MODAL -------------------- */

  function openAdminModal() {
    // Build modal dynamically (so index.html doesn't need extra markup)
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <div class="modal-title">Admin Login</div>
        <div class="modal-hint">Enter admin PIN to enable Admin mode (Dashboard/Logs access).</div>
        <input id="__adminPin" class="text-input" type="password" placeholder="Admin PIN" autocomplete="current-password" />
        <div id="__adminErr" class="error-text"></div>
        <div class="modal-actions">
          <button id="__adminCancel" class="secondary-btn" type="button">Cancel</button>
          <button id="__adminGo" class="primary-btn" type="button">Login</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const pinEl = $("#__adminPin", modal);
    const errEl = $("#__adminErr", modal);
    const cancelEl = $("#__adminCancel", modal);
    const goEl = $("#__adminGo", modal);

    const close = () => modal.remove();

    cancelEl.addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    goEl.addEventListener("click", async () => {
      safeText(errEl, "");
      const pin = (pinEl.value || "").trim();
      if (!pin) { safeText(errEl, "PIN required."); return; }
      try {
        await loginAdmin(pin);
        close();
      } catch (e) {
        safeText(errEl, e.message || "Admin login error");
      }
    });

    pinEl.focus();
  }

  /* -------------------- DATA LOADERS -------------------- */

  async function fetchHandbooks(campus) {
    const c = (campus || "").toUpperCase();
    if (!c) throw new Error("Campus required");
    if (state.handbooksCache[c]) return state.handbooksCache[c];

    // Expected response: { handbooks: [...] }
    const data = await http(`/handbooks?campus=${encodeURIComponent(c)}`, { method: "GET" });
    const list = (data && (data.handbooks || data.items || data)) || [];
    state.handbooksCache[c] = Array.isArray(list) ? list : [];
    return state.handbooksCache[c];
  }

  async function fetchPolicies() {
    if (state.policiesCache) return state.policiesCache;
    const data = await http(`/policies`, { method: "GET" });
    const list = (data && (data.policies || data.items || data)) || [];
    state.policiesCache = Array.isArray(list) ? list : [];
    return state.policiesCache;
  }

  async function fetchProtocols() {
    if (state.protocolsCache) return state.protocolsCache;
    const data = await http(`/protocols`, { method: "GET" });
    const list = (data && (data.protocols || data.items || data)) || [];
    state.protocolsCache = Array.isArray(list) ? list : [];
    return state.protocolsCache;
  }

  /* -------------------- MENU RENDERERS -------------------- */

  async function showHandbooksMenu() {
    setActiveMenu("handbook");
    openMenuPanel("Parent Handbook");

    try {
      const campus = state.campus;
      if (!campus) {
        menuBodyHtml(`<div class="muted"><b>Select a campus first.</b></div>`);
        return;
      }

      const handbooks = await fetchHandbooks(campus);

      if (!handbooks.length) {
        menuBodyHtml(`<div class="muted">No handbooks found for campus <b>${escapeHtml(campus)}</b>.</div>`);
        return;
      }

      const html = handbooks.map(hb => {
        const title = hb.title || hb.program || hb.id || "Handbook";
        const meta = [hb.campus, hb.program, hb.id].filter(Boolean).join(" · ");
        const link = hb.link ? `<a class="hb-open-link" href="${escapeHtml(hb.link)}" target="_blank" rel="noopener">Open source link</a>` : "";

        const sections = Array.isArray(hb.sections) ? hb.sections : [];
        const sectionsHtml = sections.map(s => `
          <button class="hb-section-btn" data-action="ask-section"
            data-hbid="${escapeHtml(hb.id || "")}"
            data-seckey="${escapeHtml(s.key || "")}"
            data-sectitle="${escapeHtml(s.title || "")}"
            data-hbtitle="${escapeHtml(title)}"
          >
            ${escapeHtml(s.title || s.key || "Section")}
          </button>
        `).join("");

        return `
          <div class="hb-card">
            <div class="hb-title">${escapeHtml(title)}</div>
            <div class="hb-meta">${escapeHtml(meta)}</div>
            ${link}
            <div class="menu-group-label">Sections</div>
            ${sectionsHtml || `<div class="muted">No sections defined yet.</div>`}
          </div>
        `;
      }).join("");

      menuBodyHtml(html);
    } catch (e) {
      menuBodyHtml(`<div class="error-text">${escapeHtml(e.message || "Handbook load error")}</div>`);
    }
  }

  async function showPoliciesMenu() {
    setActiveMenu("policies");
    openMenuPanel("Policies");

    try {
      const items = await fetchPolicies();
      if (!items.length) {
        menuBodyHtml(`<div class="muted">No policies found yet.</div>`);
        return;
      }

      const html = `
        <div class="menu-group-label">Select a policy to ask about</div>
        ${items.map(p => `
          <button class="menu-item-btn" data-action="ask-item"
            data-kind="policy"
            data-id="${escapeHtml(p.id || "")}"
            data-title="${escapeHtml(p.title || p.id || "Policy")}"
          >
            <b>${escapeHtml(p.title || p.id || "Policy")}</b>
          </button>
        `).join("")}
      `;
      menuBodyHtml(html);
    } catch (e) {
      menuBodyHtml(`<div class="error-text">${escapeHtml(e.message || "Policies load error")}</div>`);
    }
  }

  async function showProtocolsMenu() {
    setActiveMenu("protocols");
    openMenuPanel("Protocols");

    try {
      const items = await fetchProtocols();
      if (!items.length) {
        menuBodyHtml(`<div class="muted">No protocols found yet.</div>`);
        return;
      }

      const html = `
        <div class="menu-group-label">Select a protocol to ask about</div>
        ${items.map(p => `
          <button class="menu-item-btn" data-action="ask-item"
            data-kind="protocol"
            data-id="${escapeHtml(p.id || "")}"
            data-title="${escapeHtml(p.title || p.id || "Protocol")}"
          >
            <b>${escapeHtml(p.title || p.id || "Protocol")}</b>
          </button>
        `).join("")}
      `;
      menuBodyHtml(html);
    } catch (e) {
      menuBodyHtml(`<div class="error-text">${escapeHtml(e.message || "Protocols load error")}</div>`);
    }
  }

  /* -------------------- CHAT -------------------- */

  function addMsg(role, text) {
    if (!elChatWindow) return;
    const div = document.createElement("div");
    div.className = "msg " + (role === "user" ? "user" : "assistant");
    div.textContent = text;
    elChatWindow.appendChild(div);
    elChatWindow.scrollTop = elChatWindow.scrollHeight;
  }

  function addTyping() {
    if (!elChatWindow) return null;
    const wrap = document.createElement("div");
    wrap.className = "typing-bubble";
    wrap.innerHTML = `
      <div class="typing-dots">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
      <div class="muted" style="font-weight:800;">Thinking…</div>
    `;
    elChatWindow.appendChild(wrap);
    elChatWindow.scrollTop = elChatWindow.scrollHeight;
    return wrap;
  }

  async function sendChat(query, extra = {}) {
    const campus = state.campus;
    if (!campus) throw new Error("Select campus first.");
    if (!query.trim()) throw new Error("Type a question.");

    const token = state.token;
    if (!token) throw new Error("Login with Staff or Parent code first.");

    const body = {
      campus,
      query,
      ...extra,
    };

    // Expected response: { answer: "..." }
    const data = await http("/chat", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });

    return (data && (data.answer || data.response || data.text)) || "";
  }

  /* -------------------- EVENTS -------------------- */

  async function onLoginClick() {
    safeText(elLoginError, "");
    const code = (elAccessCode?.value || "").trim();
    const campus = (elCampusLogin?.value || "").trim().toUpperCase();

    if (!campus) { safeText(elLoginError, "Please select a campus."); return; }
    if (!code) { safeText(elLoginError, "Please enter your access code."); return; }

    try {
      await loginStaffOrParent(code, campus);
    } catch (e) {
      safeText(elLoginError, e.message || "Login error");
    }
  }

  async function onCampusSwitch(value) {
    const c = (value || "").toUpperCase();
    if (!c) return;
    state.campus = c;
    setCampus(c);
    renderCampusControls();
    setBadge();
    toast(`Campus switched to ${c}`);

    // refresh menus if open
    if (state.activeMenu === "handbook") await showHandbooksMenu();
  }

  async function onAskClick() {
    try {
      const q = (elChatInput?.value || "").trim();
      if (!q) return;
      elChatInput.value = "";
      addMsg("user", q);
      const typing = addTyping();
      const ans = await sendChat(q);
      if (typing) typing.remove();
      addMsg("assistant", ans || "No answer.");
    } catch (e) {
      addMsg("assistant", "Error: " + (e.message || "chat error"));
    }
  }

  // Delegated clicks inside menu panel
  async function onMenuClick(e) {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.getAttribute("data-action");
    if (!action) return;

    if (action === "ask-section") {
      const hbTitle = btn.getAttribute("data-hbtitle") || "Handbook";
      const secTitle = btn.getAttribute("data-sectitle") || "Section";
      const hbId = btn.getAttribute("data-hbid") || "";
      const secKey = btn.getAttribute("data-seckey") || "";

      closeMenuPanel();

      // If admin, they can't ask in chat (by your rules)
      if (!(state.role === ROLES.staff || state.role === ROLES.parent)) {
        toast("To ask in chat, login with Staff or Parent code.");
        return;
      }

      const prompt = `For campus ${state.campus}, based on "${hbTitle}" section "${secTitle}", answer this question: `;
      if (elChatInput) {
        elChatInput.value = prompt;
        elChatInput.focus();
      }
      return;
    }

    if (action === "ask-item") {
      closeMenuPanel();

      if (!(state.role === ROLES.staff || state.role === ROLES.parent)) {
        toast("To ask in chat, login with Staff or Parent code.");
        return;
      }

      const kind = btn.getAttribute("data-kind") || "item";
      const title = btn.getAttribute("data-title") || "";
      const prompt = `For campus ${state.campus}, regarding the ${kind} "${title}", answer this question: `;

      if (elChatInput) {
        elChatInput.value = prompt;
        elChatInput.focus();
      }
      return;
    }
  }

  function wireEvents() {
    // Login button (try several)
    if (elBtnLogin) elBtnLogin.addEventListener("click", (e) => { e.preventDefault(); onLoginClick(); });

    // Enter key for login
    if (elAccessCode) {
      elAccessCode.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onLoginClick();
      });
    }

    // Admin top button
    if (elBtnAdminTop) elBtnAdminTop.addEventListener("click", (e) => { e.preventDefault(); openAdminModal(); });

    // Logout
    if (elBtnLogout) elBtnLogout.addEventListener("click", (e) => { e.preventDefault(); logout(); });

    // Campus switch (header)
    if (elHeaderCampus) elHeaderCampus.addEventListener("change", (e) => onCampusSwitch(e.target.value));

    // Menu pills
    if (elMenuHandbook) elMenuHandbook.addEventListener("click", (e) => { e.preventDefault(); showHandbooksMenu(); });
    if (elMenuPolicies) elMenuPolicies.addEventListener("click", (e) => { e.preventDefault(); showPoliciesMenu(); });
    if (elMenuProtocols) elMenuProtocols.addEventListener("click", (e) => { e.preventDefault(); showProtocolsMenu(); });

    // Menu close
    if (elMenuClose) elMenuClose.addEventListener("click", closeMenuPanel);
    if (elOverlay) elOverlay.addEventListener("click", closeMenuPanel);

    // Menu panel delegated
    if (elMenuPanelBody) elMenuPanelBody.addEventListener("click", onMenuClick);

    // Chat send
    if (elChatSend) elChatSend.addEventListener("click", (e) => { e.preventDefault(); onAskClick(); });
    if (elChatInput) {
      elChatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onAskClick();
        }
      });
    }
  }

  /* -------------------- INIT -------------------- */

  function initFromStorage() {
    state.role = getRole();
    state.campus = getCampus();
    state.token = getToken();
    state.adminToken = getAdminToken();
  }

  function sanityCheckApiBase() {
    // If you are on pages.dev and API_BASE is empty, login will call pages.dev/auth/login (wrong).
    if (!API_BASE) {
      console.warn("[CMS] API_BASE is empty. If your API is on workers.dev, set window.CMS_CONFIG.API_BASE in index.html.");
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    initFromStorage();
    sanityCheckApiBase();

    // Ensure selects have blank + campus list
    ensureInputsPrivacy();
    ensureCampusOptions(elCampusLogin);
    ensureCampusOptions(elHeaderCampus);

    // Keep stored campus, but login campus default can be blank if none stored
    if (!state.campus) {
      if (elCampusLogin) elCampusLogin.value = "";
      if (elHeaderCampus) elHeaderCampus.value = "";
    } else {
      renderCampusControls();
    }

    applyAllUI();
    wireEvents();

    // If already logged in, open appropriate default menu
    if (state.role === ROLES.parent) {
      setActiveMenu("handbook");
    } else if (state.role === ROLES.staff) {
      setActiveMenu("policies");
    } else if (state.role === ROLES.admin) {
      setActiveMenu("handbook");
    }

    // Optional: auto-open menu on load if logged in
    if (state.role === ROLES.parent || state.role === ROLES.admin) {
      try { await showHandbooksMenu(); } catch {}
    } else if (state.role === ROLES.staff) {
      try { await showPoliciesMenu(); } catch {}
    }
  });
})();