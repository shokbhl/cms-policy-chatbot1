// ===== helpers =====
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function normalizeText(s){
  return String(s || "").toLowerCase().trim();
}

function snippet(text, max = 220){
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "…";
}

// ===== RENDER: Modern Handbook Menu =====
// mountEl = menu-panel-body
function renderParentHandbookModern({
  mountEl,
  campus,
  handbooks,
  selectedId,
  onSelectHandbook,
  onOpenSectionPreview, // (hb, section)=>{}  preview inside panel
  onSendToChat          // (hb, section)=>{}  optional: send content into chat
}) {
  if (!mountEl) return;

  const hbArr = Array.isArray(handbooks) ? handbooks : [];
  if (!hbArr.length) {
    mountEl.innerHTML = `<div class="muted">No handbook found for campus ${escapeHtml(campus || "—")}.</div>`;
    return;
  }

  // If no selected, pick first
  if (!selectedId) selectedId = hbArr[0].id;

  const selectedHb = hbArr.find(h => h.id === selectedId) || hbArr[0];

  mountEl.innerHTML = `
    <div class="hb-shell">
      <div class="hb-top">
        <div class="hb-top-left">
          <div class="hb-title-row">
            <div class="hb-title-big">Parent Handbook</div>
            <div class="hb-campus-chip">${escapeHtml(campus || "—")}</div>
          </div>
          <div class="hb-sub">Choose a handbook, then open a section</div>

          <div class="hb-meta-row">
            ${selectedHb.link ? `<a class="hb-link" href="${escapeHtml(selectedHb.link)}" target="_blank" rel="noopener">Open full document ↗</a>` : ``}
            <span class="chip">${escapeHtml(selectedHb.program || "—")}</span>
          </div>
        </div>

        <div class="hb-actions">
          <input class="hb-search" id="hbSearch"
                 placeholder="Search in section title or content…" />
        </div>
      </div>

      <div class="hb-grid" id="hbCards"></div>

      <div class="hb-sections" id="hbSections"></div>

      <div class="hb-preview hidden" id="hbPreview">
        <div class="hb-preview-title" id="hbPreviewTitle">—</div>
        <div class="hb-preview-text" id="hbPreviewText">—</div>
        <div class="hb-preview-actions">
          <button class="hb-copy-btn" type="button" id="hbCopyBtn">Copy</button>
          <button class="hb-open-sec" type="button" id="hbSendToChatBtn">Send to chat</button>
        </div>
      </div>
    </div>
  `;

  const cardsEl = mountEl.querySelector("#hbCards");
  const sectionsEl = mountEl.querySelector("#hbSections");
  const searchEl = mountEl.querySelector("#hbSearch");

  const previewBox = mountEl.querySelector("#hbPreview");
  const previewTitle = mountEl.querySelector("#hbPreviewTitle");
  const previewText = mountEl.querySelector("#hbPreviewText");
  const copyBtn = mountEl.querySelector("#hbCopyBtn");
  const sendBtn = mountEl.querySelector("#hbSendToChatBtn");

  let previewState = { hb: null, sec: null };

  function renderCards() {
    cardsEl.innerHTML = hbArr.map(h => `
      <div class="hb-item ${h.id === selectedId ? "active" : ""}" data-hb="${escapeHtml(h.id)}">
        <div class="hb-item-title">${escapeHtml(h.program || "Program")}</div>
        <div class="hb-item-meta">${escapeHtml(h.title || h.id)}</div>
      </div>
    `).join("");

    cardsEl.querySelectorAll(".hb-item").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-hb");
        onSelectHandbook?.(id);
      });
    });
  }

  function openPreview(hb, sec){
    previewState = { hb, sec };
    previewTitle.textContent = `${sec.title || sec.key} (${hb.program || hb.id})`;
    previewText.textContent = sec.content || "—";
    previewBox.classList.remove("hidden");
    onOpenSectionPreview?.(hb, sec);
  }

  function renderSections() {
    sectionsEl.innerHTML = "";

    const hb = hbArr.find(h => h.id === selectedId) || hbArr[0];
    const q = normalizeText(searchEl.value);

    const sections = Array.isArray(hb.sections) ? hb.sections : [];

    const filtered = sections.filter(sec => {
      const t = normalizeText(sec.title);
      const k = normalizeText(sec.key);
      const c = normalizeText(sec.content);
      return !q || t.includes(q) || k.includes(q) || c.includes(q);
    });

    if (!filtered.length) {
      sectionsEl.innerHTML = `<div class="muted">No sections match your search.</div>`;
      return;
    }

    // Simple groups (optional): you can later add sec.group in JSON
    const groups = {};
    filtered.forEach(sec => {
      const g = sec.group || "Sections";
      (groups[g] ||= []).push(sec);
    });

    Object.keys(groups).forEach(groupName => {
      const details = document.createElement("details");
      details.className = "hb-acc";
      details.open = true;

      details.innerHTML = `
        <summary>
          <span class="hb-sec-left">
            <span class="hb-dot"></span>
            <span class="hb-sec-title">${escapeHtml(groupName)}</span>
          </span>
          <span class="hb-chevron">⌄</span>
        </summary>
        <div class="hb-acc-body"></div>
      `;

      const body = details.querySelector(".hb-acc-body");

      groups[groupName].forEach(sec => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "hb-open-sec";
        btn.textContent = sec.title || sec.key;

        btn.addEventListener("click", () => openPreview(hb, sec));
        body.appendChild(btn);
      });

      sectionsEl.appendChild(details);
    });

    // Auto-preview first result (optional)
    if (!previewState.sec) {
      openPreview(hb, filtered[0]);
    }
  }

  // Buttons
  copyBtn.addEventListener("click", async () => {
    const text = previewState?.sec?.content || "";
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied ✓";
      setTimeout(() => (copyBtn.textContent = "Copy"), 900);
    } catch {
      alert("Copy failed. Please copy manually.");
    }
  });

  sendBtn.addEventListener("click", () => {
    const hb = previewState.hb;
    const sec = previewState.sec;
    if (!hb || !sec) return;
    onSendToChat?.(hb, sec);
  });

  // Search
  searchEl.addEventListener("input", () => {
    previewState = { hb: null, sec: null };
    previewBox.classList.add("hidden");
    renderSections();
  });

  // Initial render
  renderCards();
  renderSections();
}