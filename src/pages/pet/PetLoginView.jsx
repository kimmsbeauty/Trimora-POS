// src/pages/pet/PetLoginView.jsx
//
// Presentation only for the Trimora Pet sign-in (the "Pixel Perfect Scene" design): split layout with a
// hero panel and a sign-in card. All behaviour (PIN check, attempts, lockout, session) stays in
// LoginPage.jsx; this component just renders the state and calls the handlers it is given.
import React from "react";
import LoginIcon from "./LoginIcons";
import { PET_NAME, FONT_BODY, FONT_HEADING } from "./theme";
import {
  LOGIN_BG, LOGIN_INK, LOGIN_CHARCOAL, LOGIN_GOLD, LOGIN_GOLD_DEEP, LOGIN_SECONDARY, LOGIN_MUTED_FG,
  LOGIN_BORDER, LOGIN_DESTRUCTIVE, LOGIN_CARD, LOGIN_INK_RGB, LOGIN_GOLD_RGB, LOGIN_DESTRUCTIVE_RGB,
  LOGIN_BORDER_RGB, LOGIN_MUTED_FG_RGB, LOGIN_SHADOW_CARD, LOGIN_SHADOW_GOLD,
} from "./loginTheme";

export var PET_LOGIN_TAGLINE = "Smart Management. Happier Pets.";

// Optional hero photo: drop src/pages/pet/assets/login-hero.(jpg|jpeg|png|webp) in and it is used;
// without one the hero falls back to the charcoal panel with the paw pattern.
var HERO_FILES = import.meta.glob("./assets/login-hero.{jpg,jpeg,png,webp}", { eager: true, query: "?url", import: "default" });
var HERO_URL = Object.keys(HERO_FILES).length ? HERO_FILES[Object.keys(HERO_FILES)[0]] : null;

var ROLES = [
  { id: "staff", label: "Staff", hint: "Team member PIN", icon: "dog" },
  { id: "admin", label: "Admin", hint: "Administrator PIN", icon: "shield" },
];
var HIGHLIGHTS = [
  { icon: "bag", label: "Point of sale" },
  { icon: "scissors", label: "Grooming & boarding" },
  { icon: "stethoscope", label: "Health records" },
];

var PAW_TILE = "<svg xmlns='http://www.w3.org/2000/svg' width='88' height='88' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><circle cx='5.5' cy='8' r='1.6'/><circle cx='9.7' cy='5' r='1.7'/><circle cx='14.3' cy='5' r='1.7'/><circle cx='18.5' cy='8' r='1.6'/><path d='M12 10.5c-2.9 0-5.2 2.3-5.2 5 0 2 1.5 3.5 3.4 3.5 0.6 0 1.2-0.15 1.8-0.4 0.6 0.25 1.2 0.4 1.8 0.4 1.9 0 3.4-1.5 3.4-3.5 0-2.7-2.3-5-5.2-5z'/></svg>";

var ink = function (a) { return "rgba(" + LOGIN_INK_RGB + "," + a + ")"; };
var gold = function (a) { return "rgba(" + LOGIN_GOLD_RGB + "," + a + ")"; };

