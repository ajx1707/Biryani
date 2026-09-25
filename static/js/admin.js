// The Madras Biryani - Kitchen Admin Portal Logic

document.addEventListener("DOMContentLoaded", () => {
  // Navigation Tabs
  const navTabs = document.querySelectorAll(".nav-tab");
  const tabContents = document.querySelectorAll(".tab-content");

  let activeTabName = "tabLive";
  let knownActiveOrderIds = new Set();
  let soundEnabled = true;
  let audioContext = null;

  // Initialize Web Audio synth for crisp notification chime (zero external dependencies)
  function playOrderChime() {
    if (!soundEnabled) return;
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, audioContext.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.65);
    } catch (e) {
      console.log("Audio alert playback:", e);
    }
  }

  // Sound Toggle Button
  const btnAudioToggle = document.getElementById("btnAudioToggle");
  const soundText = document.getElementById("soundText");

  if (btnAudioToggle) {
    btnAudioToggle.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      if (soundEnabled) {
        btnAudioToggle.classList.remove("muted");
        if (soundText) soundText.textContent = "Sound ON";
        playOrderChime();
      } else {
        btnAudioToggle.classList.add("muted");
        if (soundText) soundText.textContent = "Sound OFF";
      }
    });
  }

  // Switch Tab
  function switchTab(targetTabId) {
    activeTabName = targetTabId;
    navTabs.forEach(tab => {
      if (tab.getAttribute("data-tab") === targetTabId) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });

    tabContents.forEach(content => {
      if (content.id === targetTabId) {
        content.classList.add("active");
      } else {
        content.classList.remove("active");
      }
    });

    // Trigger tab specific refresh
    if (targetTabId === "tabLive") fetchLiveOrders();
    if (targetTabId === "tabToday") fetchTodayCompleted();
    if (targetTabId === "tabTotal") fetchAllOrders();
    if (targetTabId === "tabSettings") fetchSettings();
  }

  navTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      switchTab(tab.getAttribute("data-tab"));
    });
  });

  // Time formatter helper
  function timeAgo(dateString) {
    if (!dateString) return "";
    const placed = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now - placed) / 1000);
    if (isNaN(diffSec) || diffSec < 0) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  }

  // -------------------------------------------------------------
  // TAB 1: LIVE ORDERS
  // -------------------------------------------------------------
  const liveContainer = document.getElementById("liveOrdersContainer");
  const liveBadge = document.getElementById("liveCountBadge");
  const btnRefreshActive = document.getElementById("btnRefreshActive");

  async function fetchLiveOrders() {
    try {
      const res = await fetch("/api/admin/orders/active");
      const data = await res.json();
      if (!data.success) return;

      const orders = data.orders || [];
      if (liveBadge) liveBadge.textContent = orders.length;

      // Sync Top Metric Card
      const topLiveCount = document.getElementById("topLiveCount");
      if (topLiveCount) topLiveCount.textContent = orders.length;

      // Check for incoming new orders to chime
      let hasBrandNew = false;
      const currentIds = new Set();
      orders.forEach(o => {
        currentIds.add(o.id);
        if (knownActiveOrderIds.size > 0 && !knownActiveOrderIds.has(o.id)) {
          hasBrandNew = true;
        }
      });
      knownActiveOrderIds = currentIds;

      if (hasBrandNew) {
        playOrderChime();
      }

      renderLiveOrders(orders);
    } catch (err) {
      console.error("Live orders error:", err);
    }
  }

  function renderLiveOrders(orders) {
    if (!liveContainer) return;
    if (orders.length === 0) {
      liveContainer.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3 class="empty-title">Queue is clear</h3>
          <p class="empty-desc">No active orders waiting for dispatch. New campus orders will sound an alert automatically.</p>
        </div>
      `;
      return;
    }

    orders.forEach(o => activeOrdersCache.set(o.id, o));

    liveContainer.innerHTML = orders.map(o => {
      const waText = encodeURIComponent(
        `Hi ${o.customer_name}! Your Madras Biryani order #${o.order_code} (${o.quantity} pack) for ${o.hostel} is being prepared fresh. Arriving soon!`
      );
      const placedAgo = o.created_at_raw ? timeAgo(o.created_at_raw) : (o.created_at || "Just now");
      const packLabel = o.quantity === 1 ? 'PACK' : 'PACKS';
      const paymentMethod = (o.payment_method || 'Cash / UPI').toUpperCase();

      return `
        <div class="order-card-live" id="order-card-${o.id}">
          <!-- Top Row: ID, Pulse Indicator, Timestamp -->
          <div class="card-top-row">
            <div class="card-code-status">
              <span class="order-code-tag">#${o.order_code}</span>
              <span class="order-status-badge">
                <span class="live-dot-pulse"></span> ACTIVE
              </span>
            </div>
            <div class="card-time-group" title="${o.created_at || ''}">
              <span class="order-relative-time">${placedAgo}</span>
            </div>
          </div>

          <!-- Quantity & Item Highlight Banner (Crystal clear for kitchen) -->
          <div class="order-pack-banner">
            <div class="pack-qty-badge">
              <span class="qty-num">${o.quantity}</span>
              <span class="qty-unit">${packLabel}</span>
            </div>
            <div class="pack-details-col">
              <div class="pack-item-name">Chicken Dum Biryani (500g)</div>
              <div class="pack-meta-row">
                <span class="pack-price">₹${o.total_price}</span>
                <span class="meta-dot">•</span>
                <span class="pack-payment">${paymentMethod}</span>
              </div>
            </div>
          </div>

          <!-- Structured Destination & Customer Grid -->
          <div class="order-dispatch-details">
            <div class="dispatch-col hostel-col">
              <span class="dispatch-label">DELIVER TO / HOSTEL</span>
              <div class="dispatch-val">
                <span class="hostel-name-text">${o.hostel}</span>
                ${o.room_number ? `<span class="room-pill">Room ${o.room_number}</span>` : ''}
              </div>
            </div>
            <div class="dispatch-col student-col">
              <span class="dispatch-label">STUDENT NAME</span>
              <div class="dispatch-val">
                <span class="student-name-text">${o.customer_name}</span>
              </div>
            </div>
          </div>

          <!-- Quick Contact Actions -->
          <div class="contact-actions-strip">
            <a href="tel:${o.phone}" class="quick-contact-btn btn-call" title="Call ${o.phone}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
              <span>Call ${o.phone}</span>
            </a>
            <a href="https://wa.me/91${o.phone}?text=${waText}" target="_blank" class="quick-contact-btn btn-wa" title="Chat on WhatsApp">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
              <span>WhatsApp</span>
            </a>
          </div>

          <!-- Special Instructions Note -->
          ${o.notes ? `
            <div class="order-kitchen-note">
              <span class="note-pill">NOTE</span>
              <span class="note-text">"${o.notes}"</span>
            </div>
          ` : ""}

          <!-- Card Actions -->
          <div class="card-actions-row">
            <button type="button" class="btn-complete-order" onclick="window.promptCompleteOrder(${o.id})">
              Mark Completed
            </button>
            <button type="button" class="btn-cancel-order" onclick="window.cancelOrder(${o.id})">
              Cancel
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  // -------------------------------------------------------------
  // Order Completion Confirmation Modal Handling
  // -------------------------------------------------------------
  const activeOrdersCache = new Map();
  const completeModal = document.getElementById("completeConfirmModal");
  const modalCompleteOrderCode = document.getElementById("modalCompleteOrderCode");
  const modalCompleteCustName = document.getElementById("modalCompleteCustName");
  const modalCompleteLocation = document.getElementById("modalCompleteLocation");
  const modalCompleteItems = document.getElementById("modalCompleteItems");
  const modalCompleteTotal = document.getElementById("modalCompleteTotal");
  const btnCloseCompleteModal = document.getElementById("btnCloseCompleteModal");
  const btnCancelCompleteModal = document.getElementById("btnCancelCompleteModal");
  const btnConfirmCompleteAction = document.getElementById("btnConfirmCompleteAction");

  let pendingCompleteOrderId = null;

  function hideCompleteModal() {
    pendingCompleteOrderId = null;
    if (completeModal) completeModal.classList.add("hidden");
    if (btnConfirmCompleteAction) {
      btnConfirmCompleteAction.disabled = false;
      btnConfirmCompleteAction.textContent = "Yes, Mark Completed";
    }
  }

  if (btnCloseCompleteModal) btnCloseCompleteModal.addEventListener("click", hideCompleteModal);
  if (btnCancelCompleteModal) btnCancelCompleteModal.addEventListener("click", hideCompleteModal);
  if (completeModal) {
    completeModal.addEventListener("click", (e) => {
      if (e.target === completeModal) hideCompleteModal();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && completeModal && !completeModal.classList.contains("hidden")) {
      hideCompleteModal();
    }
  });

  // Prompt Confirmation Popup
  window.promptCompleteOrder = function(orderId) {
    pendingCompleteOrderId = orderId;
    const order = activeOrdersCache.get(orderId);

    if (order) {
      const loc = order.room_number ? `${order.hostel} (Room ${order.room_number})` : (order.hostel || "-");
      const packText = order.quantity === 1 ? '1 pack' : `${order.quantity} packs`;
      if (modalCompleteOrderCode) modalCompleteOrderCode.textContent = `Complete Order #${order.order_code}`;
      if (modalCompleteCustName) modalCompleteCustName.textContent = order.customer_name || "-";
      if (modalCompleteLocation) modalCompleteLocation.textContent = loc;
      if (modalCompleteItems) modalCompleteItems.textContent = `${packText} • Chicken Dum Biryani (500g)`;
      if (modalCompleteTotal) modalCompleteTotal.textContent = `₹${order.total_price}`;
    } else {
      if (modalCompleteOrderCode) modalCompleteOrderCode.textContent = "Complete Order";
      if (modalCompleteCustName) modalCompleteCustName.textContent = "Order #" + orderId;
      if (modalCompleteLocation) modalCompleteLocation.textContent = "-";
      if (modalCompleteItems) modalCompleteItems.textContent = "-";
      if (modalCompleteTotal) modalCompleteTotal.textContent = "-";
    }

    if (completeModal) completeModal.classList.remove("hidden");
  };

  // Alias for backward-compatibility
  window.markOrderCompleted = window.promptCompleteOrder;

  // Confirm Completion Execution
  if (btnConfirmCompleteAction) {
    btnConfirmCompleteAction.addEventListener("click", async () => {
      if (!pendingCompleteOrderId) return;
      const orderId = pendingCompleteOrderId;
      const card = document.getElementById(`order-card-${orderId}`);

      btnConfirmCompleteAction.disabled = true;
      btnConfirmCompleteAction.textContent = "Completing...";

      try {
        const res = await fetch(`/api/admin/orders/${orderId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" })
        });
        const data = await res.json();
        if (data.success) {
          hideCompleteModal();
          if (card) card.remove();
          activeOrdersCache.delete(orderId);
          fetchLiveOrders();
          fetchTodayCompleted(); // update today's metrics
        } else {
          alert(data.error || "Failed to update order");
          hideCompleteModal();
        }
      } catch (e) {
        console.error("Order completion error:", e);
        alert("Network error: Could not reach the server.");
        hideCompleteModal();
      }
    });
  }

  window.cancelOrder = async function(orderId) {
    if (!confirm("Are you sure you want to cancel this order?")) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" })
      });
      const data = await res.json();
      if (data.success) {
        fetchLiveOrders();
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (btnRefreshActive) btnRefreshActive.addEventListener("click", fetchLiveOrders);


  // -------------------------------------------------------------
  // TAB 2: COMPLETED TODAY
  // -------------------------------------------------------------
  const kpiTodayRevenue = document.getElementById("kpiTodayRevenue");
  const kpiTodayOrders = document.getElementById("kpiTodayOrders");
  const kpiTodayPortions = document.getElementById("kpiTodayPortions");
  const kpiTodayWeight = document.getElementById("kpiTodayWeight");
  const todayBadge = document.getElementById("todayCountBadge");
  const todayTableBody = document.getElementById("todayOrdersTableBody");
  const todayEmptyState = document.getElementById("todayEmptyState");
  const btnRefreshToday = document.getElementById("btnRefreshToday");
  const todayDateSubtitle = document.getElementById("todayDateSubtitle");

  async function fetchTodayCompleted() {
    try {
      const res = await fetch("/api/admin/orders/completed-today");
      const data = await res.json();
      if (!data.success) return;

      if (todayDateSubtitle && data.date) {
        todayDateSubtitle.textContent = `Orders completed on ${data.date}. Automatically resets at midnight for the new day.`;
      }

      if (kpiTodayRevenue) kpiTodayRevenue.textContent = (data.revenue || 0).toLocaleString("en-IN");
      if (kpiTodayOrders) kpiTodayOrders.textContent = data.orders_count || 0;
      if (kpiTodayPortions) kpiTodayPortions.textContent = data.portions_count || 0;
      if (kpiTodayWeight) {
        const kg = ((data.portions_count || 0) * 0.5).toFixed(1);
        kpiTodayWeight.textContent = `${kg} kg biryani fulfilled`;
      }

      // Sync Top Metrics Strip
      const topTodayRev = document.getElementById("topTodayRevenue");
      if (topTodayRev) topTodayRev.textContent = (data.revenue || 0).toLocaleString("en-IN");
      const topTodayOrd = document.getElementById("topTodayOrders");
      if (topTodayOrd) topTodayOrd.textContent = data.orders_count || 0;
      const topTodayPort = document.getElementById("topTodayPortions");
      if (topTodayPort) topTodayPort.textContent = data.portions_count || 0;

      if (todayBadge) todayBadge.textContent = data.orders_count || 0;

      const orders = data.orders || [];
      if (orders.length === 0) {
        todayTableBody.innerHTML = "";
        todayEmptyState.classList.remove("hidden");
      } else {
        todayEmptyState.classList.add("hidden");
        todayTableBody.innerHTML = orders.map(o => `
          <tr>
            <td><strong>#${o.order_code}</strong></td>
            <td>${o.created_at}</td>
            <td>${o.completed_at || "-"}</td>
            <td><strong>${o.customer_name}</strong><br><small style="color:var(--text-muted)">${o.phone}</small></td>
            <td>${o.hostel}</td>
            <td><strong>${o.quantity}</strong></td>
            <td><strong>₹${o.total_price}</strong></td>
            <td><span class="status-chip chip-completed">Completed</span></td>
          </tr>
        `).join("");
      }
    } catch (err) {
      console.error("Today completed error:", err);
    }
  }

  if (btnRefreshToday) btnRefreshToday.addEventListener("click", fetchTodayCompleted);


  // -------------------------------------------------------------
  // TAB 3: TOTAL ORDERS & ANALYTICS
  // -------------------------------------------------------------
  let currentPeriod = "all";
  const filterPills = document.querySelectorAll(".pill-filter");
  const searchInput = document.getElementById("orderSearchInput");
  const allTableBody = document.getElementById("allOrdersTableBody");
  const allEmptyState = document.getElementById("allEmptyState");

  const filteredRev = document.getElementById("filteredRev");
  const filteredCount = document.getElementById("filteredCount");
  const filteredPortions = document.getElementById("filteredPortions");
  const filteredAov = document.getElementById("filteredAov");

  filterPills.forEach(pill => {
    pill.addEventListener("click", () => {
      filterPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      currentPeriod = pill.getAttribute("data-period");
      fetchAllOrders();
    });
  });

  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchAllOrders, 300);
    });
  }

  async function fetchAllOrders() {
    try {
      const search = searchInput ? searchInput.value.trim() : "";
      const res = await fetch(`/api/admin/orders/all?filter=${currentPeriod}&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (!data.success) return;

      filteredRev.textContent = `₹${(data.total_revenue || 0).toLocaleString("en-IN")}`;
      filteredCount.textContent = data.total_orders || 0;
      filteredPortions.textContent = data.total_portions || 0;
      filteredAov.textContent = `₹${data.aov || 0}`;

      const orders = data.orders || [];
      if (orders.length === 0) {
        allTableBody.innerHTML = "";
        allEmptyState.classList.remove("hidden");
      } else {
        allEmptyState.classList.add("hidden");
        allTableBody.innerHTML = orders.map(o => {
          let chipClass = "chip-pending";
          if (o.status === "completed") chipClass = "chip-completed";
          if (o.status === "cancelled") chipClass = "chip-cancelled";

          return `
            <tr>
              <td><strong>#${o.order_code}</strong></td>
              <td>${o.created_at}</td>
              <td><strong>${o.customer_name}</strong><br><small style="color:var(--text-muted)">${o.phone}</small></td>
              <td>${o.hostel}</td>
              <td>${o.quantity}</td>
              <td><strong>₹${o.total_price}</strong></td>
              <td><small>${o.payment_method}</small></td>
              <td><span class="status-chip ${chipClass}">${o.status}</span></td>
              <td>
                <a href="/receipt/${o.order_code}" target="_blank" style="color:#FFF; text-decoration:none; font-family:var(--font-mono); font-size:0.75rem; border:1px solid #27272A; padding:3px 8px; border-radius:4px;">Receipt ↗</a>
              </td>
            </tr>
          `;
        }).join("");
      }
    } catch (e) {
      console.error("All orders error:", e);
    }
  }


  // -------------------------------------------------------------
  // TAB 4: SHOP TIMINGS & SETTINGS
  // -------------------------------------------------------------
  const hdrShopPill = document.getElementById("hdrShopPill");
  const hdrShopStatusText = document.getElementById("hdrShopStatusText");
  const currentStatusBadge = document.getElementById("currentStatusBadge");
  const currentStatusHint = document.getElementById("currentStatusHint");
  const btnToggleMasterShop = document.getElementById("btnToggleMasterShop");

  const setOpeningTime = document.getElementById("setOpeningTime");
  const setClosingTime = document.getElementById("setClosingTime");
  const setCustomBanner = document.getElementById("setCustomBanner");
  const setItemPrice = document.getElementById("setItemPrice");
  const setShopPhone = document.getElementById("setShopPhone");
  const hostelsTagList = document.getElementById("hostelsTagList");
  const newHostelInput = document.getElementById("newHostelInput");
  const btnAddHostel = document.getElementById("btnAddHostel");

  let currentSettings = null;

  async function fetchSettings() {
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (!data.success) return;

      currentSettings = data;
      updateSettingsUI(data);
    } catch (e) {
      console.error("Settings error:", e);
    }
  }

  function updateSettingsUI(data) {
    // Header pill
    if (data.status.is_open) {
      hdrShopPill.className = "shop-pill pill-open";
      hdrShopStatusText.textContent = `Open (${data.status.timing_display})`;
    } else {
      hdrShopPill.className = "shop-pill pill-closed";
      hdrShopStatusText.textContent = "Closed";
    }

    // Master Toggle Button
    if (data.is_shop_open_manual) {
      currentStatusBadge.className = "status-badge-lg badge-open";
      currentStatusBadge.textContent = "● SHOP IS CURRENTLY ACTIVE / ACCEPTING ORDERS";
      currentStatusHint.textContent = `Accepting campus orders during ${data.status.timing_display}.`;
      btnToggleMasterShop.className = "btn-toggle-switch btn-close-shop";
      btnToggleMasterShop.textContent = "Close Shop Entirely";
    } else {
      currentStatusBadge.className = "status-badge-lg badge-closed";
      currentStatusBadge.textContent = "○ SHOP IS MANUALLY PAUSED (ALL ORDERS BLOCKED)";
      currentStatusHint.textContent = "Store is paused. Customers see an offline notification.";
      btnToggleMasterShop.className = "btn-toggle-switch btn-open-shop";
      btnToggleMasterShop.textContent = "Re-Open Shop Online";
    }

    // Sync Cadence Metric
    const topCadence = document.getElementById("topCadence");
    if (topCadence && data.opening_time && data.closing_time) {
      topCadence.textContent = `${data.opening_time} / ${data.closing_time}`;
    }

    if (setOpeningTime) setOpeningTime.value = data.opening_time || "19:00";
    if (setClosingTime) setClosingTime.value = data.closing_time || "01:00";
    if (setCustomBanner) setCustomBanner.value = data.custom_banner || "";
    if (setItemPrice) setItemPrice.value = data.item_price || 150;
    if (setShopPhone) setShopPhone.value = data.shop_phone || "";

    // Hostels List
    renderHostelsTags(data.hostels || []);
  }

  function renderHostelsTags(hostels) {
    if (!hostelsTagList) return;
    hostelsTagList.innerHTML = hostels.map((h, idx) => `
      <span class="hostel-tag">
        ${h}
        <button type="button" class="remove-hostel-btn" onclick="window.removeHostel(${idx})">&times;</button>
      </span>
    `).join("");
  }

  window.removeHostel = async function(idx) {
    if (!currentSettings || !currentSettings.hostels) return;
    currentSettings.hostels.splice(idx, 1);
    await saveSettingsPayload({ hostels: currentSettings.hostels });
    fetchSettings();
  };

  if (btnAddHostel && newHostelInput) {
    btnAddHostel.addEventListener("click", async () => {
      const val = newHostelInput.value.trim();
      if (!val) return;
      if (!currentSettings.hostels) currentSettings.hostels = [];
      currentSettings.hostels.push(val);
      newHostelInput.value = "";
      await saveSettingsPayload({ hostels: currentSettings.hostels });
      fetchSettings();
    });
  }

  // Toggle Master Switch
  if (btnToggleMasterShop) {
    btnToggleMasterShop.addEventListener("click", async () => {
      const nextState = !currentSettings.is_shop_open_manual;
      const confirmMsg = nextState 
        ? "Are you sure you want to RE-OPEN the shop for student orders?"
        : "Are you sure you want to CLOSE the shop? No students will be able to order.";
      if (!confirm(confirmMsg)) return;

      await saveSettingsPayload({ is_shop_open_manual: nextState });
      fetchSettings();
    });
  }

  // Save Timings
  const timingsForm = document.getElementById("timingsForm");
  if (timingsForm) {
    timingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveSettingsPayload({
        opening_time: setOpeningTime.value,
        closing_time: setClosingTime.value,
        custom_banner: setCustomBanner.value
      });
      alert("Timings and banner saved successfully!");
      fetchSettings();
    });
  }

  // Save Pricing
  const pricingForm = document.getElementById("pricingForm");
  if (pricingForm) {
    pricingForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveSettingsPayload({
        item_price: parseInt(setItemPrice.value, 10),
        shop_phone: setShopPhone.value
      });
      alert("Pricing & helpline phone saved successfully!");
      fetchSettings();
    });
  }

  async function saveSettingsPayload(payload) {
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (e) {
      console.error(e);
      alert("Failed to save settings: " + e.message);
    }
  }

  // Password Change Form
  const passwordForm = document.getElementById("passwordForm");
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmNewPasswordInput = document.getElementById("confirmNewPassword");
  const passwordAlert = document.getElementById("passwordAlert");
  const btnChangePassword = document.getElementById("btnChangePassword");

  if (passwordForm) {
    passwordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const current_password = currentPasswordInput.value.trim();
      const new_password = newPasswordInput.value.trim();
      const confirm_password = confirmNewPasswordInput.value.trim();

      if (!current_password || !new_password) return;

      if (new_password !== confirm_password) {
        showPasswordAlert("New passwords do not match.", false);
        return;
      }

      if (new_password.length < 4) {
        showPasswordAlert("New password must be at least 4 characters.", false);
        return;
      }

      btnChangePassword.disabled = true;
      btnChangePassword.textContent = "Updating...";

      try {
        const res = await fetch("/api/admin/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_password, new_password })
        });
        const data = await res.json();
        if (data.success) {
          showPasswordAlert("Password updated successfully!", true);
          passwordForm.reset();
        } else {
          showPasswordAlert(data.error || "Failed to update password.", false);
        }
      } catch (err) {
        showPasswordAlert("Network error. Please try again.", false);
      } finally {
        btnChangePassword.disabled = false;
        btnChangePassword.textContent = "Update Password";
      }
    });
  }

  function showPasswordAlert(msg, isSuccess) {
    if (!passwordAlert) return;
    passwordAlert.textContent = msg;
    passwordAlert.classList.remove("hidden");
    if (isSuccess) {
      passwordAlert.style.background = "rgba(16, 185, 129, 0.1)";
      passwordAlert.style.border = "1px solid rgba(16, 185, 129, 0.3)";
      passwordAlert.style.color = "#34D399";
    } else {
      passwordAlert.style.background = "rgba(239, 68, 68, 0.1)";
      passwordAlert.style.border = "1px solid rgba(239, 68, 68, 0.3)";
      passwordAlert.style.color = "#F87171";
    }
  }

  // Initial Data Fetch
  fetchLiveOrders();
  fetchTodayCompleted();
  fetchSettings();

  // Poll live orders every 8 seconds for new campus orders
  setInterval(() => {
    if (activeTabName === "tabLive") {
      fetchLiveOrders();
    }
  }, 8000);
});
