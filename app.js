const state = {
  data: null,
  selected: null,
  search: "",
  view: "all",
  onlyActionable: false,
  showIgnored: false,
  autoReload: localStorage.getItem("hiro-pr-tracker-auto-reload") !== "false",
  loading: false,
  autoReloadTimer: null,
  viewer: localStorage.getItem("hiro-pr-tracker-viewer") || "Alex",
  ignored: new Set(),
  ignoreMeta: new Map(),
};

const supabase = {
  url: "https://aihworyfcgstwbpzkzoy.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpaHdvcnlmY2dzdHdicHprem95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMjE0NzEsImV4cCI6MjA4NjY5NzQ3MX0.NrYtMgZ3D5VL-ES6iGXrmg-WEb-fRgU4AHKnLuhcTlE",
};

const els = {
  summary: document.querySelector("#summary"),
  list: document.querySelector("#pr-list"),
  detail: document.querySelector("#detail"),
  search: document.querySelector("#search"),
  view: document.querySelector("#view-filter"),
  viewer: document.querySelector("#viewer"),
  actionable: document.querySelector("#only-actionable"),
  showIgnored: document.querySelector("#show-ignored"),
  autoReload: document.querySelector("#auto-reload"),
  reload: document.querySelector("#refresh-data"),
  reloadStatus: document.querySelector("#reload-status"),
  loginForm: document.querySelector("#login-form"),
  password: document.querySelector("#password"),
  loginError: document.querySelector("#login-error"),
};

const fmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function text(value) {
  return value == null || value === "" ? "" : String(value);
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return fmt.format(date);
}

function setReloading(loading) {
  state.loading = loading;
  els.reload.disabled = loading;
  els.reload.textContent = loading ? "Loading..." : "Reload";
}

function setReloadStatus(message) {
  if (els.reloadStatus) els.reloadStatus.textContent = message;
}

function flashUpdated() {
  document.body.classList.remove("data-flash");
  window.requestAnimationFrame(() => {
    document.body.classList.add("data-flash");
    window.setTimeout(() => document.body.classList.remove("data-flash"), 900);
  });
}

function copyButton(payload) {
  return `<button class="copy-button" type="button" data-copy="${escapeHtml(payload)}">Copy</button>`;
}

function itemKey(type, value) {
  return `${type}:${value}`;
}

function failureKey(pr, failure) {
  return itemKey("failure", `${pr.number}:${failure.id || failure.name}:${failure.url || failure.detailsUrl || ""}`);
}

function isIgnored(key) {
  return state.ignored.has(key);
}

function activeComments(pr) {
  return pr.comments.filter((comment) => !isIgnored(itemKey("comment", comment.id)));
}

function activeFailures(pr) {
  return pr.failures.filter((failure) => !isIgnored(failureKey(pr, failure)));
}

function visibleItems(items, keyFn) {
  return state.showIgnored ? items : items.filter((item) => !isIgnored(keyFn(item)));
}

function prIsIgnored(pr) {
  return isIgnored(itemKey("pr", pr.number));
}

function activeCommentCount(pr) {
  return activeComments(pr).length;
}

function activeFailureCount(pr) {
  return activeFailures(pr).length;
}

function statusChip(ok, okLabel, badLabel) {
  const symbol = ok ? "&#10003;" : "X";
  const tone = ok ? "green" : "red";
  return `<span class="chip ${tone}">${symbol} ${escapeHtml(ok ? okLabel : badLabel)}</span>`;
}

