/* =========================================================
   CMS Assistant - app.js (FULL FEATURE)
   - Staff/Parent/Admin login from first screen
   - Campus required (blank default)
   - Parent: only Parent Handbook menu
   - Staff/Admin: Policies + Protocols + Parent Handbook
   - Handbook list per campus + sections clickable
   - Admin mode badge + admin links (Dashboard/Logs)
   - Campus switch inside app + "Campus switched" message
   - Fixes:
     * Access code hidden (password)
     * Logo path + fallback
     * Admin button opens Admin PIN modal + login
========================================================= */

(() => {
  // -------------------------------
  // Config (adjust only if needed)
  // -------------------------------
  const API_BASE = ""; // keep "" if you use Pages Functions proxy (recommended)
  // If you directly call the Worker, set e.g.:
  // const API_BASE = "https://cms-policy-worker.shokbhl.workers.dev";

  const STORAGE = {
    role: "cms_role",
    campus: "cms_campus",
    token: "cms_token",          // staff/parent session token
    adminToken: "cms_admin_token"// admin session token (for /admin/*)
  };

  const CAMPUSES = ["MC", "SC", "TC", "WC", "YC"];

  // -------------------------------
  // Helpers
  // -------------------------------
  const $ = (id) => document.getElementById(id);
  const firstEl = (...ids) => ids.map($).find(Boolean) || null;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "22px";
    el.style.transform = "translateX(-50%)";
    el.style.background = "rgba(17,24,39,.92)";
    el.style.color = "#fff";
    el.style.padding = "10px 14px";
    el.style.borderRadius = "999px";
    el.style.fontWeight = "800";
    el.style.zIndex = "9999";
    el.style.boxShadow = "0 10px 24px rgba(0,0,0,.18)";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", !!hidden);
  }

  function apiFetch(path, options = {}) {
    const url = `${API_BASE}${path}`;
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
  }

  function getCampus() {
    return (localStorage.getItem(STORAGE.campus) || "").toUpperCase();
  }
  function setCampus(c) {
    localStorage.setItem(STORAGE.campus, (c || "").toUpperCase());
  }
  function getRole() {
    return (localStorage.getItem(STORAGE.role) || "").toLowerCase();
  }
  function setRole(r) {
    localStorage.setItem(STORAGE.role, (r || "").toLowerCase());
  }
  function getToken() {
    return localStorage.getItem(STORAGE.token) || "";
  }
  function setToken(t) {
    localStorage.setItem(STORAGE.token, t || "");
  }
  function getAdminToken() {
    return localStorage.getItem(STORAGE.adminToken) || "";
  }
  function setAdminToken(t) {
    localStorage.setItem(STORAGE.adminToken, t || "");
  }

  function isAdmin() {
    return getRole() === "admin";
  }
  function isStaff() {
    return getRole() === "staff";
  }
  function isParent() {
    return getRole() === "parent";
  }
  function authed() {
    return !!getToken() && !!getRole() && !!getCampus();
  }

  function normalizeCampusSelect(selectEl, allowBlank = true) {
    if (!selectEl) return;
    // Ensure options exist
    const existing = Array.from(selectEl.options || []).map(o => o.value);
    if (existing.length <= 1) {
      selectEl.innerHTML = "";
      if (allowBlank) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Select campus";
        selectEl.appendChild(opt);
      }
      for (const c of CAMPUSES) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        selectEl.appendChild(opt);
      }
    }
  }

  // -------------------------------
  // DOM (support multiple id names)
  // -------------------------------
  const els = {
    // Brand / header
    brandLogo: firstEl("brandLogo", "logoImg", "cmsLogo"),
    modeBadge: firstEl("modeBadge", "roleBadge"),
    campusSwitch: firstEl("campusSwitch", "campusSwitcher", "headerCampusSelect"),
    logoutBtn: firstEl("logoutBtn", "btnLogout"),

    // Screens
    loginScreen: firstEl("loginScreen", "screenLogin"),
    appScreen: firstEl("appScreen", "screenApp"),

    // Login form
    accessCode: firstEl("accessCode", "codeInput", "accessInput"),
    campusSelect: firstEl("campusSelect", "loginCampus", "campusSelectLogin"),
    loginBtn: firstEl("loginBtn", "btnLogin"),
    adminBtn: firstEl("adminBtn", "btnAdmin"),

    loginError: firstEl("loginError", "errorText"),

    // Admin modal
    adminModal: firstEl("adminModal", "modalAdmin"),
    adminPin: firstEl("adminPin", "adminPinInput"),
    adminLoginBtn: firstEl("adminLoginBtn", "btnAdminLogin"),
    adminCancelBtn: firstEl("adminCancelBtn", "btnAdminCancel"),

    // Top menu
    topMenuBar: firstEl("topMenuBar", "menuBar"),
    menuPolicies: firstEl("menuPolicies", "btnPolicies"),
    menuProtocols: firstEl("menuProtocols", "btnProtocols"),
    menuHandbooks: firstEl("menuHandbooks", "btnHandbooks"),

    // Menu panel modal
    overlay: firstEl("overlay", "menuOverlay"),
    menuPanel: firstEl("menuPanel", "panelMenu"),
    menuTitle: firstEl("menuTitle", "panelTitle"),
    menuBody: firstEl("menuBody", "panelBody"),
    menuClose: firstEl("menuClose", "panelClose"),

    // Admin links container
    adminLinks: firstEl("adminLinks"),
    dashboardLink: firstEl("dashboardLink"),
    logsLink: firstEl("logsLink"),

    // Chat
    chatWindow: firstEl("chatWindow", "chatMessages"),
    chatInput: firstEl("chatInput", "questionInput"),
    chatSend: firstEl("chatSend", "sendBtn"),
    chatHint: firstEl("chatHint", "chatTopHint")
  };

  // -------------------------------
  // UI: Logo fix + access input hide
  // -------------------------------
  function setupLogo() {
    if (!els.brandLogo) return;
    // Your real file exists: assets/cms-logo.png
    const candidates = [
      "assets/cms-logo.png",
      "assets/icons/cms-192.png",
      "favicon-48.png",
      "favicon-32.png"
    ];
    let idx = 0;
    const tryNext = () => {
      idx++;
      if (idx < candidates.length) {
        els.brandLogo.src = candidates[idx];
      }
    };
    els.brandLogo.onerror = tryNext;
    els.brandLogo.src = candidates[0];
  }

  function setupAccessCodeInput() {
    if (!els.accessCode) return;
    // Hide code while typing
    els.accessCode.type = "password";
    els.accessCode.autocomplete = "off";
    els.accessCode.autocapitalize = "off";
    els.accessCode.spellcheck = false;
  }

  function setLoginError(msg) {
    if (!els.loginError) return;
    els.loginError.textContent = msg || "";
  }

  function showScreen(which) {
    // which: "login" | "app"
    setHidden(els.loginScreen, which !== "login");
    setHidden(els.appScreen, which !== "app");
  }

  function updateBadgesAndMenus() {
    const role = getRole();
    const campus = getCampus();

    if (els.modeBadge) {
      els.modeBadge.textContent = role ? role.toUpperCase() : "";
      els.modeBadge.classList.remove("staff", "parent", "admin");
      if (role) els.modeBadge.classList.add(role);
      setHidden(els.modeBadge, !role);
    }

    // Campus switch in header (only after login)
    if (els.campusSwitch) {
      normalizeCampusSelect(els.campusSwitch, false);
      els.campusSwitch.value = campus || CAMPUSES[0];
      setHidden(els.campusSwitch, !authed());
    }

    // Top menu visible only after login
    setHidden(els.topMenuBar, !authed());

    // Admin links only for admin
    if (els.adminLinks) setHidden(els.adminLinks, !isAdmin());
    if (els.dashboardLink) setHidden(els.dashboardLink, !isAdmin());
    if (els.logsLink) setHidden(els.logsLink, !isAdmin());

    // Menu pills per role
    if (els.menuPolicies) setHidden(els.menuPolicies, !(isStaff() || isAdmin()));
    if (els.menuProtocols) setHidden(els.menuProtocols, !(isStaff() || isAdmin()));
    if (els.menuHandbooks) setHidden(els.menuHandbooks, !(isParent() || isStaff() || isAdmin()));

    // Logout
    if (els.logoutBtn) setHidden(els.logoutBtn, !authed());

    // Chat hint
    if (els.chatHint && authed()) {
      els.chatHint.textContent = `You are logged in as ${role.toUpperCase()} • Campus ${campus}`;
    }
  }

  // -------------------------------
  // Menu panel modal
  // -------------------------------
  function closeMenuPanel() {
    setHidden(els.overlay, true);
    setHidden(els.menuPanel, true);
    if (els.menuTitle) els.menuTitle.textContent = "";
    if (els.menuBody) els.menuBody.innerHTML = "";
  }

  function openMenuPanel(title) {
    if (els.menuTitle) els.menuTitle.textContent = title || "";
    setHidden(els.overlay, false);
    setHidden(els.menuPanel, false);
  }

  // -------------------------------
  // Admin modal
  // -------------------------------
  function openAdminModal() {
    if (!els.adminModal) return;
    setHidden(els.adminModal, false);
    if (els.adminPin) {
      els.adminPin.value = "";
      els.adminPin.type = "password";
      els.adminPin.focus();
    }
  }
  function closeAdminModal() {
    if (!els.adminModal) return;
    setHidden(els.adminModal, true);
  }

  // -------------------------------
  // Backend calls (you can keep same Worker)
  // -------------------------------
  async function loginStaffOrParent(code, campus) {
    // Expected worker endpoint: POST /auth/login
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ code, campus })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Login failed");
    }
    // data: {ok:true, role:"staff"|"parent", token:"..."}
    return data;
  }

  async function loginAdmin(pin) {
    // Expected worker endpoint: POST /admin/login
    const res = await apiFetch("/admin/login", {
      method: "POST",
      body: JSON.stringify({ pin })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "Admin login failed");
    }
    // data: {ok:true, role:"admin", token:"ADMIN_TOKEN"}
    return data;
  }

  async function fetchPolicies(campus) {
    // Expected: GET /policies?campus=YC  (or ignore campus server-side)
    const res = await apiFetch(`/policies?campus=${encodeURIComponent(campus)}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Policies load failed");
    return data; // { items:[{id,title,content,keywords,link?...}] } OR {policies:[...]}
  }

  async function fetchProtocols(campus) {
    const res = await apiFetch(`/protocols?campus=${encodeURIComponent(campus)}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Protocols load failed");
    return data;
  }

  async function fetchHandbooks(campus) {
    // Your KV keys are handbook_YC etc. Server should map by campus.
    const res = await apiFetch(`/handbooks?campus=${encodeURIComponent(campus)}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Handbooks load failed");
    return data; // { handbooks:[...] } or {items:[...]}
  }

  async function chatAsk(question, campus) {
    const res = await apiFetch(`/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ question, campus, role: getRole() })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(data?.error || "Chat failed");
    // data: {ok:true, answer:"...", handbook?:{...}, ms?:123}
    return data;
  }

  // -------------------------------
  // Renderers
  // -------------------------------
  function renderMessage(kind, text) {
    if (!els.chatWindow) return;
    const div = document.createElement("div");
    div.className = `msg ${kind}`;
    div.innerHTML = escapeHtml(text);
    els.chatWindow.appendChild(div);
    els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
  }

  function renderTyping(on) {
    if (!els.chatWindow) return;
    const existing = els.chatWindow.querySelector(".typing-bubble");
    if (!on) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const bub = document.createElement("div");
    bub.className = "typing-bubble";
    bub.innerHTML = `
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <div style="font-weight:800;color:#6b7280;">Typing…</div>
    `;
    els.chatWindow.appendChild(bub);
    els.chatWindow.scrollTop = els.chatWindow.scrollHeight;
  }

  function getItemsFromData(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.policies)) return data.policies;
    if (Array.isArray(data.protocols)) return data.protocols;
    if (Array.isArray(data.handbooks)) return data.handbooks;
    return [];
  }

  function renderListAsButtons(items, onClick) {
    if (!els.menuBody) return;
    els.menuBody.innerHTML = "";
    if (!items.length) {
      els.menuBody.innerHTML = `<div class="muted" style="font-weight:800;">No items found.</div>`;
      return;
    }
    for (const it of items) {
      const btn = document.createElement("button");
      btn.className = "menu-item-btn";
      btn.type = "button";
      btn.innerHTML = `<b>${escapeHtml(it.title || it.name || it.id || "Untitled")}</b>`;
      btn.addEventListener("click", () => onClick(it));
      els.menuBody.appendChild(btn);
    }
  }

  function renderHandbookCardList(handbooks) {
    if (!els.menuBody) return;
    els.menuBody.innerHTML = "";

    if (!handbooks.length) {
      els.menuBody.innerHTML = `<div class="muted" style="font-weight:800;">No handbooks found for this campus.</div>`;
      return;
    }

    for (const hb of handbooks) {
      const card = document.createElement("div");
      card.className = "hb-card";

      const title = document.createElement("div");
      title.className = "hb-title";
      title.textContent = hb.title || hb.id || "Handbook";

      const meta = document.createElement("div");
      meta.className = "hb-meta";
      meta.textContent = [hb.campus, hb.program, hb.type].filter(Boolean).join(" • ");

      card.appendChild(title);
      card.appendChild(meta);

      if (hb.link) {
        const a = document.createElement("a");
        a.className = "hb-open-link";
        a.href = hb.link;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "Open official link";
        card.appendChild(a);
      }

      // Sections
      const sections = Array.isArray(hb.sections) ? hb.sections : [];
      if (sections.length) {
        for (const s of sections) {
          const sb = document.createElement("button");
          sb.type = "button";
          sb.className = "hb-section-btn";
          sb.textContent = s.title || s.key || "Section";
          sb.addEventListener("click", () => {
            // show section content (if empty show placeholder)
            const content = (s.content || "").trim();
            openMenuPanel(`${hb.title || hb.id} • ${s.title || s.key}`);
            if (!els.menuBody) return;

            const back = document.createElement("button");
            back.type = "button";
            back.className = "secondary-btn";
            back.textContent = "← Back";
            back.addEventListener("click", async () => {
              // go back to handbook list
              openMenuPanel("Parent Handbooks");
              renderHandbookCardList(handbooks);
            });

            const body = document.createElement("div");
            body.style.marginTop = "10px";
            body.style.whiteSpace = "pre-wrap";
            body.style.lineHeight = "1.55";
            body.style.fontWeight = "650";
            body.style.color = "#111827";
            body.textContent = content || "No content added yet for this section.";

            els.menuBody.innerHTML = "";
            els.menuBody.appendChild(back);
            els.menuBody.appendChild(body);

            if (hb.link) {
              const link = document.createElement("a");
              link.className = "hb-open-link";
              link.href = hb.link;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.textContent = "Open official link";
              els.menuBody.appendChild(link);
            }
          });
          card.appendChild(sb);
        }
      }

      els.menuBody.appendChild(card);
    }
  }

  // -------------------------------
  // Menu actions
  // -------------------------------
  async function openPolicies() {
    const campus = getCampus();
    openMenuPanel("Policies");
    if (els.menuBody) els.menuBody.innerHTML = `<div class="muted" style="font-weight:800;">Loading…</div>`;
    const data = await fetchPolicies(campus);
    const items = getItemsFromData(data);

    renderListAsButtons(items, (it) => {
      openMenuPanel(it.title || "Policy");
      if (!els.menuBody) return;
      const content = (it.content || it.text || "").trim();
      els.menuBody.innerHTML = `
        <div style="font-weight:900;color:#111827;margin-bottom:10px;">${escapeHtml(it.title || "")}</div>
        ${it.link ? `<a class="hb-open-link" href="${escapeHtml(it.link)}" target="_blank" rel="noopener noreferrer">Open official link</a>` : ""}
        <div style="white-space:pre-wrap;line-height:1.55;font-weight:650;">${escapeHtml(content || "No content yet.")}</div>
      `;
    });
  }

  async function openProtocols() {
    const campus = getCampus();
    openMenuPanel("Protocols");
    if (els.menuBody) els.menuBody.innerHTML = `<div class="muted" style="font-weight:800;">Loading…</div>`;
    const data = await fetchProtocols(campus);
    const items = getItemsFromData(data);

    renderListAsButtons(items, (it) => {
      openMenuPanel(it.title || "Protocol");
      if (!els.menuBody) return;
      const content = (it.content || it.text || "").trim();
      els.menuBody.innerHTML = `
        <div style="font-weight:900;color:#111827;margin-bottom:10px;">${escapeHtml(it.title || "")}</div>
        ${it.link ? `<a class="hb-open-link" href="${escapeHtml(it.link)}" target="_blank" rel="noopener noreferrer">Open official link</a>` : ""}
        <div style="white-space:pre-wrap;line-height:1.55;font-weight:650;">${escapeHtml(content || "No content yet.")}</div>
      `;
    });
  }

  async function openHandbooks() {
    const campus = getCampus();
    openMenuPanel("Parent Handbooks");
    if (els.menuBody) els.menuBody.innerHTML = `<div class="muted" style="font-weight:800;">Loading…</div>`;
    const data = await fetchHandbooks(campus);
    const handbooks = getItemsFromData(data);
    renderHandbookCardList(handbooks);
  }

  // -------------------------------
  // Login flows
  // -------------------------------
  async function handleLogin() {
    setLoginError("");

    const code = (els.accessCode?.value || "").trim();
    const campus = (els.campusSelect?.value || "").trim().toUpperCase();

    if (!code) return setLoginError("Please enter your access code.");
    if (!campus) return setLoginError("Please select a campus.");

    try {
      // staff/parent login
      const data = await loginStaffOrParent(code, campus);
      setRole(data.role);
      setToken(data.token);
      setCampus(campus);

      // If backend returns admin role from code, still allow admin (optional)
      if (data.role === "admin" && data.adminToken) {
        setAdminToken(data.adminToken);
      }

      showScreen("app");
      updateBadgesAndMenus();
      toast(`Logged in • ${data.role.toUpperCase()} • ${campus}`);
      renderMessage("assistant", `Hi! Ask me anything about CMS policies, protocols, or parent handbook. (Campus: ${campus})`);
    } catch (e) {
      setLoginError(e.message || "Login failed");
    }
  }

  async function handleAdminLogin() {
    setLoginError("");
    const pin = (els.adminPin?.value || "").trim();
    if (!pin) {
      alert("Enter Admin PIN");
      return;
    }
    try {
      const data = await loginAdmin(pin);
      // In admin mode you still need a campus chosen for content
      const campus = (els.campusSelect?.value || "").trim().toUpperCase();
      if (!campus) {
        alert("Select campus first (Admin also needs a campus).");
        return;
      }

      setRole("admin");
      setToken(data.token);      // session token for main app
      setAdminToken(data.token); // also works for admin endpoints if same token
      setCampus(campus);

      closeAdminModal();
      showScreen("app");
      updateBadgesAndMenus();
      toast(`Admin logged in • ${campus}`);
      renderMessage("assistant", `Admin mode enabled. Campus: ${campus}.`);
    } catch (e) {
      alert(e.message || "Admin login failed");
    }
  }

  function logout() {
    localStorage.removeItem(STORAGE.role);
    localStorage.removeItem(STORAGE.token);
    // keep admin token optional
    // localStorage.removeItem(STORAGE.adminToken);
    showScreen("login");
    updateBadgesAndMenus();
    if (els.chatWindow) els.chatWindow.innerHTML = "";
    if (els.accessCode) els.accessCode.value = "";
    toast("Logged out");
  }

  // -------------------------------
  // Chat
  // -------------------------------
  async function handleSend() {
    if (!authed()) return;
    const q = (els.chatInput?.value || "").trim();
    if (!q) return;

    els.chatInput.value = "";
    renderMessage("user", q);
    renderTyping(true);

    try {
      const campus = getCampus();
      const data = await chatAsk(q, campus);
      renderTyping(false);

      const answer = data.answer || "No answer.";
      renderMessage("assistant", answer);

      // If backend returns a matched handbook/policy/protocol, show a hint
      if (data.handbook?.title) {
        renderMessage("assistant", `Matched handbook: ${data.handbook.title}`);
      }
    } catch (e) {
      renderTyping(false);
      renderMessage("assistant", `Error: ${e.message || "Chat failed"}`);
    }
  }

  // -------------------------------
  // Campus switch inside app
  // -------------------------------
  async function handleCampusSwitch(newCampus) {
    const campus = (newCampus || "").toUpperCase();
    if (!campus) return;

    setCampus(campus);
    updateBadgesAndMenus();
    toast(`Campus switched to ${campus}`);

    // Optional: clear chat window when switching
    if (els.chatWindow) {
      els.chatWindow.innerHTML = "";
      await sleep(50);
      renderMessage("assistant", `Campus switched to ${campus}. Ask your question.`);
    }
  }

  // -------------------------------
  // Init
  // -------------------------------
  function wireEvents() {
    // Login select setup
    normalizeCampusSelect(els.campusSelect, true);

    // Buttons
    els.loginBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      handleLogin();
    });

    // Enter to login
    els.accessCode?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleLogin();
    });

    // Admin button opens modal
    els.adminBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      openAdminModal();
    });

    // Admin modal actions
    els.adminCancelBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      closeAdminModal();
    });

    els.adminLoginBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      handleAdminLogin();
    });

    els.adminPin?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAdminLogin();
    });

    // Menu panel close
    els.menuClose?.addEventListener("click", closeMenuPanel);
    els.overlay?.addEventListener("click", closeMenuPanel);

    // Top menu
    els.menuPolicies?.addEventListener("click", async () => {
      try { await openPolicies(); } catch (e) { alert(e.message); closeMenuPanel(); }
    });
    els.menuProtocols?.addEventListener("click", async () => {
      try { await openProtocols(); } catch (e) { alert(e.message); closeMenuPanel(); }
    });
    els.menuHandbooks?.addEventListener("click", async () => {
      try { await openHandbooks(); } catch (e) { alert(e.message); closeMenuPanel(); }
    });

    // Logout
    els.logoutBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });

    // Campus switch after login
    els.campusSwitch?.addEventListener("change", (e) => {
      handleCampusSwitch(e.target.value);
    });

    // Chat send
    els.chatSend?.addEventListener("click", (e) => {
      e.preventDefault();
      handleSend();
    });

    els.chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSend();
    });
  }

  function boot() {
    setupLogo();
    setupAccessCodeInput();
    wireEvents();

    // Start state
    if (authed()) {
      showScreen("app");
      updateBadgesAndMenus();
      renderMessage("assistant", `Welcome back. Campus: ${getCampus()}.`);
    } else {
      showScreen("login");
      updateBadgesAndMenus();
    }
  }

  // Run
  document.addEventListener("DOMContentLoaded", boot);
})();