var CSS = [
  ".pl-root, .pl-root * { box-sizing: border-box; }",
  ".pl-root { min-height: 100vh; width: 100%; display: grid; grid-template-columns: 1fr; background: " + LOGIN_BG + "; color: " + LOGIN_INK + "; font-family: " + FONT_BODY + "; -webkit-font-smoothing: antialiased; }",
  ".pl-brandfont { font-family: " + FONT_HEADING + "; font-style: italic; font-weight: 400; letter-spacing: 0.01em; }",
  ".pl-hero { position: relative; height: 256px; overflow: hidden; background: " + LOGIN_CHARCOAL + "; }",
  ".pl-hero-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top; }",
  ".pl-hero-shade { position: absolute; inset: 0; background: linear-gradient(to bottom, " + ink(0.7) + ", " + ink(0.1) + ", " + ink(0.85) + "); }",
  ".pl-hero-pattern { position: absolute; inset: 0; opacity: 0.08; pointer-events: none; background-image: url(\"data:image/svg+xml," + encodeURIComponent(PAW_TILE) + "\"); background-size: 88px 88px; }",
  ".pl-hero-body { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 28px; }",
  ".pl-hero-copy { max-width: 448px; color: #fff; }",
  ".pl-kicker { margin: 0; font-size: 12px; line-height: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3em; color: " + LOGIN_GOLD + "; }",
  ".pl-h1 { display: none; margin: 12px 0 0; font-size: 36px; line-height: 1.25; }",
  ".pl-list { display: none; flex-direction: column; gap: 12px; margin: 24px 0 0; padding: 0; list-style: none; }",
  ".pl-list li { display: flex; align-items: center; gap: 12px; font-size: 14px; line-height: 20px; font-weight: 500; color: rgba(255,255,255,0.85); }",
  ".pl-list-icon { display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); color: " + LOGIN_GOLD + "; }",
  ".pl-main { position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 40px 24px; }",
  ".pl-scatter { position: absolute; width: 256px; height: 256px; color: " + LOGIN_GOLD + "; opacity: 0.06; pointer-events: none; }",
  ".pl-wrap { position: relative; z-index: 10; width: 100%; max-width: 448px; }",
  ".pl-card { border-radius: 30px; border: 1px solid rgba(" + LOGIN_BORDER_RGB + ",0.7); background: " + LOGIN_CARD + "; padding: 28px; box-shadow: " + LOGIN_SHADOW_CARD + "; }",
  ".pl-card.locked { border-color: " + LOGIN_DESTRUCTIVE + "; }",
  ".pl-compact { display: block; }",
  ".pl-sep { height: 1px; margin: 28px 0; background: " + LOGIN_BORDER + "; }",
  ".pl-h2 { margin: 0; font-size: 30px; line-height: 36px; color: " + LOGIN_INK + "; }",
  ".pl-sub { margin: 8px 0 0; font-size: 14px; line-height: 20px; color: " + LOGIN_MUTED_FG + "; }",
  ".pl-form { margin-top: 32px; display: flex; flex-direction: column; gap: 24px; }",
  ".pl-roles { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 6px; border-radius: 22px; background: " + LOGIN_SECONDARY + "; }",
  ".pl-role { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 16px; border: 0; border-radius: 18px; background: transparent; color: " + LOGIN_MUTED_FG + "; font: 600 14px/20px " + FONT_BODY + "; cursor: pointer; transition: all .2s; }",
  ".pl-role:hover { background: " + LOGIN_CARD + "; color: " + LOGIN_INK + "; }",
  ".pl-role.on, .pl-role.on:hover { background: " + LOGIN_GOLD + "; color: " + LOGIN_INK + "; box-shadow: " + LOGIN_SHADOW_GOLD + "; }",
  ".pl-role:focus-visible { outline: none; box-shadow: 0 0 0 2px " + LOGIN_GOLD + "; }",
  ".pl-field { display: flex; flex-direction: column; gap: 8px; }",
  ".pl-label { font-size: 12px; line-height: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.18em; color: " + ink(0.8) + "; }",
  ".pl-pin { width: 100%; padding: 16px 20px; border: 1px solid " + LOGIN_BORDER + "; border-radius: 22px; background: " + LOGIN_BG + "; color: " + LOGIN_INK + "; font: 400 24px/32px " + FONT_BODY + "; text-align: center; letter-spacing: 0.5em; outline: none; transition: all .2s; }",
  ".pl-pin::placeholder { color: rgba(" + LOGIN_MUTED_FG_RGB + ",0.4); }",
  ".pl-pin:hover { border-color: " + gold(0.6) + "; }",
  ".pl-pin:focus { border-color: " + LOGIN_GOLD + "; box-shadow: 0 0 0 4px " + gold(0.2) + "; }",
  ".pl-pin.bad, .pl-pin.bad:hover, .pl-pin.bad:focus { border-color: " + LOGIN_DESTRUCTIVE + "; }",
  ".pl-pin.bad:focus { box-shadow: 0 0 0 4px rgba(" + LOGIN_DESTRUCTIVE_RGB + ",0.15); }",
  ".pl-pin.shake { animation: pl-shake .6s ease; }",
  ".pl-pin:disabled { opacity: 0.7; }",
  ".pl-err { margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; color: " + LOGIN_DESTRUCTIVE + "; }",
  ".pl-dots { display: flex; justify-content: center; gap: 6px; }",
  ".pl-dot { width: 8px; height: 8px; border-radius: 50%; background: " + LOGIN_BORDER + "; transition: background .3s; }",
  ".pl-dot.hit { background: " + LOGIN_DESTRUCTIVE + "; }",
  ".pl-submit { display: flex; width: 100%; align-items: center; justify-content: center; gap: 10px; padding: 16px 24px; border: 0; border-radius: 22px; background: " + LOGIN_GOLD + "; color: " + LOGIN_INK + "; font: 700 16px/24px " + FONT_BODY + "; box-shadow: " + LOGIN_SHADOW_GOLD + "; cursor: pointer; transition: all .2s; }",
  ".pl-submit:hover { background: " + LOGIN_GOLD_DEEP + "; box-shadow: " + LOGIN_SHADOW_CARD + "; }",
  ".pl-submit:focus-visible { outline: none; box-shadow: 0 0 0 4px " + gold(0.4) + "; }",
  ".pl-submit:disabled { cursor: not-allowed; opacity: 0.7; }",
  ".pl-arrow { transition: transform .2s; }",
  ".pl-submit:hover .pl-arrow { transform: translateX(4px); }",
  ".pl-spin { animation: pl-spin 1s linear infinite; }",
  ".pl-foot { margin: 28px 0 0; text-align: center; font-size: 12px; line-height: 16px; color: " + LOGIN_MUTED_FG + "; }",
  ".pl-foot a { color: " + LOGIN_MUTED_FG + "; font-weight: 600; text-decoration: none; }",
  ".pl-foot a:hover { color: " + LOGIN_INK + "; }",
  ".pl-lock { text-align: center; }",
  ".pl-lock-count { margin: 20px 0; padding: 18px 0; border-radius: 22px; border: 1.5px solid " + LOGIN_DESTRUCTIVE + "; background: rgba(" + LOGIN_DESTRUCTIVE_RGB + ",0.08); color: " + LOGIN_DESTRUCTIVE + "; }",
  "@keyframes pl-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }",
  "@keyframes pl-spin { to { transform: rotate(360deg); } }",
  "@keyframes pl-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.7; } }",
  "@media (min-width: 640px) { .pl-hero-body { padding: 40px; } .pl-h1 { display: block; } .pl-list { display: flex; } .pl-main { padding-left: 40px; padding-right: 40px; } .pl-card { padding: 36px; } .pl-h2 { font-size: 36px; line-height: 40px; } }",
  "@media (min-width: 1024px) { .pl-root { grid-template-columns: 1.1fr 1fr; } .pl-hero { height: 100vh; } .pl-hero-img { object-position: center; } .pl-hero-body { padding: 56px; } .pl-h1 { font-size: 48px; line-height: 1.25; } .pl-main { padding-top: 64px; padding-bottom: 64px; } .pl-compact { display: none; } }",
].join("\n");