function combinedCopy(pr) {
  const coderabbitComments = visibleItems(pr.coderabbitComments, (comment) => itemKey("comment", comment.id));
  const nonCoderabbitComments = visibleItems(pr.nonCoderabbitComments, (comment) => itemKey("comment", comment.id));
  const failures = visibleItems(pr.failures, (failure) => failureKey(pr, failure));
  const parts = [];
  if (coderabbitComments.length) {
    parts.push(`# PR #${pr.number} CodeRabbit comments`);
    parts.push(...coderabbitComments.map(commentCopyText));
  }
  if (nonCoderabbitComments.length) {
    parts.push(`# PR #${pr.number} non-CodeRabbit comments`);
    parts.push(...nonCoderabbitComments.map(commentCopyText));
  }
  if (failures.length) {
    parts.push(`# PR #${pr.number} failures`);
    parts.push(...failures.map(failureCopyText));
  }
  return parts.join("\n\n---\n\n");
}

function commentCopyText(comment) {
  return [
    `${comment.type} comment by ${comment.author}${comment.location ? ` on ${comment.location}` : ""}`,
    comment.url,
    "",
    comment.body,
  ].join("\n").trim();
}

function failureCopyText(failure) {
  return [
    `${failure.name} - ${failure.conclusion || failure.state || failure.status}`,
    failure.url,
    failure.description || "",
    failure.log || "",
  ].filter(Boolean).join("\n\n");
}

function matchesPr(pr) {
  if (!state.showIgnored && prIsIgnored(pr)) return false;
  if (state.onlyActionable && !activeCommentCount(pr) && !activeFailureCount(pr)) return false;
  if (!state.search) return true;
  const haystack = [
    pr.number,
    pr.title,
    pr.head,
    pr.base,
    ...pr.comments.flatMap((comment) => [comment.author, comment.source, comment.path, comment.body]),
    ...pr.failures.flatMap((failure) => [failure.name, failure.conclusion, failure.state, failure.description, failure.log]),
  ].join("\n").toLowerCase();
  return haystack.includes(state.search.toLowerCase());
}

function visibleComments(pr) {
  if (state.view === "coderabbit") return visibleItems(pr.coderabbitComments, (comment) => itemKey("comment", comment.id));
  if (state.view === "non-coderabbit") return visibleItems(pr.nonCoderabbitComments, (comment) => itemKey("comment", comment.id));
  if (state.view === "failures") return [];
  return visibleItems(pr.comments, (comment) => itemKey("comment", comment.id));
}

function renderSummary(prs) {
  const totals = {
    prs: prs.filter((pr) => state.showIgnored || !prIsIgnored(pr)).length,
    comments: prs.reduce((sum, pr) => sum + activeCommentCount(pr), 0),
    coderabbit: prs.reduce((sum, pr) => sum + pr.coderabbitComments.filter((comment) => !isIgnored(itemKey("comment", comment.id))).length, 0),
    failures: prs.reduce((sum, pr) => sum + activeFailureCount(pr), 0),
    drafts: prs.filter((pr) => pr.draft && (state.showIgnored || !prIsIgnored(pr))).length,
    ignored: state.ignored.size,
  };
  els.summary.innerHTML = [
    metric(totals.prs, "Open authored PRs"),
    metric(totals.drafts, "Draft PRs"),
    metric(totals.comments, "Current comments"),
    metric(totals.coderabbit, "CodeRabbit comments"),
    metric(totals.failures, "Failing checks/statuses"),
    metric(totals.ignored, "Ignored items"),
  ].join("");
}

