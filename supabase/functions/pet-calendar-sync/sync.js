// supabase/functions/pet-calendar-sync/sync.js
//
// The sync loop for pet-calendar-sync, with the database client and the Google calls passed in, so the
// whole flow (create, skip, update, delete, restore, retry, calendar change) is unit tested with fakes.
// index.ts supplies the real Supabase client and the real Google HTTP calls.
import {
  SOURCE_STAY, SOURCE_DAYCARE, MAX_ATTEMPTS, DEFAULT_TZ,
  shouldRemove, bookingEvent, stayEvent, daycareEvent, contentHash, eventIdFor, classifyGoogleError,
} from "./lib.js";

export var GROUPS_PER_RUN = 60;

export class GoogleError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// call(method, calendarId, path, body) -> parsed JSON or null; throws GoogleError.
// A fixed event id makes a retry safe, and sendUpdates=none with no attendees means Google never emails anyone.
export function makeApi(call) {
  var q = "?sendUpdates=none";
  function put(cal, id, event) { return call("PUT", cal, "/events/" + id + q, Object.assign({}, event, { id: id, status: "confirmed" })); }
  function post(cal, id, event) { return call("POST", cal, "/events" + q, Object.assign({}, event, { id: id })); }
  return {
    push: async function (cal, id, event, linked) {
      if (linked) {
        try { await put(cal, id, event); return; } catch (e) { if (!(e instanceof GoogleError) || e.code !== "CALENDAR_NOT_FOUND") throw e; }
      }
      try { await post(cal, id, event); } catch (e) {
        // The id already exists: created earlier, or deleted and now being restored.
        if (e instanceof GoogleError && e.code === "CONFLICT") { await put(cal, id, event); return; }
        throw e;
      }
    },
    remove: async function (cal, id) {
      try { await call("DELETE", cal, "/events/" + id + "?sendUpdates=none"); }
      catch (e) { if (!(e instanceof GoogleError) || (e.code !== "GONE" && e.code !== "CALENDAR_NOT_FOUND")) throw e; }
    },
  };
}

// Build one event from the saved booking/stay, or null if it should not be on the calendar.
export async function loadEvent(supabase, salonId, type, id, tz) {
  var table = type === SOURCE_STAY ? "pet_boarding_stays" : type === SOURCE_DAYCARE ? "pet_daycare_visits" : "pet_bookings";
  var row = (await supabase.from(table).select("*").eq("id", id).eq("salon_id", salonId).maybeSingle()).data;
  if (shouldRemove(type, row)) return null;
  var customer = (await supabase.from("customers").select("name").eq("id", row.customer_id).eq("salon_id", salonId).maybeSingle()).data;
  var pet = (await supabase.from("pet_pets").select("name").eq("id", row.pet_id).eq("salon_id", salonId).maybeSingle()).data;
  var base = { petName: pet && pet.name, ownerName: customer && customer.name, timezone: tz };
  if (type === SOURCE_STAY) {
    var kennel = (await supabase.from("pet_kennels").select("name").eq("id", row.kennel_id).eq("salon_id", salonId).maybeSingle()).data;
    return stayEvent(row, Object.assign({}, base, { kennelName: kennel && kennel.name }));
  }
  if (type === SOURCE_DAYCARE) {
    var carer = row.assigned_staff_id ? (await supabase.from("staff").select("name").eq("id", row.assigned_staff_id).eq("salon_id", salonId).maybeSingle()).data : null;
    return daycareEvent(row, Object.assign({}, base, { staffName: carer && carer.name }));
  }
  var staff = row.staff_id ? (await supabase.from("staff").select("name").eq("id", row.staff_id).eq("salon_id", salonId).maybeSingle()).data : null;
  var lines = (await supabase.from("pet_booking_services").select("service_name").eq("booking_id", id).eq("salon_id", salonId)).data || [];
  return bookingEvent(row, Object.assign({}, base, { groomerName: staff && staff.name, services: lines.map(function (l) { return l.service_name; }) }));
}