function BrandMark({ salon, tone, size }) {
  var light = tone === "light";
  var hero = size === "hero";
  var name = (salon && salon.name) || PET_NAME;
  var logo = salon && salon.logo_url;
  var box = hero ? 44 : 40;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "center", width: box, height: box, borderRadius: 22, boxShadow: LOGIN_SHADOW_GOLD, background: logo ? LOGIN_CARD : light ? LOGIN_GOLD : LOGIN_INK, overflow: "hidden" }}>
        {logo ? (
          <img src={logo} alt={name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4 }} />
        ) : (
          <LoginIcon name="paw" size={hero ? 24 : 20} color={light ? LOGIN_INK : LOGIN_GOLD} />
        )}
      </span>
      <div style={{ minWidth: 0 }}>
        <p className="pl-brandfont" style={{ margin: 0, fontSize: hero ? 30 : 24, lineHeight: 1, color: light ? "#fff" : LOGIN_INK }}>{name}</p>
        <p style={{ margin: "4px 0 0", fontSize: 10.4, lineHeight: "16px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.28em", color: light ? LOGIN_GOLD : LOGIN_MUTED_FG }}>{PET_LOGIN_TAGLINE}</p>
      </div>
    </div>
  );
}

function Scatter() {
  var paws = [
    { top: -40, right: -48, transform: "rotate(12deg)" },
    { top: "33.333%", left: -64, transform: "rotate(-12deg)" },
    { bottom: -56, right: 40, transform: "rotate(6deg)" },
  ];
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {paws.map(function (p, i) {
        return <span key={i} className="pl-scatter" style={p}><LoginIcon name="paw" size={256} /></span>;
      })}
    </div>
  );
}

