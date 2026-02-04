/* =========================
   CMS Policy Chatbot - app.js (FULL)
   Works with:
   - Cloudflare Pages function: /api/*  (proxy to Worker)
   - Worker endpoints expected:
     POST /api/auth/staff   { code, campus }
     POST /api/auth/parent  { code, campus }
     POST /api/auth/admin   { pin }
     GET  /api/policies?campus=MC
     GET  /api/protocols?campus=MC
     GET  /api/handbooks?campus=MC
     POST /api/ask          { q, campus, role, source_type?, source_id?, section_key? }

   Notes:
   - If your worker uses slightly different paths, tell me the exact routes and I’ll adapt fast.
========================= */

(() => {
  // ========= CONFIG =========
  const API_BASE = "/api"; // IMPORTANT: Pages Function should forward /api/* to Worker

  const LS = {
    role: "cms_role",                // "staff" | "parent"
    campus: "cms_campus",

    staffToken: "cms_staff_token",
    staffUntil: "cms_staff_until",

    parentToken: "cms_parent_token",
    parentUntil: "cms_parent_until",

    adminToken: "cms_admin_token",
    adminUntil: "cms_admin_until"
  };

  // ========= DOM =========
  const el = (id) => document.getElementById(id);

  const loginScreen = el("login-screen");
  const chatScreen = el("chat-screen");

  const loginForm = el("login-form");
  const accessCode = el("access-code");
  const campusSelect = el("campus-select");
  const campusPreview = el("campus-preview");
  const loginError = el("login-error");
  const loginAdminBtn = el("login-admin-btn");

  const headerActions = el("header-actions");
  const campusSwitch = el("campus-switch");
  const adminModeBtn = el("admin-mode-btn");
  const modeBadge = el("mode-badge");
  const logoutBtn = el("logout-btn");

  const topMenuBar = el("top-menu-bar");
  const menuBtns = Array.from(document.querySelectorAll(".menu-pill"));

  const menuOverlay = el("menu-overlay");
  const menuPanel = el("menu-panel");
  const menuPanelTitle = el("menu-panel-title");
  const menuPanelBody = el("menu-panel-body");
  const menuPanelClose = el("menu-panel-close");

  const adminLinks = el("admin-links");

  const adminModal = el("admin-modal");
  const adminPin = el("admin-pin");
  const adminPinCancel = el("admin-pin-cancel");
  const adminPinSubmit = el("admin-pin-submit");

  const chatWindow = el("chat-window");
  const chatForm = el("chat-form");
  const userInput = el("user-input");

  // ========= TOAST =========
  let toastWrap;
  function ensureToast() {
    if (toastWrap) return;
    toastWrap = document.createElement("div");
    toastWrap.className = "toast-wrap";
    toastWrap.innerHTML = `<div class="toast" id="toast-inner" style="display:none;"></div>`;
    document.body.appendChild(toastWrap);
  }
  function toast(msg, ms = 1600) {
    ensureToast();
    const t = document.getElementById("toast-inner");
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.style.display = "none"), ms);
  }

  // ========= HELPERS =========
  function setText(node, txt) { if (node) node.textContent = txt ?? ""; }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function now() { return Date.now(); }

  function setCampus(c) {
    const campus = (c || "").toUpperCase();
    localStorage.setItem(LS.campus, campus);
    if (campusSwitch) campusSwitch.value = campus || "";
    if (campusSelect) campusSelect.value = campus || "";
    if (campusPreview) campusPreview.textContent = campus || "—";
  }

  function getCampus() {
    return (localStorage.getItem(LS.campus) || "").toUpperCase();
  }

  function setRole(role) {
    localStorage.setItem(LS.role, role || "");
    applyRoleUI(role);
  }

  function getRole() {
    return (localStorage.getItem(LS.role) || "").toLowerCase();
  }

  function setTokenForRole(role, token, untilMs) {
    if (role === "staff") {
      localStorage.setItem(LS.staffToken, token || "");
      localStorage.setItem(LS.staffUntil, String(untilMs || 0));
    } else if (role === "parent") {
      localStorage.setItem(LS.parentToken, token || "");
      localStorage.setItem(LS.parentUntil, String(untilMs || 0));
    }
  }

  function getToken(role) {
    const r = (role || getRole()).toLowerCase();
    if (r === "staff") return localStorage.getItem(LS.staffToken) || "";
    if (r === "parent") return localStorage.getItem(LS.parentToken) || "";
    return "";
  }

  function tokenValid(role) {
    const r = (role || getRole()).toLowerCase();
    if (r === "staff") return now() < Number(localStorage.getItem(LS.staffUntil) || "0") && !!getToken("staff");
    if (r === "parent") return now() < Number(localStorage.getItem(LS.parentUntil) || "0") && !!getToken("parent");
    return false;
  }

  function adminActive() {
    return now() < Number(localStorage.getItem(LS.adminUntil) || "0") && !!localStorage.getItem(LS.adminToken);
  }

  function showLogin(errMsg) {
    loginScreen.classList.remove("hidden");
    chatScreen.classList.add("hidden");
    headerActions.classList.add("hidden");
    topMenuBar.classList.add("hidden");
    adminLinks?.classList.add("hidden");
    if (errMsg) setText(loginError, errMsg);
  }

  function showApp() {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    headerActions.classList.remove("hidden");
    topMenuBar.classList.remove("hidden");
  }

  function applyRoleUI(roleRaw) {
    const role = (roleRaw || getRole()).toLowerCase();

    // badge
    if (modeBadge) {
      modeBadge.classList.remove("admin");
      modeBadge.textContent = (role || "STAFF").toUpperCase();
    }

    // Parent must NOT see policies/protocols at all
    // (They should only see Parent Handbook)
    menuBtns.forEach(btn => {
      const m = btn.getAttribute("data-menu");
      if (role === "parent") {
        if (m === "policies" || m === "protocols") btn.classList.add("hidden");
        else btn.classList.remove("hidden");
      } else {
        btn.classList.remove("hidden");
      }
    });

    // Admin links
    if (adminLinks) {
      if (adminActive()) adminLinks.classList.remove("hidden");
      else adminLinks.classList.add("hidden");
    }
  }

  function setActiveMenu(menuName) {
    menuBtns.forEach(btn => {
      const m = btn.getAttribute("data-menu");
      btn.classList.toggle("active", m === menuName);
    });
  }

  function openPanel(title) {
    menuPanelTitle.textContent = title || "Menu";
    menuOverlay.classList.remove("hidden");
    menuPanel.classList.remove("hidden");
    menuPanel.setAttribute("aria-hidden", "false");
  }

  function closePanel() {
    menuOverlay.classList.add("hidden");
    menuPanel.classList.add("hidden");
    menuPanel.setAttribute("aria-hidden", "true");
    menuPanelBody.innerHTML = "";
    setActiveMenu(""); // reset
  }

  function openAdminModal() {
    adminModal.classList.remove("hidden");
    adminModal.setAttribute("aria-hidden", "false");
    adminPin.value = "";
    setTimeout(() => adminPin.focus(), 50);
  }

  function closeAdminModal() {
    adminModal.classList.add("hidden");
    adminModal.setAttribute("aria-hidden", "true");
    adminPin.value = "";
  }

  function addMsg(role, text) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.textContent = text;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function addTyping() {
    const div = document.createElement("div");
    div.className = "typing-bubble";
    div.id = "typing-bubble";
    div.innerHTML = `
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <div class="muted" style="font-weight:800;">Thinking…</div>
    `;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById("typing-bubble");
    if (t) t.remove();
  }

  function parseHash() {
    // format: #hb=mc_handbook_srcasa&sec=nutrition
    const h = (location.hash || "").replace(/^#/, "");
    const out = {};
    h.split("&").forEach(p => {
      const [k,v] = p.split("=");
      if (!k) return;
      out[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
    return out;
  }

  function setHash(hbId, secKey) {
    const parts = [];
    if (hbId) parts.push(`hb=${encodeURIComponent(hbId)}`);
    if (secKey) parts.push(`sec=${encodeURIComponent(secKey)}`);
    const newHash = parts.length ? "#" + parts.join("&") : "";
    history.replaceState(null, "", newHash);
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied ✅");
      return true;
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast("Copied ✅");
        return true;
      } catch {
        toast("Copy failed");
        return false;
      } finally {
        ta.remove();
      }
    }
  }

  // ========= API =========
  async function apiFetch(path, { method="GET", jsonBody, token } = {}) {
    const headers = {};
    if (jsonBody) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: jsonBody ? JSON.stringify(jsonBody) : undefined
    });

    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function requireAuthFor(menu) {
    const role = getRole();
    if (!tokenValid(role)) return false;

    // Parent cannot access policies/protocols
    if (role === "parent" && (menu === "policies" || menu === "protocols")) return false;

    return true;
  }

  // ========= LOADERS =========
  async function doLogin() {
    const code = (accessCode.value || "").trim();
    const campus = (campusSelect.value || "").trim().toUpperCase();

    setText(loginError, "");

    if (!campus) {
      setText(loginError, "Please select a campus.");
      return;
    }
    if (!code) {
      setText(loginError, "Please enter your access code.");
      return;
    }

    // Try staff first, if fails then parent
    const payload = { code, campus };

    // 1) staff
    let r = await apiFetch("/auth/staff", { method:"POST", jsonBody: payload });
    if (r.res.ok && r.data?.ok && r.data?.token) {
      setCampus(campus);
      setRole("staff");
      setTokenForRole("staff", r.data.token, Number(r.data.until || (now()+8*60*60*1000)));
      toast("Logged in as STAFF ✅");
      afterLogin();
      return;
    }

    // 2) parent
    r = await apiFetch("/auth/parent", { method:"POST", jsonBody: payload });
    if (r.res.ok && r.data?.ok && r.data?.token) {
      setCampus(campus);
      setRole("parent");
      setTokenForRole("parent", r.data.token, Number(r.data.until || (now()+8*60*60*1000)));
      toast("Logged in as PARENT ✅");
      afterLogin();
      return;
    }

    // error message
    const msg = r.data?.error || "Login failed. Check code and try again.";
    setText(loginError, msg);
  }

  function clearAuth() {
    localStorage.removeItem(LS.role);
    localStorage.removeItem(LS.staffToken);
    localStorage.removeItem(LS.staffUntil);
    localStorage.removeItem(LS.parentToken);
    localStorage.removeItem(LS.parentUntil);
    localStorage.removeItem(LS.adminToken);
    localStorage.removeItem(LS.adminUntil);
  }

  async function doAdminLogin() {
    const pin = (adminPin.value || "").trim();
    if (!pin) { toast("Enter admin PIN"); return; }

    const { res, data } = await apiFetch("/auth/admin", {
      method: "POST",
      jsonBody: { pin }
    });

    if (!res.ok || !data?.ok || !data?.token) {
      toast(data?.error || "Admin PIN invalid");
      return;
    }

    localStorage.setItem(LS.adminToken, data.token);
    localStorage.setItem(LS.adminUntil, String(Number(data.until || (now()+30*60*1000))));

    toast("Admin enabled ✅");
    closeAdminModal();
    applyRoleUI(getRole());
  }

  function afterLogin() {
    applyRoleUI(getRole());

    // show UI
    showApp();

    // campus switch in header
    if (campusSwitch) campusSwitch.value = getCampus();

    // clear chat and greet
    chatWindow.innerHTML = "";
    addMsg("assistant", "Hi! Ask any CMS policy, protocol, or parent handbook question.");

    // open deep link if exists
    openDeepLinkIfAny().catch(() => {});
  }

  async function openDeepLinkIfAny() {
    const h = parseHash();
    if (!h.hb) return;

    // open handbook modal and expand section
    await openHandbookModal({ selectHbId: h.hb, expandSecKey: h.sec || "" });
  }

  // ========= MENU MODALS =========
  async function openPoliciesModal() {
    if (!requireAuthFor("policies")) {
      openPanel("Policies");
      menuPanelBody.innerHTML = `
        <div class="list-card">
          <div class="list-title">Error</div>
          <div class="list-meta">Unauthorized (staff token required)</div>
        </div>
      `;
      return;
    }

    const campus = getCampus();
    const token = getToken("staff");

    openPanel("Policies");
    menuPanelBody.innerHTML = `<div class="muted" style="font-weight:800;">Loading…</div>`;

    const { res, data } = await apiFetch(`/policies?campus=${encodeURIComponent(campus)}`, { token });
    if (!res.ok || !data?.ok) {
      menuPanelBody.innerHTML = `
        <div class="list-card">
          <div class="list-title">Error</div>
          <div class="list-meta">${esc(data?.error || "Failed to load policies")}</div>
        </div>
      `;
      return;
    }

    const items = Array.isArray(data.items) ? data.items : [];
    renderSourceList(items, { type: "policy", title: "Policies" });
  }

  async function openProtocolsModal() {
    if (!requireAuthFor("protocols")) {
      openPanel("Protocols");
      menuPanelBody.innerHTML = `
        <div class="list-card">
          <div class="list-title">Error</div>
          <div class="list-meta">Unauthorized (staff token required)</div>
        </div>
      `;
      return;
    }

    const campus = getCampus();
    const token = getToken("staff");

    openPanel("Protocols");
    menuPanelBody.innerHTML = `<div class="muted" style="font-weight:800;">Loading…</div>`;

    const { res, data } = await apiFetch(`/protocols?campus=${encodeURIComponent(campus)}`, { token });
    if (!res.ok || !data?.ok) {
      menuPanelBody.innerHTML = `
        <div class="list-card">
          <div class="list-title">Error</div>
          <div class="list-meta">${esc(data?.error || "Failed to load protocols")}</div>
        </div>
      `;
      return;
    }

    const items = Array.isArray(data.items) ? data.items : [];
    renderSourceList(items, { type: "protocol", title: "Protocols" });
  }

  function renderSourceList(items, { type, title }) {
    const role = getRole();
    const campus = getCampus();

    let q = "";
    const wrapper = document.createElement("div");

    // search
    wrapper.innerHTML = `
      <div class="modal-search">
        <input id="modalSearch" class="text-input" type="text" placeholder="Search ${esc(title)}…" />
      </div>
      <div id="listWrap"></div>
    `;

    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(wrapper);

    const searchEl = wrapper.querySelector("#modalSearch");
    const listWrap = wrapper.querySelector("#listWrap");

    const draw = () => {
      const qq = (q || "").trim().toLowerCase();
      const filtered = !qq ? items : items.filter(it => {
        const hay = [
          it.title, it.summary, it.program, it.id
        ].join(" ").toLowerCase();
        return hay.includes(qq);
      });

      if (!filtered.length) {
        listWrap.innerHTML = `<div class="list-card"><div class="list-title">No results</div><div class="list-meta">Try another keyword.</div></div>`;
        return;
      }

      listWrap.innerHTML = filtered.map(it => {
        const t = it.title || it.name || it.id || "Untitled";
        const summary = it.summary || it.description || "";
        const link = it.link || it.url || "";

        return `
          <div class="list-card">
            <div class="list-title">${esc(t)}</div>
            ${summary ? `<div class="list-meta">${esc(summary)}</div>` : `<div class="list-meta">Campus: ${esc(campus)}</div>`}
            <div class="list-actions">
              <button class="small-btn primary" data-ask="1" data-id="${esc(it.id||"")}" data-title="${esc(t)}">Quick Ask</button>
              ${link ? `<a class="small-btn" href="${esc(link)}" target="_blank" rel="noreferrer">Open document</a>` : ""}
            </div>
          </div>
        `;
      }).join("");

      // bind ask
      listWrap.querySelectorAll("button[data-ask='1']").forEach(btn => {
        btn.addEventListener("click", () => {
          const sid = btn.getAttribute("data-id") || "";
          const st = btn.getAttribute("data-title") || "";
          const prompt = `In ${type.toUpperCase()} "${st}", what does it say about: `;
          userInput.value = prompt;
          userInput.focus();
          // set context hash (optional)
          setHash("", "");
          closePanel();
        });
      });
    };

    searchEl.addEventListener("input", () => { q = searchEl.value; draw(); });

    draw();
  }

  async function openHandbookModal({ selectHbId = "", expandSecKey = "" } = {}) {
    if (!tokenValid(getRole())) {
      openPanel("Parent Handbook");
      menuPanelBody.innerHTML = `
        <div class="list-card">
          <div class="list-title">Error</div>
          <div class="list-meta">Unauthorized (staff/parent token required)</div>
        </div>
      `;
      return;
    }

    const role = getRole();
    const campus = getCampus();
    const token = getToken(role);

    openPanel("Parent Handbook");
    menuPanelBody.innerHTML = `<div class="muted" style="font-weight:800;">Loading…</div>`;

    const { res, data } = await apiFetch(`/handbooks?campus=${encodeURIComponent(campus)}`, { token });
    if (!res.ok || !data?.ok) {
      menuPanelBody.innerHTML = `
        <div class="list-card">
          <div class="list-title">Error</div>
          <div class="list-meta">${esc(data?.error || "Failed to load handbooks")}</div>
        </div>
      `;
      return;
    }

    const handbooks = Array.isArray(data.items) ? data.items : (Array.isArray(data.handbooks) ? data.handbooks : []);
    if (!handbooks.length) {
      menuPanelBody.innerHTML = `
        <div class="list-card">
          <div class="list-title">No handbook</div>
          <div class="list-meta">No campus handbook found for ${esc(campus)}.</div>
        </div>
      `;
      return;
    }

    // pick selected
    const initialHb = selectHbId
      ? handbooks.find(h => h.id === selectHbId) || handbooks[0]
      : handbooks[0];

    renderHandbookUI(handbooks, initialHb, expandSecKey);
  }

  function renderHandbookUI(handbooks, currentHb, expandSecKey) {
    const campus = getCampus();
    const role = getRole();

    let sectionSearch = "";

    // sections may be in:
    // hb.sections OR hb.content (legacy)
    const getSections = (hb) => {
      if (!hb) return [];
      if (Array.isArray(hb.sections)) return hb.sections;
      if (Array.isArray(hb.content)) {
        // fallback legacy: content is string array -> make pseudo sections
        return hb.content.map((c, idx) => ({
          key: `section_${idx+1}`,
          title: `Section ${idx+1}`,
          content: String(c || "")
        }));
      }
      return [];
    };

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div class="list-card">
        <div class="list-title">Parent Handbook (Campus-based)</div>
        <div class="list-meta">Current campus: <b>${esc(campus)}</b> • Role: <b>${esc(role)}</b></div>
      </div>

      <div class="modal-subrow">
        <select id="hbSelect"></select>
      </div>

      <div class="modal-search">
        <input id="secSearch" class="text-input" type="text" placeholder="Search sections…" />
      </div>

      <div id="secList"></div>
    `;

    menuPanelBody.innerHTML = "";
    menuPanelBody.appendChild(wrapper);

    const hbSelect = wrapper.querySelector("#hbSelect");
    const secSearchEl = wrapper.querySelector("#secSearch");
    const secList = wrapper.querySelector("#secList");

    // populate select
    hbSelect.innerHTML = handbooks.map(hb => {
      const label = hb.program ? `${hb.program} — ${hb.title || hb.id}` : (hb.title || hb.id);
      return `<option value="${esc(hb.id)}">${esc(label)}</option>`;
    }).join("");

    hbSelect.value = currentHb?.id || handbooks[0].id;

    const drawSections = (hb, expandKey = "") => {
      const secs = getSections(hb);
      const q = (sectionSearch || "").trim().toLowerCase();

      const filtered = !q ? secs : secs.filter(s => {
        const hay = [s.title, s.key, s.content].join(" ").toLowerCase();
        return hay.includes(q);
      });

      if (!filtered.length) {
        secList.innerHTML = `<div class="list-card"><div class="list-title">No sections</div><div class="list-meta">Try another search keyword.</div></div>`;
        return;
      }

      secList.innerHTML = filtered.map(s => {
        const isOpen = expandKey && s.key === expandKey;
        return `
          <div class="acc ${isOpen ? "open" : ""}" data-key="${esc(s.key)}">
            <button class="acc-head" type="button">
              <div class="acc-title">${esc(s.title || s.key)}</div>
              <div class="acc-caret">${isOpen ? "−" : "+"}</div>
            </button>
            <div class="acc-body">
              <div class="acc-text">${esc(s.content || "")}</div>
              <div class="acc-actions">
                <button class="small-btn primary" data-quickask="1" data-hb="${esc(hb.id)}" data-sec="${esc(s.key)}" data-title="${esc(s.title||s.key)}">Quick Ask</button>
                <button class="small-btn" data-copylink="1" data-hb="${esc(hb.id)}" data-sec="${esc(s.key)}">Copy Link</button>
              </div>
            </div>
          </div>
        `;
      }).join("");

      // accordion toggle
      secList.querySelectorAll(".acc").forEach(acc => {
        const head = acc.querySelector(".acc-head");
        head.addEventListener("click", () => {
          const open = acc.classList.toggle("open");
          const caret = acc.querySelector(".acc-caret");
          if (caret) caret.textContent = open ? "−" : "+";
        });
      });

      // quick ask
      secList.querySelectorAll("button[data-quickask='1']").forEach(btn => {
        btn.addEventListener("click", () => {
          const hbId = btn.getAttribute("data-hb") || "";
          const secKey = btn.getAttribute("data-sec") || "";
          const title = btn.getAttribute("data-title") || "";

          // set deep link
          setHash(hbId, secKey);

          // prefill prompt
          userInput.value = `In Parent Handbook (${campus}) - section "${title}": `;
          userInput.focus();

          toast("Quick Ask ready ✨");
          closePanel();
        });
      });

      // copy link
      secList.querySelectorAll("button[data-copylink='1']").forEach(btn => {
        btn.addEventListener("click", async () => {
          const hbId = btn.getAttribute("data-hb") || "";
          const secKey = btn.getAttribute("data-sec") || "";

          const u = new URL(location.href);
          u.hash = `hb=${encodeURIComponent(hbId)}&sec=${encodeURIComponent(secKey)}`;
          await copyToClipboard(u.toString());
        });
      });
    };

    // initial render
    drawSections(currentHb, expandSecKey || "");

    // on select change
    hbSelect.addEventListener("change", () => {
      const id = hbSelect.value;
      const hb = handbooks.find(x => x.id === id) || handbooks[0];
      currentHb = hb;
      setHash(hb.id, "");
      drawSections(hb, "");
    });

    // section search
    secSearchEl.addEventListener("input", () => {
      sectionSearch = secSearchEl.value;
      drawSections(currentHb, "");
    });

    // if deep link specified, scroll into it
    if (expandSecKey) {
      setTimeout(() => {
        const target = secList.querySelector(`.acc[data-key="${CSS.escape(expandSecKey)}"]`);
        if (target) target.scrollIntoView({ behavior:"smooth", block:"start" });
      }, 50);
    }
  }

  // ========= CHAT ASK =========
  async function ask(q) {
    const role = getRole();
    if (!tokenValid(role)) {
      showLogin("Session expired. Please login again.");
      return;
    }

    const campus = getCampus();
    const token = getToken(role);

    addMsg("user", q);
    addTyping();

    const payload = {
      q,
      campus,
      role
    };

    const { res, data } = await apiFetch("/ask", {
      method: "POST",
      jsonBody: payload,
      token
    });

    removeTyping();

    if (!res.ok || !data?.ok) {
      addMsg("assistant", data?.error || "Error: request failed.");
      return;
    }

    // worker should return answer in: data.answer or data.text
    const answer = data.answer || data.text || JSON.stringify(data);
    addMsg("assistant", answer);
  }

  // ========= EVENTS =========
  // Campus preview helper in login screen
  function updatePreview() {
    if (campusPreview) campusPreview.textContent = campusSelect.value ? campusSelect.value : "—";
  }

  loginForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    doLogin().catch(err => setText(loginError, err?.message || "Login error"));
  });

  campusSelect?.addEventListener("change", () => {
    updatePreview();
  });

  loginAdminBtn?.addEventListener("click", () => {
    openAdminModal();
  });

  adminPinCancel?.addEventListener("click", () => closeAdminModal());
  adminPinSubmit?.addEventListener("click", () => doAdminLogin().catch(() => toast("Admin login error")));
  adminModal?.addEventListener("click", (e) => {
    if (e.target === adminModal) closeAdminModal();
  });

  logoutBtn?.addEventListener("click", () => {
    clearAuth();
    setHash("", "");
    toast("Logged out");
    showLogin("");
  });

  campusSwitch?.addEventListener("change", () => {
    const c = campusSwitch.value || "";
    setCampus(c);

    // if user is in app, keep them in app; just update campus
    toast(`Campus: ${c}`);
  });

  adminModeBtn?.addEventListener("click", () => {
    // if already active => show toast
    if (adminActive()) {
      toast("Admin already active ✅");
      applyRoleUI(getRole());
      return;
    }
    openAdminModal();
  });

  menuPanelClose?.addEventListener("click", closePanel);
  menuOverlay?.addEventListener("click", closePanel);

  // menu buttons
  menuBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      const menu = btn.getAttribute("data-menu");

      // parent cannot open policies/protocols
      if (getRole() === "parent" && (menu === "policies" || menu === "protocols")) {
        toast("Hidden for parents");
        return;
      }

      setActiveMenu(menu);

      if (menu === "policies") await openPoliciesModal();
      else if (menu === "protocols") await openProtocolsModal();
      else if (menu === "handbook") await openHandbookModal();
    });
  });

  chatForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = (userInput.value || "").trim();
    if (!q) return;
    userInput.value = "";
    ask(q).catch(() => addMsg("assistant", "Network error."));
  });

  // ========= INIT =========
  function init() {
    // init campus from storage
    const savedCampus = getCampus();
    if (savedCampus) setCampus(savedCampus);
    else updatePreview();

    // if already logged in
    const role = getRole();
    if (role && tokenValid(role)) {
      applyRoleUI(role);
      showApp();
      if (campusSwitch) campusSwitch.value = getCampus();

      // greet
      chatWindow.innerHTML = "";
      addMsg("assistant", "Welcome back! Ask a question or open Parent Handbook.");

      // deep link
      openDeepLinkIfAny().catch(() => {});
    } else {
      showLogin("");
    }
  }

  init();
})();