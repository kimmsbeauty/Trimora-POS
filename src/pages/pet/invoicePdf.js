// src/pages/pet/invoicePdf.js
//
// Turns the invoice on screen (the .invoice-print element) into an A4 PDF, in the browser, and hands
// it to the phone's share sheet so staff can pick Gmail / WhatsApp / etc. with the PDF attached.
// Where the browser can't share files (most desktops) the PDF is downloaded instead.
// The PDF libraries are loaded only when needed, so they don't weigh down the rest of the app.

var A4_W = 210; // mm
var A4_H = 297;

export function pdfFileName(invoice) {
  var n = String((invoice && invoice.invoice_number) || "invoice").replace(/[^A-Za-z0-9_-]+/g, "-");
  return n + ".pdf";
}

// Render a DOM element to a one-or-more page A4 PDF File. Throws if it can't (callers fall back
// to the text-only message).
export async function makeInvoicePdf(element, fileName) {
  if (!element) throw new Error("INVOICE_NOT_ON_SCREEN");
  var mods = await Promise.all([import("html2canvas"), import("jspdf")]);
  var html2canvas = mods[0].default || mods[0];
  var jsPDF = mods[1].jsPDF || (mods[1].default && mods[1].default.jsPDF) || mods[1].default;
  var canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  var pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  var margin = 8;
  var w = A4_W - margin * 2;
  var h = (canvas.height * w) / canvas.width;
  var usable = A4_H - margin * 2;
  if (h <= usable) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, w, h);
  } else {
    // Taller than a page: slice the canvas into page-sized strips.
    var sliceCanvasH = Math.floor((usable * canvas.width) / w);
    var y = 0; var first = true;
    while (y < canvas.height) {
      var sh = Math.min(sliceCanvasH, canvas.height - y);
      var part = document.createElement("canvas");
      part.width = canvas.width; part.height = sh;
      part.getContext("2d").drawImage(canvas, 0, y, canvas.width, sh, 0, 0, canvas.width, sh);
      if (!first) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, w, (sh * w) / canvas.width);
      first = false; y += sh;
    }
  }
  var blob = pdf.output("blob");
  return new File([blob], fileName, { type: "application/pdf" });
}

// True on phones and tablets (touch as the main input). The system share sheet is only dependable
// there; on a computer it lists Windows/Mac apps, often not WhatsApp or Gmail, so computers use
// "download the PDF and open the chat" instead.
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

// Opens the share sheet with the PDF attached. Returns "shared", "cancelled" (user closed the sheet)
// or "failed".
export async function sharePdf(file, title, text) {
  try {
    await navigator.share({ files: [file], title: title, text: text });
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
