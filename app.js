/* app.js (SAFE + NO-LOCK)
   - Works with /api and /auth/* through Pages proxy
   - Robust policy/protocol section rendering (no crashes)
   - If sections missing => auto Overview
   - Ask this section in chat button
*/

(() => {
  const API_URL = "/api";

  // ===== DOM helpers
  const $ = (sel) => document.querySelector(sel);
  const el = {
    programSelect: $("#programSelect"),
    campusSelect: $("#campusSelect"),

    policyList: $("#policyList"),
    protocolList: $("#protocolList"),

    docTitle: $("#docTitle"),
    docBreadcrumb: $("#docBreadcrumb"),
    sectionsBar: $("#sectionsBar"),
    sectionTitle: $("#sectionTitle"),
    sectionContent: $("#sectionContent"),

    openFullDoc: $("#openFullDoc"),
    backBtn: $("#backBtn"),

    chatMessages: $("#chatMessages"),
    chatInput: $("#chatInput"),
    chatSend: $("#chatSend"),
  };

  // ===== State
  const state = {
    mode: "policies", // policies | protocols
    program: (el.programSelect?.value || "Preschool"),
    campus: (el.campusSelect?.value || "MC"),
    currentDoc: null, // { type, id, title, url, sections: [...] }
    currentSectionPath: [], // [sectionId, subId, ...]
    busy: false,
  };

  // ===== Network
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });

    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { ok: false, raw: text }; }
    data._status = res.status;
    data._ok = res.ok;
    return data;
  }

  function setBusy(b) {
    state.busy = b;
    if (el.chatSend) el.chatSend.disabled = b;
    if (el.chatInput) el.chatInput.disabled = b;
  }

  // ===== Normalizers (THIS is what prevents “lock”)
  function normalizeDoc(raw, type) {
    // raw could be {title,url,sections} or KV-style objects
    const title = raw?.title || raw?.name || raw?.policyTitle || raw?.protocolTitle || "Untitled";
    const url = raw?.url || raw?.link || raw?.docUrl || "";

    let sections = raw?.sections;

    // sections might be object map => convert
    if (sections && !Array.isArray(sections) && typeof sections === "object") {
      sections = Object.entries(sections).map(([k, v]) => ({
        id: v?.id || k,
        title: v?.title || k,
        content: v?.content || v?.text || "",
        subsections: v?.subsections || [],
      }));
    }

    // If sections missing, build Overview from content/text/body
    if (!Array.isArray(sections) || sections.length === 0) {
      const content =
        raw?.content ||
        raw?.text ||
        raw?.body ||
        raw?.html ||
        "";
      sections = [{
        id: "overview",
        title: "Overview",
        content: content,
        subsections: [],
      }];
    }

    // normalize each section/subsection
    sections = sections.map((s, idx) => normalizeSection(s, idx));

    return {
      type,
      id: raw?.id || raw?.slug || raw?.key || title,
      title,
      url,
      sections,
      _raw: raw,
    };
  }

  function normalizeSection(s, idx) {
    const sec = {
      id: (s?.id || s?.slug || `sec_${idx}`).toString(),
      title: (s?.title || s?.name || `Section ${idx + 1}`).toString(),
      content: (s?.content || s?.text || s?.body || "").toString(),
      subsections: [],
    };

    let subs = s?.subsections || s?.children || [];
    if (subs && !Array.isArray(subs) && typeof subs === "object") {
      subs = Object.entries(subs).map(([k, v]) => ({
        id: v?.id || k,
        title: v?.title || k,
        content: v?.content || v?.text || "",
        subsections: v?.subsections || [],
      }));
    }
    if (Array.isArray(subs)) {
      sec.subsections = subs.map((x, j) => normalizeSection(x, j));
    }
    return sec;
  }

  // ===== Render list
  function renderList(type, items) {
    const host = (type === "policies") ? el.policyList : el.protocolList;
    if (!host) return;

    host.innerHTML = "";
    items.forEach((raw) => {
      const doc = normalizeDoc(raw, type);
      const btn = document.createElement("button");
      btn.className = "docRow";
      btn.type = "button";
      btn.innerHTML = `
        <div class="docRowTitle">${escapeHtml(doc.title)}</div>
        <div class="docRowMeta">${doc.sections?.length || 0} sections</div>
      `;
      btn.addEventListener("click", () => {
        openDoc(doc);
      });
      host.appendChild(btn);
    });
  }

  // ===== Render doc + sections
  function openDoc(doc) {
    state.currentDoc = doc;
    state.currentSectionPath = []; // reset
    safeRenderDoc();
  }

  function safeRenderDoc() {
    try {
      renderDoc();
    } catch (e) {
      console.error("renderDoc crashed:", e);
      // prevent lock
      if (el.sectionTitle) el.sectionTitle.textContent = "Error";
      if (el.sectionContent) el.sectionContent.textContent = "This document could not be displayed (data format issue).";
      if (el.sectionsBar) el.sectionsBar.innerHTML = "";
    }
  }

  function renderDoc() {
    const doc = state.currentDoc;
    if (!doc) return;

    if (el.docTitle) el.docTitle.textContent = doc.title;
    if (el.docBreadcrumb) el.docBreadcrumb.textContent = `${capitalize(doc.type)} • ${doc.title}`;

    if (el.openFullDoc) {
      el.openFullDoc.style.display = doc.url ? "inline-flex" : "none";
      el.openFullDoc.onclick = () => { if (doc.url) window.open(doc.url, "_blank"); };
    }

    if (el.backBtn) {
      el.backBtn.onclick = () => {
        state.currentDoc = null;
        state.currentSectionPath = [];
        clearDocView();
      };
    }

    renderSectionsBar();
    // auto open first section
    if (!state.currentSectionPath.length) {
      const first = doc.sections?.[0];
      if (first) state.currentSectionPath = [first.id];
    }
    renderSectionContent();
  }

  function clearDocView() {
    if (el.docTitle) el.docTitle.textContent = "";
    if (el.docBreadcrumb) el.docBreadcrumb.textContent = "";
    if (el.sectionsBar) el.sectionsBar.innerHTML = "";
    if (el.sectionTitle) el.sectionTitle.textContent = "";
    if (el.sectionContent) el.sectionContent.innerHTML = "";
  }

  function renderSectionsBar() {
    const doc = state.currentDoc;
    if (!doc || !el.sectionsBar) return;

    el.sectionsBar.innerHTML = "";

    // If only 1 section, still show it (like handbook)
    doc.sections.forEach((sec) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "pill";
      pill.textContent = sec.title;
      pill.addEventListener("click", () => {
        state.currentSectionPath = [sec.id];
        renderSectionContent();
        renderSectionsBar(); // update active state
      });

      if (state.currentSectionPath[0] === sec.id) pill.classList.add("active");
      el.sectionsBar.appendChild(pill);
    });

    // If selected section has subsections => render second row under pills
    const selected = findSectionByPath(doc, state.currentSectionPath);
    if (selected?.subsections?.length) {
      const row = document.createElement("div");
      row.className = "subPillsRow";

      selected.subsections.forEach((sub) => {
        const sp = document.createElement("button");
        sp.type = "button";
        sp.className = "pill sub";
        sp.textContent = sub.title;
        sp.addEventListener("click", () => {
          state.currentSectionPath = [selected.id, sub.id];
          renderSectionContent();
          renderSectionsBar();
        });
        if (state.currentSectionPath[1] === sub.id) sp.classList.add("active");
        row.appendChild(sp);
      });

      el.sectionsBar.appendChild(row);
    }
  }

  function renderSectionContent() {
    const doc = state.currentDoc;
    if (!doc) return;

    const sec = findSectionByPath(doc, state.currentSectionPath);
    if (!sec) {
      if (el.sectionTitle) el.sectionTitle.textContent = "Not found";
      if (el.sectionContent) el.sectionContent.textContent = "Section not found";
      return;
    }

    if (el.sectionTitle) el.sectionTitle.textContent = sec.title;

    const content = (sec.content || "").trim();
    const safe = content ? content : "No content yet.";

    if (el.sectionContent) {
      el.sectionContent.innerHTML = `
        <div class="sectionCard">
          <div class="sectionBody">${escapeHtml(safe).replace(/\n/g, "<br>")}</div>
          <div class="sectionActions">
            <button type="button" class="btnPrimary" id="askThisSectionBtn">Ask this section in chat</button>
          </div>
        </div>
      `;
      const btn = $("#askThisSectionBtn");
      if (btn) {
        btn.onclick = () => askSectionInChat(doc, sec);
      }
    }
  }

  function findSectionByPath(doc, path) {
    if (!doc || !Array.isArray(path) || !path.length) return null;
    const top = doc.sections.find((x) => x.id === path[0]);
    if (!top) return null;
    if (path.length === 1) return top;
    const sub = top.subsections?.find((x) => x.id === path[1]);
    return sub || top;
  }

  // ===== Chat
  async function askSectionInChat(doc, sec) {
    const text = (sec?.content || "").trim();
    const prompt = text
      ? `Using ONLY this section, answer my question. SECTION: ${doc.title} → ${sec.title}\n\n${text}`
      : `This section has no content. Tell me what to do to fix the policy data for: ${doc.title} → ${sec.title}`;

    pushMsg("user", `Ask about: ${doc.title} → ${sec.title}`);
    setBusy(true);
    try {
      const r = await postJSON(API_URL, {
        // Keep your old API stable: backend can ignore extra fields
        op: "chat",
        question: prompt,
        context_type: doc.type,
        context_title: doc.title,
        context_section: sec.title,
        campus: state.campus,
        program: state.program,
      });

      // If your worker returns multiple answers, show them as multiple cards
      // Expected patterns:
      // - r.answer (string)
      // - r.answers (array of {title,text,source})
      if (Array.isArray(r.answers) && r.answers.length) {
        r.answers.forEach((a, i) => {
          pushMsg("assistant", formatAnswerCard(a, i + 1));
        });
      } else {
        const ans = r.answer || r.text || r.message || (r.ok ? "Done." : (r.error || "Error"));
        pushMsg("assistant", ans);
      }
    } catch (e) {
      pushMsg("assistant", `Error: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  function pushMsg(role, text) {
    if (!el.chatMessages) return;
    const row = document.createElement("div");
    row.className = "msg " + role;
    row.textContent = text;
    el.chatMessages.appendChild(row);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
  }

  function formatAnswerCard(a, idx) {
    const t = a?.title ? `${a.title}\n` : `Answer ${idx}\n`;
    const s = a?.source ? `\nSource: ${a.source}` : "";
    return `${t}${a?.text || a?.answer || ""}${s}`.trim();
  }

  // ===== Init list loading (does NOT change your backend; just tries common shapes)
  async function loadLists() {
    // NOTE: these requests must match your worker.
    // If your worker already returns lists inside a different op, it will still work if it returns policies/protocols arrays.
    setBusy(true);
    try {
      const r = await postJSON(API_URL, {
        op: "list",
        campus: state.campus,
        program: state.program,
      });

      const policies = r.policies || r.policy_list || [];
      const protocols = r.protocols || r.protocol_list || [];
      if (Array.isArray(policies)) renderList("policies", policies);
      if (Array.isArray(protocols)) renderList("protocols", protocols);
    } finally {
      setBusy(false);
    }
  }

  // ===== Events
  if (el.programSelect) {
    el.programSelect.addEventListener("change", () => {
      state.program = el.programSelect.value;
      loadLists();
    });
  }
  if (el.campusSelect) {
    el.campusSelect.addEventListener("change", () => {
      state.campus = el.campusSelect.value;
      loadLists();
    });
  }

  if (el.chatSend && el.chatInput) {
    el.chatSend.addEventListener("click", async () => {
      const q = (el.chatInput.value || "").trim();
      if (!q) return;
      el.chatInput.value = "";
      pushMsg("user", q);

      setBusy(true);
      try {
        const r = await postJSON(API_URL, {
          op: "chat",
          question: q,
          campus: state.campus,
          program: state.program,
        });

        if (Array.isArray(r.answers) && r.answers.length) {
          r.answers.forEach((a, i) => pushMsg("assistant", formatAnswerCard(a, i + 1)));
        } else {
          pushMsg("assistant", r.answer || r.text || r.message || (r.ok ? "Done." : (r.error || "Error")));
        }
      } catch (e) {
        pushMsg("assistant", `Error: ${String(e?.message || e)}`);
      } finally {
        setBusy(false);
      }
    });
  }

  // ===== utils
  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function capitalize(s) { return (s || "").charAt(0).toUpperCase() + (s || "").slice(1); }

  // Boot
  loadLists();
})();