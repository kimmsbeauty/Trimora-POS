// src/lib/loyalty.js

export function getLoyaltyTier(customer) {
  var visits = (customer && customer.visit_count) || 0;
  var spend  = (customer && customer.total_spend) || 0;

  if (visits >= 15 || spend >= 30000) {
    return { tier: "VIP", icon: "💎", color: "#7C3AED", bg: "#F3E8FF", border: "#C4B5FD" };
  }
  if (visits >= 8) {
    return { tier: "Gold", icon: "🥇", color: "#92400E", bg: "#FEF3C7", border: "#FCD34D" };
  }
  if (visits >= 4) {
    return { tier: "Silver", icon: "🥈", color: "#475569", bg: "#F1F5F9", border: "#CBD5E1" };
  }
  if (visits >= 1) {
    return { tier: "Bronze", icon: "🥉", color: "#92400E", bg: "#FFF7ED", border: "#FDBA74" };
  }
  return { tier: "New", icon: "✨", color: "#6366F1", bg: "#EEF2FF", border: "#C7D2FE" };
}

export function nextTierProgress(customer) {
  var visits = (customer && customer.visit_count) || 0;
  if (visits >= 15) return null; // already VIP
  var thresholds = [
    { tier: "Bronze", at: 1 },
    { tier: "Silver", at: 4 },
    { tier: "Gold",   at: 8 },
    { tier: "VIP",    at: 15 },
  ];
  for (var i = 0; i < thresholds.length; i++) {
    if (visits < thresholds[i].at) {
      var prevAt = i === 0 ? 0 : thresholds[i-1].at;
      return {
        nextTier: thresholds[i].tier,
        visitsNeeded: thresholds[i].at - visits,
        progress: Math.round(((visits - prevAt) / (thresholds[i].at - prevAt)) * 100),
      };
    }
  }
  return null;
}
