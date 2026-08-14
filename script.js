/* =========================================================
   WATTWATCH — app logic
   Everything is stored in localStorage under one key so the
   whole "database" is a single JSON blob you can inspect in
   devtools. Swap `loadState`/`saveState` for real API calls
   when you're ready to add a backend (see README).
   ========================================================= */

const STORAGE_KEY = "wattwatch_state_v1";

/* ---- tunable game rules (change these to rebalance the game) ---- */
const RULES = {
  gaugeMaxPerPerson: 4.0,     // kWh/person that fills the dial to 100%
  dailyTargetPerPerson: 2.0,  // daily challenge target
  weeklyTargetPerPerson: 12,  // weekly challenge target
  wastageMultiplier: 1.4,     // today's usage vs own 7-day avg that triggers an alert
  streakForBadge: 5,          // consecutive logging days for "Streak Master"
  topRankForBadge: 3          // leaderboard position for "Eco Champion"
};

const BADGE_DEFS = [
  { id: "first-log",     icon: "⚡", name: "First Reading",  desc: "Logged your first day" },
  { id: "energy-saver",  icon: "🌿", name: "Energy Saver",   desc: "Beat the daily target" },
  { id: "streak-master", icon: "🔥", name: "Streak Master",  desc: `${RULES.streakForBadge}-day logging streak` },
  { id: "eco-champion",  icon: "🏆", name: "Eco Champion",   desc: "Reached top 3 on the board" },
  { id: "week-warrior",  icon: "🎯", name: "Week Warrior",   desc: "Won the weekly challenge" }
];

/* ---------------- state ---------------- */

function seedState(){
  // Demo rooms so the leaderboard has something to rank against
  // on a fresh browser. Replace with real data / an API later.
  const demoRooms = [
    { name: "Ravi & Dev",    room: "A-101", roommates: 2 },
    { name: "Priya S.",      room: "A-114", roommates: 1 },
    { name: "The Coders",    room: "B-207", roommates: 3 },
    { name: "Meera & co.",   room: "C-305", roommates: 3 },
    { name: "Karan",         room: "B-119", roommates: 1 },
  ].map(seedRoom);

  return { activeRoomId: null, rooms: demoRooms, notifyEnabled: false };
}

