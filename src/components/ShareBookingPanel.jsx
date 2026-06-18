// src/components/ShareBookingPanel.jsx

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { GOLD, GOLD_LT, GOLD_DIM, BLACK, WHITE, CREAM, DARK, GREEN } from "../lib/constants.js";

export default function ShareBookingPanel({ salonName }) {
  salonName = salonName || "Kimm's Beauty Parlour";

  var bookingUrl = window.location.origin + "/booking";

  var qrSvgState = useState(""); var qrSvg = qrSvgState[0]; var setQrSvg = qrSvgState[1];
  var copiedState = useState(false); var copied = copiedState[0]; var setCopied = copiedState[1];
  var printRef = useRef(null);

  useEffect(function() {
    QRCode.toString(bookingUrl, { type: "svg", width: 220, margin: 1, color: { dark: "#0A0A0A", light: "#FFFFFF" } })
      .then(function(svg) { setQrSvg(svg); })
      .catch(function(e) { console.error("QR generation failed:", e); });
  }, [bookingUrl]);

  function copyLink() {
    navigator.clipboard.writeText(bookingUrl).then(function() {
      setCopied(true);
      setTimeout(function() { setCopied(false); }, 2000);
    }).catch(function() {
      // Fallback for older browsers
      var input = document.createElement("input");
      input.value = bookingUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(function() { setCopied(false); }, 2000);
    });
  }

  function printQR() {
    var printWindow = window.open("", "_blank");
    printWindow.document.write(
      "<html><head><title>" + salonName + " — Booking QR</title>" +
      "<style>body{font-family:sans-serif;text-align:center;padding:40px;}" +
      "h1{font-size:20px;margin-bottom:4px;}p{color:#888;font-size:13px;margin-bottom:24px;}" +
      ".qrbox{display:inline-block;padding:20px;border:2px solid #C9A84C;border-radius:16px;}" +
      ".url{margin-top:16px;font-size:12px;color:#555;word-break:break-all;}</style>" +
      "</head><body>" +
      "<h1>📅 Book at " + salonName + "</h1>" +
      "<p>Scan to book your appointment online</p>" +
      "<div class='qrbox'>" + qrSvg + "</div>" +
      "<div class='url'>" + bookingUrl + "</div>" +
      "</body></html>"
    );
    printWindow.document.close();
    setTimeout(function() { printWindow.print(); }, 300);
  }

  var whatsappMessage = "📅 Book your appointment at " + salonName + " online!\n\n" + bookingUrl + "\n\nChoose your service, stylist, and preferred time — quick and easy 💕";

  return (
    <div style={{ background: WHITE, borderRadius: 16, padding: 20, border: "1px solid " + GOLD_DIM + "44" }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: DARK }}>📅 Share Your Booking Link</div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Let clients book appointments online, anytime</div>
      </div>

      {/* QR Code */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <div
          style={{ background: WHITE, padding: 16, borderRadius: 14, border: "2px solid " + GOLD, display: "inline-block" }}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      </div>

      {/* URL display + copy */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, background: CREAM, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: DARK, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid " + GOLD_DIM + "33" }}>
          {bookingUrl}
        </div>
        <button onClick={copyLink} style={{
          background: copied ? GREEN : "linear-gradient(135deg," + GOLD + "," + GOLD_LT + ")",
          color: copied ? WHITE : BLACK, border: "none", borderRadius: 10,
          padding: "10px 16px", fontSize: 12, fontWeight: 800, cursor: "pointer",
          whiteSpace: "nowrap", transition: "background 0.2s",
        }}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <a
          href={"https://wa.me/?text=" + encodeURIComponent(whatsappMessage)}
          target="_blank" rel="noreferrer"
          style={{ display: "block", width: "100%", background: "#25D366", color: WHITE, borderRadius: 10, padding: "12px 0", fontWeight: 800, fontSize: 13, textDecoration: "none", textAlign: "center", boxSizing: "border-box" }}
        >
          📲 Share via WhatsApp
        </a>
        <button onClick={printQR} style={{ width: "100%", background: CREAM, border: "1.5px solid " + GOLD_DIM, borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, color: GOLD_DIM, cursor: "pointer" }}>
          🖨️ Print QR for Reception Desk
        </button>
        <a
          href="/booking" target="_blank" rel="noreferrer"
          style={{ display: "block", width: "100%", background: "none", border: "1.5px solid " + GOLD_DIM + "66", borderRadius: 10, padding: "11px 0", fontWeight: 700, fontSize: 13, color: GOLD_DIM, textDecoration: "none", textAlign: "center", boxSizing: "border-box" }}
        >
          👁️ Preview Booking Page
        </a>
      </div>
    </div>
  );
}
