// src/pages/POSApp.jsx

import { useState, useEffect } from "react";
import { setPwaManifest, setLegacyPwaManifest } from "../lib/pwaManifest.js";
import { registerServiceWorker } from "../lib/registerServiceWorker.js";
import SalonBrandmark from "../components/SalonBrandmark";
import GoldBtn from "../components/GoldBtn";
import MpesaInstructions from "../components/MpesaInstructions";
import Receipt from "../components/Receipt";
import Dashboard from "./Dashboard";
import ExpensesPage from "./ExpensesPage.jsx";
import CalendarView from "./CalendarView.jsx";
import SalonSettingsPage from "./SalonSettingsPage.jsx";
import SetupChecklist from "../components/SetupChecklist.jsx";
import LoyaltyBadge from "../components/LoyaltyBadge.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import FeedbackModal from "../components/FeedbackModal.jsx";
import ReviewsPage from "./ReviewsPage.jsx";
import ShareBookingPanel from "../components/ShareBookingPanel.jsx";
import TomorrowReminders from "../components/TomorrowReminders.jsx";
import BirthdayReminders from "../components/BirthdayReminders.jsx";
import CampaignEditorCard from "../components/CampaignEditorCard.jsx";
import { db, offlineQueue, syncOfflineQueue } from "../lib/db.js";
import { fmt, todayStr, nowTime } from "../lib/utils.js";
import { useSalon, fetchPublicSalonBranding } from "../lib/SalonContext";
import { getValidAccessToken } from "../lib/deviceAuth";
import { lighten, darken } from "../lib/colorUtils";
import {
  CATS,
  BLACK, GOLD, GOLD_LT, GOLD_DIM, CREAM, DARK, WHITE,
  GREEN, RED, AMBER, MPESA_GREEN,
  SUPABASE_URL, SUPABASE_KEY,
} from "../lib/constants.js";

