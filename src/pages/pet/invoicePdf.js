// src/pages/pet/invoicePdf.js
//
// Turns the invoice on screen (the .invoice-print element) into an A4 PDF, in the browser, and hands
// it to the device's share sheet so staff can pick WhatsApp / Gmail / etc. with the PDF attached and
// nothing to download. Only where the browser can't share files at all is the PDF downloaded instead.
// The PDF libraries are loaded only when needed, so they don't weigh down the rest of the app.

var A4_W = 210; // mm
var A4_H = 297;

export function pdfFileName(invoice) {
  var n = String((invoice && invoice.invoice_number) || "invoice").replace(/[^A-Za-z0-9_-]+/g, "-");
  return n + ".pdf";
}

// Where the invoice goes on the A4 page. The whole invoice is kept on ONE page (shrunk a little if it
// is tall) so it never breaks through a row or the totals. Only an extremely long invoice (shrinking
// it would make the text too small to read) is split into pages.
var PAGE_MARGIN = 8;
var MIN_SCALE = 0.7;
export function pageLayout(canvasW, canvasH) {
  var maxW = A4_W - PAGE_MARGIN * 2;
  var usableH = A4_H - PAGE_MARGIN * 2;
  var w = maxW;
  var h = (canvasH * w) / canvasW;
  if (h <= usableH) return { mode: "single", x: PAGE_MARGIN, y: PAGE_MARGIN, w: w, h: h };
  var scale = usableH / h;
  if (scale >= MIN_SCALE) return { mode: "single", x: PAGE_MARGIN + (maxW - w * scale) / 2, y: PAGE_MARGIN, w: w * scale, h: usableH };
  return { mode: "pages", x: PAGE_MARGIN, y: PAGE_MARGIN, w: w, h: h, usableH: usableH };
}

// The invoice is always drawn at a fixed A4-like width in a hidden copy, NOT at the width of the screen
// it happens to be on. Capturing the on-screen element made a phone's narrow layout (squashed columns,
// cut-off headings, a wrapped footer) end up in the PDF.
var CAPTURE_WIDTH = 794; // px, A4 width at 96 dpi

async function captureInvoice(element, html2canvas) {
  var host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:" + CAPTURE_WIDTH + "px;background:#ffffff;pointer-events:none;";
  var copy = element.cloneNode(true);
  copy.style.width = CAPTURE_WIDTH + "px"; copy.style.minWidth = CAPTURE_WIDTH + "px"; copy.style.maxWidth = "none";
  copy.style.boxSizing = "border-box"; copy.style.border = "none"; copy.style.borderRadius = "0";
  host.appendChild(copy);
  document.body.appendChild(host);
  try {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) { /* carry on with what is loaded */ } }
    return await html2canvas(copy, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: CAPTURE_WIDTH, width: CAPTURE_WIDTH });
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

// Render a DOM element to an A4 PDF File (one page whenever it fits). Throws if it can't (callers
// fall back to the download-only message).
export async function makeInvoicePdf(element, fileName) {
  if (!element) throw new Error("INVOICE_NOT_ON_SCREEN");
  var mods = await Promise.all([import("html2canvas"), import("jspdf")]);
  var html2canvas = mods[0].default || mods[0];
  var jsPDF = mods[1].jsPDF || (mods[1].default && mods[1].default.jsPDF) || mods[1].default;
  var canvas = await captureInvoice(element, html2canvas);
  var pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  var L = pageLayout(canvas.width, canvas.height);
  if (L.mode === "single") {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", L.x, L.y, L.w, L.h);
  } else {
    // Extremely long: slice into page-sized strips.
    var sliceCanvasH = Math.floor((L.usableH * canvas.width) / L.w);
    var y = 0; var first = true;
    while (y < canvas.height) {
      var sh = Math.min(sliceCanvasH, canvas.height - y);
      var part = document.createElement("canvas");
      part.width = canvas.width; part.height = sh;
      part.getContext("2d").drawImage(canvas, 0, y, canvas.width, sh, 0, 0, canvas.width, sh);
      if (!first) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.95), "JPEG", L.x, L.y, L.w, (sh * L.w) / canvas.width);
      first = false; y += sh;
    }
  }
  var blob = pdf.output("blob");
  return new File([blob], fileName, { type: "application/pdf" });
}

// True on phones and tablets (touch as the main input). The system share sheet reliably lists WhatsApp
// and Gmail there; on a computer it lists Windows/Mac apps and often has no WhatsApp at all, so computers
// open the customer's chat directly instead (the share menu stays available as a second button).
export function isPhoneLike() {
  try { return !!(typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches); }
  catch (e) { return false; }
}

export function canSharePdf(file) {
  try {
    return !!(file && typeof navigator !== "undefined" && typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }));
  } catch (e) { return false; }
}

// Opens the share sheet with ONLY the PDF attached (no message text, no title): the customer gets the
// invoice and nothing else. Returns "shared", "cancelled" (user closed the sheet) or "failed".
export async function sharePdf(file, title) {
  try {
    var data = { files: [file] };
    if (title) data.title = title;
    await navigator.share(data);
    return "shared";
  } catch (e) {
    return e && e.name === "AbortError" ? "cancelled" : "failed";
  }
}

export function downloadPdf(file) {
  var url = URL.createObjectURL(file);
  var a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
}
