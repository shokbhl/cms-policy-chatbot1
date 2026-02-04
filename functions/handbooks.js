/* ============================================
   handbook.js (FULL)
   - Opens handbook menu panel
   - Loads handbook list for selected campus
   - Allows opening a handbook (full) or a single section
   - Shows section content inside chat
   ============================================ */

(function () {
  // =====================
  // Config
  // =====================
  const API_BASE = ""; 
  // اگر Pages Functions داری:
  // /handbooks -> proxy به worker /handbooks
  // در غیر اینصورت مستقیم بزن به worker
  // const API_BASE = "https://cms-policy-worker.shokbhl.workers.dev";

  const ENDPOINT = `${API_BASE}/handbooks`;

  const LS = {
    campus: "cms_campus",
    role: "cms_role",
    staffToken: "cms_staff_token",
    parentToken: "cms_parent_token",
    adminToken: "cms_admin_token"
  };

  // =====================
  // DOM
  // =====================
  const overlay = document.getElementById("menu-overlay");
  const panel = document.getElementById("menu-panel");
  const panelTitle = document.getElementById("menu-panel-title");
  const panelBody = document.getElementById("menu-panel-body");
  const closeBtn = document.getElementById("menu-panel-close");

  // For chat fallback
  const chatWindow = document.getElementById("chat-window");

  // Menu button in top bar
  const handbookBtn = document.querySelector(`[data-menu="handbook"]`);

  // =====================
  // Small helpers
  // =====================
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function getCampus() {
    return (localStorage.getItem(LS.campus) || "").trim().toUpperCase();
  }

  function getRole() {
    return (localStorage.getItem(LS.role) || "").trim().toLowerCase();
  }

  function getAnyToken() {
    // priority: staff -> parent -> admin
    return (
      localStorage.getItem(LS.staffToken) ||
      localStorage.getItem(LS.parentToken) ||
      localStorage.getItem(LS.adminToken) ||
      ""
    );
  }

  function ensureBasicsOrWarn() {
    const campus = getCampus();
    const token = getAnyToken();
    if (!token) {
      pushAssistant(
        "You are not logged in. Please login first, then open Parent Handbook."
      );
      return { ok: false };
    }
    if (!campus) {
      pushAssistant(
        "Campus is not selected. Please login and choose a campus, then try again."
      );
      return { ok: false };
    }
    return { ok: true, campus, token };
  }

  function pushAssistant(text) {
    // if app.js has global helper
    if (typeof window.addAssistantMessage === "function") {
      window.addAssistantMessage(text);
      return;
    }

    // fallback: write bubble into chat window
    if (!chatWindow) return;
    const div = document.createElement("div");
    div.className = "msg assistant";
    div.textContent = text;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function pushUser(text) {
    if (typeof window.addUserMessage === "function") {
      window.addUserMessage(text);
      return;
    }
    if (!chatWindow) return;
    const div = document.createElement("div");
    div.className = "msg user";
    div.textContent = text;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function openPanel(title) {
    if (!overlay || !panel || !panelBody || !panelTitle) return;
    panelTitle.textContent = title || "Menu";
    overlay.classList.remove("hidden");
    panel.classList.remove("hidden");
    panel.setAttribute("aria-hidden", "false");
  }

  function closePanel() {
    if (!overlay || !panel) return;
    overlay.classList.add("hidden");
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
  }

  async function authedFetch(url) {
    const token = getAnyToken();
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  // =====================
  // Render handbook list
  // =====================
  function renderHandbookList(campus, handbooks) {
    panelBody.innerHTML = "";

    if (!Array.isArray(handbooks) || !handbooks.length) {
      panelBody.innerHTML = `
        <div class="muted" style="font-weight:800;margin-bottom:10px">
          No handbooks found for campus ${esc(campus)}.
        </div>
        <div class="muted">Check your KV key: <b>handbook_${esc(campus)}</b></div>
      `;
      return;
    }

    const top = document.createElement("div");
    top.className = "menu-group-label";
    top.textContent = `Campus ${campus} • ${handbooks.length} handbook(s)`;
    panelBody.appendChild(top);

    for (const hb of handbooks) {
      const card = document.createElement("div");
      card.className = "hb-card";

      const title = hb.title || "Parent Handbook";
      const program = hb.program || "";
      const link = hb.link || "";

      card.innerHTML = `
        <div class="hb-title">${esc(title)}</div>
        <div class="hb-meta">
          ${program ? `Program: <b>${esc(program)}</b> • ` : ""}
          ID: <span class="muted">${esc(hb.id || "")}</span>
        </div>
        <div class="hb-open-row">
          <button class="hb-open-btn" data-open-hb="1" data-hbid="${esc(hb.id || "")}">
            Open Sections
          </button>
          ${
            link
              ? `<a class="hb-open-btn" href="${esc(link)}" target="_blank" rel="noreferrer">Open PDF/Link</a>`
              : ""
          }
        </div>
        <div class="hb-sections" data-sections-for="${esc(hb.id || "")}" style="margin-top:10px;display:none;"></div>
      `;

      panelBody.appendChild(card);

      // Attach open sections handler
      const btn = card.querySelector(`[data-open-hb="1"]`);
      btn?.addEventListener("click", async () => {
        await toggleSectionsForHandbook(campus, hb.id, card);
      });
    }
  }

  async function toggleSectionsForHandbook(campus, id, cardEl) {
    const secWrap = cardEl.querySelector(`[data-sections-for="${CSS.escape(id)}"]`);
    if (!secWrap) return;

    // toggle visibility if already loaded
    const isVisible = secWrap.style.display !== "none";
    if (isVisible) {
      secWrap.style.display = "none";
      return;
    }

    // load handbook full (with sections content) OR list from summary
    secWrap.style.display = "block";
    secWrap.innerHTML = `<div class="muted">Loading sections…</div>`;

    const url = `${ENDPOINT}?campus=${encodeURIComponent(campus)}&id=${encodeURIComponent(
      id
    )}`;

    const { res, data } = await authedFetch(url);

    if (!res.ok || !data.ok) {
      secWrap.innerHTML = `<div class="muted" style="color:#b91c1c;font-weight:800">
        Failed to load handbook. ${esc(data.error || res.status)}
      </div>`;
      return;
    }

    const hb = data.handbook || {};
    const sections = Array.isArray(hb.sections) ? hb.sections : [];

    if (!sections.length) {
      secWrap.innerHTML = `<div class="muted">No sections found in this handbook.</div>`;
      return;
    }

    // render buttons for each section
    secWrap.innerHTML = "";
    for (const s of sections) {
      const key = s.key || "";
      const title = s.title || key || "Section";

      const b = document.createElement("button");
      b.className = "hb-section-btn";
      b.type = "button";
      b.innerHTML = `${esc(title)} <span class="muted" style="font-weight:700">(${esc(
        key
      )})</span>`;

      b.addEventListener("click", async () => {
        await openSectionToChat(campus, id, key);
      });

      secWrap.appendChild(b);
    }
  }

  // =====================
  // Open section -> show in chat
  // =====================
  async function openSectionToChat(campus, handbookId, sectionKey) {
    // show user message
    pushUser(`Handbook (${campus}) • ${handbookId} • Section: ${sectionKey}`);

    const url = `${ENDPOINT}?campus=${encodeURIComponent(
      campus
    )}&id=${encodeURIComponent(handbookId)}&section=${encodeURIComponent(sectionKey)}`;

    const { res, data } = await authedFetch(url);

    if (!res.ok || !data.ok) {
      pushAssistant(`Could not load section. ${data.error || res.status}`);
      return;
    }

    const hb = data.handbook || {};
    const sec = data.section || {};

    const title = sec.title ? `**${sec.title}**\n\n` : "";
    const content = sec.content || "";

    // keep it readable
    const text =
      `Handbook: ${hb.title || "Parent Handbook"}\n` +
      (hb.program ? `Program: ${hb.program}\n` : "") +
      `Campus: ${campus}\n` +
      `Section: ${sec.key || sectionKey}\n\n` +
      `${title}${content}`;

    closePanel();
    pushAssistant(text);
  }

  // =====================
  // Main open function
  // =====================
  async function openHandbookMenu() {
    const check = ensureBasicsOrWarn();
    if (!check.ok) return;

    openPanel("Parent Handbook");

    panelBody.innerHTML = `
      <div class="muted" style="font-weight:800;margin-bottom:10px">
        Loading handbooks…
      </div>
    `;

    const url = `${ENDPOINT}?campus=${encodeURIComponent(check.campus)}`;
    const { res, data } = await authedFetch(url);

    if (!res.ok || !data.ok) {
      panelBody.innerHTML = `
        <div class="muted" style="color:#b91c1c;font-weight:800">
          Failed to load handbooks. ${esc(data.error || res.status)}
        </div>
        <div class="muted" style="margin-top:10px">
          ✅ Check Worker route: <b>/handbooks</b> needs token.<br/>
          ✅ Check Pages proxy (functions/handbooks.js) if you use it.<br/>
          ✅ Check KV key: <b>handbook_${esc(check.campus)}</b>
        </div>
      `;
      return;
    }

    renderHandbookList(check.campus, data.handbooks || []);
  }

  // =====================
  // Events
  // =====================
  handbookBtn?.addEventListener("click", openHandbookMenu);
  overlay?.addEventListener("click", closePanel);
  closeBtn?.addEventListener("click", closePanel);

  // allow ESC to close
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });

  // Expose for app.js if needed
  window.openHandbookMenu = openHandbookMenu;
})();