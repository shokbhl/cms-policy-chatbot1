// CMS Assistant - app.js (FULL FEATURE)
// - Staff/Parent/Admin login from first screen
// - Campus required (blank default)
// - Parent: only Parent Handbook menu
// - Staff/Admin: Policies + Protocols + Parent Handbook
// - Handbook list per campus + sections clickable
// - Admin mode badge + admin links (Dashboard/Logs)
// - Campus switch inside app + "Campus switched" message

// ====== CONFIG ======
const WORKER_BASE = "https://cms-policy-worker.shokbhl.workers.dev"; // <-- اگر دامنه Workerت فرق دارد اینجا عوض کن

// ====== STORAGE KEYS ======
const LS = {
  token: "cms_token",          // staff/parent token
  role: "cms_role",            // staff | parent
  campus: "cms_campus",
  adminToken: "cms_admin_token",
  adminMode: "cms_admin_mode"  // "1" or ""
};

// ====== DOM ======
const el = {
  loginScreen: document.getElementById("screen-login"),
  appScreen: document.getElementById("screen-app"),

  accessCode: document.getElementById("accessCode"),
  campusSelect: document.getElementById("campusSelect"),
  loginBtn: document.getElementById("loginBtn"),
  loginError: document.getElementById("loginError"),

  adminBtnTop: document.getElementById("adminBtnTop"),     // top-right Admin button (login screen)
  adminModal: document.getElementById("adminModal"),
  adminPin: document.getElementById("adminPin"),
  adminPinError: document.getElementById("adminPinError"),
  adminSubmit: document.getElementById("adminSubmit"),
  adminCancel: document.getElementById("adminCancel"),

  // Header (app)
  topMenuBar: document.getElementById("top-menu-bar"),
  campusSwitch: document.getElementById("headerCampusSelect"),
  badge: document.getElementById("modeBadge"),
  logoutBtn: document.getElementById("logoutBtn"),
  adminLinks: document.getElementById("admin-links"),

  // Menu pills
  pillPolicies: document.querySelector('[data-menu="policies"]'),
  pillProtocols: document.querySelector('[data-menu="protocols"]'),
  pillHandbook: document.querySelector('[data-menu="handbook"]'),

  // Menu panel
  overlay: document.getElementById("overlay"),
  menuPanel: document.getElementById("menuPanel"),
  menuTitle: document.getElementById("menuPanelTitle"),
  menuBody: document.getElementById("menuPanelBody"),
  menuClose: document.getElementById("menuClose"),

  // Chat
  chatHint: document.getElementById("chatHint"),
  chatWindow: document.getElementById("chatWindow"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatSend: document.getElementById("chatSend"),
  toast: document.getElementById("toast")
};

// ====== UTIL ======
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function showToast(msg){
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> el.toast.classList.add("hidden"), 1600);
}

function getCampus(){
  return (localStorage.getItem(LS.campus) || "").toUpperCase();
}

function setCampus(c){
  localStorage.setItem(LS.campus, (c || "").toUpperCase());
}

function getRole(){
  const r = (localStorage.getItem(LS.role) || "").toLowerCase();
  return r;
}

function getToken(){
  return localStorage.getItem(LS.token) || "";
}

function getAdminToken(){
  return localStorage.getItem(LS.adminToken) || "";
}

function isAdminMode(){
  return localStorage.getItem(LS.adminMode) === "1";
}

function setAdminMode(on){
  localStorage.setItem(LS.adminMode, on ? "1" : "");
}

function hasChatToken(){
  const r = getRole();
  const t = getToken();
  return !!t && (r === "staff" || r === "parent");
}

