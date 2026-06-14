import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const SUPABASE_URL = "https://ukoccobbjeomjwjcvrma.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrb2Njb2JiamVvbWp3amN2cm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMjg4MzAsImV4cCI6MjA5NjcwNDgzMH0.a-nDh04ujZQ8w9lwu9rkHuge9xGRbLRfV7vD3zRCAqg";

// ── OFFLINE QUEUE ──────────────────────────────────────────────────────────
const offlineQueue = [];
let isSyncing = false;

async function syncOfflineQueue() {
  if (isSyncing || offlineQueue.length === 0 || !navigator.onLine) return;
  isSyncing = true;
  while (offlineQueue.length > 0) {
    const item = offlineQueue[0];
    try {
      await dbDirect(item.method, item.table, item.data, item.filters);
      offlineQueue.shift();
    } catch(e) { break; }
  }
  isSyncing = false;
}

if (typeof window !== "undefined") {
  window.addEventListener("online", syncOfflineQueue);
}

async function dbDirect(method, table, data = null, filters = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}${filters}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": method === "POST" ? "return=representation" : "",
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    if (method === "DELETE" || method === "PATCH") return true;
    return res.json();
  } catch(e) {
    clearTimeout(timeout);
    return null;
  }
}

async function db(method, table, data = null, filters = "") {
  if (!navigator.onLine && method !== "GET") {
    offlineQueue.push({ method, table, data, filters });
    return null;
  }
  return dbDirect(method, table, data, filters);
}

const MPESA_TILL = "5927571";
const MPESA_NAME = "Kimm's Beauty Parlour";
const MPESA_GREEN = "#4CAF50";
const STAFF_PIN  = "1234";   // Staff — POS only
const ADMIN_PIN  = "9999";   // Admin — full access

// Services loaded from Supabase — see POSApp state
const DEFAULT_SERVICES = [
  { id:"SRV001", cat:"Hair",   name:"Hair wash & blow dry",  price:1000 },
  { id:"SRV002", cat:"Hair",   name:"Hair cutting",           price:800  },
  { id:"SRV003", cat:"Hair",   name:"Hair styling",           price:1500 },
  { id:"SRV004", cat:"Hair",   name:"Relaxing",               price:2500 },
  { id:"SRV005", cat:"Hair",   name:"Hair coloring",          price:3000 },
  { id:"SRV006", cat:"Hair",   name:"Hair treatment",         price:2000 },
  { id:"SRV007", cat:"Hair",   name:"Braiding",               price:3000 },
  { id:"SRV008", cat:"Hair",   name:"Weaving",                price:2500 },
  { id:"SRV009", cat:"Hair",   name:"Wig installation",       price:2000 },
  { id:"SRV010", cat:"Hair",   name:"Dreadlocks retwist",     price:2000 },
  { id:"SRV011", cat:"Nails",  name:"Manicure",               price:800  },
  { id:"SRV012", cat:"Nails",  name:"Pedicure",               price:1000 },
  { id:"SRV013", cat:"Nails",  name:"Gel application",        price:1500 },
  { id:"SRV014", cat:"Nails",  name:"Acrylic nails",          price:2500 },
  { id:"SRV015", cat:"Nails",  name:"Nail art",               price:1000 },
  { id:"SRV016", cat:"Beauty", name:"Facial",                 price:2500 },
  { id:"SRV017", cat:"Beauty", name:"Makeup",                 price:3000 },
  { id:"SRV018", cat:"Beauty", name:"Eyebrow shaping",        price:500  },
  { id:"SRV019", cat:"Beauty", name:"Eyelash extensions",     price:2500 },
  { id:"SRV020", cat:"Spa",    name:"Body massage",           price:3000 },
  { id:"SRV021", cat:"Barber", name:"Haircut (men)",          price:500  },
  { id:"SRV022", cat:"Barber", name:"Beard grooming",         price:300  },
];

// Staff loaded dynamically from Supabase — see POSApp state
const DEFAULT_STAFF = [
  { id:"STF001", name:"Lucy",   role:"Stylist",   commission_pct:40, active:true },
  { id:"STF002", name:"Kelvin", role:"Barber",    commission_pct:40, active:true },
  { id:"STF003", name:"Alex",   role:"Nail Technician", commission_pct:40, active:true },
];

const CATS = ["All","Hair","Nails","Beauty","Spa","Barber"];

const BLACK    = "#0A0A0A";
const GOLD     = "#C9A84C";
const GOLD_LT  = "#F0CC6E";
const GOLD_DIM = "#8A6F2E";
const CREAM    = "#FDF8EE";
const DARK     = "#1A1400";
const WHITE    = "#FFFFFF";
const GRAY     = "#F5F0E8";
const GREEN    = "#22C55E";
const RED      = "#EF4444";
const AMBER    = "#F59E0B";

function fmt(n){ return "KES " + Number(n).toLocaleString(); }
function todayStr(){ return new Date().toLocaleDateString("en-KE"); }
function nowTime(){ return new Date().toLocaleTimeString("en-KE",{hour:"2-digit",minute:"2-digit"}); }
function today(){ return new Date().toLocaleDateString("en-KE",{weekday:"long",year:"numeric",month:"long",day:"numeric"}); }

// ── BRAND LOGO ────────────────────────────────────────────────────────────────
function KimmsLogo({ size="md", dark=false }){
  const s = { sm:{crown:18,name:15,tag:9,sub:8}, md:{crown:26,name:22,tag:12,sub:10}, lg:{crown:38,name:32,tag:16,sub:12} }[size]||{crown:26,name:22,tag:12,sub:10};
  const goldColor = dark ? GOLD_DIM : GOLD_LT;
  const textColor = dark ? DARK : WHITE;
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.1}}>
      <svg width={s.crown*2} height={s.crown} viewBox="0 0 60 30" fill="none" style={{marginBottom:2}}>
        <polygon points="5,28 15,8 30,20 45,8 55,28" fill="none" stroke={goldColor} strokeWidth="3" strokeLinejoin="round"/>
        <circle cx="5" cy="28" r="3" fill={goldColor}/>
        <circle cx="30" cy="20" r="3" fill={goldColor}/>
        <circle cx="55" cy="28" r="3" fill={goldColor}/>
        <line x1="5" y1="28" x2="55" y2="28" stroke={goldColor} strokeWidth="3"/>
      </svg>
      <div style={{fontFamily:"Georgia,serif",fontSize:s.name,fontWeight:900,color:goldColor,letterSpacing:"0.04em",fontStyle:"italic"}}>Kimm's</div>
      <div style={{fontSize:s.tag,fontWeight:800,color:textColor,letterSpacing:"0.18em",textTransform:"uppercase",marginTop:1}}>Beauty Parlour</div>
      <div style={{fontSize:s.sub,color:goldColor,letterSpacing:"0.1em",fontStyle:"italic",marginTop:1,opacity:0.85}}>Beauty That Speaks Confidence</div>
    </div>
  );
}

function GoldBtn({ children, onClick, style={}, disabled=false, outline=false }){
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: outline?"transparent":`linear-gradient(135deg,${GOLD} 0%,${GOLD_LT} 50%,${GOLD} 100%)`,
      color: outline?GOLD:BLACK, border:`2px solid ${GOLD}`, borderRadius:10,
      padding:"12px 0", fontWeight:900, fontSize:14, cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.6:1, letterSpacing:"0.04em",
      boxShadow:outline?"none":`0 2px 12px rgba(201,168,76,0.35)`, transition:"all 0.2s", ...style
    }}>{children}</button>
  );
}

function MpesaInstructions({ amount, reference, compact=false }){
  const steps = [`Go to M-Pesa on your phone`,`Select "Lipa na M-Pesa"`,`Select "Buy Goods & Services"`,`Enter Till Number: ${MPESA_TILL}`,`Enter Amount: KES ${Number(amount).toLocaleString()}`,reference?`Enter Reference: ${reference}`:null,`Enter your M-Pesa PIN & confirm`].filter(Boolean);
  if(compact) return (
    <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:12,padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><span style={{fontSize:18}}>📱</span><span style={{fontWeight:800,fontSize:13,color:"#166534"}}>Lipa na M-Pesa</span></div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
        <div style={{background:WHITE,borderRadius:8,padding:"8px 12px",border:"1px solid #BBF7D0",flex:1,minWidth:100}}>
          <div style={{fontSize:10,color:"#888",fontWeight:700,textTransform:"uppercase"}}>Till Number</div>
          <div style={{fontSize:20,fontWeight:900,color:MPESA_GREEN}}>{MPESA_TILL}</div>
        </div>
        <div style={{background:WHITE,borderRadius:8,padding:"8px 12px",border:"1px solid #BBF7D0",flex:1,minWidth:100}}>
          <div style={{fontSize:10,color:"#888",fontWeight:700,textTransform:"uppercase"}}>Amount</div>
          <div style={{fontSize:20,fontWeight:900,color:DARK}}>{fmt(amount)}</div>
        </div>
      </div>
      <div style={{fontSize:11,color:"#166534",marginTop:8,fontWeight:600}}>{MPESA_NAME}</div>
    </div>
  );
  return (
    <div style={{background:"#F0FDF4",border:"2px solid #BBF7D0",borderRadius:16,padding:20}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <span style={{fontSize:24}}>📱</span>
        <div><div style={{fontWeight:900,fontSize:16,color:"#166534"}}>Lipa na M-Pesa</div><div style={{fontSize:12,color:"#4ADE80"}}>Buy Goods & Services</div></div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:16}}>
        <div style={{flex:1,background:WHITE,borderRadius:12,padding:"14px 16px",border:"2px solid #4ADE80",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#888",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Till Number</div>
          <div style={{fontSize:28,fontWeight:900,color:MPESA_GREEN,letterSpacing:"0.12em"}}>{MPESA_TILL}</div>
          <div style={{fontSize:11,color:"#888",marginTop:2}}>{MPESA_NAME}</div>
        </div>
        <div style={{flex:1,background:WHITE,borderRadius:12,padding:"14px 16px",border:"2px solid #4ADE80",textAlign:"center"}}>
          <div style={{fontSize:11,color:"#888",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Amount</div>
          <div style={{fontSize:24,fontWeight:900,color:DARK}}>{fmt(amount)}</div>
          {reference&&<div style={{fontSize:11,color:"#888",marginTop:2}}>Ref: {reference}</div>}
        </div>
      </div>
      <div style={{borderTop:"1px solid #BBF7D0",paddingTop:14}}>
        <div style={{fontSize:12,fontWeight:800,color:"#166534",marginBottom:10,textTransform:"uppercase"}}>How to pay</div>
        {steps.map((step,i)=>(
          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:8}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:MPESA_GREEN,color:WHITE,fontSize:11,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
            <div style={{fontSize:13,color:DARK,paddingTop:2,lineHeight:1.4}}>{step}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }){
  const [pin,setPin]=useState("");
  const [role,setRole]=useState("staff"); // "staff" | "admin"
  const [error,setError]=useState(false);

  function handleLogin(){
    const correct = role==="admin" ? ADMIN_PIN : STAFF_PIN;
    if(pin===correct){ onLogin(role); }
    else { setError(true); setPin(""); setTimeout(()=>setError(false),2000); }
  }

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${BLACK} 0%,#1A1400 60%,#2C1F00 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{position:"absolute",width:280,height:280,borderRadius:"50%",border:`2px solid ${GOLD}`,opacity:0.1,pointerEvents:"none"}}/>
      <div style={{background:"rgba(255,255,255,0.04)",border:`1.5px solid ${GOLD_DIM}`,borderRadius:24,padding:36,maxWidth:340,width:"100%",textAlign:"center",boxShadow:`0 8px 40px rgba(0,0,0,0.6)`}}>
        <KimmsLogo size="lg" dark={false}/>
        <div style={{borderTop:`1px solid ${GOLD_DIM}`,margin:"24px 0 20px",opacity:0.4}}/>

        {/* Role selector */}
        <div style={{display:"flex",background:"rgba(255,255,255,0.06)",borderRadius:10,padding:3,marginBottom:20,border:`1px solid ${GOLD_DIM}`}}>
          {["staff","admin"].map(r=>(
            <button key={r} onClick={()=>{setRole(r);setPin("");setError(false);}} style={{
              flex:1,border:"none",borderRadius:8,padding:"9px 0",fontSize:13,fontWeight:700,
              background:role===r?`linear-gradient(135deg,${GOLD},${GOLD_LT})`:"transparent",
              color:role===r?BLACK:"rgba(255,255,255,0.4)",cursor:"pointer",transition:"all 0.2s",
              textTransform:"capitalize"
            }}>{r==="admin"?"👑 Admin":"✂ Staff"}</button>
          ))}
        </div>

        <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginBottom:12,letterSpacing:"0.1em",textTransform:"uppercase"}}>
          {role==="admin"?"Owner PIN":"Staff PIN"}
        </div>
        <input type="password" placeholder="Enter PIN" value={pin}
          onChange={e=>setPin(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&handleLogin()} maxLength={6}
          style={{width:"100%",borderRadius:10,border:`1.5px solid ${error?RED:GOLD_DIM}`,background:"rgba(255,255,255,0.06)",padding:"13px 14px",fontSize:24,textAlign:"center",letterSpacing:"0.4em",boxSizing:"border-box",fontFamily:"inherit",outline:"none",color:WHITE,marginBottom:8}}/>
        {error&&<div style={{color:RED,fontSize:12,marginBottom:8}}>Incorrect PIN. Try again.</div>}
        <GoldBtn onClick={handleLogin} style={{width:"100%",marginTop:8}}>Login →</GoldBtn>
        <div style={{marginTop:24,borderTop:`1px solid rgba(201,168,76,0.2)`,paddingTop:16}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:8}}>Are you a customer?</div>
          <a href="/booking" style={{fontSize:13,color:GOLD_LT,fontWeight:700,textDecoration:"none"}}>Book an appointment →</a>
        </div>
      </div>
    </div>
  );
}

// ── RECEIPT ───────────────────────────────────────────────────────────────────
function Receipt({ sale, onClose }){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:WHITE,borderRadius:16,padding:28,width:340,maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{textAlign:"center",marginBottom:16}}>
          <KimmsLogo size="sm" dark={true}/>
          <div style={{fontSize:11,color:"#888",marginTop:8}}>Receipt · {sale.date} · {sale.time}</div>
          <div style={{borderBottom:"2px dashed #ddd",margin:"12px 0"}}/>
        </div>
        <div style={{fontSize:12,color:"#555",marginBottom:4}}><b>Client:</b> {sale.client}</div>
        <div style={{fontSize:12,color:"#555",marginBottom:4}}><b>Stylist:</b> {sale.stylist}</div>
        <div style={{borderBottom:"1px solid #eee",margin:"10px 0"}}/>
        {(Array.isArray(sale.items)?sale.items:[]).map((it,i)=>{
          if(!it||!it.name) return null;
          const qty = it.qty||1;
          const price = it.price||0;
          return(
            <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
              <span>{it.name} {qty>1?`×${qty}`:""}</span>
              <span style={{fontWeight:700}}>{fmt(price*qty)}</span>
            </div>
          );
        })}
        <div style={{borderBottom:"2px dashed #ddd",margin:"10px 0"}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:16,color:DARK}}>
          <span>TOTAL</span><span style={{color:GOLD_DIM}}>{fmt(sale.total)}</span>
        </div>
        <div style={{fontSize:12,color:"#888",marginTop:4}}><b>Payment:</b> {sale.payment}</div>
        {sale.payment==="M-Pesa"&&<div style={{marginTop:14}}><MpesaInstructions amount={sale.total} reference={sale.client} compact={true}/></div>}
        <div style={{borderBottom:"1px solid #eee",margin:"12px 0"}}/>
        <div style={{textAlign:"center",fontSize:12,color:"#aaa",marginBottom:16,fontStyle:"italic"}}>"Beauty That Speaks Confidence" 👑</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>window.print()} style={{flex:1,background:CREAM,border:`1.5px solid ${GOLD_DIM}`,borderRadius:10,padding:"11px 0",fontWeight:700,fontSize:13,cursor:"pointer",color:GOLD_DIM}}>🖨️ Print</button>
          <GoldBtn onClick={onClose} style={{flex:2}}>Close</GoldBtn>
        </div>
        <style>{`@media print { body * { visibility: hidden; } .receipt-print, .receipt-print * { visibility: visible; } .receipt-print { position: fixed; top: 0; left: 0; width: 100%; } }`}</style>
      </div>
    </div>
  );
}

