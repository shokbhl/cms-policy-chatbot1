/* =========================
   app.js (FULL FINAL)
   - Works with your index.html IDs
   - Login staff/parent + Admin PIN
   - Top menu: Policies / Protocols / Parent Handbook
   - Browse modal: list -> click -> show sections/content
   - Chat -> /api -> show multiple matches
========================= */

(() => {
  // =============== CONFIG ===============
  // If you proxy via Pages Functions, keep these as same-origin.
  // If you directly call Worker, set window.__CMS_WORKER_BASE__ = "https://xxxx.workers.dev"
  const WORKER_BASE = (window.__CMS_WORKER_BASE__ || "").trim(); // optional
  const API = {
    authStaff: "/auth/staff",
    authParent: "/auth/parent",
    authAdmin: "/auth/admin",
    api: "/api",
    policies: "/policies",
    protocols: "/protocols",
    handbooks: "/handbooks",
    adminLogs: "/admin/logs",
    adminStats: "/admin/stats"
  };

  function endpoint(path) {
    if (!WORKER_BASE) return path; // same-origin (Pages -> Functions proxy OR direct Worker binding)
    return new URL(path, WORKER_BASE).toString();
  }

  const LS = {
    campus: "cms_campus",
    role: "cms_role", // staff | parent
    staffToken: "cms_staff_token",
    staffUntil: "cms_staff_until",
    parentToken: "cms_parent_token",
    parentUntil: "cms_parent_until",
    adminToken: "cms_admin_token",
    adminUntil: "cms_admin_until",
    program: "cms_program",
    lastMenu: "cms_last_menu"
  };

  const CAMPUSES = ["MC", "YC", "SC", "TC", "WC"];
  const PROGRAMS = ["ALL", "PRESCHOOL", "SR_CASA", "ELEMENTARY"];

  // =============== DOM ===============
  const el = {
    headerActions: byId("header-actions"),
    loginScreen: byId("login-screen"),
    chatScreen: byId("chat-screen"),
    loginForm: byId("login-form"),
    campusSelect: byId("campus-select"),
    accessCode: byId("access-code"),
    loginError: byId("login-error"),

    programSwitch: byId("program-switch"),
    campusSwitch: byId("campus-switch"),
    adminModeBtn: byId("admin-mode-btn"),
    modeBadge: byId("mode-badge"),
    logoutBtn: byId("logout-btn"),

    chatWindow: byId("chat-window"),
    chatForm: byId("chat-form"),
    userInput: byId("user-input"),

    menuOverlay: byId("menu-overlay"),
    menuPanel: byId("menu-panel"),
    menuTitle: byId("menu-panel-title"),
    menuBody: byId("menu-panel-body"),
    menuClose: byId("menu-panel-close"),

    adminModal: byId("admin-modal"),
    adminPin: byId("admin-pin"),
    adminPinCancel: byId("admin-pin-cancel"),
    adminPinSubmit: byId("admin-pin-submit"),
    loginAdminBtn: byId("login-admin-btn")
  };

  // Create top menu bar if not in HTML
  let topMenuBar = byId("top-menu-bar");
  if (!topMenuBar) {
    topMenuBar = document.createElement("nav");
    topMenuBar.id = "top-menu-bar";
    topMenuBar.className = "top-menu-bar hidden";
    // Insert after header
    const header = document.querySelector("header");
    header?.insertAdjacentElement("afterend", topMenuBar);
  }

  // =============== STATE ===============
  const state = {
    role: (localStorage.getItem(LS.role) || "").trim(), // staff | parent
    campus: (localStorage.getItem(LS.campus) || "").trim().toUpperCase(),
    program: (localStorage.getItem(LS.program) || "ALL").trim().toUpperCase(),
    staffToken: localStorage.getItem(LS.staffToken) || "",
    parentToken: localStorage.getItem(LS.parentToken) || "",
    adminToken: localStorage.getItem(LS.adminToken) || "",
    lastMenu: localStorage.getItem(LS.lastMenu) || "policies" // policies | protocols | handbook
  };

  // =============== INIT ===============
  initSelectors();
  initEvents();
  hydrateUI();

  // =============== UI INIT HELPERS ===============
  function initSelectors() {
    // campus selectors
    if (el.campusSelect) {
      el.campusSelect.value = CAMPUSES.includes(state.campus) ? state.campus : "";
    }
    if (el.campusSwitch) {
      el.campusSwitch.value = CAMPUSES.includes(state.campus) ? state.campus : "";
    }
    if (el.programSwitch) {
      el.programSwitch.value = PROGRAMS.includes(state.program) ? state.program : "ALL";
    }
  }

  function initEvents() {
    // Login submit
    el.loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError();
      const campus = (el.campusSelect?.value || "").trim().toUpperCase();
      const code = (el.accessCode?.value || "").trim();

      if (!campus) return showError("Please select campus.");
      if (!code) return showError("Please enter access code.");

      setBusy(true);
      try {
        // Try staff first, if fails try parent (simple UX)
        const staff = await postJSON(endpoint(API.authStaff), { code });
        if (staff.ok) {
          state.role = "staff";
          state.campus = campus;
          state.staffToken = staff.token;
          persistToken("staff", staff.token, staff.expires_in);
          persistCampus(campus);
          persistRole("staff");
          hydrateUI();
          sayBot(`✅ Logged in as STAFF (${campus}). What do you need?`);
          return;
        }

        const parent = await postJSON(endpoint(API.authParent), { code });
        if (parent.ok) {
          state.role = "parent";
          state.campus = campus;
          state.parentToken = parent.token;
          persistToken("parent", parent.token, parent.expires_in);
          persistCampus(campus);
          persistRole("parent");
          hydrateUI();
          sayBot(`✅ Logged in as PARENT (${campus}). Ask me anything from the Parent Handbook.`);
          return;
        }

        showError("Invalid code.");
      } catch (err) {
        showError(err?.message || "Login error.");
      } finally {
        setBusy(false);
      }
    });

    // Campus switch (header)
    el.campusSwitch?.addEventListener("change", () => {
      const campus = (el.campusSwitch.value || "").trim().toUpperCase();
      if (!campus) return;
      state.campus = campus;
      persistCampus(campus);
      sayBot(`📍 Campus set to ${campus}.`);
    });

    // Program switch (header)
    el.programSwitch?.addEventListener("change", () => {
      const p = (el.programSwitch.value || "ALL").trim().toUpperCase();
      state.program = PROGRAMS.includes(p) ? p : "ALL";
      localStorage.setItem(LS.program, state.program);
      sayBot(`🎯 Program filter: ${state.program === "ALL" ? "All Programs" : state.program}.`);
    });

    // Admin mode
    el.adminModeBtn?.addEventListener("click", () => {
      openAdminModal();
    });
    el.loginAdminBtn?.addEventListener("click", () => {
      openAdminModal();
    });

    el.adminPinCancel?.addEventListener("click", closeAdminModal);
    el.adminModal?.addEventListener("click", (e) => {
      if (e.target === el.adminModal) closeAdminModal();
    });
    el.adminPinSubmit?.addEventListener("click", adminLogin);
    el.adminPin?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") adminLogin();
      if (e.key === "Escape") closeAdminModal();
    });

    // Logout
    el.logoutBtn?.addEventListener("click", () => {
      logout();
    });

    // Menu open buttons (top menu)
    topMenuBar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-menu]");
      if (!btn) return;
      const menu = btn.getAttribute("data-menu");
      openMenu(menu);
    });

    // Close menu
    el.menuClose?.addEventListener("click", closeMenu);
    el.menuOverlay?.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeMenu();
        closeAdminModal();
      }
    });

    // Browse clicks inside menu panel body (event delegation)
    el.menuBody?.addEventListener("click", async (e) => {
      const item = e.target.closest("[data-doc-id]");
      if (item) {
        const type = item.getAttribute("data-doc-type"); // policies|protocols|handbook
        const id = item.getAttribute("data-doc-id");
        const campus = item.getAttribute("data-campus") || state.campus;
        const hbId = item.getAttribute("data-hb-id"); // for handbook section click
        const sectionKey = item.getAttribute("data-section-key");

        if (type === "policies") return loadPolicyDoc(id);
        if (type === "protocols") return loadProtocolDoc(id);

        if (type === "handbook") {
          // If sectionKey exists -> fetch that section; else open full
          return loadHandbookDoc(campus, hbId || id, sectionKey);
        }
      }

      const backBtn = e.target.closest("[data-back-to-list]");
      if (backBtn) {
        const menu = backBtn.getAttribute("data-back-to-list");
        return openMenu(menu);
      }

      const openInNew = e.target.closest("[data-open-link]");
      if (openInNew) {
        const href = openInNew.getAttribute("data-open-link");
        if (href) window.open(href, "_blank", "noopener,noreferrer");
      }
    });

    // Chat submit
    el.chatForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = (el.userInput?.value || "").trim();
      if (!q) return;

      sayUser(q);
      el.userInput.value = "";

      if (!state.campus) {
        sayBot("Please select a campus first.");
        return;
      }

      const token = getAuthTokenForChat();
      if (!token) {
        sayBot("Please login first.");
        return;
      }

      try {
        const res = await fetch(endpoint(API.api), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            query: q,
            campus: state.campus,
            program: state.program || "ALL"
          })
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          sayBot(`⚠️ ${data?.error || "API error"}`);
          return;
        }

        renderMatches(data.matches || [], data.note || "");
      } catch (err) {
        sayBot(`⚠️ ${err?.message || "Network error"}`);
      }
    });
  }

  function hydrateUI() {
    const loggedIn = !!getAuthTokenForBrowse(); // staff/admin/parent token
    toggle(el.headerActions, loggedIn);
    toggle(topMenuBar, loggedIn);
    toggle(el.loginScreen, !loggedIn);
    toggle(el.chatScreen, loggedIn);

    // Mode badge
    const badge = getModeBadge();
    if (el.modeBadge) el.modeBadge.textContent = badge;

    // Campus switch default
    if (el.campusSwitch) {
      el.campusSwitch.value = CAMPUSES.includes(state.campus) ? state.campus : "";
    }
    // Program
    if (el.programSwitch) {
      el.programSwitch.value = PROGRAMS.includes(state.program) ? state.program : "ALL";
    }

    // Build top menu buttons (role-aware)
    renderTopMenu();

    // If logged in and no greeting yet
    if (loggedIn && el.chatWindow && el.chatWindow.children.length === 0) {
      sayBot("Hi! Use the top buttons to browse, or ask a question below.");
    }
  }

  function renderTopMenu() {
    const canBrowseStaffDocs = state.role === "staff" || !!state.adminToken;
    const canBrowseHandbook = state.role === "parent" || state.role === "staff" || !!state.adminToken;

    topMenuBar.className = "top-menu-bar";
    topMenuBar.innerHTML = `
      ${canBrowseStaffDocs ? `<button class="pill" type="button" data-menu="policies">Policies</button>` : ""}
      ${canBrowseStaffDocs ? `<button class="pill" type="button" data-menu="protocols">Protocols</button>` : ""}
      ${canBrowseHandbook ? `<button class="pill" type="button" data-menu="handbook">Parent Handbook</button>` : ""}
    `.trim();

    topMenuBar.classList.remove("hidden");
  }

  // =============== MENUS (Browse) ===============
  async function openMenu(menu) {
    if (!menu) return;
    state.lastMenu = menu;
    localStorage.setItem(LS.lastMenu, menu);

    openPanel();
    if (menu === "policies") return loadPoliciesList();
    if (menu === "protocols") return loadProtocolsList();
    if (menu === "handbook") return loadHandbooksList();
  }

  function openPanel() {
    el.menuOverlay?.classList.remove("hidden");
    el.menuPanel?.classList.remove("hidden");
  }

  function closeMenu() {
    el.menuOverlay?.classList.add("hidden");
    el.menuPanel?.classList.add("hidden");
  }

  async function loadPoliciesList() {
    const token = getAuthTokenForBrowseStaffOnly();
    if (!token) return renderMenuError("Policies are STAFF-only. Please login as staff.");

    setMenuTitle("Policies");
    setMenuBody(loadingHTML("Loading policies..."));

    try {
      const res = await fetch(endpoint(`${API.policies}?list=1`), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return renderMenuError(data?.error || "Failed to load policies.");

      const items = data.items || [];
      setMenuBody(renderDocList("policies", items));
    } catch (err) {
      renderMenuError(err?.message || "Network error.");
    }
  }

  async function loadProtocolsList() {
    const token = getAuthTokenForBrowseStaffOnly();
    if (!token) return renderMenuError("Protocols are STAFF-only. Please login as staff.");

    setMenuTitle("Protocols");
    setMenuBody(loadingHTML("Loading protocols..."));

    try {
      const res = await fetch(endpoint(`${API.protocols}?list=1`), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return renderMenuError(data?.error || "Failed to load protocols.");

      const items = data.items || [];
      setMenuBody(renderDocList("protocols", items));
    } catch (err) {
      renderMenuError(err?.message || "Network error.");
    }
  }

  async function loadPolicyDoc(id) {
    const token = getAuthTokenForBrowseStaffOnly();
    if (!token) return renderMenuError("Policies are STAFF-only.");

    setMenuTitle("Policies");
    setMenuBody(loadingHTML("Loading policy..."));

    try {
      const res = await fetch(endpoint(`${API.policies}?id=${encodeURIComponent(id)}`), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return renderMenuError(data?.error || "Policy load failed.");

      const doc = data.doc || {};
      setMenuBody(renderDocView("policies", doc));
    } catch (err) {
      renderMenuError(err?.message || "Network error.");
    }
  }

  async function loadProtocolDoc(id) {
    const token = getAuthTokenForBrowseStaffOnly();
    if (!token) return renderMenuError("Protocols are STAFF-only.");

    setMenuTitle("Protocols");
    setMenuBody(loadingHTML("Loading protocol..."));

    try {
      const res = await fetch(endpoint(`${API.protocols}?id=${encodeURIComponent(id)}`), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return renderMenuError(data?.error || "Protocol load failed.");

      const doc = data.doc || {};
      setMenuBody(renderDocView("protocols", doc));
    } catch (err) {
      renderMenuError(err?.message || "Network error.");
    }
  }

  async function loadHandbooksList() {
    const token = getAuthTokenForBrowse(); // parent allowed
    if (!token) return renderMenuError("Please login first.");
    if (!state.campus) return renderMenuError("Select a campus first.");

    setMenuTitle("Parent Handbook");
    setMenuBody(loadingHTML("Loading handbooks..."));

    try {
      const res = await fetch(endpoint(`${API.handbooks}?campus=${encodeURIComponent(state.campus)}`), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return renderMenuError(data?.error || "Failed to load handbooks.");

      let handbooks = data.handbooks || [];

      // Apply program filter
      const prog = (state.program || "ALL").toUpperCase();
      if (prog !== "ALL") {
        handbooks = handbooks.filter((h) => normalizeProgram(h.program) === prog);
      }

      setMenuBody(renderHandbookList(handbooks));
    } catch (err) {
      renderMenuError(err?.message || "Network error.");
    }
  }

  async function loadHandbookDoc(campus, handbookId, sectionKey) {
    const token = getAuthTokenForBrowse();
    if (!token) return renderMenuError("Please login first.");
    if (!campus) return renderMenuError("Missing campus.");

    setMenuTitle("Parent Handbook");
    setMenuBody(loadingHTML("Loading handbook..."));

    try {
      const qs = new URLSearchParams({ campus: campus, id: handbookId });
      if (sectionKey) qs.set("section", sectionKey);

      const res = await fetch(endpoint(`${API.handbooks}?${qs.toString()}`), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return renderMenuError(data?.error || "Handbook load failed.");

      if (data.section) {
        // show only a section
        const hb = data.handbook || {};
        setMenuBody(renderHandbookSectionView(hb, data.section, campus));
      } else {
        // show full handbook (with sections)
        const hb = data.handbook || {};
        setMenuBody(renderHandbookFullView(hb, campus));
      }
    } catch (err) {
      renderMenuError(err?.message || "Network error.");
    }
  }

  // =============== RENDERERS ===============
  function setMenuTitle(t) {
    if (el.menuTitle) el.menuTitle.textContent = t || "Menu";
  }

  function setMenuBody(html) {
    if (el.menuBody) el.menuBody.innerHTML = html || "";
  }

  function renderMenuError(msg) {
    setMenuBody(`
      <div class="menu-empty">
        <div style="font-weight:800;margin-bottom:6px;">⚠️ Error</div>
        <div class="hint">${escapeHTML(msg || "Something went wrong.")}</div>
        <div style="margin-top:12px;">
          <button class="btn" type="button" data-back-to-list="${escapeHTML(state.lastMenu || "policies")}">Back</button>
        </div>
      </div>
    `);
  }

  function renderDocList(type, items) {
    if (!items || !items.length) {
      return `
        <div class="menu-empty">
          <div style="font-weight:800;margin-bottom:6px;">No items</div>
          <div class="hint">Nothing found in this list.</div>
        </div>
      `;
    }

    return `
      <div class="menu-subhead">Tap a document to expand sections</div>
      <div class="menu-list">
        ${items
          .map(
            (it) => `
          <button class="menu-item" type="button"
            data-doc-type="${type}"
            data-doc-id="${escapeHTML(it.id)}">
            <div class="menu-item-title">${escapeHTML(it.title || it.id)}</div>
            ${it.version ? `<div class="menu-item-sub">v${escapeHTML(it.version)}</div>` : ``}
          </button>
        `
          )
          .join("")}
      </div>
    `;
  }

  function renderDocView(type, doc) {
    const title = doc?.title || doc?.id || "Document";
    const link = doc?.link || "";
    const sections = Array.isArray(doc?.sections) ? doc.sections : [];
    const content = (doc?.content || "").trim();

    const header = `
      <div class="menu-doc-head">
        <button class="btn" type="button" data-back-to-list="${type}">Back</button>
        <div class="menu-doc-title">${escapeHTML(title)}</div>
        ${link ? `<button class="btn" type="button" data-open-link="${escapeHTML(link)}">Open Doc</button>` : ``}
      </div>
    `;

    // ✅ This fixes your bug: if sections exist -> render them. If not -> render content.
    if (sections.length) {
      return `
        ${header}
        <div class="menu-doc-sections">
          ${sections.map((s, i) => renderAccordionSection(s, i)).join("")}
        </div>
      `;
    }

    if (content) {
      return `
        ${header}
        <div class="menu-doc-content">
          <pre class="doc-pre">${escapeHTML(content)}</pre>
        </div>
      `;
    }

    return `
      ${header}
      <div class="menu-empty">
        <div style="font-weight:800;margin-bottom:6px;">No content</div>
        <div class="hint">This document has no sections and no content.</div>
      </div>
    `;
  }

  function renderAccordionSection(sec, i) {
    const t = sec?.title || `Section ${i + 1}`;
    const c = (sec?.content || "").trim();
    const sid = sec?.id || `sec_${i + 1}`;

    // default open first section for better UX
    const open = i === 0 ? "open" : "";

    return `
      <details class="acc" ${open}>
        <summary class="acc-sum">
          <span class="acc-title">${escapeHTML(t)}</span>
        </summary>
        <div class="acc-body">
          ${c ? `<pre class="doc-pre">${escapeHTML(c)}</pre>` : `<div class="hint">No content in this section.</div>`}
        </div>
      </details>
    `;
  }

  function renderHandbookList(handbooks) {
    if (!handbooks || !handbooks.length) {
      return `
        <div class="menu-empty">
          <div style="font-weight:800;margin-bottom:6px;">No handbooks</div>
          <div class="hint">No handbook found for this campus/program.</div>
        </div>
      `;
    }

    return `
      <div class="menu-subhead">Tap a handbook to view its sections</div>
      <div class="menu-list">
        ${handbooks
          .map((hb) => {
            const title = hb.title || "Parent Handbook";
            const prog = hb.program ? ` • ${hb.program}` : "";
            const sections = Array.isArray(hb.sections) ? hb.sections : [];
            return `
              <div class="menu-card">
                <button class="menu-item" type="button"
                  data-doc-type="handbook"
                  data-campus="${escapeHTML(state.campus)}"
                  data-doc-id="${escapeHTML(hb.id)}">
                  <div class="menu-item-title">${escapeHTML(title)}${escapeHTML(prog)}</div>
                  <div class="menu-item-sub">${escapeHTML(sections.length)} sections</div>
                </button>

                <div class="menu-section-grid">
                  ${sections
                    .slice(0, 12)
                    .map(
                      (s) => `
                    <button class="pill tiny" type="button"
                      data-doc-type="handbook"
                      data-campus="${escapeHTML(state.campus)}"
                      data-hb-id="${escapeHTML(hb.id)}"
                      data-doc-id="${escapeHTML(hb.id)}"
                      data-section-key="${escapeHTML(s.key)}">
                      ${escapeHTML(s.title || s.key)}
                    </button>
                  `
                    )
                    .join("")}
                  ${sections.length > 12 ? `<div class="hint" style="margin-top:6px;">Open the handbook to see all sections.</div>` : ``}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderHandbookFullView(hb, campus) {
    const title = hb?.title || "Parent Handbook";
    const link = hb?.link || "";
    const sections = Array.isArray(hb?.sections) ? hb.sections : [];

    return `
      <div class="menu-doc-head">
        <button class="btn" type="button" data-back-to-list="handbook">Back</button>
        <div class="menu-doc-title">${escapeHTML(title)}</div>
        ${link ? `<button class="btn" type="button" data-open-link="${escapeHTML(link)}">Open Doc</button>` : ``}
      </div>

      ${sections.length ? `
        <div class="menu-subhead">Tap a section to open it</div>
        <div class="menu-list">
          ${sections.map((s) => `
            <button class="menu-item" type="button"
              data-doc-type="handbook"
              data-campus="${escapeHTML(campus)}"
              data-hb-id="${escapeHTML(hb.id)}"
              data-doc-id="${escapeHTML(hb.id)}"
              data-section-key="${escapeHTML(s.key)}">
              <div class="menu-item-title">${escapeHTML(s.title || s.key)}</div>
            </button>
          `).join("")}
        </div>
      ` : `
        <div class="menu-empty">
          <div style="font-weight:800;margin-bottom:6px;">No sections</div>
          <div class="hint">This handbook has no sections.</div>
        </div>
      `}
    `;
  }

  function renderHandbookSectionView(hb, section, campus) {
    const hbTitle = hb?.title || "Parent Handbook";
    const link = hb?.link || "";
    const st = section?.title || section?.key || "Section";
    const content = (section?.content || "").trim();

    return `
      <div class="menu-doc-head">
        <button class="btn" type="button" data-back-to-list="handbook">Back</button>
        <div class="menu-doc-title">${escapeHTML(hbTitle)} — ${escapeHTML(st)}</div>
        ${link ? `<button class="btn" type="button" data-open-link="${escapeHTML(link)}">Open Doc</button>` : ``}
      </div>

      <div class="menu-doc-content">
        ${content ? `<pre class="doc-pre">${escapeHTML(content)}</pre>` : `<div class="hint">No content.</div>`}
      </div>
    `;
  }

  // =============== CHAT RENDER ===============
  function renderMatches(matches, note) {
    if (note) sayBot(note);

    if (!matches || !matches.length) {
      sayBot("No matches found.");
      return;
    }

    for (const m of matches) {
      const title = m.title || "Result";
      const type = (m.type || "").toUpperCase();
      const why = m.why ? `<div class="hint" style="margin-top:6px;">${escapeHTML(m.why)}</div>` : "";
      const link = m.link ? `<div style="margin-top:8px;"><a href="${escapeAttr(m.link)}" target="_blank" rel="noopener noreferrer">Open document</a></div>` : "";

      sayBotHTML(`
        <div class="card">
          <div style="font-weight:900;">${escapeHTML(type)} • ${escapeHTML(title)}</div>
          ${m.program ? `<div class="hint">Program: ${escapeHTML(m.program)}</div>` : ``}
          <div style="margin-top:10px; white-space:pre-wrap;">${escapeHTML(m.answer || "")}</div>
          ${link}
          ${why}
        </div>
      `);
    }
  }

  // =============== ADMIN ===============
  function openAdminModal() {
    el.adminModal?.classList.remove("hidden");
    setTimeout(() => el.adminPin?.focus(), 50);
  }

  function closeAdminModal() {
    el.adminModal?.classList.add("hidden");
    if (el.adminPin) el.adminPin.value = "";
  }

  async function adminLogin() {
    const pin = (el.adminPin?.value || "").trim();
    if (!pin) return;

    setBusy(true);
    try {
      const res = await postJSON(endpoint(API.authAdmin), { pin });
      if (!res.ok) {
        sayBot("⚠️ Admin login failed.");
        return;
      }

      state.adminToken = res.token;
      persistToken("admin", res.token, res.expires_in);

      // Admin badge doesn’t replace staff/parent role; it’s an extra mode
      hydrateUI();
      closeAdminModal();
      sayBot("✅ Admin mode enabled.");
    } catch (err) {
      sayBot(`⚠️ ${err?.message || "Admin login error."}`);
    } finally {
      setBusy(false);
    }
  }

  // =============== AUTH/TOKENS ===============
  function persistCampus(c) {
    state.campus = c;
    localStorage.setItem(LS.campus, c);
    if (el.campusSwitch) el.campusSwitch.value = c;
    if (el.campusSelect) el.campusSelect.value = c;
  }

  function persistRole(r) {
    localStorage.setItem(LS.role, r);
  }

  function persistToken(kind, token, expiresInSec) {
    const until = Date.now() + (Number(expiresInSec || 0) * 1000);

    if (kind === "staff") {
      localStorage.setItem(LS.staffToken, token);
      localStorage.setItem(LS.staffUntil, String(until));
    }
    if (kind === "parent") {
      localStorage.setItem(LS.parentToken, token);
      localStorage.setItem(LS.parentUntil, String(until));
    }
    if (kind === "admin") {
      localStorage.setItem(LS.adminToken, token);
      localStorage.setItem(LS.adminUntil, String(until));
    }
  }

  function isTokenValid(kind) {
    const now = Date.now();
    if (kind === "admin") {
      const t = localStorage.getItem(LS.adminToken) || "";
      const u = Number(localStorage.getItem(LS.adminUntil) || "0");
      return !!t && u > now;
    }
    if (kind === "staff") {
      const t = localStorage.getItem(LS.staffToken) || "";
      const u = Number(localStorage.getItem(LS.staffUntil) || "0");
      return !!t && u > now;
    }
    if (kind === "parent") {
      const t = localStorage.getItem(LS.parentToken) || "";
      const u = Number(localStorage.getItem(LS.parentUntil) || "0");
      return !!t && u > now;
    }
    return false;
  }

  function getAuthTokenForBrowseStaffOnly() {
    // Staff docs: allow admin token OR staff token
    if (isTokenValid("admin")) return localStorage.getItem(LS.adminToken) || "";
    if (isTokenValid("staff")) return localStorage.getItem(LS.staffToken) || "";
    return "";
  }

  function getAuthTokenForBrowse() {
    // Browse: admin > staff > parent
    if (isTokenValid("admin")) return localStorage.getItem(LS.adminToken) || "";
    if (isTokenValid("staff")) return localStorage.getItem(LS.staffToken) || "";
    if (isTokenValid("parent")) return localStorage.getItem(LS.parentToken) || "";
    return "";
  }

  function getAuthTokenForChat() {
    // Chat: staff or parent token (admin token is okay but your worker expects staff/parent for /api)
    if (isTokenValid("staff")) return localStorage.getItem(LS.staffToken) || "";
    if (isTokenValid("parent")) return localStorage.getItem(LS.parentToken) || "";
    // If user logged only as admin, chat won’t work; tell them to staff login.
    return "";
  }

  function getModeBadge() {
    if (isTokenValid("admin")) return "ADMIN";
    if (state.role === "parent") return "PARENT";
    return "STAFF";
  }

  function logout() {
    localStorage.removeItem(LS.role);

    localStorage.removeItem(LS.staffToken);
    localStorage.removeItem(LS.staffUntil);
    localStorage.removeItem(LS.parentToken);
    localStorage.removeItem(LS.parentUntil);
    localStorage.removeItem(LS.adminToken);
    localStorage.removeItem(LS.adminUntil);

    state.role = "";
    state.staffToken = "";
    state.parentToken = "";
    state.adminToken = "";

    closeMenu();
    closeAdminModal();

    if (el.chatWindow) el.chatWindow.innerHTML = "";
    hydrateUI();
  }

  // =============== UTIL (Network) ===============
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    return { ...data, _status: res.status, _ok: res.ok };
  }

  function setBusy(b) {
    if (el.loginForm) el.loginForm.style.opacity = b ? "0.6" : "1";
    if (el.loginForm) el.loginForm.style.pointerEvents = b ? "none" : "auto";
  }

  function clearError() {
    if (el.loginError) el.loginError.textContent = "";
  }

  function showError(msg) {
    if (el.loginError) el.loginError.textContent = msg;
  }

  function toggle(node, on) {
    if (!node) return;
    node.classList.toggle("hidden", !on);
  }

  function loadingHTML(txt) {
    return `<div class="menu-empty"><div class="hint">${escapeHTML(txt || "Loading...")}</div></div>`;
  }

  function normalizeProgram(p) {
    const s = String(p || "").trim().toLowerCase();
    if (!s) return "";
    if (s.includes("pre")) return "PRESCHOOL";
    if (s.includes("sr") || s.includes("casa")) return "SR_CASA";
    if (s.includes("elem")) return "ELEMENTARY";
    if (s.includes("all")) return "ALL";
    return s.toUpperCase();
  }

  // =============== CHAT UI ===============
  function sayUser(text) {
    addChatBubble("user", escapeHTML(text));
  }

  function sayBot(text) {
    addChatBubble("bot", escapeHTML(text));
  }

  function sayBotHTML(html) {
    addChatBubble("bot", html, true);
  }

  function addChatBubble(role, content, isHTML = false) {
    if (!el.chatWindow) return;
    const wrap = document.createElement("div");
    wrap.className = role === "user" ? "msg user" : "msg bot";

    const bubble = document.createElement("div");
    bubble.className = role === "user" ? "bubble user" : "bubble bot";
    if (isHTML) bubble.innerHTML = content;
    else bubble.innerText = content;

    wrap.appendChild(bubble);
    el.chatWindow.appendChild(wrap);
    el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
  }

  // =============== ESCAPING ===============
  function escapeHTML(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(s) {
    return escapeHTML(s).replaceAll("`", "&#096;");
  }

  function byId(id) {
    return document.getElementById(id);
  }
})();
