/* =========================
   app.js (FULL)
   - Uses /api (Cloudflare Pages Function) -> Worker
   - Fetches Policies/Protocols/Handbooks from KV
   - KV Keys:
     cms_policies: key "policies"
     cms_protocols: key "protocols"
     cms_handbooks: keys "handbook_YC" "handbook_MC" "handbook_SC" "handbook_TC" "handbook_WC"
========================= */

(() => {
  const API_URL = "/api";
  const CAMPUSES = ["YC", "MC", "SC", "TC", "WC"];

  const LS = {
    role: "cms_role",      // parent | staff
    campus: "cms_campus",
    staffToken: "cms_staff_token",
    staffUntil: "cms_staff_until"
  };

  // DOM
  const el = (id) => document.getElementById(id);

  const roleParent = el("roleParent");
  const roleStaff = el("roleStaff");
  const campusGrid = el("campusGrid");
  const staffCodeRow = el("staffCodeRow");
  const staffCode = el("staffCode");
  const btnLogin = el("btnLogin");
  const btnContinueParent = el("btnContinueParent");

  const infoRole = el("infoRole");
  const infoCampus = el("infoCampus");

  const menuPolicies = el("menuPolicies");
  const menuProtocols = el("menuProtocols");
  const menuHandbook = el("menuHandbook");

  const countPolicies = el("countPolicies");
  const countProtocols = el("countProtocols");
  const countHandbook = el("countHandbook");

  const btnLogout = el("btnLogout");
  const btnRefresh = el("btnRefresh");

  const searchBox = el("searchBox");
  const contentTitle = el("contentTitle");
  const contentMeta = el("contentMeta");
  const list = el("list");
  const emptyState = el("emptyState");

  const detailTitle = el("detailTitle");
  const detailBody = el("detailBody");
  const btnCopy = el("btnCopy");
  const footerNote = el("footerNote");

  // State
  const state = {
    role: "parent",
    campus: "YC",
    menu: "policies", // policies | protocols | handbook
    allItems: [],
    filtered: [],
    selectedItem: null,
    caches: {
      policies: null,
      protocols: null,
      handbook: {} // campus -> items
    }
  };

  // ---------- Helpers ----------
  function nowSec() { return Math.floor(Date.now() / 1000); }
  function setLS(k, v) { localStorage.setItem(k, v); }
  function getLS(k) { return localStorage.getItem(k); }
  function delLS(k) { localStorage.removeItem(k); }

  function safeText(v) {
    if (v === null || v === undefined) return "";
    return String(v);
  }

  function escapeHtml(str) {
    return safeText(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(msg) {
    // simple non-intrusive
    footerNote.textContent = msg;
    setTimeout(() => {
      footerNote.textContent = "Connected via /api";
    }, 2200);
  }

  // POST to Pages /api (which proxies to Worker)
  async function apiPost(payload) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }

    if (!res.ok) {
      const err = data?.error || `HTTP ${res.status}`;
      throw new Error(err);
    }

    return data;
  }

  function isStaffAuthed() {
    const t = getLS(LS.staffToken);
    const until = parseInt(getLS(LS.staffUntil) || "0", 10);
    return !!t && until > nowSec();
  }

  function requireCampus() {
    if (!state.campus) throw new Error("Select a campus");
  }

  function activeBtn(btn, on) {
    btn.classList.toggle("active", !!on);
  }

  function setRole(role) {
    state.role = role;
    setLS(LS.role, role);

    activeBtn(roleParent, role === "parent");
    activeBtn(roleStaff, role === "staff");

    if (role === "staff") {
      staffCodeRow.style.display = "";
      btnContinueParent.parentElement.style.display = "none";
    } else {
      staffCodeRow.style.display = "none";
      btnContinueParent.parentElement.style.display = "";
    }

    infoRole.textContent = role.toUpperCase();
  }

  function setCampus(c) {
    state.campus = c;
    setLS(LS.campus, c);
    infoCampus.textContent = c;

    // highlight campus buttons
    [...campusGrid.querySelectorAll(".campusBtn")].forEach(b => {
      b.classList.toggle("active", b.dataset.campus === c);
    });
  }

  function setMenu(menu) {
    state.menu = menu;

    activeBtn(menuPolicies, menu === "policies");
    activeBtn(menuProtocols, menu === "protocols");
    activeBtn(menuHandbook, menu === "handbook");

    if (menu === "policies") contentTitle.textContent = "Policies";
    if (menu === "protocols") contentTitle.textContent = "Protocols";
    if (menu === "handbook") contentTitle.textContent = "Parent Handbook";

    contentMeta.textContent = `Role: ${state.role.toUpperCase()} • Campus: ${state.campus}`;

    searchBox.value = "";
    render();
  }

  // ---------- Data Fetch ----------
  async function loadPolicies() {
    if (state.caches.policies) return state.caches.policies;

    const data = await apiPost({ op: "list_policies" });
    const items = Array.isArray(data?.items) ? data.items : [];
    state.caches.policies = items;
    countPolicies.textContent = String(items.length);
    return items;
  }

  async function loadProtocols() {
    if (state.caches.protocols) return state.caches.protocols;

    const data = await apiPost({ op: "list_protocols" });
    const items = Array.isArray(data?.items) ? data.items : [];
    state.caches.protocols = items;
    countProtocols.textContent = String(items.length);
    return items;
  }

  async function loadHandbook(campus) {
    if (state.caches.handbook[campus]) return state.caches.handbook[campus];

    const data = await apiPost({ op: "handbook", campus });
    const items = Array.isArray(data?.items) ? data.items : [];
    state.caches.handbook[campus] = items;
    countHandbook.textContent = String(items.length);
    return items;
  }

  async function refreshCurrentMenu() {
    requireCampus();

    try {
      toast("Loading…");

      let items = [];
      if (state.menu === "policies") items = await loadPolicies();
      if (state.menu === "protocols") items = await loadProtocols();
      if (state.menu === "handbook") items = await loadHandbook(state.campus);

      state.allItems = items;
      applySearch();
      toast("Loaded ✅");
    } catch (e) {
      toast(`Error: ${e.message}`);
      state.allItems = [];
      applySearch();
    }
  }

  // ---------- Render ----------
  function applySearch() {
    const q = safeText(searchBox.value).trim().toLowerCase();

    if (!q) {
      state.filtered = [...state.allItems];
    } else {
      state.filtered = state.allItems.filter(it => {
        const title = safeText(it.title).toLowerCase();
        const keywords = Array.isArray(it.keywords) ? it.keywords.join(" ").toLowerCase() : safeText(it.keywords).toLowerCase();
        const program = safeText(it.program).toLowerCase();
        const campus = safeText(it.campus).toLowerCase();
        return title.includes(q) || keywords.includes(q) || program.includes(q) || campus.includes(q);
      });
    }

    renderList();
  }

  function render() {
    renderList();
    renderDetail(null);
  }

  function renderList() {
    list.innerHTML = "";
    emptyState.style.display = (state.filtered.length === 0) ? "" : "none";

    state.filtered.forEach((it) => {
      const div = document.createElement("div");
      div.className = "item";
      div.tabIndex = 0;

      const title = escapeHtml(it.title || it.id || "Untitled");
      const metaParts = [];
      if (it.campus) metaParts.push(`Campus: ${escapeHtml(it.campus)}`);
      if (it.program) metaParts.push(`Program: ${escapeHtml(it.program)}`);
      if (it.type) metaParts.push(`${escapeHtml(it.type)}`);

      div.innerHTML = `
        <div class="itemTitle">${title}</div>
        <div class="itemMeta">${metaParts.join(" • ") || "—"}</div>
      `;

      div.addEventListener("click", () => renderDetail(it));
      div.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          renderDetail(it);
        }
      });

      list.appendChild(div);
    });
  }

  function renderDetail(it) {
    state.selectedItem = it;

    if (!it) {
      detailTitle.textContent = "Select an item";
      detailBody.innerHTML = `<div class="muted">Click an item to see details here.</div>`;
      return;
    }

    detailTitle.textContent = it.title || it.id || "Details";

    // Build pretty detail
    const lines = [];

    // common fields
    if (it.campus) lines.push(`<div><b>Campus:</b> ${escapeHtml(it.campus)}</div>`);
    if (it.program) lines.push(`<div><b>Program:</b> ${escapeHtml(it.program)}</div>`);
    if (it.type) lines.push(`<div><b>Type:</b> ${escapeHtml(it.type)}</div>`);
    if (it.id) lines.push(`<div><b>ID:</b> ${escapeHtml(it.id)}</div>`);

    if (it.keywords) {
      const kws = Array.isArray(it.keywords) ? it.keywords : [it.keywords];
      const chips = kws
        .filter(Boolean)
        .map(k => `<span class="pill soft" style="display:inline-block;margin:4px 6px 0 0;">${escapeHtml(k)}</span>`)
        .join("");
      lines.push(`<div style="margin-top:10px;"><b>Keywords:</b><div>${chips || `<span class="muted">—</span>`}</div></div>`);
    }

    // content / sections
    if (it.content) {
      lines.push(`<div style="margin-top:12px;"><b>Content:</b><div style="margin-top:6px;">${escapeHtml(it.content).replaceAll("\n", "<br>")}</div></div>`);
    }

    if (Array.isArray(it.sections) && it.sections.length) {
      const secHtml = it.sections.map(s => {
        const st = escapeHtml(s.title || "");
        const sb = escapeHtml(s.body || "").replaceAll("\n", "<br>");
        return `
          <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(229,231,235,0.9);">
            <div style="font-weight:900;margin-bottom:6px;">${st || "Section"}</div>
            <div>${sb || `<span class="muted">—</span>`}</div>
          </div>
        `;
      }).join("");
      lines.push(`<div style="margin-top:12px;"><b>Sections:</b>${secHtml}</div>`);
    }

    // fallback: show raw JSON
    lines.push(`
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(229,231,235,0.9);">
        <div style="font-weight:900;margin-bottom:6px;">Raw</div>
        <pre style="white-space:pre-wrap;background:#fff;border:1px solid rgba(229,231,235,0.95);padding:10px;border-radius:14px;margin:0;">${escapeHtml(JSON.stringify(it, null, 2))}</pre>
      </div>
    `);

    detailBody.innerHTML = lines.join("");
  }

  async function copySelected() {
    if (!state.selectedItem) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.selectedItem, null, 2));
      toast("Copied ✅");
    } catch {
      toast("Copy failed");
    }
  }

  // ---------- Auth ----------
  async function staffLogin() {
    requireCampus();
    const code = safeText(staffCode.value).trim();
    if (!code) return toast("Enter staff code");

    try {
      toast("Logging in…");
      const data = await apiPost({ op: "staff_login", campus: state.campus, code });

      // Expect { ok:true, token, ttl_seconds }
      if (!data?.ok || !data?.token) throw new Error(data?.error || "Login failed");

      const ttl = parseInt(data.ttl_seconds || "3600", 10);
      setLS(LS.staffToken, data.token);
      setLS(LS.staffUntil, String(nowSec() + ttl));

      toast("Staff login ✅");
      await refreshCurrentMenu();
    } catch (e) {
      toast(`Login error: ${e.message}`);
    }
  }

  function logout() {
    delLS(LS.staffToken);
    delLS(LS.staffUntil);
    toast("Logged out");
  }

  // ---------- Init UI ----------
  function mountCampusButtons() {
    campusGrid.innerHTML = "";
    CAMPUSES.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "campusBtn";
      b.textContent = c;
      b.dataset.campus = c;
      b.addEventListener("click", async () => {
        setCampus(c);
        // reload handbook count correctly if in handbook menu
        await refreshCurrentMenu();
      });
      campusGrid.appendChild(b);
    });
  }

  function bindEvents() {
    roleParent.addEventListener("click", async () => {
      setRole("parent");
      await refreshCurrentMenu();
    });
    roleStaff.addEventListener("click", async () => {
      setRole("staff");
      await refreshCurrentMenu();
    });

    btnLogin.addEventListener("click", staffLogin);
    staffCode.addEventListener("keydown", (e) => {
      if (e.key === "Enter") staffLogin();
    });

    btnContinueParent.addEventListener("click", async () => {
      toast("Parent mode ✅");
      await refreshCurrentMenu();
    });

    menuPolicies.addEventListener("click", async () => {
      setMenu("policies");
      await refreshCurrentMenu();
    });
    menuProtocols.addEventListener("click", async () => {
      setMenu("protocols");
      await refreshCurrentMenu();
    });
    menuHandbook.addEventListener("click", async () => {
      setMenu("handbook");
      await refreshCurrentMenu();
    });

    searchBox.addEventListener("input", applySearch);

    btnLogout.addEventListener("click", () => {
      logout();
      // stay in parent mode by default
      setRole("parent");
      refreshCurrentMenu();
    });

    btnRefresh.addEventListener("click", async () => {
      // clear caches and reload
      state.caches.policies = null;
      state.caches.protocols = null;
      state.caches.handbook = {};
      countPolicies.textContent = "0";
      countProtocols.textContent = "0";
      countHandbook.textContent = "0";
      await refreshCurrentMenu();
    });

    btnCopy.addEventListener("click", copySelected);
  }

  async function init() {
    mountCampusButtons();
    bindEvents();

    // load saved
    const savedRole = getLS(LS.role) || "parent";
    const savedCampus = getLS(LS.campus) || "YC";

    setRole(savedRole === "staff" ? "staff" : "parent");
    setCampus(CAMPUSES.includes(savedCampus) ? savedCampus : "YC");

    // If staff but token expired, switch to parent quietly
    if (state.role === "staff" && !isStaffAuthed()) {
      setRole("parent");
    }

    setMenu("policies");
    await refreshCurrentMenu();
  }

  init();
})();