// ── FEEDBACK ──────────────────────────────────────────────────────────────────
function FeedbackModal({ onSubmit, onClose }){
  const [rating,setRating]=useState(0); const [note,setNote]=useState(""); const [stylist,setStylist]=useState("");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:WHITE,borderRadius:20,padding:28,width:340,border:`1.5px solid ${GOLD_DIM}`}}>
        <div style={{background:`linear-gradient(135deg,${BLACK},#2C1F00)`,borderRadius:12,padding:"16px",textAlign:"center",marginBottom:20,border:`1px solid ${GOLD_DIM}`}}>
          <div style={{fontSize:20,color:GOLD_LT,fontWeight:900,fontFamily:"Georgia,serif",fontStyle:"italic"}}>How was your visit?</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",marginTop:4,letterSpacing:"0.06em"}}>YOUR FEEDBACK MEANS THE WORLD TO US 👑</div>
        </div>
        <div style={{fontSize:13,fontWeight:700,color:DARK,marginBottom:8}}>Rate your experience</div>
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          {[1,2,3,4,5].map(s=>(
            <button key={s} onClick={()=>setRating(s)} style={{width:44,height:44,borderRadius:10,border:`2px solid ${rating>=s?GOLD:"#eee"}`,background:rating>=s?`linear-gradient(135deg,${BLACK},#2C1F00)`:"#fafafa",fontSize:20,cursor:"pointer"}}>⭐</button>
          ))}
        </div>
        <div style={{fontSize:13,fontWeight:700,color:DARK,marginBottom:8}}>Which stylist served you?</div>
        <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
          {DEFAULT_STAFF.map(s=>(
            <button key={s.id} onClick={()=>setStylist(s.name)} style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${stylist===s.name?GOLD:"#eee"}`,background:stylist===s.name?`linear-gradient(135deg,${BLACK},#2C1F00)`:WHITE,fontSize:12,fontWeight:700,cursor:"pointer",color:stylist===s.name?GOLD_LT:DARK}}>{s.name}</button>
          ))}
        </div>
        <div style={{fontSize:13,fontWeight:700,color:DARK,marginBottom:8}}>Any comments? (optional)</div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Tell us about your experience..."
          style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,resize:"none",height:72,boxSizing:"border-box",fontFamily:"inherit",outline:"none"}}/>
        <GoldBtn onClick={()=>{ if(rating===0)return alert("Please select a star rating"); onSubmit({rating,stylist,note,date:today(),time:nowTime()}); }} style={{width:"100%",marginTop:14}}>Submit Feedback 👑</GoldBtn>
        <button onClick={onClose} style={{width:"100%",background:"none",border:"none",color:"#aaa",fontSize:12,cursor:"pointer",marginTop:8}}>Skip</button>
      </div>
    </div>
  );
}

// ── MPESA PAYMENT MODAL ───────────────────────────────────────────────────────
function MpesaPaymentModal({ booking, onPaid, onPayLater }){
  const [confirmed,setConfirmed]=useState(false);
  if(confirmed) return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:WHITE,borderRadius:20,padding:28,maxWidth:360,width:"100%",textAlign:"center",border:`2px solid ${GOLD}`}}>
        <div style={{fontSize:52,marginBottom:12}}>✅</div>
        <div style={{fontSize:20,fontWeight:900,color:"#166534",marginBottom:8}}>Payment Confirmed!</div>
        <div style={{fontSize:13,color:"#555",marginBottom:20,lineHeight:1.7}}>Thank you, <b>{booking.name}</b>!<br/>Your <b>{booking.service}</b> is fully paid.<br/>See you on <b>{booking.date} at {booking.time}</b> 💕</div>
        <GoldBtn onClick={onPaid} style={{width:"100%"}}>Done 🎉</GoldBtn>
      </div>
    </div>
  );
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:WHITE,borderRadius:20,padding:24,maxWidth:380,width:"100%",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{textAlign:"center",marginBottom:20}}><KimmsLogo size="sm" dark={true}/><div style={{fontSize:12,color:"#888",marginTop:8}}>Pay for your booking</div></div>
        <div style={{background:GRAY,borderRadius:12,padding:"12px 14px",marginBottom:16,fontSize:13,border:`1px solid ${GOLD_DIM}`}}>
          <div style={{fontWeight:800,color:DARK,marginBottom:4}}>{booking.service}</div>
          <div style={{color:"#888"}}>📅 {booking.date} at {booking.time} · {booking.stylist}</div>
        </div>
        <MpesaInstructions amount={booking.price} reference={booking.name}/>
        <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={()=>setConfirmed(true)} style={{width:"100%",background:MPESA_GREEN,color:WHITE,border:"none",borderRadius:12,padding:"13px 0",fontWeight:900,fontSize:15,cursor:"pointer"}}>✅ I've Sent the Payment</button>
          <button onClick={onPayLater} style={{width:"100%",background:WHITE,color:"#888",border:`1.5px solid ${GOLD_DIM}`,borderRadius:12,padding:"12px 0",fontWeight:700,fontSize:14,cursor:"pointer"}}>Pay at the Salon Instead →</button>
        </div>
        <div style={{marginTop:14,textAlign:"center",fontSize:11,color:"#bbb",lineHeight:1.6}}>Your booking is confirmed either way.</div>
      </div>
    </div>
  );
}