function metric(value, label) {
  return `<div class="metric"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderList(prs) {
  if (!prs.length) {
    els.list.innerHTML = `<div class="empty">No matching PRs.</div>`;
    return;
  }
  if (!state.selected || !prs.some((pr) => pr.number === state.selected)) state.selected = prs[0].number;
  els.list.innerHTML = prs.map((pr) => {
    const active = pr.number === state.selected ? " active" : "";
    const ignored = prIsIgnored(pr) ? " ignored" : "";
    const comments = activeCommentCount(pr);
    const failures = activeFailureCount(pr);
    const ignoredCount = pr.comments.filter((comment) => isIgnored(itemKey("comment", comment.id))).length
      + pr.failures.filter((failure) => isIgnored(failureKey(pr, failure))).length
      + (prIsIgnored(pr) ? 1 : 0);
    const unresolvedChip = statusChip(comments === 0, "no unresolved", "unresolved");
    const presubmitChip = statusChip(failures === 0, "no presubmit", "presubmit");
    const draftChip = pr.draft ? `<span class="chip amber">Draft</span>` : "";
    const failureChip = failures ? `<span class="chip red">${failures} fail</span>` : "";
    const ignoredChip = ignoredCount ? `<span class="chip muted">${ignoredCount} ignored</span>` : "";
    return `
      <button class="pr-card${active}${ignored}" type="button" data-pr="${pr.number}">
        <h2>${escapeHtml(pr.head)}</h2>
        <div class="chips">
          <span class="chip blue">${comments} comments</span>
          ${unresolvedChip}
          ${presubmitChip}
          ${draftChip}
          ${failureChip}
          ${ignoredChip}
          <span class="chip">#${pr.number}</span>
        </div>
      </button>
    `;
  }).join("");
}

function renderDetail(prs) {
  const pr = prs.find((item) => item.number === state.selected);
  if (!pr) {
    els.detail.innerHTML = `<div class="empty">Pick a PR.</div>`;
    return;
  }
  const comments = visibleComments(pr);
  const showFailures = state.view === "all" || state.view === "failures";
  const prIgnored = prIsIgnored(pr);
  els.detail.innerHTML = `
    <div class="detail-head">
      <div class="detail-title">
        <h2>#${pr.number} ${escapeHtml(pr.title)}${pr.draft ? ` <span class="chip amber">Draft</span>` : ""}</h2>
        <div class="pr-meta">${escapeHtml(pr.head)} -> ${escapeHtml(pr.base)} - ${escapeHtml(pr.headSha.slice(0, 7))} - <a href="${escapeHtml(pr.url)}" target="_blank" rel="noreferrer">Open GitHub PR</a></div>
      </div>
      <div class="detail-actions">
        <button class="ignore-button${prIgnored ? " ignored" : ""}" type="button" data-ignore-type="pr" data-ignore-key="${escapeHtml(itemKey("pr", pr.number))}" data-pr-number="${pr.number}">${prIgnored ? "Unignore PR" : "Ignore PR"}</button>
        ${copyButton(combinedCopy(pr))}
      </div>
    </div>
    ${showFailures ? renderFailures(pr, visibleItems(pr.failures, (failure) => failureKey(pr, failure))) : ""}
    ${renderComments("CodeRabbit", comments.filter((comment) => comment.source === "CodeRabbit"))}
    ${renderComments("Other comments", comments.filter((comment) => comment.source !== "CodeRabbit"))}
  `;
}

function renderIgnoreButton(type, key, prNumber) {
  const ignored = isIgnored(key);
  const meta = state.ignoreMeta.get(key);
  const label = ignored ? "Unignore" : "Ignore";
  const title = ignored && meta ? `Ignored by ${meta.ignored_by || "unknown"}` : "Ignore";
  return `<button class="ignore-button${ignored ? " ignored" : ""}" type="button" title="${escapeHtml(title)}" data-ignore-type="${escapeHtml(type)}" data-ignore-key="${escapeHtml(key)}" data-pr-number="${prNumber}">${label}</button>`;
}

function renderFailures(pr, failures) {
  const body = failures.length
    ? failures.map((failure) => `
      <div class="failure${isIgnored(failureKey(pr, failure)) ? " ignored" : ""}">
        <div class="block-head">
          <div>
            <strong>${escapeHtml(failure.name)}</strong>
            <div class="block-meta">${escapeHtml(failure.conclusion || failure.state || failure.status || "")}${failure.app ? ` - ${escapeHtml(failure.app)}` : ""}</div>
          </div>
          <div class="block-actions">
            ${renderIgnoreButton("failure", failureKey(pr, failure), pr.number)}
            ${copyButton(failureCopyText(failure))}
          </div>
        </div>
        <pre>${escapeHtml(failure.log || failure.description || "No failed log available from GitHub CLI.")}</pre>
      </div>
    `).join("")
    : `<div class="empty">No current failures.</div>`;
  return `<section class="section"><h3>Presubmit and CI failures</h3>${body}</section>`;
}

function renderComments(title, comments) {
  const body = comments.length
    ? comments.map((comment) => `
      <div class="comment${isIgnored(itemKey("comment", comment.id)) ? " ignored" : ""}">
        <div class="block-head">
          <div>
            <strong>${escapeHtml(comment.author)} - ${escapeHtml(comment.type)}</strong>
            <div class="block-meta">${escapeHtml(comment.location || "Conversation")} - ${escapeHtml(formatDate(comment.updatedAt || comment.createdAt))}${comment.url ? ` - <a href="${escapeHtml(comment.url)}" target="_blank" rel="noreferrer">link</a>` : ""}</div>
          </div>
          <div class="block-actions">
            ${renderIgnoreButton("comment", itemKey("comment", comment.id), state.selected)}
            ${copyButton(commentCopyText(comment))}
          </div>
        </div>
        <pre>${escapeHtml(comment.body)}</pre>
      </div>
    `).join("")
    : `<div class="empty">No ${escapeHtml(title.toLowerCase())}.</div>`;
  return `<section class="section"><h3>${escapeHtml(title)}</h3>${body}</section>`;
}

function render() {
  const prs = state.data.prs.filter(matchesPr);
  renderSummary(state.data.prs);
  renderList(prs);
  renderDetail(prs);
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabase.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabase.anonKey,
      Authorization: `Bearer ${supabase.anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body}`);
  }
  return response;
}

async function loadIgnores() {
  const response = await supabaseRequest("hiro_pr_ignores?select=item_key,item_type,pr_number,ignored_by,created_at");
  const rows = await response.json();
  state.ignored = new Set(rows.map((row) => row.item_key));
  state.ignoreMeta = new Map(rows.map((row) => [row.item_key, row]));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function decryptData(payload, password) {
  const encodedPassword = new TextEncoder().encode(password);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encodedPassword,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(payload.salt),
      iterations: payload.iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const ciphertext = base64ToBytes(payload.ciphertext);
  const authTag = base64ToBytes(payload.authTag);
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv), tagLength: 128 },
    key,
    combined
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function setIgnored({ key, type, prNumber, ignored }) {
  if (ignored) {
    state.ignored.add(key);
    state.ignoreMeta.set(key, {
      item_key: key,
      item_type: type,
      pr_number: prNumber,
      ignored_by: state.viewer,
      created_at: new Date().toISOString(),
    });
    render();
    try {
      await supabaseRequest("hiro_pr_ignores", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          item_key: key,
          item_type: type,
          pr_number: prNumber,
          ignored_by: state.viewer,
        }),
      });
    } catch (error) {
      state.ignored.delete(key);
      state.ignoreMeta.delete(key);
      render();
      throw error;
    }
  } else {
    const previous = state.ignoreMeta.get(key);
    state.ignored.delete(key);
    state.ignoreMeta.delete(key);
    render();
    try {
      await supabaseRequest(`hiro_pr_ignores?item_key=eq.${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
    } catch (error) {
      state.ignored.add(key);
      if (previous) state.ignoreMeta.set(key, previous);
      render();
      throw error;
    }
  }
}

