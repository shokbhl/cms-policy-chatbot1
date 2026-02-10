/* =========================
   CMS Policy Chatbot - app.js (FULL)
   - Same-origin only (Pages -> /functions/[[path]].js -> Worker)
   - Robust browse for Policies/Protocols/Handbooks (nested sections)
   - Prevent UI lock by aborting stale requests
   - "Ask this section in chat" button
========================= */

(() => {
  // =========================
  // CONFIG
  // =========================
  const API = {
    staffAuth: "/auth/staff",
    parentAuth: "/auth/parent",
    adminAuth: "/auth/admin",
    chat: "/api",

    handbooks: "/handbooks",
    policies: "/policies",
    protocols: "/protocols"
  };

  const LS = {
    campus: "cms_campus",
    program: "cms_program",
    role: "cms_role",

    staffToken: "cms_staff_token",
    staffUntil: "cms_staff_until",

    parentToken: "cms_parent_token",
    parentUntil: "cms_parent_until",

    adminToken: "cms_admin_token",
    adminUntil: "cms_admin_until",

    lastTab: "cms_last_tab", // policies|protocols|handbooks|chat
    lastDocId: "cms_last_doc_id",
    lastDocType: "cms_last_doc_type",
    lastPath: "cms_last_path"
  };

  const CAMPUSES = ["YC", "MC", "SC", "TC", "WC"];
  const PROGRAMS = ["Preschool", "Sr. Casa", "Elementary"];

  // =========================
  // DOM (robust: create if missing)
  // =========================
  const el = {
    root: document.querySelector("#app") || document.body,
    header: document.querySelector(".app-header") || null,

    // top controls (if present)
    campusSelect: document.querySelector("#campusSelect") || document.querySelector('[data-campus-select]') || null,
    programSelect: document.querySelector("#programSelect") || document.querySelector('[data-program-select]') || null,

    // login controls (if present)
    staffBtn: document.querySelector("#btnStaff") || document.querySelector('[data-login="staff"]') || null,
    parentBtn: document.querySelector("#btnParent") || document.querySelector('[data-login="parent"]') || null,
    adminBtn: document.querySelector("#btnAdmin") || document.querySelector('[data-login="admin"]') || null,

    staffCode: document.querySelector("#staffCode") || null,
    parentCode: document.querySelector("#parentCode") || null,
    adminPin: document.querySelector("#adminPin") || null,

    // main area
    main: document.querySelector("#main") || document.querySelector(".main") || null
  };

  // If main missing, create a simple layout
  if (!el.main) {
    el.main = document.createElement("div");
    el.main.id = "main";
    el.main.style.maxWidth = "1100px";
    el.main.style.margin = "18px auto";
    el.main.style.padding = "0 14px";
    el.root.appendChild(el.main);
  }

  // Ensure a tab bar + content + chat panel
  const ui = ensureUI(el.main);

  // =========================
  // State
  // =========================
  const state = {
    campus: (localStorage.getItem(LS.campus) || "MC").toUpperCase(),
    program: localStorage.getItem(LS.program) || "Preschool",
    role: localStorage.getItem(LS.role) || "", // staff|parent
    view: localStorage.getItem(LS.lastTab) || "policies",

    // browsing
    currentDoc: null, // {type, id, title, link}
    currentPath: localStorage.getItem(LS.lastPath) || "",

    // request control
    reqSeq: 0,
    aborter: null
  };

  // Clamp initial campus/program
  if (!CAMPUSES.includes(state.campus)) state.campus = "MC";
  if (!PROGRAMS.includes(state.program)) state.program = "Preschool";

  // =========================
  // Utils: token handling
  // =========================
  function nowSec() { return Math.floor(Date.now() / 1000); }

  function getToken(role) {
    if (role === "staff") {
      const t = localStorage.getItem(LS.staffToken) || "";
      const u = parseInt(localStorage.getItem(LS.staffUntil) || "0", 10);
      if (t && u > nowSec()) return t;
      return "";
    }
    if (role === "parent") {
      const t = localStorage.getItem(LS.parentToken) || "";
      const u = parseInt(localStorage.getItem(LS.parentUntil) || "0", 10);
      if (t && u > nowSec()) return t;
      return "";
    }
    if (role === "admin") {
      const t = localStorage.getItem(LS.adminToken) || "";
      const u = parseInt(localStorage.getItem(LS.adminUntil) || "0", 10);
      if (t && u > nowSec()) return t;
      return "";
    }
    return "";
  }

  function setToken(role, token, expiresIn) {
    const until = nowSec() + (expiresIn || 3600);
    if (role === "staff") {
      localStorage.setItem(LS.staffToken, token);
      localStorage.setItem(LS.staffUntil, String(until));
    } else if (role === "parent") {
      localStorage.setItem(LS.parentToken, token);
      localStorage.setItem(LS.parentUntil, String(until));
    } else if (role === "admin") {
      localStorage.setItem(LS.adminToken, token);
      localStorage.setItem(LS.adminUntil, String(until));
    }
  }

  function clearTokens() {
    [LS.staffToken, LS.staffUntil, LS.parentToken, LS.parentUntil, LS.adminToken, LS.adminUntil].forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(LS.role);
    state.role = "";
  }

  function authHeader() {
    // Prefer staff/parent/admin based on state.role + availability
    if (state.role === "staff") {
      const t = getToken("staff");
      if (t) return { Authorization: `Bearer ${t}` };
    }
    if (state.role === "parent") {
      const t = getToken("parent");
      if (t) return { Authorization: `Bearer ${t}` };
    }
    // fallback: if staff token exists use it
    const staff = getToken("staff");
    if (staff) return { Authorization: `Bearer ${staff}` };
    const parent = getToken("parent");
    if (parent) return { Authorization: `Bearer ${parent}` };
    const admin = getToken("admin");
    if (admin) return { Authorization: `Bearer ${admin}` };
    return {};
  }

  // =========================
  // Network (abort stale requests)
  // =========================
  async function requestJSON(method, url, body) {
    const seq = ++state.reqSeq;

    // abort previous
    try { state.aborter?.abort(); } catch {}
    const ac = new AbortController();
    state.aborter = ac;

    const headers = { "Content-Type": "application/json", ...authHeader() };

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ac.signal
      });
    } catch (e) {
      // If aborted, return a special object
      if (e?.name === "AbortError") return { _aborted: true, _seq: seq };
      return { ok: false, error: String(e?.message || e), _seq: seq };
    }

    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    // If a newer request started after this one, ignore this response
    if (seq !== state.reqSeq) return { _stale: true, _seq: seq };

    data._status = res.status;
    data._ok = res.ok;
    data._seq = seq;
    return data;
  }

  // =========================
  // UI Helpers
  // =========================
  function setStatus(msg, kind = "info") {
    ui.status.textContent = msg || "";
    ui.status.dataset.kind = kind;
    ui.status.style.display = msg ? "block" : "none";
  }

  function setBusy(b) {
    ui.root.dataset.busy = b ? "1" : "0";
    ui.spinner.style.display = b ? "inline-block" : "none";
    ui.root.style.pointerEvents = b ? "auto" : "auto"; // keep clickable, we abort old requests anyway
  }

  function setTab(tab) {
    state.view = tab;
    localStorage.setItem(LS.lastTab, tab);
    ui.tabs.querySelectorAll("[data-tab]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    ui.paneBrowse.style.display = (tab === "policies" || tab === "protocols" || tab === "handbooks") ? "block" : "none";
    ui.paneChat.style.display = (tab === "chat") ? "block" : "none";

    // for browse tabs, load list
    if (tab === "policies") loadDocList("policies");
    if (tab === "protocols") loadDocList("protocols");
    if (tab === "handbooks") loadHandbookList();
  }

  function setBreadcrumb(parts) {
    ui.breadcrumb.textContent = parts.filter(Boolean).join(" • ");
  }

  function clearBrowse() {
    ui.docTitle.textContent = "";
    ui.docMeta.innerHTML = "";
    ui.sectionNav.innerHTML = "";
    ui.sectionContent.innerHTML = "";
    ui.backBtn.style.display = "none";
    ui.openDocLink.style.display = "none";
  }

  // =========================
  // Browse renderers
  // =========================
  function renderDocList(docs, type) {
    clearBrowse();
    ui.list.innerHTML = "";

    if (!Array.isArray(docs) || docs.length === 0) {
      ui.list.innerHTML = `<div class="cms-empty">No ${type} found.</div>`;
      return;
    }

    docs.forEach((d) => {
      const item = document.createElement("button");
      item.className = "cms-list-item";
      item.type = "button";
      item.innerHTML = `
        <div class="cms-li-title">${escapeHtml(d.title || "Untitled")}</div>
        <div class="cms-li-sub">${escapeHtml(String(d.sections_count ?? countSectionsFromList(d.sections))) } sections</div>
      `;
      item.addEventListener("click", () => openDoc(type, d.id));
      ui.list.appendChild(item);
    });

    ui.modeTitle.textContent = type === "policies" ? "Policies" : "Protocols";
    setBreadcrumb([ui.modeTitle.textContent]);
  }

  function renderHandbookList(handbooks) {
    clearBrowse();
    ui.list.innerHTML = "";

    if (!Array.isArray(handbooks) || handbooks.length === 0) {
      ui.list.innerHTML = `<div class="cms-empty">No handbook found for ${escapeHtml(state.campus)}.</div>`;
      return;
    }

    handbooks.forEach((h) => {
      const item = document.createElement("button");
      item.className = "cms-list-item";
      item.type = "button";
      item.innerHTML = `
        <div class="cms-li-title">${escapeHtml(h.title || "Parent Handbook")}</div>
        <div class="cms-li-sub">${escapeHtml(h.program || "")} • ${escapeHtml(String(countSectionsFromList(h.sections)))} sections</div>
      `;
      item.addEventListener("click", () => openHandbook(h.id));
      ui.list.appendChild(item);
    });

    ui.modeTitle.textContent = "Parent Handbook";
    setBreadcrumb(["Parent Handbook", state.campus, state.program]);
  }

  function renderSectionsTree(sections, onClickPath) {
    ui.sectionNav.innerHTML = "";

    // If no sections, show Overview stub button
    if (!Array.isArray(sections) || sections.length === 0) {
      const btn = sectionPill("Overview", "Overview", false);
      btn.addEventListener("click", () => onClickPath("Overview"));
      ui.sectionNav.appendChild(btn);
      return;
    }

    // sections is a list of {path,title,has_children,children}
    sections.forEach((node) => {
      ui.sectionNav.appendChild(renderNode(node, onClickPath, 0));
    });
  }

  function renderNode(node, onClickPath, depth) {
    const wrap = document.createElement("div");
    wrap.className = "cms-node";
    wrap.style.marginLeft = depth ? `${Math.min(depth * 12, 36)}px` : "0px";

    const row = document.createElement("div");
    row.className = "cms-node-row";

    const btn = sectionPill(node.title || node.path, node.path, node.has_children);
    btn.addEventListener("click", () => {
      // toggle children visibility or open content
      if (node.has_children) {
        wrap.classList.toggle("open");
      }
      onClickPath(node.path);
    });

    row.appendChild(btn);
    wrap.appendChild(row);

    if (node.has_children && Array.isArray(node.children) && node.children.length) {
      const kids = document.createElement("div");
      kids.className = "cms-node-children";
      node.children.forEach((c) => kids.appendChild(renderNode(c, onClickPath, depth + 1)));
      wrap.appendChild(kids);
    }

    return wrap;
  }

  function renderSectionContent(title, content, docType, docId, path) {
    ui.sectionContent.innerHTML = "";

    const h = document.createElement("div");
    h.className = "cms-section-title";
    h.textContent = title || "Section";
    ui.sectionContent.appendChild(h);

    const p = document.createElement("div");
    p.className = "cms-section-body";
    p.textContent = content && String(content).trim() ? String(content) : "No content yet.";
    ui.sectionContent.appendChild(p);

    const ask = document.createElement("button");
    ask.className = "cms-ask-btn";
    ask.type = "button";
    ask.textContent = "Ask this section in chat";
    ask.addEventListener("click", () => {
      // jump to chat + prefill question
      const snippet = (content || "").toString().slice(0, 1200);
      ui.chatInput.value =
        `Based on this ${docType} section, answer my question.\n\n` +
        `Document: ${state.currentDoc?.title || ""}\n` +
        `Section path: ${path}\n\n` +
        `Section text:\n${snippet}\n\nQuestion: `;
      setTab("chat");
      ui.chatInput.focus();
    });
    ui.sectionContent.appendChild(ask);

    // remember
    localStorage.setItem(LS.lastDocType, docType);
    localStorage.setItem(LS.lastDocId, docId);
    localStorage.setItem(LS.lastPath, path || "");
  }

  // =========================
  // Loaders
  // =========================
  async function loadDocList(type) {
    setBusy(true);
    setStatus("", "info");
    ui.list.innerHTML = "";

    const url = type === "policies" ? API.policies : API.protocols;
    const data = await requestJSON("GET", url);

    setBusy(false);
    if (data._aborted || data._stale) return;

    if (!data._ok) {
      setStatus(data.error || `Failed to load ${type}.`, "error");
      ui.list.innerHTML = `<div class="cms-empty">${escapeHtml(data.error || "Error")}</div>`;
      return;
    }

    // Worker returns {ok:true, docs:[...]}
    renderDocList(data.docs || [], type);
  }

  async function openDoc(type, id) {
    setBusy(true);
    setStatus("", "info");
    clearBrowse();

    const url = (type === "policies" ? API.policies : API.protocols) + `?id=${encodeURIComponent(id)}`;
    const data = await requestJSON("GET", url);

    setBusy(false);
    if (data._aborted || data._stale) return;

    if (!data._ok) {
      setStatus(data.error || "Doc not found.", "error");
      // go back to list
      if (type === "policies") loadDocList("policies");
      else loadDocList("protocols");
      return;
    }

    state.currentDoc = data.doc || { id, type };
    ui.modeTitle.textContent = type === "policies" ? "Policies" : "Protocols";
    ui.docTitle.textContent = state.currentDoc.title || "Document";
    ui.backBtn.style.display = "inline-block";
    ui.backBtn.onclick = () => (type === "policies" ? loadDocList("policies") : loadDocList("protocols"));

    // open full doc
    if (state.currentDoc.link) {
      ui.openDocLink.style.display = "inline-block";
      ui.openDocLink.href = state.currentDoc.link;
    } else {
      ui.openDocLink.style.display = "none";
    }

    setBreadcrumb([ui.modeTitle.textContent, ui.docTitle.textContent]);

    const sections = data.sections || [];
    renderSectionsTree(sections, async (path) => {
      await openDocSection(type, id, path);
    });

    // Auto open last path if same doc
    const lastType = localStorage.getItem(LS.lastDocType) || "";
    const lastId = localStorage.getItem(LS.lastDocId) || "";
    const lastPath = localStorage.getItem(LS.lastPath) || "";

    if (lastType === type && lastId === id && lastPath) {
      await openDocSection(type, id, lastPath);
    } else {
      // open first available node
      const first = findFirstPath(sections) || "Overview";
      await openDocSection(type, id, first);
    }
  }

  async function openDocSection(type, id, path) {
    setBusy(true);
    setStatus("", "info");

    const base = type === "policies" ? API.policies : API.protocols;
    const url = `${base}?id=${encodeURIComponent(id)}&path=${encodeURIComponent(path)}`;

    const data = await requestJSON("GET", url);

    setBusy(false);
    if (data._aborted || data._stale) return;

    if (!data._ok) {
      setStatus(data.error || "Section not found.", "error");
      return;
    }

    const sec = data.section || {};
    const title = sec.title || path;
    const content = sec.content || "";

    renderSectionContent(title, content, type, id, path);
  }

  async function loadHandbookList() {
    setBusy(true);
    setStatus("", "info");
    clearBrowse();
    ui.list.innerHTML = "";

    const url = `${API.handbooks}?campus=${encodeURIComponent(state.campus)}`;
    const data = await requestJSON("GET", url);

    setBusy(false);
    if (data._aborted || data._stale) return;

    if (!data._ok) {
      setStatus(data.error || "Failed to load handbook.", "error");
      ui.list.innerHTML = `<div class="cms-empty">${escapeHtml(data.error || "Error")}</div>`;
      return;
    }

    renderHandbookList(data.handbooks || []);
  }

  async function openHandbook(id) {
    setBusy(true);
    setStatus("", "info");
    clearBrowse();

    const url = `${API.handbooks}?campus=${encodeURIComponent(state.campus)}&id=${encodeURIComponent(id)}`;
    const data = await requestJSON("GET", url);

    setBusy(false);
    if (data._aborted || data._stale) return;

    if (!data._ok) {
      setStatus(data.error || "Handbook not found.", "error");
      loadHandbookList();
      return;
    }

    state.currentDoc = { ...(data.handbook || {}), id, type: "handbooks" };

    ui.modeTitle.textContent = "Parent Handbook";
    ui.docTitle.textContent = state.currentDoc.title || "Parent Handbook";

    ui.backBtn.style.display = "inline-block";
    ui.backBtn.onclick = () => loadHandbookList();

    if (state.currentDoc.link) {
      ui.openDocLink.style.display = "inline-block";
      ui.openDocLink.href = state.currentDoc.link;
    } else {
      ui.openDocLink.style.display = "none";
    }

    setBreadcrumb(["Parent Handbook", state.campus, state.program, ui.docTitle.textContent]);

    const sections = data.sections || [];
    renderSectionsTree(sections, async (path) => {
      await openHandbookSection(id, path);
    });

    // Auto open first
    const first = findFirstPath(sections) || "Overview";
    await openHandbookSection(id, first);
  }

  async function openHandbookSection(id, path) {
    setBusy(true);
    setStatus("", "info");

    const url = `${API.handbooks}?campus=${encodeURIComponent(state.campus)}&id=${encodeURIComponent(id)}&path=${encodeURIComponent(path)}`;
    const data = await requestJSON("GET", url);

    setBusy(false);
    if (data._aborted || data._stale) return;

    if (!data._ok) {
      setStatus(data.error || "Section not found.", "error");
      return;
    }

    const sec = data.section || {};
    const title = sec.title || path;
    const content = sec.content || "";

    renderSectionContent(title, content, "handbooks", id, path);
  }

  // =========================
  // Chat
  // =========================
  async function sendChat() {
    const q = (ui.chatInput.value || "").trim();
    if (!q) return;

    setBusy(true);
    setStatus("", "info");

    ui.chatOut.innerHTML = "";

    const body = {
      query: q,
      campus: state.campus,
      program: state.program
    };

    const data = await requestJSON("POST", API.chat, body);

    setBusy(false);
    if (data._aborted || data._stale) return;

    if (!data._ok) {
      setStatus(data.error || "Chat failed.", "error");
      return;
    }

    const matches = Array.isArray(data.matches) ? data.matches : [];
    if (!matches.length) {
      ui.chatOut.innerHTML = `<div class="cms-empty">No answer found.</div>`;
      return;
    }

    matches.forEach((m) => {
      ui.chatOut.appendChild(renderAnswerCard(m));
    });
  }

  function renderAnswerCard(m) {
    const card = document.createElement("div");
    card.className = "cms-card";

    const title = document.createElement("div");
    title.className = "cms-card-title";
    title.textContent = `${m.title || "Result"}${m.type ? " (" + m.type + ")" : ""}`;
    card.appendChild(title);

    if (m.why) {
      const why = document.createElement("div");
      why.className = "cms-card-why";
      why.textContent = m.why;
      card.appendChild(why);
    }

    const body = document.createElement("div");
    body.className = "cms-card-body";
    body.textContent = m.answer || "";
    card.appendChild(body);

    // If user wants to jump to browse doc
    if (m.id && m.type && (m.type === "policy" || m.type === "protocol" || m.type === "handbook")) {
      const btn = document.createElement("button");
      btn.className = "cms-card-btn";
      btn.type = "button";
      btn.textContent = "Open in browser";
      btn.addEventListener("click", async () => {
        if (m.type === "handbook") {
          setTab("handbooks");
          await openHandbook(m.id);
        } else if (m.type === "policy") {
          setTab("policies");
          await openDoc("policies", m.id);
        } else if (m.type === "protocol") {
          setTab("protocols");
          await openDoc("protocols", m.id);
        }
      });
      card.appendChild(btn);
    }

    return card;
  }

  // =========================
  // Login (optional hooks if your page has them)
  // =========================
  async function doLogin(role, codeOrPin) {
    setBusy(true);
    setStatus("", "info");

    const endpoint = role === "staff" ? API.staffAuth : role === "parent" ? API.parentAuth : API.adminAuth;
    const payload = role === "admin" ? { pin: codeOrPin } : { code: codeOrPin };

    const data = await requestJSON("POST", endpoint, payload);

    setBusy(false);
    if (data._aborted || data._stale) return false;

    if (!data._ok || !data.ok) {
      setStatus(data.error || "Login failed.", "error");
      return false;
    }

    setToken(role, data.token, data.expires_in);
    if (role === "staff" || role === "parent") {
      state.role = role;
      localStorage.setItem(LS.role, role);
    }
    setStatus(`${role.toUpperCase()} login OK`, "ok");
    return true;
  }

  // =========================
  // Init controls (campus/program)
  // =========================
  initSelectors();
  initTabs();
  initChat();
  initLoginButtons();

  // load initial tab
  setTab(state.view);

  // =========================
  // Functions
  // =========================
  function initSelectors() {
    // if your page already has selects, use them. otherwise create minimal ones.
    if (!el.campusSelect) {
      el.campusSelect = document.createElement("select");
      el.campusSelect.id = "campusSelect";
      CAMPUSES.forEach(c => {
        const o = document.createElement("option");
        o.value = c; o.textContent = c;
        el.campusSelect.appendChild(o);
      });
      ui.controls.appendChild(el.campusSelect);
    }
    if (!el.programSelect) {
      el.programSelect = document.createElement("select");
      el.programSelect.id = "programSelect";
      PROGRAMS.forEach(p => {
        const o = document.createElement("option");
        o.value = p; o.textContent = p;
        el.programSelect.appendChild(o);
      });
      ui.controls.appendChild(el.programSelect);
    }

    el.campusSelect.value = state.campus;
    el.programSelect.value = state.program;

    el.campusSelect.addEventListener("change", () => {
      state.campus = String(el.campusSelect.value || "MC").toUpperCase();
      localStorage.setItem(LS.campus, state.campus);
      // refresh handbook list if open
      if (state.view === "handbooks") loadHandbookList();
      // chat context uses campus too
      setStatus(`Campus: ${state.campus}`, "info");
    });

    el.programSelect.addEventListener("change", () => {
      state.program = String(el.programSelect.value || "Preschool");
      localStorage.setItem(LS.program, state.program);
      setStatus(`Program: ${state.program}`, "info");
    });
  }

  function initTabs() {
    ui.tabs.querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => setTab(btn.dataset.tab));
    });
  }

  function initChat() {
    ui.chatSend.addEventListener("click", sendChat);
    ui.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendChat();
    });
  }

  function initLoginButtons() {
    // If your page has its own login UI, hook it; otherwise this app.js doesn't force login.
    if (el.staffBtn && el.staffCode) {
      el.staffBtn.addEventListener("click", async () => {
        const ok = await doLogin("staff", el.staffCode.value || "");
        if (ok && (state.view === "policies" || state.view === "protocols")) setTab(state.view);
      });
    }
    if (el.parentBtn && el.parentCode) {
      el.parentBtn.addEventListener("click", async () => {
        const ok = await doLogin("parent", el.parentCode.value || "");
        if (ok) setTab("handbooks");
      });
    }
    if (el.adminBtn && el.adminPin) {
      el.adminBtn.addEventListener("click", async () => {
        await doLogin("admin", el.adminPin.value || "");
      });
    }
  }

  function sectionPill(label, path, hasChildren) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cms-pill";
    b.title = path;
    b.innerHTML = `
      <span>${escapeHtml(label || "Section")}</span>
      ${hasChildren ? `<span class="cms-caret">▸</span>` : ``}
    `;
    return b;
  }

  function findFirstPath(sections) {
    if (!Array.isArray(sections) || !sections.length) return "";
    const first = sections[0];
    if (!first) return "";
    if (first.path) return first.path;
    return "";
  }

  function countSectionsFromList(sections) {
    // sections can be nested; count nodes
    let count = 0;
    const walk = (list) => {
      if (!Array.isArray(list)) return;
      for (const n of list) {
        count++;
        if (Array.isArray(n.children) && n.children.length) walk(n.children);
      }
    };
    walk(sections);
    return count;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // =========================
  // Minimal UI builder (won't break your existing design)
  // =========================
  function ensureUI(container) {
    const root = document.createElement("div");
    root.className = "cms-ui";
    root.style.position = "relative";

    const controls = document.createElement("div");
    controls.className = "cms-controls";
    controls.style.display = "flex";
    controls.style.gap = "10px";
    controls.style.alignItems = "center";
    controls.style.marginBottom = "10px";

    const tabs = document.createElement("div");
    tabs.className = "cms-tabs";
    tabs.style.display = "flex";
    tabs.style.gap = "8px";
    tabs.style.flexWrap = "wrap";
    tabs.style.marginBottom = "10px";

    tabs.innerHTML = `
      <button class="cms-tab" data-tab="policies" type="button">Policies</button>
      <button class="cms-tab" data-tab="protocols" type="button">Protocols</button>
      <button class="cms-tab" data-tab="handbooks" type="button">Parent Handbook</button>
      <button class="cms-tab" data-tab="chat" type="button">Chat</button>
      <span class="cms-spin" style="display:none;margin-left:8px;">⏳</span>
    `;

    const status = document.createElement("div");
    status.className = "cms-status";
    status.style.display = "none";
    status.style.margin = "8px 0";
    status.style.padding = "8px 10px";
    status.style.borderRadius = "10px";
    status.style.background = "#fff";
    status.style.border = "1px solid rgba(0,0,0,0.08)";

    const paneBrowse = document.createElement("div");
    paneBrowse.className = "cms-pane-browse";

    const topLine = document.createElement("div");
    topLine.style.display = "flex";
    topLine.style.alignItems = "center";
    topLine.style.justifyContent = "space-between";
    topLine.style.gap = "10px";
    topLine.style.marginBottom = "10px";

    const leftTop = document.createElement("div");
    leftTop.innerHTML = `
      <div class="cms-mode-title" style="font-weight:700;font-size:18px;">Policies</div>
      <div class="cms-breadcrumb" style="opacity:0.7;font-size:13px;margin-top:2px;"></div>
    `;

    const rightTop = document.createElement("div");
    rightTop.style.display = "flex";
    rightTop.style.gap = "10px";
    rightTop.style.alignItems = "center";
    rightTop.innerHTML = `
      <button class="cms-back-btn" type="button" style="display:none;">Back</button>
      <a class="cms-open-doc" href="#" target="_blank" style="display:none;">Open full document</a>
    `;

    topLine.appendChild(leftTop);
    topLine.appendChild(rightTop);

    const layout = document.createElement("div");
    layout.style.display = "grid";
    layout.style.gridTemplateColumns = "360px 1fr";
    layout.style.gap = "14px";

    const list = document.createElement("div");
    list.className = "cms-list";
    list.style.background = "rgba(255,255,255,0.65)";
    list.style.border = "1px solid rgba(0,0,0,0.08)";
    list.style.borderRadius = "14px";
    list.style.padding = "10px";
    list.style.minHeight = "320px";

    const docPane = document.createElement("div");
    docPane.className = "cms-doc-pane";
    docPane.style.background = "rgba(255,255,255,0.65)";
    docPane.style.border = "1px solid rgba(0,0,0,0.08)";
    docPane.style.borderRadius = "14px";
    docPane.style.padding = "14px";
    docPane.style.minHeight = "320px";

    const docTitle = document.createElement("div");
    docTitle.className = "cms-doc-title";
    docTitle.style.fontWeight = "800";
    docTitle.style.fontSize = "20px";
    docTitle.style.marginBottom = "8px";

    const docMeta = document.createElement("div");
    docMeta.className = "cms-doc-meta";
    docMeta.style.opacity = "0.7";
    docMeta.style.fontSize = "13px";
    docMeta.style.marginBottom = "10px";

    const sectionNav = document.createElement("div");
    sectionNav.className = "cms-section-nav";
    sectionNav.style.display = "flex";
    sectionNav.style.flexWrap = "wrap";
    sectionNav.style.gap = "8px";
    sectionNav.style.marginBottom = "12px";

    const sectionContent = document.createElement("div");
    sectionContent.className = "cms-section-content";
    sectionContent.style.background = "#fff";
    sectionContent.style.border = "1px solid rgba(0,0,0,0.08)";
    sectionContent.style.borderRadius = "14px";
    sectionContent.style.padding = "14px";

    docPane.appendChild(docTitle);
    docPane.appendChild(docMeta);
    docPane.appendChild(sectionNav);
    docPane.appendChild(sectionContent);

    layout.appendChild(list);
    layout.appendChild(docPane);

    paneBrowse.appendChild(topLine);
    paneBrowse.appendChild(layout);

    const paneChat = document.createElement("div");
    paneChat.className = "cms-pane-chat";
    paneChat.style.display = "none";

    paneChat.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;">
        <input class="cms-chat-input" placeholder="Ask a question..." style="flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(0,0,0,0.12);"/>
        <button class="cms-chat-send" type="button" style="padding:10px 14px;border-radius:12px;">Ask</button>
      </div>
      <div class="cms-chat-out"></div>
      <div style="opacity:0.6;font-size:12px;margin-top:10px;">Tip: Ctrl/Cmd + Enter to send</div>
    `;

    root.appendChild(controls);
    root.appendChild(tabs);
    root.appendChild(status);
    root.appendChild(paneBrowse);
    root.appendChild(paneChat);

    // Insert near top of container
    container.innerHTML = "";
    container.appendChild(root);

    // Basic CSS (scoped-ish)
    injectCSS();

    return {
      root,
      controls,
      tabs,
      spinner: tabs.querySelector(".cms-spin"),
      status,

      paneBrowse,
      paneChat,

      modeTitle: leftTop.querySelector(".cms-mode-title"),
      breadcrumb: leftTop.querySelector(".cms-breadcrumb"),

      backBtn: rightTop.querySelector(".cms-back-btn"),
      openDocLink: rightTop.querySelector(".cms-open-doc"),

      list,
      docTitle,
      docMeta,
      sectionNav,
      sectionContent,

      chatInput: paneChat.querySelector(".cms-chat-input"),
      chatSend: paneChat.querySelector(".cms-chat-send"),
      chatOut: paneChat.querySelector(".cms-chat-out")
    };
  }

  function injectCSS() {
    if (document.getElementById("cms-appjs-css")) return;
    const css = document.createElement("style");
    css.id = "cms-appjs-css";
    css.textContent = `
      .cms-tab{border:1px solid rgba(0,0,0,0.12);background:#fff;padding:8px 12px;border-radius:999px;cursor:pointer}
      .cms-tab.active{font-weight:800}
      .cms-list-item{width:100%;text-align:left;border:1px solid rgba(0,0,0,0.08);background:#fff;padding:10px 12px;border-radius:12px;cursor:pointer;margin:8px 0}
      .cms-li-title{font-weight:700}
      .cms-li-sub{opacity:0.65;font-size:12px;margin-top:2px}
      .cms-empty{opacity:0.7;padding:12px}
      .cms-pill{border:1px solid rgba(0,0,0,0.12);background:#fff;padding:8px 12px;border-radius:999px;cursor:pointer;display:flex;gap:8px;align-items:center}
      .cms-caret{opacity:0.7}
      .cms-node{display:block}
      .cms-node-children{display:none;margin-top:8px}
      .cms-node.open .cms-node-children{display:block}
      .cms-section-title{font-weight:800;font-size:18px;margin-bottom:10px}
      .cms-section-body{white-space:pre-wrap;line-height:1.5}
      .cms-ask-btn{margin-top:12px;padding:10px 12px;border-radius:12px;border:1px solid rgba(0,0,0,0.12);background:#0b3a7a;color:#fff;cursor:pointer}
      .cms-card{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:12px;margin:10px 0}
      .cms-card-title{font-weight:800;margin-bottom:6px}
      .cms-card-why{opacity:0.7;font-size:12px;margin-bottom:8px}
      .cms-card-body{white-space:pre-wrap;line-height:1.5}
      .cms-card-btn{margin-top:10px;padding:8px 10px;border-radius:12px;border:1px solid rgba(0,0,0,0.12);background:#fff;cursor:pointer}
      .cms-status[data-kind="error"]{border-color:rgba(220,38,38,0.35)}
      .cms-status[data-kind="ok"]{border-color:rgba(34,197,94,0.35)}
    `;
    document.head.appendChild(css);
  }
})();