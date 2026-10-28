// src/pages/pet/useNewRequestCount.js
//
// How many online booking requests are still waiting for staff (status "new"), so the menu can
// show a badge and the owner finds out without opening Requests. Refreshes when the staff member
// changes page (so accepting or declining clears the badge), when the tab becomes visible again,
// and once a minute while it stays open. A failed lookup keeps the last known count.
import { useEffect, useState } from "react";
import { db } from "../../lib/db";

var POLL_MS = 60000;
var LIMIT = 100;

export function formatBadgeCount(n) {
  return n > LIMIT - 1 ? (LIMIT - 1) + "+" : String(n);
}

export default function useNewRequestCount(enabled, refreshKey) {
  var countState = useState(0); var count = countState[0]; var setCount = countState[1];

  useEffect(function () {
    if (!enabled) { setCount(0); return undefined; }
    var cancelled = false;
    function refresh() {
      if (typeof document !== "undefined" && document.hidden) return;
      Promise.resolve(db("GET", "pet_booking_requests", null, "?select=id,status&status=eq.new&limit=" + LIMIT))
        .then(function (rows) {
          if (cancelled || !Array.isArray(rows)) return;
          setCount(rows.filter(function (r) { return r && r.status === "new"; }).length);
        })
        .catch(function () {});
    }
    refresh();
    var timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return function () { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [enabled, refreshKey]);

  return count;
}