async function loadData(password, { flash = false } = {}) {
  if (state.loading) return;
  const previousSelected = state.selected;
  setReloading(true);
  try {
    const [response] = await Promise.all([
      fetch(`data/prs.enc.json?ts=${Date.now()}`),
      loadIgnores(),
    ]);
    if (!response.ok) throw new Error(`Could not load encrypted PR data: ${response.status}`);
    state.data = await decryptData(await response.json(), password);
    state.selected = state.data.prs.some((pr) => pr.number === previousSelected)
      ? previousSelected
      : state.data.prs[0]?.number || null;
    render();
    setReloadStatus(`Updated ${formatDate(state.data.generatedAt)}`);
    if (flash) flashUpdated();
  } finally {
    setReloading(false);
  }
}

async function unlock(password) {
  els.loginError.textContent = "";
  await loadData(password);
  sessionStorage.setItem("hiro-pr-tracker-password", password);
  document.body.classList.remove("locked");
  syncAutoReload();
}

function startAutoReload() {
  if (state.autoReloadTimer) window.clearInterval(state.autoReloadTimer);
  state.autoReloadTimer = window.setInterval(() => {
    const password = sessionStorage.getItem("hiro-pr-tracker-password");
    if (!password) return;
    loadData(password, { flash: true }).catch((error) => {
      setReloadStatus(`Reload failed: ${error.message}`);
      setReloading(false);
    });
  }, 60000);
}

