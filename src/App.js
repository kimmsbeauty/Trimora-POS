import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// ── IMPORT MODULAR COMPONENTS ───────────────────────────────────────────────
import Sidebar, { KimmsLogo } from "./components/Sidebar";
import ProductGrid from "./components/ProductGrid";
import CheckoutCart, { GoldBtn } from "./components/CheckoutCart";
import HistoryLogs from "./components/HistoryLogs";

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
const STAFF_PIN  = "1234";   
const ADMIN_PIN  = "9999";   

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
  { id:"SRV016", cat:"Beauty", name:"Facial",                  price:2500 },
  { id:"SRV017", cat:"Beauty", name:"Makeup",                  price:3000 },
  { id:"SRV018", cat:"Beauty", name:"Eyebrow shaping",         price:500  },
  { id:"SRV019", cat:"Beauty", name:"Eyelash extensions",     price:2500 },
  { id:"SRV020", cat:"Spa",    name:"Body massage",           price:3000 },
  { id:"SRV021", cat:"Barber", name:"Haircut (men)",           price:500  },
  { id:"SRV022", cat:"Barber", name:"Beard grooming",          price:300  },
];

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

// ── LOGIN PAGE ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }){
  const [pin,setPin]=useState("");
  const [role,setRole]=useState("staff"); 
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
        <div style={{display:"flex",background:"rgba(255,255,255,0.06)",borderRadius:10,padding:3,marginBottom:20,border:`1px solid ${GOLD_DIM}`}}>
          {["staff","admin"].map(r=>(
            <button key={r} onClick={()=>{setRole(r);setPin("");setError(false);}} style={{flex:1,border:"none",borderRadius:8,padding:"9px 0",fontSize:13,fontWeight:700,background:role===r?`linear-gradient(135deg,${GOLD},${GOLD_LT})`:"transparent",color:role===r?BLACK:"rgba(255,255,255,0.4)",cursor:"pointer",transition:"all 0.2s",textTransform:"capitalize"}}>{r==="admin"?"👑 Admin":"✂ Staff"}</button>
          ))}
        </div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginBottom:12,letterSpacing:"0.1em",textTransform:"uppercase"}}>{role==="admin"?"Owner PIN":"Staff PIN"}</div>
        <input type="password" placeholder="Enter PIN" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} maxLength={6} style={{width:"100%",borderRadius:10,border:`1.5px solid ${error?RED:GOLD_DIM}`,background:"rgba(255,255,255,0.06)",padding:"13px 14px",fontSize:24,textAlign:"center",letterSpacing:"0.4em",boxSizing:"border-box",fontFamily:"inherit",outline:"none",color:WHITE,marginBottom:8}}/>
        {error&&<div style={{color:RED,fontSize:12,marginBottom:8}}>Incorrect PIN. Try again.</div>}
        <GoldBtn onClick={handleLogin} style={{width:"100%",marginTop:8}}>Login →</GoldBtn>
        <div style={{marginTop:24,borderTop:`1px solid rgba(201,168,76,0.2)`,paddingTop:16}}>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:8}}>Are you a customer?</div>
          <a href="/booking" style={{fontSize:13,color|:GOLD_LT,fontWeight:700,textDecoration:"none"}}>Book an appointment →</a>
        </div>
      </div>
    </div>
  );
}

// ── RECEIPT POPUP ────────────────────────────────────────────────────────────
function Receipt({ sale, onClose }){
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div className="receipt-print" style={{background:WHITE,borderRadius:16,padding:28,width:340,maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{textAlign:"center",marginBottom:16}}>
          <KimmsLogo size="sm" dark={true} />
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
        <div style={{display:"flex",gap:8}} className="no-print">
          <button onClick={()=>window.print()} style={{flex:1,background:CREAM,border:`1.5px solid ${GOLD_DIM}`,borderRadius:10,padding:"11px 0",fontWeight:700,fontSize:13,cursor:"pointer",color:GOLD_DIM}}>🖨️ Print</button>
          <GoldBtn onClick={onClose} style={{flex:2}}>Close</GoldBtn>
        </div>
        <style>{`@media print { body * { visibility: hidden; } .receipt-print, .receipt-print * { visibility: visible; } .receipt-print { position: fixed; top: 0; left: 0; width: 100%; } .no-print { display: none !important; } }`}</style>
      </div>
    </div>
  );
}

