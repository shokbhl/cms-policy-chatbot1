/* =========================
   app.js (FULL)
   - Works with provided index.html + style.css
   - Uses /api (Cloudflare Pages Function) to proxy Worker
   - Tabs: Policies / Protocols / Handbooks / Chat
   - Loads lists from Worker (KV-backed)
   - Modal doc viewer
   - Chat UI (no truncation in UI)
========================= */

(() => {
  // =============== CONFIG ===============
  const API_URL = "/api";

  // LocalStorage keys
  const LS = {
    campus: "cms_campus",
    role: "cms_role", // staff | parent
    token_staff: "cms_staff_token",
    until_staff: "cms_staff_until",
    token_parent: "cms_parent_token",
    until_parent: "cms_parent_until",
    lastTab: "cms_last_tab",
    lastProgram: "cms_last_program"
  };

  // =============== DOM ===============
  const $ = (id) => document.getElementById(id);

  const campusSelect = $("campusSelect");
  const roleSelect = $("roleSelect");
  const loginBtn = $("loginBtn");
  const logoutBtn = $("logoutBtn");

  const tabs = Array.from(document.querySelectorAll(".tab"));
  const panels = {
    policies: $("panel-policies"),
    protocols: $("panel-protocols"),
    handbooks: $("panel-handbooks"),
    chat: $("panel-chat"),
  };

  const policiesList = $("policiesList");
  const protocolsList = $("protocolsList");
  const handbooksList = $("handbooksList");

  const countPolicies = $("countPolicies");
  const countProtocols = $("countProtocols");
  const countHandbooks = $("countHandbooks");

  const hbProgramSelect = $("hbProgramSelect");

  const chatOutput = $("chatOutput");
  const chatInput = $("chatInput");
  const chatSend = $("chatSend");
  const chatSpinner = $("chatSpinner");
  const chatProgram = $("chatProgram");

  // Modal
  const docModal = $("docModal");
  const modalClose = $("modalClose");
  const modalTitle = $("modalTitle");
  const modalMeta = $("modalMeta");
  const modalLink = $("modalLink");
  const modalContent = $("modalContent");
  const modalSectionTitle = $("modalSectionTitle");
  const modalActions = $("modalActions");

  // =============== STATE ===============
  let state = {
    campus: (localStorage.getItem(LS.campus) || "YC"),
    role: (localStorage.getItem(LS.role) || "parent"),
    tab: (localStorage.getItem(LS.lastTab) || "policies"),
    program: (localStorage.getItem(LS.lastProgram) || ""),
    lists: {
      policies: [],
      protocols: [],
      handbooks: []
    }
  };

  // =============== UTIL ===============
  const nowSec = () => Math.floor(Date.now() / 1000);

  function setCampus(v) {
    state.campus = v;
    localStorage.setItem(LS.campus, v);
  }

  function setRole(v) {
    state.role = v;
    localStorage.setItem(LS.role, v);
  }

  function setTab(v) {
    state.tab = v;
    localStorage.setItem(LS.lastTab, v);
  }

  function setProgram(v) {
    state.program = v || "";
    localStorage.setItem(LS.lastProgram, state.program);
  }

  function getToken() {
    if (state.role === "staff") {
      const t = localStorage.getItem(LS.token_staff) || "";
      const until = parseInt(localStorage.getItem(LS.until_staff) || "0", 10);
      if (t && until > nowSec()) return t;
      return "";
    } else {
      const t = localStorage.getItem(LS.token_parent) || "";
      const until = parseInt(localStorage.getItem(LS.until_parent) || "0", 10);
      if (t && until > nowSec()) return t;
      return "";
    }
  }

  function clearToken() {
    if (state.role === "staff") {
      localStorage.removeItem(LS.token_staff);
      localStorage.removeItem(LS.until_staff);
    } else {
      localStorage.removeItem(LS.token_parent);
      localStorage.removeItem(LS.until_parent);
    }
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function toast(msg) {
    // minimal toast via alert for now (simple + reliable)
    alert(msg);
  }

  async function apiPost(payload) {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = { ok: false, error: "Invalid JSON response from /api" };
    }
    if (!res.ok) {
      // normalize
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    return data;
  }

  function escapeHtml(s) {
    return (s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeContentLines(doc) {
    // doc.content can be array of strings or a string
    if (!doc) return [];
    if (Array.isArray(doc.content)) return doc.content.filter(Boolean);
    if (typeof doc.content === "string") {
      return doc.content.split("\n").map(x => x.trim()).filter(Boolean);
    }
    return [];
  }

  function buildPreview(doc) {
    const lines = normalizeContentLines(doc);
    const preview = lines.slice(0, 2).join(" ");
    return preview || "Open to view details…";
  }

  function renderDocGrid(container, docs, kind) {
    container.innerHTML = "";

    if (!docs || docs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "docCard";
      empty.innerHTML = `
        <div class="docTitle">No items found</div>
        <div class="docPreview">Check KV keys or try refresh.</div>
      `;
      container.appendChild(empty);
      return;
    }

    docs.forEach((doc) => {
      const el = document.createElement("div");
      el.className = "docCard";
      el.innerHTML = `
        <div class="docTitle">${escapeHtml(doc.title || doc.id || "Untitled")}</div>
        <div class="docPreview">${escapeHtml(buildPreview(doc))}</div>
      `;
      el.addEventListener("click", () => openDocModal(doc, kind));
      container.appendChild(el);
    });
  }

  function openModal() {
    docModal.style.display = "block";
  }

  function closeModal() {
    docModal.style.display = "none";
  }

  function openDocModal(doc, kind) {
    const lines = normalizeContentLines(doc);

    modalTitle.textContent = doc.title || doc.id || "Document";
    modalMeta.textContent = [
      kind?.toUpperCase?.() || "",
      doc.id ? `ID: ${doc.id}` : "",
      doc.order ? `Order: ${doc.order}` : ""
    ].filter(Boolean).join(" • ");

    modalSectionTitle.textContent = kind === "handbooks"
      ? `Campus: ${state.campus}${state.program ? ` • Program: ${state.program}` : ""}`
      : `Scope: ${kind}`;

    if (doc.link) {
      modalLink.href = doc.link;
      modalLink.style.visibility = "visible";
    } else {
      modalLink.href = "#";
      modalLink.style.visibility = "hidden";
    }

    modalActions.innerHTML = "";
    if (doc.keywords && Array.isArray(doc.keywords) && doc.keywords.length) {
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexWrap = "wrap";
      wrap.style.gap = "8px";
      doc.keywords.slice(0, 12).forEach(k => {
        const chip = document.createElement("span");
        chip.style.padding = "6px 10px";
        chip.style.border = "1px solid var(--line)";
        chip.style.borderRadius = "999px";
        chip.style.background = "var(--pill)";
        chip.style.fontSize = "12px";
        chip.textContent = k;
        wrap.appendChild(chip);
      });
      modalActions.appendChild(wrap);
    }

    modalContent.innerHTML = "";
    if (!lines.length) {
      const p = document.createElement("div");
      p.className = "para";
      p.textContent = "No content available.";
      modalContent.appendChild(p);
    } else {
      // show full content, no truncation
      lines.forEach((t) => {
        const p = document.createElement("div");
        p.className = "para";
        p.textContent = t;
        modalContent.appendChild(p);
      });
    }

    openModal();
  }

  function showPanel(tabName) {
    Object.keys(panels).forEach(k => {
      panels[k].classList.toggle("hidden", k !== tabName);
    });

    tabs.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
  }

  function setAuthButtons() {
    const logged = isLoggedIn();
    loginBtn.classList.toggle("hidden", logged);
    logoutBtn.classList.toggle("hidden", !logged);
  }

  // =============== DATA LOADING ===============
  async function loadPolicies() {
    const data = await apiPost({ op: "list", kind: "policies" });
    if (!data.ok) {
      toast(data.error || "Failed to load policies");
      state.lists.policies = [];
      countPolicies.textContent = "0";
      renderDocGrid(policiesList, [], "policies");
      return;
    }
    const docs = Array.isArray(data.items) ? data.items : [];
    state.lists.policies = docs;
    countPolicies.textContent = String(docs.length);
    renderDocGrid(policiesList, docs, "policies");
  }

  async function loadProtocols() {
    const data = await apiPost({ op: "list", kind: "protocols" });
    if (!data.ok) {
      toast(data.error || "Failed to load protocols");
      state.lists.protocols = [];
      countProtocols.textContent = "0";
      renderDocGrid(protocolsList, [], "protocols");
      return;
    }
    const docs = Array.isArray(data.items) ? data.items : [];
    state.lists.protocols = docs;
    countProtocols.textContent = String(docs.length);
    renderDocGrid(protocolsList, docs, "protocols");
  }

  async function loadHandbooks() {
    const data = await apiPost({ op: "list", kind: "handbooks", campus: state.campus });
    if (!data.ok) {
      toast(data.error || "Failed to load handbooks");
      state.lists.handbooks = [];
      countHandbooks.textContent = "0";
      renderDocGrid(handbooksList, [], "handbooks");
      return;
    }

    let docs = Array.isArray(data.items) ? data.items : [];

    // optional filter by program
    const prog = (state.program || "").trim();
    if (prog) {
      docs = docs.filter(d => {
        const p = (d.program || "").toLowerCase();
        return p === prog.toLowerCase();
      });
    }

    state.lists.handbooks = docs;
    countHandbooks.textContent = String(docs.length);
    renderDocGrid(handbooksList, docs, "handbooks");
  }

  async function refreshCurrentTab() {
    if (state.tab === "policies") return loadPolicies();
    if (state.tab === "protocols") return loadProtocols();
    if (state.tab === "handbooks") return loadHandbooks();
    // chat has no list
  }

  // =============== CHAT ===============
  function addMessage(role, text) {
    const row = document.createElement("div");
    row.className = `msg ${role === "user" ? "msg-user" : "msg-ai"}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    // Keep newlines visible
    bubble.style.whiteSpace = "pre-wrap";
    bubble.textContent = text;

    row.appendChild(bubble);
    chatOutput.appendChild(row);

    chatOutput.scrollTop = chatOutput.scrollHeight;
  }

  function setSpinner(on) {
    chatSpinner.style.display = on ? "block" : "none";
  }

  async function sendChat() {
    const q = (chatInput.value || "").trim();
    if (!q) return;

    addMessage("user", q);
    chatInput.value = "";

    setSpinner(true);

    const payload = {
      op: "ask",
      question: q,
      campus: state.campus,
      program: (chatProgram.value || state.program || ""),
      scope: "all",
      role: state.role
    };

    const data = await apiPost(payload);
    setSpinner(false);

    if (!data.ok) {
      addMessage("ai", `Error: ${data.error || "Failed to get answer"}`);
      return;
    }

    // Display full answer as-is (no truncation on UI)
    const ans = (data.answer || data.text || "").trim();
    addMessage("ai", ans || "No answer returned.");
  }

  // =============== AUTH ===============
  async function doLogin() {
    const role = state.role;

    const code = prompt(role === "staff" ? "Enter STAFF code:" : "Enter PARENT code:");
    if (!code) return;

    const data = await apiPost({ op: "auth", role, code: code.trim() });
    if (!data.ok) {
      toast(data.error || "Login failed");
      return;
    }

    const token = data.token || "";
    const until = data.until || (nowSec() + 60 * 60 * 8); // default 8h if not provided

    if (!token) {
      toast("Login failed: missing token");
      return;
    }

    if (role === "staff") {
      localStorage.setItem(LS.token_staff, token);
      localStorage.setItem(LS.until_staff, String(until));
    } else {
      localStorage.setItem(LS.token_parent, token);
      localStorage.setItem(LS.until_parent, String(until));
    }

    setAuthButtons();
    toast("Logged in successfully!");
  }

  function doLogout() {
    clearToken();
    setAuthButtons();
    toast("Logged out.");
  }

  // =============== EVENTS ===============
  function bindEvents() {
    campusSelect.addEventListener("change", async () => {
      setCampus(campusSelect.value);
      if (state.tab === "handbooks" || state.tab === "chat") {
        await refreshCurrentTab();
      }
    });

    roleSelect.addEventListener("change", () => {
      setRole(roleSelect.value);
      setAuthButtons();
    });

    loginBtn.addEventListener("click", doLogin);
    logoutBtn.addEventListener("click", doLogout);

    tabs.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const t = btn.dataset.tab;
        setTab(t);
        showPanel(t);
        await refreshCurrentTab();
      });
    });

    hbProgramSelect.addEventListener("change", async () => {
      setProgram(hbProgramSelect.value);
      // sync with chat program dropdown too
      chatProgram.value = hbProgramSelect.value || "";
      if (state.tab === "handbooks") await loadHandbooks();
    });

    chatProgram.addEventListener("change", () => {
      // keep selection
      setProgram(chatProgram.value);
      hbProgramSelect.value = chatProgram.value || "";
    });

    chatSend.addEventListener("click", sendChat);

    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });

    modalClose.addEventListener("click", closeModal);
    docModal.addEventListener("click", (e) => {
      if (e.target === docModal) closeModal();
    });
  }

  // =============== INIT ===============
  async function init() {
    // set initial selects
    campusSelect.value = state.campus;
    roleSelect.value = state.role;

    hbProgramSelect.value = state.program || "";
    chatProgram.value = state.program || "";

    setAuthButtons();
    bindEvents();

    // show current tab
    showPanel(state.tab);

    // preload lists for all tabs (fast + keeps counts updated)
    await Promise.allSettled([loadPolicies(), loadProtocols(), loadHandbooks()]);
  }

  init();
})();
