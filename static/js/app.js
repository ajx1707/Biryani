// The Madras Biryani - Customer Frontend Logic

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const btnMinus = document.getElementById("btnMinus");
  const btnPlus = document.getElementById("btnPlus");
  const qtyDisplay = document.getElementById("qtyDisplay");
  const subtotalDisplay = document.getElementById("subtotalDisplay");
  const btnSubtotal = document.getElementById("btnSubtotal");
  const unitPriceEl = document.getElementById("unitPrice");
  const unitPrice = parseInt(unitPriceEl ? unitPriceEl.textContent : "150", 10) || 150;

  let currentQty = 1;

  // Quantity Controls
  function updateTotals() {
    qtyDisplay.textContent = currentQty;
    const total = currentQty * unitPrice;
    subtotalDisplay.textContent = `₹${total}`;
    if (btnSubtotal) {
      btnSubtotal.textContent = `₹${total}`;
    }
  }

  if (btnMinus) {
    btnMinus.addEventListener("click", () => {
      if (currentQty > 1) {
        currentQty -= 1;
        updateTotals();
      }
    });
  }

  if (btnPlus) {
    btnPlus.addEventListener("click", () => {
      if (currentQty < 20) {
        currentQty += 1;
        updateTotals();
      } else {
        alert("For bulk hostel orders over 20 packs, please contact the kitchen directly!");
      }
    });
  }

  // Modals
  const confirmModal = document.getElementById("confirmModal");
  const successModal = document.getElementById("successModal");
  const closeConfirmModal = document.getElementById("closeConfirmModal");
  const btnEditOrder = document.getElementById("btnEditOrder");
  const btnFinalPlaceOrder = document.getElementById("btnFinalPlaceOrder");
  const btnCloseSuccessModal = document.getElementById("btnCloseSuccessModal");
  const orderSpinner = document.getElementById("orderSpinner");

  // Form Fields
  const orderForm = document.getElementById("orderForm");
  const custName = document.getElementById("custName");
  const custPhone = document.getElementById("custPhone");
  const custHostel = document.getElementById("custHostel");
  const custRoom = document.getElementById("custRoom");
  const custNotes = document.getElementById("custNotes");
  const submitOrderBtn = document.getElementById("submitOrderBtn");

  // State to store pending order payload
  let pendingOrderPayload = null;
  let latestPlacedOrder = null;

  // Open Confirm Modal on Form Submit
  if (orderForm) {
    orderForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = custName.value.trim();
      const phone = custPhone.value.trim();
      const hostel = custHostel.value;

      // Quick validation
      if (!name) {
        alert("Please enter your name.");
        custName.focus();
        return;
      }
      if (!phone || phone.length < 10) {
        alert("Please enter a valid 10-digit mobile number so the rider can call you.");
        custPhone.focus();
        return;
      }
      if (!hostel) {
        alert("Please choose your hostel from the dropdown.");
        custHostel.focus();
        return;
      }

      pendingOrderPayload = {
        name,
        phone,
        hostel,
        room: "",
        notes: "",
        quantity: currentQty
      };

      // Populate confirmation preview
      document.getElementById("cfmItemTitle").textContent = "Signature Chicken Dum Biryani (500g)";
      document.getElementById("cfmQuantity").textContent = `${currentQty} portion${currentQty > 1 ? "s" : ""} (₹${unitPrice} each)`;
      document.getElementById("cfmName").textContent = name;
      document.getElementById("cfmPhone").textContent = `+91 ${phone}`;
      document.getElementById("cfmAddress").textContent = hostel;
      
      const notesRow = document.getElementById("cfmNotesRow");
      if (notesRow) {
        notesRow.style.display = "none";
      }

      document.getElementById("cfmTotalPrice").textContent = `₹${currentQty * unitPrice}`;

      // Open Modal
      confirmModal.classList.remove("hidden");
    });
  }

  // Close Confirm Modal
  function hideConfirmModal() {
    confirmModal.classList.add("hidden");
  }

  if (closeConfirmModal) closeConfirmModal.addEventListener("click", hideConfirmModal);
  if (btnEditOrder) btnEditOrder.addEventListener("click", hideConfirmModal);

  // Final Order Submission
  if (btnFinalPlaceOrder) {
    btnFinalPlaceOrder.addEventListener("click", async () => {
      if (!pendingOrderPayload) return;

      btnFinalPlaceOrder.disabled = true;
      if (orderSpinner) orderSpinner.classList.remove("hidden");

      try {
        const response = await fetch("/api/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingOrderPayload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
          latestPlacedOrder = result.order;
          hideConfirmModal();
          showSuccessAndReceipt(latestPlacedOrder);
          // Reset form
          orderForm.reset();
          currentQty = 1;
          updateTotals();
        } else {
          alert(result.error || "Failed to place order. The shop may be currently closed.");
          hideConfirmModal();
          checkLiveShopStatus();
        }
      } catch (err) {
        console.error(err);
        alert("Network error: Could not reach the server. Please try again.");
      } finally {
        btnFinalPlaceOrder.disabled = false;
        if (orderSpinner) orderSpinner.classList.add("hidden");
      }
    });
  }

  // Render Receipt and Open Success Modal
  function showSuccessAndReceipt(order) {
    document.getElementById("successOrderCode").textContent = `#${order.order_code}`;
    document.getElementById("rcptCode").textContent = `#${order.order_code}`;
    document.getElementById("rcptDate").textContent = order.created_at || new Date().toLocaleString();
    document.getElementById("rcptCustName").textContent = order.customer_name;
    document.getElementById("rcptCustPhone").textContent = `+91 ${order.phone}`;
    document.getElementById("rcptCustLocation").textContent = order.hostel;

    document.getElementById("rcptTableQty").textContent = order.quantity;
    document.getElementById("rcptTableRate").textContent = `₹${order.unit_price}`;
    document.getElementById("rcptTableTotal").textContent = `₹${order.total_price}`;
    document.getElementById("rcptSubtotal").textContent = `₹${order.total_price}`;
    document.getElementById("rcptGrandTotal").textContent = `₹${order.total_price}`;

    successModal.classList.remove("hidden");
  }

  if (btnCloseSuccessModal) {
    btnCloseSuccessModal.addEventListener("click", () => {
      successModal.classList.add("hidden");
    });
  }

  // Download Receipt directly as PDF
  const btnDownloadReceipt = document.getElementById("btnDownloadReceipt");
  if (btnDownloadReceipt) {
    btnDownloadReceipt.addEventListener("click", async () => {
      const receiptCard = document.querySelector("#receiptPrintableArea .receipt-card") || document.getElementById("receiptPrintableArea");
      if (!receiptCard) return;

      const originalHtml = btnDownloadReceipt.innerHTML;
      btnDownloadReceipt.innerHTML = `
        <span class="spinner" style="border-top-color:#fff; width:16px; height:16px; margin-right:8px; display:inline-block;"></span>
        Generating PDF...
      `;
      btnDownloadReceipt.disabled = true;

      try {
        if (window.html2canvas) {
          const canvas = await window.html2canvas(receiptCard, {
            scale: 3,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false
          });

          const imgData = canvas.toDataURL("image/jpeg", 0.98);
          const jsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;

          if (jsPDFConstructor) {
            // High-resolution clean receipt document (105mm standard width)
            const pdfWidth = 105;
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            const doc = new jsPDFConstructor({
              orientation: "portrait",
              unit: "mm",
              format: [pdfWidth, pdfHeight + 8]
            });

            doc.addImage(imgData, "JPEG", 0, 4, pdfWidth, pdfHeight);
            const code = (latestPlacedOrder && latestPlacedOrder.order_code) ? latestPlacedOrder.order_code : "MB-Receipt";
            doc.save(`TheMadrasBiryani_Receipt_${code}.pdf`);
          } else {
            window.print();
          }
        } else {
          window.print();
        }
      } catch (err) {
        console.error("PDF generation error:", err);
        window.print();
      } finally {
        btnDownloadReceipt.disabled = false;
        btnDownloadReceipt.innerHTML = originalHtml;
      }
    });
  }

  // Live Shop Status Checking (Quiet, no obtrusive banner when open)
  async function checkLiveShopStatus() {
    try {
      const res = await fetch("/api/shop-status");
      const data = await res.json();
      const closedAlert = document.getElementById("closedAlert");
      const btnText = submitOrderBtn ? submitOrderBtn.querySelector(".btn-text") : null;

      if (data.is_open) {
        if (submitOrderBtn) {
          submitOrderBtn.disabled = false;
          submitOrderBtn.classList.remove("disabled");
          if (btnText) btnText.textContent = "Review & Place Order";
        }
        if (closedAlert) {
          closedAlert.classList.add("hidden");
        }
      } else {
        if (submitOrderBtn) {
          submitOrderBtn.disabled = true;
          submitOrderBtn.classList.add("disabled");
          if (btnText) btnText.textContent = "Store Currently Closed";
        }
        if (closedAlert) {
          closedAlert.textContent = `⚠️ Orders currently paused (${data.timing_display || "7:00 PM – 1:00 AM"}). Please check back soon!`;
          closedAlert.classList.remove("hidden");
        }
      }
    } catch (e) {
      console.log("Status check:", e);
    }
  }

  // Initial check & interval
  checkLiveShopStatus();
  setInterval(checkLiveShopStatus, 45000); // Check every 45 seconds
});