function stopAutoReload() {
  if (!state.autoReloadTimer) return;
  window.clearInterval(state.autoReloadTimer);
  state.autoReloadTimer = null;
}

function syncAutoReload() {
  if (state.autoReload) {
    startAutoReload();
  } else {
    stopAutoReload();
  }
}

els.viewer.value = state.viewer;
els.autoReload.checked = state.autoReload;

els.search.addEventListener("input", (event) => {
  state.search = event.target.value.trim();
  render();
});

els.view.addEventListener("change", (event) => {
  state.view = event.target.value;
  render();
});

els.viewer.addEventListener("change", (event) => {
  state.viewer = event.target.value;
  localStorage.setItem("hiro-pr-tracker-viewer", state.viewer);
});

els.actionable.addEventListener("change", (event) => {
  state.onlyActionable = event.target.checked;
  render();
});

els.showIgnored.addEventListener("change", (event) => {
  state.showIgnored = event.target.checked;
  render();
});

els.autoReload.addEventListener("change", (event) => {
  state.autoReload = event.target.checked;
  localStorage.setItem("hiro-pr-tracker-auto-reload", String(state.autoReload));
  syncAutoReload();
});

els.reload.addEventListener("click", () => {
  const password = sessionStorage.getItem("hiro-pr-tracker-password") || els.password.value;
  if (!password) return;
  loadData(password, { flash: true }).catch((error) => {
    els.detail.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    setReloadStatus(`Reload failed: ${error.message}`);
    setReloading(false);
  });
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = els.loginForm.querySelector("button[type='submit']");
  submit.disabled = true;
  submit.textContent = "Unlocking...";
  try {
    await unlock(els.password.value);
  } catch (error) {
    sessionStorage.removeItem("hiro-pr-tracker-password");
    els.loginError.textContent = "Wrong password or data is unavailable.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Unlock";
  }
});

document.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-pr]");
  if (card) {
    state.selected = Number(card.dataset.pr);
    render();
    return;
  }
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    await navigator.clipboard.writeText(copy.dataset.copy);
    copy.classList.add("copied");
    copy.textContent = "Copied";
    window.setTimeout(() => {
      copy.classList.remove("copied");
      copy.textContent = "Copy";
    }, 1100);
    return;
  }
  const ignore = event.target.closest("[data-ignore-key]");
  if (ignore) {
    ignore.disabled = true;
    try {
      await setIgnored({
        key: ignore.dataset.ignoreKey,
        type: ignore.dataset.ignoreType,
        prNumber: Number(ignore.dataset.prNumber),
        ignored: !isIgnored(ignore.dataset.ignoreKey),
      });
    } catch (error) {
      window.alert(error.message);
    } finally {
      ignore.disabled = false;
    }
  }
});

const savedPassword = sessionStorage.getItem("hiro-pr-tracker-password");
if (savedPassword) {
  unlock(savedPassword).catch(() => sessionStorage.removeItem("hiro-pr-tracker-password"));
}
