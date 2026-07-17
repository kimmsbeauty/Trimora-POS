// src/lib/constants.js
//
// SUPABASE_URL/SUPABASE_KEY now prefer REACT_APP_SUPABASE_URL /
// REACT_APP_SUPABASE_KEY (set in .env locally, or in Vercel's project
// settings for production), falling back to the previous hardcoded
// values if those env vars aren't set anywhere. This is deliberately
// non-breaking: until the Vercel project env vars are actually added,
// the app behaves exactly as it did before this change.
//
// Worth being precise about what this is and isn't: SUPABASE_KEY here
// is the anon/publishable key (decode the JWT -- role: "anon"), not a
// service-role secret. It's designed by Supabase to be public and
// embedded in client bundles; the actual access-control boundary is
// RLS policies, not keeping this value hidden. Moving it into env vars
// is a deployment-hygiene improvement (per-environment config, no code
// change to point at a different Supabase project), not a fix for an
// exposed secret -- there wasn't one.

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ukoccobbjeomjwjcvrma.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrb2Njb2JiamVvbWp3amN2cm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjg4MzAsImV4cCI6MjA5NjcwNDgzMH0.a-nDh04ujZQ8w9lwu9rkHuge9xGRbLRfV7vD3zRCAqg";

export const KIMMS_SALON_ID = "c96d71d0-e496-4fd6-ae1c-70c89431fd3d";

export const MPESA_TILL  = "5927571";
export const MPESA_NAME  = "Kimm's Beauty Parlour";
export const MPESA_GREEN = "#4CAF50";
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

export const CATS = ["All", "Hair", "Nails", "Beauty", "Spa", "Barber"];

