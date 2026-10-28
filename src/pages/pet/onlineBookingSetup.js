// src/pages/pet/onlineBookingSetup.js
//
// What a business still has to do before customers can book online. The public booking page
// (migration 108) only lists services that are active, not Boarding and have a duration, and its
// WhatsApp buttons need the business WhatsApp number from Settings. Pure logic, no database access.
import { normalizePhoneForWhatsApp } from "../../lib/utils";

export function hasBookableService(services) {
  return (services || []).some(function (s) {
    return !!s && s.active !== false && s.category !== "Boarding" && Number(s.duration_minutes) > 0;
  });
}

export function hasWhatsAppNumber(phone) {
  return !!normalizePhoneForWhatsApp(phone);
}

// Steps still to do, in order. Empty when the business is ready.
export function pendingSetupSteps(services, phone) {
  var steps = [];
  if (!hasBookableService(services)) {
    steps.push({ key: "services", label: "Add a service with a duration", hint: "Customers can only book services that have a duration.", target: "grooming", action: "Go to Grooming" });
  }
  if (!hasWhatsAppNumber(phone)) {
    steps.push({ key: "whatsapp", label: "Add your WhatsApp number", hint: "Customers use it to message you about their booking.", target: "settings", action: "Open Settings" });
  }
  return steps;
}
