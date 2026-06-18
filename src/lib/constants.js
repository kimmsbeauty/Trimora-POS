// src/lib/constants.js

export const SUPABASE_URL = "https://ukoccobbjeomjwjcvrma.supabase.co";
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrb2Njb2JiamVvbWp3amN2cm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjg4MzAsImV4cCI6MjA5NjcwNDgzMH0.a-nDh04ujZQ8w9lwu9rkHuge9xGRbLRfV7vD3zRCAqg";

export const MPESA_TILL  = "5927571";
export const MPESA_NAME  = "Kimm's Beauty Parlour";
export const MPESA_GREEN = "#4CAF50";
export const STAFF_PIN   = "1234";
export const ADMIN_PIN   = "9999";

// ── Brand Colours ──────────────────────────────────────────────────────────
export const BLACK    = "#0A0A0A";
export const GOLD     = "#C9A84C";
export const GOLD_LT  = "#F0CC6E";
export const GOLD_DIM = "#8A6F2E";
export const CREAM    = "#FDF8EE";
export const DARK     = "#1A1400";
export const WHITE    = "#FFFFFF";
export const GRAY     = "#F5F0E8";
export const GREEN    = "#22C55E";
export const RED      = "#EF4444";
export const AMBER    = "#F59E0B";

// ── Category list ──────────────────────────────────────────────────────────
export const CATS = ["All", "Hair", "Nails", "Beauty", "Spa", "Barber"];

// ── Fallback data (used if Supabase returns nothing) ──────────────────────
export const DEFAULT_SERVICES = [
  { id: "SRV001", cat: "Hair",   name: "Hair wash & blow dry",  price: 1000 },
  { id: "SRV002", cat: "Hair",   name: "Hair cutting",           price: 800  },
  { id: "SRV003", cat: "Hair",   name: "Hair styling",           price: 1500 },
  { id: "SRV004", cat: "Hair",   name: "Relaxing",               price: 2500 },
  { id: "SRV005", cat: "Hair",   name: "Hair coloring",          price: 3000 },
  { id: "SRV006", cat: "Hair",   name: "Hair treatment",         price: 2000 },
  { id: "SRV007", cat: "Hair",   name: "Braiding",               price: 3000 },
  { id: "SRV008", cat: "Hair",   name: "Weaving",                price: 2500 },
  { id: "SRV009", cat: "Hair",   name: "Wig installation",       price: 2000 },
  { id: "SRV010", cat: "Hair",   name: "Dreadlocks retwist",     price: 2000 },
  { id: "SRV011", cat: "Nails",  name: "Manicure",               price: 800  },
  { id: "SRV012", cat: "Nails",  name: "Pedicure",               price: 1000 },
  { id: "SRV013", cat: "Nails",  name: "Gel application",        price: 1500 },
  { id: "SRV014", cat: "Nails",  name: "Acrylic nails",          price: 2500 },
  { id: "SRV015", cat: "Nails",  name: "Nail art",               price: 1000 },
  { id: "SRV016", cat: "Beauty", name: "Facial",                 price: 2500 },
  { id: "SRV017", cat: "Beauty", name: "Makeup",                 price: 3000 },
  { id: "SRV018", cat: "Beauty", name: "Eyebrow shaping",        price: 500  },
  { id: "SRV019", cat: "Beauty", name: "Eyelash extensions",     price: 2500 },
  { id: "SRV020", cat: "Spa",    name: "Body massage",           price: 3000 },
  { id: "SRV021", cat: "Barber", name: "Haircut (men)",          price: 500  },
  { id: "SRV022", cat: "Barber", name: "Beard grooming",         price: 300  },
];

export const DEFAULT_STAFF = [
  { id: "STF001", name: "Lucy",   role: "Stylist",          commission_pct: 40, active: true },
  { id: "STF002", name: "Kelvin", role: "Barber",           commission_pct: 40, active: true },
  { id: "STF003", name: "Alex",   role: "Nail Technician",  commission_pct: 40, active: true },
];