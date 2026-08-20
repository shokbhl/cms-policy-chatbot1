// ============================================================
// CMS Assistant v2 — app.js
// Login → campus/program → chat, plus document and handbook browsing.
// ============================================================

// Point this at your deployed v2 Worker.
// Served from localhost -> talk to `wrangler dev`; otherwise the deployed Worker.
const WORKER_BASE =
  ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8787"
    : "https://cms-assistant-v2.shokbhl.workers.dev";

const URLS = {
  api: `${WORKER_BASE}/api`,
  staff: `${WORKER_BASE}/auth/staff`,
  admin: `${WORKER_BASE}/auth/admin`,
  handbooks: `${WORKER_BASE}/handbooks`,
  doc: `${WORKER_BASE}/doc`,
  health: `${WORKER_BASE}/health`,
  feedback: `${WORKER_BASE}/feedback`,
};

const LS = {
  token: "cms2_token",
  role: "cms2_role",
  until: "cms2_until",
  adminToken: "cms2_admin_token",
  adminUntil: "cms2_admin_until",
  campus: "cms2_campus",
  program: "cms2_program",
};

const PROGRAM_LABELS = {
  ALL: "All Programs",
  PRESCHOOL: "Preschool",
  SR_CASA: "Sr. Casa",
  ELEMENTARY: "Elementary",
};

// Menu items. Ids must match the document ids in KV.
const MENU_ITEMS = {
  policies: [
    { id: "safe_arrival", label: "Arrival & Dismissal" },
    { id: "playground_safety", label: "Playground Safety" },
    { id: "anaphylaxis_policy", label: "Anaphylaxis Policy" },
    { id: "medication_administration", label: "Medication Administration" },
    { id: "sleep_toddlers", label: "Sleep – Toddler & Preschool" },
    { id: "sleep_infants", label: "Sleep – Infants" },
    { id: "students_volunteers", label: "Students & Volunteers" },
    { id: "waiting_list", label: "Waiting List" },
    { id: "staff_development", label: "Staff Development" },
    { id: "program_statement", label: "Program Statement" },
    { id: "parent_issues_concerns", label: "Parent Issues & Concerns" },
    { id: "monitoring_compliance_contraventions", label: "Monitoring Compliance & Contraventions" },
    { id: "fire_safety", label: "Fire Safety" },
    { id: "emergency_management", label: "Emergency Management" },
    { id: "criminal_reference_vsc_policy", label: "Criminal Reference / VSC" },
    { id: "health_policy", label: "Health & Infection Prevention" },
    { id: "sanitary_practices", label: "Sanitary Practices & Illness" },
    { id: "prohibited_practices", label: "Prohibited Practices" },
  ],
  protocols: [
    { id: "protocolprogramstatement", label: "Program Statement & Implementation" },
    { id: "non_discrimination", label: "Non-Discrimination / Anti-Racism" },
    { id: "safety_security", label: "Safety & Security" },
    { id: "start_school_year", label: "Start of School Year" },
    { id: "employee_conduct", label: "Employee Conduct" },
    { id: "classroom_management", label: "Classroom Management" },
    { id: "caring_students", label: "Caring for Our Students" },
    { id: "afterschool_routines", label: "Afterschool Routines" },
    { id: "special_events", label: "Special Events" },
    { id: "reports_forms", label: "Reports & Forms" },
    { id: "other", label: "Other" },
    { id: "closing", label: "In Closing" },
  ],
};

// ============================================================
// DOM
// ============================================================

const $ = (id) => document.getElementById(id);

const loginScreen = $("login-screen");
const chatScreen = $("chat-screen");
const loginForm = $("login-form");
const loginSubmit = $("login-submit");
const accessCodeInput = $("access-code");
const loginError = $("login-error");
const campusSelect = $("campus-select");

const headerActions = $("header-actions");
const campusSwitch = $("campus-switch");
const programSwitch = $("program-switch");
const modeBadge = $("mode-badge");
const logoutBtn = $("logout-btn");
const statusLine = $("status-line");

