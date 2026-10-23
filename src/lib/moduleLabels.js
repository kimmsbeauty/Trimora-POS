// src/lib/moduleLabels.js
//
// Wording for the super-admin onboard/invite modals, per business module.
// The salon and Auto strings are copied verbatim from what the dashboard
// hardcoded before Trimora Pet existed, so those two flows read exactly as
// they always did. Pet is the third entry.
import { PET_NAME } from "../pages/pet/theme";

var SALON = {
  manualTitle: "🏪 Manual Onboarding",
  manualBlurb: "Create a salon directly without an invite link.",
  inviteTitle: "🔗 Generate Invite Link",
  inviteBlurb: "One-time link, expires in 7 days.",
  nameLabel: "Salon Name",
  namePlaceholder: "e.g. Grace Beauty Studio",
  manualEmailPlaceholder: "owner@salon.com",
  inviteEmailPlaceholder: "salon@example.com",
  failurePrefix: "Salon",
  createBtn: "🏪 Create Salon",
  creatingBtn: "Creating salon...",
  path: "/pos",
  successLabel: "POS",
};

var AUTO = {
  manualTitle: "🚗 Onboard Car Wash",
  manualBlurb: "Create a car wash with Auto enabled from the start, without an invite link.",
  inviteTitle: "🚗 Invite Car Wash",
  inviteBlurb: "One-time link, Auto enabled automatically on completion. Expires in 7 days.",
  nameLabel: "Car Wash Name",
  namePlaceholder: "e.g. High Point Carwash",
  manualEmailPlaceholder: "owner@example.com",
  inviteEmailPlaceholder: "owner@example.com",
  failurePrefix: "Car wash",
  createBtn: "🚗 Create Car Wash",
  creatingBtn: "Creating car wash...",
  path: "/auto",
  successLabel: "Auto",
};

var PET = {
  manualTitle: "🐾 Onboard Pet Business",
  manualBlurb: "Create a pet business with " + PET_NAME + " enabled from the start, without an invite link.",
  inviteTitle: "🐾 Invite Pet Business",
  inviteBlurb: "One-time link, " + PET_NAME + " enabled automatically on completion. Expires in 7 days.",
  nameLabel: "Pet Business Name",
  namePlaceholder: "e.g. Happy Paws Grooming",
  manualEmailPlaceholder: "owner@example.com",
  inviteEmailPlaceholder: "owner@example.com",
  failurePrefix: "Pet business",
  createBtn: "🐾 Create Pet Business",
  creatingBtn: "Creating pet business...",
  path: "/pet",
  successLabel: PET_NAME,
};

// key: null (salon), "auto" or "pet". Anything unknown falls back to salon.
export function moduleLabels(key) {
  if (key === "auto") return AUTO;
  if (key === "pet") return PET;
  return SALON;
}
