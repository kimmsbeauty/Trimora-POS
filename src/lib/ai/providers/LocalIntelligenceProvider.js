// src/lib/ai/providers/LocalIntelligenceProvider.js
//
// The default AI provider. Produces business intelligence using only
// SQL-fetched data, arithmetic, and simple rules -- no external AI
// service, no API key, no cost. AIService fetches the raw rows (it
// owns all DB access, per the TIP rule that no module talks to a
// provider or a data source except through AIService); this provider
// only ever receives rows it's given and returns structured results.
//
// Kept as pure functions (like salonHealth.js) so every capability is
// testable with plain arrays -- no mocking, no network.

export function summarizeRevenue(salesRows, options) {
  options = options || {};
  var rows = salesRows || [];

  var totalRevenue = 0;
  var byPaymentMethod = {};

  rows.forEach(function (row) {
    var amount = Number(row.total || 0);
    totalRevenue += amount;

    var method = row.payment || "Unknown";
    if (!byPaymentMethod[method]) {
      byPaymentMethod[method] = { method: method, total: 0, count: 0 };
    }
    byPaymentMethod[method].total += amount;
    byPaymentMethod[method].count += 1;
  });

  var saleCount = rows.length;
  var avgSale = saleCount > 0 ? totalRevenue / saleCount : 0;

  var byPaymentMethodList = Object.keys(byPaymentMethod)
    .map(function (key) { return byPaymentMethod[key]; })
    .sort(function (a, b) { return b.total - a.total; });

  return {
    provider: "local",
    dateFrom: options.dateFrom || null,
    dateTo: options.dateTo || null,
    totalRevenue: totalRevenue,
    saleCount: saleCount,
    avgSale: avgSale,
    byPaymentMethod: byPaymentMethodList,
  };
}

export function summarizeCustomers(salesRows, newCustomerRows, options) {
  options = options || {};
  var sales = salesRows || [];
  var newCustomers = newCustomerRows || [];

  var seenVisitors = {};
  sales.forEach(function (row) {
    var key = row.client_phone || row.client;
    if (key) {
      seenVisitors[key] = true;
    }
  });

  return {
    provider: "local",
    dateFrom: options.dateFrom || null,
    dateTo: options.dateTo || null,
    visitorCount: Object.keys(seenVisitors).length,
    newCustomerCount: newCustomers.length,
  };
}

export function summarizeTopItems(salesRows, options) {
  options = options || {};
  var rows = salesRows || [];
  var limit = options.limit || 5;

  var counts = {};
  rows.forEach(function (row) {
    if (!Array.isArray(row.items)) return;
    row.items.forEach(function (item) {
      if (!item || !item.name) return;
      var key = item.type + ":" + item.name;
      if (!counts[key]) {
        counts[key] = { name: item.name, type: item.type || "item", qty: 0 };
      }
      counts[key].qty += Number(item.qty || 1);
    });
  });

  var items = Object.keys(counts)
    .map(function (key) { return counts[key]; })
    .sort(function (a, b) { return b.qty - a.qty; })
    .slice(0, limit);

  return {
    provider: "local",
    dateFrom: options.dateFrom || null,
    dateTo: options.dateTo || null,
    items: items,
  };
}

export default {
  name: "local",
  summarizeRevenue: summarizeRevenue,
  summarizeCustomers: summarizeCustomers,
  summarizeTopItems: summarizeTopItems,
};