const topMenuBar = $("top-menu-bar");
const adminLinks = $("admin-links");
const menuPills = document.querySelectorAll(".menu-pill");

const menuPanel = $("menu-panel");
const menuPanelTitle = $("menu-panel-title");
const menuPanelBody = $("menu-panel-body");
const menuPanelClose = $("menu-panel-close");
const menuOverlay = $("menu-overlay");

const chatWindow = $("chat-window");
const chatForm = $("chat-form");
const userInput = $("user-input");

const adminModeBtn = $("admin-mode-btn");
const loginAdminBtn = $("login-admin-btn");
const adminModal = $("admin-modal");
const adminPinInput = $("admin-pin");
const adminPinSubmit = $("admin-pin-submit");
const adminPinCancel = $("admin-pin-cancel");
const togglePasswordBtn = $("toggle-password");

let typingBubble = null;
let openHandbookId = null;

const caches = {
  handbooks: new Map(),
  sections: new Map(),
  docs: new Map(),
  answers: new Map(),
};

// ============================================================
// Helpers
// ============================================================

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addMessage(role, html) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = html;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return el;
}

function clearChat() {
  chatWindow.innerHTML = "";
}

function showTyping() {
  hideTyping();
  const wrap = document.createElement("div");
  wrap.className = "typing-bubble";
  wrap.innerHTML = `<div class="typing-dots">${'<div class="typing-dot"></div>'.repeat(3)}</div>
                    <span class="small muted">Looking through the documents…</span>`;
  chatWindow.appendChild(wrap);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  typingBubble = wrap;
}

function hideTyping() {
  typingBubble?.remove();
  typingBubble = null;
}

function setLoginError(text) {
  loginError.textContent = text || "";
}

// ---- session ----

function isActive(tokenKey, untilKey) {
  return Boolean(localStorage.getItem(tokenKey)) &&
         Date.now() < Number(localStorage.getItem(untilKey) || "0");
}

const isSignedIn = () => isActive(LS.token, LS.until);
const isAdmin = () => isActive(LS.adminToken, LS.adminUntil);

const getToken = () => (isSignedIn() ? localStorage.getItem(LS.token) : "");
const getRole = () => (isSignedIn() ? localStorage.getItem(LS.role) || "" : "");
const getAdminToken = () => (isAdmin() ? localStorage.getItem(LS.adminToken) : "");

// Chat needs a staff session; browsing accepts admin too.
const getBrowseToken = () => getToken() || getAdminToken();

function saveSession(role, token, expiresIn) {
  localStorage.setItem(LS.token, token);
  localStorage.setItem(LS.role, role);
  localStorage.setItem(LS.until, String(Date.now() + (expiresIn || 28800) * 1000));
}

function clearSession() {
  [LS.token, LS.role, LS.until].forEach((k) => localStorage.removeItem(k));
}

function clearAdmin() {
  [LS.adminToken, LS.adminUntil].forEach((k) => localStorage.removeItem(k));
}

function clearCaches() {
  Object.values(caches).forEach((m) => m.clear());
}

// ---- campus / program ----

const getCampus = () => (localStorage.getItem(LS.campus) || "").toUpperCase();
const getProgram = () => localStorage.getItem(LS.program) || "ALL";

function setCampus(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c) localStorage.setItem(LS.campus, c);
  else localStorage.removeItem(LS.campus);
  if (campusSelect) campusSelect.value = c;
  if (campusSwitch) campusSwitch.value = c;
}

function setProgram(p) {
  const v = String(p || "ALL").toUpperCase();
  localStorage.setItem(LS.program, v);
  if (programSwitch) programSwitch.value = v;
}

function renderStatusLine() {
  const campus = getCampus() || "(not selected)";
  statusLine.innerHTML =
    `Campus <b>${escapeHtml(campus)}</b> · Program <b>${escapeHtml(PROGRAM_LABELS[getProgram()] || "All Programs")}</b>`;
}

// ============================================================
// Screens
// ============================================================