export default function POSApp({ onLogout, userRole }) {
  userRole = userRole || "staff";
  var isAdmin = userRole === "admin";

  // This component also renders on the legacy unprefixed /pos route,
  // which has no SalonGate at all — same gap LoginPage.jsx had. Mirror
  // the same fallback: an independent, cosmetic-only lookup when there's
  // no SalonGate-provided salon. Only used for the header strip below;
  // the rest of this file's GOLD/DARK usage is deliberately untouched
  // (see project decision: identity-only scope, not full app theming).
  var contextSalon = useSalon();

  var legacyBrandingState = useState(null);
  var legacyBranding = legacyBrandingState[0]; var setLegacyBranding = legacyBrandingState[1];

  useEffect(function() {
    if (contextSalon) return;
    var cancelled = false;
    fetchPublicSalonBranding(null).then(function(result) {
      if (!cancelled) setLegacyBranding(result);
    });
    return function() { cancelled = true; };
  }, [contextSalon]);

  var salon = contextSalon || legacyBranding;

  // Update browser tab title to match the actual salon.
  useEffect(function() {
    if (salon && salon.name) {
      document.title = salon.name + " — Trimora POS";
    }
  }, [salon]);

  // PWA: inject a per-salon manifest so each salon's "Add to Home Screen"
  // opens straight to their own /:slug/pos, not a generic route.
  useEffect(function() {
    if (salon && salon.slug) {
      setPwaManifest(salon);
    } else if (salon) {
      setLegacyPwaManifest();
    }
  }, [salon]);

  // Register the app-shell service worker once on first POS load.
  useEffect(function() {
    registerServiceWorker();
  }, []);

  var primary    = (salon && salon.primary_color) || GOLD;
  var secondary  = (salon && salon.secondary_color) || DARK;
  var primaryLt  = lighten(primary, 14);
  var primaryDim = darken(primary, 18);
  var bgStop3    = lighten(secondary, 3.5);
  var bookingHref = (salon && salon.slug) ? "/" + salon.slug + "/booking" : "/booking";
  var salonName  = (salon && salon.name) || "your salon";

  var darkKey = "trimora_dark_" + ((contextSalon && contextSalon.id) || "default");
  var darkModeState = useState(function(){ return localStorage.getItem(darkKey) === "true"; });
  var darkMode = darkModeState[0]; var setDarkMode = darkModeState[1];

  useEffect(function() {
    localStorage.setItem(darkKey, darkMode);
    document.body.style.background = darkMode ? "#0A0A0A" : "#FDF8EE";
  }, [darkMode]);

  var BG      = darkMode ? "#0A0A0A"  : CREAM;
  var CARD    = darkMode ? "#1A1400"  : WHITE;
  var TEXT    = darkMode ? WHITE      : DARK;
  var BORDER  = darkMode ? GOLD_DIM + "55" : GOLD_DIM + "33";
  var SUBTEXT = darkMode ? "rgba(255,255,255,0.5)" : "#888";

  var pageState = useState("pos"); var page = pageState[0]; var setPage = pageState[1];
  var cartState = useState([]); var cart = cartState[0]; var setCart = cartState[1];
  var clientNameState = useState(""); var clientName = clientNameState[0]; var setClientName = clientNameState[1];
  var clientPhoneState = useState(""); var clientPhone = clientPhoneState[0]; var setClientPhone = clientPhoneState[1];
  var selectedCustomerState = useState(null); var selectedCustomer = selectedCustomerState[0]; var setSelectedCustomer = selectedCustomerState[1];
  var customerSearchState = useState(""); var customerSearch = customerSearchState[0]; var setCustomerSearch = customerSearchState[1];
  var customerResultsState = useState([]); var customerResults = customerResultsState[0]; var setCustomerResults = customerResultsState[1];
  var showCustomerDropState = useState(false); var showCustomerDrop = showCustomerDropState[0]; var setShowCustomerDrop = showCustomerDropState[1];
  var addingNewCustomerState = useState(false); var addingNewCustomer = addingNewCustomerState[0]; var setAddingNewCustomer = addingNewCustomerState[1];
  var selStaffState = useState(""); var selStaff = selStaffState[0]; var setSelStaff = selStaffState[1];
  var payMethodState = useState("Cash"); var payMethod = payMethodState[0]; var setPayMethod = payMethodState[1];
  var catFilterState = useState("All"); var catFilter = catFilterState[0]; var setCatFilter = catFilterState[1];
  var typeFilterState = useState("services"); var typeFilter = typeFilterState[0]; var setTypeFilter = typeFilterState[1];

  // ── Discount state ─────────────────────────────────────────────────────────
  var showDiscountState = useState(false); var showDiscount = showDiscountState[0]; var setShowDiscount = showDiscountState[1];
  var discountTypeState = useState("pct"); var discountType = discountTypeState[0]; var setDiscountType = discountTypeState[1];
  var discountValueState = useState(""); var discountValue = discountValueState[0]; var setDiscountValue = discountValueState[1];
  var discountReasonState = useState(""); var discountReason = discountReasonState[0]; var setDiscountReason = discountReasonState[1];

  var salesState = useState([]); var sales = salesState[0]; var setSales = salesState[1];
  var postSaleCampaignState = useState(null); var postSaleCampaign = postSaleCampaignState[0]; var setPostSaleCampaign = postSaleCampaignState[1];
  var appointmentCampaignState = useState(null); var appointmentCampaign = appointmentCampaignState[0]; var setAppointmentCampaign = appointmentCampaignState[1];
  var birthdayCampaignState = useState(null); var birthdayCampaign = birthdayCampaignState[0]; var setBirthdayCampaign = birthdayCampaignState[1];
  var winbackCampaignState = useState(null); var winbackCampaign = winbackCampaignState[0]; var setWinbackCampaign = winbackCampaignState[1];
  var winbackSmsStatusState = useState({}); var winbackSmsStatus = winbackSmsStatusState[0]; var setWinbackSmsStatus = winbackSmsStatusState[1];
  var allCampaignsState = useState([]); var allCampaigns = allCampaignsState[0]; var setAllCampaigns = allCampaignsState[1];
  var marketingConfigState = useState(null); var marketingConfig = marketingConfigState[0]; var setMarketingConfig = marketingConfigState[1];
  var broadcastMessageState = useState(""); var broadcastMessage = broadcastMessageState[0]; var setBroadcastMessage = broadcastMessageState[1];
  var broadcastSegmentState = useState("all"); var broadcastSegment = broadcastSegmentState[0]; var setBroadcastSegment = broadcastSegmentState[1];
  var broadcastSendingState = useState(false); var broadcastSending = broadcastSendingState[0]; var setBroadcastSending = broadcastSendingState[1];
  var broadcastProgressState = useState({ sent: 0, failed: 0, total: 0 }); var broadcastProgress = broadcastProgressState[0]; var setBroadcastProgress = broadcastProgressState[1];
  var broadcastDoneState = useState(false); var broadcastDone = broadcastDoneState[0]; var setBroadcastDone = broadcastDoneState[1];
  var productsState = useState([]); var products = productsState[0]; var setProducts = productsState[1];
  var feedbacksState = useState([]); var feedbacks = feedbacksState[0]; var setFeedbacks = feedbacksState[1];
  var appointmentsState = useState([]); var appointments = appointmentsState[0]; var setAppointments = appointmentsState[1];
  var customersState = useState([]); var customers = customersState[0]; var setCustomers = customersState[1];
  var staffListState = useState([]); var staffList = staffListState[0]; var setStaffList = staffListState[1];
  var servicesListState = useState([]); var servicesList = servicesListState[0]; var setServicesList = servicesListState[1];
  var loadingState = useState(true); var loading = loadingState[0]; var setLoading = loadingState[1];

  var showAddStaffState = useState(false); var showAddStaff = showAddStaffState[0]; var setShowAddStaff = showAddStaffState[1];
  var editingStaffState = useState(null); var editingStaff = editingStaffState[0]; var setEditingStaff = editingStaffState[1];
  var newStaffState = useState({ name: "", role: "Stylist", commission_pct: 40 }); var newStaff = newStaffState[0]; var setNewStaff = newStaffState[1];
  var showAddServiceState = useState(false); var showAddService = showAddServiceState[0]; var setShowAddService = showAddServiceState[1];
  var editingServiceState = useState(null); var editingService = editingServiceState[0]; var setEditingService = editingServiceState[1];
  var newServiceState = useState({ name: "", cat: "Hair", price: "" }); var newService = newServiceState[0]; var setNewService = newServiceState[1];
  var showAddProductState = useState(false); var showAddProduct = showAddProductState[0]; var setShowAddProduct = showAddProductState[1];
  var newProductState = useState({ name: "", cat: "Hair", price: "", stock: "" }); var newProduct = newProductState[0]; var setNewProduct = newProductState[1];

  var receiptState = useState(null); var receipt = receiptState[0]; var setReceipt = receiptState[1];
  var showFeedbackSentNoticeState = useState(false); var showFeedbackSentNotice = showFeedbackSentNoticeState[0]; var setShowFeedbackSentNotice = showFeedbackSentNoticeState[1];

  var loadingApptsState = useState(false); var loadingAppts = loadingApptsState[0]; var setLoadingAppts = loadingApptsState[1];
  var showMpesaConfirmState = useState(false); var showMpesaConfirm = showMpesaConfirmState[0]; var setShowMpesaConfirm = showMpesaConfirmState[1];
  // STK Push flow states
  // stkPhase: "idle" | "sending" | "waiting" | "confirmed" | "failed"
  var stkPhaseState = useState("idle"); var stkPhase = stkPhaseState[0]; var setStkPhase = stkPhaseState[1];
  var stkCheckoutIdState = useState(null); var stkCheckoutId = stkCheckoutIdState[0]; var setStkCheckoutId = stkCheckoutIdState[1];
  var stkErrorState = useState(""); var stkError = stkErrorState[0]; var setStkError = stkErrorState[1];
  var stkPollTimerState = useState(null); var stkPollTimer = stkPollTimerState[0]; var setStkPollTimer = stkPollTimerState[1];
  var timeState = useState(nowTime()); var setTime = timeState[1];
  var toastState = useState(null); var toast = toastState[0]; var setToast = toastState[1];
  var loadErrorState = useState(false); var setLoadError = loadErrorState[1];
  var expensesState = useState([]); var expenses = expensesState[0]; var setExpenses = expensesState[1];
  var isOnlineState = useState(navigator.onLine); var isOnline = isOnlineState[0]; var setIsOnline = isOnlineState[1];
  var syncPendingState = useState(false); var syncPending = syncPendingState[0]; var setSyncPending = syncPendingState[1];
  var apptDateState = useState(todayStr()); var apptDate = apptDateState[0]; var setApptDate = apptDateState[1];
  var showAllApptsState = useState(false); var showAllAppts = showAllApptsState[0]; var setShowAllAppts = showAllApptsState[1];
  var calViewState = useState(false); var calView = calViewState[0]; var setCalView = calViewState[1];
  var todayStaffStatsState = useState([]); var todayStaffStats = todayStaffStatsState[0]; var setTodayStaffStats = todayStaffStatsState[1];
  var loadingStaffStatsState = useState(false); var loadingStaffStats = loadingStaffStatsState[0]; var setLoadingStaffStats = loadingStaffStatsState[1];

  function showToast(msg, type) {
    type = type || "success";
    setToast({ msg: msg, type: type });
    setTimeout(function() { setToast(null); }, 3000);
  }

  function clearDiscount() {
    setShowDiscount(false);
    setDiscountType("pct");
    setDiscountValue("");
    setDiscountReason("");
  }

  useEffect(function() {
    async function loadAll() {
      try {
        var results = await Promise.all([
          db("GET", "sales",     null, "?order=created_at.desc&limit=100"),
          db("GET", "stock",     null, "?limit=50"),
          db("GET", "feedback",  null, "?order=date.desc,time.desc&limit=50"),
          db("GET", "customers", null, "?order=created_at.desc&limit=200"),
          db("GET", "staff",     null, "?active=eq.true&order=created_at.asc"),
          db("GET", "services",  null, "?active=eq.true&order=cat.asc,name.asc"),
          db("GET", "expenses",  null, "?order=date.desc&limit=200"),
          db("GET", "marketing_campaigns", null, "?type=eq.post_sale&is_active=eq.true&limit=1"),
          db("GET", "marketing_campaigns", null, "?type=eq.appointment_reminder&is_active=eq.true&limit=1"),
          db("GET", "marketing_campaigns", null, "?type=eq.birthday&is_active=eq.true&limit=1"),
          db("GET", "marketing_campaigns", null, "?type=eq.winback&is_active=eq.true&limit=1"),
          db("GET", "marketing_campaigns", null, "?order=created_at.desc"),
          db("GET", "salon_marketing_config", null, "?limit=1"),
        ]);
        if (results[0]) setSales(results[0]);
        if (results[1] && results[1].length > 0) setProducts(results[1]);
        if (results[2]) setFeedbacks(results[2]);
        if (results[3]) setCustomers(results[3]);
        if (Array.isArray(results[4])) setStaffList(results[4]);
        if (Array.isArray(results[5])) setServicesList(results[5]);
        if (results[6]) setExpenses(results[6]);
        if (Array.isArray(results[7]) && results[7][0]) setPostSaleCampaign(results[7][0]);
        if (Array.isArray(results[8]) && results[8][0]) setAppointmentCampaign(results[8][0]);
        if (Array.isArray(results[9]) && results[9][0]) setBirthdayCampaign(results[9][0]);
        if (Array.isArray(results[10]) && results[10][0]) setWinbackCampaign(results[10][0]);
        if (Array.isArray(results[11])) setAllCampaigns(results[11]);
        if (Array.isArray(results[12]) && results[12][0]) setMarketingConfig(results[12][0]);
      } catch (e) {
        console.error("Load error:", e);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
    var t = setInterval(function() { setTime(nowTime()); }, 30000);
    return function() { clearInterval(t); };
  }, []);

  useEffect(function() {
    function goOnline() { setIsOnline(true); setSyncPending(offlineQueue.length > 0); syncOfflineQueue().then(function() { setSyncPending(false); }); }
    function goOffline() { setIsOnline(false); }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return function() { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  function searchCustomers(q) {
    setCustomerSearch(q);
    if (q.length < 2) { setCustomerResults([]); setShowCustomerDrop(false); return; }
    var results = customers.filter(function(c) { return c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone && c.phone.includes(q)); });
    setCustomerResults(results); setShowCustomerDrop(true);
  }
  function selectCustomer(c) { setSelectedCustomer(c); setClientName(c.name); setClientPhone(c.phone || ""); setCustomerSearch(c.name); setShowCustomerDrop(false); setAddingNewCustomer(false); }
  function clearCustomer() { setSelectedCustomer(null); setClientName(""); setClientPhone(""); setCustomerSearch(""); setAddingNewCustomer(false); }

  async function saveNewCustomer() {
    if (!clientName) return alert("Please enter customer name");
    var saved = await db("POST", "customers", { name: clientName, phone: clientPhone, visit_count: 1, total_spend: 0, last_visit: todayStr() });
    var newC = (saved && saved[0]) || { id: Date.now(), name: clientName, phone: clientPhone, visit_count: 1, total_spend: 0 };
    setCustomers(function(p) { return [newC].concat(p); });
    setSelectedCustomer(newC); setAddingNewCustomer(false); setShowCustomerDrop(false);
    showToast(clientName + " added as new client!");
  }

  var receiptCustomerState = useState(null); var receiptCustomer = receiptCustomerState[0]; var setReceiptCustomer = receiptCustomerState[1];
  var thankYouStatusState = useState("idle"); var thankYouStatus = thankYouStatusState[0]; var setThankYouStatus = thankYouStatusState[1];
  var showInPersonFeedbackState = useState(false); var showInPersonFeedback = showInPersonFeedbackState[0]; var setShowInPersonFeedback = showInPersonFeedbackState[1];

  async function submitInPersonFeedback(data) {
    if (!receipt) return;
    var saved = await db("POST", "feedback", {
      rating:         data.rating,
      note:           data.note || null,
      stylist:        data.stylist || null,
      client:         receipt.client || null,
      feedback_token: receipt.feedback_token || null,
      date:           data.date,
      time:           data.time,
    });
    if (!saved) {
      // db() fails soft (returns null) rather than throwing, so this check
      // is the only thing standing between a failed write and a false
      // "sent!" notice — don't remove it even if it looks redundant.
      alert("Couldn't save this feedback right now. Please try again.");
      return;
    }
    setFeedbacks(function(prev) {
      return [{ rating: data.rating, note: data.note, stylist: data.stylist, client: receipt.client, date: data.date, time: data.time }].concat(prev);
    });
    setShowInPersonFeedback(false);
    setShowFeedbackSentNotice(true);
    setTimeout(function() { setShowFeedbackSentNotice(false); }, 3000);
  }

  async function updateCustomerAfterSale(total) {
    if (!selectedCustomer || !selectedCustomer.id) return;
    try {
      var newVisits = (selectedCustomer.visit_count || 0) + 1;
      var newSpend  = (selectedCustomer.total_spend  || 0) + total;
      await db("PATCH", "customers", { visit_count: newVisits, total_spend: newSpend, last_visit: todayStr() }, "?id=eq." + selectedCustomer.id);
      setCustomers(function(p) { return p.map(function(c) { return c.id === selectedCustomer.id ? Object.assign({}, c, { visit_count: newVisits, total_spend: newSpend, last_visit: todayStr() }) : c; }); });
    } catch (e) { console.error("Update customer error:", e); }
  }

  // Manual, operator-triggered post-sale thank-you message — tapped from
  // the receipt screen rather than firing automatically. Same underlying
  // campaign/edge-function infra as full automation will use later; this
  // just keeps a human in the loop on every send for now.
  async function sendPostSaleMessage() {
    if (!postSaleCampaign || !receiptCustomer || !receiptCustomer.id) return;
    var salonId = salon && salon.id;
    if (!salonId) return;
    setThankYouStatus("sending");
    try {
      var res = await fetch(SUPABASE_URL + "/functions/v1/send-marketing-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
        },
        body: JSON.stringify({
          campaign_id: postSaleCampaign.id,
          customer_id: receiptCustomer.id,
          salon_id: salonId,
        }),
      });
      var data = await res.json().catch(function() { return {}; });
      setThankYouStatus(data && data.success ? "sent" : "error");
    } catch (e) {
      console.error("Post-sale message error:", e);
      setThankYouStatus("error");
    }
  }


  async function loadAppointments() {
    setLoadingAppts(true);
    try {
      var data = await db("GET", "bookings", null, "?order=date.asc,time.asc&limit=200");
      setAppointments(Array.isArray(data) ? data : []);
    } catch (e) { showToast("Could not load bookings", "error"); setAppointments([]); }
    finally { setLoadingAppts(false); }
  }
  useEffect(function() { if (page === "appointments") loadAppointments(); }, [page]);

  // Staff & Commissions — strictly "today in Nairobi time" via server-side RPC.
  // This does not touch historical data; it only scopes this one screen's
  // aggregation to the current calendar day, computed server-side from
  // each sale's created_at timestamp converted to Africa/Nairobi.
  async function loadTodayStaffStats() {
    setLoadingStaffStats(true);
    try {
      var deviceToken = await getValidAccessToken();
      var res = await fetch(SUPABASE_URL + "/rest/v1/rpc/get_today_staff_stats", {
        method: "POST",
        headers: {
          "apikey":        SUPABASE_KEY,
          "Authorization": "Bearer " + (deviceToken || SUPABASE_KEY),
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("RPC failed");
      var data = await res.json();
      setTodayStaffStats(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Today staff stats error:", e);
      setTodayStaffStats([]);
    } finally {
      setLoadingStaffStats(false);
    }
  }

  useEffect(function() {
    if (page !== "staff") return;
    loadTodayStaffStats();
    // Re-fetch every 60s so the screen naturally rolls over at midnight
    // Nairobi time without needing a manual refresh.
    var t = setInterval(loadTodayStaffStats, 60000);
    return function() { clearInterval(t); };
  }, [page]);

  var visibleAppointments = showAllAppts ? appointments : appointments.filter(function(a) { return a.date === apptDate; });

  async function markDone(id) {
    try { await db("PATCH", "bookings", { status: "done" }, "?id=eq." + id); setAppointments(function(p) { return p.map(function(a) { return a.id === id ? Object.assign({}, a, { status: "done" }) : a; }); }); showToast("Booking marked as done ✅"); }
    catch (e) { showToast("Update failed", "error"); }
  }
  async function markCancelled(id) {
    try { await db("PATCH", "bookings", { status: "cancelled" }, "?id=eq." + id); setAppointments(function(p) { return p.map(function(a) { return a.id === id ? Object.assign({}, a, { status: "cancelled" }) : a; }); }); showToast("Booking cancelled", "info"); }
    catch (e) { showToast("Update failed", "error"); }
  }

  async function convertToSale(a) {
    try {
      await db("PATCH", "bookings", { status: "done" }, "?id=eq." + a.id);
      setAppointments(function(p) { return p.map(function(b) { return b.id === a.id ? Object.assign({}, b, { status: "done" }) : b; }); });
      var existing = await db("GET", "customers", null, "?phone=eq." + a.phone + "&limit=1");
      var customer = existing && existing[0];
      if (!customer) { var s2 = await db("POST", "customers", { name: a.name, phone: a.phone, visit_count: 0, total_spend: 0, last_visit: todayStr() }); customer = s2 && s2[0]; }
      if (customer) setCustomers(function(p) { return p.find(function(c) { return c.id === customer.id; }) ? p : [customer].concat(p); });
      var svc = servicesList.find(function(s) { return s.name === a.service; });
      setSelectedCustomer(customer || { name: a.name, phone: a.phone });
      setClientName(a.name); setClientPhone(a.phone || ""); setCustomerSearch(a.name);
      var fs = staffList.find(function(s) { return s.name === a.stylist; });
      setCart(svc ? [Object.assign({}, svc, { type: "service", qty: 1, stylist: fs ? fs.name : "" })] : []);
      setSelStaff(fs ? fs.name : "");
      clearDiscount();
      setPage("pos");
      showToast(a.name + " moved to POS!");
    } catch (e) { showToast("Something went wrong", "error"); }
  }

  // ── Cart calculations with discount + per-item stylist ────────────────────
  var serviceItems  = cart.filter(function(i) { return i.type === "service"; });
  var productItems  = cart.filter(function(i) { return i.type === "product"; });
  var serviceTotal  = serviceItems.reduce(function(s, i) { return s + i.price * (i.qty || 1); }, 0);
  var productTotal  = productItems.reduce(function(s, i) { return s + i.price * (i.qty || 1); }, 0);

  // Calculate discount amount (on services only)
  var discountAmt = 0;
  var discountNum = parseFloat(discountValue) || 0;
  if (showDiscount && discountNum > 0 && serviceTotal > 0) {
    if (discountType === "pct") {
      discountAmt = Math.min(serviceTotal, serviceTotal * (discountNum / 100));
    } else {
      discountAmt = Math.min(serviceTotal, discountNum);
    }
  }

  var discountedServiceTotal = serviceTotal - discountAmt;
  var cartTotal = discountedServiceTotal + productTotal;

  function rateForStylistName(name) {
    var member = staffList.find(function(s) { return s.name === name; });
    return ((member && member.commission_pct != null ? member.commission_pct : 40)) / 100;
  }

  // Per-item commission, using each item's OWN assigned stylist (falls back
  // to the default "selStaff" if an item has no stylist of its own yet —
  // this keeps single-stylist sales working exactly as before).
  var commission = serviceItems.reduce(function(sum, item) {
    var itemStylist = item.stylist || selStaff;
    var rate = item.commission_override != null ? item.commission_override / 100 : rateForStylistName(itemStylist);
    var itemTotal      = item.price * (item.qty || 1);
    var itemDiscounted = serviceTotal > 0 ? itemTotal * (discountedServiceTotal / serviceTotal) : itemTotal;
    return sum + itemDiscounted * rate;
  }, 0);

  // Per-stylist commission breakdown for this cart (used in the cart summary
  // and saved on the sale record so staff stats stay accurate per-person).
  var commissionByStylist = {};
  serviceItems.forEach(function(item) {
    var itemStylist = item.stylist || selStaff;
    if (!itemStylist) return;
    var rate = item.commission_override != null ? item.commission_override / 100 : rateForStylistName(itemStylist);
    var itemTotal      = item.price * (item.qty || 1);
    var itemDiscounted = serviceTotal > 0 ? itemTotal * (discountedServiceTotal / serviceTotal) : itemTotal;
    commissionByStylist[itemStylist] = (commissionByStylist[itemStylist] || 0) + itemDiscounted * rate;
  });

  // Distinct stylists involved in this cart (for the "multi-stylist" UI cue)
  var stylistsInCart = Array.from(new Set(
    serviceItems.map(function(i) { return i.stylist || selStaff; }).filter(Boolean)
  ));

  function addToCart(item, type) {
    setCart(function(prev) {
      var ex = prev.find(function(i) { return i.id === item.id; });
      if (ex) return prev.map(function(i) { return i.id === item.id ? Object.assign({}, i, { qty: (i.qty || 1) + 1 }) : i; });
      // New items default to the currently selected default stylist —
      // can be reassigned individually afterwards in the cart.
      return prev.concat([Object.assign({}, item, { type: type, qty: 1, stylist: type === "service" ? selStaff : null })]);
    });
  }
  function removeFromCart(id) { setCart(function(p) { return p.filter(function(i) { return i.id !== id; }); }); }
  function setItemStylist(id, stylistName) {
    setCart(function(p) { return p.map(function(i) { return i.id === id ? Object.assign({}, i, { stylist: stylistName }) : i; }); });
  }

  function resetCart() {
    setCart([]); setClientName(""); setClientPhone(""); setSelStaff(""); setPayMethod("Cash");
    setSelectedCustomer(null); setCustomerSearch(""); setAddingNewCustomer(false);
    setShowMpesaConfirm(false); clearDiscount();
  }

  function unassignedServiceItems() {
    return serviceItems.filter(function(i) { return !i.stylist; });
  }

  // Generates a short, random, unguessable token for the public feedback
  // rating link — e.g. "a3f9k2m8x1". Not a sequential ID, so customers
  // can't guess at other customers' sale links.
  // Uses crypto.getRandomValues rather than Math.random() — Math.random()
  // is fine for avoiding accidental collisions but isn't designed to
  // resist someone deliberately guessing/enumerating tokens, and this
  // token is the only thing standing between a stranger and another
  // customer's feedback link.
  function generateFeedbackToken() {
    var bytes = new Uint8Array(12);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // Isolated on purpose: this is the ONLY function that needs to change
  // when the real WhatsApp Business API is ready. Today it auto-opens a
  // wa.me link pre-filled with the message (staff taps Send once in
  // WhatsApp). Swap the body of this function later to call the real
  // API instead — nothing else in the app needs to change.
  function sendFeedbackRequest(phone, clientFirstName, token) {
    if (!phone) return;
    var cleanPhone = phone.replace(/^0/, "254").replace(/\D/g, "");
    var ratingPath = (salon && salon.slug) ? "/" + salon.slug + "/rate/" + token : "/rate/" + token;
    var ratingUrl = window.location.origin + ratingPath;
    var message = "Hi " + clientFirstName + "! 👋 Thank you for visiting " + salonName + " 💛\n\n" +
      "We'd love to hear how your visit went — it only takes a few seconds:\n" + ratingUrl + "\n\n" +
      "— " + salonName;
    var waLink = "https://wa.me/" + cleanPhone + "?text=" + encodeURIComponent(message);
    window.open(waLink, "_blank");
  }

  async function deleteCustomer(customer) {
    if (!window.confirm("Delete " + customer.name + "?\n\nThis cannot be undone. Their sales history will be kept but they will be removed from the client list.")) return;
    await db("DELETE", "customers", null, "?id=eq." + customer.id);
    setCustomers(function(prev) { return prev.filter(function(c) { return c.id !== customer.id; }); });
  }

  async function completeSale() {
    if (!clientName) return alert("Please enter or select a client");
    if (cart.length === 0) return alert("Cart is empty");
    if (unassignedServiceItems().length > 0) return alert("Please assign a stylist to every service in the cart");
    try {
      // Primary stylist = whoever has the highest revenue share on this sale.
      // Kept for backward compatibility with older reports/CSV exports that
      // expect a single `stylist` field; the real per-item truth lives in `items`.
      var primaryStylist = stylistsInCart.length > 0
        ? stylistsInCart.reduce(function(best, name) {
            var nameTotal = serviceItems.filter(function(i){ return (i.stylist||selStaff)===name; }).reduce(function(a,i){ return a+i.price*(i.qty||1); }, 0);
            var bestTotal = serviceItems.filter(function(i){ return (i.stylist||selStaff)===best; }).reduce(function(a,i){ return a+i.price*(i.qty||1); }, 0);
            return nameTotal > bestTotal ? name : best;
          }, stylistsInCart[0])
        : selStaff;

      var feedbackToken = generateFeedbackToken();
      var saleData = {
        client: clientName, client_phone: clientPhone, stylist: primaryStylist, items: cart,
        total: cartTotal,
        service_total: serviceTotal,
        product_total: productTotal,
        discount_amount: discountAmt,
        discount_type: discountAmt > 0 ? discountType : null,
        discount_value: discountAmt > 0 ? discountNum : null,
        discount_reason: discountAmt > 0 ? discountReason : null,
        commission: commission,
        commission_by_stylist: commissionByStylist,
        is_multi_stylist: stylistsInCart.length > 1,
        payment: payMethod,
        date: todayStr(), time: nowTime(),
        feedback_token: feedbackToken,
      };
      var saved = await db("POST", "sales", saleData);
      var newSale = (saved && saved[0]) || Object.assign({}, saleData, { id: "S" + Date.now() });
      setSales(function(p) { return [newSale].concat(p); });
      var productCartItems = cart.filter(function(i) { return i.type === "product"; });
      for (var ci = 0; ci < productCartItems.length; ci++) {
        var cartItem2 = productCartItems[ci];
        var prod = products.find(function(p) { return p.id === cartItem2.id; });
        if (prod) {
          var ns = Math.max(0, prod.stock - cartItem2.qty);
          await db("PATCH", "stock", { stock: ns }, "?id=eq." + cartItem2.id);
          setProducts(function(p) { return p.map(function(pr) { return pr.id === cartItem2.id ? Object.assign({}, pr, { stock: ns }) : pr; }); });
        }
      }
      await updateCustomerAfterSale(cartTotal);
      setReceiptCustomer(selectedCustomer);
      setThankYouStatus("idle");
      setReceipt(newSale);
      resetCart();
      showToast("Sale of " + fmt(cartTotal) + " saved! 🎉");
    } catch (err) {
      console.error("Sale error:", err);
      resetCart();
    }
  }

  function checkout() {
    if (!clientName) return alert("Please enter or select a client");
    if (cart.length === 0) return alert("Cart is empty");
    if (unassignedServiceItems().length > 0) return alert("Please assign a stylist to every service in the cart");
    // STK Push only triggers for Till (Buy Goods) — the automated Daraja flow.
    // Paybill and Send Money are manual: customer pays, cashier confirms.
    if (payMethod === "Till" || payMethod === "M-Pesa") {
      setStkPhase("idle");
      setStkCheckoutId(null);
      setStkError("");
      setShowMpesaConfirm(true);
    } else {
      completeSale();
    }
  }

  function closeMpesaModal() {
    // Stop any active poll timer before closing
    if (stkPollTimer) { clearInterval(stkPollTimer); setStkPollTimer(null); }
    setShowMpesaConfirm(false);
    setStkPhase("idle");
    setStkCheckoutId(null);
    setStkError("");
  }

  async function initiateStkPush() {
    if (!clientPhone) {
      // No phone — fall back to manual flow (show till number, staff confirms)
      setStkPhase("manual");
      return;
    }
    var salonId = salon && salon.id;
    if (!salonId) {
      setStkPhase("manual");
      return;
    }

    setStkPhase("sending");
    setStkError("");

    try {
      var res = await fetch(SUPABASE_URL + "/functions/v1/mpesa-stk-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
        },
        body: JSON.stringify({
          salon_id:  salonId,
          amount:    Math.ceil(cartTotal),
          phone:     clientPhone,
          reference: clientName.slice(0, 12),
        }),
      });

      var data = await res.json();

      if (!res.ok || !data.success) {
        // STK Push not configured or failed — fall back to manual
        console.warn("STK Push failed, falling back to manual:", data.error);
        setStkPhase("manual");
        return;
      }

      setStkCheckoutId(data.checkout_request_id);
      setStkPhase("waiting");
      startPolling(data.checkout_request_id);

    } catch (err) {
      console.error("STK Push error:", err);
      setStkPhase("manual");
    }
  }

  function startPolling(checkoutRequestId) {
    // Poll salon_mpesa_payments every 3 seconds for up to 2 minutes
    var attempts = 0;
    var maxAttempts = 40; // 40 × 3s = 120s

    var timer = setInterval(async function() {
      attempts++;
      try {
        var rows = await fetch(
          SUPABASE_URL + "/rest/v1/salon_mpesa_payments?checkout_request_id=eq." +
          encodeURIComponent(checkoutRequestId) + "&select=status,mpesa_receipt,result_desc&limit=1",
          {
            headers: {
              "apikey": SUPABASE_KEY,
              "Authorization": "Bearer " + SUPABASE_KEY,
            },
          }
        ).then(function(r) { return r.json(); });

        var row = rows && rows[0];
        if (row) {
          if (row.status === "confirmed") {
            clearInterval(timer); setStkPollTimer(null);
            setStkPhase("confirmed");
            // Auto-complete the sale after a brief moment so the user sees confirmation
            setTimeout(function() {
              setShowMpesaConfirm(false);
              setStkPhase("idle");
              completeSale();
            }, 2000);
            return;
          }
          if (row.status === "failed") {
            clearInterval(timer); setStkPollTimer(null);
            setStkError(row.result_desc || "Payment was not completed. Please try again.");
            setStkPhase("failed");
            return;
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer); setStkPollTimer(null);
        setStkError("Payment timed out. Ask the customer to try again, or collect cash.");
        setStkPhase("failed");
      }
    }, 3000);

    setStkPollTimer(timer);
  }

  async function adjustStock(id, delta) {
    if (!isAdmin && delta > 0) { alert("Only admin can add stock."); return; }
    var prod = products.find(function(p) { return p.id === id; });
    if (!prod) return;
    var ns = Math.max(0, prod.stock + delta);
    setProducts(function(p) { return p.map(function(pr) { return pr.id === id ? Object.assign({}, pr, { stock: ns }) : pr; }); });
    try { await db("PATCH", "stock", { stock: ns }, "?id=eq." + id); }
    catch (e) { console.error("Stock update failed:", e); }
  }

  var todaySales        = sales.filter(function(s) { return s.date === todayStr(); });
  var staffStats        = staffList.map(function(st) {
    var todayRow = todayStaffStats.find(function(r) { return r.stylist === st.name; });
    return Object.assign({}, st, {
      salesCount: todayRow ? Number(todayRow.sales_count) : 0,
      revenue:    todayRow ? Number(todayRow.revenue)     : 0,
      commission: todayRow ? Number(todayRow.commission)  : 0,
    });
  });
  var pendingCount      = appointments.filter(function(a) { return a.status === "pending"; }).length;
  var frequentCustomers = customers.filter(function(c) { return c.visit_count >= 4; });
  var winbackThreshold = (winbackCampaign && winbackCampaign.winback_days) || 28;
  var atRiskCustomers   = customers.filter(function(c) { if (!c.last_visit) return false; return (new Date() - new Date(c.last_visit)) / (1000 * 60 * 60 * 24) >= winbackThreshold; });

  // Manual, operator-triggered winback SMS via the marketing engine — same
  // pattern as the other campaign types. Dormant until a winback campaign
  // is created and switched on.
  async function sendWinbackSms(customer) {
    if (!winbackCampaign || !customer || !customer.id) return;
    var salonId = salon && salon.id;
    if (!salonId) return;
    setWinbackSmsStatus(function(p) { return Object.assign({}, p, { [customer.id]: "sending" }); });
    try {
      var res = await fetch(SUPABASE_URL + "/functions/v1/send-marketing-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY,
        },
        body: JSON.stringify({
          campaign_id: winbackCampaign.id,
          customer_id: customer.id,
          salon_id: salonId,
        }),
      });
      var data = await res.json().catch(function() { return {}; });
      setWinbackSmsStatus(function(p) { return Object.assign({}, p, { [customer.id]: (data && data.success) ? "sent" : "error" }); });
    } catch (e) {
      console.error("Winback SMS error:", e);
      setWinbackSmsStatus(function(p) { return Object.assign({}, p, { [customer.id]: "error" }); });
    }
  }

  // ── MARKETING FUNCTIONS ─────────────────────────────────────────
  function eligibleFor(segment) {
    var base = segment === "frequent" ? frequentCustomers : segment === "atrisk" ? atRiskCustomers : customers;
    return base.filter(function(c) { return c.phone && !c.marketing_opt_out; });
  }
  var broadcastRecipients = eligibleFor(broadcastSegment);

  async function sendBroadcast() {
    if (!broadcastMessage.trim() || broadcastRecipients.length === 0) return;
    var salonId = salon && salon.id;
    if (!salonId) return;
    setBroadcastSending(true); setBroadcastDone(false);
    setBroadcastProgress({ sent: 0, failed: 0, total: broadcastRecipients.length });
    var campaignResult = await db("POST", "marketing_campaigns", {
      salon_id: salonId, name: "Broadcast " + new Date().toLocaleString(),
      type: "manual_broadcast", message_template: broadcastMessage.trim(), is_active: true,
    });
    var campaign = campaignResult && campaignResult[0];
    if (!campaign) { setBroadcastSending(false); alert("Could not create broadcast. Check your connection."); return; }
    var sentCount = 0, failedCount = 0;
    for (var i = 0; i < broadcastRecipients.length; i++) {
      var c = broadcastRecipients[i];
      try {
        var res = await fetch(SUPABASE_URL + "/functions/v1/send-marketing-message", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY },
          body: JSON.stringify({ campaign_id: campaign.id, customer_id: c.id, salon_id: salonId }),
        });
        var data = await res.json().catch(function() { return {}; });
        if (data && data.success) sentCount++; else failedCount++;
      } catch (e) { failedCount++; }
      setBroadcastProgress({ sent: sentCount, failed: failedCount, total: broadcastRecipients.length });
      await new Promise(function(resolve) { setTimeout(resolve, 300); });
    }
    setBroadcastSending(false); setBroadcastDone(true);
  }

  async function saveCampaignSettings(type, defaultName, template, isActive, extra) {
    var salonId = salon && salon.id; if (!salonId) return;
    var existing = allCampaigns.find(function(c) { return c.type === type; });
    var body = Object.assign({ salon_id: salonId, name: defaultName, type: type, message_template: template, is_active: isActive }, extra || {});
    if (existing && existing.id) {
      await db("PATCH", "marketing_campaigns", body, "?id=eq." + existing.id);
    } else {
      await db("POST", "marketing_campaigns", body);
    }
    var fresh = await db("GET", "marketing_campaigns", null, "?order=created_at.desc");
    if (Array.isArray(fresh)) setAllCampaigns(fresh);
    var freshActive = await db("GET", "marketing_campaigns", null, "?type=eq." + type + "&is_active=eq.true&limit=1");
    if (type === "post_sale" && Array.isArray(freshActive) && freshActive[0]) setPostSaleCampaign(freshActive[0]);
    if (type === "appointment_reminder" && Array.isArray(freshActive) && freshActive[0]) setAppointmentCampaign(freshActive[0]);
    if (type === "birthday" && Array.isArray(freshActive) && freshActive[0]) setBirthdayCampaign(freshActive[0]);
    if (type === "winback" && Array.isArray(freshActive) && freshActive[0]) setWinbackCampaign(freshActive[0]);
  }

  async function toggleSmsActive() {
    var salonId = salon && salon.id; if (!salonId) return;
    var newVal = !(marketingConfig && marketingConfig.is_sms_active);
    if (marketingConfig && marketingConfig.id) {
      await db("PATCH", "salon_marketing_config", { is_sms_active: newVal }, "?salon_id=eq." + salonId);
    } else {
      await db("POST", "salon_marketing_config", { salon_id: salonId, is_sms_active: newVal });
    }
    var fresh = await db("GET", "salon_marketing_config", null, "?limit=1");
    if (Array.isArray(fresh) && fresh[0]) setMarketingConfig(fresh[0]);
  }

  var ALL_NAV = [
    { id: "pos",          label: "POS",       icon: "🛒", adminOnly: false },
    { id: "appointments", label: "Bookings",  icon: "📅", adminOnly: false, badge: pendingCount },
    { id: "customers",    label: "Clients",   icon: "👤", adminOnly: true },
    { id: "dashboard",    label: "Overview",  icon: "📊", adminOnly: true },
    { id: "reviews",      label: "Reviews",   icon: "⭐", adminOnly: true },
    { id: "staff",        label: "Staff",     icon: "👥", adminOnly: true },
    { id: "services",     label: "Services",  icon: "✂",  adminOnly: true },
    { id: "inventory",    label: "Stock",     icon: "📦", adminOnly: true },
    { id: "expenses",     label: "Expenses",  icon: "💸", adminOnly: true },
    { id: "marketing",    label: "Marketing", icon: "📣", adminOnly: true },
    { id: "share",        label: "Share",     icon: "🔗", adminOnly: true },
    { id: "settings",     label: "Settings",  icon: "⚙️",  adminOnly: true },
  ];
  var NAV = isAdmin ? ALL_NAV : ALL_NAV.filter(function(n) { return !n.adminOnly; });
  var inputStyle = { borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", background: WHITE };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg," + BLACK + " 0%," + secondary + " 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <SalonBrandmark salon={salon} size="lg" />
      <div style={{ color: primaryLt, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 16 }}>Loading your salon data...</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", background: BG, minHeight: "100vh", display: "flex", flexDirection: "column", transition: "background 0.3s" }}>

      {receipt && (
        <Receipt
          salon={salon}
          sale={receipt}
          onClose={function() { setReceipt(null); setReceiptCustomer(null); setThankYouStatus("idle"); setShowInPersonFeedback(false); }}
          canSendThankYou={!!(postSaleCampaign && receiptCustomer && receiptCustomer.id && !receiptCustomer.marketing_opt_out)}
          thankYouStatus={thankYouStatus}
          onSendThankYou={sendPostSaleMessage}
          onInPersonFeedback={function() { setShowInPersonFeedback(true); }}
          onSendFeedback={function() {
            if (!receipt.client_phone) { alert("No phone number on file for this client."); return; }
            sendFeedbackRequest(receipt.client_phone, (receipt.client || "").split(" ")[0], receipt.feedback_token);
            setShowFeedbackSentNotice(true);
            setTimeout(function() { setShowFeedbackSentNotice(false); }, 4000);
          }}
        />
      )}

      {showInPersonFeedback && receipt && (
        <FeedbackModal
          salonName={salonName}
          staffList={staffList}
          onClose={function() { setShowInPersonFeedback(false); }}
          onSubmit={submitInPersonFeedback}
        />
      )}

      {showFeedbackSentNotice && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 1200, background: WHITE, border: "1.5px solid " + GOLD_DIM, borderRadius: 12, padding: "12px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: DARK }}>
          <span style={{ fontSize: 16 }}>💛</span> Thanks, feedback request sent!
        </div>
      )}

      {/* M-Pesa / STK Push Modal */}
      {showMpesaConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1500, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", borderTop: "3px solid " + GOLD }}>

            {/* Amount breakdown — always visible */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: DARK }}>
                {stkPhase === "confirmed" ? "✅ Payment Confirmed!" :
                 stkPhase === "waiting"   ? "📱 Waiting for Payment..." :
                 stkPhase === "sending"   ? "📡 Sending STK Push..." :
                 "M-Pesa Payment"}
              </div>
              {stkPhase === "idle" || stkPhase === "manual" || stkPhase === "failed" ? (
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {stkPhase === "manual" ? "Show till number to customer" : "Confirm amount below"}
                </div>
              ) : null}
            </div>

            {/* Amount breakdown */}
            <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12 }}>
              {serviceTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#888" }}>Services</span><span>{fmt(serviceTotal)}</span></div>}
              {discountAmt > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: GREEN }}><span>Discount {discountType === "pct" ? "(" + discountNum + "%)" : "(Fixed)"}{discountReason ? " — " + discountReason : ""}</span><span>- {fmt(discountAmt)}</span></div>}
              {productTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#888" }}>Products</span><span>{fmt(productTotal)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 14, borderTop: "1px dashed #ddd", paddingTop: 6, marginTop: 4 }}>
                <span>Total</span><span style={{ color: GOLD_DIM }}>{fmt(cartTotal)}</span>
              </div>
            </div>

            {/* ── IDLE: offer STK Push or manual ── */}
            {stkPhase === "idle" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {clientPhone ? (
                  <button onClick={initiateStkPush} style={{ width: "100%", background: MPESA_GREEN, color: WHITE, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>
                    📱 Send STK Push to {clientPhone}
                  </button>
                ) : (
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400E", marginBottom: 4 }}>
                    ⚠️ No phone number — cannot send STK Push. Show till number below.
                  </div>
                )}
                <button onClick={function() { setStkPhase("manual"); }} style={{ width: "100%", background: WHITE, color: MPESA_GREEN, border: "1.5px solid " + MPESA_GREEN, borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Show Till Number Instead
                </button>
                <button onClick={closeMpesaModal} style={{ width: "100%", background: WHITE, color: "#888", border: "1.5px solid " + GOLD_DIM, borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Go Back</button>
              </div>
            )}

            {/* ── SENDING: spinner ── */}
            {stkPhase === "sending" && (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
                <div style={{ fontSize: 14, color: "#555" }}>Sending push notification to<br /><b>{clientPhone}</b>...</div>
              </div>
            )}

            {/* ── WAITING: polling ── */}
            {stkPhase === "waiting" && (
              <div>
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
                  <div style={{ fontSize: 14, color: "#555", lineHeight: 1.6 }}>
                    Ask the customer to check their phone and<br />
                    <b>enter their M-Pesa PIN</b> to confirm.
                  </div>
                  <div style={{ fontSize: 11, color: "#aaa", marginTop: 8 }}>Waiting for Safaricom confirmation...</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  <button onClick={function() {
                    if (stkPollTimer) { clearInterval(stkPollTimer); setStkPollTimer(null); }
                    setStkPhase("manual");
                  }} style={{ width: "100%", background: WHITE, color: MPESA_GREEN, border: "1.5px solid " + MPESA_GREEN, borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Show Till Number Instead
                  </button>
                  <button onClick={closeMpesaModal} style={{ width: "100%", background: WHITE, color: "#888", border: "1.5px solid " + GOLD_DIM, borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}

            {/* ── CONFIRMED: auto-completing ── */}
            {stkPhase === "confirmed" && (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#166534" }}>Payment Received!</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 6 }}>Completing sale...</div>
              </div>
            )}

            {/* ── FAILED: error + options ── */}
            {stkPhase === "failed" && (
              <div>
                <div style={{ background: "#FEE2E2", borderRadius: 10, padding: "12px 14px", marginBottom: 12, fontSize: 13, color: "#991B1B", fontWeight: 700 }}>
                  ❌ {stkError}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button onClick={initiateStkPush} style={{ width: "100%", background: MPESA_GREEN, color: WHITE, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
                    🔄 Retry STK Push
                  </button>
                  <button onClick={function() { setStkPhase("manual"); }} style={{ width: "100%", background: WHITE, color: MPESA_GREEN, border: "1.5px solid " + MPESA_GREEN, borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    Show Till Number Instead
                  </button>
                  <button onClick={closeMpesaModal} style={{ width: "100%", background: WHITE, color: "#888", border: "1.5px solid " + GOLD_DIM, borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}

            {/* ── MANUAL: show till number, staff confirms ── */}
            {stkPhase === "manual" && (
              <div>
                <MpesaInstructions amount={cartTotal} reference={clientName} salon={salon} />
                {commission > 0 && (
                  <div style={{ marginTop: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400E" }}>
                    Staff commission: <b>{fmt(commission)}</b> (on post-discount services)
                  </div>
                )}
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  <button onClick={function() { closeMpesaModal(); completeSale(); }} style={{ width: "100%", background: MPESA_GREEN, color: WHITE, border: "none", borderRadius: 12, padding: "14px 0", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>
                    Payment Received — Complete Sale ({fmt(cartTotal)})
                  </button>
                  <button onClick={closeMpesaModal} style={{ width: "100%", background: WHITE, color: "#888", border: "1.5px solid " + GOLD_DIM, borderRadius: 12, padding: "12px 0", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Go Back</button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, borderRadius: 12, padding: "12px 20px", background: toast.type === "success" ? GREEN : toast.type === "error" ? RED : GOLD, color: WHITE, fontWeight: 800, fontSize: 13, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: 8, maxWidth: "90vw" }}>
          <span>{toast.type === "success" ? "✅" : toast.type === "error" ? "❌" : "ℹ️"}</span>{toast.msg}
        </div>
      )}

      {!isOnline && <div style={{ background: RED, color: WHITE, textAlign: "center", padding: "6px 16px", fontSize: 12, fontWeight: 700 }}>Offline — Sales will sync when connected</div>}
      {syncPending && isOnline && <div style={{ background: GREEN, color: WHITE, textAlign: "center", padding: "6px 16px", fontSize: 12, fontWeight: 700 }}>Syncing offline data...</div>}

      {/* Top bar */}
      <div style={{ background: "linear-gradient(135deg," + BLACK + " 0%," + secondary + " 60%," + bgStop3 + " 100%)", borderBottom: "2px solid " + primary, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SalonBrandmark salon={salon} size="sm" />
          <div style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: isAdmin ? "linear-gradient(135deg," + primary + "," + primaryLt + ")" : "rgba(255,255,255,0.1)", color: isAdmin ? BLACK : "rgba(255,255,255,0.6)" }}>
            {isAdmin ? "👑 ADMIN" : "✂ STAFF"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href={bookingHref} target="_blank" rel="noreferrer" style={{ background: "linear-gradient(135deg," + primary + "," + primaryLt + ")", color: BLACK, borderRadius: 20, padding: "7px 10px", fontSize: 11, fontWeight: 900, textDecoration: "none" }}>🔗</a>
          {isAdmin && <NotificationBell products={products} ownerPhone={salon && salon.contact_phone} salonName={salonName} feedbacks={feedbacks} />}
          <button onClick={function() { setDarkMode(function(d) { return !d; }); }} style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)", border: "1px solid " + primaryDim, borderRadius: "50%", width: 32, height: 32, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{darkMode ? "☀️" : "🌙"}</button>
          <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", border: "1px solid " + primaryDim, borderRadius: 20, padding: "7px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Out</button>
        </div>
      </div>

      {/* Nav — scrolls on mobile, spreads evenly on desktop */}
      <div style={{ background: darkMode ? "#0A0A00" : BLACK, borderBottom: "1px solid " + GOLD_DIM, display: "flex", flexShrink: 0, overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {NAV.map(function(n) {
          return (
            <button key={n.id} onClick={function() { setPage(n.id); }} style={{ flex: "1 0 auto", minWidth: 56, border: "none", background: "none", padding: "8px 4px", cursor: "pointer", borderBottom: "3px solid " + (page === n.id ? GOLD : "transparent"), color: page === n.id ? GOLD_LT : "rgba(255,255,255,0.35)", transition: "all 0.15s", position: "relative" }}>
              <div style={{ fontSize: 15 }}>{n.icon}</div>
              <div style={{ fontSize: 8, fontWeight: 700, marginTop: 1, letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{n.label}</div>
              {n.badge > 0 && <div style={{ position: "absolute", top: 4, right: "10%", background: RED, color: WHITE, borderRadius: "50%", width: 14, height: 14, fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{n.badge}</div>}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, background: BG }}>

        {/* ── POS ── */}
        {page === "pos" && (
          <div>
            {/* Setup checklist — shown to admin on fresh salons only */}
            {isAdmin && (
              <SetupChecklist
                salon={salon}
                servicesList={servicesList}
                staffList={staffList}
                onNavigate={function(tab) { setPage(tab); }}
              />
            )}

            {/* Subscription grace period warning — admin only */}
            {isAdmin && salon && salon.subscription_grace && (
              <div style={{ background: "#FEF3C7", border: "1.5px solid #F59E0B", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>⏰</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#92400E" }}>Subscription Overdue</div>
                  <div style={{ fontSize: 11, color: "#B45309", marginTop: 2, lineHeight: 1.5 }}>
                    Your subscription expired {salon.subscription_days_overdue} day{salon.subscription_days_overdue !== 1 ? "s" : ""} ago.
                    Access will be blocked after the 7-day grace period.
                    Contact <a href="mailto:admin@trimorasystems.com" style={{ color: "#92400E", fontWeight: 800 }}>admin@trimorasystems.com</a> to renew.
                  </div>
                </div>
              </div>
            )}
            {/* Customer */}
            <div style={{ marginBottom: 12, position: "relative" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Client</div>
              {selectedCustomer ? (
                <div style={{ background: WHITE, borderRadius: 10, padding: "10px 14px", border: "1.5px solid " + GOLD, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13, color: DARK, display: "flex", alignItems: "center", gap: 6 }}>
                      {selectedCustomer.name}
                      <LoyaltyBadge customer={selectedCustomer} size="sm" />
                    </div>
                    <div style={{ fontSize: 11, color: "#888" }}>{selectedCustomer.phone} · {selectedCustomer.visit_count} visit{selectedCustomer.visit_count !== 1 ? "s" : ""} · Spent {fmt(selectedCustomer.total_spend)}</div>
                  </div>
                  <button onClick={clearCustomer} style={{ background: "none", border: "none", color: RED, fontSize: 18, cursor: "pointer", padding: 0 }}>×</button>
                </div>
              ) : (
                <div>
                  <input placeholder="Search by name or phone..." value={customerSearch} onChange={function(e) { searchCustomers(e.target.value); }} onFocus={function() { if (customerSearch.length >= 2) setShowCustomerDrop(true); }} style={Object.assign({}, inputStyle, { width: "100%", boxSizing: "border-box" })} />
                  {showCustomerDrop && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: WHITE, borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 100, border: "1px solid " + GOLD_DIM + "44", maxHeight: 200, overflowY: "auto" }}>
                      {customerResults.length === 0 ? (
                        <div style={{ padding: "12px 14px" }}>
                          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>No customer found</div>
                          <button onClick={function() { setShowCustomerDrop(false); setAddingNewCustomer(true); setClientName(customerSearch); }} style={{ width: "100%", background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")", color: BLACK, border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>+ Add "{customerSearch}" as new client</button>
                        </div>
                      ) : customerResults.map(function(c) {
                        return (
                          <div key={c.id} onClick={function() { selectCustomer(c); }} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid " + GOLD_DIM + "22", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div><div style={{ fontWeight: 700, fontSize: 13, color: DARK }}>{c.name}</div><div style={{ fontSize: 11, color: "#888" }}>{c.phone} · {c.visit_count} visits</div></div>
                            <LoyaltyBadge customer={c} size="sm" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {addingNewCustomer && (
                    <div style={{ background: WHITE, borderRadius: 10, padding: "12px 14px", border: "1.5px solid " + GOLD, marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: GOLD_DIM, marginBottom: 8 }}>NEW CLIENT</div>
                      <input placeholder="Full name" value={clientName} onChange={function(e) { setClientName(e.target.value); }} style={Object.assign({}, inputStyle, { width: "100%", boxSizing: "border-box", marginBottom: 8 })} />
                      <input placeholder="Phone (e.g. 0712345678)" value={clientPhone} onChange={function(e) { setClientPhone(e.target.value); }} style={Object.assign({}, inputStyle, { width: "100%", boxSizing: "border-box", marginBottom: 8 })} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <GoldBtn onClick={saveNewCustomer} style={{ flex: 1, padding: "9px 0", fontSize: 12 }}>Save Client</GoldBtn>
                        <button onClick={function() { setAddingNewCustomer(false); setClientName(""); setClientPhone(""); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 8, padding: "9px 0", fontSize: 12, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {!addingNewCustomer && !showCustomerDrop && <button onClick={function() { setAddingNewCustomer(true); }} style={{ marginTop: 6, background: "none", border: "none", color: GOLD_DIM, fontSize: 12, cursor: "pointer", fontWeight: 700 }}>+ Add new client</button>}
                </div>
              )}
            </div>

            {/* Default Stylist */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Default Stylist</div>
              {staffList.length === 0 ? (
                <div style={{ padding: "10px 12px", background: "#FFFBEB", border: "1.5px dashed #FDE68A", borderRadius: 10, fontSize: 12, color: "#92400E", fontWeight: 700 }}>
                  No staff added yet — go to the <b>Staff</b> tab to add your team.
                </div>
              ) : (
                <select value={selStaff} onChange={function(e) { setSelStaff(e.target.value); }} style={Object.assign({}, inputStyle, { width: "100%", color: selStaff ? DARK : "#aaa" })}>
                  <option value="">Select stylist</option>
                  {staffList.map(function(s) { return <option key={s.id} value={s.name}>{s.name} · {s.role}</option>; })}
                </select>
              )}
              <div style={{ fontSize: 10, color: "#aaa", marginTop: 4 }}>Auto-fills new items — you can reassign each service in the cart below</div>
            </div>

            {/* Type toggle */}
            <div style={{ display: "flex", background: BLACK, borderRadius: 10, padding: 3, marginBottom: 12, border: "1px solid " + GOLD_DIM }}>
              {["services", "products"].map(function(t) {
                return <button key={t} onClick={function() { setCatFilter("All"); setTypeFilter(t); }} style={{ flex: 1, border: "none", borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 700, background: typeFilter === t ? "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")" : "transparent", color: typeFilter === t ? BLACK : "rgba(255,255,255,0.4)", cursor: "pointer" }}>{t === "services" ? "💇 Services" : "🧴 Products"}</button>;
              })}
            </div>

            {/* Category filter */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
              {(typeFilter === "services" ? CATS : ["All", "Hair", "Nails", "Beauty"]).map(function(c) {
                return <button key={c} onClick={function() { setCatFilter(c); }} style={{ padding: "5px 12px", borderRadius: 20, border: "1.5px solid " + (catFilter === c ? GOLD : GOLD_DIM + "66"), background: catFilter === c ? "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")" : WHITE, color: catFilter === c ? BLACK : GOLD_DIM, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{c}</button>;
              })}
            </div>

            {/* Items grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {typeFilter === "services" && servicesList.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "32px 20px", background: WHITE, borderRadius: 12, border: "1.5px dashed " + GOLD_DIM + "66" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✂️</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 4 }}>No services added yet</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Go to the <b>Services</b> tab to add your first service.</div>
                </div>
              )}
              {typeFilter === "products" && products.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "32px 20px", background: WHITE, borderRadius: 12, border: "1.5px dashed " + GOLD_DIM + "66" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🧴</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: DARK, marginBottom: 4 }}>No products added yet</div>
                  <div style={{ fontSize: 11, color: "#888" }}>Go to the <b>Stock</b> tab to add your first product.</div>
                </div>
              )}
              {(typeFilter === "services" ? servicesList.filter(function(s) { return catFilter === "All" || s.cat === catFilter; }) : products.filter(function(p) { return catFilter === "All" || p.cat === catFilter; })).map(function(item) {
                return (
                  <div key={item.id} onClick={function() { addToCart(item, typeFilter === "services" ? "service" : "product"); }} style={{ background: WHITE, borderRadius: 12, padding: "12px 10px", cursor: "pointer", border: "1.5px solid " + GOLD_DIM + "44" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: DARK, marginBottom: 4, lineHeight: 1.3 }}>{item.name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: GOLD_DIM }}>{fmt(item.price)}</span>
                      {typeFilter === "products" && <span style={{ fontSize: 10, color: item.stock <= 5 ? RED : GREEN, fontWeight: 700 }}>{item.stock} left</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cart */}
            {cart.length > 0 && (
              <div style={{ background: WHITE, borderRadius: 14, padding: 16, boxShadow: "0 2px 16px rgba(201,168,76,0.12)", border: "1px solid " + GOLD_DIM + "55" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: DARK }}>🛒 Cart</div>
                  {stylistsInCart.length > 1 && (
                    <span style={{ fontSize: 10, background: "#EEF2FF", color: "#4338CA", padding: "3px 8px", borderRadius: 20, fontWeight: 800 }}>
                      👥 {stylistsInCart.length} stylists
                    </span>
                  )}
                </div>
                {cart.map(function(item) {
                  return (
                    <div key={item.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #f5f5f5" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{item.type === "service" ? "✂ Service" : "🧴 Product"} · Qty: {item.qty} · {fmt(item.price)} each</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: GOLD_DIM }}>{fmt(item.price * item.qty)}</span>
                          <button onClick={function() { removeFromCart(item.id); }} style={{ background: "none", border: "none", color: RED, fontSize: 16, cursor: "pointer", padding: 0 }}>×</button>
                        </div>
                      </div>
                      {item.type === "service" && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <span style={{ fontSize: 10, color: "#aaa" }}>by</span>
                          <select
                            value={item.stylist || ""}
                            onChange={function(e) { setItemStylist(item.id, e.target.value); }}
                            style={{ flex: 1, borderRadius: 8, border: "1.5px solid " + GOLD_DIM + "66", padding: "5px 8px", fontSize: 12, fontFamily: "inherit", outline: "none", color: item.stylist ? DARK : "#aaa", background: WHITE }}
                          >
                            <option value="">Select stylist for this item</option>
                            {staffList.map(function(s) { return <option key={s.id} value={s.name}>{s.name}</option>; })}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ borderTop: "1px dashed " + GOLD_DIM + "66", marginTop: 10, paddingTop: 10 }}>
                  {/* Subtotals */}
                  {serviceTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 3 }}><span>Services subtotal</span><span>{fmt(serviceTotal)}</span></div>}

                  {/* Discount row */}
                  {showDiscount && serviceTotal > 0 && (
                    <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "10px 12px", marginBottom: 8, border: "1px solid #BBF7D0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>🏷️ Discount (services only)</span>
                        <button onClick={clearDiscount} style={{ background: "none", border: "none", color: RED, fontSize: 14, cursor: "pointer", padding: 0 }}>×</button>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                        <button onClick={function() { setDiscountType("pct"); }} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid " + (discountType === "pct" ? GREEN : "#ddd"), background: discountType === "pct" ? "#D1FAE5" : WHITE, color: discountType === "pct" ? "#065F46" : "#888", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>% Percent</button>
                        <button onClick={function() { setDiscountType("fixed"); }} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid " + (discountType === "fixed" ? GREEN : "#ddd"), background: discountType === "fixed" ? "#D1FAE5" : WHITE, color: discountType === "fixed" ? "#065F46" : "#888", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>KES Fixed</button>
                      </div>
                      <input
                        type="number"
                        placeholder={discountType === "pct" ? "e.g. 10 for 10%" : "e.g. 500 for KES 500"}
                        value={discountValue}
                        onChange={function(e) { setDiscountValue(e.target.value); }}
                        style={{ width: "100%", borderRadius: 8, border: "1.5px solid #BBF7D0", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 6 }}
                      />
                      <input
                        type="text"
                        placeholder="Reason (e.g. Loyalty, Staff, Voucher)"
                        value={discountReason}
                        onChange={function(e) { setDiscountReason(e.target.value); }}
                        style={{ width: "100%", borderRadius: 8, border: "1.5px solid #BBF7D0", padding: "8px 10px", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                      />
                      {discountAmt > 0 && (
                        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "#166534" }}>
                          Saving: {fmt(discountAmt)} {discountType === "pct" ? "(" + discountNum + "%)" : ""}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Show discount applied */}
                  {discountAmt > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: GREEN, fontWeight: 700, marginBottom: 3 }}>
                      <span>Discount {discountReason ? "— " + discountReason : ""}</span>
                      <span>- {fmt(discountAmt)}</span>
                    </div>
                  )}

                  {productTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 3 }}><span>Products subtotal</span><span>{fmt(productTotal)}</span></div>}

                  {/* Grand total */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 16, color: DARK, marginBottom: 4, marginTop: 4 }}>
                    <span>Total</span><span style={{ color: GOLD_DIM }}>{fmt(cartTotal)}</span>
                  </div>

                  {/* Commission */}
                  {commission > 0 && (
                    <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                      {stylistsInCart.length > 1 ? (
                        <div>
                          <div style={{ fontWeight: 700, color: "#666", marginBottom: 3 }}>Commission by stylist:</div>
                          {Object.entries(commissionByStylist).map(function(entry, i) {
                            return <div key={i} style={{ display: "flex", justifyContent: "space-between" }}><span>{entry[0]}</span><span style={{ fontWeight: 700 }}>{fmt(entry[1])}</span></div>;
                          })}
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, paddingTop: 3, borderTop: "1px dashed #ddd", fontWeight: 800 }}>
                            <span>Total commission</span><span>{fmt(commission)}</span>
                          </div>
                        </div>
                      ) : (
                        <span>
                          Staff commission: {fmt(commission)}
                          <span style={{ color: "#aaa" }}> · {selStaff ? rateForStylistName(selStaff) * 100 : 40}% on post-discount services</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Add discount button */}
                  {!showDiscount && serviceTotal > 0 && (
                    <button onClick={function() { setShowDiscount(true); }} style={{ width: "100%", background: "#F0FDF4", border: "1.5px dashed #4ADE80", borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 700, color: "#166534", cursor: "pointer", marginBottom: 10 }}>
                      🏷️ Add Discount / Voucher
                    </button>
                  )}

                  {/* Payment method — driven by what the salon has enabled in Settings */}
                  {(function() {
                    var enabled = (salon && salon.enabled_payment_methods) || ["Cash", "Till"];
                    // Always include Cash; add configured M-Pesa methods
                    var methods = ["Cash"].concat(enabled.filter(function(m) { return m !== "Cash"; }));
                    var icons = { Cash: "💵", Till: "📲", Paybill: "🏦", "Send Money": "📱" };
                    var labels = { Cash: "Cash", Till: "Buy Goods", Paybill: "Paybill", "Send Money": "Send Money" };
                    return (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                          {methods.map(function(m) {
                            return (
                              <button key={m} onClick={function() { setPayMethod(m); }}
                                style={{ flex: 1, minWidth: 70, border: "2px solid " + (payMethod === m ? GOLD : GOLD_DIM + "66"), borderRadius: 8, padding: "8px 4px", background: payMethod === m ? "linear-gradient(135deg," + BLACK + ",#2C1F00)" : WHITE, color: payMethod === m ? GOLD_LT : DARK, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                {icons[m] || "💳"} {labels[m] || m}
                              </button>
                            );
                          })}
                        </div>
                        {payMethod !== "Cash" && (
                          <MpesaInstructions
                            amount={cartTotal}
                            reference={clientName}
                            compact={true}
                            salon={salon}
                            variant={payMethod}
                          />
                        )}
                      </div>
                    );
                  })()}
                  <GoldBtn onClick={checkout} style={{ width: "100%" }}>
                    {payMethod === "Cash" ? "✓ Complete Sale · " + fmt(cartTotal) : "📱 Collect Payment · " + fmt(cartTotal)}
                  </GoldBtn>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── APPOINTMENTS ── */}
        {page === "appointments" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: DARK }}>Bookings</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={function(){ setCalView(function(v){ return !v; }); }} style={{ background: calView ? "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")" : CREAM, color: calView ? BLACK : GOLD_DIM, border: "1px solid " + GOLD_DIM, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {calView ? "📋 List" : "📅 Calendar"}
                </button>
                <button onClick={loadAppointments} style={{ background: CREAM, color: GOLD_DIM, border: "1px solid " + GOLD_DIM, borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↻</button>
              </div>
            </div>

            <TomorrowReminders appointments={appointments} salonName={salonName} customers={customers} salon={salon} appointmentCampaign={appointmentCampaign} />

            <BirthdayReminders customers={customers} salonName={salonName} salon={salon} birthdayCampaign={birthdayCampaign} />

            {!calView && (
              <div style={{ background: WHITE, borderRadius: 12, padding: "12px 14px", marginBottom: 14, border: "1px solid " + GOLD_DIM + "44" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 160 }}>
                    <span style={{ fontSize: 11, color: "#888", fontWeight: 700, whiteSpace: "nowrap" }}>📅 Date</span>
                    <input type="date" value={apptDate} onChange={function(e) { setApptDate(e.target.value); setShowAllAppts(false); }} style={{ flex: 1, borderRadius: 8, border: "1.5px solid " + GOLD_DIM, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", color: DARK }} />
                  </div>
                  <button onClick={function() { var t = new Date(); setApptDate(t.getFullYear() + "-" + String(t.getMonth()+1).padStart(2,"0") + "-" + String(t.getDate()).padStart(2,"0")); setShowAllAppts(false); }} style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid " + GOLD, background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")", color: BLACK, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Today</button>
                  <button onClick={function() { setShowAllAppts(function(v) { return !v; }); }} style={{ padding: "6px 12px", borderRadius: 20, border: "1.5px solid " + (showAllAppts ? GOLD_DIM : GOLD_DIM + "66"), background: showAllAppts ? GOLD_DIM : "transparent", color: showAllAppts ? WHITE : GOLD_DIM, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{showAllAppts ? "Showing All" : "Show All"}</button>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  {[{ label: "Pending", color: "#92400E", bg: "#FEF3C7", status: "pending" }, { label: "Done", color: "#065F46", bg: "#D1FAE5", status: "done" }, { label: "Cancelled", color: "#991B1B", bg: "#FEE2E2", status: "cancelled" }].map(function(s, i) {
                    return <div key={i} style={{ padding: "4px 10px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 800 }}>{s.label}: {visibleAppointments.filter(function(a) { return a.status === s.status; }).length}</div>;
                  })}
                </div>
              </div>
            )}

            {calView && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ background: WHITE, borderRadius: 12, padding: "10px 14px", marginBottom: 10, border: "1px solid " + GOLD_DIM + "44", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 11, color: "#888", fontWeight: 700, whiteSpace: "nowrap" }}>📅 Date</span>
                  <input type="date" value={apptDate} onChange={function(e) { setApptDate(e.target.value); }} style={{ flex: 1, borderRadius: 8, border: "1.5px solid " + GOLD_DIM, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", color: DARK }} />
                </div>
                <CalendarView
                  appointments={appointments}
                  staffList={staffList}
                  date={apptDate}
                  salonName={salonName}
                  onAction={function(action, a) {
                    if (action === "convert") convertToSale(a);
                    if (action === "done")    markDone(a.id);
                    if (action === "cancel")  markCancelled(a.id);
                  }}
                />
              </div>
            )}

            {!calView && (
              <div>
                {loadingAppts && <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa" }}><div style={{ fontSize: 24 }}>⏳</div><div style={{ fontSize: 13 }}>Loading...</div></div>}
                {!loadingAppts && visibleAppointments.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "#aaa" }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
                    <div style={{ fontSize: 14, marginBottom: 8 }}>{showAllAppts ? "No bookings found" : "No bookings for this date"}</div>
                    {!showAllAppts && <button onClick={function() { setShowAllAppts(true); }} style={{ background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 20, padding: "8px 16px", color: GOLD_DIM, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Show all bookings</button>}
                  </div>
                )}
                {!loadingAppts && visibleAppointments.map(function(a) {
                  return (
                    <div key={a.id} style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 10, border: "1.5px solid " + (a.status === "pending" ? GOLD_DIM + "88" : a.status === "done" ? "#BBF7D0" : "#FEE2E2") }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <div><div style={{ fontWeight: 800, fontSize: 15, color: DARK }}>{a.name}</div><div style={{ fontSize: 12, color: "#888" }}>📞 {a.phone}</div></div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <div style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: a.status === "pending" ? "#FEF3C7" : a.status === "done" ? "#D1FAE5" : "#FEE2E2", color: a.status === "pending" ? "#92400E" : a.status === "done" ? "#065F46" : "#991B1B" }}>
                            {a.status === "pending" ? "⏳ Pending" : a.status === "done" ? "✅ Done" : "❌ Cancelled"}
                          </div>
                          <div style={{ padding: "3px 8px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: a.payment_status === "paid_upfront" ? "#D1FAE5" : "#FEF3C7", color: a.payment_status === "paid_upfront" ? "#065F46" : "#92400E" }}>
                            {a.payment_status === "paid_upfront" ? "💚 Paid" : "🕐 Pay at Salon"}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: DARK, marginBottom: 4 }}>💇 <b>{a.service}</b> {a.price ? "· KES " + Number(a.price).toLocaleString() : ""}</div>
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>👩‍💼 {a.stylist}</div>
                      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>📅 {a.date} at {a.time}</div>
                      {a.status === "pending" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button onClick={function() { convertToSale(a); }} style={{ width: "100%", background: "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")", color: BLACK, border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 900, fontSize: 13, cursor: "pointer" }}>🛒 Client Arrived — Convert to Sale</button>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={function() { markDone(a.id); }} style={{ flex: 1, background: "#D1FAE5", color: "#065F46", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>✅ Mark Done</button>
                            <button onClick={function() { markCancelled(a.id); }} style={{ flex: 1, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 8, padding: "8px 0", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>❌ Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CUSTOMERS ── */}
        {page === "customers" && (
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: DARK, marginBottom: 4 }}>Clients</div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>{customers.length} total · {frequentCustomers.length} regulars · {atRiskCustomers.length} not seen in {winbackThreshold}+ days</div>

            {/* Loyalty tier summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                { tier: "Bronze", icon: "🥉", color: "#92400E", bg: "#FFF7ED", min: 1, max: 3 },
                { tier: "Silver", icon: "🥈", color: "#475569", bg: "#F1F5F9", min: 4, max: 7 },
                { tier: "Gold",   icon: "🥇", color: "#92400E", bg: "#FEF3C7", min: 8, max: 14 },
                { tier: "VIP",    icon: "💎", color: "#7C3AED", bg: "#F3E8FF", min: 15, max: Infinity },
              ].map(function(t, i) {
                var count = customers.filter(function(c) {
                  var v = c.visit_count || 0; var sp = c.total_spend || 0;
                  if (t.tier === "VIP") return v >= 15 || sp >= 30000;
                  return v >= t.min && v <= t.max;
                }).length;
                return (
                  <div key={i} style={{ background: t.bg, borderRadius: 10, padding: "10px 6px", textAlign: "center", border: "1px solid " + t.color + "33" }}>
                    <div style={{ fontSize: 16 }}>{t.icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: t.color, marginTop: 2 }}>{count}</div>
                    <div style={{ fontSize: 9, color: t.color, fontWeight: 700, marginTop: 1 }}>{t.tier}</div>
                  </div>
                );
              })}
            </div>
            {atRiskCustomers.length > 0 && (
              <div style={{ background: "#FFF5F5", borderRadius: 12, padding: 14, marginBottom: 14, border: "1.5px solid #FEE2E2" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: RED, marginBottom: 10 }}>⚠️ Not seen in {winbackThreshold}+ days</div>
                {atRiskCustomers.map(function(c) {
                  var wbStatus = winbackSmsStatus[c.id] || "idle";
                  var canSendWinbackSms = !!(winbackCampaign && c.id && !c.marketing_opt_out);
                  return (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "8px 10px", background: WHITE, borderRadius: 8, border: "1px solid #FEE2E2" }}>
                      <div><div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{c.name}</div><div style={{ fontSize: 11, color: "#888" }}>{c.phone} · Last: {c.last_visit || "unknown"}</div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {canSendWinbackSms && (
                          <button
                            onClick={function() { sendWinbackSms(c); }}
                            disabled={wbStatus === "sending" || wbStatus === "sent"}
                            title={wbStatus === "error" ? "Failed — tap to retry" : "Send winback SMS"}
                            style={{
                              background: wbStatus === "sent" ? "#D1FAE5" : wbStatus === "error" ? "#FEE2E2" : GOLD,
                              color: wbStatus === "sent" ? "#065F46" : wbStatus === "error" ? "#991B1B" : BLACK,
                              border: "none", borderRadius: 20, padding: "7px 12px", fontSize: 11, fontWeight: 800,
                              cursor: (wbStatus === "sending" || wbStatus === "sent") ? "default" : "pointer", whiteSpace: "nowrap",
                            }}
                          >
                            {wbStatus === "sent" ? "✅ Sent" : wbStatus === "error" ? "⚠️ Retry" : wbStatus === "sending" ? "Sending…" : "📩 SMS"}
                          </button>
                        )}
                        {c.phone && <a href={"https://wa.me/254" + c.phone.replace(/^0/,"").replace(/\D/g,"") + "?text=" + encodeURIComponent("Hi " + c.name + "! We miss you at " + salonName + " 💕\nBook: " + window.location.origin + bookingHref)} target="_blank" rel="noreferrer" style={{ background: "#25D366", color: WHITE, borderRadius: 20, padding: "7px 12px", fontSize: 11, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" }}>📲 WhatsApp</a>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ fontWeight: 800, fontSize: 14, color: DARK, marginBottom: 10 }}>All Clients</div>
            {customers.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: "#aaa" }}><div style={{ fontSize: 36, marginBottom: 8 }}>👤</div><div>No clients yet.</div></div>}
            {customers.map(function(c) {
              return (
                <div key={c.id} style={{ background: WHITE, borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: "1px solid " + GOLD_DIM + "33" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: DARK, display: "flex", alignItems: "center", gap: 6 }}>
                        {c.name}
                        <LoyaltyBadge customer={c} size="sm" />
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{c.phone} · Last: {c.last_visit || "—"}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ textAlign: "right" }}><div style={{ fontSize: 13, fontWeight: 800, color: GOLD_DIM }}>{fmt(c.total_spend)}</div><div style={{ fontSize: 10, color: "#aaa" }}>{c.visit_count} visit{c.visit_count !== 1 ? "s" : ""}</div></div>
                      {c.phone && <a href={"https://wa.me/254" + c.phone.replace(/^0/,"").replace(/\D/g,"") + "?text=" + encodeURIComponent("Hi " + c.name + "! 💕 Book: " + window.location.origin + bookingHref)} target="_blank" rel="noreferrer" style={{ background: "#25D366", color: WHITE, borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, textDecoration: "none", flexShrink: 0 }}>📲</a>}
                      {isAdmin && (
                        <button
                          onClick={function() { deleteCustomer(c); }}
                          style={{ background: "none", border: "1px solid #fca5a5", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, cursor: "pointer", flexShrink: 0, color: RED }}
                          title="Delete customer"
                        >🗑</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {page === "dashboard" && <Dashboard sales={sales} customers={customers} staffList={staffList} products={products} feedbacks={feedbacks} expenses={expenses} darkMode={darkMode} salonName={salonName} onNavigate={function(tab) { setPage(tab); }} />}

        {page === "reviews" && (
          <ReviewsPage darkMode={darkMode} />
        )}

        {/* ── STAFF ── */}
        {page === "staff" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: DARK }}>Staff & Commissions</div>
              <GoldBtn onClick={function() { setShowAddStaff(true); setNewStaff({ name: "", role: "Stylist", commission_pct: 40 }); }} style={{ padding: "8px 16px", fontSize: 12 }}>+ Add Staff</GoldBtn>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 16 }}>
              📅 Today's figures only · resets automatically at midnight{loadingStaffStats ? " · refreshing..." : ""}
            </div>
            {showAddStaff && (
              <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 16, border: "1.5px solid " + GOLD }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: DARK, marginBottom: 12 }}>New Staff Member</div>
                <input placeholder="Full name" value={newStaff.name} onChange={function(e) { setNewStaff(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                <select value={newStaff.role} onChange={function(e) { setNewStaff(function(p) { return Object.assign({}, p, { role: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}>
                  <option>Stylist</option><option>Barber</option><option>Nail Technician</option><option>Makeup Artist</option><option>Receptionist</option>
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>Commission %:</span>
                  <input type="number" value={newStaff.commission_pct} onChange={function(e) { setNewStaff(function(p) { return Object.assign({}, p, { commission_pct: parseInt(e.target.value) || 0 }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <GoldBtn onClick={async function() { if (!newStaff.name) return alert("Please enter staff name"); var saved = await db("POST", "staff", Object.assign({}, newStaff, { active: true })); setStaffList(function(p) { return p.concat([(saved && saved[0]) || Object.assign({}, newStaff, { id: Date.now() })]); }); setShowAddStaff(false); setNewStaff({ name: "", role: "Stylist", commission_pct: 40 }); }} style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>Save Staff</GoldBtn>
                  <button onClick={function() { setShowAddStaff(false); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "10px 0", fontSize: 13, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                </div>
              </div>
            )}
            {staffStats.map(function(s) {
              return (
                <div key={s.id} style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 12, border: "1px solid " + GOLD_DIM + "44" }}>
                  {editingStaff && editingStaff.id === s.id ? (
                    <div>
                      <input value={editingStaff.name} onChange={function(e) { setEditingStaff(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                      <select value={editingStaff.role} onChange={function(e) { setEditingStaff(function(p) { return Object.assign({}, p, { role: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}>
                        <option>Stylist</option><option>Barber</option><option>Nail Technician</option><option>Makeup Artist</option><option>Receptionist</option>
                      </select>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 12, color: "#888" }}>Commission %:</span>
                        <input type="number" value={editingStaff.commission_pct} onChange={function(e) { setEditingStaff(function(p) { return Object.assign({}, p, { commission_pct: parseInt(e.target.value) || 0 }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <GoldBtn onClick={async function() { await db("PATCH", "staff", { name: editingStaff.name, role: editingStaff.role, commission_pct: editingStaff.commission_pct }, "?id=eq." + editingStaff.id); setStaffList(function(p) { return p.map(function(x) { return x.id === editingStaff.id ? Object.assign({}, x, editingStaff) : x; }); }); setEditingStaff(null); }} style={{ flex: 1, padding: "9px 0", fontSize: 12 }}>Save</GoldBtn>
                        <button onClick={function() { setEditingStaff(null); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "9px 0", fontSize: 12, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg," + BLACK + ",#2C1F00)", border: "2px solid " + GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: GOLD_LT, fontSize: 18, flexShrink: 0 }}>{s.name[0]}</div>
                        <div style={{ flex: 1 }}><div style={{ fontWeight: 800, fontSize: 15, color: DARK }}>{s.name}</div><div style={{ fontSize: 12, color: "#888" }}>{s.role} · {s.commission_pct || 40}% commission</div></div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={function() { setEditingStaff(Object.assign({}, s)); }} style={{ background: CREAM, border: "1px solid " + GOLD_DIM, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>✏️ Edit</button>
                          <button onClick={async function() { if (!window.confirm("Deactivate " + s.name + "?")) return; await db("PATCH", "staff", { active: false }, "?id=eq." + s.id); setStaffList(function(p) { return p.filter(function(x) { return x.id !== s.id; }); }); }} style={{ background: "#FEE2E2", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: RED, cursor: "pointer", fontWeight: 700 }}>Remove</button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        {[{ label: "Services", value: s.salesCount }, { label: "Revenue", value: fmt(s.revenue) }, { label: "Commission", value: fmt(s.commission) }].map(function(m, i) {
                          return <div key={i} style={{ background: CREAM, borderRadius: 8, padding: "8px 10px", textAlign: "center", border: "1px solid " + GOLD_DIM + "33" }}><div style={{ fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase" }}>{m.label}</div><div style={{ fontSize: 13, fontWeight: 900, color: GOLD_DIM, marginTop: 2 }}>{m.value}</div></div>;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── SERVICES ── */}
        {page === "services" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: DARK }}>Services</div>
              <GoldBtn onClick={function() { setShowAddService(true); setNewService({ name: "", cat: "Hair", price: "" }); }} style={{ padding: "8px 16px", fontSize: 12 }}>+ Add Service</GoldBtn>
            </div>
            {showAddService && (
              <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 16, border: "1.5px solid " + GOLD }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: DARK, marginBottom: 12 }}>New Service</div>
                <input placeholder="Service name" value={newService.name} onChange={function(e) { setNewService(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                <select value={newService.cat} onChange={function(e) { setNewService(function(p) { return Object.assign({}, p, { cat: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}>
                  <option>Hair</option><option>Nails</option><option>Beauty</option><option>Spa</option><option>Barber</option>
                </select>
                <input placeholder="Price (KES)" type="number" value={newService.price} onChange={function(e) { setNewService(function(p) { return Object.assign({}, p, { price: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <GoldBtn onClick={async function() { if (!newService.name || !newService.price) return alert("Please enter name and price"); var saved = await db("POST", "services", Object.assign({}, newService, { price: parseInt(newService.price), active: true })); setServicesList(function(p) { return p.concat([(saved && saved[0]) || Object.assign({}, newService, { price: parseInt(newService.price), id: Date.now() })]); }); setShowAddService(false); setNewService({ name: "", cat: "Hair", price: "" }); }} style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>Save Service</GoldBtn>
                  <button onClick={function() { setShowAddService(false); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "10px 0", fontSize: 13, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                </div>
              </div>
            )}
            {CATS.filter(function(c) { return c !== "All"; }).map(function(cat) {
              var catServices = servicesList.filter(function(s) { return s.cat === cat; });
              if (catServices.length === 0) return null;
              return (
                <div key={cat} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: GOLD_DIM, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>{cat}</div>
                  {catServices.map(function(s) {
                    return (
                      <div key={s.id} style={{ background: WHITE, borderRadius: 12, padding: "12px 14px", marginBottom: 6, border: "1px solid " + GOLD_DIM + "33" }}>
                        {editingService && editingService.id === s.id ? (
                          <div>
                            <input value={editingService.name} onChange={function(e) { setEditingService(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                              <select value={editingService.cat} onChange={function(e) { setEditingService(function(p) { return Object.assign({}, p, { cat: e.target.value }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                                <option>Hair</option><option>Nails</option><option>Beauty</option><option>Spa</option><option>Barber</option>
                              </select>
                              <input type="number" value={editingService.price} onChange={function(e) { setEditingService(function(p) { return Object.assign({}, p, { price: parseInt(e.target.value) || 0 }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <GoldBtn onClick={async function() { await db("PATCH", "services", { name: editingService.name, cat: editingService.cat, price: editingService.price }, "?id=eq." + editingService.id); setServicesList(function(p) { return p.map(function(x) { return x.id === editingService.id ? Object.assign({}, x, editingService) : x; }); }); setEditingService(null); }} style={{ flex: 1, padding: "8px 0", fontSize: 12 }}>Save</GoldBtn>
                              <button onClick={function() { setEditingService(null); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "8px 0", fontSize: 12, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div><div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>{s.name}</div><div style={{ fontSize: 12, fontWeight: 900, color: GOLD_DIM, marginTop: 2 }}>{fmt(s.price)}</div></div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={function() { setEditingService(Object.assign({}, s)); }} style={{ background: CREAM, border: "1px solid " + GOLD_DIM, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>✏️ Edit</button>
                              <button onClick={async function() { if (!window.confirm("Remove " + s.name + "?")) return; await db("PATCH", "services", { active: false }, "?id=eq." + s.id); setServicesList(function(p) { return p.filter(function(x) { return x.id !== s.id; }); }); }} style={{ background: "#FEE2E2", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: RED, cursor: "pointer", fontWeight: 700 }}>Remove</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* ── EXPENSES ── */}
        {page === "expenses" && (
          <ExpensesPage darkMode={darkMode} />
        )}

        {/* ── SHARE ── */}
        {page === "share" && (
          <div style={{ padding: "4px 0" }}>
            <ShareBookingPanel salon={salon} />
          </div>
        )}

        {page === "marketing" && (
          <div style={{ padding: "4px 0" }}>

            <div style={{ background: WHITE, borderRadius: 14, padding: 18, border: "1.5px solid " + GOLD_DIM + "66", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: DARK }}>⚙️ Automated Messages</div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, color: (marketingConfig && marketingConfig.is_sms_active) ? "#065F46" : "#999", cursor: "pointer" }}>
                  SMS Marketing: {(marketingConfig && marketingConfig.is_sms_active) ? "ON" : "OFF"}
                  <input type="checkbox" checked={!!(marketingConfig && marketingConfig.is_sms_active)} onChange={toggleSmsActive} />
                </label>
              </div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
                Master switch for all automated SMS below. Turning this off stops every automated and manual SMS send for this salon, instantly.
              </div>

              <CampaignEditorCard
                type="post_sale" label="Post-Sale Thank You" icon="💬"
                placeholder="Thanks for visiting {{salon_name}} today, {{customer_name}}! We hope you loved your visit 💛"
                existingCampaign={allCampaigns.find(function(c) { return c.type === "post_sale"; })}
                onSave={function(t, a, e) { return saveCampaignSettings("post_sale", "Post-Sale Thank You", t, a, e); }}
              />
              <CampaignEditorCard
                type="appointment_reminder" label="Appointment Reminder" icon="📅"
                placeholder="Hi {{customer_name}}! Friendly reminder of your appointment tomorrow at {{salon_name}}. See you then 💛"
                existingCampaign={allCampaigns.find(function(c) { return c.type === "appointment_reminder"; })}
                onSave={function(t, a, e) { return saveCampaignSettings("appointment_reminder", "Appointment Reminder", t, a, e); }}
              />
              <CampaignEditorCard
                type="birthday" label="Birthday Wishes" icon="🎂"
                placeholder="Happy Birthday, {{customer_name}}! 🎉 Everyone at {{salon_name}} wishes you a wonderful day."
                existingCampaign={allCampaigns.find(function(c) { return c.type === "birthday"; })}
                onSave={function(t, a, e) { return saveCampaignSettings("birthday", "Birthday Wishes", t, a, e); }}
              />
              <CampaignEditorCard
                type="winback" label="Winback (lapsed customers)" icon="💔" showWinbackDays
                placeholder="Hi {{customer_name}}, we miss you at {{salon_name}}! Come back soon, we'd love to see you again 💕"
                existingCampaign={allCampaigns.find(function(c) { return c.type === "winback"; })}
                onSave={function(t, a, e) { return saveCampaignSettings("winback", "Winback", t, a, e); }}
              />
            </div>

            <div style={{ background: WHITE, borderRadius: 14, padding: 18, border: "1.5px solid " + GOLD_DIM + "66" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: DARK, marginBottom: 4 }}>📣 Send a Broadcast Message</div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>Write a one-off message and send it to a group of customers via SMS, right now.</div>

              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {[
                  { id: "all", label: "All Customers (" + eligibleFor("all").length + ")" },
                  { id: "frequent", label: "Frequent (" + eligibleFor("frequent").length + ")" },
                  { id: "atrisk", label: "At-Risk (" + eligibleFor("atrisk").length + ")" },
                ].map(function(seg) {
                  return (
                    <button
                      key={seg.id}
                      onClick={function() { setBroadcastSegment(seg.id); }}
                      disabled={broadcastSending}
                      style={{
                        padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: broadcastSending ? "default" : "pointer",
                        border: "1.5px solid " + (broadcastSegment === seg.id ? GOLD : GOLD_DIM),
                        background: broadcastSegment === seg.id ? GOLD : WHITE,
                        color: broadcastSegment === seg.id ? BLACK : DARK,
                      }}
                    >
                      {seg.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>
                This will reach <b>{broadcastRecipients.length}</b> {broadcastRecipients.length === 1 ? "customer" : "customers"} (customers with no phone on file or who have opted out are automatically excluded).
              </div>

              <textarea
                value={broadcastMessage}
                onChange={function(e) { setBroadcastMessage(e.target.value); }}
                disabled={broadcastSending}
                placeholder="e.g. We are running a 20% off special this weekend — come treat yourself! 💛"
                rows={4}
                style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "12px", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", marginBottom: 14, boxSizing: "border-box" }}
              />

              {!broadcastSending && !broadcastDone && (
                <button
                  onClick={sendBroadcast}
                  disabled={!broadcastMessage.trim() || broadcastRecipients.length === 0}
                  style={{
                    background: (!broadcastMessage.trim() || broadcastRecipients.length === 0) ? "#E5E7EB" : GOLD,
                    color: (!broadcastMessage.trim() || broadcastRecipients.length === 0) ? "#999" : BLACK,
                    border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 800, fontSize: 13,
                    cursor: (!broadcastMessage.trim() || broadcastRecipients.length === 0) ? "default" : "pointer",
                  }}
                >
                  Send to {broadcastRecipients.length} {broadcastRecipients.length === 1 ? "Customer" : "Customers"}
                </button>
              )}

              {broadcastSending && (
                <div style={{ fontSize: 13, fontWeight: 700, color: DARK }}>
                  Sending… {broadcastProgress.sent + broadcastProgress.failed} / {broadcastProgress.total}
                  {broadcastProgress.failed > 0 && <span style={{ color: "#991B1B" }}> ({broadcastProgress.failed} failed)</span>}
                </div>
              )}

              {broadcastDone && !broadcastSending && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: broadcastProgress.failed === 0 ? "#065F46" : "#991B1B", marginBottom: 10 }}>
                    {broadcastProgress.failed === 0
                      ? "✅ Done — " + broadcastProgress.sent + " sent."
                      : "⚠️ Done — " + broadcastProgress.sent + " sent, " + broadcastProgress.failed + " failed."}
                  </div>
                  <button
                    onClick={function() { setBroadcastMessage(""); setBroadcastDone(false); setBroadcastProgress({ sent: 0, failed: 0, total: 0 }); }}
                    style={{ background: WHITE, border: "1.5px solid " + GOLD_DIM, borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                  >
                    Send Another
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

                {page === "settings" && (
          <SalonSettingsPage
            salon={salon}
            onSettingsUpdated={function() { loadAll(); }}
          />
        )}

        {/* ── INVENTORY ── */}
        {page === "inventory" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: DARK }}>Product Stock</div>
              <GoldBtn onClick={function() { setShowAddProduct(function(p) { return !p; }); }} style={{ padding: "8px 16px", fontSize: 12 }}>+ Add Product</GoldBtn>
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 14 }}>Tap + or − to adjust stock</div>
            {showAddProduct && (
              <div style={{ background: WHITE, borderRadius: 14, padding: 16, marginBottom: 16, border: "1.5px solid " + GOLD }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: DARK, marginBottom: 12 }}>New Product</div>
                <input placeholder="Product name" value={newProduct.name} onChange={function(e) { setNewProduct(function(p) { return Object.assign({}, p, { name: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                <select value={newProduct.cat} onChange={function(e) { setNewProduct(function(p) { return Object.assign({}, p, { cat: e.target.value }); }); }} style={{ width: "100%", borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginBottom: 8 }}>
                  <option>Hair</option><option>Nails</option><option>Beauty</option><option>Spa</option>
                </select>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input placeholder="Price (KES)" type="number" value={newProduct.price} onChange={function(e) { setNewProduct(function(p) { return Object.assign({}, p, { price: e.target.value }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                  <input placeholder="Stock qty" type="number" value={newProduct.stock} onChange={function(e) { setNewProduct(function(p) { return Object.assign({}, p, { stock: e.target.value }); }); }} style={{ flex: 1, borderRadius: 10, border: "1.5px solid " + GOLD_DIM, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <GoldBtn onClick={async function() { if (!newProduct.name || !newProduct.price) return alert("Please enter name and price"); var prod = { id: "PRD" + Date.now(), name: newProduct.name, cat: newProduct.cat, price: parseInt(newProduct.price), stock: parseInt(newProduct.stock) || 0 }; var saved = await db("POST", "stock", prod); setProducts(function(p) { return p.concat([(saved && saved[0]) || prod]); }); setShowAddProduct(false); setNewProduct({ name: "", cat: "Hair", price: "", stock: "" }); }} style={{ flex: 1, padding: "10px 0", fontSize: 13 }}>Save Product</GoldBtn>
                  <button onClick={function() { setShowAddProduct(false); }} style={{ flex: 1, background: "none", border: "1px solid " + GOLD_DIM, borderRadius: 10, padding: "10px 0", fontSize: 13, color: GOLD_DIM, cursor: "pointer", fontWeight: 700 }}>Cancel</button>
                </div>
              </div>
            )}
            {products.map(function(p) {
              var isCritical = p.stock <= 3;
              var isLow      = p.stock > 3 && p.stock <= 5;
              return (
                <div key={p.id} style={{ background: WHITE, borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: "1.5px solid " + (isCritical ? RED : isLow ? "#FEE2E2" : GOLD_DIM + "44") }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: DARK, display: "flex", alignItems: "center", gap: 6 }}>
                        {p.name}
                        {isCritical && <span style={{ fontSize: 9, background: RED, color: WHITE, padding: "2px 6px", borderRadius: 20, fontWeight: 800 }}>🔔 CRITICAL</span>}
                      </div>
                      <div style={{ fontSize: 11, color: "#888" }}>{p.cat} · <span style={{ color: GOLD_DIM, fontWeight: 700 }}>{fmt(p.price)}</span></div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={function() { adjustStock(p.id, -1); }} style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px solid " + RED, background: WHITE, color: RED, fontSize: 18, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                      <div style={{ textAlign: "center", minWidth: 36 }}><div style={{ fontSize: 18, fontWeight: 900, color: isCritical ? RED : isLow ? AMBER : GREEN }}>{p.stock}</div><div style={{ fontSize: 9, color: "#aaa", textTransform: "uppercase" }}>units</div></div>
                      <button onClick={function() { adjustStock(p.id, 1); }} style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px solid " + GREEN, background: WHITE, color: GREEN, fontSize: 18, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                    </div>
                  </div>
                  {isCritical && <div style={{ marginTop: 8, background: "#FEE2E2", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: RED, fontWeight: 700 }}>🔔 Critical — appears in notification bell, reorder now</div>}
                  {isLow && <div style={{ marginTop: 8, background: "#FFF5F5", borderRadius: 6, padding: "5px 8px", fontSize: 11, color: RED, fontWeight: 700 }}>⚠️ Low stock — consider reordering</div>}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
