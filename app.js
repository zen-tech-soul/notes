import { auth, db, nowTs } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/**
 * TopicsLog (Dark) — GitHub Pages + Firebase (notes-zen)
 * - UI uses UserID + Password (no email/phone shown)
 * - Internally uses Firebase Auth Email/Password with alias: <userId>@topicslog.local
 * - Firestore: topics + rows
 * - Share by User ID (uses /userIndex/<userIdLower>)
 */

// ------------------ Helpers ------------------
const $ = (id) => document.getElementById(id);

function toast(el, msg, ok = false) {
  if (!el) return;
  el.style.color = ok ? "var(--ok)" : "var(--danger)";
  el.textContent = msg || "";
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function userIdToEmail(userId) {
  return `${userId.trim().toLowerCase()}@topicslog.local`;
}

function isoDateLocal(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html || "");
  return div.textContent || "";
}

function formatTs(ts) {
  if (!ts) return "—";
  try { return ts.toDate().toLocaleString(); } catch { return "—"; }
}

function toCSV(rows, headers) {
  const q = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [];
  lines.push(headers.map(q).join(","));
  for (const r of rows) lines.push(headers.map(h => q(r[h])).join(","));
  return lines.join("\n");
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ------------------ DOM ------------------
const authView = $("authView");
const appView = $("appView");

const userIdEl = $("userId");
const passEl = $("password");
const loginBtn = $("loginBtn");
const signupBtn = $("signupBtn");
const authMsg = $("authMsg");
const netBadge = $("netBadge");

const welcomeText = $("welcomeText");
const whoText = $("whoText");
const syncPill = $("syncPill");
const logoutBtn = $("logoutBtn");

const topicsPage = $("topicsPage");
const topicPage = $("topicPage");

const newTopicBtn = $("newTopicBtn");
const topicSearch = $("topicSearch");
const topicFilter = $("topicFilter");
const topicsList = $("topicsList");
const topicsMsg = $("topicsMsg");

const topicTitle = $("topicTitle");
const topicSub = $("topicSub");
const backBtn = $("backBtn");
const shareBtn = $("shareBtn");
const exportBtn = $("exportBtn");

const addRowBtn = $("addRowBtn");
const rowSearch = $("rowSearch");
const sortSelect = $("sortSelect");
const viewToggleBtn = $("viewToggleBtn");
const rowsBox = $("rowsBox");
const rowsMsg = $("rowsMsg");

const modalHost = $("modalHost");
const modalTitle = $("modalTitle");
const modalBody = $("modalBody");
const modalCloseBtn = $("modalCloseBtn");

// ------------------ Modal ------------------
function openModal(title, bodyEl) {
  modalTitle.textContent = title;
  modalBody.innerHTML = "";
  modalBody.appendChild(bodyEl);
  modalHost.classList.remove("hidden");
  modalHost.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modalHost.classList.add("hidden");
  modalHost.setAttribute("aria-hidden", "true");
  modalBody.innerHTML = "";
}

modalCloseBtn?.addEventListener("click", closeModal);
modalHost?.addEventListener("click", (e) => { if (e.target === modalHost) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modalHost.classList.contains("hidden")) closeModal(); });

// ------------------ Network badge ------------------
function updateOnlineUI() {
  const online = navigator.onLine;
  if (!netBadge) return;
  netBadge.textContent = online ? "Online" : "Offline";
  netBadge.style.color = online ? "var(--ok)" : "var(--warn)";
}
window.addEventListener("online", updateOnlineUI);
window.addEventListener("offline", updateOnlineUI);
updateOnlineUI();

// ------------------ State ------------------
const state = {
  user: null,
  userId: "",
  topics: [],
  currentTopic: null,
  rows: [],
  view: "table",
  unsubTopics: null,
  unsubRows: null
};

// ------------------ Firestore refs ------------------
const topicsCol = () => collection(db, "topics");
const topicDoc = (id) => doc(db, "topics", id);
const rowsCol = (topicId) => collection(db, "topics", topicId, "rows");
const userDoc = (uid) => doc(db, "users", uid);
const userIndexDoc = (userIdLower) => doc(db, "userIndex", userIdLower);