function applyRoleUI() {
  const role = getRole();
  const admin = isAdmin();

  modeBadge.textContent = admin && !role ? "ADMIN" : (role || "staff").toUpperCase();
  modeBadge.classList.toggle("admin", admin && !role);

  adminLinks.classList.toggle("hidden", !admin);

  // Staff reach everything: policies, protocols and the parent handbooks they
  // answer families from.
  menuPills.forEach((btn) => { btn.style.display = ""; });
}

function showLogin() {
  closeMenu();
  chatScreen.classList.add("hidden");
  topMenuBar.classList.add("hidden");
  headerActions.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function showChat() {
  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  topMenuBar.classList.remove("hidden");
  headerActions.classList.remove("hidden");

  setProgram(getProgram());
  setCampus(getCampus());
  applyRoleUI();
  renderStatusLine();
}

// ============================================================
// Requests
// ============================================================

async function apiGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ============================================================
// Login
// ============================================================

loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoginError("");

  const campus = (campusSelect.value || "").toUpperCase();
  const code = accessCodeInput.value.trim();

  if (!campus) return setLoginError("Please select a campus.");
  if (!code) return setLoginError("Please enter your access code.");

  loginSubmit.disabled = true;
  loginSubmit.textContent = "Signing in…";

  try {
    // Staff only. The Worker still exposes /auth/parent, but this assistant
    // has no parent users, so the front end does not offer that route.
    const role = "staff";
    const res = await fetch(URLS.staff, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      return setLoginError(data.error || "That code was not recognised.");
    }

    saveSession(data.role || role, data.token, data.expires_in);
    setCampus(campus);
    setProgram(getProgram());
    accessCodeInput.value = "";

    showChat();
    clearChat();
    greet(true);
  } catch {
    setLoginError("Could not reach the server. Check your connection and try again.");
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Sign in";
  }
});

function greet(isNew) {
  const role = getRole();
  const campus = escapeHtml(getCampus() || "(not selected)");
  const program = escapeHtml(PROGRAM_LABELS[getProgram()] || "All Programs");
  const hello = isNew ? "You're signed in" : "Welcome back";

  const body = `Ask about any <b>policy</b>, <b>protocol</b> or <b>parent handbook</b> section.`;

  addMessage("assistant",
    `${hello} as <b>${escapeHtml(role || "staff")}</b>.<br>
     Campus <b>${campus}</b> · Program <b>${program}</b><br><br>${body}`);
}

logoutBtn?.addEventListener("click", () => {
  closeMenu();
  clearChat();
  clearCaches();
  clearSession();
  clearAdmin();
  setCampus("");
  setLoginError("");
  showLogin();
});

togglePasswordBtn?.addEventListener("click", () => {
  const showing = accessCodeInput.type === "text";
  accessCodeInput.type = showing ? "password" : "text";
  togglePasswordBtn.textContent = showing ? "SHOW" : "HIDE";
  togglePasswordBtn.setAttribute("aria-label", showing ? "Show access code" : "Hide access code");
});

// ============================================================
// Admin mode
// ============================================================

async function submitAdminPin(pin) {
  if (!pin) return;
  try {
    const res = await fetch(URLS.admin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin.trim() }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      const msg = data.error || "That PIN was not recognised.";
      if (chatScreen.classList.contains("hidden")) setLoginError(msg);
      else addMessage("assistant", escapeHtml(msg));
      return;
    }

    localStorage.setItem(LS.adminToken, data.token);
    localStorage.setItem(LS.adminUntil, String(Date.now() + (data.expires_in || 28800) * 1000));

    applyRoleUI();
    if (!chatScreen.classList.contains("hidden")) {
      addMessage("assistant",
        `Admin mode is on for 8 hours. <b>Dashboard</b> and <b>Logs</b> are now in the menu.<br>
         <span class="small muted">Admin mode does not allow chat — sign in with a staff code for that.</span>`);
    } else {
      setLoginError("");
      showChat();
      clearChat();
      addMessage("assistant",
        `Admin mode enabled. You can open the <b>Dashboard</b> and <b>Logs</b>, and browse documents.<br><br>
         To ask questions, sign in with your <b>staff</b> code.`);
    }
  } catch {
    setLoginError("Could not reach the server.");
  }
}