function seedRoom(base){
  const entries = [];
  const today = new Date();
  // 7 days of pseudo-random but plausible history, scaled by roommates
  for(let i = 6; i >= 0; i--){
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const perPerson = 1.2 + Math.random() * 2.2;
    entries.push({ date: dateKey(d), kwh: +(perPerson * base.roommates).toFixed(1) });
  }
  return {
    id: crypto.randomUUID(),
    name: base.name,
    room: base.room,
    roommates: base.roommates,
    entries,
    badges: [],
    coupons: []
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return seedState();
    const parsed = JSON.parse(raw);
    if(!parsed.rooms || !parsed.rooms.length) return seedState();
    return parsed;
  }catch(e){
    console.error("Could not read saved state, starting fresh.", e);
    return seedState();
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ---------------- helpers ---------------- */

function dateKey(d){ return d.toISOString().slice(0,10); }
function todayKey(){ return dateKey(new Date()); }

function getActiveRoom(){
  return state.rooms.find(r => r.id === state.activeRoomId) || null;
}

function entryFor(room, key){
  return room.entries.find(e => e.date === key);
}

function last7(room){
  const out = [];
  const today = new Date();
  for(let i = 6; i >= 0; i--){
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const e = entryFor(room, key);
    out.push({ date: key, kwh: e ? e.kwh : null });
  }
  return out;
}

function perCapitaAvg7(room){
  const days = last7(room).filter(d => d.kwh !== null);
  if(!days.length) return 0;
  const total = days.reduce((sum, d) => sum + d.kwh, 0);
  return total / days.length / room.roommates;
}

function weeklyTotal(room){
  return last7(room).filter(d => d.kwh !== null).reduce((s,d) => s + d.kwh, 0);
}

function currentStreak(room){
  let streak = 0;
  const today = new Date();
  for(let i = 0; i < 60; i++){
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if(entryFor(room, dateKey(d))) streak++;
    else break;
  }
  return streak;
}

function rankedRooms(){
  return [...state.rooms].sort((a,b) => perCapitaAvg7(a) - perCapitaAvg7(b));
}

function couponCode(prefix){
  return `${prefix}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
}

/* ---------------- notifications ---------------- */

function notify(title, body, tone = "default"){
  showToast(title, body, tone);
  if(state.notifyEnabled && "Notification" in window && Notification.permission === "granted"){
    try{ new Notification(title, { body, icon: undefined }); }catch(e){ /* ignore */ }
  }
}

function showToast(title, body, tone){
  const layer = document.getElementById("toastLayer");
  const el = document.createElement("div");
  el.className = "toast" + (tone === "danger" ? " danger" : tone === "leaf" ? " leaf" : "");
  el.innerHTML = `<strong>${title}</strong>${body}`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

async function toggleNotifications(){
  if(!("Notification" in window)){
    showToast("Not supported", "This browser doesn't support notifications.", "danger");
    return;
  }
  if(!state.notifyEnabled){
    const perm = await Notification.requestPermission();
    state.notifyEnabled = perm === "granted";
    if(state.notifyEnabled) notify("Alerts on", "You'll get nudges for wastage and milestones.", "leaf");
  } else {
    state.notifyEnabled = false;
    showToast("Alerts off", "You can turn these back on anytime.");
  }
  saveState();
  renderNotifyButton();
}

function renderNotifyButton(){
  const btn = document.getElementById("notifyToggle");
  btn.classList.toggle("on", !!state.notifyEnabled);
}

/* ---------------- badges / coupons ---------------- */

function awardBadge(room, id, coupon){
  if(room.badges.includes(id)) return false;
  room.badges.push(id);
  const def = BADGE_DEFS.find(b => b.id === id);
  if(coupon) room.coupons.push(coupon);
  notify(`Badge unlocked: ${def.name}`, coupon ? `${coupon.name} — code ${coupon.code}` : def.desc, "leaf");
  return true;
}

function evaluateBadges(room){
  if(room.entries.length >= 1){
    awardBadge(room, "first-log");
  }
  const today = entryFor(room, todayKey());
  if(today && (today.kwh / room.roommates) <= RULES.dailyTargetPerPerson){
    awardBadge(room, "energy-saver", {
      name: "Canteen 10% off",
      code: couponCode("CANTEEN"),
      desc: "10% off your next canteen bill"
    });
  }
  if(currentStreak(room) >= RULES.streakForBadge){
    awardBadge(room, "streak-master", {
      name: "Canteen free snack",
      code: couponCode("SNACK"),
      desc: "One free snack at the hostel canteen"
    });
  }
  const ranked = rankedRooms();
  const position = ranked.findIndex(r => r.id === room.id) + 1;
  if(position > 0 && position <= RULES.topRankForBadge){
    awardBadge(room, "eco-champion", {
      name: "Campus event pass",
      code: couponCode("EVENT"),
      desc: "Priority entry to the next campus event"
    });
  }
  if(weeklyTotal(room) / room.roommates <= RULES.weeklyTargetPerPerson && last7(room).every(d => d.kwh !== null)){
    awardBadge(room, "week-warrior", {
      name: "Campus event pass",
      code: couponCode("WEEKWIN"),
      desc: "Free entry to this week's campus event"
    });
  }
}

/* ---------------- wastage alert ---------------- */

function checkWastage(room){
  const today = entryFor(room, todayKey());
  if(!today) return null;
  const priorDays = last7(room).slice(0, -1).filter(d => d.kwh !== null);
  if(priorDays.length < 3) return null; // not enough history yet
  const avg = priorDays.reduce((s,d) => s + d.kwh, 0) / priorDays.length;
  if(avg > 0 && today.kwh > avg * RULES.wastageMultiplier){
    return { today: today.kwh, avg };
  }
  return null;
}

/* ---------------- rendering ---------------- */

function renderAll(){
  const room = getActiveRoom();
  document.getElementById("onboarding").hidden = !!room;
  document.getElementById("mainNav").hidden = !room;
  document.getElementById("topbarActions").hidden = !room;
  if(!room) return;

  renderDashboard(room);
  renderLeaderboard(room);
  renderChallenges(room);
  renderRewards(room);
  renderNotifyButton();
}

function renderDashboard(room){
  const today = entryFor(room, todayKey());
  const todayKwh = today ? today.kwh : 0;
  const perPerson = room.roommates ? todayKwh / room.roommates : 0;

  document.getElementById("roomChip").textContent = `${room.room} · ${room.roommates} people`;
  document.getElementById("todayKwh").textContent = todayKwh.toFixed(1);
  document.getElementById("perCapita").textContent = perPerson.toFixed(2);

  // gauge: map per-person kWh to the 0-100% arc
  const pct = Math.max(0, Math.min(1, perPerson / RULES.gaugeMaxPerPerson));
  const dashLen = 251; // approx path length of the arc
  document.getElementById("gaugeFill").style.strokeDashoffset = dashLen - dashLen * pct;
  document.getElementById("gaugeFill").style.stroke =
    pct > 0.85 ? "var(--danger)" : pct > 0.6 ? "var(--copper)" : "var(--current)";
  const angle = -90 + pct * 180; // -90deg (empty) to +90deg (full)
  document.getElementById("gaugeNeedle").style.transform = `rotate(${angle}deg)`;

  const ranked = rankedRooms();
  const position = ranked.findIndex(r => r.id === room.id) + 1;
  document.getElementById("rankValue").textContent = `#${position}`;
  document.getElementById("rankOf").textContent = `of ${ranked.length} rooms`;
  document.getElementById("weeklyTotal").textContent = weeklyTotal(room).toFixed(1);
  document.getElementById("streakValue").textContent = currentStreak(room);

  const top3 = ranked.slice(0,3);
  const medals = ["🥇","🥈","🥉"];
  document.getElementById("topThree").innerHTML = top3.map((r, i) => `
    <li class="${r.id === room.id ? "me" : ""}">
      <span class="medal">${medals[i]}</span>
      <span class="room-name">${escapeHtml(r.room)} — ${escapeHtml(r.name)}</span>
      <span class="kwh">${perCapitaAvg7(r).toFixed(2)} kWh/person</span>
    </li>`).join("");

  // wastage alert
  const wastage = checkWastage(room);
  const banner = document.getElementById("alertBanner");
  if(wastage){
    banner.hidden = false;
    document.getElementById("alertText").textContent =
      `Energy wastage alert: today's usage (${wastage.today.toFixed(1)} kWh) is well above your recent daily average (${wastage.avg.toFixed(1)} kWh). Turn off idle devices to stay on track.`;
  } else {
    banner.hidden = true;
  }
}

function renderLeaderboard(room){
  const ranked = rankedRooms();
  const rows = ranked.map((r, i) => {
    const avg = perCapitaAvg7(r);
    const days = last7(r).filter(d => d.kwh !== null);
    let trendClass = "trend-flat", trendIcon = "→";
    if(days.length >= 2){
      const prev = days[days.length - 2].kwh, cur = days[days.length - 1].kwh;
      if(cur < prev){ trendClass = "trend-down"; trendIcon = "↓"; }
      else if(cur > prev){ trendClass = "trend-up"; trendIcon = "↑"; }
    }
    const rankClass = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : "";
    return `
      <div class="board-row board-body-row ${r.id === room.id ? "me" : ""}">
        <span class="rank-badge ${rankClass}">#${i+1}</span>
        <span>${escapeHtml(r.room)} — ${escapeHtml(r.name)}</span>
        <span>${r.roommates}</span>
        <span class="kwh-cell">${avg.toFixed(2)}</span>
        <span class="${trendClass}">${trendIcon}</span>
      </div>`;
  }).join("");
  document.getElementById("boardBody").innerHTML = rows;
}

function renderChallenges(room){
  const today = entryFor(room, todayKey());
  const perPerson = today ? today.kwh / room.roommates : 0;
  const dailyPct = today ? Math.min(100, (RULES.dailyTargetPerPerson / Math.max(perPerson, 0.01)) * 100) : 0;
  document.getElementById("dailyDesc").textContent =
    `Keep today's usage under ${RULES.dailyTargetPerPerson} kWh per person.`;
  document.getElementById("dailyProgress").style.width = `${Math.min(100, dailyPct)}%`;
  document.getElementById("dailyStatus").textContent = today
    ? (perPerson <= RULES.dailyTargetPerPerson ? "Target met — nice work" : `${perPerson.toFixed(2)} kWh/person so far`)
    : "Log today's reading to start";

  const weeklyPerPerson = weeklyTotal(room) / room.roommates;
  const weeklyPct = Math.min(100, (weeklyPerPerson / RULES.weeklyTargetPerPerson) * 100);
  document.getElementById("weeklyDesc").textContent =
    `Keep this week's total under ${RULES.weeklyTargetPerPerson} kWh per person.`;
  document.getElementById("weeklyProgress").style.width = `${weeklyPct}%`;
  document.getElementById("weeklyProgress").style.background =
    weeklyPerPerson > RULES.weeklyTargetPerPerson
      ? "var(--danger)"
      : "linear-gradient(90deg, var(--current), var(--leaf))";
  document.getElementById("weeklyStatus").textContent =
    `${weeklyPerPerson.toFixed(1)} / ${RULES.weeklyTargetPerPerson} kWh per person used`;
}

function renderRewards(room){
  document.getElementById("badgeGrid").innerHTML = BADGE_DEFS.map(b => `
    <div class="badge ${room.badges.includes(b.id) ? "unlocked" : ""}">
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-name">${b.name}</span>
      <span class="badge-desc">${b.desc}</span>
    </div>`).join("");

  const list = document.getElementById("couponList");
  if(room.coupons.length){
    list.innerHTML = room.coupons.map(c => `
      <div class="coupon">
        <div>
          <div class="coupon-name">${escapeHtml(c.name)}</div>
          <div class="coupon-desc">${escapeHtml(c.desc)}</div>
        </div>
        <span class="coupon-code">${c.code}</span>
      </div>`).join("");
  } else {
    list.innerHTML = `<p class="muted small">No coupons yet — complete a challenge to earn one.</p>`;
  }
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[m]));
}

