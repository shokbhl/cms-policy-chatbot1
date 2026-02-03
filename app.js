/* =========================
   CMS Chatbot - app.js
   - Parent Portal disabled everywhere
   - Staff: Policies + Protocols + Handbook
   - Parent: Handbook only
   - Admin: Policies + Protocols + Handbook + admin links
   ========================= */

(() => {
  // -------------------------
  // Config
  // -------------------------
  const API_BASE = ""; // same origin
  const STORAGE_KEY = "cms_chat_session_v3";

  // -------------------------
  // DOM
  // -------------------------
  const $ = (id) => document.getElementById(id);

  const el = {
    // screens
    loginScreen: $("login-screen"),
    chatScreen: $("chat-screen"),

    // header/menu
    headerActions: $("header-actions"),
    topMenuBar: $("top-menu-bar"),
    adminLinks: $("admin-links"),

    campusSwitch: $("campus-switch"),
    modeBadge: $("mode-badge"),
    adminModeBtn: $("admin-mode-btn"),
    logoutBtn: $("logout-btn"),

    // login form
    loginForm: $("login-form"),
    accessCode: $("access-code"),
    campusSelect: $("campus-select"),
    loginError: $("login-error"),
    adminLoginBtn: $("admin-mode-btn-login"), // login screen admin button

    // admin modal
    adminModal: $("admin-modal"),
    adminPin: $("admin-pin"),
    adminPinCancel: $("admin-pin-cancel"),
    adminPinSubmit: $("admin-pin-submit"),

    // menu panel (modal panel)
    menuOverlay: $("menu-overlay"),
    menuPanel: $("menu-panel"),
    menuPanelTitle: $("menu-panel-title"),
    menuPanelBody: $("menu-panel-body"),
    menuPanelClose: $("menu-panel-close"),

    // chat
    chatWindow: $("chat-window"),
    chatForm: $("chat-form"),
    userInput: $("user-input"),
  };

  // -------------------------
  // State
  // -------------------------
  const state = {
    token: "",
    role: "", // "parent" | "staff" | "admin"
    campus: "",
  };

  // -------------------------
  // Utilities
  // -------------------------
  function setHidden(node, hidden) {
    if (!node) return;
    node.classList.toggle("hidden", !!hidden);
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function saveSession() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        token: state.token,
        role: state.role,
        campus: state.campus,
      })
    );
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data?.token || !data?.role) return false;
      state.token = data.token;
      state.role = data.role;
      state.campus = data.campus || "";
      return true;
    } catch {
      return false;
    }
  }

  function clearSession() {
    state.token = "";
    state.role = "";
    state.campus = "";
    localStorage.removeItem(STORAGE_KEY);
  }

  function authHeaders() {
    return state.token ? { Authorization: `Bearer ${state.token}` } : {};
  }

  async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        ...authHeaders(),
      },
    });

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : await res.text();

    if (!res.ok) {
      const msg =
        (data && data.error) ||
        (data && data.message) ||
        `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function setModeBadge(role) {
    if (!el.modeBadge) return;
    el.modeBadge.textContent = String(role || "").toUpperCase();
  }

  function clearChatWindow() {
    if (!el.chatWindow) return;
    el.chatWindow.innerHTML = "";
  }

  function showLoginUI() {
    setHidden(el.loginScreen, false);
    setHidden(el.chatScreen, true);
    setHidden(el.headerActions, true);
    setHidden(el.topMenuBar, true);
    setHidden(el.adminLinks, true);
    closeMenuPanel();
    clearChatWindow();
    setLoginError("");
  }

  function showChatUI() {
    setHidden(el.loginScreen, true);
    setHidden(el.chatScreen, false);
    setHidden(el.headerActions, false);
    setHidden(el.topMenuBar, false);

    // admin links only for admin
    setHidden(el.adminLinks, state.role !== "admin");

    if (el.campusSwitch) el.campusSwitch.value = state.campus || "";
    if (el.campusSelect) el.campusSelect.value = state.campus || "";

    setModeBadge(state.role);
    applyRoleMenuVisibility();
  }

  function applyRoleMenuVisibility() {
    const menuBar = el.topMenuBar;
    if (!menuBar) return;

    const buttons = menuBar.querySelectorAll(".menu-pill[data-menu]");
    buttons.forEach((btn) => {
      const key = btn.getAttribute("data-menu");
      const allowed = isMenuAllowedForRole(key, state.role);
      btn.classList.toggle("hidden", !allowed);
      btn.setAttribute("aria-hidden", allowed ? "false" : "true");
    });

    setHidden(el.adminLinks, state.role !== "admin");
  }

  function isMenuAllowedForRole(menuKey, role) {
    // Parent portal menus disabled entirely
    const disabled = new Set([
      "announcements",
      "eca",
      "calendar",
      "parent_interview",
      "tuition",
      "uniform",
      "daily_schedule",
      "age_info",
      "forms",
      "support",
    ]);
    if (disabled.has(menuKey)) return false;

    if (role === "parent") return menuKey === "handbook";
    if (role === "staff") return ["policies", "protocols", "handbook"].includes(menuKey);
    if (role === "admin") return ["policies", "protocols", "handbook"].includes(menuKey);
    return false;
  }

  // -------------------------
  // Menu Panel
  // -------------------------
  function openMenuPanel(title, html) {
    if (el.menuPanelTitle) el.menuPanelTitle.textContent = title || "Menu";
    if (el.menuPanelBody) el.menuPanelBody.innerHTML = html || "";
    setHidden(el.menuOverlay, false);
    setHidden(el.menuPanel, false);
  }

  function closeMenuPanel() {
    setHidden(el.menuOverlay, true);
    setHidden(el.menuPanel, true);
    if (el.menuPanelBody) el.menuPanelBody.innerHTML = "";
  }

  // -------------------------
  // Chat UI helpers
  // -------------------------
  function addChatBubble(who, text) {
    if (!el.chatWindow) return;

    const isUser = who === "user";
    const div = document.createElement("div");
    div.className = `chat-bubble ${isUser ? "user" : "assistant"}`;
    div.innerHTML = escapeHtml(text);

    el.chatWindow.appendChild(div);
    el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
  }

  function addSystemNote(text) {
    if (!el.chatWindow) return;
    const div = document.createElement("div");
    div.className = "chat-note";
    div.innerHTML = escapeHtml(text);
    el.chatWindow.appendChild(div);
    el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
  }

  // -------------------------
  // Admin Modal
  // -------------------------
  function openAdminModal() {
    setHidden(el.adminModal, false);
    if (el.adminPin) {
      el.adminPin.value = "";
      el.adminPin.focus();
    }
  }

  function closeAdminModal() {
    setHidden(el.adminModal, true);
  }

  // -------------------------
  // Login
  // -------------------------
  function setLoginError(msg) {
    if (!el.loginError) return;
    el.loginError.textContent = msg || "";
  }

  function getSelectedCampus() {
    const c1 = el.campusSelect?.value || "";
    const c2 = el.campusSwitch?.value || "";
    return (c1 || c2 || "").trim().toUpperCase();
  }

  async function loginStaffOrParent() {
    setLoginError("");
    const code = (el.accessCode?.value || "").trim();
    const campus = getSelectedCampus();

    if (!code) return setLoginError("Please enter access code.");
    if (!campus) return setLoginError("Please select a campus.");

    // try staff then parent
    try {
      const staffRes = await apiFetch("/auth/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      state.token = staffRes.token;
      state.role = "staff";
      state.campus = campus;
      saveSession();
      showChatUI();
      addSystemNote(`Signed in as Staff. Campus: ${state.campus}`);
      return;
    } catch {
      // continue
    }

    try {
      const parentRes = await apiFetch("/auth/parent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      state.token = parentRes.token;
      state.role = "parent";
      state.campus = campus;
      saveSession();
      showChatUI();
      addSystemNote(`Signed in as Parent. Campus: ${state.campus}`);
      return;
    } catch {
      setLoginError("Invalid access code.");
    }
  }

  async function loginAdminWithPin() {
    setLoginError("");
    const campus = getSelectedCampus();
    if (!campus) return setLoginError("Please select a campus.");

    const pin = (el.adminPin?.value || "").trim();
    if (!pin) return;

    try {
      const res = await apiFetch("/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      state.token = res.token;
      state.role = "admin";
      state.campus = campus;
      saveSession();

      closeAdminModal();
      showChatUI();
      addSystemNote(`Signed in as Admin. Campus: ${state.campus}`);
    } catch (err) {
      setLoginError("Invalid admin PIN.");
    }
  }

  function logout() {
    clearSession();
    showLoginUI();
  }

  // -------------------------
  // Menu loaders
  // -------------------------
  async function openPolicies() {
    openMenuPanel("Policies", `<div class="muted">Loading policies…</div>`);
    try {
      const data = await apiFetch("/policies", { method: "GET" });
      const items = Array.isArray(data?.policies) ? data.policies : Array.isArray(data) ? data : [];

      if (!items.length) {
        openMenuPanel("Policies", `<div class="muted">No policies found.</div>`);
        return;
      }

      const html = `
        <div class="menu-hint muted">Browse the list. Ask questions in chat.</div>
        <ul class="menu-list">
          ${items.map((p, idx) => {
            const title = escapeHtml(p?.title || p?.name || `Policy ${idx + 1}`);
            const desc = escapeHtml(p?.summary || p?.description || "");
            const link = p?.link ? `<a class="menu-link" href="${escapeHtml(p.link)}" target="_blank" rel="noopener">Open</a>` : "";
            return `
              <li class="menu-item">
                <div class="menu-item-title">${title}</div>
                ${desc ? `<div class="menu-item-desc muted">${desc}</div>` : ""}
                ${link ? `<div class="menu-item-actions">${link}</div>` : ""}
              </li>`;
          }).join("")}
        </ul>
      `;
      openMenuPanel("Policies", html);
    } catch (err) {
      openMenuPanel("Policies", `<div class="error-text">Failed: ${escapeHtml(err.message)}</div>`);
    }
  }

  async function openProtocols() {
    openMenuPanel("Protocols", `<div class="muted">Loading protocols…</div>`);
    try {
      const data = await apiFetch("/protocols", { method: "GET" });
      const items = Array.isArray(data?.protocols) ? data.protocols : Array.isArray(data) ? data : [];

      if (!items.length) {
        openMenuPanel("Protocols", `<div class="muted">No protocols found.</div>`);
        return;
      }

      const html = `
        <div class="menu-hint muted">Browse the list. Ask questions in chat.</div>
        <ul class="menu-list">
          ${items.map((p, idx) => {
            const title = escapeHtml(p?.title || p?.name || `Protocol ${idx + 1}`);
            const desc = escapeHtml(p?.summary || p?.description || "");
            const link = p?.link ? `<a class="menu-link" href="${escapeHtml(p.link)}" target="_blank" rel="noopener">Open</a>` : "";
            return `
              <li class="menu-item">
                <div class="menu-item-title">${title}</div>
                ${desc ? `<div class="menu-item-desc muted">${desc}</div>` : ""}
                ${link ? `<div class="menu-item-actions">${link}</div>` : ""}
              </li>`;
          }).join("")}
        </ul>
      `;
      openMenuPanel("Protocols", html);
    } catch (err) {
      openMenuPanel("Protocols", `<div class="error-text">Failed: ${escapeHtml(err.message)}</div>`);
    }
  }

  async function openHandbook() {
    const campus = state.campus || getSelectedCampus();
    if (!campus) {
      openMenuPanel("Parent Handbook", `<div class="muted">Please select a campus.</div>`);
      return;
    }

    openMenuPanel("Parent Handbook", `<div class="muted">Loading handbook…</div>`);

    try {
      const list = await apiFetch(`/handbooks?campus=${encodeURIComponent(campus)}`, { method: "GET" });
      const handbooks = Array.isArray(list?.handbooks) ? list.handbooks : [];

      if (!handbooks.length) {
        openMenuPanel("Parent Handbook", `<div class="muted">No handbook found for ${escapeHtml(campus)}.</div>`);
        return;
      }

      const html = `
        <div class="menu-hint muted">Select a section to view. Ask questions in chat.</div>
        <div class="handbook-list">
          ${handbooks.map((hb) => {
            const hbTitle = escapeHtml(hb?.title || "Parent Handbook");
            const hbId = escapeHtml(hb?.id || "");
            const program = hb?.program ? `<div class="muted">Program: ${escapeHtml(hb.program)}</div>` : "";
            const link = hb?.link ? `<a class="menu-link" href="${escapeHtml(hb.link)}" target="_blank" rel="noopener">Open file</a>` : "";

            const sections = Array.isArray(hb?.sections) ? hb.sections : [];
            const secHtml = sections.length ? `
              <ul class="menu-list">
                ${sections.map((s) => {
                  const key = escapeHtml(s?.key || "");
                  const title = escapeHtml(s?.title || key || "Section");
                  return `
                    <li class="menu-item">
                      <button class="menu-action" data-hb-id="${hbId}" data-sec-key="${key}" type="button">${title}</button>
                    </li>`;
                }).join("")}
              </ul>` : `<div class="muted">No sections listed.</div>`;

            return `
              <div class="handbook-card">
                <div class="menu-item-title">${hbTitle}</div>
                ${program}
                ${link ? `<div class="menu-item-actions">${link}</div>` : ""}
                <div class="handbook-sections">${secHtml}</div>
              </div>`;
          }).join("")}
        </div>
      `;

      openMenuPanel("Parent Handbook", html);

      if (el.menuPanelBody) {
        el.menuPanelBody.querySelectorAll("button.menu-action[data-hb-id][data-sec-key]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const hbId = btn.getAttribute("data-hb-id") || "";
            const secKey = btn.getAttribute("data-sec-key") || "";
            await openHandbookSection(campus, hbId, secKey);
          });
        });
      }
    } catch (err) {
      openMenuPanel("Parent Handbook", `<div class="error-text">Failed: ${escapeHtml(err.message)}</div>`);
    }
  }

  async function openHandbookSection(campus, hbId, sectionKey) {
    openMenuPanel("Parent Handbook", `<div class="muted">Loading section…</div>`);
    try {
      const data = await apiFetch(
        `/handbooks?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(hbId)}&section=${encodeURIComponent(sectionKey)}`,
        { method: "GET" }
      );

      const hbTitle = escapeHtml(data?.handbook?.title || "Parent Handbook");
      const secTitle = escapeHtml(data?.section?.title || sectionKey || "Section");
      const content = escapeHtml(data?.section?.content || "");

      const html = `
        <div class="menu-item-title">${hbTitle}</div>
        <div class="muted">${secTitle}</div>
        <hr/>
        <div class="menu-pre">${content || "<span class='muted'>No content.</span>"}</div>
        <hr/>
        <div class="menu-hint muted">Tip: Ask questions in chat about this section.</div>
      `;

      openMenuPanel("Parent Handbook", html);
    } catch (err) {
      openMenuPanel("Parent Handbook", `<div class="error-text">Failed: ${escapeHtml(err.message)}</div>`);
    }
  }

  // -------------------------
  // Chat -> /api
  // -------------------------
  async function sendChat(query) {
    const campus = state.campus || getSelectedCampus();
    if (!campus) {
      addSystemNote("Please select a campus.");
      return;
    }

    addChatBubble("user", query);

    try {
      const res = await apiFetch("/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, campus }),
      });

      addChatBubble("assistant", res?.answer || "—");

      const src = res?.source;
      if (src?.title) addSystemNote(`Source: ${src.title}`);
    } catch (err) {
      addChatBubble("assistant", `Error: ${err.message}`);
    }
  }

  // -------------------------
  // Wire events
  // -------------------------
  function wireUI() {
    if (el.loginForm) {
      el.loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        loginStaffOrParent();
      });
    }

    if (el.logoutBtn) el.logoutBtn.addEventListener("click", logout);

    if (el.campusSwitch) {
      el.campusSwitch.addEventListener("change", () => {
        state.campus = (el.campusSwitch.value || "").toUpperCase();
        saveSession();
      });
    }

    if (el.menuOverlay) el.menuOverlay.addEventListener("click", closeMenuPanel);
    if (el.menuPanelClose) el.menuPanelClose.addEventListener("click", closeMenuPanel);

    if (el.topMenuBar) {
      el.topMenuBar.addEventListener("click", async (e) => {
        const btn = e.target.closest(".menu-pill[data-menu]");
        if (!btn) return;
        const key = btn.getAttribute("data-menu");
        if (!isMenuAllowedForRole(key, state.role)) return;

        if (key === "policies") return openPolicies();
        if (key === "protocols") return openProtocols();
        if (key === "handbook") return openHandbook();
      });
    }

    if (el.adminModeBtn) el.adminModeBtn.addEventListener("click", openAdminModal);
    if (el.adminLoginBtn) el.adminLoginBtn.addEventListener("click", openAdminModal);

    if (el.adminPinCancel) el.adminPinCancel.addEventListener("click", closeAdminModal);
    if (el.adminPinSubmit) el.adminPinSubmit.addEventListener("click", loginAdminWithPin);

    if (el.adminPin) {
      el.adminPin.addEventListener("keydown", (e) => {
        if (e.key === "Enter") loginAdminWithPin();
        if (e.key === "Escape") closeAdminModal();
      });
    }

    if (el.chatForm) {
      el.chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = (el.userInput?.value || "").trim();
        if (!q) return;
        el.userInput.value = "";
        sendChat(q);
      });
    }
  }

  // -------------------------
  // Init
  // -------------------------
  function init() {
    wireUI();
    showLoginUI();

    const ok = loadSession(); // ✅ FIX: تعریف ok
    if (ok) {
      if (!state.campus) state.campus = getSelectedCampus();
      showChatUI();
      addSystemNote(`Welcome back. Signed in as ${state.role}. Campus: ${state.campus || "—"}`);
    }
  }

  init();
})();