export default function PetLoginView(props) {
  var salon = props.salon;
  var role = props.role;
  var name = (salon && salon.name) || PET_NAME;
  var activeRole = ROLES.filter(function (r) { return r.id === role; })[0] || ROLES[0];

  function submit(e) { e.preventDefault(); props.onSubmit(); }

  return (
    <div className="pl-root">
      <style>{CSS}</style>

      <section className="pl-hero">
        {HERO_URL ? <img className="pl-hero-img" src={HERO_URL} alt="" /> : null}
        <div className="pl-hero-shade" />
        <div className="pl-hero-pattern" aria-hidden="true" />
        <div className="pl-hero-body">
          <BrandMark salon={salon} tone="light" size="hero" />
          <div className="pl-hero-copy">
            <p className="pl-kicker">Pet business platform</p>
            <h1 className="pl-h1 pl-brandfont">Smart Management.<br />Happier Pets.</h1>
            <ul className="pl-list">
              {HIGHLIGHTS.map(function (h) {
                return (
                  <li key={h.label}>
                    <span className="pl-list-icon"><LoginIcon name={h.icon} size={16} /></span>
                    {h.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <main className="pl-main">
        <Scatter />
        <div className="pl-wrap">
          <div className={"pl-card" + (props.locked ? " locked" : "")}>
            <div className="pl-compact">
              <BrandMark salon={salon} tone="dark" size="compact" />
              <div className="pl-sep" />
            </div>

            {props.locked ? (
              <div className="pl-lock">
                <span style={{ display: "block", fontSize: 48, marginBottom: 8, animation: "pl-pulse 1.5s ease-in-out infinite" }}>🔒</span>
                <h2 className="pl-h2 pl-brandfont" style={{ color: LOGIN_DESTRUCTIVE }}>Too many attempts</h2>
                <p className="pl-sub">Please wait before trying again.</p>
                <div className="pl-lock-count">
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Retry in</div>
                  <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.1 }}>{props.countdown}s</div>
                </div>
                <p className="pl-foot" style={{ marginTop: 0 }}>Access will restore automatically</p>
              </div>
            ) : (
              <div>
                <h2 className="pl-h2 pl-brandfont">Welcome to {name}</h2>
                <p className="pl-sub">Choose your role to sign in to your workspace.</p>

                <form className="pl-form" onSubmit={submit} noValidate>
                  <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                    <legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Select your role</legend>
                    <div className="pl-roles" role="radiogroup" aria-label="Login role">
                      {ROLES.map(function (r) {
                        var on = role === r.id;
                        return (
                          <button key={r.id} type="button" role="radio" aria-checked={on} className={"pl-role" + (on ? " on" : "")} onClick={function () { props.onRoleChange(r.id); }}>
                            <LoginIcon name={r.icon} size={18} />
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="pl-field">
                    <label className="pl-label" htmlFor="pet-pin">{activeRole.hint}</label>
                    {props.attempts > 0 ? (
                      <div className="pl-dots">
                        {[0, 1, 2].map(function (i) { return <span key={i} className={"pl-dot" + (i < props.attempts ? " hit" : "")} />; })}
                      </div>
                    ) : null}
                    <input
                      id="pet-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={"•  •  •  •"}
                      maxLength={6}
                      value={props.pin}
                      disabled={props.loading}
                      aria-invalid={!!props.error}
                      aria-describedby={props.error ? "pet-pin-error" : undefined}
                      onChange={function (e) { props.onPinChange(e.target.value); }}
                      className={"pl-pin" + (props.error ? " bad" : "") + (props.shake ? " shake" : "")}
                    />
                    {props.error ? <p id="pet-pin-error" role="alert" className="pl-err">{props.error}</p> : null}
                  </div>

                  <button type="submit" className="pl-submit" disabled={props.loading}>
                    {props.loading ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><LoginIcon name="spinner" size={20} className="pl-spin" />Verifying...</span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>Sign in<LoginIcon name="arrow" size={20} className="pl-arrow" /></span>
                    )}
                  </button>
                </form>

                <p className="pl-foot">
                  {role === "admin" ? (
                    <a href={props.forgotHref}>Forgot admin PIN? Click here to reset it.</a>
                  ) : (
                    "Having trouble? Ask an administrator to reset your PIN."
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
