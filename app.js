/* =========================
   CMS Policy Chatbot - app.js (FULL)
   Works with your index.html ids + style.css
   Requires Cloudflare Pages Functions:
   - /api              -> functions/api.js
   - /handbooks        -> functions/handbooks.js
   - /auth/staff       -> functions/auth/staff.js
   - /auth/parent      -> functions/auth/parent.js
   - /auth/admin       -> functions/auth/admin.js
========================= */

(() => {
  // ============ CONFIG ============
  const LS = {
    token: "cms_token",
    role: "cms_role",
    until: "cms_until",
    campus: "cms_campus",

    adminToken: "cms_admin_token",
    adminUntil: "cms_admin_until"
  };

  const ENDPOINTS = {
    authStaff: "/auth/staff",
    authParent: "/auth/parent",
    authAdmin: "/auth/admin",
    api: "/api",
    handbooks: "/handbooks"
  };

  const SESSION_HOURS = 8; // UI-only; server TTL is also 8h in your worker
  const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

  // ============ DOM ============
  const el = (id) => document.getElementById(id);

  // screens
  const loginScreen = el("login-screen");
  const chatScreen = el("chat-screen");

  // login
  const loginForm = el("login-form");
  const accessCodeInput = el("access-code");
  const campusSelect = el("campus-select");
  const campusPreview = el("campus-preview");
  const loginError = el("login-error");
  const loginAdminBtn = el("login-admin-btn");

  // header actions
  const headerActions = el("header-actions");
  const campusSwitch = el("campus-switch");
  const adminModeBtn = el("admin-mode-btn");
  const modeBadge = el("mode-badge");
  const logoutBtn = el("logout-btn");

  // top menu
  const topMenuBar = el("top-menu-bar");
  const adminLinks = el("admin-links");

  // menu panel modal
  const menuOverlay = el("menu-overlay");
  const menuPanel = el("menu-panel");
  const menuPanelTitle = el("menu-panel-title");
  const menuPanelBody = el("menu-panel-body");
  const menuPanelClose = el("menu-panel-close");

  // admin modal
  const adminModal = el("admin-modal");
  const adminPinInput = el("admin-pin");
  const adminPinCancel = el("admin-pin-cancel");
  const adminPinSubmit = el("admin-pin-submit");

  // chat
  const chatWindow = el("chat-window");
  const chatForm = el("chat-form");
  const userInput = el("user-input");

  // ============ STATE ============
  let state = {
    token: "",
    role: "", // staff | parent
    campus: "",
    until: 0,

    adminToken: "",
    adminUntil: 0
  };

  // ============ UTILS ============
  function now() {
    return Date.now();
  }

  function setText(node, text) {
    if (!node) return;
    node.textContent = text;
  }

  function show(node) {
    if (!node) return;
    node.classList.remove("hidden");
  }
  function hide(node) {
    if (!node) return;
    node.classList.add("hidden");
  }

  function isAuthed() {
    return !!state.token && now() < Number(state.until || 0);
  }

  function isAdminActive() {
    return !!state.adminToken && now() < Number(state.adminUntil || 0);
  }

  function saveSession({ token, role, campus }) {
    const until = now() + SESSION_MS;
    localStorage.setItem(LS.token, token);
    localStorage.setItem(LS.role, role);
    localStorage.setItem(LS.campus, campus);
    localStorage.setItem(LS.until, String(until));

    state.token = token;
    state.role = role;
    state.campus = campus;
    state.until = until;
  }

  function clearSession() {
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.role);
    localStorage.removeItem(LS.campus);
    localStorage.removeItem(LS.until);

    state.token = "";
    state.role = "";
    state.campus = "";
    state.until = 0;
  }

  function saveAdminSession(token) {
    const until = now() + SESSION_MS;
    localStorage.setItem(LS.adminToken, token);
    localStorage.setItem(LS.adminUntil, String(until));

    state.adminToken = token;
    state.adminUntil = until;
  }

  function clearAdminSession() {
    localStorage.removeItem(LS.adminToken);
    localStorage.removeItem(LS.adminUntil);
    state.adminToken = "";
    state.adminUntil = 0;
  }

  function loadFromStorage() {
    state.token = localStorage.getItem(LS.token) || "";
    state.role = localStorage.getItem(LS.role) || "";
    state.campus = localStorage.getItem(LS.campus) || "";
    state.until = Number(localStorage.getItem(LS.until) || "0");

    state.adminToken = localStorage.getItem(LS.adminToken) || "";
    state.adminUntil = Number(localStorage.getItem(LS.adminUntil) || "0");
  }

  function toastError(msg) {
    // simple UI: show under login, or as assistant bubble if in chat
    if (!isAuthed()) {
      setText(loginError, msg);
      return;
    }
    addAssistantMessage(`❌ ${msg}`);
  }

  function safeJson(res) {
    return res.json().catch(() => ({}));
  }

  function authHeaders(token) {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  // ============ CHAT UI ============
  function addMessage(text, who = "assistant") {
    const div = document.createElement("div");
    div.className = `msg ${who}`;
    div.textContent = text;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return div;
  }

  function addUserMessage(text) {
    return addMessage(text, "user");
  }

  function addAssistantMessage(text) {
    return addMessage(text, "assistant");
  }

  function addTyping() {
    const wrap = document.createElement("div");
    wrap.className = "typing-bubble";
    wrap.innerHTML = `
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    `;
    chatWindow.appendChild(wrap);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return wrap;
  }

  // ============ MODALS ============
  function openMenu(title) {
    setText(menuPanelTitle, title || "Menu");
    show(menuOverlay);
    show(menuPanel);
    menuPanel.setAttribute("aria-hidden", "false");
  }

  function closeMenu() {
    hide(menuOverlay);
    hide(menuPanel);
    menuPanel.setAttribute("aria-hidden", "true");
    menuPanelBody.innerHTML = "";
  }

  function openAdminModal() {
    show(adminModal);
    adminModal.setAttribute("aria-hidden", "false");
    adminPinInput.value = "";
    adminPinInput.focus();
  }

  function closeAdminModal() {
    hide(adminModal);
    adminModal.setAttribute("aria-hidden", "true");
    adminPinInput.value = "";
  }

  // ============ UI MODE ============
  function applyAuthedUI() {
    if (isAuthed()) {
      hide(loginScreen);
      show(chatScreen);
      show(headerActions);
      show(topMenuBar);

      // set campus UI
      if (campusSwitch) campusSwitch.value = state.campus || "";

      // role badge
      setText(modeBadge, (state.role || "STAFF").toUpperCase());
      modeBadge.classList.toggle("admin", isAdminActive());

      // admin links
      if (isAdminActive()) show(adminLinks);
      else hide(adminLinks);

      // greeting
      if (!chatWindow.dataset.welcomed) {
        chatWindow.dataset.welcomed = "1";
        addAssistantMessage(
          `✅ Logged in as ${state.role.toUpperCase()} (Campus: ${state.campus}).\n` +
          `Use the menu (Policies / Protocols / Parent Handbook) or ask a question in chat.`
        );
      }
    } else {
      // logged out view
      show(loginScreen);
      hide(chatScreen);
      hide(headerActions);
      hide(topMenuBar);
      hide(adminLinks);
      modeBadge.classList.remove("admin");
      chatWindow.dataset.welcomed = "";
      chatWindow.innerHTML = "";
    }
  }

  // ============ API CALLS ============
  async function postJson(url, bodyObj, token = "") {
    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(bodyObj || {})
    });
    const data = await safeJson(res);
    return { res, data };
  }

  async function getJson(url, token = "") {
    const res = await fetch(url, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    const data = await safeJson(res);
    return { res, data };
  }

  // ============ LOGIN ============
  function clearLoginError() {
    setText(loginError, "");
  }

  async function loginStaffOrParent(code, campus) {
    // try staff first
    let out = await postJson(ENDPOINTS.authStaff, { code }, "");
    if (out.res.ok && out.data?.ok && out.data?.token) {
      return { ok: true, role: "staff", token: out.data.token };
    }

    // if not staff, try parent (only if 401/400-ish)
    out = await postJson(ENDPOINTS.authParent, { code }, "");
    if (out.res.ok && out.data?.ok && out.data?.token) {
      return { ok: true, role: "parent", token: out.data.token };
    }

    const msg =
      out.data?.error ||
      "Invalid code (staff/parent).";

    return { ok: false, error: msg };
  }

  async function loginAdmin(pin) {
    const out = await postJson(ENDPOINTS.authAdmin, { pin }, "");
    if (out.res.ok && out.data?.ok && out.data?.token) {
      return { ok: true, token: out.data.token };
    }
    return { ok: false, error: out.data?.error || "Invalid admin PIN" };
  }

  // ============ MENUS ============
  function setMenuLoading() {
    menuPanelBody.innerHTML = `<div class="muted">Loading…</div>`;
  }

  function setMenuError(msg) {
    menuPanelBody.innerHTML = `<div class="error-text">${msg}</div>`;
  }

  function quickAsk(text) {
    // put question into input and submit
    if (!userInput) return;
    userInput.value = text;
    userInput.focus();
  }

  async function openPoliciesMenu() {
    openMenu("Policies");
    menuPanelBody.innerHTML = `
      <div class="menu-group-label">Quick questions</div>

      <button class="menu-item-btn" data-quickask="What is the attendance policy?">Attendance policy</button>
      <button class="menu-item-btn" data-quickask="What is the late pickup policy?">Late pickup policy</button>
      <button class="menu-item-btn" data-quickask="What is the sick / illness policy?">Sick / illness policy</button>
      <button class="menu-item-btn" data-quickask="What is the communication policy with parents?">Parent communication policy</button>

      <div class="muted" style="margin-top:10px; line-height:1.4">
        Tip: Policies & protocols are answered through chat search.
        Click a quick item above, then press <b>Ask</b>.
      </div>
    `;
  }

  async function openProtocolsMenu() {
    openMenu("Protocols");
    menuPanelBody.innerHTML = `
      <div class="menu-group-label">Quick questions</div>

      <button class="menu-item-btn" data-quickask="What is the emergency protocol?">Emergency protocol</button>
      <button class="menu-item-btn" data-quickask="What is the incident reporting protocol?">Incident reporting</button>
      <button class="menu-item-btn" data-quickask="What is the pickup / dismissal protocol?">Pickup / dismissal</button>
      <button class="menu-item-btn" data-quickask="What is the fire drill procedure?">Fire drill</button>

      <div class="muted" style="margin-top:10px; line-height:1.4">
        Tip: Protocols are answered through chat search.
        Click a quick item above, then press <b>Ask</b>.
      </div>
    `;
  }

  async function openHandbookMenu() {
    openMenu("Parent Handbook");
    setMenuLoading();

    if (!state.campus) {
      setMenuError("Campus is missing. Please select a campus.");
      return;
    }

    // GET /handbooks?campus=MC  (requires staff/parent token)
    const url = `${ENDPOINTS.handbooks}?campus=${encodeURIComponent(state.campus)}`;
    const out = await getJson(url, state.token);

    if (!out.res.ok || !out.data?.ok) {
      setMenuError(out.data?.error || "Failed to load handbooks (check /handbooks function).");
      return;
    }

    const list = Array.isArray(out.data.handbooks) ? out.data.handbooks : [];
    if (!list.length) {
      menuPanelBody.innerHTML = `<div class="muted">No handbooks found for ${state.campus}.</div>`;
      return;
    }

    // render cards
    menuPanelBody.innerHTML = `
      <div class="menu-group-label">Campus: ${state.campus}</div>
      ${list
        .map((hb) => {
          const sections = Array.isArray(hb.sections) ? hb.sections : [];
          return `
            <div class="hb-card" data-hb-id="${escapeAttr(hb.id)}">
              <div class="hb-title">${escapeHtml(hb.title || "Parent Handbook")}</div>
              <div class="hb-meta">
                ${hb.program ? `Program: ${escapeHtml(hb.program)}` : "Program: —"}
              </div>

              <div class="hb-open-row">
                <button class="hb-open-btn" data-hb-open="1">Open sections</button>
                ${hb.link ? `<a class="hb-open-btn" href="${escapeAttr(hb.link)}" target="_blank" rel="noreferrer">Open link</a>` : ""}
              </div>

              <div class="hb-sections" style="display:none; margin-top:10px;">
                ${sections
                  .map(
                    (s) => `
                      <button
                        class="hb-section-btn"
                        data-hb-section="${escapeAttr(s.key || "")}"
                        type="button"
                      >
                        ${escapeHtml(s.title || s.key || "Section")}
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `;
        })
        .join("")}
      <div class="muted" style="margin-top:8px">
        Click a section to send it into chat.
      </div>
    `;
  }

  // escape helpers for handbook render
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function escapeAttr(s) {
    // safe enough for href/data-*
    return escapeHtml(s).replaceAll("`", "");
  }

  async function fetchHandbookSection(handbookId, sectionKey) {
    const url =
      `${ENDPOINTS.handbooks}?campus=${encodeURIComponent(state.campus)}` +
      `&id=${encodeURIComponent(handbookId)}` +
      `&section=${encodeURIComponent(sectionKey)}`;

    const out = await getJson(url, state.token);
    if (!out.res.ok || !out.data?.ok) {
      throw new Error(out.data?.error || "Failed to load section");
    }
    return out.data;
  }

  // ============ CHAT REQUEST ============
  async function sendChat(queryText) {
    const query = String(queryText || "").trim();
    if (!query) return;

    if (!isAuthed()) {
      toastError("Session expired. Please login again.");
      applyAuthedUI();
      return;
    }

    if (!state.campus) {
      toastError("Please select a campus.");
      return;
    }

    addUserMessage(query);

    const typing = addTyping();

    try {
      const out = await postJson(
        ENDPOINTS.api,
        { query, campus: state.campus },
        state.token
      );

      typing.remove?.();

      if (!out.res.ok) {
        const msg = out.data?.error || `Request failed (${out.res.status})`;
        addAssistantMessage(`❌ ${msg}`);
        return;
      }

      const answer = out.data?.answer || "No answer returned.";
      addAssistantMessage(answer);

      // optional: show source line
      if (out.data?.source?.title) {
        const src = out.data.source;
        const line =
          `\n\nSource: ${src.type || "doc"} • ${src.title}${src.program ? ` • ${src.program}` : ""}`;
        addAssistantMessage(line);
      }

      // if handbook_section returned, show section content too
      const hbSec = out.data?.handbook_section;
      if (hbSec?.section_title || hbSec?.section_content) {
        addAssistantMessage(
          `📌 ${hbSec.section_title || hbSec.section_key || "Handbook section"}\n` +
          `${hbSec.section_content || ""}`
        );
      }
    } catch (e) {
      typing.remove?.();
      addAssistantMessage(`❌ Network error: ${e?.message || "Unknown"}`);
    }
  }

  // ============ EVENTS ============
  function wireMenuButtons() {
    // Top menu pills in navbar
    document.querySelectorAll(".menu-pill").forEach((btn) => {
      btn.addEventListener("click", async () => {
        // set active
        document.querySelectorAll(".menu-pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const key = btn.getAttribute("data-menu");
        if (key === "policies") return openPoliciesMenu();
        if (key === "protocols") return openProtocolsMenu();
        if (key === "handbook") return openHandbookMenu();
      });
    });

    // menu close
    menuOverlay?.addEventListener("click", closeMenu);
    menuPanelClose?.addEventListener("click", closeMenu);

    // inside menu click (delegate)
    menuPanelBody?.addEventListener("click", async (e) => {
      const t = e.target;

      // quick ask buttons
      const qa = t?.getAttribute?.("data-quickask");
      if (qa) {
        quickAsk(qa);
        closeMenu();
        return;
      }

      // handbook "Open sections" toggle
      if (t?.getAttribute?.("data-hb-open") === "1") {
        const card = t.closest(".hb-card");
        if (!card) return;
        const secWrap = card.querySelector(".hb-sections");
        if (!secWrap) return;
        secWrap.style.display = secWrap.style.display === "none" ? "block" : "none";
        return;
      }

      // handbook section button
      const sectionKey = t?.getAttribute?.("data-hb-section");
      if (sectionKey != null) {
        const card = t.closest(".hb-card");
        const handbookId = card?.getAttribute?.("data-hb-id");
        if (!handbookId) return;

        try {
          const data = await fetchHandbookSection(handbookId, sectionKey);
          const title = data?.section?.title || sectionKey;
          const content = data?.section?.content || "";
          closeMenu();

          // push to chat as assistant info
          addAssistantMessage(`📘 Handbook — ${title}\n${content}`);

        } catch (err) {
          toastError(err?.message || "Failed to open section");
        }
      }
    });
  }

  function wireLogin() {
    // campus preview pill
    if (campusSelect && campusPreview) {
      const update = () => setText(campusPreview, campusSelect.value || "—");
      campusSelect.addEventListener("change", update);
      update();
    }

    loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearLoginError();

      const code = String(accessCodeInput?.value || "").trim();
      const campus = String(campusSelect?.value || "").trim().toUpperCase();

      if (!code) return toastError("Please enter access code.");
      if (!campus) return toastError("Please select campus.");

      // attempt staff then parent
      const result = await loginStaffOrParent(code, campus);

      if (!result.ok) {
        toastError(result.error || "Login failed.");
        return;
      }

      saveSession({ token: result.token, role: result.role, campus });
      applyAuthedUI();
    });

    // admin login button (opens pin modal)
    loginAdminBtn?.addEventListener("click", () => {
      openAdminModal();
    });
  }

  function wireAdmin() {
    // Header Admin button toggles modal
    adminModeBtn?.addEventListener("click", () => {
      openAdminModal();
    });

    adminPinCancel?.addEventListener("click", () => {
      closeAdminModal();
    });

    adminPinSubmit?.addEventListener("click", async () => {
      const pin = String(adminPinInput?.value || "").trim();
      if (!pin) return;

      const res = await loginAdmin(pin);
      if (!res.ok) {
        alert(res.error || "Invalid admin PIN");
        return;
      }

      saveAdminSession(res.token);
      closeAdminModal();

      // update UI
      modeBadge.classList.add("admin");
      show(adminLinks);

      addAssistantMessage("✅ Admin mode enabled. You can open Dashboard / Logs.");
    });
  }

  function wireHeader() {
    // campus switch in header after login
    campusSwitch?.addEventListener("change", () => {
      const c = String(campusSwitch.value || "").trim().toUpperCase();
      if (!c) return;

      localStorage.setItem(LS.campus, c);
      state.campus = c;

      addAssistantMessage(`🏫 Campus switched to ${c}.`);
    });

    logoutBtn?.addEventListener("click", () => {
      clearSession();
      clearAdminSession();
      applyAuthedUI();
    });
  }

  function wireChat() {
    chatForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = String(userInput?.value || "").trim();
      if (!q) return;
      userInput.value = "";
      await sendChat(q);
    });
  }

  // ============ INIT ============
  function init() {
    loadFromStorage();

    // if session expired, clear
    if (state.until && now() > state.until) clearSession();
    if (state.adminUntil && now() > state.adminUntil) clearAdminSession();

    wireLogin();
    wireHeader();
    wireAdmin();
    wireMenuButtons();
    wireChat();

    // set selects from stored campus
    if (state.campus) {
      if (campusSelect) campusSelect.value = state.campus;
      if (campusSwitch) campusSwitch.value = state.campus;
      if (campusPreview) setText(campusPreview, state.campus);
    }

    applyAuthedUI();

    // close menu on ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeMenu();
        closeAdminModal();
      }
    });
  }

  // Run
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();