// ------------------ Auth actions ------------------
loginBtn?.addEventListener("click", async () => {
  toast(authMsg, "");
  const uid = (userIdEl?.value || "").trim();
  if (!uid) return toast(authMsg, "Enter User ID.");
  try {
    await signInWithEmailAndPassword(auth, userIdToEmail(uid), passEl.value);
  } catch (e) {
    toast(authMsg, e.message);
  }
});

signupBtn?.addEventListener("click", async () => {
  toast(authMsg, "");
  const uid = (userIdEl?.value || "").trim();
  if (!uid) return toast(authMsg, "Enter User ID.");
  if (!passEl?.value) return toast(authMsg, "Enter Password.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, userIdToEmail(uid), passEl.value);
    await setDoc(userDoc(cred.user.uid), { userId: uid, createdAt: nowTs(), updatedAt: nowTs() }, { merge: true });
    await setDoc(userIndexDoc(uid.toLowerCase()), { uid: cred.user.uid, userId: uid, createdAt: nowTs() });
    toast(authMsg, "Account created. Now login.", true);
  } catch (e) {
    if ((e.message || "").includes("email-already-in-use")) toast(authMsg, "This User ID is already taken.");
    else toast(authMsg, e.message);
  }
});

logoutBtn?.addEventListener("click", () => signOut(auth));

// ------------------ Auth state ------------------
onAuthStateChanged(auth, async (user) => {
  state.user = user || null;

  if (!user) {
    authView?.classList.remove("hidden");
    appView?.classList.add("hidden");
    cleanupListeners();
    return;
  }

  authView?.classList.add("hidden");
  appView?.classList.remove("hidden");

  // Load userId from users/{uid}
  const snap = await getDoc(userDoc(user.uid));
  state.userId = snap.exists() ? (snap.data().userId || "") : "";

  if (welcomeText) welcomeText.textContent = "WELCOME";
  if (whoText) whoText.textContent = state.userId ? `User ID: ${state.userId}` : (user.email || "");

  // Ensure user doc exists
  await setDoc(userDoc(user.uid), { userId: state.userId || "", updatedAt: nowTs() }, { merge: true });

  showTopics();
  startTopicsListener();
});

function cleanupListeners() {
  if (state.unsubTopics) state.unsubTopics();
  if (state.unsubRows) state.unsubRows();
  state.unsubTopics = null;
  state.unsubRows = null;
  state.topics = [];
  state.currentTopic = null;
  state.rows = [];
  if (topicsList) topicsList.innerHTML = "";
  if (rowsBox) rowsBox.innerHTML = "";
}

// ------------------ Navigation ------------------
function showTopics() {
  topicsPage?.classList.remove("hidden");
  topicPage?.classList.add("hidden");
}

function showTopic() {
  topicsPage?.classList.add("hidden");
  topicPage?.classList.remove("hidden");
}

// ------------------ Topics ------------------
topicSearch?.addEventListener("input", renderTopics);
topicFilter?.addEventListener("change", renderTopics);
newTopicBtn?.addEventListener("click", openCreateTopicModal);

function startTopicsListener() {
  if (state.unsubTopics) state.unsubTopics();

  if (syncPill) syncPill.textContent = "Syncing…";

  const qTopics = query(
    topicsCol(),
    where("allowedUids", "array-contains", state.user.uid),
    orderBy("updatedAt", "desc")
  );

  state.unsubTopics = onSnapshot(qTopics, (snap) => {
    state.topics = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (syncPill) syncPill.textContent = navigator.onLine ? "Synced" : "Offline cache";
    renderTopics();
  }, () => {
    if (syncPill) syncPill.textContent = "Offline cache";
  });
}