async function apiFetch(path, { method="GET", token="", body=null } = {}){
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${WORKER_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || data?.detail || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Admin fetch uses admin token
async function adminFetch(path){
  const t = getAdminToken();
  if (!t) throw new Error("Admin token missing");
  return apiFetch(path, { method: "GET", token: t });
}

// Any-role fetch (handbooks endpoints allow admin/staff/parent token)
// We will prefer staff/parent token if exists; else admin token.
function anyTokenForBrowse(){
  return getToken() || getAdminToken() || "";
}

function ensureCampusSelected(campus){
  if (!campus) {
    el.loginError.textContent = "Please select a campus.";
    return false;
  }
  return true;
}

// ====== UI STATE ======
function setActivePill(which){
  [el.pillPolicies, el.pillProtocols, el.pillHandbook].forEach(btn => btn?.classList.remove("active"));
  if (which === "policies") el.pillPolicies?.classList.add("active");
  if (which === "protocols") el.pillProtocols?.classList.add("active");
  if (which === "handbook") el.pillHandbook?.classList.add("active");
}

function showMenuPanel(title){
  el.menuTitle.textContent = title;
  el.overlay.classList.remove("hidden");
  el.menuPanel.classList.remove("hidden");
}

function hideMenuPanel(){
  el.overlay.classList.add("hidden");
  el.menuPanel.classList.add("hidden");
  el.menuBody.innerHTML = "";
}

function showLogin(){
  el.loginScreen.classList.remove("hidden");
  el.appScreen.classList.add("hidden");
  el.topMenuBar.classList.add("hidden");
}

function showApp(){
  el.loginScreen.classList.add("hidden");
  el.appScreen.classList.remove("hidden");
  el.topMenuBar.classList.remove("hidden");
}

function applyRoleUI(){
  const role = getRole();
  const admin = isAdminMode();

  // Badge
  if (admin) {
    el.badge.textContent = "ADMIN";
    el.badge.classList.add("admin");
    el.badge.classList.remove("staff","parent");
  } else if (role === "staff") {
    el.badge.textContent = "STAFF";
    el.badge.classList.add("staff");
    el.badge.classList.remove("admin","parent");
  } else if (role === "parent") {
    el.badge.textContent = "PARENT";
    el.badge.classList.add("parent");
    el.badge.classList.remove("admin","staff");
  } else {
    el.badge.textContent = "GUEST";
    el.badge.classList.remove("admin","staff","parent");
  }

  // Admin links visible only if admin mode
  el.adminLinks.classList.toggle("hidden", !admin);

  // Menu pills by role
  const showPoliciesProtocols = admin || role === "staff";
  el.pillPolicies.classList.toggle("hidden", !showPoliciesProtocols);
  el.pillProtocols.classList.toggle("hidden", !showPoliciesProtocols);

  // Parent handbook always visible for all roles
  el.pillHandbook.classList.remove("hidden");

  // Chat hint + chat lock
  if (hasChatToken()) {
    el.chatHint.textContent = "Ask any CMS policy, protocol, or parent handbook question (campus-based).";
    el.chatSend.disabled = false;
    el.chatInput.disabled = false;
  } else if (admin) {
    el.chatHint.textContent =
      "✅ Admin mode enabled. You can browse Policies/Protocols/Parent Handbook and access Dashboard/Logs.\nTo ask questions in chat, login with a Staff or Parent code.";
    el.chatSend.disabled = true;
    el.chatInput.disabled = true;
  } else {
    el.chatHint.textContent = "Please login to ask questions.";
    el.chatSend.disabled = true;
    el.chatInput.disabled = true;
  }
}

function syncCampusSelects(){
  const c = getCampus();
  if (el.campusSelect) el.campusSelect.value = c || "";
  if (el.campusSwitch) el.campusSwitch.value = c || "";
}

// ====== CHAT ======
function addMsg(role, text){
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = escapeHtml(text);
  el.chatWindow.appendChild(div);
  el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
}

function addTyping(){
  const wrap = document.createElement("div");
  wrap.className = "typing-bubble";
  wrap.id = "typingBubble";
  wrap.innerHTML = `
    <div class="typing-dots">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  el.chatWindow.appendChild(wrap);
  el.chatWindow.scrollTop = el.chatWindow.scrollHeight;
}

function removeTyping(){
  const b = document.getElementById("typingBubble");
  if (b) b.remove();
}

// ====== HANDBOOK UI ======
async function renderHandbookList(){
  const campus = getCampus();
  if (!campus) {
    el.menuBody.innerHTML = `<div class="muted">Select a campus first.</div>`;
    return;
  }

  const token = anyTokenForBrowse();
  if (!token) {
    el.menuBody.innerHTML = `<div class="muted">Not logged in.</div>`;
    return;
  }

  el.menuBody.innerHTML = `<div class="muted">Loading handbooks…</div>`;

  const data = await apiFetch(`/handbooks?campus=${encodeURIComponent(campus)}`, { token });

  const list = data.handbooks || [];
  if (!list.length) {
    el.menuBody.innerHTML = `<div class="muted">No handbooks found for campus ${escapeHtml(campus)}. (Fill KV: handbook_${campus})</div>`;
    return;
  }

  el.menuBody.innerHTML = `
    <div class="menu-group-label">Parent Handbook (Campus: ${escapeHtml(campus)})</div>
    ${list.map(hb => `
      <div class="hb-card">
        <div class="hb-title">${escapeHtml(hb.title || "Parent Handbook")}</div>
        <div class="hb-meta">${escapeHtml([hb.program, `sections: ${hb.sections_count}`].filter(Boolean).join(" • "))}</div>
        ${hb.link ? `<a class="hb-open-link" target="_blank" rel="noreferrer" href="${escapeHtml(hb.link)}">Open source link</a>` : ``}
        <div class="hb-open-row">
          <button class="hb-open-btn" data-open-hb="${escapeHtml(hb.id)}">View sections</button>
        </div>
      </div>
    `).join("")}
  `;

  el.menuBody.querySelectorAll("[data-open-hb]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-open-hb");
      await renderHandbookSections(id);
    });
  });
}

async function renderHandbookSections(hbId){
  const campus = getCampus();
  const token = anyTokenForBrowse();
  el.menuBody.innerHTML = `<div class="muted">Loading sections…</div>`;

  const data = await apiFetch(`/handbook?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(hbId)}`, { token });
  const hb = data.handbook || {};
  const sections = data.sections || [];

  el.menuBody.innerHTML = `
    <div class="menu-group-label">Handbook</div>
    <div class="hb-card">
      <div class="hb-title">${escapeHtml(hb.title || "")}</div>
      <div class="hb-meta">${escapeHtml([hb.program, hb.campus].filter(Boolean).join(" • "))}</div>
      <div class="hb-open-row">
        <button class="secondary-btn" id="hbBackBtn">← Back</button>
        ${hb.link ? `<a class="hb-open-link" target="_blank" rel="noreferrer" href="${escapeHtml(hb.link)}">Open source link</a>` : ``}
      </div>
    </div>

    <div class="menu-group-label">Sections</div>
    ${sections.map(s => `
      <button class="hb-section-btn" data-sec-key="${escapeHtml(s.key || "")}" data-sec-title="${escapeHtml(s.title || "")}">
        ${escapeHtml(s.title || "Section")}
      </button>
    `).join("")}

    <div id="secView" class="hb-card hidden">
      <div class="hb-title" id="secTitle"></div>
      <div class="hb-meta muted">Tip: You can ask about this section in chat.</div>
      <div style="margin-top:10px; white-space:pre-wrap; line-height:1.4;" id="secContent"></div>
      <div class="hb-open-row">
        <button class="hb-open-btn" id="askAboutSectionBtn">Ask about this section</button>
      </div>
    </div>
  `;

  document.getElementById("hbBackBtn").addEventListener("click", renderHandbookList);

  const secView = document.getElementById("secView");
  const secTitle = document.getElementById("secTitle");
  const secContent = document.getElementById("secContent");
  const askBtn = document.getElementById("askAboutSectionBtn");

  el.menuBody.querySelectorAll("[data-sec-key]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-sec-key") || "";
      const title = btn.getAttribute("data-sec-title") || "";
      const sec = sections.find(x => String(x.key || "") === key) || {};

      secTitle.textContent = title;
      secContent.textContent = sec.content || "";
      secView.classList.remove("hidden");

      askBtn.onclick = () => {
        hideMenuPanel();
        if (!hasChatToken()) {
          showToast("Chat is locked. Login with Staff/Parent code to ask questions.");
          return;
        }
        el.chatInput.value = `Using the Parent Handbook section "${title}", please answer: `;
        el.chatInput.focus();
      };
    });
  });
}

// ====== POLICIES/PROTOCOLS MENU ======
function renderPoliciesInfo(){
  el.menuBody.innerHTML = `
    <div class="hb-card">
      <div class="hb-title">Policies</div>
      <div class="hb-meta">
        Ask in chat (staff/parent only). Admin-only can browse handbooks and access logs/dashboard.
      </div>
    </div>
  `;
}

function renderProtocolsInfo(){
  el.menuBody.innerHTML = `
    <div class="hb-card">
      <div class="hb-title">Protocols</div>
      <div class="hb-meta">
        Ask in chat (staff/parent only). Admin-only can browse handbooks and access logs/dashboard.
      </div>
    </div>
  `;
}

// ====== LOGIN FLOW ======
async function loginStaffOrParent(){
  el.loginError.textContent = "";
  const campus = (el.campusSelect.value || "").toUpperCase();
  if (!ensureCampusSelected(campus)) return;

  const code = (el.accessCode.value || "").trim();
  if (!code) {
    el.loginError.textContent = "Enter your access code.";
    return;
  }

  // Try staff first, then parent
  try {
    const staff = await apiFetch("/auth/staff", { method: "POST", body: { code } });
    localStorage.setItem(LS.token, staff.token);
    localStorage.setItem(LS.role, "staff");
    setCampus(campus);
    setAdminMode(false);
    showApp();
    syncCampusSelects();
    applyRoleUI();
    showToast("Logged in as Staff");
    return;
  } catch (e1) {
    // continue to parent
  }

  try {
    const parent = await apiFetch("/auth/parent", { method: "POST", body: { code } });
    localStorage.setItem(LS.token, parent.token);
    localStorage.setItem(LS.role, "parent");
    setCampus(campus);
    setAdminMode(false);
    showApp();
    syncCampusSelects();
    applyRoleUI();
    showToast("Logged in as Parent");
    return;
  } catch (e2) {
    el.loginError.textContent = "Invalid code.";
  }
}

function openAdminModal(){
  el.adminPin.value = "";
  el.adminPinError.textContent = "";
  el.adminModal.classList.remove("hidden");
  el.adminPin.focus();
}

function closeAdminModal(){
  el.adminModal.classList.add("hidden");
}

async function loginAdminPin(){
  el.adminPinError.textContent = "";
  const campus = (el.campusSelect.value || "").toUpperCase();
  if (!ensureCampusSelected(campus)) return;

  const pin = (el.adminPin.value || "").trim();
  if (!pin) {
    el.adminPinError.textContent = "Enter admin PIN.";
    return;
  }

  try {
    const admin = await apiFetch("/auth/admin", { method: "POST", body: { pin } });
    localStorage.setItem(LS.adminToken, admin.token);
    setCampus(campus);
    setAdminMode(true);

    // NOTE: admin-only does not set cms_token/cms_role
    // user can still browse handbook + access logs/dashboard
    showApp();
    syncCampusSelects();
    applyRoleUI();
    closeAdminModal();
    showToast("Admin mode enabled");
  } catch (e) {
    el.adminPinError.textContent = "Invalid admin PIN.";
  }
}

function logoutAll(){
  localStorage.removeItem(LS.token);
  localStorage.removeItem(LS.role);
  localStorage.removeItem(LS.adminToken);
  localStorage.removeItem(LS.adminMode);

  // keep campus selection
  el.chatWindow.innerHTML = "";
  el.accessCode.value = "";
  el.loginError.textContent = "";

  showLogin();
  syncCampusSelects();
  applyRoleUI();
  showToast("Logged out");
}

// ====== EVENTS ======
el.loginBtn.addEventListener("click", loginStaffOrParent);
el.accessCode.addEventListener("keydown", (e) => { if (e.key === "Enter") loginStaffOrParent(); });

el.adminBtnTop.addEventListener("click", openAdminModal);
el.adminCancel.addEventListener("click", closeAdminModal);
el.adminSubmit.addEventListener("click", loginAdminPin);
el.adminPin.addEventListener("keydown", (e) => { if (e.key === "Enter") loginAdminPin(); });

el.logoutBtn.addEventListener("click", logoutAll);

el.menuClose.addEventListener("click", hideMenuPanel);
el.overlay.addEventListener("click", hideMenuPanel);

// Campus switch in app
el.campusSwitch.addEventListener("change", () => {
  const c = (el.campusSwitch.value || "").toUpperCase();
  if (!c) return;
  setCampus(c);
  // keep login campus select in sync too
  syncCampusSelects();
  showToast(`Campus switched: ${c}`);
});

// Menu buttons
el.pillPolicies.addEventListener("click", () => {
  setActivePill("policies");
  showMenuPanel("Policies");
  renderPoliciesInfo();
});

el.pillProtocols.addEventListener("click", () => {
  setActivePill("protocols");
  showMenuPanel("Protocols");
  renderProtocolsInfo();
});

el.pillHandbook.addEventListener("click", async () => {
  setActivePill("handbook");
  showMenuPanel("Parent Handbook");
  try {
    await renderHandbookList();
  } catch (e) {
    el.menuBody.innerHTML = `<div class="muted">Error: ${escapeHtml(e.message)}</div>`;
  }
});

// Chat submit
el.chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!hasChatToken()) {
    showToast("Chat is locked. Login with Staff/Parent code.");
    return;
  }

  const campus = getCampus();
  if (!campus) {
    showToast("Select a campus first.");
    return;
  }

  const q = (el.chatInput.value || "").trim();
  if (!q) return;

  addMsg("user", q);
  el.chatInput.value = "";

  addTyping();
  try {
    const data = await apiFetch("/api", {
      method: "POST",
      token: getToken(),
      body: { query: q, campus }
    });

    removeTyping();

    const ans = data.answer || "(No answer)";
    addMsg("assistant", ans);

  } catch (err) {
    removeTyping();
    addMsg("assistant", `Error: ${err.message}`);
  }
});

// ====== INIT ======
(function init(){
  // Campus default blank allowed; keep saved campus if exists
  syncCampusSelects();

  // If user has tokens, go to app
  const admin = isAdminMode() && getAdminToken();
  const chatOk = getToken() && (getRole() === "staff" || getRole() === "parent");

  if (admin || chatOk) {
    showApp();
  } else {
    showLogin();
  }

  applyRoleUI();
})();