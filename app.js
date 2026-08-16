(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const STORAGE_KEY = "my-finances-v1";

  /* ============================================================
     Live net worth (Google Sheets, via OAuth)
     Fill these in — see README for how to create an OAuth client.
     ============================================================ */
  const SHEETS_CONFIG = {
    clientId: "483381274763-v4a9p7fcg97i0cfijm8e795t2l890o78.apps.googleusercontent.com",         // OAuth 2.0 Client ID (type: Web application) from Google Cloud Console
    spreadsheetId: "1dDg5IKtKjiTAJWkVhSET7l2EmB7wULf46g3GRgsfTAA",    // the long id in your sheet's URL: /spreadsheets/d/<THIS>/edit
    range: "Sheet1!B5"    // the single cell holding your net worth number
  };
  const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
  const SHEETS_TOKEN_KEY = "my-finances-sheets-token-v1";

  let tokenClient = null;
  let sheetsAccessToken = null;

  function loadStoredSheetsToken() {
    try {
      const raw = sessionStorage.getItem(SHEETS_TOKEN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.token || !parsed.expiresAt || Date.now() >= parsed.expiresAt) return null;
      return parsed.token;
    } catch (e) {
      return null;
    }
  }

  function storeSheetsToken(token, expiresInSeconds) {
    sheetsAccessToken = token;
    try {
      sessionStorage.setItem(SHEETS_TOKEN_KEY, JSON.stringify({
        token, expiresAt: Date.now() + (expiresInSeconds * 1000) - 60000
      }));
    } catch (e) { /* ignore */ }
  }

  function initGoogleAuth() {
    if (!SHEETS_CONFIG.clientId || !window.google || !google.accounts) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: SHEETS_CONFIG.clientId,
      scope: SHEETS_SCOPE,
      callback: (resp) => {
        if (resp.error) { console.warn("Google Sheets auth failed", resp); return; }
        storeSheetsToken(resp.access_token, resp.expires_in);
        $("#connectSheetBtn").style.display = "none";
        refreshLiveNetWorth();
      }
    });

    sheetsAccessToken = loadStoredSheetsToken();
    if (sheetsAccessToken) {
      refreshLiveNetWorth();
    } else {
      // First visit (or expired session): needs an explicit click to satisfy the browser's
      // popup-blocker, which requires the consent prompt to originate from a user gesture.
      $("#connectSheetBtn").style.display = "";
    }
  }

  $("#connectSheetBtn").addEventListener("click", () => {
    if (tokenClient) tokenClient.requestAccessToken({ prompt: "consent" });
  });

  async function fetchLiveNetWorth() {
    const { spreadsheetId, range } = SHEETS_CONFIG;
    if (!spreadsheetId || !sheetsAccessToken) return null;
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${sheetsAccessToken}` } });
      if (res.status === 401) {
        // token expired/revoked — clear it and ask the user to reconnect
        sheetsAccessToken = null;
        try { sessionStorage.removeItem(SHEETS_TOKEN_KEY); } catch (e) { /* ignore */ }
        $("#connectSheetBtn").style.display = "";
        return null;
      }
      if (!res.ok) throw new Error(`Sheets API responded ${res.status}`);
      const data = await res.json();
      const raw = data.values && data.values[0] && data.values[0][0];
      const value = parseFloat(String(raw).replace(/[^0-9.-]/g, ""));
      return isFinite(value) ? value : null;
    } catch (e) {
      console.warn("Couldn't fetch live net worth from Google Sheets — showing demo value instead.", e);
      return null;
    }
  }

  function refreshLiveNetWorth() {
    fetchLiveNetWorth().then((value) => {
      if (value !== null) $("#statNetWorth").textContent = formatMoney(value);
    });
  }

  /* ============================================================
     Date helpers
     ============================================================ */
  const pad2 = (n) => String(n).padStart(2, "0");
  const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayISO = () => toISODate(new Date());
  const daysAgoISO = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return toISODate(d);
  };
  const monthKey = (iso) => iso.slice(0, 7);
  const parseISO = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const currentMonthKey = () => monthKey(todayISO());
  const previousMonthKey = () => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return monthKey(toISODate(d));
  };
  function relativeDateLabel(iso) {
    const diffDays = Math.round((parseISO(todayISO()) - parseISO(iso)) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays === -1) return "Tomorrow";
    if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < -1 && diffDays > -7) return `in ${-diffDays} days`;
    return parseISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function shortDateLabel(iso) {
    return parseISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function cryptoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  /* ============================================================
     State
     ============================================================ */
  let state = null;

  function seedState() {
    const tx = (name, category, amount, daysAgo) => ({
      id: cryptoId(), name, category, amount, date: daysAgoISO(daysAgo)
    });
    return {
      settings: { currency: "USD", startingBalance: 18900, monthlyIncomeGoal: 8000 },
      transactions: [
        tx("Paycheck", "Income", 2400, 1),
        tx("Paycheck", "Income", 2400, 15),
        tx("Paycheck", "Income", 2400, 29),
        tx("Rent", "Housing", -1850, 3),
        tx("Rent", "Housing", -1850, 33),
        tx("Gas", "Transport", -55, 2),
        tx("Gas", "Transport", -58, 9),
        tx("Gas", "Transport", -52, 16),
        tx("Gas", "Transport", -60, 23),
        tx("Groceries", "Groceries", -42.5, 1),
        tx("Groceries", "Groceries", -88.2, 5),
        tx("Groceries", "Groceries", -63.1, 11),
        tx("Groceries", "Groceries", -95.4, 18),
        tx("Groceries", "Groceries", -71.3, 25),
        tx("Restaurant", "Dining", -34, 4),
        tx("Restaurant", "Dining", -52.75, 12),
        tx("Restaurant", "Dining", -28.9, 20),
        tx("Coffee", "Dining", -6.5, 1),
        tx("Coffee", "Dining", -6.5, 3),
        tx("Coffee", "Dining", -6.5, 8),
        tx("Electric & water", "Bills", -145, 7),
        tx("Internet", "Bills", -70, 10),
        tx("Phone plan", "Bills", -85, 14),
        tx("Streaming subscriptions", "Entertainment", -25.98, 6),
        tx("Movie night", "Entertainment", -38, 19),
        tx("Gym membership", "Health", -49.99, 2),
        tx("Pharmacy", "Health", -22.15, 15),
        tx("Shopping", "Shopping", -112.4, 13),
        tx("Shopping", "Shopping", -64.2, 27),
        tx("Freelance gig", "Income", 350, 17),
        tx("Interest", "Income", 12.4, 30),
        tx("Car insurance", "Bills", -132, 21),
        tx("Gift received", "Income", 100, 26),
        tx("Haircut", "Personal", -35, 24)
      ],
      budgets: [
        { id: cryptoId(), category: "Groceries", allocated: 500 },
        { id: cryptoId(), category: "Dining", allocated: 150 },
        { id: cryptoId(), category: "Transport", allocated: 250 },
        { id: cryptoId(), category: "Housing", allocated: 1850 },
        { id: cryptoId(), category: "Bills", allocated: 400 },
        { id: cryptoId(), category: "Entertainment", allocated: 100 },
        { id: cryptoId(), category: "Shopping", allocated: 200 },
        { id: cryptoId(), category: "Health", allocated: 100 }
      ],
      tasks: [
        { id: cryptoId(), text: "Review this month's budget", done: false, due: daysAgoISO(-3) },
        { id: cryptoId(), text: "Pay credit card bill", done: false, due: daysAgoISO(-2) },
        { id: cryptoId(), text: "Set up automatic savings transfer", done: true, due: null },
        { id: cryptoId(), text: "Cancel unused subscription", done: false, due: null },
        { id: cryptoId(), text: "File receipts for taxes", done: false, due: daysAgoISO(-10) }
      ]
    };
  }

  function loadState() {
    const base = seedState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      return {
        settings: Object.assign({}, base.settings, parsed.settings || {}),
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : base.transactions,
        budgets: Array.isArray(parsed.budgets) ? parsed.budgets : base.budgets,
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : base.tasks
      };
    } catch (e) {
      console.error("Couldn't read saved data — starting from the demo set instead.", e);
      return base;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Couldn't save — your changes may not persist.", e);
    }
  }

  /* ============================================================
     Formatting
     ============================================================ */
  function formatMoney(amount) {
    const currency = (state.settings && state.settings.currency) || "USD";
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
    } catch (e) {
      return `$${amount.toFixed(2)}`;
    }
  }
  function formatSigned(amount) {
    return `${amount < 0 ? "-" : "+"}${formatMoney(Math.abs(amount))}`;
  }

  /* ============================================================
     Derived data
     ============================================================ */
  function netWorthAsOf(iso) {
    let total = state.settings.startingBalance;
    for (const t of state.transactions) if (t.date <= iso) total += t.amount;
    return total;
  }
  const currentNetWorth = () => netWorthAsOf(todayISO());

  function sumMonth(mk, predicate) {
    return state.transactions
      .filter((t) => monthKey(t.date) === mk && predicate(t))
      .reduce((s, t) => s + Math.abs(t.amount), 0);
  }
  const incomeForMonth = (mk) => sumMonth(mk, (t) => t.amount > 0);
  const spendingForMonth = (mk) => sumMonth(mk, (t) => t.amount < 0);
  function spentForCategory(category, mk) {
    return state.transactions
      .filter((t) => t.category === category && t.amount < 0 && monthKey(t.date) === mk)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
  }

  function pctChange(curr, prev) {
    if (!prev) return null;
    return ((curr - prev) / Math.abs(prev)) * 100;
  }

  function renderTrend(el, pct, label, { invert = false } = {}) {
    if (pct === null || !isFinite(pct)) { el.textContent = ""; el.className = "stat-trend"; return; }
    const good = invert ? pct <= 0 : pct >= 0;
    const arrowIcon = pct >= 0 ? "#icon-up-right" : "#icon-down-right";
    el.className = "stat-trend " + (good ? "up" : "down");
    el.innerHTML = `<svg class="icon"><use href="${arrowIcon}"/></svg>${Math.abs(pct).toFixed(1)}% ${label}`;
  }

  /* ============================================================
     Dashboard
     ============================================================ */
  function renderDashboard() {
    $("#statNetWorth").textContent = formatMoney(currentNetWorth());
    renderTrend($("#statNetWorthTrend"), pctChange(currentNetWorth(), netWorthAsOf(daysAgoISO(30))), "vs 30 days ago");
    if (sheetsAccessToken) refreshLiveNetWorth();

    const cmk = currentMonthKey(), pmk = previousMonthKey();
    const income = incomeForMonth(cmk), spending = spendingForMonth(cmk);
    $("#statIncome").textContent = formatMoney(income);
    $("#statSpending").textContent = formatMoney(spending);
    renderTrend($("#statIncomeTrend"), pctChange(income, incomeForMonth(pmk)), "vs last month");
    renderTrend($("#statSpendingTrend"), pctChange(spending, spendingForMonth(pmk)), "vs last month", { invert: true });

    renderRecentTransactions();
    drawNetWorthChart();
  }

  function renderRecentTransactions() {
    const list = $("#recentTxnList");
    const sorted = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    if (!sorted.length) {
      list.innerHTML = `<li class="empty-state">No transactions yet — add one to start your ledger.</li>`;
      return;
    }
    list.innerHTML = sorted.map((t) => {
      const isIncome = t.amount > 0;
      return `<li class="txn-row ${isIncome ? "is-income" : "is-expense"}">
        <span class="txn-dot"></span>
        <span class="txn-info">
          <span class="txn-name">${escapeHtml(t.name)}</span>
          <span class="txn-meta">${escapeHtml(t.category)} · ${relativeDateLabel(t.date)}</span>
        </span>
        <span class="txn-amount ${isIncome ? "is-income" : "is-expense"}">${formatSigned(t.amount)}</span>
      </li>`;
    }).join("");
  }

  function drawNetWorthChart() {
    const canvas = $("#netWorthChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.parentElement.clientWidth;
    const cssHeight = 220;
    if (cssWidth <= 0) return;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const days = 30;
    const points = [];
    for (let i = days; i >= 0; i--) {
      const iso = daysAgoISO(i);
      points.push({ date: iso, value: netWorthAsOf(iso) });
    }
    const values = points.map((p) => p.value);
    const minV = Math.min(...values), maxV = Math.max(...values);
    const pad = (maxV - minV) * 0.15 || Math.max(10, Math.abs(minV) * 0.02);
    const yMin = minV - pad, yMax = maxV + pad;

    const marginL = 4, marginR = 4, marginT = 10, marginB = 22;
    const plotW = cssWidth - marginL - marginR;
    const plotH = cssHeight - marginT - marginB;
    const xFor = (i) => marginL + (plotW * i) / (points.length - 1);
    const yFor = (v) => marginT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

    ctx.strokeStyle = "rgba(28,32,39,0.10)";
    ctx.lineWidth = 1;
    for (let r = 0; r <= 4; r++) {
      const y = marginT + (plotH * r) / 4;
      ctx.beginPath();
      ctx.moveTo(marginL, y);
      ctx.lineTo(cssWidth - marginR, y);
      ctx.stroke();
    }

    const grad = ctx.createLinearGradient(0, marginT, 0, marginT + plotH);
    grad.addColorStop(0, "rgba(62,124,106,0.32)");
    grad.addColorStop(1, "rgba(62,124,106,0.02)");
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xFor(i), y = yFor(p.value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(xFor(points.length - 1), marginT + plotH);
    ctx.lineTo(xFor(0), marginT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    points.forEach((p, i) => {
      const x = xFor(i), y = yFor(p.value);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#3e7c6a";
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(xFor(points.length - 1), yFor(last.value), 4, 0, Math.PI * 2);
    ctx.fillStyle = "#3e7c6a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(xFor(points.length - 1), yFor(last.value), 7, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(62,124,106,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#6b6355";
    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(shortDateLabel(points[0].date), marginL, cssHeight - marginB + 6);
    ctx.textAlign = "right";
    ctx.fillText(shortDateLabel(points[points.length - 1].date), cssWidth - marginR, cssHeight - marginB + 6);
  }

  /* ============================================================
     Budget
     ============================================================ */
  function renderBudget() {
    const cmk = currentMonthKey();
    const totalAllocated = state.budgets.reduce((s, b) => s + b.allocated, 0);
    const totalSpent = state.budgets.reduce((s, b) => s + spentForCategory(b.category, cmk), 0);
    const over = totalSpent > totalAllocated;

    $("#budgetSummary").innerHTML = `
      <div class="budget-summary-row"><span>Total budgeted</span><strong>${formatMoney(totalAllocated)}</strong></div>
      <div class="budget-summary-row"><span>Spent this month</span><strong style="color:${over ? "var(--brick)" : "var(--verdigris)"}">${formatMoney(totalSpent)}</strong></div>
      <div class="progress-track"><div class="progress-fill ${over ? "is-over" : ""}" style="width:${totalAllocated ? Math.min(100, (totalSpent / totalAllocated) * 100) : 0}%"></div></div>
    `;

    const list = $("#budgetList");
    if (!state.budgets.length) {
      list.innerHTML = `<div class="panel receipt empty-state">No budget categories yet — add one to start tracking limits.</div>`;
      return;
    }
    list.innerHTML = state.budgets.map((b) => {
      const spent = spentForCategory(b.category, cmk);
      const pct = b.allocated ? Math.min(100, (spent / b.allocated) * 100) : 0;
      const isOver = spent > b.allocated;
      const remaining = b.allocated - spent;
      return `<div class="budget-card receipt">
        <div class="budget-card-top">
          <span class="budget-card-name">${escapeHtml(b.category)}</span>
          <button type="button" class="icon-btn-mini" data-delete-budget="${b.id}" aria-label="Remove ${escapeHtml(b.category)} category">
            <svg class="icon"><use href="#icon-trash"/></svg>
          </button>
        </div>
        <div class="progress-track"><div class="progress-fill ${isOver ? "is-over" : ""}" style="width:${pct}%"></div></div>
        <div class="budget-card-foot">
          <span>${formatMoney(spent)} of ${formatMoney(b.allocated)}</span>
          <span>${isOver ? formatMoney(Math.abs(remaining)) + " over" : formatMoney(remaining) + " left"}</span>
        </div>
      </div>`;
    }).join("");
  }

  /* ============================================================
     Calendar
     ============================================================ */
  let calState = null;
  let selectedDate = null;

  function renderCalendar() {
    const label = new Date(calState.year, calState.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    $("#calMonthLabel").textContent = label;

    const firstDow = new Date(calState.year, calState.month, 1).getDay();
    const daysInMonth = new Date(calState.year, calState.month + 1, 0).getDate();
    const todayIso = todayISO();

    let cells = "";
    for (let i = 0; i < firstDow; i++) cells += `<div class="cal-cell is-blank"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${calState.year}-${pad2(calState.month + 1)}-${pad2(d)}`;
      const hasMoney = state.transactions.some((t) => t.date === iso);
      const hasTask = state.tasks.some((t) => t.due === iso);
      const isToday = iso === todayIso;
      const isSelected = iso === selectedDate;
      cells += `<button type="button" class="cal-cell ${isToday ? "is-today" : ""} ${isSelected ? "is-selected" : ""}" data-date="${iso}">
        <span>${d}</span>
        <span class="cal-dots">${hasMoney ? '<i class="dot dot-money"></i>' : ""}${hasTask ? '<i class="dot dot-task"></i>' : ""}</span>
      </button>`;
    }
    $("#calendarGrid").innerHTML = cells;

    if (selectedDate) renderDayDetail(selectedDate);
    else $("#dayDetail").hidden = true;
  }

  function renderDayDetail(iso) {
    const panel = $("#dayDetail");
    panel.hidden = false;
    const dayTx = state.transactions.filter((t) => t.date === iso);
    const dayTasks = state.tasks.filter((t) => t.due === iso);
    const label = parseISO(iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    let html = `<h4>${label}</h4>`;
    if (!dayTx.length && !dayTasks.length) {
      html += `<p class="empty-state" style="padding:8px 0;">Nothing on the books for this day.</p>`;
    }
    dayTx.forEach((t) => {
      html += `<div class="day-detail-item"><span>${escapeHtml(t.name)}</span><span class="txn-amount ${t.amount > 0 ? "is-income" : "is-expense"}">${formatSigned(t.amount)}</span></div>`;
    });
    dayTasks.forEach((t) => {
      html += `<div class="day-detail-item"><span>${t.done ? "✓ " : ""}${escapeHtml(t.text)}</span><span>${t.done ? "Done" : "Due"}</span></div>`;
    });
    panel.innerHTML = html;
  }

  /* ============================================================
     Tasks
     ============================================================ */
  function renderTasks() {
    const list = $("#taskList");
    if (!state.tasks.length) {
      list.innerHTML = `<div class="panel receipt empty-state">No tasks yet — add a money task above to get started.</div>`;
      return;
    }
    const today = todayISO();
    const sorted = [...state.tasks].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return 0;
    });
    list.innerHTML = sorted.map((t) => {
      const overdue = t.due && !t.done && t.due < today;
      return `<div class="task-row receipt ${t.done ? "is-done" : ""}">
        <button type="button" class="task-check" data-toggle-task="${t.id}" aria-label="${t.done ? "Mark incomplete" : "Mark complete"}">
          <svg class="icon"><use href="#icon-check"/></svg>
        </button>
        <div class="task-body">
          <span class="task-text">${escapeHtml(t.text)}</span>
          ${t.due ? `<span class="task-due ${overdue ? "is-overdue" : ""}">${overdue ? "Overdue · " : ""}${relativeDateLabel(t.due)}</span>` : ""}
        </div>
        <button type="button" class="icon-btn-mini" data-delete-task="${t.id}" aria-label="Delete task">
          <svg class="icon"><use href="#icon-trash"/></svg>
        </button>
      </div>`;
    }).join("");
  }

  /* ============================================================
     View switching
     ============================================================ */
  let activeView = "dashboard";

  function setActiveView(view) {
    activeView = view;
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === view));
    $$(".nav-item").forEach((n) => n.classList.toggle("is-active", n.dataset.view === view));
    $$(".tab-item").forEach((n) => n.classList.toggle("is-active", n.dataset.view === view));
    $("#fabAdd").classList.toggle("is-hidden", view === "calendar");

    if (view === "dashboard") renderDashboard();
    else if (view === "budget") renderBudget();
    else if (view === "calendar") renderCalendar();
    else if (view === "tasks") renderTasks();
  }

  function renderAll() {
    $("#currentDate").textContent = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
    renderDashboard();
    renderBudget();
    renderCalendar();
    renderTasks();
  }

  /* ============================================================
     Modals
     ============================================================ */
  function openModal(id, prep) {
    if (prep) prep();
    $("#" + id).hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal(id) {
    $("#" + id).hidden = true;
    document.body.style.overflow = "";
  }

  /* ============================================================
     Toast
     ============================================================ */
  function showToast(msg) {
    const wrap = $("#toastWrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    setTimeout(() => {
      el.classList.remove("is-visible");
      setTimeout(() => el.remove(), 250);
    }, 2000);
  }

  /* ============================================================
     Event bindings
     ============================================================ */
  $$(".nav-item, .tab-item").forEach((el) => {
    el.addEventListener("click", () => setActiveView(el.dataset.view));
  });

  $$("[data-close]").forEach((btn) => btn.addEventListener("click", () => closeModal(btn.dataset.close)));
  $$(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay.id); });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $$(".modal-overlay:not([hidden])").forEach((o) => closeModal(o.id));
  });

  $("#settingsBtn").addEventListener("click", () => openModal("settingsOverlay", () => {
    $("#settingCurrency").value = state.settings.currency;
    $("#settingStartingBalance").value = state.settings.startingBalance;
    $("#settingIncomeGoal").value = state.settings.monthlyIncomeGoal;
  }));

  $("#settingsForm").addEventListener("submit", (e) => {
    e.preventDefault();
    state.settings.currency = $("#settingCurrency").value;
    state.settings.startingBalance = parseFloat($("#settingStartingBalance").value) || 0;
    state.settings.monthlyIncomeGoal = parseFloat($("#settingIncomeGoal").value) || 0;
    saveState();
    closeModal("settingsOverlay");
    renderAll();
    showToast("Settings saved");
  });

  $("#resetDataBtn").addEventListener("click", () => {
    if (window.confirm("Reset all data back to the starting demo? This can't be undone.")) {
      state = seedState();
      saveState();
      selectedDate = null;
      closeModal("settingsOverlay");
      renderAll();
      showToast("Demo data reset");
    }
  });

  let txnType = "expense";
  function setTxnType(type) {
    txnType = type;
    $$("#txnTypeSwitch .segmented-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.type === type));
    const catSelect = $("#txnCategory");
    if (type === "income") catSelect.value = "Income";
    else if (catSelect.value === "Income") catSelect.value = "Groceries";
  }
  $("#txnTypeSwitch").addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (btn) setTxnType(btn.dataset.type);
  });

  function prepTxnModal() {
    $("#txnForm").reset();
    $("#txnDate").value = todayISO();
    setTxnType("expense");
  }
  $("#addTxnBtn").addEventListener("click", () => openModal("txnOverlay", prepTxnModal));

  $("#txnForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#txnName").value.trim();
    const amountVal = parseFloat($("#txnAmount").value);
    if (!name || isNaN(amountVal) || amountVal < 0) return;
    state.transactions.push({
      id: cryptoId(),
      name,
      category: $("#txnCategory").value,
      amount: txnType === "expense" ? -Math.abs(amountVal) : Math.abs(amountVal),
      date: $("#txnDate").value || todayISO()
    });
    saveState();
    closeModal("txnOverlay");
    renderDashboard();
    renderBudget();
    renderCalendar();
    showToast("Transaction added");
  });

  $("#addBudgetBtn").addEventListener("click", () => openModal("budgetOverlay", () => $("#budgetForm").reset()));

  $("#budgetForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#budgetCategory").value.trim();
    const allocated = parseFloat($("#budgetAllocated").value);
    if (!name || isNaN(allocated) || allocated < 0) return;
    state.budgets.push({ id: cryptoId(), category: name, allocated });
    saveState();
    closeModal("budgetOverlay");
    renderBudget();
    showToast("Budget category added");
  });

  $("#budgetList").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delete-budget]");
    if (!btn) return;
    state.budgets = state.budgets.filter((b) => b.id !== btn.dataset.deleteBudget);
    saveState();
    renderBudget();
  });

  $("#taskForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#taskInput");
    const text = input.value.trim();
    if (!text) return;
    state.tasks.push({ id: cryptoId(), text, done: false, due: $("#taskDue").value || null });
    saveState();
    input.value = "";
    $("#taskDue").value = "";
    renderTasks();
    renderCalendar();
    showToast("Task added");
  });

  $("#taskList").addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("[data-toggle-task]");
    const delBtn = e.target.closest("[data-delete-task]");
    if (toggleBtn) {
      const t = state.tasks.find((x) => x.id === toggleBtn.dataset.toggleTask);
      if (t) t.done = !t.done;
      saveState();
      renderTasks();
      renderCalendar();
    } else if (delBtn) {
      state.tasks = state.tasks.filter((x) => x.id !== delBtn.dataset.deleteTask);
      saveState();
      renderTasks();
      renderCalendar();
    }
  });

  $("#calPrev").addEventListener("click", () => {
    calState.month -= 1;
    if (calState.month < 0) { calState.month = 11; calState.year -= 1; }
    selectedDate = null;
    renderCalendar();
  });
  $("#calNext").addEventListener("click", () => {
    calState.month += 1;
    if (calState.month > 11) { calState.month = 0; calState.year += 1; }
    selectedDate = null;
    renderCalendar();
  });
  $("#calendarGrid").addEventListener("click", (e) => {
    const cell = e.target.closest("[data-date]");
    if (!cell) return;
    selectedDate = cell.dataset.date;
    renderCalendar();
  });

  $("#fabAdd").addEventListener("click", () => {
    if (activeView === "dashboard") openModal("txnOverlay", prepTxnModal);
    else if (activeView === "budget") openModal("budgetOverlay", () => $("#budgetForm").reset());
    else if (activeView === "tasks") {
      $("#taskInput").focus();
      $("#taskInput").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (activeView === "dashboard") drawNetWorthChart(); }, 150);
  });

  /* ============================================================
     Init
     ============================================================ */
  state = loadState();
  saveState();
  const now = new Date();
  calState = { year: now.getFullYear(), month: now.getMonth() };
  $("#currentDate").textContent = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  setActiveView("dashboard");
  initGoogleAuth();
})();