function renderTopics() {
  if (!topicsList) return;
  topicsList.innerHTML = "";
  toast(topicsMsg, "");

  const q = (topicSearch?.value || "").trim().toLowerCase();
  const f = topicFilter?.value || "all";

  let list = [...state.topics];
  if (f === "owned") list = list.filter(t => t.ownerUid === state.user.uid);
  if (f === "shared") list = list.filter(t => t.ownerUid !== state.user.uid);
  if (q) list = list.filter(t => (t.name || "").toLowerCase().includes(q));

  if (list.length === 0) {
    topicsList.innerHTML = `<div class="muted">No topics yet. Click “New Topic”.</div>`;
    return;
  }

  for (const t of list) {
    const owned = t.ownerUid === state.user.uid;
    const el = document.createElement("div");
    el.className = "topicCard";
    el.innerHTML = `
      <div class="topicMeta">
        <div class="topicName">${esc(t.name)}</div>
        <div class="chipRow">
          <span class="chip ${owned ? "ok" : "warn"}">${owned ? "Owned" : "Shared"}</span>
          <span class="chip">${(t.columns || []).length} cols</span>
          <span class="chip">${(t.sharedWith || []).length} shares</span>
        </div>
        <div class="muted small">Updated: ${formatTs(t.updatedAt)}</div>
      </div>
      <div class="row wrap">
        <button class="btn ghost openBtn">Open</button>
        <button class="btn ghost exportBtn">Export</button>
      </div>
    `;

    el.querySelector(".openBtn").addEventListener("click", () => openTopic(t.id));
    el.querySelector(".exportBtn").addEventListener("click", async () => {
      await openTopic(t.id);
      exportCurrentCSV();
      showTopics();
    });

    topicsList.appendChild(el);
  }
}

function openCreateTopicModal() {
  const body = document.createElement("div");
  body.className = "grid";
  body.innerHTML = `
    <div>
      <div class="label">Topic name</div>
      <input id="tName" placeholder="e.g., Journal, Work Log, To-Do" />
    </div>

    <div class="muted small">Columns (default): Date, Title, Notes</div>

    <!-- IMPORTANT: footer keeps buttons clickable -->
    <div class="modalFooter row between">
      <button id="createBtn" class="btn primary">Create</button>
      <button id="cancelBtn" class="btn ghost">Cancel</button>
    </div>

    <p id="mMsg" class="msg"></p>
  `;

  const tName = body.querySelector("#tName");
  const mMsg = body.querySelector("#mMsg");

  body.querySelector("#cancelBtn").addEventListener("click", closeModal);
  body.querySelector("#createBtn").addEventListener("click", async () => {
    toast(mMsg, "");
    const name = tName.value.trim();
    if (!name) return toast(mMsg, "Enter topic name.");

    const columns = [
      { id: "date", name: "Date", type: "date", required: true },
      { id: "title", name: "Title", type: "text", required: true },
      { id: "notes", name: "Notes", type: "richtext", required: false }
    ];

    try {
      const uid = state.user.uid;
      await addDoc(topicsCol(), {
        ownerUid: uid,
        name,
        columns,
        sharedWith: [],
        allowedUids: [uid],
        createdAt: nowTs(),
        updatedAt: nowTs()
      });
      closeModal();
    } catch (e) {
      toast(mMsg, e.message);
    }
  });

  openModal("New Topic", body);
}

// ------------------ Topic detail & rows ------------------
backBtn?.addEventListener("click", () => {
  stopRowsListener();
  showTopics();
});

shareBtn?.addEventListener("click", openShareModal);
addRowBtn?.addEventListener("click", () => openRowModal(null));

rowSearch?.addEventListener("input", renderRows);
sortSelect?.addEventListener("change", () => startRowsListener());

viewToggleBtn?.addEventListener("click", () => {
  state.view = state.view === "table" ? "card" : "table";
  viewToggleBtn.textContent = state.view === "table" ? "Card view" : "Table view";
  renderRows();
});

exportBtn?.addEventListener("click", exportCurrentCSV);

async function openTopic(topicId) {
  const snap = await getDoc(topicDoc(topicId));
  if (!snap.exists()) return;

  state.currentTopic = { id: snap.id, ...snap.data() };
  if (topicTitle) topicTitle.textContent = state.currentTopic.name;
  if (topicSub) topicSub.textContent = state.currentTopic.ownerUid === state.user.uid ? "Owner: you" : "Shared topic";

  if (rowSearch) rowSearch.value = "";
  if (sortSelect) sortSelect.value = "updated_desc";

  state.view = "table";
  if (viewToggleBtn) viewToggleBtn.textContent = "Card view";

  showTopic();
  startRowsListener();
}