// ── FEEDBACK POPUP ───────────────────────────────────────────────────────────
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
        <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Tell us about your experience..." style={{width:"100%",borderRadius:10,border:`1.5px solid ${GOLD_DIM}`,padding:"10px 12px",fontSize:13,resize:"none",height:72,boxSizing:"border-box",fontFamily:"inherit",outline:"none"}}/>
        <GoldBtn onClick={()=>{ if(rating===0)return alert("Please select a star rating"); onSubmit({rating,stylist,note,date:today(),time:nowTime()}); }} style={{width:"100%",marginTop:14}}>Submit Feedback 👑</GoldBtn>
        <button onClick={onClose} style={{width:"100%",background:"none",border:"none",color:"#aaa",fontSize:12,cursor:"pointer",marginTop:8}}>Skip</button>
      </div>
    </div>
  );
}

// ── MPESA PAYMENT INSTRUCTIONS MODULE ────────────────────────────────────────
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

// ── CLIENT BOOKING MODAL INTERFACE ───────────────────────────────────────────
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

// ── CUSTOMER SELF SERVICE APP ROUTE ──────────────────────────────────────────
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
    const result = await db("POST","bookings",{name:sel.name,phone:sel.phone,service:sel.service?.name,price:sel.service?.price,stylist:sel.stylist||"Any available",date:sel.date,time:sel.time,status:"pending",payment_status:"pending"});
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
    const waMessage = encodeURIComponent(`✂ Kimm's Beauty Parlour\n\nHi ${sel.name}! Your booking is confirmed 💕\n\nService: ${sel.service?.name}\nStylist: ${sel.stylist||"Any available"}\nDate: ${sel.date}\nTime: ${sel.time}\nPrice: KES ${sel.service?.price?.toLocaleString()}\nPayment: ${paymentStatusBlock === "paid" ? "✅ Paid via M-Pesa" : "Pay at salon"}\n\nWe look forward to seeing you!\nFor enquiries: 0113828280`);
    const paymentStatusBlock = paymentStatus;
    return (
      <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${BLACK} 0%,#1A1400 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{background:"rgba(255,255,255,0.05)",border:`1.5px solid ${GOLD_DIM}`,borderRadius:20,padding:36,maxWidth:380,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>{paymentStatus==="paid"?"💚":"👑"}</div>
          <div style={{fontSize:22,fontWeight:900,color:GOLD_LT,fontFamily:"Georgia,serif",fontStyle:"italic",marginBottom:8}}>{paymentStatus==="paid"?"Booked & Paid!":"You're booked!"}</div>
          <div style={{display:"inline-block",padding:"6px 16px",borderRadius:20,fontSize:12,fontWeight:800,marginBottom:16,background:paymentStatus==="paid"?"#D1FAE5":`rgba(201,168,76,0.15)`,color:paymentStatus==="paid"?"#065F46":GOLD_LT}}>
            {paymentStatus==="paid"?"✅ Paid via M-Pesa" : "Base Pay at Salon"}
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
          <a href={`https://wa.me/254113828280?text=${waMessage}`} target="_blank" rel="noreferrer" style={{display:"block",background:"#25D366",color:WHITE,borderRadius:12,padding:"13px 0",fontWeight:800,fontSize:15,textDecoration:"none",marginBottom:10}}>📲 Confirm via WhatsApp</a>
          <button onClick={()=>{setSel({service:null,stylist:null,date:"",time:"",name:"",phone:""});setStep(1);setDone(false);setPaymentStatus(null);setSavedBooking(null);}} style={{background:"transparent",border:`1px solid ${GOLD_DIM}`,borderRadius:10,padding:"10px 24px",fontWeight:700,fontSize:13,cursor:"pointer",color:"rgba(255,255,255,0.5)"}}>Book another</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:`linear-gradient(160deg,${BLACK} 0%,#1A1400 100%)`,paddingBottom:40}}>
      <div style={{background:`linear-gradient(135deg,${BLACK},#2C1F00)`,borderBottom:`2px solid ${GOLD}`,padding:"22px 20px 18px",textAlign:"center"}}>
        <KimmsLogo size="md" dark={false}/><div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:8,letterSpacing:"0.1em",textTransform:"uppercase"}}>Book your appointment</div>
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
                  <div key={s.id} onClick={()=>{setSel(p=>({...p,service:s}));setStep(2);}} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"12px 14px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:`1.5px solid ${sel.service?.id===s.id?GOLD:"rgba(255,255,255,0.1)"}`}}>
                    <span style={{fontSize:14,fontWeight:600,color:WHITE}}>{s.name}</span>
                    <span style={{fontSize:13,fontWeight:800,color:GOLD_LT}}>{fmt(s.price)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {step===2&&(
          <div>
            <div style={{fontWeight:800,fontSize:16,color:WHITE,marginBottom:14}}>Choose your stylist</div>
            {[...bookingStaff,{id:"any",name:"Any available",role:"We'll assign the best match"}].map(s=>(
              <div key={s.id} onClick={()=>{setSel(p=>({...p,stylist:s.name}));setStep(3);}} style={{background:"rgba(255,255,255,0.05)",borderRadius:10,padding:"14px",marginBottom:6,cursor:"pointer",border:`1.5px solid ${sel.stylist===s.name?GOLD:"rgba(255,255,255,0.1)"}`}}>
                <div style={{fontSize:14,fontWeight:700,color:WHITE}}>{s.name}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:2}}>{s.role}</div>
              </div>
            ))}
            <button onClick={()=>setStep(1)} style={{background:"none",border:"none",color:GOLD_LT,fontSize:13,cursor:"pointer",marginTop:12}}>← Back to services</button>
          </div>
        )}
        {step===3&&(
          <div>
            <div style={{fontWeight:800,fontSize:16,color:WHITE,marginBottom:14}}>Select Date & Time</div>
            <input type="date" value={sel.date} onChange={e=>setSel(p=>({...p,date:e.target.value}))} style={{width:"100%",borderRadius:10,border:`1px solid ${GOLD}`,background:"rgba(255,255,255,0.05)",padding:12,color:WHITE,fontSize:14,fontFamily:"inherit",boxSizing:"border-box",marginBottom:14,outline:"none"}}/>
            <div style={{gridTemplateColumns:"repeat(3, 1fr)",gap:8,display:sel.date?"grid":"none"}}>
              {["08:00 AM","09:30 AM","11:00 AM","12:30 PM","02:00 PM","03:30 PM","05:00 PM","06:30 PM"].map(t=>(
                <button key={t} onClick={()=>{setSel(p=>({...p,time:t}));setStep(4);}} style={{padding:"12px 0",borderRadius:8,border:`1.5px solid ${sel.time===t?GOLD:"rgba(255,255,255,0.1)"}`,background:sel.time===t?GOLD:"rgba(255,255,255,0.02)",color:sel.time===t?BLACK:WHITE,fontWeight:700,fontSize:12,cursor:"pointer"}}>{t}</button>
              ))}
            </div>
            <button onClick={()=>setStep(2)} style={{background:"none",border:"none",color:GOLD_LT,fontSize:13,cursor:"pointer",marginTop:12}}>← Back to stylists</button>
          </div>
        )}
        {step===4&&(
          <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:20}}>
            <div style={{fontWeight:800,fontSize:16,color:WHITE,marginBottom:14}}>Your Details</div>
            <input type="text" placeholder="Your Full Name" value={sel.name} onChange={e=>setSel(p=>({...p,name:e.target.value}))} style={{width:"100%",borderRadius:10,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.05)",padding:12,color:WHITE,fontSize:14,boxSizing:"border-box",marginBottom:12,outline:"none"}}/>
            <input type="text" placeholder="M-Pesa Phone Number" value={sel.phone} onChange={e=>setSel(p=>({...p,phone:e.target.value}))} style={{width:"100%",borderRadius:10,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.05)",padding:12,color:WHITE,fontSize:14,boxSizing:"border-box",marginBottom:16,outline:"none"}}/>
            <div style={{background:"rgba(201,168,76,0.08)",border:`1px solid ${GOLD_DIM}`,borderRadius:12,padding:14,marginBottom:16,fontSize:13,color:"rgba(255,255,255,0.8)",lineHeight:1.6}}>
              👑 <b>Booking Summary:</b><br/>{sel.service?.name} ({fmt(sel.service?.price)})<br/>with {sel.stylist} on {sel.date} at {sel.time}
            </div>
            <GoldBtn onClick={confirm} disabled={saving} style={{width:"100%"}}>{saving?"Processing Appointment...":"Confirm & Pay Upfront 💳"}</GoldBtn>
            <button onClick={()=>setStep(3)} style={{width:"100%",background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:13,cursor:"pointer",marginTop:12}}>← Back to schedule</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── BACKOFFICE ENTERPRISE ERP POS INTERFACE ──────────────────────────────────
function POSApp({ role, onLogout }){
  const [view,setView]=useState("pos");
  const [services,setServices]=useState(DEFAULT_SERVICES);
  const [staff,setStaff]=useState(DEFAULT_STAFF);
  const [cart,setCart]=useState([]);
  const [selectedCat,setSelectedCat]=useState("All");
  const [clientName,setClientName]=useState("");
  const [clientPhone,setClientPhone]=useState("");
  const [selectedStylist,setSelectedStylist]=useState("");
  const [paymentMethod,setPaymentMethod]=useState("M-Pesa");
  const [sales,setSales]=useState([]);
  const [bookings,setBookings]=useState([]);
  const [customers,setCustomers]=useState([]);
  const [feedback,setFeedback]=useState([]);
  const [activeReceipt,setActiveReceipt]=useState(null);
  const [showFeedback,setShowFeedback]=useState(false);
  const [processing,setProcessing]=useState(false);

  // Dynamic state configs for CRUD views
  const [newSrv,setNewSrv]=useState({cat:"Hair",name:"",price:""});
  const [newStf,setNewStf]=useState({name:"",role:"",commission_pct:40});

  useEffect(()=>{
    async function loadData(){
      const [sv,st,sl,bk,cs,fb] = await Promise.all([
        db("GET","services",null,"?order=cat.asc,name.asc"),
        db("GET","staff",null,"?order=created_at.asc"),
        db("GET","sales",null,"?order=created_at.desc&limit=100"),
        db("GET","bookings",null,"?order=date.asc,time.asc"),
        db("GET","customers",null,"?order=visit_count.desc"),
        db("GET","feedback",null,"?order=created_at.desc"),
      ]);
      if(sv&&sv.length>0) setServices(sv);
      if(st&&st.length>0) setStaff(st);
      if(sl) setSales(sl);
      if(bk) setBookings(bk);
      if(cs) setCustomers(cs);
      if(fb) setFeedback(fb);
    }
    loadData();
  },[]);

  function addToCart(srv){ setCart(p=>[...p, srv]); }
  function removeOneFromCart(id){
    setCart(p => {
      const idx = p.findIndex(item => item.id === id);
      if (idx === -1) return p;
      const updated = [...p];
      updated.splice(idx, 1);
      return updated;
    });
  }

  const cartTotal = cart.reduce((sum,i)=>sum+i.price,0);

  async function handleCheckout(){
    if(cart.length===0 || !selectedStylist) return;
    setProcessing(true);
    const orderData = {
      date: todayStr(), time: nowTime(),
      client: clientName.trim() || "Walk-in Client",
      phone: clientPhone.trim() || "N/A",
      stylist: selectedStylist, payment: paymentMethod,
      total: cartTotal, items: cart.map(i=>({id:i.id,name:i.name,price:i.price}))
    };
    const res = await db("POST","sales",orderData);
    if(clientPhone.trim()){
      const cleanPhone = clientPhone.trim();
      const exist = await db("GET","customers",null,`?phone=eq.${cleanPhone}&limit=1`);
      if(exist && exist.length>0){
        const c = exist[0];
        await db("PATCH","customers",{visit_count: Number(c.visit_count)+1, total_spend: Number(c.total_spend)+cartTotal, last_visit: todayStr()},`?id=eq.${c.id}`);
      } else {
        await db("POST","customers",{name: clientName.trim()||"Walk-in Client", phone:cleanPhone, visit_count:1, total_spend:cartTotal, last_visit:todayStr()});
      }
    }
    const freshSales = await db("GET","sales",null,"?order=created_at.desc&limit=100");
    if(freshSales) setSales(freshSales);
    const freshCust = await db("GET","customers",null,"?order=visit_count.desc");
    if(freshCust) setCustomers(freshCust);
    setActiveReceipt(res?.[0] || orderData);
    setCart([]); setClientName(""); setClientPhone(""); setSelectedStylist(""); setProcessing(false);
  }

  async function handleDeleteSale(id){
    await db("DELETE","sales",null,`?id=eq.${id}`);
    setSales(p=>p.filter(s=>s.id!==id));
  }

  async function submitFeedback(fbData){
    await db("POST","feedback",fbData);
    const freshFb = await db("GET","feedback",null,"?order=created_at.desc");
    if(freshFb) setFeedback(freshFb);
    setShowFeedback(false); alert("Thank you! Feedback loaded successfully.");
  }

  async function handleAddService(){
    if(!newSrv.name || !newSrv.price) return;
    const res = await db("POST","services",{cat:newSrv.cat,name:newSrv.name,price:Number(newSrv.price),active:true});
    if(res) setServices(p=>[...p, res[0]]);
    setNewSrv({cat:"Hair",name:"",price:""});
  }
  async function toggleServiceActive(id, current){
    await db("PATCH","services",{active:!current},`?id=eq.${id}`);
    setServices(p=>p.map(s=>s.id===id?{...s,active:!current}:s));
  }

  async function handleAddStaff(){
    if(!newStf.name || !newStf.role) return;
    const res = await db("POST","staff",{name:newStf.name,role:newStf.role,commission_pct:Number(newStf.commission_pct),active:true});
    if(res) setStaff(p=>[...p, res[0]]);
    setNewStf({name:"",role:"",commission_pct:40});
  }
  async function toggleStaffActive(id, current){
    await db("PATCH","staff",{active:!current},`?id=eq.${id}`);
    setStaff(p=>p.map(s=>s.id===id?{...s,active:!current}:s));
  }

  async function updateBookingStatus(id, field, value){
    await db("PATCH","bookings",{[field]:value},`?id=eq.${id}`);
    setBookings(p=>p.map(b=>b.id===id?{...b,[field]:value}:b));
  }

  // Derived Analytics Computations
  const totalRev = sales.reduce((sum,s)=>sum+Number(s.total),0);
  const mpesaRev = sales.filter(s=>s.payment==="M-Pesa").reduce((sum,s)=>sum+Number(s.total),0);
  const cashRev = sales.filter(s=>s.payment==="Cash").reduce((sum,s)=>sum+Number(s.total),0);
  const staffComms = sales.reduce((acc,s)=>{
    if(!acc[s.stylist]) acc[s.stylist]=0;
    acc[s.stylist] += Number(s.total) * 0.4;
    return acc;
  },{});

  return (
    <div style={{ minHeight: "100vh", background: CREAM, paddingLeft: 260, boxSizing: "border-box" }}>
      {/* Structural Sidebar Navigation */}
      <Sidebar view={view} setView={setView} role={role} onLogout={onLogout} onOpenFeedback={() => setShowFeedback(true)} />

      {/* Main Content Pane View Switcher Router */}
      <div style={{ padding: 28, maxWidth: 1200, margin: "0 auto" }}>
        
        {/* VIEW: POS DESK */}
        {view === "pos" && (
          <div style={{ display: "flex", height: "calc(100vh - 56px)", alignItems: "stretch" }}>
            <ProductGrid services={services.filter(s=>s.active)} selectedCat={selectedCat} setSelectedCat={setSelectedCat} categories={CATS} onAddService={addToCart} cart={cart} />
            <CheckoutCart cart={cart} onRemoveItem={removeOneFromCart} clientName={clientName} setClientName={setClientName} clientPhone={clientPhone} setClientPhone={setClientPhone} selectedStylist={selectedStylist} setSelectedStylist={setSelectedStylist} staff={staff.filter(s=>s.active)} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} total={cartTotal} onCheckout={handleCheckout} processing={processing} />
          </div>
        )}

        {/* VIEW: BOOKINGS MANAGEMENT */}
        {view === "bookings" && (
          <div style={{ background: WHITE, borderRadius: 16, border: "1px solid #EAE5D9", padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 900, color: DARK }}>Live Scheduled Appointments Calendar</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #F5F0E8", color: "#8A6F2E" }}>
                    <th style={{ padding: 10 }}>Client</th>
                    <th style={{ padding: 10 }}>Service Requested</th>
                    <th style={{ padding: 10 }}>Stylist Assigned</th>
                    <th style={{ padding: 10 }}>Date / Time Slot</th>
                    <th style={{ padding: 10 }}>Pay Status</th>
                    <th style={{ padding: 10 }}>Workflow Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#aaa" }}>No bookings registered.</td></tr>
                  ) : (
                    bookings.map(b => (
                      <tr key={b.id} style={{ borderBottom: "1px solid #F5F0E8" }}>
                        <td style={{ padding: 10 }}><b>{b.name}</b><br/><span style={{ fontSize: 11, color: "#888" }}>{b.phone}</span></td>
                        <td style={{ padding: 10 }}>{b.service}<br/><b style={{ color: GOLD }}>{fmt(b.price)}</b></td>
                        <td style={{ padding: 10, fontWeight: 600 }}>{b.stylist}</td>
                        <td style={{ padding: 10 }}><div>📅 {b.date}</div><div style={{ fontSize: 11, color: AMBER, fontWeight: 700, marginTop: 2 }}>⏰ {b.time}</div></td>
                        <td style={{ padding: 10 }}>
                          <select value={b.payment_status} onChange={e => updateBookingStatus(b.id, "payment_status", e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, fontSize: 12, border: `1px solid ${GOLD}` }}>
                            <option value="pending">⏳ Pending</option>
                            <option value="paid_upfront">💚 Paid (M-Pesa Upfront)</option>
                            <option value="pay_later"> salon Pay Later</option>
                            <option value="settled_pos">🧾 Settled At POS</option>
                          </select>
                        </td>
                        <td style={{ padding: 10 }}>
                          {b.status === "completed" ? (
                            <span style={{ color: GREEN, fontWeight: 800 }}>✅ Completed Visit</span>
                          ) : (
                            <button onClick={async () => {
                              const srvObj = services.find(s => s.name === b.service) || { id: "CUSTOM", name: b.service, price: b.price };
                              setCart([srvObj]); setClientName(b.name); setClientPhone(b.phone); setSelectedStylist(b.stylist !== "Any available" ? b.stylist : ""); setPaymentMethod(b.payment_status === "paid_upfront" ? "M-Pesa" : "M-Pesa"); setView("pos"); await updateBookingStatus(b.id, "status", "completed");
                            }} style={{ background: `linear-gradient(135deg,${BLACK},#2C1F00)`, color: GOLD_LT, border: "none", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✂ Run POS Checkout</button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW: AUDIT LOGS JOURNAL */}
        {view === "history" && <HistoryLogs sales={sales} onDeleteSale={handleDeleteSale} role={role} />}

        {/* VIEW: EXECUTIVE ANALYTICS */}
        {view === "analytics" && (
          <div>
            <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
              <div style={{ flex: 1, background: WHITE, borderRadius: 16, padding: 20, border: "1px solid #EAE5D9" }}><div style={{ fontSize: 12, color: "#888", fontWeight: 700 }}>GROSS VOLUME</div><div style={{ fontSize: 28, fontWeight: 900, color: GOLD_DIM, marginTop: 4 }}>{fmt(totalRev)}</div></div>
              <div style={{ flex: 1, background: WHITE, borderRadius: 16, padding: 20, border: "1px solid #EAE5D9" }}><div style={{ fontSize: 12, color: "#888", fontWeight: 700 }}>MPESA CHANNELS</div><div style={{ fontSize: 28, fontWeight: 900, color: GREEN, marginTop: 4 }}>{fmt(mpesaRev)}</div></div>
              <div style={{ flex: 1, background: WHITE, borderRadius: 16, padding: 20, border: "1px solid #EAE5D9" }}><div style={{ fontSize: 12, color: "#888", fontWeight: 700 }}>CASH REGISTER</div><div style={{ fontSize: 28, fontWeight: 900, color: AMBER, marginTop: 4 }}>{fmt(cashRev)}</div></div>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div style={{ flex: 1, background: WHITE, borderRadius: 16, padding: 20, border: "1px solid #EAE5D9" }}>
                <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 900 }}>Staff Commission Payout Matrix (40% Cut)</h4>
                {Object.entries(staffComms).map(([name, cut]) => (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F5F0E8", fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: DARK }}>{name}</span>
                    <span style={{ fontWeight: 900, color: GOLD_DIM }}>{fmt(cut)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW: SERVICE MANAGE CATALOGUE */}
        {view === "services" && (
          <div style={{ background: WHITE, borderRadius: 16, border: "1px solid #EAE5D9", padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 900 }}>Master Service Menu Catalog</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <select value={newSrv.cat} onChange={e => setNewSrv(p => ({ ...p, cat: e.target.value }))} style={{ padding: 10, borderRadius: 8, border: `1px solid ${GOLD}` }}>
                {CATS.filter(c => c !== "All").map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="text" placeholder="Service Variant Name" value={newSrv.name} onChange={e => setNewSrv(p => ({ ...p, name: e.target.value }))} style={{ flex: 2, padding: 10, borderRadius: 8, border: `1px solid ${GOLD}` }} />
              <input type="number" placeholder="Base Rate KES" value={newSrv.price} onChange={e => setNewSrv(p => ({ ...p, price: e.target.value }))} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${GOLD}` }} />
              <button onClick={handleAddService} style={{ background: BLACK, color: GOLD_LT, border: "none", borderRadius: 8, padding: "0 20px", fontWeight: 700, cursor: "pointer" }}>＋ Add Line Item</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {services.map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, background: GRAY, borderRadius: 10, alignItems: "center" }}>
                  <div><span style={{ fontSize: 10, background: WHITE, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>{s.cat}</span><b style={{ marginLeft: 8, fontSize: 13 }}>{s.name}</b> · <span style={{ color: GOLD_DIM, fontWeight: 800 }}>{fmt(s.price)}</span></div>
                  <button onClick={() => toggleServiceActive(s.id, s.active)} style={{ background: s.active ? GREEN : RED, color: WHITE, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{s.active ? "Live" : "Disabled"}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: STAFF COMMISSION MANAGEMENT */}
        {view === "staff" && (
          <div style={{ background: WHITE, borderRadius: 16, border: "1px solid #EAE5D9", padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 900 }}>Human Capital Stylists Directory</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <input type="text" placeholder="Employee Name" value={newStf.name} onChange={e => setNewStf(p => ({ ...p, name: e.target.value }))} style={{ flex: 2, padding: 10, borderRadius: 8, border: `1px solid ${GOLD}` }} />
              <input type="text" placeholder="Core Specialty Role" value={newStf.role} onChange={e => setNewStf(p => ({ ...p, role: e.target.value }))} style={{ flex: 2, padding: 10, borderRadius: 8, border: `1px solid ${GOLD}` }} />
              <input type="number" placeholder="Comm %" value={newStf.commission_pct} onChange={e => setNewStf(p => ({ ...p, commission_pct: e.target.value }))} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${GOLD}` }} />
              <button onClick={handleAddStaff} style={{ background: BLACK, color: GOLD_LT, border: "none", borderRadius: 8, padding: "0 20px", fontWeight: 700, cursor: "pointer" }}>＋ Onboard Staff</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {staff.map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: 12, background: GRAY, borderRadius: 10, alignItems: "center" }}>
                  <div><b>{s.name}</b> — <span style={{ color: "#666", fontSize: 12 }}>{s.role}</span> (<span style={{ fontWeight: 700 }}>{s.commission_pct}% cut</span>)</div>
                  <button onClick={() => toggleStaffActive(s.id, s.active)} style={{ background: s.active ? GREEN : RED, color: WHITE, border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{s.active ? "Active" : "On Leave"}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: CLIENT LOYALTY CRM INDEX */}
        {view === "customers" && (
          <div style={{ background: WHITE, borderRadius: 16, border: "1px solid #EAE5D9", padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 900 }}>Client Loyalty Ledger Index</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #F5F0E8", color: "#8A6F2E" }}>
                  <th style={{ padding: 10 }}>Customer</th>
                  <th style={{ padding: 10 }}>Contact Phone</th>
                  <th style={{ padding: 10 }}>Visit Counter</th>
                  <th style={{ padding: 10 }}>Lifetime Investment</th>
                  <th style={{ padding: 10 }}>Last Visit Date</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#aaa" }}>No loyal customers tracked yet.</td></tr>
                ) : (
                  customers.map(c => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #F5F0E8" }}>
                      <td style={{ padding: 10, fontWeight: 700 }}>{c.name}</td>
                      <td style={{ padding: 10 }}>{c.phone}</td>
                      <td style={{ padding: 10, fontWeight: 700, color: GOLD_DIM }}>👑 {c.visit_count} sessions</td>
                      <td style={{ padding: 10, fontWeight: 900 }}>{fmt(c.total_spend)}</td>
                      <td style={{ padding: 10, color: "#666" }}>{c.last_visit}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW: FEEDBACK REVIEW AUDITS */}
        {view === "feedback" && (
          <div style={{ background: WHITE, borderRadius: 16, border: "1px solid #EAE5D9", padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 900 }}>Customer Feedback Review Metrics</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {feedback.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 13 }}>No feedback logs received.</div>
              ) : (
                feedback.map((f, i) => (
                  <div key={f.id || i} style={{ padding: 16, background: GRAY, borderRadius: 12, border: "1px solid #EAE5D9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: GOLD_DIM }}>{"⭐".repeat(f.rating)}</span>
                        <span style={{ fontSize: 12, color: DARK, marginLeft: 8 }}>Served by: <b>{f.stylist || "Unspecified"}</b></span>
                      </div>
                      <span style={{ fontSize: 11, color: "#888" }}>{f.date} · {f.time}</span>
                    </div>
                    {f.note && <div style={{ fontSize: 13, color: "#333", fontStyle: "italic", background: WHITE, padding: 10, borderRadius: 8, marginTop: 6, border: "1px solid #EAE5D9" }}>"{f.note}"</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* POPUP: TRANSIENT RECEIPT SYSTEM */}
      {activeReceipt && <Receipt sale={activeReceipt} onClose={() => setActiveReceipt(null)} />}

      {/* POPUP: FEEDBACK CAPTURE SYSTEM */}
      {showFeedback && <FeedbackModal onSubmit={submitFeedback} onClose={() => setShowFeedback(false)} />}
    </div>
  );
}

// ── DEPLOYED ROUTER CONTAINER ────────────────────────────────────────────────
export default function App() {
  const [role, setRole] = useState(null); // null | "staff" | "admin"

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={role ? <POSApp role={role} onLogout={() => setRole(null)} /> : <LoginPage onLogin={setRole} />} />
        <Route path="/booking" element={<BookingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