function openAdminModal() {
  adminPinInput.value = "";
  adminModal.classList.remove("hidden");
  adminPinInput.focus();
}

adminModeBtn?.addEventListener("click", () => {
  if (isAdmin()) {
    clearAdmin();
    applyRoleUI();
    addMessage("assistant", "Admin mode turned off.");
    return;
  }
  openAdminModal();
});

loginAdminBtn?.addEventListener("click", openAdminModal);
adminPinCancel?.addEventListener("click", () => adminModal.classList.add("hidden"));
adminPinSubmit?.addEventListener("click", async () => {
  const pin = adminPinInput.value;
  adminModal.classList.add("hidden");
  await submitAdminPin(pin);
});
adminPinInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") adminPinSubmit.click();
});

// ============================================================
// Campus / program switching
// ============================================================

campusSelect?.addEventListener("change", () => setCampus(campusSelect.value));

campusSwitch?.addEventListener("change", async () => {
  const c = campusSwitch.value;
  if (!c) return;
  setCampus(c);
  openHandbookId = null;
  caches.handbooks.delete(c);
  renderStatusLine();
  addMessage("assistant", `Campus switched to <b>${escapeHtml(getCampus())}</b>.`);

  const openPill = document.querySelector('.menu-pill[data-menu="handbook"].active');
  if (openPill) await openMenu("handbook");
});

programSwitch?.addEventListener("change", () => {
  setProgram(programSwitch.value);
  renderStatusLine();
  addMessage("assistant", `Program set to <b>${escapeHtml(PROGRAM_LABELS[getProgram()])}</b>.`);
});

// ============================================================
// Menu panel
// ============================================================

function closeMenu() {
  menuPanel.classList.add("hidden");
  menuOverlay.classList.add("hidden");
  menuPills.forEach((b) => b.classList.remove("active"));
}

function openPanel() {
  menuPanel.classList.remove("hidden");
  menuOverlay.classList.remove("hidden");
}

menuPills.forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (btn.classList.contains("active")) closeMenu();
    else await openMenu(btn.dataset.menu);
  });
});

menuPanelClose?.addEventListener("click", closeMenu);
menuOverlay?.addEventListener("click", closeMenu);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenu();
    adminModal.classList.add("hidden");
  }
});

async function openMenu(type) {
  const role = getRole();

  menuPills.forEach((b) => b.classList.toggle("active", b.dataset.menu === type));
  menuPanelTitle.textContent =
    type === "policies" ? "Policies" : type === "protocols" ? "Protocols" : "Parent Handbook";
  menuPanelBody.innerHTML = "";
  openPanel();

  if (type === "handbook") return renderHandbooks();
  renderDocList(type);
}

function renderDocList(type) {
  const items = MENU_ITEMS[type] || [];
  if (!items.length) {
    menuPanelBody.innerHTML = `<p class="muted">Nothing here yet.</p>`;
    return;
  }

  const label = document.createElement("div");
  label.className = "menu-group-label";
  label.textContent = "Select a document to preview";
  menuPanelBody.appendChild(label);

  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = "menu-item-btn";
    btn.type = "button";
    btn.textContent = item.label;
    btn.addEventListener("click", () =>
      showDoc(type === "protocols" ? "protocol" : "policy", item.id, item.label)
    );
    menuPanelBody.appendChild(btn);
  }
}

// ---- policy / protocol preview ----