// ── BOOKING PAGE ──────────────────────────────────────────────────────────────
function BookingPage(){
  const [step,setStep]=useState(1);
  const [sel,setSel]=useState({service:null,stylist:null,date:"",time:"",name:"",phone:""});
  const [done,setDone]=useState(false); const [saving,setSaving]=useState(false);
  const [showMpesa,setShowMpesa]=useState(false); const [savedBooking,setSavedBooking]=useState(null);
  const [paymentStatus,setPaymentStatus]=useState(null);
  const [bookingServices,setBookingServices]=useState(DEFAULT_SERVICES);
  const [bookingStaff,setBookingStaff]=useState(DEFAULT_STAFF);

  useEffect(()=>{
    async function loadBookingData(){
      const [sv,st] = await Promise.all([
        db("GET","services",null,"?active=eq.true&order=cat.asc,name.asc"),
        db("GET","staff",null,"?active=eq.true&order=created_at.asc"),
      ]);
      if(sv&&sv.length>0) setBookingServices(sv);
      if(st&&st.length>0) setBookingStaff(st);
    }
    loadBookingData();
  },[]);

  async function confirm(){
    if(!sel.name||!sel.phone) return alert("Please enter your name and phone number");
    setSaving(true);
    // Save booking
    const result = await db("POST","bookings",{name:sel.name,phone:sel.phone,service:sel.service?.name,price:sel.service?.price,stylist:sel.stylist||"Any available",date:sel.date,time:sel.time,status:"pending",payment_status:"pending"});
    // Auto-save customer record
    const existing = await db("GET","customers",null,`?phone=eq.${sel.phone}&limit=1`);
    if(existing && existing.length===0){
      await db("POST","customers",{name:sel.name,phone:sel.phone,visit_count:0,total_spend:0,last_visit:sel.date});
    }
    setSaving(false);
    setSavedBooking({id:result?.[0]?.id,name:sel.name,phone:sel.phone,service:sel.service?.name,price:sel.service?.price,stylist:sel.stylist||"Any available",date:sel.date,time:sel.time});
    setShowMpesa(true);
  }
  async function handlePaid(){ if(savedBooking?.id) await db("PATCH","bookings",{payment_status:"paid_upfront"},`?id=eq.${savedBooking.id}`); setPaymentStatus("paid");setShowMpesa(false);setDone(true); }
  async function handlePayLater(){ if(savedBooking?.id) await db("PATCH","bookings",{payment_status:"pay_later"},`?id=eq.${savedBooking.id}`); setPaymentStatus("pay_later");setShowMpesa(false);setDone(true); }

  if(showMpesa&&savedBooking) return <MpesaPaymentModal booking={savedBooking} onPaid={handlePaid} onPayLater={handlePayLater}/>;

  if(done){
    const waMessage = encodeURIComponent(`✂ Kimm's Beauty Parlour\n\nHi ${sel.name}! Your booking is confirmed 💕\n\nService: ${sel.service?.name}\nStylist: ${sel.stylist||"Any available"}\nDate: ${sel.date}\nTime: ${sel.time}\nPrice: KES ${sel.service?.price?.toLocaleString()}\nPayment: ${paymentStatus==="paid"?"✅ Paid via M-Pesa":"Pay at salon"}\n\nWe look forward to seeing you!\nFor enquiries: 0113828280`);
    return (
      <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${BLACK} 0%,#1A1400 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:"rgba(255,255,255,0.05)",border:`1.5px solid ${GOLD_DIM}`,borderRadius:20,padding:36,maxWidth:380,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>{paymentStatus==="paid"?"💚":"👑"}</div>
          <div style={{fontSize:22,fontWeight:900,color:GOLD_LT,fontFamily:"Georgia,serif",fontStyle:"italic",marginBottom:8}}>{paymentStatus==="paid"?"Booked & Paid!":"You're booked!"}</div>
          <div style={{display:"inline-block",padding:"6px 16px",borderRadius:20,fontSize:12,fontWeight:800,marginBottom:16,background:paymentStatus==="paid"?"#D1FAE5":`rgba(201,168,76,0.15)`,color:paymentStatus==="paid"?"#065F46":GOLD_LT}}>
            {paymentStatus==="paid"?"✅ Paid via M-Pesa":"🕐 Pay at Salon"}
          </div>
          <div style={{fontSize:14,color:"rgba(255,255,255,0.7)",lineHeight:1.8,marginBottom:20}}>
            <b style={{color:WHITE}}>{sel.service?.name}</b> with <b style={{color:WHITE}}>{sel.stylist||"any available stylist"}</b><br/>
            📅 {sel.date} at {sel.time}<br/>💰 KES {sel.service?.price?.toLocaleString()}
          </div>
          {paymentStatus==="pay_later"&&(
            <div style={{background:"rgba(76,175,80,0.1)",border:"1.5px solid #4ADE80",borderRadius:12,padding:"14px",marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:"#4ADE80",marginBottom:8}}>Want to pay now?</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginBottom:10}}>Till: <b style={{color:MPESA_GREEN}}>{MPESA_TILL}</b> · {fmt(sel.service?.price)}</div>
              <button onClick={()=>setShowMpesa(true)} style={{width:"100%",background:MPESA_GREEN,color:WHITE,border:"none",borderRadius:10,padding:"10px 0",fontWeight:800,fontSize:13,cursor:"pointer"}}>📱 Pay via M-Pesa</button>
            </div>
          )}
          <a href={`https://wa.me/254113828280?text=${waMessage}`} target="_blank" rel="noreferrer"
            style={{display:"block",background:"#25D366",color:WHITE,borderRadius:12,padding:"13px 0",fontWeight:800,fontSize:15,textDecoration:"none",marginBottom:10}}>📲 Confirm via WhatsApp</a>
          <button onClick={()=>{setSel({service:null,stylist:null,date:"",time:"",name:"",phone:""});setStep(1);setDone(false);setPaymentStatus(null);setSavedBooking(null);}}
            style={{background:"transparent",border:`1px solid ${GOLD_DIM}`,borderRadius:10,padding:"10px 24px",fontWeight:700,fontSize:13,cursor:"pointer",color:"rgba(255,255,255,0.5)"}}>
            Book another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${BLACK} 0%,#1A1400 100%)`,paddingBottom:40}}>
      <div style={{background:`linear-gradient(135deg,${BLACK},#2C1F00)`,borderBottom:`2px solid ${GOLD}`,padding:"22px 20px 18px",textAlign:"center"}}>
        <KimmsLogo size="md" dark={false}/>
        <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:8,letterSpacing:"0.1em",textTransform:"uppercase"}}>Book your appointment</div>
      </div>
      <div style={{display:"flex",justifyContent:"center",gap:0,padding:"16px 20px 0"}}>
        {["Service","Stylist","Date & Time","Your Details"].map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center"}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:step>i+1?GREEN:step===i+1?GOLD:"rgba(255,255,255,0.1)",color:step===i+1?BLACK:WHITE,fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${step>=i+1?GOLD:"rgba(255,255,255,0.2)"}`}}>{step>i+1?"✓":i+1}</div>
            {i<3&&<div style={{width:20,height:2,background:step>i+1?GOLD:"rgba(255,255,255,0.1)"}}/>}
          </div>
        ))}
      </div>
      <div style={{maxWidth:420,margin:"0 auto",padding:"20px 16px 0"}}>
        {step===1&&(
          <div>
            <div style={{fontWeight:800,fontSize:16,color:WHITE,marginBottom:14}}>Choose a service</div>
            {CATS.filter(c=>c!=="All").map(cat=>(
              <div key={cat} style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:800,color:GOLD_LT,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>{cat}</div>
                {bookingServices.filter(s=>s.cat===cat).map(s=>(
                  <div key={s.id} onClick={()=>{setSel(p=>({...p,service:s}));setStep(2);}}
                    style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"12px 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:`1.5px solid ${sel.service?.id===s.id?GOLD:"rgba(255,255,255,0.1)"}`}}>
                    <span style={{fontSize:14,fontWeight:600,color:WHITE}}>{s.name}</span>
                    <span style={{fontSize:13,fontWeight:800,color:GOLD_LT}}>{fmt(s.price)}</span>
                  </div>
                ))}
              </div>
            ))}
          {/* WhatsApp Help Button */}
          <div style={{marginTop:24,padding:"14px 16px",background:"rgba(255,255,255,0.05)",borderRadius:14,border:"1px solid rgba(255,255,255,0.1)",textAlign:"center"}}>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",marginBottom:4}}>Can't find what you're looking for?</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginBottom:12}}>Our team is happy to help you book the right service</div>
            <a href={"https://wa.me/254113828280?text=Help%20me%20book%20at%20Kimms%20Beauty%20Parlour"}
              target="_blank" rel="noreferrer"
              style={{display:"inline-flex",alignItems:"center",gap:8,background:"#25D366",color:WHITE,borderRadius:24,padding:"10px 20px",fontWeight:800,fontSize:14,textDecoration:"none",boxShadow:"0 2px 12px rgba(37,211,102,0.3)"}}>
              <span style={{fontSize:18}}>💬</span>
              Chat on WhatsApp
            </a>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:8}}>We'll respond within minutes</div>
          </div>
          </div>
        )}
        {step===2&&(
          <div>
            <div style={{fontWeight:800,fontSize:16,color:WHITE,marginBottom:14}}>Choose your stylist</div>
            {[...bookingStaff,{id:"any",name:"Any available",role:"We'll assign the best match"}].map(s=>(
              <div key={s.id} onClick={()=>{setSel(p=>({...p,stylist:s.name}));setStep(3);}}
                style={{background:"rgba(255,255,255,0.05)",borderRadius:12,padding:"14px 16px",marginBottom:10,cursor:"pointer",border:`1.5px solid ${sel.stylist===s.name?GOLD:"rgba(255,255,255,0.1)"}`,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:`linear-gradient(135deg,${BLACK},#2C1F00)`,border:`1.5px solid ${GOLD_DIM}`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:GOLD_LT,fontSize:14,flexShrink:0}}>{s.name[0]}</div>
                <div><div style={{fontWeight:700,fontSize:14,color:WHITE}}>{s.name}</div><div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>{s.role}</div></div>
              </div>
            ))}
            <button onClick={()=>setStep(1)} style={{background:"none",border:"none",color:GOLD_LT,fontSize:13,cursor:"pointer",marginTop:4}}>← Back</button>
          </div>
        )}
        {step===3&&(
          <div>
            <div style={{fontWeight:800,fontSize:16,color:WHITE,marginBottom:14}}>Pick a date & time</div>
            <input type="date" value={sel.date} onChange={e=>setSel(p=>({...p,date:e.target.value}))} min={new Date().toISOString().split("T")[0]}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,background:"rgba(255,255,255,0.06)",padding:"11px 14px",fontSize:14,boxSizing:"border-box",marginBottom:14,fontFamily:"inherit",outline:"none",color:WHITE}}/>
            <div style={{fontWeight:700,fontSize:13,color:WHITE,marginBottom:10}}>Available slots</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"].map(t=>(
                <button key={t} onClick={()=>setSel(p=>({...p,time:t}))} style={{padding:"8px 14px",borderRadius:20,border:`1.5px solid ${sel.time===t?GOLD:"rgba(255,255,255,0.15)"}`,background:sel.time===t?`linear-gradient(135deg,${GOLD},${GOLD_LT})`:"rgba(255,255,255,0.05)",color:sel.time===t?BLACK:WHITE,fontSize:13,fontWeight:700,cursor:"pointer"}}>{t}</button>
              ))}
            </div>
            <GoldBtn onClick={()=>{ if(!sel.date||!sel.time) return alert("Please select date and time"); setStep(4); }} style={{width:"100%"}}>Continue →</GoldBtn>
            <button onClick={()=>setStep(2)} style={{background:"none",border:"none",color:GOLD_LT,fontSize:13,cursor:"pointer",marginTop:8,display:"block"}}>← Back</button>
          </div>
        )}
        {step===4&&(
          <div>
            <div style={{fontWeight:800,fontSize:16,color:WHITE,marginBottom:14}}>Your details</div>
            <div style={{background:"rgba(201,168,76,0.1)",border:`1px solid ${GOLD_DIM}`,borderRadius:12,padding:"12px 14px",marginBottom:16,fontSize:13,color:WHITE}}>
              <b style={{color:GOLD_LT}}>{sel.service?.name}</b> · {fmt(sel.service?.price)} · {sel.stylist} · {sel.date} at {sel.time}
            </div>
            <input placeholder="Your name" value={sel.name} onChange={e=>setSel(p=>({...p,name:e.target.value}))}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,background:"rgba(255,255,255,0.06)",padding:"11px 14px",fontSize:14,boxSizing:"border-box",marginBottom:10,fontFamily:"inherit",outline:"none",color:WHITE}}/>
            <input placeholder="Phone number (e.g. 0712345678)" value={sel.phone} onChange={e=>setSel(p=>({...p,phone:e.target.value}))}
              style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,background:"rgba(255,255,255,0.06)",padding:"11px 14px",fontSize:14,boxSizing:"border-box",marginBottom:16,fontFamily:"inherit",outline:"none",color:WHITE}}/>
            <div style={{background:"rgba(76,175,80,0.1)",border:"1.5px solid #4ADE80",borderRadius:12,padding:"12px 14px",marginBottom:16}}>
              <div style={{fontSize:12,fontWeight:800,color:"#4ADE80",marginBottom:4}}>💳 Payment Options</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginBottom:2}}>📱 <b>Lipa na M-Pesa</b> — Pay upfront or at the salon</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>Till: <b style={{color:MPESA_GREEN}}>{MPESA_TILL}</b> · {MPESA_NAME}</div>
            </div>
            <GoldBtn onClick={confirm} disabled={saving} style={{width:"100%"}}>{saving?"Saving...":"Confirm Booking 👑"}</GoldBtn>
            <button onClick={()=>setStep(3)} style={{background:"none",border:"none",color:GOLD_LT,fontSize:13,cursor:"pointer",marginTop:8,display:"block"}}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN POS ──────────────────────────────────────────────────────────────────
