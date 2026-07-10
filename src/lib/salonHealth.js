// src/lib/salonHealth.js
//
// Extracted from SuperAdminDashboard.jsx, where this logic previously
// lived as inline closures inside the component body. This is the
// logic that decides which salons get flagged as needing attention
// (suspended, expiring subscription, zero activity) and how revenue
// is aggregated across the platform -- both genuinely business-
// critical for whoever runs Trimora Systems, and neither had any
// test coverage before this.
//
// IMPORTANT: this is a pure, behavior-preserving extraction. Every
// expression here is copied verbatim from the removed inline code.
// The only intentional addition is an optional `now` parameter on
// the two time-sensitive functions (defaulting to `new Date()`,
// exactly what the inline version used implicitly) so tests can pass
// a fixed reference time instead of depending on the real clock.

// Flags a single salon based only on fields already present on
// salon_directory -- no extra query needed.
export function getHealthFlags(s, now) {
  now = now || new Date();
  var flags = [];

  if (s.suspended) {
    flags.push({ severity: "high", label: "Suspended" });
  }

  if (s.subscription_expires_at && s.subscription_status !== "lifetime") {
    var expiresAt = new Date(s.subscription_expires_at);
    var daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      flags.push({ severity: "high", label: "Subscription expired" });
    } else if (daysLeft <= 7) {
      flags.push({ severity: "medium", label: "Expires in " + daysLeft + " day" + (daysLeft === 1 ? "" : "s") });
    }
  }

  if ((s.sale_count || 0) === 0) {
    flags.push({ severity: "medium", label: "Zero sales recorded" });
  }

  if ((s.staff_count || 0) === 0) {
    flags.push({ severity: "low", label: "No staff added" });
  }

  if ((s.service_count || 0) === 0) {
    flags.push({ severity: "low", label: "No services added" });
  }

  return flags;
}

// Returns salons with at least one flag, sorted by worst flag first
// (high > medium > low) so the most urgent salons surface at the top.
export function salonsNeedingAttention(salons, now) {
  return salons
    .map(function(s) { return { salon: s, flags: getHealthFlags(s, now) }; })
    .filter(function(item) { return item.flags.length > 0; })
    .sort(function(a, b) {
      var weight = { high: 3, medium: 2, low: 1 };
      var aMax = Math.max.apply(null, a.flags.map(function(f) { return weight[f.severity]; }));
      var bMax = Math.max.apply(null, b.flags.map(function(f) { return weight[f.severity]; }));
      return bMax - aMax;
    });
}

// ── Client-side aggregation — no new views/RPCs needed, just groups
//    the raw payment/salon rows already fetched. ──

export function revenueByMonth(allPayments) {
  var map = {};
  allPayments.forEach(function(p) {
    var d = new Date(p.payment_date);
    var key = d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
    map[key] = (map[key] || 0) + Number(p.amount || 0);
  });
  return Object.keys(map).map(function(k) { return { label: k, value: map[k] }; });
}

export function salonsByMonth(salons) {
  var map = {};
  salons.forEach(function(s) {
    if (!s.created_at) return;
    var d = new Date(s.created_at);
    var key = d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
    map[key] = (map[key] || 0) + 1;
  });
  return Object.keys(map).map(function(k) { return { label: k, value: map[k] }; });
}

export function revenueBySalon(allPayments, salons) {
  var map = {};
  allPayments.forEach(function(p) {
    map[p.salon_id] = (map[p.salon_id] || 0) + Number(p.amount || 0);
  });
  var rows = Object.keys(map).map(function(salonId) {
    var salon = salons.find(function(s) { return s.id === salonId; });
    return { salonId: salonId, name: salon ? salon.name : "Unknown salon", number: salon ? salon.salon_number : null, value: map[salonId] };
  });
  rows.sort(function(a, b) { return b.value - a.value; });
  return rows;
}

// ── Trimora Auto (car wash) equivalents ──────────────────────────────
// Same shape and severity convention as getHealthFlags/salonsNeedingAttention
// above, scoped to salon_directory's auto_* columns (migration 028) --
// only evaluated for salons with the module actually enabled, since an
// un-onboarded salon having zero bays/services/jobs is expected, not a
// health problem.

export function getAutoHealthFlags(s, now) {
  now = now || new Date();
  var flags = [];
  if (!s.auto_enabled) return flags;

  if ((s.auto_bay_count || 0) === 0) {
    flags.push({ severity: "high", label: "No bays configured" });
  }
  if ((s.auto_service_count || 0) === 0) {
    flags.push({ severity: "high", label: "No active services configured" });
  }
  if ((s.auto_job_count || 0) === 0) {
    flags.push({ severity: "medium", label: "Zero jobs recorded" });
  } else if (s.auto_last_job_completed_at) {
    var daysSince = Math.floor((now - new Date(s.auto_last_job_completed_at)) / (1000 * 60 * 60 * 24));
    if (daysSince >= 30) {
      flags.push({ severity: "medium", label: "No completed job in " + daysSince + " days" });
    }
  }
  return flags;
}

export function autoSalonsNeedingAttention(salons, now) {
  return salons
    .filter(function(s) { return s.auto_enabled; })
    .map(function(s) { return { salon: s, flags: getAutoHealthFlags(s, now) }; })
    .filter(function(item) { return item.flags.length > 0; })
    .sort(function(a, b) {
      var weight = { high: 3, medium: 2, low: 1 };
      var aMax = Math.max.apply(null, a.flags.map(function(f) { return weight[f.severity]; }));
      var bMax = Math.max.apply(null, b.flags.map(function(f) { return weight[f.severity]; }));
      return bMax - aMax;
    });
}

// jobs: rows from auto_platform_jobs (migration 028), status='completed' pre-filtered by caller
export function autoRevenueByMonth(jobs) {
  var map = {};
  jobs.forEach(function(j) {
    if (!j.completed_at) return;
    var d = new Date(j.completed_at);
    var key = d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
    map[key] = (map[key] || 0) + Number(j.total_price || 0);
  });
  return Object.keys(map).map(function(k) { return { label: k, value: map[k] }; });
}

export function autoRevenueBySalon(jobs) {
  var map = {};
  var names = {};
  jobs.forEach(function(j) {
    map[j.salon_id] = (map[j.salon_id] || 0) + Number(j.total_price || 0);
    names[j.salon_id] = j.salon_name;
  });
  var rows = Object.keys(map).map(function(salonId) {
    return { salonId: salonId, name: names[salonId] || "Unknown salon", value: map[salonId] };
  });
  rows.sort(function(a, b) { return b.value - a.value; });
  return rows;
}