async function showDoc(type, id, label) {
  const token = getBrowseToken();
  if (!token) {
    menuPanelBody.innerHTML = `<p class="muted">Your session has expired. Please sign in again.</p>`;
    return;
  }

  menuPanelBody.innerHTML = `<p class="muted">Loading ${escapeHtml(label)}…</p>`;

  const cacheKey = `${type}:${id}`;
  try {
    let doc = caches.docs.get(cacheKey);
    if (!doc) {
      const data = await apiGet(
        `${URLS.doc}?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, token
      );
      doc = data.doc;
      caches.docs.set(cacheKey, doc);
    }

    menuPanelBody.innerHTML = `
      <div class="doc-view">
        <div class="doc-head">
          <div>
            <div class="doc-title">${escapeHtml(doc.title || label)}</div>
            <div class="small muted">${escapeHtml((doc.type || type).toUpperCase())}</div>
          </div>
          <div class="doc-actions">
            <button class="mini-btn" id="doc-back" type="button">Back</button>
            ${doc.link ? `<a class="mini-link" href="${escapeHtml(doc.link)}" target="_blank" rel="noopener">Open full document ↗</a>` : ""}
          </div>
        </div>
        <div class="doc-content">${escapeHtml(doc.content || "No content stored for this document yet.")}</div>
        <div class="doc-ask">
          ${getRole()
            ? `<button class="primary-btn" id="doc-ask" type="button">Ask about this in chat</button>`
            : `<span class="small muted">Sign in with a staff code to ask questions.</span>`}
        </div>
      </div>`;

    $("doc-back").addEventListener("click", () =>
      openMenu(type === "protocol" ? "protocols" : "policies")
    );
    $("doc-ask")?.addEventListener("click", () => {
      closeMenu();
      userInput.value = `About "${doc.title || label}": `;
      userInput.focus();
    });
  } catch (err) {
    menuPanelBody.innerHTML = `
      <p class="muted">${escapeHtml(err.message)}</p>
      <button class="mini-btn" id="doc-back" type="button">Back</button>`;
    $("doc-back").addEventListener("click", () =>
      openMenu(type === "protocol" ? "protocols" : "policies")
    );
  }
}

// ---- handbook browser ----

async function renderHandbooks() {
  const campus = getCampus();
  const token = getBrowseToken();

  if (!campus) {
    menuPanelBody.innerHTML = `<p class="muted">Choose a campus first.</p>`;
    return;
  }
  if (!token) {
    menuPanelBody.innerHTML = `<p class="muted">Your session has expired. Please sign in again.</p>`;
    return;
  }

  menuPanelBody.innerHTML = `<p class="muted">Loading handbooks for ${escapeHtml(campus)}…</p>`;

  try {
    let handbooks = caches.handbooks.get(campus);
    if (!handbooks) {
      const data = await apiGet(`${URLS.handbooks}?campus=${encodeURIComponent(campus)}`, token);
      handbooks = data.handbooks || [];
      caches.handbooks.set(campus, handbooks);
    }

    menuPanelBody.innerHTML = `
      <div class="menu-group-label">Parent Handbook · campus ${escapeHtml(campus)}</div>`;

    if (!handbooks.length) {
      menuPanelBody.innerHTML += `<p class="muted">No handbook has been published for this campus yet.</p>`;
      return;
    }

    for (const hb of handbooks) {
      const btn = document.createElement("button");
      btn.className = "handbook-btn";
      btn.type = "button";
      btn.innerHTML = `<div class="hb-title">${escapeHtml(hb.title || "Parent Handbook")}</div>
                       <div class="hb-sub">${escapeHtml(hb.program || "All programs")} · ${(hb.sections || []).length} sections</div>`;
      btn.addEventListener("click", () => {
        openHandbookId = openHandbookId === hb.id ? null : hb.id;
        renderHandbooks();
      });
      menuPanelBody.appendChild(btn);

      if (openHandbookId === hb.id) {
        const wrap = document.createElement("div");
        wrap.className = "hb-sections";

        if (!(hb.sections || []).length) {
          wrap.innerHTML = `<span class="muted small">No sections in this handbook.</span>`;
        } else {
          for (const sec of hb.sections) {
            const sBtn = document.createElement("button");
            sBtn.className = "hb-section-btn";
            sBtn.type = "button";
            sBtn.textContent = sec.title || sec.key;
            sBtn.addEventListener("click", () => showSection(campus, hb, sec.key));
            wrap.appendChild(sBtn);
          }
        }
        menuPanelBody.appendChild(wrap);
      }
    }
  } catch (err) {
    menuPanelBody.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
  }
}

async function showSection(campus, hbMeta, sectionKey) {
  const token = getBrowseToken();
  menuPanelBody.innerHTML = `<p class="muted">Loading section…</p>`;

  const cacheKey = `${campus}:${hbMeta.id}:${sectionKey}`;
  try {
    let payload = caches.sections.get(cacheKey);
    if (!payload) {
      payload = await apiGet(
        `${URLS.handbooks}?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(hbMeta.id)}&section=${encodeURIComponent(sectionKey)}`,
        token
      );
      caches.sections.set(cacheKey, payload);
    }

    const section = payload.section || {};
    const handbook = payload.handbook || hbMeta;

    menuPanelBody.innerHTML = `
      <div class="doc-view">
        <div class="doc-head">
          <div>
            <div class="doc-title">${escapeHtml(section.title || sectionKey)}</div>
            <div class="small muted">${escapeHtml(handbook.title || "Parent Handbook")} · ${escapeHtml(campus)}</div>
          </div>
          <div class="doc-actions">
            <button class="mini-btn" id="hb-back" type="button">Back</button>
            ${handbook.link ? `<a class="mini-link" href="${escapeHtml(handbook.link)}" target="_blank" rel="noopener">Open full handbook ↗</a>` : ""}
          </div>
        </div>
        <div class="doc-content">${escapeHtml(section.content || "No content stored for this section yet.")}</div>
        <div class="doc-ask">
          ${getRole()
            ? `<button class="primary-btn" id="hb-ask" type="button">Ask about this section</button>`
            : `<span class="small muted">Sign in with a staff code to ask questions.</span>`}
        </div>
      </div>`;

    $("hb-back").addEventListener("click", renderHandbooks);
    $("hb-ask")?.addEventListener("click", () => {
      closeMenu();
      ask(`About "${section.title || sectionKey}" in the parent handbook: `, {
        type: "handbook",
        id: handbook.id || hbMeta.id,
        section_key: sectionKey,
      }, true);
    });
  } catch (err) {
    menuPanelBody.innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>
      <button class="mini-btn" id="hb-back" type="button">Back</button>`;
    $("hb-back").addEventListener("click", renderHandbooks);
  }
}

// ============================================================
// Chat
// ============================================================

chatForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = userInput.value.trim();
  if (!q) return;
  userInput.value = "";
  ask(q);
});