function POSApp({ onLogout, userRole="staff" }){
  const isAdmin = userRole === "admin";
  const [darkMode, setDarkMode] = useState(()=>localStorage.getItem("kimms_dark")==="true");

  useEffect(()=>{
    localStorage.setItem("kimms_dark", darkMode);
    document.body.style.background = darkMode ? "#0A0A0A" : "#FDF8EE";
  },[darkMode]);

  // Dark mode color overrides
  const BG    = darkMode ? "#0A0A0A" : CREAM;
  const CARD  = darkMode ? "#1A1400" : WHITE;
  const TEXT  = darkMode ? WHITE     : DARK;
  const BORDER= darkMode ? GOLD_DIM+"55" : GOLD_DIM+"33";
  const SUBTEXT = darkMode ? "rgba(255,255,255,0.5)" : "#888";
  const [page,setPage]=useState("pos");
  const [cart,setCart]=useState([]);
  const [clientName,setClientName]=useState("");
  const [clientPhone,setClientPhone]=useState("");
  const [selectedCustomer,setSelectedCustomer]=useState(null);
  const [customerSearch,setCustomerSearch]=useState("");
  const [customerResults,setCustomerResults]=useState([]);
  const [showCustomerDrop,setShowCustomerDrop]=useState(false);
  const [addingNewCustomer,setAddingNewCustomer]=useState(false);
  const [selStaff,setSelStaff]=useState("");
  const [payMethod,setPayMethod]=useState("M-Pesa");
  const [catFilter,setCatFilter]=useState("All");
  const [typeFilter,setTypeFilter]=useState("services");

  const [sales,setSales]=useState([]);
  const [products,setProducts]=useState([]);
  const [feedbacks,setFeedbacks]=useState([]);
  const [appointments,setAppointments]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [staffList,setStaffList]=useState(DEFAULT_STAFF);
  const [servicesList,setServicesList]=useState(DEFAULT_SERVICES);
  const [loading,setLoading]=useState(true);
  const [showAddStaff,setShowAddStaff]=useState(false);
  const [editingStaff,setEditingStaff]=useState(null);
  const [newStaff,setNewStaff]=useState({name:"",role:"Stylist",commission_pct:40});
  const [showAddService,setShowAddService]=useState(false);
  const [editingService,setEditingService]=useState(null);
  const [newService,setNewService]=useState({name:"",cat:"Hair",price:""});
  const [showAddProduct,setShowAddProduct]=useState(false);
  const [newProduct,setNewProduct]=useState({name:"",cat:"Hair",price:"",stock:""});

  const [receipt,setReceipt]=useState(null);
  const [showFeedback,setShowFeedback]=useState(false);
  const [loadingAppts,setLoadingAppts]=useState(false);
  const [showMpesaConfirm,setShowMpesaConfirm]=useState(false);
  const [time,setTime]=useState(nowTime());
  const [toast,setToast]=useState(null); // {msg, type: "success"|"error"|"info"}

  function showToast(msg, type="success"){
    setToast({msg,type});
    setTimeout(()=>setToast(null),3000);
  }

  useEffect(()=>{
    async function loadAll(){
      try {
        const [s,p,f,c,st,sv] = await Promise.all([
          db("GET","sales",null,"?order=created_at.desc&limit=100"),
          db("GET","stock",null,"?limit=50"),
          db("GET","feedback",null,"?order=created_at.desc&limit=50"),
          db("GET","customers",null,"?order=created_at.desc&limit=200"),
          db("GET","staff",null,"?active=eq.true&order=created_at.asc"),
          db("GET","services",null,"?active=eq.true&order=cat.asc,name.asc"),
        ]);
        if(s) setSales(s);
        if(p&&p.length>0) setProducts(p);
        if(f) setFeedbacks(f);
        if(c) setCustomers(c);
        if(st&&st.length>0) setStaffList(st);
        if(sv&&sv.length>0) setServicesList(sv);
      } catch(e) {
        console.error("Load error:",e);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
    const t=setInterval(()=>setTime(nowTime()),30000);
    return()=>clearInterval(t);
  },[]);

  // ── Customer search ──
  async function searchCustomers(q){
    setCustomerSearch(q);
    if(q.length < 2){ setCustomerResults([]); setShowCustomerDrop(false); return; }
    try {
      const results = customers.filter(c=>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        (c.phone && c.phone.includes(q))
      );
      setCustomerResults(results);
      setShowCustomerDrop(true);
    } catch(e) {
      setCustomerResults([]);
    }
  }

  function selectCustomer(c){
    setSelectedCustomer(c);
    setClientName(c.name);
    setClientPhone(c.phone||"");
    setCustomerSearch(c.name);
    setShowCustomerDrop(false);
    setAddingNewCustomer(false);
  }

  function clearCustomer(){
    setSelectedCustomer(null);
    setClientName("");
    setClientPhone("");
    setCustomerSearch("");
    setAddingNewCustomer(false);
  }

  async function saveNewCustomer(){
    if(!clientName) return alert("Please enter customer name");
    const saved = await db("POST","customers",{
      name:clientName, phone:clientPhone,
      visit_count:1, total_spend:0, last_visit:todayStr()
    });
    const newC = saved?.[0]||{id:Date.now(),name:clientName,phone:clientPhone,visit_count:1,total_spend:0};
    setCustomers(p=>[newC,...p]);
    setSelectedCustomer(newC);
    setAddingNewCustomer(false);
    setShowCustomerDrop(false);
    showToast(`${clientName} added as new client!`);
  }

  async function updateCustomerAfterSale(total){
    if(!selectedCustomer?.id) return;
    const newVisits = (selectedCustomer.visit_count||0) + 1;
    const newSpend  = (selectedCustomer.total_spend||0) + total;
    await db("PATCH","customers",{
      visit_count:newVisits, total_spend:newSpend, last_visit:todayStr()
    },`?id=eq.${selectedCustomer.id}`);
    setCustomers(p=>p.map(c=>c.id===selectedCustomer.id?{...c,visit_count:newVisits,total_spend:newSpend,last_visit:todayStr()}:c));
  }

  async function loadAppointments(){
    setLoadingAppts(true);
    try {
      const data = await db("GET","bookings",null,"?order=created_at.desc&limit=50");
      if(data && Array.isArray(data)) setAppointments(data);
    } catch(e) {
      console.error("Bookings load error:",e);
    } finally {
      setLoadingAppts(false);
    }
  }
  useEffect(()=>{ if(page==="appointments") loadAppointments(); },[page]);

  async function markDone(id){ await db("PATCH","bookings",{status:"done"},`?id=eq.${id}`); setAppointments(p=>p.map(a=>a.id===id?{...a,status:"done"}:a)); showToast("Booking marked as done ✅"); }
  async function markCancelled(id){ await db("PATCH","bookings",{status:"cancelled"},`?id=eq.${id}`); setAppointments(p=>p.map(a=>a.id===id?{...a,status:"cancelled"}:a)); }

  async function convertToSale(a){
    // Mark booking as done
    await db("PATCH","bookings",{status:"done"},`?id=eq.${a.id}`);
    setAppointments(p=>p.map(b=>b.id===a.id?{...b,status:"done"}:b));
    // Find or create customer
    const existing = await db("GET","customers",null,`?phone=eq.${a.phone}&limit=1`);
    let customer = existing?.[0];
    if(!customer){
      const saved = await db("POST","customers",{name:a.name,phone:a.phone,visit_count:0,total_spend:0,last_visit:todayStr()});
      customer = saved?.[0];
    }
    if(customer) setCustomers(p=>p.find(c=>c.id===customer.id)?p:[customer,...p]);
    // Find service from SERVICES list
    const svc = servicesList.find(s=>s.name===a.service);
    const cartItem = svc ? [{...svc,type:"service",qty:1}] : [];
    // Pre-fill POS
    setSelectedCustomer(customer||{name:a.name,phone:a.phone});
    setClientName(a.name);
    setClientPhone(a.phone||"");
    setCustomerSearch(a.name);
    setCart(cartItem);
    setSelStaff(staffList.find(s=>s.name===a.stylist)?.name||"");
    setPage("pos");
  }

  const cartTotal = cart.reduce((s,i)=>s+i.price*(i.qty||1),0);
  const commission = cartTotal*0.4;

  function addToCart(item,type){ setCart(prev=>{ const ex=prev.find(i=>i.id===item.id); if(ex) return prev.map(i=>i.id===item.id?{...i,qty:(i.qty||1)+1}:i); return [...prev,{...item,type,qty:1}]; }); }
  function removeFromCart(id){ setCart(p=>p.filter(i=>i.id!==id)); }

  async function completeSale(){
    if(!clientName) return alert("Please enter or select a client");
    if(!selStaff) return alert("Please select a stylist");
    if(cart.length===0) return alert("Cart is empty");
    try {
      const saleData={client:clientName,stylist:selStaff,items:cart,total:cartTotal,commission,payment:payMethod,date:todayStr(),time:nowTime()};
      const saved = await db("POST","sales",saleData);
      const newSale = saved?.[0]||{...saleData,id:"S"+Date.now()};
      setSales(p=>[newSale,...p]);
      for(const ci of cart.filter(i=>i.type==="product")){
        const prod=products.find(p=>p.id===ci.id);
        if(prod){ const ns=Math.max(0,prod.stock-ci.qty); await db("PATCH","stock",{stock:ns},`?id=eq.${ci.id}`); setProducts(p=>p.map(pr=>pr.id===ci.id?{...pr,stock:ns}:pr)); }
      }
      await updateCustomerAfterSale(cartTotal);
      setReceipt(newSale);
      setCart([]); setClientName(""); setClientPhone(""); setSelStaff(""); setPayMethod("M-Pesa");
      setSelectedCustomer(null); setCustomerSearch(""); setAddingNewCustomer(false);
      setShowMpesaConfirm(false);
      showToast(`Sale of ${fmt(cartTotal)} saved! 🎉`);
      setTimeout(()=>setShowFeedback(true), 300);
    } catch(err) {
      console.error("Sale error:",err);
      setCart([]); setClientName(""); setClientPhone(""); setSelStaff(""); setPayMethod("M-Pesa");
      setSelectedCustomer(null); setCustomerSearch(""); setAddingNewCustomer(false);
      setShowMpesaConfirm(false);
    }
  }

  function checkout(){
    if(!clientName) return alert("Please enter or select a client");
    if(!selStaff) return alert("Please select a stylist");
    if(cart.length===0) return alert("Cart is empty");
    if(payMethod==="M-Pesa"){ setShowMpesaConfirm(true); } else { completeSale(); }
  }

  async function saveFeedback(f){
    const saved = await db("POST","feedback",f);
    setFeedbacks(p=>[saved?.[0]||{...f,id:Date.now()},...p]);
  }

  async function adjustStock(id,delta,reason="ADJUSTMENT"){
    if(!isAdmin && delta>0){ alert("Only admin can add stock."); return; }
    const prod=products.find(p=>p.id===id);
    if(!prod) return;
    const ns=Math.max(0,prod.stock+delta);
    setProducts(p=>p.map(pr=>pr.id===id?{...pr,stock:ns}:pr));
    try {
      await db("PATCH","stock",{stock:ns},`?id=eq.${id}`);
      // Log stock movement
      await db("POST","stock_log",{
        product_id:id,
        product_name:prod.name,
        action_type:delta>0?"IN":"OUT",
        quantity:Math.abs(delta),
        balance_after:ns,
        reason,
        user_role:userRole,
        date:todayStr(),
        time:nowTime()
      });
    } catch(e){ console.error("Stock update failed:",e); }
  }

  const todaySales=sales.filter(s=>s.date===todayStr());
  const todayRevenue=todaySales.reduce((s,x)=>s+x.total,0);
  const todayCommission=todaySales.reduce((s,x)=>s+x.commission,0);
  const lowStock=products.filter(p=>p.stock<=5);
  const staffStats=staffList.map(st=>{ const mySales=sales.filter(s=>s.stylist===st.name); return{...st,salesCount:mySales.length,revenue:mySales.reduce((s,x)=>s+x.total,0),commission:mySales.reduce((s,x)=>s+x.commission,0)}; });
  const avgRating=feedbacks.length?(feedbacks.reduce((s,f)=>s+f.rating,0)/feedbacks.length).toFixed(1):"—";
  const pendingCount=appointments.filter(a=>a.status==="pending").length;
  const frequentCustomers=customers.filter(c=>c.visit_count>=4);

  function getCustomerStatus(c){
    if(!c.last_visit) return {label:"New",color:"#6366F1",bg:"#EEF2FF",days:0};
    const days=Math.floor((new Date()-new Date(c.last_visit))/(1000*60*60*24));
    if(days<=14)  return {label:"Active",  color:GREEN,    bg:"#D1FAE5", days};
    if(days<=27)  return {label:"Warm",    color:"#D97706", bg:"#FEF3C7", days};
    if(days<=44)  return {label:"Due",     color:"#EA580C", bg:"#FFEDD5", days};
    return             {label:"At Risk",  color:RED,      bg:"#FEE2E2", days};
  }

  const atRiskCustomers=customers.filter(c=>{ if(!c.last_visit) return false; const days=Math.floor((new Date()-new Date(c.last_visit))/(1000*60*60*24)); return days>=28; });
  const dueCustomers=customers.filter(c=>{ if(!c.last_visit) return false; const days=Math.floor((new Date()-new Date(c.last_visit))/(1000*60*60*24)); return days>=28&&days<=44; });
  const vipCustomers=customers.filter(c=>c.visit_count>=8||(c.total_spend&&c.total_spend>=20000));

  const ALL_NAV=[
    {id:"pos",          label:"POS",       icon:"🛒",  adminOnly:false},
    {id:"appointments", label:"Bookings",  icon:"📅",  adminOnly:false, badge:pendingCount},
    {id:"customers",    label:"Clients",   icon:"👤",  adminOnly:true},
    {id:"dashboard",    label:"Overview",  icon:"📊",  adminOnly:true},
    {id:"staff",        label:"Staff",     icon:"👥",  adminOnly:true},
    {id:"services",     label:"Services",  icon:"✂",   adminOnly:true},
    {id:"inventory",    label:"Stock",     icon:"📦",  adminOnly:true},
  ];
  const NAV = isAdmin ? ALL_NAV : ALL_NAV.filter(n=>!n.adminOnly);

  const inputStyle={borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",background:WHITE};

  // Online/offline state
  const [isOnline,setIsOnline]=useState(navigator.onLine);
  const [syncPending,setSyncPending]=useState(false);
  const [loadError,setLoadError]=useState(false);

  useEffect(()=>{
    const goOnline=()=>{ setIsOnline(true); setSyncPending(offlineQueue.length>0); syncOfflineQueue().then(()=>setSyncPending(false)); };
    const goOffline=()=>setIsOnline(false);
    window.addEventListener("online",goOnline);
    window.addEventListener("offline",goOffline);
    return()=>{ window.removeEventListener("online",goOnline); window.removeEventListener("offline",goOffline); };
  },[]);

  if(loading) return(
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${BLACK} 0%,#1A1400 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <KimmsLogo size="lg" dark={false}/>
      <div style={{color:GOLD_LT,fontSize:13,letterSpacing:"0.1em",textTransform:"uppercase",marginTop:16}}>
        {loadError?"Unable to load — check your connection":"Loading your salon data..."}
      </div>
      {loadError&&<button onClick={()=>window.location.reload()} style={{background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`,color:BLACK,border:"none",borderRadius:10,padding:"10px 24px",fontWeight:800,fontSize:13,cursor:"pointer",marginTop:8}}>Retry</button>}
    </div>
  );

  return(
    <div style={{fontFamily:"'Inter','Segoe UI',sans-serif",background:BG,minHeight:"100vh",display:"flex",flexDirection:"column",transition:"background 0.3s"}}>
      {receipt&&<Receipt sale={receipt} onClose={()=>{ setReceipt(null); }}/>}
      {showFeedback&&!receipt&&<FeedbackModal onSubmit={f=>{saveFeedback(f);setShowFeedback(false);}} onClose={()=>setShowFeedback(false)}/>}

      {showMpesaConfirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1500,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:WHITE,borderRadius:"20px 20px 0 0",padding:"24px 20px 32px",width:"100%",maxWidth:480,maxHeight:"85vh",overflowY:"auto",borderTop:`3px solid ${GOLD}`}}>
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:16,fontWeight:900,color:DARK}}>Confirm M-Pesa Payment</div>
              <div style={{fontSize:12,color:"#888",marginTop:2}}>Show this to the customer</div>
            </div>
            <MpesaInstructions amount={cartTotal} reference={clientName}/>
            <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={completeSale} style={{width:"100%",background:MPESA_GREEN,color:WHITE,border:"none",borderRadius:12,padding:"14px 0",fontWeight:900,fontSize:15,cursor:"pointer"}}>
                ✅ Payment Received — Complete Sale ({fmt(cartTotal)})
              </button>
              <button onClick={()=>setShowMpesaConfirm(false)} style={{width:"100%",background:WHITE,color:"#888",border:`1.5px solid ${GOLD_DIM}`,borderRadius:12,padding:"12px 0",fontWeight:700,fontSize:13,cursor:"pointer"}}>← Go Back</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS */}
      {toast&&(
        <div style={{
          position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",
          zIndex:9999,borderRadius:12,padding:"12px 20px",
          background:toast.type==="success"?GREEN:toast.type==="error"?RED:GOLD,
          color:WHITE,fontWeight:800,fontSize:13,
          boxShadow:"0 4px 20px rgba(0,0,0,0.3)",
          animation:"slideDown 0.3s ease",
          display:"flex",alignItems:"center",gap:8,
          maxWidth:"90vw",textAlign:"center"
        }}>
          <span>{toast.type==="success"?"✅":toast.type==="error"?"❌":"ℹ️"}</span>
          {toast.msg}
        </div>
      )}

      {/* OFFLINE BANNER */}
      {!isOnline&&(
        <div style={{background:RED,color:WHITE,textAlign:"center",padding:"6px 16px",fontSize:12,fontWeight:700,flexShrink:0}}>
          📵 Offline — Sales will sync when connected
        </div>
      )}
      {syncPending&&isOnline&&(
        <div style={{background:GREEN,color:WHITE,textAlign:"center",padding:"6px 16px",fontSize:12,fontWeight:700,flexShrink:0}}>
          🔄 Syncing offline data...
        </div>
      )}

      {/* TOP BAR */}
      <div style={{background:`linear-gradient(135deg,${BLACK} 0%,#1A1400 60%,#2C1F00 100%)`,borderBottom:`2px solid ${GOLD}`,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,boxShadow:`0 2px 16px rgba(201,168,76,0.18)`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <KimmsLogo size="sm" dark={false}/>
          <div style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:800,
            background:isAdmin?`linear-gradient(135deg,${GOLD},${GOLD_LT})`:"rgba(255,255,255,0.1)",
            color:isAdmin?BLACK:"rgba(255,255,255,0.6)",letterSpacing:"0.05em"}}>
            {isAdmin?"👑 ADMIN":"✂ STAFF"}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <a href="/booking" target="_blank" rel="noreferrer"
            style={{background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`,color:BLACK,border:"none",borderRadius:20,padding:"7px 10px",fontSize:11,fontWeight:900,cursor:"pointer",textDecoration:"none",flexShrink:0}}>
            🔗
          </a>
          <button onClick={()=>setDarkMode(d=>!d)} style={{background:"rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.7)",border:`1px solid ${GOLD_DIM}`,borderRadius:"50%",width:32,height:32,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {darkMode?"☀️":"🌙"}
          </button>
          <button onClick={onLogout} style={{background:"rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.6)",border:`1px solid ${GOLD_DIM}`,borderRadius:20,padding:"7px 10px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>Out</button>
        </div>
      </div>

      {/* NAV */}
      <div style={{background:darkMode?"#0A0A00":BLACK,borderBottom:`1px solid ${GOLD_DIM}`,display:"flex",flexShrink:0}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>setPage(n.id)} style={{flex:1,border:"none",background:"none",padding:"8px 0",cursor:"pointer",borderBottom:`3px solid ${page===n.id?GOLD:"transparent"}`,color:page===n.id?GOLD_LT:"rgba(255,255,255,0.35)",transition:"all 0.15s",position:"relative"}}>
            <div style={{fontSize:15}}>{n.icon}</div>
            <div style={{fontSize:8,fontWeight:700,marginTop:1,letterSpacing:"0.05em",textTransform:"uppercase"}}>{n.label}</div>
            {n.badge>0&&<div style={{position:"absolute",top:4,right:"10%",background:RED,color:WHITE,borderRadius:"50%",width:14,height:14,fontSize:8,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>{n.badge}</div>}
          </button>
        ))}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:16,background:BG,transition:"background 0.3s"}}>

        {/* ── POS PAGE ── */}
        {page==="pos"&&(
          <div>
            {/* Customer Search */}
            <div style={{marginBottom:12,position:"relative"}}>
              <div style={{fontSize:11,fontWeight:800,color:GOLD_DIM,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Client</div>
              {selectedCustomer ? (
                <div style={{background:WHITE,borderRadius:10,padding:"10px 14px",border:`1.5px solid ${GOLD}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:13,color:DARK}}>{selectedCustomer.name}</div>
                    <div style={{fontSize:11,color:"#888"}}>{selectedCustomer.phone} · {selectedCustomer.visit_count} visit{selectedCustomer.visit_count!==1?"s":""} · Spent {fmt(selectedCustomer.total_spend)}</div>
                  </div>
                  <button onClick={clearCustomer} style={{background:"none",border:"none",color:RED,fontSize:18,cursor:"pointer",padding:0}}>×</button>
                </div>
              ) : (
                <div>
                  <input
                    placeholder="Search by name or phone..."
                    value={customerSearch}
                    onChange={e=>searchCustomers(e.target.value)}
                    onFocus={()=>customerSearch.length>=2&&setShowCustomerDrop(true)}
                    style={{...inputStyle,width:"100%",boxSizing:"border-box"}}
                  />
                  {showCustomerDrop&&(
                    <div style={{position:"absolute",top:"100%",left:0,right:0,background:WHITE,borderRadius:10,boxShadow:"0 4px 20px rgba(0,0,0,0.15)",zIndex:100,border:`1px solid ${GOLD_DIM}44`,maxHeight:200,overflowY:"auto"}}>
                      {customerResults.length===0?(
                        <div style={{padding:"12px 14px"}}>
                          <div style={{fontSize:12,color:"#888",marginBottom:8}}>No customer found</div>
                          <button onClick={()=>{setShowCustomerDrop(false);setAddingNewCustomer(true);setClientName(customerSearch);}} style={{width:"100%",background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`,color:BLACK,border:"none",borderRadius:8,padding:"8px 0",fontWeight:800,fontSize:12,cursor:"pointer"}}>
                            + Add "{customerSearch}" as new client
                          </button>
                        </div>
                      ):(
                        customerResults.map(c=>(
                          <div key={c.id} onClick={()=>selectCustomer(c)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${GOLD_DIM}22`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <div>
                              <div style={{fontWeight:700,fontSize:13,color:DARK}}>{c.name}</div>
                              <div style={{fontSize:11,color:"#888"}}>{c.phone} · {c.visit_count} visits</div>
                            </div>
                            {c.visit_count>=4&&<span style={{fontSize:10,background:"#FEF3C7",color:"#92400E",padding:"2px 7px",borderRadius:20,fontWeight:700}}>⭐ Regular</span>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {addingNewCustomer&&(
                    <div style={{background:WHITE,borderRadius:10,padding:"12px 14px",border:`1.5px solid ${GOLD}`,marginTop:8}}>
                      <div style={{fontSize:12,fontWeight:800,color:GOLD_DIM,marginBottom:8}}>NEW CLIENT</div>
                      <input placeholder="Full name" value={clientName} onChange={e=>setClientName(e.target.value)}
                        style={{...inputStyle,width:"100%",boxSizing:"border-box",marginBottom:8}}/>
                      <input placeholder="Phone (e.g. 0712345678)" value={clientPhone} onChange={e=>setClientPhone(e.target.value)}
                        style={{...inputStyle,width:"100%",boxSizing:"border-box",marginBottom:8}}/>
                      <div style={{display:"flex",gap:8}}>
                        <GoldBtn onClick={saveNewCustomer} style={{flex:1,padding:"9px 0",fontSize:12}}>Save Client</GoldBtn>
                        <button onClick={()=>{setAddingNewCustomer(false);setClientName("");setClientPhone("");}} style={{flex:1,background:"none",border:`1px solid ${GOLD_DIM}`,borderRadius:8,padding:"9px 0",fontSize:12,color:GOLD_DIM,cursor:"pointer",fontWeight:700}}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {!addingNewCustomer&&!showCustomerDrop&&(
                    <button onClick={()=>setAddingNewCustomer(true)} style={{marginTop:6,background:"none",border:"none",color:GOLD_DIM,fontSize:12,cursor:"pointer",fontWeight:700}}>+ Add new client</button>
                  )}
                </div>
              )}
            </div>

            {/* Stylist selector */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:800,color:GOLD_DIM,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Stylist</div>
              <select value={selStaff} onChange={e=>setSelStaff(e.target.value)} style={{...inputStyle,width:"100%",color:selStaff?DARK:"#aaa"}}>
                <option value="">Select stylist</option>
                {staffList.map(s=><option key={s.id} value={s.name}>{s.name} · {s.role}</option>)}
              </select>
            </div>

            {/* Type toggle */}
            <div style={{display:"flex",background:BLACK,borderRadius:10,padding:3,marginBottom:12,border:`1px solid ${GOLD_DIM}`}}>
              {["services","products"].map(t=>(
                <button key={t} onClick={()=>{setCatFilter("All");setTypeFilter(t);}} style={{flex:1,border:"none",borderRadius:8,padding:"8px 0",fontSize:13,fontWeight:700,background:typeFilter===t?`linear-gradient(135deg,${GOLD},${GOLD_LT})`:"transparent",color:typeFilter===t?BLACK:"rgba(255,255,255,0.4)",cursor:"pointer",transition:"all 0.2s"}}>
                  {t==="services"?"💇 Services":"🧴 Products"}
                </button>
              ))}
            </div>

            {/* Category filter */}
            <div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:4}}>
              {(typeFilter==="services"?CATS:["All","Hair","Nails","Beauty"]).map(c=>(
                <button key={c} onClick={()=>setCatFilter(c)} style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${catFilter===c?GOLD:GOLD_DIM+"66"}`,background:catFilter===c?`linear-gradient(135deg,${GOLD},${GOLD_LT})`:WHITE,color:catFilter===c?BLACK:GOLD_DIM,fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>{c}</button>
              ))}
            </div>

            {/* Items grid */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              {(typeFilter==="services"?servicesList.filter(s=>catFilter==="All"||s.cat===catFilter):products.filter(p=>catFilter==="All"||p.cat===catFilter)).map(item=>(
                <div key={item.id} onClick={()=>addToCart(item,typeFilter==="services"?"service":"product")}
                  style={{background:WHITE,borderRadius:12,padding:"12px 10px",cursor:"pointer",border:`1.5px solid ${GOLD_DIM}44`,boxShadow:`0 1px 6px rgba(201,168,76,0.06)`}}>
                  <div style={{fontSize:12,fontWeight:700,color:DARK,marginBottom:4,lineHeight:1.3}}>{item.name}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:900,color:GOLD_DIM}}>{fmt(item.price)}</span>
                    {typeFilter==="products"&&<span style={{fontSize:10,color:item.stock<=5?RED:GREEN,fontWeight:700}}>{item.stock} left</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Cart */}
            {cart.length>0&&(
              <div style={{background:WHITE,borderRadius:14,padding:16,boxShadow:`0 2px 16px rgba(201,168,76,0.12)`,border:`1px solid ${GOLD_DIM}55`}}>
                <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:10}}>🛒 Cart</div>
                {cart.map(item=>(
                  <div key={item.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:DARK}}>{item.name}</div>
                      <div style={{fontSize:11,color:"#888"}}>Qty: {item.qty} · {fmt(item.price)} each</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:13,fontWeight:800,color:GOLD_DIM}}>{fmt(item.price*item.qty)}</span>
                      <button onClick={()=>removeFromCart(item.id)} style={{background:"none",border:"none",color:RED,fontSize:16,cursor:"pointer",padding:0}}>×</button>
                    </div>
                  </div>
                ))}
                <div style={{borderTop:`1px dashed ${GOLD_DIM}66`,marginTop:10,paddingTop:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontWeight:900,fontSize:16,color:DARK,marginBottom:4}}>
                    <span>Total</span><span style={{color:GOLD_DIM}}>{fmt(cartTotal)}</span>
                  </div>
                  <div style={{fontSize:11,color:"#888",marginBottom:12}}>Staff commission: {fmt(commission)} (40%)</div>
                  <div style={{display:"flex",gap:6,marginBottom:12}}>
                    {["M-Pesa","Cash"].map(m=>(
                      <button key={m} onClick={()=>setPayMethod(m)} style={{flex:1,border:`2px solid ${payMethod===m?GOLD:GOLD_DIM+"66"}`,borderRadius:8,padding:"8px 0",background:payMethod===m?`linear-gradient(135deg,${BLACK},#2C1F00)`:WHITE,color:payMethod===m?GOLD_LT:DARK,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                        {m==="M-Pesa"?"📱 M-Pesa":"💵 Cash"}
                      </button>
                    ))}
                  </div>
                  {payMethod==="M-Pesa"&&<div style={{marginBottom:12}}><MpesaInstructions amount={cartTotal} reference={clientName} compact={true}/></div>}
                  <GoldBtn onClick={checkout} style={{width:"100%"}}>
                    {payMethod==="M-Pesa"?`📱 Collect M-Pesa · ${fmt(cartTotal)}`:`✓ Complete Sale · ${fmt(cartTotal)}`}
                  </GoldBtn>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── APPOINTMENTS PAGE ── */}
        {page==="appointments"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:900,fontSize:18,color:DARK}}>Customer Bookings</div>
              <button onClick={loadAppointments} style={{background:CREAM,color:GOLD_DIM,border:`1px solid ${GOLD_DIM}`,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>↻ Refresh</button>
            </div>
            {loadingAppts&&(
              <div style={{textAlign:"center",padding:"40px 0",color:"#aaa"}}>
                <div style={{fontSize:24,marginBottom:8}}>⏳</div>
                <div style={{fontSize:13}}>Loading bookings...</div>
              </div>
            )}
            {!loadingAppts&&appointments.length===0&&(
              <div style={{textAlign:"center",padding:"40px 20px",color:"#aaa"}}>
                <div style={{fontSize:36,marginBottom:8}}>📅</div>
                <div style={{fontSize:14,marginBottom:16}}>No bookings yet. Share your booking link!</div>
                <a href="/booking" target="_blank" rel="noreferrer"
                  style={{display:"inline-block",background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`,color:BLACK,borderRadius:20,padding:"10px 20px",fontSize:13,fontWeight:900,textDecoration:"none"}}>
                  View Booking Page →
                </a>
              </div>
            )}
            {!loadingAppts&&appointments.map(a=>(
              <div key={a.id} style={{background:WHITE,borderRadius:14,padding:16,marginBottom:10,border:`1.5px solid ${a.status==="pending"?GOLD_DIM+"88":a.status==="done"?"#BBF7D0":"#FEE2E2"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:DARK}}>{a.name}</div>
                    <div style={{fontSize:12,color:"#888"}}>📞 {a.phone}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                    <div style={{padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:800,
                      background:a.status==="pending"?"#FEF3C7":a.status==="done"?"#D1FAE5":"#FEE2E2",
                      color:a.status==="pending"?"#92400E":a.status==="done"?"#065F46":"#991B1B"}}>
                      {a.status==="pending"?"⏳ Pending":a.status==="done"?"✅ Done":"❌ Cancelled"}
                    </div>
                    <div style={{padding:"3px 8px",borderRadius:20,fontSize:10,fontWeight:800,
                      background:a.payment_status==="paid_upfront"?"#D1FAE5":"#FEF3C7",
                      color:a.payment_status==="paid_upfront"?"#065F46":"#92400E"}}>
                      {a.payment_status==="paid_upfront"?"💚 Paid via M-Pesa":"🕐 Pay at Salon"}
                    </div>
                  </div>
                </div>
                <div style={{fontSize:13,color:DARK,marginBottom:4}}>💇 <b>{a.service}</b> {a.price?`· KES ${Number(a.price).toLocaleString()}`:""}</div>
                <div style={{fontSize:12,color:"#888",marginBottom:4}}>👩‍💼 {a.stylist}</div>
                <div style={{fontSize:12,color:"#888",marginBottom:10}}>📅 {a.date} at {a.time}</div>
                {a.status==="pending"&&a.payment_status!=="paid_upfront"&&(
                  <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,padding:"8px 10px",marginBottom:10,fontSize:12,color:"#92400E"}}>
                    💳 Collect M-Pesa on arrival · Till <b>5927571</b> {a.price?`· KES ${Number(a.price).toLocaleString()}`:""}
                  </div>
                )}
                {a.status==="pending"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <button onClick={()=>convertToSale(a)} style={{width:"100%",background:`linear-gradient(135deg,${GOLD},${GOLD_LT})`,color:BLACK,border:"none",borderRadius:8,padding:"10px 0",fontWeight:900,fontSize:13,cursor:"pointer"}}>
                      🛒 Client Arrived — Convert to Sale
                    </button>
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={()=>markDone(a.id)} style={{flex:1,background:"#D1FAE5",color:"#065F46",border:"none",borderRadius:8,padding:"8px 0",fontWeight:800,fontSize:12,cursor:"pointer"}}>✅ Mark Done</button>
                      <button onClick={()=>markCancelled(a.id)} style={{flex:1,background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:8,padding:"8px 0",fontWeight:800,fontSize:12,cursor:"pointer"}}>❌ Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── CUSTOMERS PAGE ── */}
        {page==="customers"&&(
          <div>
            <div style={{fontWeight:900,fontSize:18,color:DARK,marginBottom:4}}>Clients</div>
            <div style={{fontSize:12,color:"#888",marginBottom:16}}>{customers.length} total · {frequentCustomers.length} regulars · {atRiskCustomers.length} not seen in 28+ days</div>

            {/* At-risk clients with WhatsApp button */}
            {atRiskCustomers.length>0&&(
              <div style={{background:"#FFF5F5",borderRadius:12,padding:14,marginBottom:14,border:"1.5px solid #FEE2E2"}}>
                <div style={{fontWeight:800,fontSize:13,color:RED,marginBottom:10}}>⚠️ Not seen in 28+ days — Send reminder</div>
                {atRiskCustomers.map(c=>(
                  <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,padding:"8px 10px",background:WHITE,borderRadius:8,border:"1px solid #FEE2E2"}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:DARK}}>{c.name}</div>
                      <div style={{fontSize:11,color:"#888"}}>{c.phone} · Last visit: {c.last_visit||"unknown"}</div>
                    </div>
                    {c.phone&&(
                      <a href={`https://wa.me/254${c.phone.replace(/^0/,"").replace(/\D/g,"")}?text=${encodeURIComponent(`Hi ${c.name}! 👋

We miss you at Kimm's Beauty Parlour! 💕

It's been a while since your last visit. We'd love to see you again.

✂️ Book your appointment:
${window.location.origin}/booking

Or call us: 0113828280

— Kimm's Beauty Parlour
"Beauty That Speaks Confidence" 👑`)}`}
                        target="_blank" rel="noreferrer"
                        style={{background:"#25D366",color:WHITE,borderRadius:20,padding:"7px 12px",fontSize:11,fontWeight:800,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>
                        📲 WhatsApp
                      </a>
                    )}
                  </div>
                ))}
                <div style={{fontSize:11,color:"#aaa",marginTop:8}}>Tap WhatsApp to send a reminder directly to each client</div>
              </div>
            )}

            {/* Frequent clients */}
            {frequentCustomers.length>0&&(
              <div style={{background:"#FFFBEB",borderRadius:12,padding:14,marginBottom:14,border:`1.5px solid ${GOLD_DIM}66`}}>
                <div style={{fontWeight:800,fontSize:13,color:GOLD_DIM,marginBottom:10}}>⭐ Regular Clients ({frequentCustomers.length})</div>
                {frequentCustomers.map(c=>(
                  <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,padding:"8px 10px",background:WHITE,borderRadius:8,border:`1px solid ${GOLD_DIM}33`}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:DARK}}>{c.name}</div>
                      <div style={{fontSize:11,color:"#888"}}>{c.visit_count} visits · {fmt(c.total_spend)} total</div>
                    </div>
                    {c.phone&&(
                      <a href={`https://wa.me/254${c.phone.replace(/^0/,"").replace(/\D/g,"")}?text=${encodeURIComponent(`Hi ${c.name}! 👑

Thank you for being a loyal client at Kimm's Beauty Parlour! 💕

As one of our valued regulars, we appreciate your continued support.

Book your next appointment:
${window.location.origin}/booking

— Kimm's Beauty Parlour`)}`}
                        target="_blank" rel="noreferrer"
                        style={{background:"#25D366",color:WHITE,borderRadius:20,padding:"7px 12px",fontSize:11,fontWeight:800,textDecoration:"none",whiteSpace:"nowrap",flexShrink:0}}>
                        📲 WhatsApp
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Send bulk reminder */}
            {atRiskCustomers.filter(c=>c.phone).length>0&&(
              <div style={{background:WHITE,borderRadius:12,padding:14,marginBottom:14,border:`1px solid ${GOLD_DIM}44`}}>
                <div style={{fontWeight:800,fontSize:13,color:DARK,marginBottom:4}}>📢 Bulk WhatsApp Reminder</div>
                <div style={{fontSize:12,color:"#888",marginBottom:10}}>Open WhatsApp and send to all {atRiskCustomers.filter(c=>c.phone).length} inactive clients one by one</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {atRiskCustomers.filter(c=>c.phone).slice(0,5).map(c=>(
                    <a key={c.id}
                      href={`https://wa.me/254${c.phone.replace(/^0/,"").replace(/\D/g,"")}?text=${encodeURIComponent(`Hi ${c.name}! We miss you at Kimm's Beauty Parlour 💕 Book your next appointment: ${window.location.origin}/booking`)}`}
                      target="_blank" rel="noreferrer"
                      style={{background:"#F0FFF4",color:"#166534",borderRadius:8,padding:"8px 12px",fontSize:12,fontWeight:700,textDecoration:"none",border:"1px solid #BBF7D0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>{c.name} · {c.phone}</span>
                      <span>📲 Send →</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* All clients */}
            <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:10}}>All Clients</div>
            {customers.length===0&&(
              <div style={{textAlign:"center",padding:"40px 20px",color:"#aaa"}}>
                <div style={{fontSize:36,marginBottom:8}}>👤</div>
                <div style={{fontSize:14}}>No clients yet. They appear here after their first sale or booking.</div>
              </div>
            )}
            {customers.map(c=>(
              <div key={c.id} style={{background:WHITE,borderRadius:12,padding:"12px 14px",marginBottom:8,border:`1px solid ${GOLD_DIM}33`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:DARK,display:"flex",alignItems:"center",gap:6}}>
                      {c.name}
                      {c.visit_count>=4&&<span style={{fontSize:9,background:"#FEF3C7",color:"#92400E",padding:"2px 6px",borderRadius:20,fontWeight:700}}>⭐ Regular</span>}
                    </div>
                    <div style={{fontSize:11,color:"#888",marginTop:2}}>{c.phone} · Last visit: {c.last_visit||"—"}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:13,fontWeight:800,color:GOLD_DIM}}>{fmt(c.total_spend)}</div>
                      <div style={{fontSize:10,color:"#aaa"}}>{c.visit_count} visit{c.visit_count!==1?"s":""}</div>
                    </div>
                    {c.phone&&(
                      <a href={`https://wa.me/254${c.phone.replace(/^0/,"").replace(/\D/g,"")}?text=${encodeURIComponent(`Hi ${c.name}! 💕 We look forward to seeing you at Kimm's Beauty Parlour. Book here: ${window.location.origin}/booking`)}`}
                        target="_blank" rel="noreferrer"
                        style={{background:"#25D366",color:WHITE,borderRadius:"50%",width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,textDecoration:"none",flexShrink:0}}>
                        📲
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {page==="dashboard"&&(()=>{
          const last7=Array.from({length:7},(_,i)=>{
            const d=new Date(); d.setDate(d.getDate()-i);
            const str=d.toLocaleDateString("en-KE");
            const daySales=sales.filter(s=>s.date===str);
            return{day:d.toLocaleDateString("en-KE",{weekday:"short"}),date:str,revenue:daySales.reduce((a,x)=>a+x.total,0),count:daySales.length};
          }).reverse();
          const weekRevenue=last7.reduce((a,d)=>a+d.revenue,0);
          const maxDayRev=Math.max(...last7.map(d=>d.revenue),1);
          const svcCount={};
          sales.forEach(s=>{ if(Array.isArray(s.items)) s.items.filter(i=>i.type==="service").forEach(i=>{ svcCount[i.name]=(svcCount[i.name]||0)+1; }); });
          const topServices=Object.entries(svcCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
          const maxSvc=topServices.length>0?topServices[0][1]:1;
          const hourCount={};
          sales.forEach(s=>{ if(s.time){ const h=parseInt(s.time.split(":")[0]); hourCount[h]=(hourCount[h]||0)+1; } });
          const peakHours=Object.entries(hourCount).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([h,c])=>({label:`${h}:00`,count:c}));
          const maxHour=peakHours.length>0?peakHours[0].count:1;
          const mpesa=sales.filter(s=>s.payment==="M-Pesa").reduce((a,x)=>a+x.total,0);
          const cash=sales.filter(s=>s.payment==="Cash").reduce((a,x)=>a+x.total,0);
          const allPay=mpesa+cash||1;
          return(
          <div>
            <div style={{background:`linear-gradient(135deg,${BLACK},#2C1F00)`,borderRadius:14,padding:"16px",marginBottom:16,border:`1px solid ${GOLD_DIM}`,textAlign:"center"}}>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Today's Revenue</div>
              <div style={{fontSize:36,fontWeight:900,color:GOLD_LT}}>{fmt(todayRevenue)}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:2}}>{todaySales.length} transactions</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[
                {label:"Today Commission",value:fmt(todayCommission),icon:"👩‍💼",color:GOLD},
                {label:"This Week",value:fmt(weekRevenue),icon:"📈",color:GREEN},
                {label:"Avg. Rating",value:avgRating+"★",icon:"⭐",color:AMBER},
                {label:"Total Clients",value:customers.length,icon:"👤",color:"#1E40AF"},
              ].map((s,i)=>(
                <div key={i} style={{background:WHITE,borderRadius:12,padding:"14px",borderLeft:`4px solid ${s.color}`,boxShadow:`0 1px 8px rgba(201,168,76,0.06)`}}>
                  <div style={{fontSize:20}}>{s.icon}</div>
                  <div style={{fontSize:10,color:"#888",fontWeight:700,marginTop:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>{s.label}</div>
                  <div style={{fontSize:18,fontWeight:900,color:DARK,marginTop:2}}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={{background:WHITE,borderRadius:14,padding:16,marginBottom:14,border:`1px solid ${GOLD_DIM}33`}}>
              <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:4}}>Revenue — Last 7 Days</div>
              <div style={{fontSize:11,color:"#888",marginBottom:14}}>Total: {fmt(weekRevenue)}</div>
              {sales.length===0?(
                <div style={{textAlign:"center",padding:"20px 0",color:"#aaa",fontSize:13}}>Complete sales to see your chart</div>
              ):(
                <div style={{display:"flex",alignItems:"flex-end",gap:6,height:100}}>
                  {last7.map((d,i)=>(
                    <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{fontSize:9,color:GOLD_DIM,fontWeight:700}}>{d.revenue>0?`${Math.round(d.revenue/1000)}k`:""}</div>
                      <div style={{width:"100%",borderRadius:"4px 4px 0 0",background:d.date===todayStr()?`linear-gradient(180deg,${GOLD_LT},${GOLD})`:`linear-gradient(180deg,${GOLD_DIM}88,${GOLD_DIM}44)`,height:`${Math.max(4,(d.revenue/maxDayRev)*80)}px`}}/>
                      <div style={{fontSize:9,color:"#888",fontWeight:600}}>{d.day}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{background:WHITE,borderRadius:14,padding:16,marginBottom:14,border:`1px solid ${GOLD_DIM}33`}}>
              <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:12}}>Top Services</div>
              {topServices.length===0?(<div style={{textAlign:"center",padding:"16px 0",color:"#aaa",fontSize:13}}>No services recorded yet</div>):(
                topServices.map(([name,count],i)=>(
                  <div key={i} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:600,color:DARK}}>{name}</span>
                      <span style={{fontSize:12,fontWeight:800,color:GOLD_DIM}}>{count}x</span>
                    </div>
                    <div style={{background:"#F5F0E8",borderRadius:20,height:6,overflow:"hidden"}}>
                      <div style={{width:`${(count/maxSvc)*100}%`,height:"100%",borderRadius:20,background:`linear-gradient(90deg,${GOLD},${GOLD_LT})`}}/>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{background:WHITE,borderRadius:14,padding:16,marginBottom:14,border:`1px solid ${GOLD_DIM}33`}}>
              <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:12}}>Peak Hours</div>
              {peakHours.length===0?(<div style={{textAlign:"center",padding:"16px 0",color:"#aaa",fontSize:13}}>No data yet</div>):(
                <div style={{display:"flex",gap:8}}>
                  {peakHours.map((h,i)=>(
                    <div key={i} style={{flex:1,background:i===0?`linear-gradient(135deg,${BLACK},#2C1F00)`:CREAM,borderRadius:10,padding:"10px 8px",textAlign:"center",border:`1px solid ${GOLD_DIM}44`}}>
                      <div style={{fontSize:16,fontWeight:900,color:i===0?GOLD_LT:GOLD_DIM}}>{h.label}</div>
                      <div style={{fontSize:10,color:i===0?"rgba(255,255,255,0.6)":"#888",marginTop:2}}>{h.count} sale{h.count!==1?"s":""}</div>
                      {i===0&&<div style={{fontSize:9,color:GOLD,marginTop:2,fontWeight:700}}>PEAK</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{background:WHITE,borderRadius:14,padding:16,marginBottom:14,border:`1px solid ${GOLD_DIM}33`}}>
              <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:12}}>Payment Methods</div>
              {[{label:"M-Pesa",value:mpesa,pct:Math.round(mpesa/allPay*100),color:GREEN},{label:"Cash",value:cash,pct:Math.round(cash/allPay*100),color:GOLD_DIM}].map((p,i)=>(
                <div key={i} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:DARK}}>{p.label}</span>
                    <span style={{fontSize:12,fontWeight:800,color:DARK}}>{fmt(p.value)} ({p.pct}%)</span>
                  </div>
                  <div style={{background:"#F5F0E8",borderRadius:20,height:8,overflow:"hidden"}}>
                    <div style={{width:`${p.pct}%`,height:"100%",borderRadius:20,background:p.color}}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:WHITE,borderRadius:14,padding:16,marginBottom:14,border:`1px solid ${GOLD_DIM}33`}}>
              <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:12}}>Staff Leaderboard</div>
              {[...staffStats].sort((a,b)=>b.revenue-a.revenue).map((s,i)=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${GOLD_DIM}22`}}>
                  <div style={{width:24,height:24,borderRadius:"50%",background:i===0?`linear-gradient(135deg,${GOLD},${GOLD_LT})`:CREAM,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,color:i===0?BLACK:GOLD_DIM,border:`1px solid ${GOLD_DIM}44`,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:DARK}}>{s.name}</div>
                    <div style={{fontSize:11,color:"#888"}}>{s.salesCount} services · Commission: {fmt(s.commission)}</div>
                  </div>
                  <div style={{fontWeight:900,color:GOLD_DIM,fontSize:13}}>{fmt(s.revenue)}</div>
                </div>
              ))}
            </div>
            {lowStock.length>0&&(
              <div style={{background:"#FFF5F5",borderRadius:12,padding:14,border:"1.5px solid #FEE2E2"}}>
                <div style={{fontWeight:800,fontSize:13,color:RED,marginBottom:8}}>Low Stock Alert</div>
                {lowStock.map(p=>(<div key={p.id} style={{fontSize:12,color:DARK,marginBottom:4}}>{p.name} — only <b>{p.stock}</b> left</div>))}
              </div>
            )}
          </div>
          );
        })()}
        {/* ── STAFF ── */}
        {page==="staff"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:900,fontSize:18,color:DARK}}>Staff & Commissions</div>
              <GoldBtn onClick={()=>{setShowAddStaff(true);setNewStaff({name:"",role:"Stylist",commission_pct:40});}} style={{padding:"8px 16px",fontSize:12}}>+ Add Staff</GoldBtn>
            </div>

            {/* Add staff form */}
            {showAddStaff&&(
              <div style={{background:WHITE,borderRadius:14,padding:16,marginBottom:16,border:`1.5px solid ${GOLD}`,boxShadow:`0 2px 16px rgba(201,168,76,0.15)`}}>
                <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:12}}>New Staff Member</div>
                <input placeholder="Full name" value={newStaff.name} onChange={e=>setNewStaff(p=>({...p,name:e.target.value}))}
                  style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
                <select value={newStaff.role} onChange={e=>setNewStaff(p=>({...p,role:e.target.value}))}
                  style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:8}}>
                  <option>Stylist</option>
                  <option>Barber</option>
                  <option>Nail Technician</option>
                  <option>Makeup Artist</option>
                  <option>Receptionist</option>
                </select>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                  <span style={{fontSize:12,color:"#888",whiteSpace:"nowrap"}}>Commission %:</span>
                  <input type="number" value={newStaff.commission_pct} onChange={e=>setNewStaff(p=>({...p,commission_pct:parseInt(e.target.value)||0}))}
                    style={{flex:1,borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <GoldBtn onClick={async()=>{
                    if(!newStaff.name) return alert("Please enter staff name");
                    const saved = await db("POST","staff",{...newStaff,active:true});
                    const ns = saved?.[0]||{...newStaff,id:Date.now()};
                    setStaffList(p=>[...p,ns]);
                    setShowAddStaff(false);
                    setNewStaff({name:"",role:"Stylist",commission_pct:40});
                  }} style={{flex:1,padding:"10px 0",fontSize:13}}>Save Staff</GoldBtn>
                  <button onClick={()=>setShowAddStaff(false)} style={{flex:1,background:"none",border:`1px solid ${GOLD_DIM}`,borderRadius:10,padding:"10px 0",fontSize:13,color:GOLD_DIM,cursor:"pointer",fontWeight:700}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Staff list */}
            {staffStats.map((s,idx)=>(
              <div key={s.id} style={{background:WHITE,borderRadius:14,padding:16,marginBottom:12,border:`1px solid ${GOLD_DIM}44`}}>
                {editingStaff?.id===s.id?(
                  <div>
                    <input value={editingStaff.name} onChange={e=>setEditingStaff(p=>({...p,name:e.target.value}))}
                      style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
                    <select value={editingStaff.role} onChange={e=>setEditingStaff(p=>({...p,role:e.target.value}))}
                      style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:8}}>
                      <option>Stylist</option><option>Barber</option><option>Nail Technician</option><option>Makeup Artist</option><option>Receptionist</option>
                    </select>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                      <span style={{fontSize:12,color:"#888"}}>Commission %:</span>
                      <input type="number" value={editingStaff.commission_pct} onChange={e=>setEditingStaff(p=>({...p,commission_pct:parseInt(e.target.value)||0}))}
                        style={{flex:1,borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                    </div>
                    <div style={{display:"flex",gap:8}}>
                      <GoldBtn onClick={async()=>{
                        await db("PATCH","staff",{name:editingStaff.name,role:editingStaff.role,commission_pct:editingStaff.commission_pct},`?id=eq.${editingStaff.id}`);
                        setStaffList(p=>p.map(x=>x.id===editingStaff.id?{...x,...editingStaff}:x));
                        setEditingStaff(null);
                      }} style={{flex:1,padding:"9px 0",fontSize:12}}>Save</GoldBtn>
                      <button onClick={()=>setEditingStaff(null)} style={{flex:1,background:"none",border:`1px solid ${GOLD_DIM}`,borderRadius:10,padding:"9px 0",fontSize:12,color:GOLD_DIM,cursor:"pointer",fontWeight:700}}>Cancel</button>
                    </div>
                  </div>
                ):(
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                      <div style={{width:44,height:44,borderRadius:"50%",background:`linear-gradient(135deg,${BLACK},#2C1F00)`,border:`2px solid ${GOLD}`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:GOLD_LT,fontSize:18,flexShrink:0}}>{s.name[0]}</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:800,fontSize:15,color:DARK}}>{s.name}</div>
                        <div style={{fontSize:12,color:"#888"}}>{s.role} · {s.commission_pct||40}% commission</div>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>setEditingStaff({...s})} style={{background:CREAM,border:`1px solid ${GOLD_DIM}`,borderRadius:8,padding:"6px 10px",fontSize:11,color:GOLD_DIM,cursor:"pointer",fontWeight:700}}>✏️ Edit</button>
                        <button onClick={async()=>{
                          if(!window.confirm(`Deactivate ${s.name}?`)) return;
                          await db("PATCH","staff",{active:false},`?id=eq.${s.id}`);
                          setStaffList(p=>p.filter(x=>x.id!==s.id));
                        }} style={{background:"#FEE2E2",border:"none",borderRadius:8,padding:"6px 10px",fontSize:11,color:RED,cursor:"pointer",fontWeight:700}}>Remove</button>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                      {[{label:"Services",value:s.salesCount},{label:"Revenue",value:fmt(s.revenue)},{label:"Commission",value:fmt(s.commission)}].map((m,i)=>(
                        <div key={i} style={{background:CREAM,borderRadius:8,padding:"8px 10px",textAlign:"center",border:`1px solid ${GOLD_DIM}33`}}>
                          <div style={{fontSize:10,color:"#888",fontWeight:700,textTransform:"uppercase"}}>{m.label}</div>
                          <div style={{fontSize:13,fontWeight:900,color:GOLD_DIM,marginTop:2}}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* ── SERVICES ── */}
        {page==="services"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontWeight:900,fontSize:18,color:DARK}}>Services</div>
              <GoldBtn onClick={()=>{setShowAddService(true);setNewService({name:"",cat:"Hair",price:""});}} style={{padding:"8px 16px",fontSize:12}}>+ Add Service</GoldBtn>
            </div>

            {/* Add service form */}
            {showAddService&&(
              <div style={{background:WHITE,borderRadius:14,padding:16,marginBottom:16,border:`1.5px solid ${GOLD}`,boxShadow:`0 2px 16px rgba(201,168,76,0.15)`}}>
                <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:12}}>New Service</div>
                <input placeholder="Service name" value={newService.name} onChange={e=>setNewService(p=>({...p,name:e.target.value}))}
                  style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
                <select value={newService.cat} onChange={e=>setNewService(p=>({...p,cat:e.target.value}))}
                  style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:8}}>
                  <option>Hair</option><option>Nails</option><option>Beauty</option><option>Spa</option><option>Barber</option>
                </select>
                <input placeholder="Price (KES)" type="number" value={newService.price} onChange={e=>setNewService(p=>({...p,price:e.target.value}))}
                  style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:12}}/>
                <div style={{display:"flex",gap:8}}>
                  <GoldBtn onClick={async()=>{
                    if(!newService.name||!newService.price) return alert("Please enter service name and price");
                    const saved = await db("POST","services",{...newService,price:parseInt(newService.price),active:true});
                    const ns = saved?.[0]||{...newService,price:parseInt(newService.price),id:Date.now()};
                    setServicesList(p=>[...p,ns]);
                    setShowAddService(false);
                    setNewService({name:"",cat:"Hair",price:""});
                  }} style={{flex:1,padding:"10px 0",fontSize:13}}>Save Service</GoldBtn>
                  <button onClick={()=>setShowAddService(false)} style={{flex:1,background:"none",border:`1px solid ${GOLD_DIM}`,borderRadius:10,padding:"10px 0",fontSize:13,color:GOLD_DIM,cursor:"pointer",fontWeight:700}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Services grouped by category */}
            {CATS.filter(c=>c!=="All").map(cat=>{
              const catServices = servicesList.filter(s=>s.cat===cat);
              if(catServices.length===0) return null;
              return(
                <div key={cat} style={{marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:800,color:GOLD_DIM,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>{cat}</div>
                  {catServices.map(s=>(
                    <div key={s.id} style={{background:WHITE,borderRadius:12,padding:"12px 14px",marginBottom:6,border:`1px solid ${GOLD_DIM}33`}}>
                      {editingService?.id===s.id?(
                        <div>
                          <input value={editingService.name} onChange={e=>setEditingService(p=>({...p,name:e.target.value}))}
                            style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD}`,padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
                          <div style={{display:"flex",gap:8,marginBottom:8}}>
                            <select value={editingService.cat} onChange={e=>setEditingService(p=>({...p,cat:e.target.value}))}
                              style={{flex:1,borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none"}}>
                              <option>Hair</option><option>Nails</option><option>Beauty</option><option>Spa</option><option>Barber</option>
                            </select>
                            <input type="number" value={editingService.price} onChange={e=>setEditingService(p=>({...p,price:parseInt(e.target.value)||0}))}
                              style={{flex:1,borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                          </div>
                          <div style={{display:"flex",gap:8}}>
                            <GoldBtn onClick={async()=>{
                              await db("PATCH","services",{name:editingService.name,cat:editingService.cat,price:editingService.price},`?id=eq.${editingService.id}`);
                              setServicesList(p=>p.map(x=>x.id===editingService.id?{...x,...editingService}:x));
                              setEditingService(null);
                            }} style={{flex:1,padding:"8px 0",fontSize:12}}>Save</GoldBtn>
                            <button onClick={()=>setEditingService(null)} style={{flex:1,background:"none",border:`1px solid ${GOLD_DIM}`,borderRadius:10,padding:"8px 0",fontSize:12,color:GOLD_DIM,cursor:"pointer",fontWeight:700}}>Cancel</button>
                          </div>
                        </div>
                      ):(
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:700,color:DARK}}>{s.name}</div>
                            <div style={{fontSize:12,fontWeight:900,color:GOLD_DIM,marginTop:2}}>{fmt(s.price)}</div>
                          </div>
                          <div style={{display:"flex",gap:6}}>
                            <button onClick={()=>setEditingService({...s})} style={{background:CREAM,border:`1px solid ${GOLD_DIM}`,borderRadius:8,padding:"6px 10px",fontSize:11,color:GOLD_DIM,cursor:"pointer",fontWeight:700}}>✏️ Edit</button>
                            <button onClick={async()=>{
                              if(!window.confirm(`Remove ${s.name}?`)) return;
                              await db("PATCH","services",{active:false},`?id=eq.${s.id}`);
                              setServicesList(p=>p.filter(x=>x.id!==s.id));
                            }} style={{background:"#FEE2E2",border:"none",borderRadius:8,padding:"6px 10px",fontSize:11,color:RED,cursor:"pointer",fontWeight:700}}>Remove</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {/* ── INVENTORY ── */}
        {page==="inventory"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontWeight:900,fontSize:18,color:DARK}}>Product Stock</div>
              <GoldBtn onClick={()=>setShowAddProduct(p=>!p)} style={{padding:"8px 16px",fontSize:12}}>+ Add Product</GoldBtn>
            </div>
            <div style={{fontSize:12,color:"#888",marginBottom:14}}>Tap + or − to adjust stock after purchases or deliveries</div>

            {/* Add product form */}
            {showAddProduct&&(
              <div style={{background:WHITE,borderRadius:14,padding:16,marginBottom:16,border:`1.5px solid ${GOLD}`,boxShadow:`0 2px 16px rgba(201,168,76,0.15)`}}>
                <div style={{fontWeight:800,fontSize:14,color:DARK,marginBottom:12}}>New Product</div>
                <input placeholder="Product name" value={newProduct.name} onChange={e=>setNewProduct(p=>({...p,name:e.target.value}))}
                  style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:8}}/>
                <select value={newProduct.cat} onChange={e=>setNewProduct(p=>({...p,cat:e.target.value}))}
                  style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:8}}>
                  <option>Hair</option><option>Nails</option><option>Beauty</option><option>Spa</option>
                </select>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  <input placeholder="Price (KES)" type="number" value={newProduct.price} onChange={e=>setNewProduct(p=>({...p,price:e.target.value}))}
                    style={{flex:1,borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                  <input placeholder="Stock qty" type="number" value={newProduct.stock} onChange={e=>setNewProduct(p=>({...p,stock:e.target.value}))}
                    style={{flex:1,borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,fontFamily:"inherit",outline:"none"}}/>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <GoldBtn onClick={async()=>{
                    if(!newProduct.name||!newProduct.price) return alert("Please enter product name and price");
                    const id="PRD"+Date.now();
                    const prod={id,name:newProduct.name,cat:newProduct.cat,price:parseInt(newProduct.price),stock:parseInt(newProduct.stock)||0};
                    const saved = await db("POST","stock",prod);
                    setProducts(p=>[...p,saved?.[0]||prod]);
                    setShowAddProduct(false);
                    setNewProduct({name:"",cat:"Hair",price:"",stock:""});
                  }} style={{flex:1,padding:"10px 0",fontSize:13}}>Save Product</GoldBtn>
                  <button onClick={()=>setShowAddProduct(false)} style={{flex:1,background:"none",border:`1px solid ${GOLD_DIM}`,borderRadius:10,padding:"10px 0",fontSize:13,color:GOLD_DIM,cursor:"pointer",fontWeight:700}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Products list */}
            {products.map(p=>(
              <div key={p.id} style={{background:WHITE,borderRadius:12,padding:"12px 14px",marginBottom:8,border:`1.5px solid ${p.stock<=5?"#FEE2E2":GOLD_DIM+"44"}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:DARK}}>{p.name}</div>
                    <div style={{fontSize:11,color:"#888"}}>{p.cat} · <span style={{color:GOLD_DIM,fontWeight:700}}>{fmt(p.price)}</span></div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={()=>adjustStock(p.id,-1)} style={{width:30,height:30,borderRadius:"50%",border:`1.5px solid ${RED}`,background:WHITE,color:RED,fontSize:18,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <div style={{textAlign:"center",minWidth:36}}>
                      <div style={{fontSize:18,fontWeight:900,color:p.stock<=5?RED:p.stock<=10?AMBER:GREEN}}>{p.stock}</div>
                      <div style={{fontSize:9,color:"#aaa",textTransform:"uppercase"}}>units</div>
                    </div>
                    <button onClick={()=>adjustStock(p.id,1)} style={{width:30,height:30,borderRadius:"50%",border:`1.5px solid ${GREEN}`,background:WHITE,color:GREEN,fontSize:18,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                  </div>
                </div>
                {p.stock<=5&&(
                  <div style={{marginTop:8,background:"#FFF5F5",borderRadius:6,padding:"5px 8px",fontSize:11,color:RED,fontWeight:700}}>⚠️ Low stock — consider reordering</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StaffRoute(){
  const [loggedIn,setLoggedIn]=useState(false);
  const [userRole,setUserRole]=useState("staff");
  if(!loggedIn) return <LoginPage onLogin={(role)=>{setUserRole(role);setLoggedIn(true);}}/>;
  return <POSApp onLogout={()=>{setLoggedIn(false);setUserRole("staff");}} userRole={userRole}/>;
}

export default function App(){
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/booking" element={<BookingPage/>}/>
        <Route path="/*" element={<StaffRoute/>}/>
      </Routes>
    </BrowserRouter>
  );
}