function stopRowsListener() {
  if (state.unsubRows) state.unsubRows();
  state.unsubRows = null;
  state.rows = [];
  if (rowsBox) rowsBox.innerHTML = "";
}

function startRowsListener() {
  stopRowsListener();

  const t = state.currentTopic;
  if (!t) return;

  let ord = ["updatedAt", "desc"];
  if (sortSelect?.value === "date_desc") ord = ["sortDate", "desc"];
  if (sortSelect?.value === "date_asc") ord = ["sortDate", "asc"];

  const qRows = query(rowsCol(t.id), orderBy(ord[0], ord[1]), limit(800));

  state.unsubRows = onSnapshot(qRows, (snap) => {
    state.rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRows();
  }, () => renderRows());
}

function getFilteredRows() {
  const q = (rowSearch?.value || "").trim().toLowerCase();
  if (!q) return [...state.rows];

  return state.rows.filter(r => {
    const v = r.values || {};
    const flat = `${v.date || ""} ${v.title || ""} ${stripHtml(v.notes || "")}`.toLowerCase();
    return flat.includes(q);
  });
}

function renderRows() {
  if (!rowsBox) return;
  rowsBox.innerHTML = "";
  toast(rowsMsg, "");

  const t = state.currentTopic;
  if (!t) return;

  const rows = getFilteredRows();
  if (rows.length === 0) {
    rowsBox.innerHTML = `<div class="muted">No rows. Click “Add Row”.</div>`;
    return;
  }

  if (state.view === "table") {
    const wrap = document.createElement("div");
    wrap.className = "tableWrap";

    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr><th>Date</th><th>Title</th><th>Notes</th><th>Actions</th></tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    for (const r of rows) {
      const v = r.values || {};
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${esc(v.date || "")}</td>
        <td>${esc(v.title || "")}</td>
        <td>${v.notes ? v.notes : '<span class="muted">—</span>'}</td>
        <td>
          <div class="cellActions">
            <button class="iconMini editBtn">✎</button>
            <button class="iconMini delBtn">🗑</button>
          </div>
        </td>
      `;

      tr.querySelector(".editBtn").addEventListener("click", () => openRowModal(r));
      tr.querySelector(".delBtn").addEventListener("click", () => deleteRow(r));

      tbody.appendChild(tr);
    }

    wrap.appendChild(table);
    rowsBox.appendChild(wrap);
    return;
  }

  for (const r of rows) {
    const v = r.values || {};
    const card = document.createElement("div");
    card.className = "rowCard";

    card.innerHTML = `
      <div class="rowCardHeader">
        <div class="muted small">Updated: ${formatTs(r.updatedAt)}</div>
        <div class="row">
          <button class="btn ghost editBtn">Edit</button>
          <button class="btn ghost delBtn">Delete</button>
        </div>
      </div>

      <div class="kv">
        <div class="k">Date</div><div class="v">${esc(v.date || "")}</div>
        <div class="k">Title</div><div class="v"><b>${esc(v.title || "")}</b></div>
        <div class="k">Notes</div><div class="v">${v.notes ? v.notes : '<span class="muted">—</span>'}</div>
      </div>
    `;

    card.querySelector(".editBtn").addEventListener("click", () => openRowModal(r));
    card.querySelector(".delBtn").addEventListener("click", () => deleteRow(r));

    rowsBox.appendChild(card);
  }
}

function openRowModal(row) {
  const isEdit = Boolean(row);

  const body = document.createElement("div");
  body.className = "grid";

  body.innerHTML = `
    <div>
      <div class="label">Date *</div>
      <input id="rDate" type="date" />
    </div>

    <div>
      <div class="label">Title *</div>
      <input id="rTitle" placeholder="Title" />
    </div>

    <div>
      <div class="label">Notes</div>
      <div id="rNotes"></div>
    </div>

    <!-- IMPORTANT: footer keeps buttons clickable -->
    <div class="modalFooter row between">
      <button id="saveBtn" class="btn primary">${isEdit ? "Save changes" : "Create row"}</button>
      <button id="cancelBtn" class="btn ghost">Cancel</button>
    </div>

    <p id="mMsg" class="msg"></p>
  `;

  const rDate = body.querySelector("#rDate");
  const rTitle = body.querySelector("#rTitle");
  const mMsg = body.querySelector("#mMsg");
  const notesEl = body.querySelector("#rNotes");

  // Quill init
  const q = new Quill(notesEl, {
    theme: "snow",
    modules: {
      toolbar: [["bold", "italic", "underline"], [{ list: "ordered" }, { list: "bullet" }], ["link"], ["clean"]]
    }
  });

  const old = row?.values || {};
  rDate.value = old.date || isoDateLocal();
  rTitle.value = old.title || "";
  q.root.innerHTML = old.notes || "";

  body.querySelector("#cancelBtn").addEventListener("click", closeModal);

  body.querySelector("#saveBtn").addEventListener("click", async () => {
    toast(mMsg, "");

    const date = rDate.value || "";
    const title = rTitle.value.trim();
    const notes = q.root.innerHTML || "";

    if (!date) return toast(mMsg, "Date is required.");
    if (!title) return toast(mMsg, "Title is required.");

    const t = state.currentTopic;
    if (!t) return toast(mMsg, "No topic open.");

    const values = { date, title, notes };
    const sortDate = date;

    // Prevent double-click creating duplicates
    const btn = body.querySelector("#saveBtn");
    btn.disabled = true;
    btn.textContent = isEdit ? "Saving…" : "Creating…";

    try {
      if (!isEdit) {
        await addDoc(rowsCol(t.id), {
          values,
          sortDate,
          createdAt: nowTs(),
          updatedAt: nowTs(),
          createdBy: state.user.uid,
          updatedBy: state.user.uid
        });
      } else {
        await updateDoc(doc(db, "topics", t.id, "rows", row.id), {
          values,
          sortDate,
          updatedAt: nowTs(),
          updatedBy: state.user.uid
        });
      }

      // Topic updatedAt is nice-to-have; don't block UI if it fails
      updateDoc(topicDoc(t.id), { updatedAt: nowTs() }).catch(() => { });

      closeModal();
    } catch (e) {
      toast(mMsg, e.message);
      btn.disabled = false;
      btn.textContent = isEdit ? "Save changes" : "Create row";
    }
  });

  openModal(isEdit ? "Edit Row" : "Add Row", body);
}

async function deleteRow(row) {
  if (!confirm("Delete this row?")) return;

  const t = state.currentTopic;
  if (!t) return;

  try {
    await deleteDoc(doc(db, "topics", t.id, "rows", row.id));
    updateDoc(topicDoc(t.id), { updatedAt: nowTs() }).catch(() => { });
  } catch (e) {
    toast(rowsMsg, e.message);
  }
}

// ------------------ Sharing (Owner only) ------------------
async function openShareModal() {
  const t = state.currentTopic;
  if (!t) return;

  if (t.ownerUid !== state.user.uid) {
    const b = document.createElement("div");
    b.innerHTML = `<div class="muted">Only the topic owner can manage sharing.</div>`;
    return openModal("Share", b);
  }

  const body = document.createElement("div");
  body.className = "grid";
  body.innerHTML = `
    <div class="muted small">Share by <b>User ID</b>. The other user must have created an account.</div>

    <div class="row wrap">
      <input id="shUserId" placeholder="User ID (example: ramesh01)" />
      <select id="shRole" class="select" style="width:180px">
        <option value="edit">Edit</option>
        <option value="read">Read-only</option>
      </select>
      <button id="shAdd" class="btn primary">Share</button>
    </div>

    <div>
      <div class="h2" style="margin-top:6px;">Shared with</div>
      <div id="shList" class="list"></div>
    </div>

    <p id="shMsg" class="msg"></p>
  `;

  const shUserId = body.querySelector("#shUserId");
  const shRole = body.querySelector("#shRole");
  const shAdd = body.querySelector("#shAdd");
  const shList = body.querySelector("#shList");
  const shMsg = body.querySelector("#shMsg");

  function renderList() {
    shList.innerHTML = "";
    const shares = t.sharedWith || [];
    if (shares.length === 0) {
      shList.innerHTML = `<div class="muted">No shares yet.</div>`;
      return;
    }

    for (const s of shares) {
      const item = document.createElement("div");
      item.className = "topicCard";
      item.innerHTML = `
        <div class="topicMeta">
          <div class="topicName">${esc(s.userId || "")}</div>
          <div class="chipRow"><span class="chip">${esc(s.role || "edit")}</span></div>
        </div>
        <div class="row wrap">
          <button class="btn ghost rmBtn">Remove</button>
        </div>
      `;

      item.querySelector(".rmBtn").addEventListener("click", async () => {
        try {
          await removeShare(s.userId);
          toast(shMsg, "Removed.", true);
        } catch (e) {
          toast(shMsg, e.message);
        }
      });

      shList.appendChild(item);
    }
  }

  async function removeShare(userId) {
    const key = (userId || "").toLowerCase();
    const nextShared = (t.sharedWith || []).filter(x => (x.userId || "").toLowerCase() !== key);

    const allowed = new Set(t.allowedUids || []);
    const removed = (t.sharedWith || []).find(x => (x.userId || "").toLowerCase() === key);
    if (removed?.uid) allowed.delete(removed.uid);
    allowed.add(t.ownerUid);

    await updateDoc(topicDoc(t.id), {
      sharedWith: nextShared,
      allowedUids: Array.from(allowed),
      updatedAt: nowTs()
    });

    const snap = await getDoc(topicDoc(t.id));
    state.currentTopic = { id: snap.id, ...snap.data() };
    Object.assign(t, state.currentTopic);
    renderList();
  }

  shAdd.addEventListener("click", async () => {
    toast(shMsg, "");
    const userId = shUserId.value.trim();
    if (!userId) return toast(shMsg, "Enter User ID.");
    if (userId.toLowerCase() === (state.userId || "").toLowerCase()) return toast(shMsg, "You are the owner.");

    const key = userId.toLowerCase();
    const idxSnap = await getDoc(userIndexDoc(key));
    if (!idxSnap.exists()) return toast(shMsg, "User not found. Ask them to create an account first.");

    const uid = idxSnap.data().uid;
    const role = shRole.value;

    const exists = (t.sharedWith || []).some(x => (x.userId || "").toLowerCase() === key);
    if (exists) return toast(shMsg, "Already shared with this user.");

    const nextShared = [...(t.sharedWith || []), { userId, uid, role, sharedAt: nowTs() }];
    const allowed = new Set(t.allowedUids || []);
    allowed.add(uid);
    allowed.add(t.ownerUid);

    await updateDoc(topicDoc(t.id), {
      sharedWith: nextShared,
      allowedUids: Array.from(allowed),
      updatedAt: nowTs()
    });

    const snap = await getDoc(topicDoc(t.id));
    state.currentTopic = { id: snap.id, ...snap.data() };
    Object.assign(t, state.currentTopic);

    shUserId.value = "";
    toast(shMsg, "Shared.", true);
    renderList();
  });

  renderList();
  openModal("Share Topic", body);
}

// ------------------ Export ------------------
function exportCurrentCSV() {
  toast(rowsMsg, "");
  const t = state.currentTopic;
  if (!t) return;

  const rows = getFilteredRows().map(r => {
    const v = r.values || {};
    return {
      Date: v.date || "",
      Title: v.title || "",
      Notes: stripHtml(v.notes || ""),
      CreatedAt: formatTs(r.createdAt),
      UpdatedAt: formatTs(r.updatedAt)
    };
  });

  const headers = ["Date", "Title", "Notes", "CreatedAt", "UpdatedAt"];
  download(`${t.name}.csv`, toCSV(rows, headers));
  toast(rowsMsg, "Exported CSV.", true);
}

// ------------------ PWA ------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => { });
  });
}