/* ---------------- view switching ---------------- */

function setView(view){
  document.querySelectorAll(".view").forEach(v => {
    if(v.id === "onboarding") return;
    v.hidden = v.id !== view;
  });
  document.querySelectorAll(".nav-link").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

/* ---------------- events ---------------- */

document.getElementById("profileForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("studentName").value.trim();
  const room = document.getElementById("roomNumber").value.trim();
  const roommates = Math.max(1, parseInt(document.getElementById("roommateCount").value, 10) || 1);

  const newRoom = {
    id: crypto.randomUUID(),
    name, room, roommates,
    entries: [],
    badges: [],
    coupons: []
  };
  state.rooms.push(newRoom);
  state.activeRoomId = newRoom.id;
  saveState();
  setView("dashboard");
  renderAll();
  notify("Welcome to the grid", `${room} is now live on the leaderboard.`, "leaf");
});

document.getElementById("logForm").addEventListener("submit", e => {
  e.preventDefault();
  const room = getActiveRoom();
  if(!room) return;
  const input = document.getElementById("kwhInput");
  const val = parseFloat(input.value);
  if(isNaN(val) || val < 0) return;

  const key = todayKey();
  const existing = entryFor(room, key);
  if(existing) existing.kwh = val;
  else room.entries.push({ date: key, kwh: val });

  input.value = "";
  evaluateBadges(room);
  saveState();
  renderAll();

  const wastage = checkWastage(room);
  if(wastage){
    notify(
      "Energy wastage detected",
      `Today's ${wastage.today.toFixed(1)} kWh is above your usual ${wastage.avg.toFixed(1)} kWh — check for devices left on.`,
      "danger"
    );
  } else {
    notify("Reading logged", `${val.toFixed(1)} kWh recorded for today. Keep it up!`, "leaf");
  }
});

document.getElementById("alertDismiss").addEventListener("click", () => {
  document.getElementById("alertBanner").hidden = true;
});

document.getElementById("notifyToggle").addEventListener("click", toggleNotifications);

document.getElementById("switchRoomBtn").addEventListener("click", () => {
  state.activeRoomId = null;
  saveState();
  renderAll();
});

document.querySelectorAll("[data-view]").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

/* ---------------- init ---------------- */

renderAll();
if(getActiveRoom()) setView("dashboard");

// Light motivational nudge on load, once per session, if a room exists.
if(getActiveRoom() && !sessionStorage.getItem("wattwatch_greeted")){
  sessionStorage.setItem("wattwatch_greeted", "1");
  const room = getActiveRoom();
  const ranked = rankedRooms();
  const position = ranked.findIndex(r => r.id === room.id) + 1;
  notify("Welcome back", `You're currently rank #${position} of ${ranked.length}. Log today's reading to stay on the board.`);
}