// One pass over the pending outbox rows (all businesses, or just salonFilter).
export async function runSync(supabase, api, salonFilter, nowMs) {
  var now = nowMs || Date.now();
  await supabase.from("pet_calendar_outbox").delete().not("processed_at", "is", null).lt("processed_at", new Date(now - 7 * 864e5).toISOString());

  var q = supabase.from("pet_calendar_outbox").select("id, salon_id, source_type, source_id, attempts")
    .is("processed_at", null).lt("attempts", MAX_ATTEMPTS).order("id", { ascending: true }).limit(500);
  if (salonFilter) q = q.eq("salon_id", salonFilter);
  var rows = (await q).data || [];

  // Several rows for one booking collapse into one update.
  var groups = new Map();
  rows.forEach(function (r) {
    var k = r.salon_id + "|" + r.source_type + "|" + r.source_id;
    var g = groups.get(k) || { salon: r.salon_id, type: r.source_type, id: r.source_id, rowIds: [], attempts: 0 };
    g.rowIds.push(r.id); g.attempts = Math.max(g.attempts, r.attempts); groups.set(k, g);
  });
  var all = Array.from(groups.values());

  var conns = new Map(); var tzs = new Map(); var salonResult = new Map();
  var synced = 0, skipped = 0, failed = 0;

  for (var g of all.slice(0, GROUPS_PER_RUN)) {
    var finish = function (grp) {
      return function (err) {
        return supabase.from("pet_calendar_outbox")
          .update(err ? { attempts: grp.attempts + 1, last_error: err } : { processed_at: new Date(now).toISOString(), last_error: null })
          .in("id", grp.rowIds);
      };
    }(g);

    if (!conns.has(g.salon)) {
      var c = (await supabase.from("pet_calendar_connections").select("enabled, calendar_id").eq("salon_id", g.salon).maybeSingle()).data;
      var s = (await supabase.from("salons").select("suspended").eq("id", g.salon).maybeSingle()).data;
      var t = (await supabase.from("pet_public_booking_settings").select("timezone").eq("salon_id", g.salon).maybeSingle()).data;
      conns.set(g.salon, c && c.enabled && c.calendar_id && !(s && s.suspended) ? c : null);
      tzs.set(g.salon, (t && t.timezone) || DEFAULT_TZ);
    }
    var conn = conns.get(g.salon);
    if (!conn) { await finish(null); skipped++; continue; }     // switched off or suspended since it was queued

    try {
      var link = (await supabase.from("pet_calendar_events").select("*")
        .eq("salon_id", g.salon).eq("source_type", g.type).eq("source_id", g.id).maybeSingle()).data;
      var event = await loadEvent(supabase, g.salon, g.type, g.id, tzs.get(g.salon));

      if (!event) {
        if (link) {
          await api.remove(link.calendar_id, link.google_event_id);
          await supabase.from("pet_calendar_events").delete().eq("id", link.id);
        }
        await finish(null); synced++;
      } else {
        var hash = contentHash(event);
        var sameCal = !!link && link.calendar_id === conn.calendar_id;
        if (sameCal && link.content_hash === hash) { await finish(null); skipped++; }
        else {
          if (link && !sameCal) { try { await api.remove(link.calendar_id, link.google_event_id); } catch (e) { /* old calendar: best effort */ } }
          var eventId = eventIdFor(g.type, g.id);
          await api.push(conn.calendar_id, eventId, event, sameCal);
          await supabase.from("pet_calendar_events").upsert({
            salon_id: g.salon, source_type: g.type, source_id: g.id, google_event_id: eventId,
            calendar_id: conn.calendar_id, content_hash: hash, synced_at: new Date(now).toISOString(),
          }, { onConflict: "salon_id,source_type,source_id" });
          await finish(null); synced++;
        }
      }
      if (!salonResult.has(g.salon)) salonResult.set(g.salon, null);
    } catch (e) {
      var code = e instanceof GoogleError ? e.code : "SYNC_FAILED";
      await finish(code); failed++;
      if (!salonResult.get(g.salon)) salonResult.set(g.salon, code);
    }
  }

  // The status the app shows in Settings.
  for (var entry of salonResult) {
    await supabase.from("pet_calendar_connections")
      .update(entry[1] ? { last_error: entry[1] } : { last_ok_at: new Date(now).toISOString(), last_error: null }).eq("salon_id", entry[0]);
  }
  return { synced: synced, skipped: skipped, failed: failed, remaining: Math.max(0, all.length - GROUPS_PER_RUN) };
}