// A thumbs up/down under each answer. The logs can only show whether a
// document was found, which says nothing about whether the answer was right —
// and a confident wrong answer is the one worth hearing about.
function attachFeedback(el, answerId) {
  if (!el || !answerId) return;

  const bar = document.createElement("div");
  bar.className = "feedback";
  bar.innerHTML =
    `<span class="feedback-q">Was this helpful?</span>` +
    `<button type="button" class="feedback-btn" data-verdict="good" aria-label="Helpful">👍</button>` +
    `<button type="button" class="feedback-btn" data-verdict="bad" aria-label="Not helpful">👎</button>`;

  bar.addEventListener("click", async (ev) => {
    const btn = ev.target.closest(".feedback-btn");
    if (!btn) return;
    const verdict = btn.dataset.verdict;

    // Thank them immediately; a failed send must not make it look ignored.
    bar.innerHTML = `<span class="feedback-done">${verdict === "good" ? "Thanks." : "Thanks — we'll look at this one."}</span>`;

    try {
      await fetch(ENDPOINTS.feedback, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ answer_id: answerId, verdict }),
      });
    } catch {
      /* the rating is a nicety; never interrupt someone's work over it */
    }
  });

  el.appendChild(bar);
}

function renderAnswer(data) {
  const answer = (data.answer || "").trim() || data.note || "I couldn't find an answer for that.";
  let html = escapeHtml(answer).replace(/\n/g, "<br>");

  if (data.source?.title) {
    const bits = [`Source: <b>${escapeHtml(data.source.title)}</b>`];
    if (data.handbook_section?.section_title) {
      bits.push(`section “${escapeHtml(data.handbook_section.section_title)}”`);
    }
    if (data.source.link) {
      bits.push(`<a href="${escapeHtml(data.source.link)}" target="_blank" rel="noopener">open ↗</a>`);
    }
    html += `<span class="source-tag">${bits.join(" · ")}</span>`;
  }

  // Where another document answers the same question differently, show it too
  // rather than leaving the reader with only one version. The handbook tends to
  // summarise for families while the policy carries the deadline staff work to,
  // and which one you are reading matters.
  if (Array.isArray(data.also_says) && data.also_says.length) {
    const items = data.also_says.map((o) => {
      const label = [escapeHtml(o.title || "Another document")];
      if (o.section_title) label.push(`section “${escapeHtml(o.section_title)}”`);
      const link = o.link
        ? ` <a href="${escapeHtml(o.link)}" target="_blank" rel="noopener">open ↗</a>`
        : "";
      const says = o.says ? `<span class="also-says">${escapeHtml(o.says)}</span>` : "";
      return `<li><span class="also-source">${label.join(" · ")}${link}</span>${says}</li>`;
    }).join("");
    html += `<div class="also-block"><div class="also-head">Another document says something different</div><ul>${items}</ul></div>`;
  }

  return html;
}

