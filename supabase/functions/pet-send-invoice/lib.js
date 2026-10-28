// supabase/functions/pet-send-invoice/lib.js
//
// Pure helpers for pet-send-invoice (no Deno or network imports, so they are unit-tested with
// vitest). Everything here is built from the SAVED invoice row the function loads from the
// database; the browser never supplies message text or amounts.

export const STATUS_LABELS = {
  issued: "Unpaid", partial: "Part paid", paid: "Paid", void: "Void", overdue: "Overdue", refunded: "Refunded",
};

export function money(n) { return "KES " + Number(n || 0).toLocaleString("en-US"); }

export function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function outstanding(inv) {
  return inv.status === "void" || inv.status === "refunded" ? 0 : Math.max(0, inv.total - inv.amount_paid);
}

// Overdue is derived from the due date (as in the app), never stored.
export function displayStatus(inv, todayISO) {
  if ((inv.status === "issued" || inv.status === "partial") && inv.due_date && String(inv.due_date) < todayISO) return "overdue";
  return inv.status;
}

export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

export function dateLabel(iso) {
  if (!iso) return "";
  const s = String(iso);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))) : new Date(s);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function emailSubject(inv, biz) {
  return (biz.name ? biz.name + " " : "") + "invoice " + inv.invoice_number;
}

function summaryRows(inv, todayISO) {
  const rows = [];
  const isVoid = inv.status === "void";
  if ((inv.discount_amount || 0) > 0) rows.push(["Discount", "-" + money(inv.discount_amount || 0)]);
  rows.push(["Total", money(inv.total)]);
  if (inv.tax_enabled) rows.push(["Includes VAT (" + inv.tax_rate + "%)", money(inv.tax_amount || 0)]);
  if (!isVoid) {
    rows.push(["Paid", money(inv.amount_paid || 0)]);
    if ((inv.amount_refunded || 0) > 0) rows.push(["Refunded", "-" + money(inv.amount_refunded || 0)]);
    rows.push(["Balance due", money(outstanding(inv))]);
  }
  rows.push(["Status", STATUS_LABELS[displayStatus(inv, todayISO)] || inv.status]);
  if (inv.due_date && !isVoid) rows.push(["Due", dateLabel(inv.due_date)]);
  return rows;
}

export function buildText(inv, customerName, petName, biz, todayISO) {
  const out = [];
  const fn = firstName(customerName);
  out.push(fn ? "Hello " + fn + "," : "Hello,", "");
  out.push("Here is your invoice " + inv.invoice_number + " from " + (biz.name || "us") + (petName ? " for " + petName : "") + ".", "");
  for (const l of inv.pet_invoice_lines || []) out.push("- " + l.description + " x" + l.quantity + ": " + money(l.line_total));
  out.push("");
  for (const [k, v] of summaryRows(inv, todayISO)) out.push(k + ": " + v);
  if (inv.notes) out.push("", inv.notes);
  out.push("", biz.receipt_footer_message || "Thank you for your business.");
  if (biz.name) out.push(biz.name + (biz.contact_phone ? " - Tel: " + biz.contact_phone : ""));
  return out.join("\n");
}

export function buildHtml(inv, customerName, petName, biz, todayISO) {
  const e = escapeHtml;
  const fn = firstName(customerName);
  const lines = (inv.pet_invoice_lines || []).map((l) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${e(l.description)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${e(l.quantity)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${e(money(l.line_total))}</td></tr>`).join("");
  const rows = summaryRows(inv, todayISO).map(([k, v]) =>
    `<tr><td style="padding:3px 8px;color:#555">${e(k)}</td><td style="padding:3px 8px;text-align:right;${k === "Balance due" || k === "Total" ? "font-weight:700" : ""}">${e(v)}</td></tr>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:16px;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;color:#222">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:20px">
<div style="font-size:18px;font-weight:700">${e(biz.name || "Invoice")}</div>
<div style="font-size:13px;color:#555;margin-bottom:12px">Invoice ${e(inv.invoice_number)}${petName ? " &middot; " + e(petName) : ""}</div>
<p style="font-size:14px">${fn ? "Hello " + e(fn) + "," : "Hello,"}<br>Here is your invoice.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f1f1f1;text-align:left"><th style="padding:6px 8px">Item</th><th style="padding:6px 8px;text-align:right">Qty</th><th style="padding:6px 8px;text-align:right">Amount</th></tr></thead><tbody>${lines}</tbody></table>
<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:10px"><tbody>${rows}</tbody></table>
${inv.notes ? `<p style="font-size:13px;color:#555">${e(inv.notes)}</p>` : ""}
<p style="font-size:13px;color:#555;border-top:1px dashed #ccc;padding-top:10px;margin-top:16px">${e(biz.receipt_footer_message || "Thank you for your business.")}${biz.contact_phone ? "<br>Tel: " + e(biz.contact_phone) : ""}</p>
</div></body></html>`;
}

export function isEmail(v) {
  const s = String(v ?? "").trim();
  return s.length <= 254 && /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(s);
}

// Digits only with country code, e.g. 254712345678. null when not a plausible number.
export function normalizePhone(raw) {
  const cleaned = String(raw ?? "").trim().replace(/[\s()-]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const digits = cleaned.startsWith("254") ? cleaned : cleaned.replace(/^0/, "254");
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

// Display name in the From header: strip anything that could break or spoof the header.
export function safeFromName(name) {
  return String(name || "").replace(/[<>"\r\n,;:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function resendPayload(from, bizName, to, subject, text, html, replyTo) {
  const nm = safeFromName(bizName);
  const p = { from: nm ? nm + " <" + from + ">" : from, to: [to], subject, text, html };
  if (replyTo && isEmail(replyTo)) p.reply_to = replyTo;
  return p;
}

// With a template configured, WhatsApp can message a customer who has not written first. The
// template body takes five text parameters, in this order:
//   {{1}} customer first name  {{2}} invoice number  {{3}} business name  {{4}} total  {{5}} balance due
// Without a template the message is free text, which WhatsApp only delivers inside 24 hours of the
// customer's last message to the business number.
export function whatsappPayload(to, template, language, text, params) {
  if (template) {
    return {
      messaging_product: "whatsapp", to, type: "template",
      template: { name: template, language: { code: language || "en" },
        components: [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t.replace(/[\r\n\t]+/g, " ").slice(0, 200) })) }] },
    };
  }
  return { messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: text } };
}

export function whatsappParams(inv, customerName, biz) {
  return [firstName(customerName) || "there", inv.invoice_number, biz.name || "us", money(inv.total), money(outstanding(inv))];
}
