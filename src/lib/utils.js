// src/lib/utils.js

export function fmt(n) {
  return "KES " + Number(n).toLocaleString();
}

// FIX: previously returned "18/06/2026" (DD/MM/YYYY via en-KE locale),
// which Postgres `date` columns rejected with a 400 error because it
// misreads "18" as a month. ISO format (YYYY-MM-DD) is unambiguous
// regardless of the database server's datestyle setting, so this is
// now always safe to insert into any date column.
export function todayStr() {
  var d = new Date();
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

export function nowTime() {
  return new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
}

export function today() {
  return new Date().toLocaleDateString("en-KE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