async function ask(question, scope = null, prefillOnly = false) {
  const query = String(question || "").trim();
  if (!query) return;

  const campus = getCampus();
  if (!campus) return addMessage("assistant", "Please choose a campus first.");

  const role = getRole();
  const token = getToken();

  if (!role || !token) {
    return addMessage("assistant",
      `You're in <b>admin mode</b>, which is for the dashboard and logs.<br>
       To ask questions, sign in with your <b>staff</b> code.`);
  }

  // "Ask this section" seeds the box so the user can finish the sentence.
  if (prefillOnly) {
    userInput.value = query;
    userInput.focus();
    userInput.dataset.scope = JSON.stringify(scope || {});
    return;
  }

  let effectiveScope = scope;
  if (!effectiveScope && userInput.dataset.scope) {
    effectiveScope = JSON.parse(userInput.dataset.scope);
    delete userInput.dataset.scope;
  }

  addMessage("user", escapeHtml(query));

  const program = getProgram();
  const cacheKey = JSON.stringify({ query: query.toLowerCase(), campus, program, effectiveScope });
  if (caches.answers.has(cacheKey)) {
    return addMessage("assistant", caches.answers.get(cacheKey));
  }

  showTyping();

  try {
    const res = await fetch(URLS.api, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, campus, program, scope: effectiveScope || null }),
    });

    hideTyping();
    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      return addMessage("assistant", "That's a lot of questions at once — please wait a moment and try again.");
    }
    if (res.status === 401) {
      clearSession();
      showLogin();
      return setLoginError("Your session expired. Please sign in again.");
    }
    if (!res.ok || !data.ok) {
      return addMessage("assistant", escapeHtml(data.error || "Something went wrong. Please try again."));
    }

    const html = renderAnswer(data);
    caches.answers.set(cacheKey, html);
    const el = addMessage("assistant", html);
    attachFeedback(el, data.answer_id);
  } catch {
    hideTyping();
    addMessage("assistant", "Could not reach the server. Check your connection and try again.");
  }
}

// ============================================================
// Init
// ============================================================

(function init() {
  if (!isSignedIn()) clearSession();
  if (!isAdmin()) clearAdmin();
  setProgram(getProgram());

  // Warm the Worker so the first real question feels fast.
  fetch(URLS.health).catch(() => {});

  if (isSignedIn() || isAdmin()) {
    showChat();
    clearChat();
    if (isSignedIn()) greet(false);
    else {
      addMessage("assistant",
        `Admin mode is on. Open the <b>Dashboard</b> or <b>Logs</b> from the menu.<br><br>
         To ask questions, sign in with your <b>staff</b> code.`);
    }
    return;
  }

  showLogin();
})();
