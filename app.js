/* =========================
   app.js (FULL FINAL)
   - Works with your index.html + style.css
   - Uses /api (Cloudflare Pages Function) to proxy Worker
   - Login staff/parent
   - Campus-based handbook UI (modern)
   - Policies/Protocols menu panel
   - Admin mode PIN + dashboard/logs links
   - Chat UI
========================= */

(() => {
  // =============== CONFIG ===============
  // We call same-origin /api (Pages Function) which proxies to Worker /api.
  const API_URL = "/api";

  // LocalStorage keys
  const LS = {
    campus: "cms_campus",
    role: "cms_role", // staff | parent
    staffToken: "cms_staff_token",
    staffUntil: "cms_staff_until",

    parentToken: "cms_parent_token",
    parentUntil: "cms_parent_until",

    adminToken: "cms_admin_token",
    adminUntil: "cms_admin_until",

    // optional: last selected menu
    lastMenu: "cms_last_menu"
  };

  const CAMPUSES = ["YC", "MC", "SC", "TC", "WC"];

  // =============== DOM ===============
  const $ = (id) => document.getElementById(id);

  // screens
  const loginScreen = $("login-screen");
  const chatScreen = $("chat-screen");

  // header + top menu
  const headerActions = $("header-actions");
  const topMenuBar = $("top-menu-bar");
  const campusSwitch = $("campus-switch");
  const logoutBtn = $("logout-btn");
  const adminModeBtn = $("admin-mode-btn");
  const modeBadge = $("mode-badge");
  const adminLinks = $("admin-links");

  // login form
  const loginForm = $("login-form");
  const accessCodeInput = $("access-code");
  const campusSelect = $("campus-select");
  const loginAdminBtn = $("login-admin-btn");
  const loginError = $("login-error");

  // chat
  const chatWindow = $("chat-window");
  const chatForm = $("chat-form");
  const userInput = $("user-input");

  // menu panel (modal)
  const menuOverlay = $("menu-overlay");
  const menuPanel = $("menu-panel");
  const menuPanelTitle = $("menu-panel-title");
  const menuPanelBody = $("menu-panel-body");
  const menuPanelClose = $("menu-panel-close");

  // admin modal
  const adminModal = $("admin-modal");
  const adminPinInput = $("admin-pin");
  const adminPinCancel = $("admin-pin-cancel");
  const adminPinSubmit = $("admin-pin-submit");

  // =============== UTIL ===============
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const now = () => Date.now();

  function setText(el, t) {
    if (!el) return;
    el.textContent = t;
  }

  function show(el) {
    if (!el) return;
    el.classList.remove("hidden");
  }

  function hide(el) {
    if (!el) return;
    el.classList.add("hidden");
  }

  function openMenuPanel(title) {
    setText(menuPanelTitle, title || "Menu");
    show(menuOverlay);
    show(menuPanel);
    menuPanel.setAttribute("aria-hidden", "false");
  }

  function closeMenuPanel() {
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

  function isTokenActive(tokenKey, untilKey) {
    const token = localStorage.getItem(tokenKey) || "";
    const until = Number(localStorage.getItem(untilKey) || "0");
    return !!token && now() < until;
  }

  function isStaffActive() {
    return isTokenActive(LS.staffToken, LS.staffUntil);
  }

  function isParentActive() {
    return isTokenActive(LS.parentToken, LS.parentUntil);
  }

  function isAdminActive() {
    return isTokenActive(LS.adminToken, LS.adminUntil);
  }

  function getCampus() {
    return localStorage.getItem(LS.campus) || "";
  }

  function setCampus(c) {
    const campus = String(c || "").toUpperCase();
    localStorage.setItem(LS.campus, campus);
    if (campusSwitch) campusSwitch.value = campus;
    if (campusSelect) campusSelect.value = campus;
  }

  function getRole() {
    return localStorage.getItem(LS.role) || "";
  }

  function setRole(r) {
    localStorage.setItem(LS.role, r);
  }

  function setModeBadge() {
    const role = getRole();
    const admin = isAdminActive();

    if (admin) {
      modeBadge.textContent = "ADMIN";
      modeBadge.classList.add("admin");
      show(adminLinks);
      return;
    }

    modeBadge.classList.remove("admin");
    hide(adminLinks);

    if (role === "parent") modeBadge.textContent = "PARENT";
    else modeBadge.textContent = "STAFF";
  }

  function setActiveMenuPill(menuKey) {
    const pills = document.querySelectorAll(".menu-pill");
    pills.forEach((p) => p.classList.remove("active"));
    const active = document.querySelector(`.menu-pill[data-menu="${menuKey}"]`);
    if (active) active.classList.add("active");
  }

  function pushMsg(role, html) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.innerHTML = html;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function showTyping() {
    const wrap = document.createElement("div");
    wrap.className = "typing-bubble";
    wrap.id = "typing-bubble";
    wrap.innerHTML = `
      <div class="typing-dots">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
      <div class="muted" style="font-weight:800">Thinking…</div>
    `;
    chatWindow.appendChild(wrap);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById("typing-bubble");
    if (el) el.remove();
  }

  // =============== API ===============
  async function apiPost(payload) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  // =============== LOGIN ===============
  async function doLogin(code, campus) {
    const cleanCode = String(code || "").trim();
    const cleanCampus = String(campus || "").trim().toUpperCase();

    if (!cleanCode) return { ok: false, error: "Please enter access code." };
    if (!cleanCampus) return { ok: false, error: "Please select campus." };

    // Call Worker via /api: { action:"auth", code, campus }
    // The worker should decide staff/parent based on code.
    const { res, data } = await apiPost({
      action: "auth",
      code: cleanCode,
      campus: cleanCampus
    });

    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Login failed." };
    }

    // expected: { ok:true, role:"staff|parent", token, expires_in }
    const role = String(data.role || "").toLowerCase();
    const token = String(data.token || "");
    const expiresIn = Number(data.expires_in || 28800); // default 8h

    if (!token || (role !== "staff" && role !== "parent")) {
      return { ok: false, error: "Invalid auth response (missing token/role)." };
    }

    setCampus(cleanCampus);
    setRole(role);

    const until = now() + expiresIn * 1000;

    if (role === "staff") {
      localStorage.setItem(LS.staffToken, token);
      localStorage.setItem(LS.staffUntil, String(until));
      // clear parent token if any
      localStorage.removeItem(LS.parentToken);
      localStorage.removeItem(LS.parentUntil);
    } else {
      localStorage.setItem(LS.parentToken, token);
      localStorage.setItem(LS.parentUntil, String(until));
      // clear staff token if any
      localStorage.removeItem(LS.staffToken);
      localStorage.removeItem(LS.staffUntil);
    }

    // keep admin as-is (admin is separate)
    return { ok: true };
  }

  function logout() {
    // clear user session
    localStorage.removeItem(LS.role);
    localStorage.removeItem(LS.staffToken);
    localStorage.removeItem(LS.staffUntil);
    localStorage.removeItem(LS.parentToken);
    localStorage.removeItem(LS.parentUntil);

    // keep campus? (your choice). I keep campus because it’s convenient.
    // localStorage.removeItem(LS.campus);

    // also clear admin
    localStorage.removeItem(LS.adminToken);
    localStorage.removeItem(LS.adminUntil);

    // UI
    hide(headerActions);
    hide(topMenuBar);
    hide(chatScreen);
    show(loginScreen);

    setText(loginError, "");
    accessCodeInput.value = "";
    setModeBadge();

    closeMenuPanel();
    closeAdminModal();
  }

  // =============== ADMIN MODE ===============
  async function adminLogin(pin) {
    const cleanPin = String(pin || "").trim();
    if (!cleanPin) return { ok: false, error: "PIN required." };

    // Call worker directly through /api? or via action admin_auth.
    // We'll send through /api for same-origin.
    const { res, data } = await apiPost({
      action: "admin_auth",
      pin: cleanPin
    });

    if (!res.ok || !data.ok) {
      return { ok: false, error: data.error || "Admin PIN invalid." };
    }

    const token = String(data.token || "");
    const expiresIn = Number(data.expires_in || 28800);

    if (!token) return { ok: false, error: "Missing admin token." };

    localStorage.setItem(LS.adminToken, token);
    localStorage.setItem(LS.adminUntil, String(now() + expiresIn * 1000));

    return { ok: true };
  }

  // =============== MENU DATA LOADERS ===============
  async function loadPoliciesList() {
    // Worker should respond: { ok:true, items:[{id,title,summary,link,keywords?}, ...] }
    const campus = getCampus();
    const role = getRole(); // staff/parent
    const token = role === "parent" ? (localStorage.getItem(LS.parentToken) || "") : (localStorage.getItem(LS.staffToken) || "");

    const { res, data } = await apiPost({
      action: "list",
      source: "policy",
      campus,
      token,
      role
    });

    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load policies.");
    return Array.isArray(data.items) ? data.items : [];
  }

  async function loadProtocolsList() {
    const campus = getCampus();
    const role = getRole();
    const token = role === "parent" ? (localStorage.getItem(LS.parentToken) || "") : (localStorage.getItem(LS.staffToken) || "");

    const { res, data } = await apiPost({
      action: "list",
      source: "protocol",
      campus,
      token,
      role
    });

    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load protocols.");
    return Array.isArray(data.items) ? data.items : [];
  }

  async function loadHandbooks() {
    const campus = getCampus();
    const role = getRole();
    const token = role === "parent" ? (localStorage.getItem(LS.parentToken) || "") : (localStorage.getItem(LS.staffToken) || "");

    const { res, data } = await apiPost({
      action: "handbooks",
      campus,
      token,
      role
    });

    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load handbooks.");
    return Array.isArray(data.items) ? data.items : [];
  }

  async function loadHandbookById(handbookId) {
    const campus = getCampus();
    const role = getRole();
    const token = role === "parent" ? (localStorage.getItem(LS.parentToken) || "") : (localStorage.getItem(LS.staffToken) || "");

    const { res, data } = await apiPost({
      action: "handbook_get",
      campus,
      handbook_id: handbookId,
      token,
      role
    });

    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load handbook.");
    return data.handbook || null;
  }

  // =============== RENDER: POLICIES / PROTOCOLS ===============
  function renderListItems(title, items, type) {
    openMenuPanel(title);

    if (!items.length) {
      menuPanelBody.innerHTML = `<div class="muted" style="font-weight:800">No items found.</div>`;
      return;
    }

    menuPanelBody.innerHTML = items
      .map((it) => {
        const t = it.title || it.name || it.id || "Untitled";
        const sum = it.summary || it.description || "";
        const link = it.link || it.url || "";
        const id = it.id || "";

        return `
          <div class="hb-card">
            <div class="hb-title">${esc(t)}</div>
            ${sum ? `<div class="hb-meta">${esc(sum)}</div>` : ""}
            <div class="hb-open-row">
              <button class="hb-open-btn" data-open-doc="${esc(id)}" data-doc-type="${esc(type)}">Open sections</button>
              ${link ? `<a class="hb-open-btn" href="${esc(link)}" target="_blank" rel="noreferrer">Open full document</a>` : ""}
              <button class="hb-open-btn" data-ask="${esc(t)}">Ask about this</button>
            </div>
          </div>
        `;
      })
      .join("");

    // handlers
    menuPanelBody.querySelectorAll("[data-ask]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.getAttribute("data-ask") || "";
        closeMenuPanel();
        userInput.value = `Summarize ${t} for ${getCampus()} campus.`;
        userInput.focus();
      });
    });

    // If your worker supports "doc sections", we can request on click:
    menuPanelBody.querySelectorAll("[data-open-doc]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-open-doc") || "";
        const docType = btn.getAttribute("data-doc-type") || type;

        btn.disabled = true;
        btn.textContent = "Loading…";

        try {
          const campus = getCampus();
          const role = getRole();
          const token =
            role === "parent"
              ? localStorage.getItem(LS.parentToken) || ""
              : localStorage.getItem(LS.staffToken) || "";

          const { res, data } = await apiPost({
            action: "doc_sections",
            doc_type: docType,
            doc_id: id,
            campus,
            token,
            role
          });

          if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load sections.");

          const sections = Array.isArray(data.sections) ? data.sections : [];
          renderDocSections(title, sections, docType, id, data.doc || null);
        } catch (e) {
          alert(e?.message || "Error");
        } finally {
          btn.disabled = false;
          btn.textContent = "Open sections";
        }
      });
    });
  }

  function renderDocSections(title, sections, docType, docId, docObj) {
    // docObj may contain title/link
    const docTitle = docObj?.title || title;
    const docLink = docObj?.link || "";

    openMenuPanel(docTitle);

    const secHtml = sections
      .map((s) => {
        const k = s.key || s.id || "";
        const st = s.title || k || "Section";
        const preview = s.preview || s.summary || s.content || "";
        const snippet = String(preview).slice(0, 180);

        return `
          <button class="hb-open-sec" data-doc-sec="${esc(k)}" data-doc-type="${esc(docType)}" data-doc-id="${esc(docId)}">
            ${esc(st)}
            ${snippet ? `<div class="muted" style="font-weight:700;margin-top:6px">${esc(snippet)}${preview.length>180 ? "…" : ""}</div>` : ""}
          </button>
        `;
      })
      .join("");

    menuPanelBody.innerHTML = `
      <div class="hb-preview">
        <div class="hb-preview-title">${esc(docTitle)}</div>
        <div class="muted" style="font-weight:800;margin-top:6px">Select a section to preview. You can also ask in chat.</div>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          ${docLink ? `<a class="hb-copy-btn" href="${esc(docLink)}" target="_blank" rel="noreferrer">Open full document</a>` : ""}
          <button class="hb-copy-btn" id="askDocBtn">Ask about this document</button>
        </div>
      </div>

      <div style="margin-top:12px; display:grid; gap:10px;">
        ${secHtml || `<div class="muted" style="font-weight:800">No sections found.</div>`}
      </div>

      <div id="docPreview" class="hb-preview" style="margin-top:14px; display:none;"></div>
    `;

    const askDocBtn = document.getElementById("askDocBtn");
    askDocBtn?.addEventListener("click", () => {
      closeMenuPanel();
      userInput.value = `Explain ${docTitle} for ${getCampus()} campus.`;
      userInput.focus();
    });

    const previewBox = document.getElementById("docPreview");

    menuPanelBody.querySelectorAll("[data-doc-sec]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const secKey = btn.getAttribute("data-doc-sec") || "";
        const docType2 = btn.getAttribute("data-doc-type") || docType;
        const docId2 = btn.getAttribute("data-doc-id") || docId;

        btn.disabled = true;

        try {
          const campus = getCampus();
          const role = getRole();
          const token =
            role === "parent"
              ? localStorage.getItem(LS.parentToken) || ""
              : localStorage.getItem(LS.staffToken) || "";

          const { res, data } = await apiPost({
            action: "doc_section_get",
            doc_type: docType2,
            doc_id: docId2,
            section_key: secKey,
            campus,
            token,
            role
          });

          if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load section.");

          const secTitle = data.section?.title || secKey;
          const content = data.section?.content || "";

          previewBox.style.display = "block";
          previewBox.innerHTML = `
            <div class="hb-preview-title">${esc(secTitle)}</div>
            <div class="hb-preview-text" style="margin-top:10px; white-space:pre-wrap;">${esc(content)}</div>

            <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
              <button class="hb-copy-btn" id="copySecBtn">Copy</button>
              <button class="hb-copy-btn" id="askSecBtn">Ask about this section</button>
            </div>
          `;

          document.getElementById("copySecBtn")?.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(`${secTitle}\n\n${content}`);
              alert("Copied!");
            } catch {
              alert("Copy failed (browser permission).");
            }
          });

          document.getElementById("askSecBtn")?.addEventListener("click", () => {
            closeMenuPanel();
            userInput.value = `Based on "${secTitle}", answer: `;
            userInput.focus();
          });

        } catch (e) {
          alert(e?.message || "Error");
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  // =============== RENDER: HANDBOOK (MODERN) ===============
  function renderHandbookPicker(handbooks) {
    openMenuPanel("Parent Handbook");

    const campus = getCampus() || "—";

    if (!handbooks.length) {
      menuPanelBody.innerHTML = `
        <div class="hb-preview">
          <div class="hb-preview-title">Parent Handbook (Campus-based)</div>
          <div class="muted" style="font-weight:800;margin-top:6px">Current campus: ${esc(campus)}</div>
          <div class="muted" style="font-weight:800;margin-top:10px">No handbooks found for this campus.</div>
        </div>
      `;
      return;
    }

    menuPanelBody.innerHTML = `
      <div class="hb-preview">
        <div class="hb-preview-title">Parent Handbook (Campus-based)</div>
        <div class="muted" style="font-weight:800;margin-top:6px">Current campus: ${esc(campus)}</div>
        <div class="muted" style="font-weight:800;margin-top:6px">Select a handbook to view sections:</div>
      </div>

      <div id="hbList" style="display:grid; gap:10px; margin-top:12px;"></div>

      <div id="hbSectionsWrap" class="hb-preview" style="display:none; margin-top:14px;"></div>
      <div id="hbPreviewWrap" class="hb-preview" style="display:none; margin-top:14px;"></div>
    `;

    const hbList = document.getElementById("hbList");
    const sectionsWrap = document.getElementById("hbSectionsWrap");
    const previewWrap = document.getElementById("hbPreviewWrap");

    hbList.innerHTML = handbooks
      .map((hb, i) => {
        const title = hb.title || hb.name || hb.id || `Handbook ${i + 1}`;
        const prog = hb.program || hb.program_name || "";
        const link = hb.link || "";
        return `
          <div class="hb-item" data-hb-id="${esc(hb.id)}">
            <div style="font-weight:900">${esc(title)}</div>
            <div class="muted" style="font-weight:800; margin-top:4px">${esc(prog)}</div>
            ${link ? `<div class="muted" style="font-weight:800; margin-top:4px">Has full link</div>` : ""}
          </div>
        `;
      })
      .join("");

    hbList.querySelectorAll("[data-hb-id]").forEach((card) => {
      card.addEventListener("click", async () => {
        hbList.querySelectorAll(".hb-item").forEach((x) => x.classList.remove("active"));
        card.classList.add("active");

        const hbId = card.getAttribute("data-hb-id") || "";
        sectionsWrap.style.display = "block";
        sectionsWrap.innerHTML = `<div class="muted" style="font-weight:900">Loading sections…</div>`;
        previewWrap.style.display = "none";
        previewWrap.innerHTML = "";

        try {
          const hbObj = await loadHandbookById(hbId);
          const hbTitle = hbObj?.title || hbId;
          const hbLink = hbObj?.link || "";

          const sections = Array.isArray(hbObj?.sections) ? hbObj.sections : [];

          sectionsWrap.innerHTML = `
            <div class="hb-preview-title">${esc(hbTitle)}</div>
            <div class="muted" style="font-weight:800;margin-top:6px">Choose a section to preview:</div>

            <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
              ${hbLink ? `<a class="hb-copy-btn" href="${esc(hbLink)}" target="_blank" rel="noreferrer">Open full document</a>` : ""}
              <button class="hb-copy-btn" id="askHbBtn">Ask about this handbook</button>
            </div>

            <div style="margin-top:12px; display:grid; gap:10px;">
              ${
                sections
                  .map((s) => {
                    const key = s.key || "";
                    const st = s.title || key || "Section";
                    const snippet = String(s.content || "").slice(0, 140);
                    return `
                      <button class="hb-open-sec" data-hb-sec="${esc(key)}" data-hb-id="${esc(hbId)}">
                        ${esc(st)}
                        ${snippet ? `<div class="muted" style="font-weight:700;margin-top:6px">${esc(snippet)}${(s.content||"").length>140?"…":""}</div>` : ""}
                      </button>
                    `;
                  })
                  .join("") || `<div class="muted" style="font-weight:800">No sections found.</div>`
              }
            </div>
          `;

          document.getElementById("askHbBtn")?.addEventListener("click", () => {
            closeMenuPanel();
            userInput.value = `Summarize the ${hbTitle} for ${getCampus()} campus.`;
            userInput.focus();
          });

          sectionsWrap.querySelectorAll("[data-hb-sec]").forEach((btn) => {
            btn.addEventListener("click", () => {
              const key = btn.getAttribute("data-hb-sec") || "";
              const sec = sections.find((x) => String(x.key) === String(key));
              const secTitle = sec?.title || key;
              const content = sec?.content || "";

              previewWrap.style.display = "block";
              previewWrap.innerHTML = `
                <div class="hb-preview-title">${esc(secTitle)}</div>
                <div class="hb-preview-text" style="margin-top:10px; white-space:pre-wrap;">${esc(content)}</div>

                <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
                  <button class="hb-copy-btn" id="copyHbSecBtn">Copy</button>
                  <button class="hb-copy-btn" id="askHbSecBtn">Ask about this section</button>
                </div>
              `;

              document.getElementById("copyHbSecBtn")?.addEventListener("click", async () => {
                try {
                  await navigator.clipboard.writeText(`${secTitle}\n\n${content}`);
                  alert("Copied!");
                } catch {
                  alert("Copy failed (browser permission).");
                }
              });

              document.getElementById("askHbSecBtn")?.addEventListener("click", () => {
                closeMenuPanel();
                userInput.value = `Based on "${secTitle}", answer: `;
                userInput.focus();
              });
            });
          });

        } catch (e) {
          sectionsWrap.innerHTML = `<div class="muted" style="font-weight:900;color:#b91c1c">${esc(e?.message || "Error")}</div>`;
        }
      });
    });
  }

  // =============== CHAT SEND ===============
  async function askQuestion(q) {
    const question = String(q || "").trim();
    if (!question) return;

    const campus = getCampus();
    const role = getRole();

    if (!campus) {
      alert("Please select a campus first.");
      return;
    }

    const token =
      role === "parent"
        ? localStorage.getItem(LS.parentToken) || ""
        : localStorage.getItem(LS.staffToken) || "";

    pushMsg("user", esc(question));
    showTyping();

    try {
      const { res, data } = await apiPost({
        action: "ask",
        campus,
        role,
        token,
        query: question
      });

      hideTyping();

      if (!res.ok || !data.ok) {
        pushMsg("assistant", `<b style="color:#b91c1c">Error:</b> ${esc(data.error || "Request failed")}`);
        return;
      }

      const answer = data.answer || data.response || "Done.";
      const link = data.link || data.source_link || "";
      const title = data.title || data.source_title || "";

      let html = `<div style="white-space:pre-wrap">${esc(answer)}</div>`;
      if (link) {
        html += `<div style="margin-top:10px"><a href="${esc(link)}" target="_blank" rel="noreferrer">Open full document</a>${title ? ` <span class="muted" style="font-weight:800">(${esc(title)})</span>` : ""}</div>`;
      }
      pushMsg("assistant", html);

    } catch (e) {
      hideTyping();
      pushMsg("assistant", `<b style="color:#b91c1c">Network error:</b> ${esc(e?.message || "Failed")}`);
    }
  }

  // =============== UI STATE ===============
  function enterApp() {
    // show chat + controls
    hide(loginScreen);
    show(chatScreen);
    show(headerActions);
    show(topMenuBar);

    // campus dropdowns
    const c = getCampus();
    if (campusSwitch && c) campusSwitch.value = c;
    if (campusSelect && c) campusSelect.value = c;

    setModeBadge();
  }

  function enterLogin() {
    show(loginScreen);
    hide(chatScreen);
    hide(headerActions);
    hide(topMenuBar);
    setModeBadge();
  }

  function validateSessionOrLogout() {
    const role = getRole();

    const ok =
      (role === "staff" && isStaffActive()) ||
      (role === "parent" && isParentActive());

    if (!ok) {
      enterLogin();
      return false;
    }
    return true;
  }

  // =============== EVENTS ===============
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setText(loginError, "");

    const code = accessCodeInput.value;
    const campus = campusSelect.value;

    try {
      const r = await doLogin(code, campus);
      if (!r.ok) {
        setText(loginError, r.error || "Login failed.");
        return;
      }
      enterApp();
      pushMsg("assistant", `Hi! ✅ Logged in as <b>${esc(getRole().toUpperCase())}</b> for campus <b>${esc(getCampus())}</b>. How can I help?`);
    } catch (err) {
      setText(loginError, err?.message || "Login failed.");
    }
  });

  campusSelect?.addEventListener("change", () => {
    setCampus(campusSelect.value);
  });

  campusSwitch?.addEventListener("change", () => {
    setCampus(campusSwitch.value);
  });

  logoutBtn?.addEventListener("click", () => logout());

  chatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = userInput.value;
    userInput.value = "";
    await askQuestion(q);
  });

  // top menu buttons
  document.querySelectorAll(".menu-pill").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const menu = btn.getAttribute("data-menu") || "";
      localStorage.setItem(LS.lastMenu, menu);
      setActiveMenuPill(menu);

      try {
        if (!validateSessionOrLogout()) return;

        if (menu === "policies") {
          openMenuPanel("Policies");
          menuPanelBody.innerHTML = `<div class="muted" style="font-weight:900">Loading…</div>`;
          const items = await loadPoliciesList();
          renderListItems("Policies", items, "policy");
        }

        if (menu === "protocols") {
          openMenuPanel("Protocols");
          menuPanelBody.innerHTML = `<div class="muted" style="font-weight:900">Loading…</div>`;
          const items = await loadProtocolsList();
          renderListItems("Protocols", items, "protocol");
        }

        if (menu === "handbook") {
          openMenuPanel("Parent Handbook");
          menuPanelBody.innerHTML = `<div class="muted" style="font-weight:900">Loading…</div>`;
          const items = await loadHandbooks();
          renderHandbookPicker(items);
        }
      } catch (e) {
        openMenuPanel("Error");
        menuPanelBody.innerHTML = `<div class="muted" style="font-weight:900;color:#b91c1c">${esc(e?.message || "Failed")}</div>`;
      }
    });
  });

  // menu panel close
  menuOverlay?.addEventListener("click", closeMenuPanel);
  menuPanelClose?.addEventListener("click", closeMenuPanel);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenuPanel();
      closeAdminModal();
    }
  });

  // Admin button (header)
  adminModeBtn?.addEventListener("click", () => {
    openAdminModal();
  });

  // Admin login button (on login screen)
  loginAdminBtn?.addEventListener("click", () => {
    openAdminModal();
  });

  adminPinCancel?.addEventListener("click", closeAdminModal);

  adminPinSubmit?.addEventListener("click", async () => {
    try {
      const pin = adminPinInput.value;
      const r = await adminLogin(pin);
      if (!r.ok) {
        alert(r.error || "Admin login failed");
        return;
      }
      closeAdminModal();
      setModeBadge();
      alert("Admin mode enabled ✅");
    } catch (e) {
      alert(e?.message || "Admin login failed");
    }
  });

  // =============== INIT ===============
  function initCampusSelects() {
    // Ensure campus lists have values
    if (campusSelect && campusSelect.options.length <= 1) {
      CAMPUSES.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        campusSelect.appendChild(opt);
      });
    }
    if (campusSwitch && campusSwitch.options.length <= 1) {
      CAMPUSES.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        campusSwitch.appendChild(opt);
      });
    }
  }

  function init() {
    initCampusSelects();

    // default campus if missing (optional)
    if (!getCampus()) setCampus("MC");

    // session check
    const role = getRole();
    const loggedIn =
      (role === "staff" && isStaffActive()) ||
      (role === "parent" && isParentActive());

    if (loggedIn) {
      enterApp();
      setActiveMenuPill(localStorage.getItem(LS.lastMenu) || "");
    } else {
      enterLogin();
    }

    setModeBadge();
  }

  init();
})();