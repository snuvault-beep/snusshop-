import { useState, useRef, useEffect } from "react";

const SUPABASE_URL = "https://ceivofdaqtbskdmxcsox.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlaXZvZmRhcXRic2tkbXhjc294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNDI3NjcsImV4cCI6MjA5NTYxODc2N30.DhUo5UVxsWTVVZ2sxFbhxrF4WsHiIZKkY98dZnmTIIs";
const ADMIN_EMAIL = "maximilianjaufer@gmail.com";

const sb = {
  async signUp(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST", headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return r.json();
  },
  async signIn(email, password) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return r.json();
  },
  async signInMagic(email) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/magiclink`, {
      method: "POST", headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return r.json();
  },
  async getProducts() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/products?active=eq.true&order=name`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    return r.json();
  },
  async createOrder(token, userId, items, total) {
    const ro = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, total, status: "pending" }),
    });
    const [order] = await ro.json();
    await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(items.map(i => ({ order_id: order.id, product_id: i.id, qty: i.qty, price_at_purchase: i.price }))),
    });
    return order;
  },
  async getOrders(token, userId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?user_id=eq.${userId}&order=created_at.desc`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    return r.json();
  },
  async adminGetOrders(token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?order=created_at.desc`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    return r.json();
  },
  async adminGetOrderItems(token, orderId) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${orderId}&select=*,products(name,brand,color)`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    return r.json();
  },
};

const STRENGTH_LABEL = ["","Leicht","Medium","Strong","X-Strong","Ultra"];
const STRENGTH_COLOR = ["","#22c55e","#84cc16","#f59e0b","#ef4444","#991b1b"];
const STATUS_COLOR = { pending:"#f59e0b", paid:"#22c55e", shipped:"#0ea5e9", delivered:"#8b5cf6", cancelled:"#ef4444" };

export default function App() {
  const [page, setPage] = useState("shop"); // shop | admin
  const [modal, setModal] = useState(null);
  const [ageVerified, setAgeVerified] = useState(false);
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cart, setCart] = useState([]);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [filterStrength, setFilterStrength] = useState(0);
  const [filterFlavor, setFilterFlavor] = useState("Alle");
  const [toasts, setToasts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [dobData, setDobData] = useState({ day:"", month:"", year:"" });
  const [dobErr, setDobErr] = useState("");
  const toastRef = useRef(0);

  useEffect(() => {
    sb.getProducts().then(data => { setProducts(Array.isArray(data) ? data : []); setLoadingProducts(false); }).catch(() => setLoadingProducts(false));
  }, []);

  const toast = (msg, type="ok") => {
    const id = ++toastRef.current;
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  };

  const isAdmin = session?.user?.email === ADMIN_EMAIL;
  const flavors = ["Alle", ...new Set(products.map(p => p.flavor))];
  const filtered = products.filter(p => (filterStrength === 0 || p.strength === filterStrength) && (filterFlavor === "Alle" || p.flavor === filterFlavor));

  const handleBuy = (product) => {
    if (!ageVerified) { setPendingProduct(product); setModal("age"); return; }
    if (!session) { setPendingProduct(product); setModal("auth"); return; }
    addToCart(product);
  };

  const addToCart = (product) => {
    setCart(c => { const ex = c.find(x => x.id === product.id); if (ex) return c.map(x => x.id === product.id ? { ...x, qty: x.qty+1 } : x); return [...c, { ...product, qty: 1 }]; });
    toast(`✅ ${product.name} im Warenkorb`);
  };

  const verifyAge = () => {
    const { day, month, year } = dobData;
    if (!day || !month || !year || year.length < 4) { setDobErr("Vollständiges Datum eingeben."); return; }
    const dob = new Date(+year, +month-1, +day);
    const age = Math.floor((Date.now() - dob) / (365.25*24*3600*1000));
    if (isNaN(age) || age < 0 || age > 120) { setDobErr("Das ist kein echtes Datum."); return; }
    if (age < 18) { setDobErr("Unter 18. Tschüss. 👋"); return; }
    setAgeVerified(true); setDobErr("");
    if (!session) setModal("auth");
    else { setModal(null); if (pendingProduct) { addToCart(pendingProduct); setPendingProduct(null); } }
  };

  const handleAuthSuccess = (data) => {
    const token = data.access_token;
    const user = data.user || data;
    setSession({ token, user });
    setModal(null);
    if (pendingProduct) { addToCart(pendingProduct); setPendingProduct(null); }
    toast(`👋 Willkommen, ${user.email}`);
  };

  const handleCheckout = async () => {
    if (!session || cart.length === 0) return;
    setPlacingOrder(true);
    try {
      const total = cart.reduce((s,x) => s + x.price*x.qty, 0);
      const order = await sb.createOrder(session.token, session.user.id, cart, total);
      setCart([]); setModal(null);
      toast(`🎉 Bestellung aufgegeben!`);
    } catch(e) { toast("❌ Fehler beim Bestellen.", "err"); }
    setPlacingOrder(false);
  };

  const openOrders = async () => {
    if (!session) { setModal("auth"); return; }
    const data = await sb.getOrders(session.token, session.user.id);
    setOrders(Array.isArray(data) ? data : []);
    setModal("orders");
  };

  const cartTotal = cart.reduce((s,x) => s + x.price*x.qty, 0);
  const cartCount = cart.reduce((s,x) => s + x.qty, 0);

  if (page === "admin" && isAdmin) return <AdminDashboard session={session} onBack={() => setPage("shop")} sb={sb} products={products} />;

  return (
    <div style={{ minHeight:"100vh", background:"#08090c", color:"#d1d5db", fontFamily:"'DM Sans','Helvetica Neue',sans-serif", overflowX:"hidden" }}>
      <GlobalStyles />
      <nav style={{ position:"sticky", top:0, zIndex:100, background:"rgba(8,9,12,0.92)", backdropFilter:"blur(24px)", borderBottom:"1px solid #1a1c22", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 2rem", height:60 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:22, fontWeight:900, color:"#fff", fontFamily:"'Bebas Neue','Impact',sans-serif", letterSpacing:2 }}>SNØVAULT</span>
          <span style={{ background:"#16a34a22", color:"#4ade80", border:"1px solid #16a34a44", fontSize:9, fontWeight:800, letterSpacing:2, padding:"2px 7px", borderRadius:4 }}>PREMIUM</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {session ? <>
            {isAdmin && <button onClick={() => setPage("admin")} className="nav-btn" style={{ borderColor:"#f59e0b44", color:"#f59e0b" }}>⚡ Admin</button>}
            <button onClick={openOrders} className="nav-btn">📦 Bestellungen</button>
            <span style={{ fontSize:11, color:"#4ade80", fontFamily:"monospace", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>✓ {session.user.email}</span>
            <button onClick={() => { setSession(null); toast("Ausgeloggt."); }} className="nav-btn">Logout</button>
          </> : <button onClick={() => setModal("auth")} className="nav-btn">Login / Register</button>}
          <button onClick={() => setModal("cart")} className="cart-btn" style={{ position:"relative" }}>
            🛒 {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </button>
        </div>
      </nav>

      <div style={{ padding:"6rem 2rem 4rem", textAlign:"center", background:"radial-gradient(ellipse 100% 70% at 50% -10%, rgba(74,222,128,0.07) 0%, transparent 65%)", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(#1a1c22 1px, transparent 1px)", backgroundSize:"32px 32px", opacity:0.4 }} />
        <div style={{ position:"relative", zIndex:1 }}>
          <p style={{ fontSize:11, letterSpacing:5, color:"#4ade80", fontFamily:"monospace", marginBottom:"1.2rem" }}>ÖSTERREICHS BESTER SNUS-SHOP — ANGEBLICH</p>
          <h1 style={{ fontSize:"clamp(3rem,8vw,7rem)", fontWeight:900, lineHeight:0.95, letterSpacing:-3, color:"#fff", fontFamily:"'Bebas Neue','Impact',sans-serif" }}>
            NIKOTINPOWER<br /><span style={{ color:"#4ade80", WebkitTextStroke:"1px #4ade80", WebkitTextFillColor:"transparent" }}>FÜR ERWACHSENE</span>
          </h1>
          <div style={{ marginTop:"2.5rem", display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            {["🇦🇹 Österreich-Versand","⚡ Express 24h","🔒 18+ verifiziert","🌿 100+ Sorten"].map(t => (
              <span key={t} style={{ background:"#111318", border:"1px solid #1e2028", borderRadius:100, padding:"8px 16px", fontSize:12, color:"#6b7280" }}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding:"1.5rem 2rem 0", maxWidth:1200, margin:"0 auto" }}>
        <div style={{ display:"flex", gap:"2rem", flexWrap:"wrap", alignItems:"center" }}>
          <div>
            <p style={{ fontSize:10, color:"#4b5563", letterSpacing:2, marginBottom:6, fontFamily:"monospace" }}>STÄRKE</p>
            <div style={{ display:"flex", gap:6 }}>
              {[0,1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setFilterStrength(s)} style={{ padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer", border:`1px solid ${filterStrength===s?(STRENGTH_COLOR[s]||"#4ade80"):"#1e2028"}`, background:filterStrength===s?`${STRENGTH_COLOR[s]||"#4ade80"}22`:"transparent", color:filterStrength===s?(STRENGTH_COLOR[s]||"#4ade80"):"#4b5563", transition:"all 0.15s" }}>{s===0?"Alle":"●".repeat(s)}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize:10, color:"#4b5563", letterSpacing:2, marginBottom:6, fontFamily:"monospace" }}>GESCHMACK</p>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {flavors.map(f => (
                <button key={f} onClick={() => setFilterFlavor(f)} style={{ padding:"5px 12px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", border:`1px solid ${filterFlavor===f?"#4ade80":"#1e2028"}`, background:filterFlavor===f?"#4ade8022":"transparent", color:filterFlavor===f?"#4ade80":"#4b5563", transition:"all 0.15s" }}>{f}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:"1.25rem", padding:"2rem", maxWidth:1200, margin:"0 auto" }}>
        {loadingProducts ? Array(8).fill(0).map((_,i) => <SkeletonCard key={i} />) : filtered.map((p,i) => <ProductCard key={p.id} product={p} index={i} onBuy={handleBuy} loggedIn={!!session} />)}
      </div>

      {modal==="age" && <Modal onClose={() => { setModal(null); setPendingProduct(null); }}>
        <div style={{ textAlign:"center", marginBottom:"2rem" }}>
          <div style={{ fontSize:48, marginBottom:"0.75rem" }}>🔞</div>
          <h2 style={{ fontSize:24, fontWeight:900, color:"#fff" }}>Altersverifikation</h2>
          <p style={{ fontSize:13, color:"#4b5563", marginTop:6 }}>Nur für Personen ab 18.<br/>Dein Geburtsdatum — und lüg nicht.</p>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:"0.75rem" }}>
          {[{key:"day",ph:"TT",w:"30%",max:2},{key:"month",ph:"MM",w:"30%",max:2},{key:"year",ph:"JJJJ",w:"40%",max:4}].map(f => (
            <input key={f.key} maxLength={f.max} placeholder={f.ph} value={dobData[f.key]} onChange={e => setDobData(d => ({ ...d, [f.key]: e.target.value.replace(/\D/,"") }))} className="modal-input" style={{ width:f.w, textAlign:"center" }} />
          ))}
        </div>
        {dobErr && <p style={{ color:"#ef4444", fontSize:12, marginBottom:"0.75rem", textAlign:"center" }}>{dobErr}</p>}
        <button onClick={verifyAge} className="primary-btn" style={{ width:"100%", marginTop:"0.5rem" }}>Alter bestätigen →</button>
      </Modal>}

      {modal==="auth" && <AuthModal onClose={() => { setModal(null); setPendingProduct(null); }} onSuccess={handleAuthSuccess} toast={toast} />}

      {modal==="cart" && <Modal onClose={() => setModal(null)}>
        <h2 style={{ fontSize:20, fontWeight:900, color:"#fff", marginBottom:"1.5rem" }}>🛒 Warenkorb ({cartCount})</h2>
        {cart.length===0
          ? <div style={{ textAlign:"center", color:"#374151", padding:"2rem 0" }}><div style={{ fontSize:40 }}>📭</div><p style={{ marginTop:12, fontSize:13 }}>Leer. Wie du ohne Snus.</p></div>
          : <>
              {cart.map(item => (
                <div key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"0.8rem 0", borderBottom:"1px solid #111318" }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:`${item.color}22`, border:`1px solid ${item.color}44`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <div style={{ width:14, height:14, borderRadius:"50%", background:item.color }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#e5e7eb" }}>{item.name}</div>
                    <div style={{ fontSize:11, color:"#4b5563" }}>{item.brand} · {item.mg}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <button onClick={() => setCart(c => c.map(x => x.id===item.id?{...x,qty:Math.max(1,x.qty-1)}:x))} style={{ width:24,height:24,background:"#1a1c22",border:"none",color:"#fff",borderRadius:5,cursor:"pointer" }}>−</button>
                    <span style={{ fontSize:12,fontFamily:"monospace",minWidth:16,textAlign:"center",color:"#fff" }}>{item.qty}</span>
                    <button onClick={() => setCart(c => c.map(x => x.id===item.id?{...x,qty:x.qty+1}:x))} style={{ width:24,height:24,background:"#1a1c22",border:"none",color:"#fff",borderRadius:5,cursor:"pointer" }}>+</button>
                  </div>
                  <span style={{ fontSize:13,fontFamily:"monospace",color:"#4ade80",minWidth:52,textAlign:"right" }}>€{(item.price*item.qty).toFixed(2)}</span>
                  <button onClick={() => setCart(c => c.filter(x => x.id!==item.id))} style={{ background:"none",border:"none",color:"#374151",cursor:"pointer",fontSize:16 }}>×</button>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", margin:"1.25rem 0 1rem" }}>
                <span style={{ color:"#6b7280" }}>Gesamt</span>
                <span style={{ fontSize:22, fontWeight:900, color:"#4ade80", fontFamily:"monospace" }}>€{cartTotal.toFixed(2)}</span>
              </div>
              <button className="primary-btn" style={{ width:"100%", opacity:placingOrder?0.6:1 }} onClick={session?handleCheckout:()=>setModal("auth")} disabled={placingOrder}>
                {placingOrder?"Wird verarbeitet...":session?"Jetzt bestellen →":"Login zum Bestellen →"}
              </button>
            </>
        }
      </Modal>}

      {modal==="orders" && <Modal onClose={() => setModal(null)}>
        <h2 style={{ fontSize:20, fontWeight:900, color:"#fff", marginBottom:"1.5rem" }}>📦 Meine Bestellungen</h2>
        {orders.length===0
          ? <div style={{ textAlign:"center", color:"#374151", padding:"2rem 0" }}><div style={{ fontSize:40 }}>🕸️</div><p style={{ marginTop:12, fontSize:13 }}>Noch nichts bestellt.</p></div>
          : orders.map(o => (
              <div key={o.id} style={{ background:"#111318", border:"1px solid #1e2028", borderRadius:10, padding:"1rem", marginBottom:"0.75rem" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontSize:11, fontFamily:"monospace", color:"#6b7280" }}>#{o.id.slice(0,8).toUpperCase()}</span>
                  <span style={{ fontSize:10, fontWeight:800, letterSpacing:1, padding:"3px 8px", borderRadius:4, background:`${STATUS_COLOR[o.status]}22`, color:STATUS_COLOR[o.status] }}>{o.status.toUpperCase()}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
                  <span style={{ fontSize:12, color:"#4b5563" }}>{new Date(o.created_at).toLocaleDateString("de-AT")}</span>
                  <span style={{ fontSize:14, fontWeight:800, color:"#f9fafb", fontFamily:"monospace" }}>€{Number(o.total).toFixed(2)}</span>
                </div>
              </div>
            ))
        }
      </Modal>}

      <div style={{ position:"fixed", bottom:24, right:24, zIndex:999, display:"flex", flexDirection:"column", gap:8 }}>
        {toasts.map(t => (
          <div key={t.id} className="toast" style={{ background:"#111318", border:`1px solid ${t.type==="err"?"#7f1d1d":"#1e2028"}`, borderRadius:10, padding:"11px 16px", fontSize:13, color:"#e5e7eb", maxWidth:300, boxShadow:"0 8px 32px rgba(0,0,0,0.6)" }}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard({ session, onBack, sb, products }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState({});
  const [tab, setTab] = useState("orders"); // orders | products | stats

  useEffect(() => {
    sb.adminGetOrders(session.token).then(data => {
      setOrders(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  const toggleOrder = async (orderId) => {
    if (expandedOrder === orderId) { setExpandedOrder(null); return; }
    setExpandedOrder(orderId);
    if (!orderItems[orderId]) {
      const items = await sb.adminGetOrderItems(session.token, orderId);
      setOrderItems(prev => ({ ...prev, [orderId]: Array.isArray(items) ? items : [] }));
    }
  };

  const totalRevenue = orders.reduce((s,o) => s + Number(o.total), 0);
  const statusCounts = orders.reduce((acc,o) => { acc[o.status] = (acc[o.status]||0)+1; return acc; }, {});

  return (
    <div style={{ minHeight:"100vh", background:"#06070a", color:"#d1d5db", fontFamily:"'DM Sans','Helvetica Neue',sans-serif" }}>
      <GlobalStyles />

      {/* Admin Navbar */}
      <nav style={{ background:"rgba(6,7,10,0.95)", backdropFilter:"blur(20px)", borderBottom:"1px solid #f59e0b33", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 2rem", height:60, position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={onBack} style={{ background:"none", border:"1px solid #1e2028", color:"#6b7280", padding:"6px 12px", borderRadius:7, cursor:"pointer", fontSize:12, fontFamily:"inherit" }}>← Shop</button>
          <span style={{ fontSize:18, fontWeight:900, color:"#fff", fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2 }}>SNØVAULT</span>
          <span style={{ background:"#f59e0b22", color:"#f59e0b", border:"1px solid #f59e0b44", fontSize:9, fontWeight:800, letterSpacing:2, padding:"2px 7px", borderRadius:4 }}>ADMIN</span>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[["orders","📋 Bestellungen"],["products","📦 Produkte"],["stats","📊 Stats"]].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding:"7px 14px", borderRadius:7, border:`1px solid ${tab===k?"#f59e0b44":"#1e2028"}`, background:tab===k?"#f59e0b18":"transparent", color:tab===k?"#f59e0b":"#6b7280", cursor:"pointer", fontSize:12, fontWeight:700, fontFamily:"inherit", transition:"all 0.15s" }}>{l}</button>
          ))}
        </div>
      </nav>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"2rem" }}>

        {/* STATS TAB */}
        {tab==="stats" && (
          <div style={{ animation:"fadeUp 0.4s ease" }}>
            <h2 style={{ fontSize:28, fontWeight:900, color:"#fff", marginBottom:"2rem", fontFamily:"'Bebas Neue',sans-serif", letterSpacing:1 }}>ÜBERSICHT</h2>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:"1rem", marginBottom:"2rem" }}>
              {[
                { label:"Gesamtumsatz", value:`€${totalRevenue.toFixed(2)}`, color:"#4ade80", icon:"💰" },
                { label:"Bestellungen", value:orders.length, color:"#60a5fa", icon:"📋" },
                { label:"Produkte", value:products.length, color:"#f59e0b", icon:"📦" },
                { label:"Ausstehend", value:statusCounts.pending||0, color:"#f97316", icon:"⏳" },
              ].map(s => (
                <div key={s.label} style={{ background:"#0e0f14", border:`1px solid ${s.color}33`, borderRadius:14, padding:"1.5rem", position:"relative", overflow:"hidden" }}>
                  <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${s.color},transparent)` }} />
                  <div style={{ fontSize:28, marginBottom:8 }}>{s.icon}</div>
                  <div style={{ fontSize:32, fontWeight:900, color:s.color, fontFamily:"monospace", lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:12, color:"#4b5563", marginTop:4 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ background:"#0e0f14", border:"1px solid #1e2028", borderRadius:14, padding:"1.5rem" }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:"#fff", marginBottom:"1rem" }}>Status-Verteilung</h3>
              {Object.entries(STATUS_COLOR).map(([status, color]) => {
                const count = statusCounts[status] || 0;
                const pct = orders.length ? (count/orders.length)*100 : 0;
                return (
                  <div key={status} style={{ marginBottom:"0.75rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:12, color, fontWeight:700 }}>{status.toUpperCase()}</span>
                      <span style={{ fontSize:12, fontFamily:"monospace", color:"#6b7280" }}>{count}</span>
                    </div>
                    <div style={{ height:6, background:"#1a1c22", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:3, transition:"width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ORDERS TAB */}
        {tab==="orders" && (
          <div style={{ animation:"fadeUp 0.4s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.5rem" }}>
              <h2 style={{ fontSize:28, fontWeight:900, color:"#fff", fontFamily:"'Bebas Neue',sans-serif", letterSpacing:1 }}>BESTELLUNGEN</h2>
              <span style={{ fontSize:12, color:"#4b5563", fontFamily:"monospace" }}>{orders.length} total · €{totalRevenue.toFixed(2)}</span>
            </div>
            {loading
              ? <div style={{ textAlign:"center", color:"#374151", padding:"4rem" }}>Lädt...</div>
              : orders.length === 0
                ? <div style={{ textAlign:"center", color:"#374151", padding:"4rem" }}><div style={{ fontSize:48 }}>📭</div><p style={{ marginTop:12 }}>Keine Bestellungen. Noch.</p></div>
                : orders.map(o => (
                    <div key={o.id} style={{ background:"#0e0f14", border:"1px solid #1e2028", borderRadius:12, marginBottom:"0.75rem", overflow:"hidden", transition:"border-color 0.2s" }}>
                      <div onClick={() => toggleOrder(o.id)} style={{ display:"flex", alignItems:"center", gap:"1rem", padding:"1rem 1.25rem", cursor:"pointer" }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <span style={{ fontSize:12, fontFamily:"monospace", color:"#6b7280", fontWeight:700 }}>#{o.id.slice(0,8).toUpperCase()}</span>
                            <span style={{ fontSize:10, fontWeight:800, letterSpacing:1, padding:"2px 8px", borderRadius:4, background:`${STATUS_COLOR[o.status]}22`, color:STATUS_COLOR[o.status] }}>{o.status.toUpperCase()}</span>
                          </div>
                          <div style={{ fontSize:11, color:"#374151", marginTop:3 }}>{new Date(o.created_at).toLocaleString("de-AT")}</div>
                        </div>
                        <span style={{ fontSize:18, fontWeight:900, color:"#f9fafb", fontFamily:"monospace" }}>€{Number(o.total).toFixed(2)}</span>
                        <span style={{ color:"#374151", fontSize:14, transition:"transform 0.2s", transform:expandedOrder===o.id?"rotate(90deg)":"none" }}>▶</span>
                      </div>
                      {expandedOrder === o.id && (
                        <div style={{ borderTop:"1px solid #1a1c22", padding:"1rem 1.25rem", background:"#0a0b0e" }}>
                          {!orderItems[o.id]
                            ? <p style={{ fontSize:12, color:"#374151" }}>Lädt...</p>
                            : orderItems[o.id].length === 0
                              ? <p style={{ fontSize:12, color:"#374151" }}>Keine Produkte gefunden.</p>
                              : orderItems[o.id].map(item => (
                                  <div key={item.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"0.5rem 0", borderBottom:"1px solid #111318" }}>
                                    <div style={{ width:32, height:32, borderRadius:6, background:`${item.products?.color||"#333"}22`, border:`1px solid ${item.products?.color||"#333"}44`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                                      <div style={{ width:12, height:12, borderRadius:"50%", background:item.products?.color||"#333" }} />
                                    </div>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:13, fontWeight:700, color:"#e5e7eb" }}>{item.products?.name||"Unbekannt"}</div>
                                      <div style={{ fontSize:11, color:"#4b5563" }}>{item.products?.brand} · {item.qty}x · €{Number(item.price_at_purchase).toFixed(2)}/Stk</div>
                                    </div>
                                    <span style={{ fontSize:13, fontFamily:"monospace", color:"#4ade80" }}>€{(item.qty*item.price_at_purchase).toFixed(2)}</span>
                                  </div>
                                ))
                          }
                        </div>
                      )}
                    </div>
                  ))
            }
          </div>
        )}

        {/* PRODUCTS TAB */}
        {tab==="products" && (
          <div style={{ animation:"fadeUp 0.4s ease" }}>
            <h2 style={{ fontSize:28, fontWeight:900, color:"#fff", marginBottom:"1.5rem", fontFamily:"'Bebas Neue',sans-serif", letterSpacing:1 }}>PRODUKTE</h2>
            <div style={{ background:"#0e0f14", border:"1px solid #1e2028", borderRadius:12, overflow:"hidden" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:"1px solid #1e2028" }}>
                    {["Produkt","Brand","Stärke","Geschmack","Preis","Portionen"].map(h => (
                      <th key={h} style={{ padding:"12px 16px", textAlign:"left", fontSize:10, color:"#4b5563", fontWeight:800, letterSpacing:2, fontFamily:"monospace" }}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p,i) => (
                    <tr key={p.id} style={{ borderBottom:"1px solid #111318", background:i%2===0?"transparent":"#0a0b0e" }}>
                      <td style={{ padding:"12px 16px" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:28, height:28, borderRadius:6, background:`${p.color}22`, border:`1px solid ${p.color}44`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <div style={{ width:10, height:10, borderRadius:"50%", background:p.color }} />
                          </div>
                          <span style={{ fontSize:13, fontWeight:700, color:"#e5e7eb" }}>{p.name}</span>
                        </div>
                      </td>
                      <td style={{ padding:"12px 16px", fontSize:12, color:"#6b7280" }}>{p.brand}</td>
                      <td style={{ padding:"12px 16px" }}>
                        <div style={{ display:"flex", gap:2 }}>
                          {[1,2,3,4,5].map(s => <div key={s} style={{ width:6, height:6, borderRadius:"50%", background:s<=p.strength?STRENGTH_COLOR[p.strength]:"#1a1c22" }} />)}
                        </div>
                      </td>
                      <td style={{ padding:"12px 16px", fontSize:12, color:"#6b7280" }}>{p.flavor}</td>
                      <td style={{ padding:"12px 16px", fontSize:13, fontFamily:"monospace", color:"#4ade80", fontWeight:700 }}>€{Number(p.price).toFixed(2)}</td>
                      <td style={{ padding:"12px 16px", fontSize:12, color:"#6b7280" }}>{p.portions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthModal({ onClose, onSuccess, toast }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const handle = async () => {
    if (!email) { setErr("Email eingeben."); return; }
    setLoading(true); setErr("");
    try {
      if (tab === "magic") { await sb.signInMagic(email); setMagicSent(true); }
      else if (tab === "login") {
        const data = await sb.signIn(email, pass);
        if (!data.access_token) { setErr(data.error_description || "Falsches Login. 🤡"); }
        else onSuccess(data);
      } else {
        const data = await sb.signUp(email, pass);
        if (data.error) { setErr(data.msg || "Fehler."); }
        else { toast("📧 Bestätigungsmail gesendet!"); onClose(); }
      }
    } catch(e) { setErr("Netzwerkfehler."); }
    setLoading(false);
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ textAlign:"center", marginBottom:"1.75rem" }}>
        <div style={{ fontSize:40, marginBottom:"0.5rem" }}>🔑</div>
        <h2 style={{ fontSize:22, fontWeight:900, color:"#fff" }}>Konto</h2>
      </div>
      <div style={{ display:"flex", background:"#080a0d", borderRadius:10, padding:4, marginBottom:"1.25rem", gap:4 }}>
        {[["login","Login"],["register","Register"],["magic","Magic Link"]].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); setErr(""); setMagicSent(false); }} style={{ flex:1, padding:"8px 4px", borderRadius:7, border:"none", cursor:"pointer", fontSize:12, fontWeight:700, transition:"all 0.15s", background:tab===k?"#1e2028":"transparent", color:tab===k?"#f9fafb":"#4b5563", fontFamily:"inherit" }}>{l}</button>
        ))}
      </div>
      {magicSent
        ? <div style={{ textAlign:"center", padding:"1.5rem 0" }}>
            <div style={{ fontSize:40, marginBottom:"0.75rem" }}>📬</div>
            <p style={{ color:"#4ade80", fontWeight:700 }}>Magic Link gesendet!</p>
          </div>
        : <div style={{ display:"flex", flexDirection:"column", gap:"0.75rem" }}>
            <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==="Enter"&&handle()} className="modal-input" type="email" />
            {tab !== "magic" && <input placeholder="Passwort" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key==="Enter"&&handle()} className="modal-input" type="password" />}
            {err && <p style={{ color:"#ef4444", fontSize:12, textAlign:"center" }}>{err}</p>}
            <button onClick={handle} className="primary-btn" disabled={loading} style={{ opacity:loading?0.6:1 }}>
              {loading?"...":tab==="login"?"Einloggen →":tab==="register"?"Registrieren →":"Magic Link →"}
            </button>
          </div>
      }
    </Modal>
  );
}

function ProductCard({ product: p, index, onBuy, loggedIn }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background:hovered?"#0e1014":"#0b0c0f", border:`1px solid ${hovered?p.color+"55":"#1a1c22"}`, borderRadius:14, padding:"1.25rem", transition:"all 0.25s", transform:hovered?"translateY(-4px)":"none", boxShadow:hovered?`0 20px 50px rgba(0,0,0,0.5),0 0 30px ${p.color}18`:"none", animationDelay:`${index*0.05}s`, animation:"fadeUp 0.5s ease both", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, background:`linear-gradient(90deg,transparent,${p.color},transparent)`, opacity:hovered?1:0.3, transition:"opacity 0.25s" }} />
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"1.25rem" }}>
        <div style={{ width:52, height:52, borderRadius:10, background:`${p.color}18`, border:`1px solid ${p.color}33`, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ width:24, height:24, borderRadius:"50%", background:p.color, boxShadow:`0 0 12px ${p.color}88` }} />
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:9, color:"#374151", letterSpacing:2, fontFamily:"monospace", marginBottom:3 }}>{p.brand.toUpperCase()}</div>
          <div style={{ display:"flex", gap:3 }}>{[1,2,3,4,5].map(s => <div key={s} style={{ width:6, height:6, borderRadius:"50%", background:s<=p.strength?STRENGTH_COLOR[p.strength]:"#1a1c22" }} />)}</div>
        </div>
      </div>
      <h3 style={{ fontSize:16, fontWeight:800, color:"#f9fafb", marginBottom:4 }}>{p.name}</h3>
      <p style={{ fontSize:11, color:"#4b5563", marginBottom:"1rem" }}>{p.flavor} · {p.mg} · {p.portions} Portionen</p>
      <div style={{ display:"flex", gap:6, marginBottom:"1.25rem" }}>
        <span style={{ background:`${STRENGTH_COLOR[p.strength]}18`, color:STRENGTH_COLOR[p.strength], border:`1px solid ${STRENGTH_COLOR[p.strength]}33`, fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:4 }}>{STRENGTH_LABEL[p.strength]}</span>
        <span style={{ background:"#1a1c22", color:"#6b7280", fontSize:10, padding:"3px 8px", borderRadius:4 }}>{p.weight}</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <span style={{ fontSize:22, fontWeight:900, color:"#f9fafb", fontFamily:"monospace" }}>€{Number(p.price).toFixed(2)}</span>
        <button onClick={() => onBuy(p)} style={{ background:loggedIn?p.color:"transparent", border:`1px solid ${p.color}`, color:loggedIn?"#000":p.color, padding:"9px 18px", borderRadius:8, fontSize:12, fontWeight:800, cursor:"pointer", transition:"all 0.18s" }}>{loggedIn?"In Warenkorb":"🔒 Kaufen"}</button>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background:"#0b0c0f", border:"1px solid #1a1c22", borderRadius:14, padding:"1.25rem" }}>
      {[52,14,16,11,24].map((h,i) => <div key={i} style={{ height:h, background:"linear-gradient(90deg,#111318 25%,#1a1c22 50%,#111318 75%)", backgroundSize:"200% 100%", borderRadius:8, marginBottom:12, animation:"shimmer 1.5s infinite", width:i===1?"60%":i===2?"70%":i===3?"50%":"100%" }} />)}
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)" }} />
      <div style={{ position:"relative", background:"#0e1014", border:"1px solid #1e2028", borderRadius:18, padding:"2.5rem 2rem", width:"100%", maxWidth:420, boxShadow:"0 40px 100px rgba(0,0,0,0.7)", animation:"popIn 0.3s ease", maxHeight:"90vh", overflowY:"auto" }}>
        <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"none", border:"none", color:"#374151", cursor:"pointer", fontSize:18 }}>✕</button>
        {children}
      </div>
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
      ::-webkit-scrollbar { width:5px; background:#08090c; }
      ::-webkit-scrollbar-thumb { background:#1a1c22; border-radius:3px; }
      @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      @keyframes popIn { 0%{opacity:0;transform:scale(0.92)} 100%{opacity:1;transform:scale(1)} }
      @keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
      @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      .toast { animation: toastIn 0.3s ease both; }
      .nav-btn { background:transparent; border:1px solid #1e2028; color:#9ca3af; padding:7px 14px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; transition:all 0.15s; font-family:inherit; }
      .nav-btn:hover { border-color:#4ade80; color:#4ade80; }
      .cart-btn { background:#111318; border:1px solid #1e2028; color:#9ca3af; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:15px; position:relative; transition:all 0.15s; font-family:inherit; font-weight:700; }
      .cart-btn:hover { border-color:#4ade80; }
      .cart-badge { position:absolute; top:-8px; right:-8px; background:#4ade80; color:#000; border-radius:50%; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; font-size:10px; font-weight:900; }
      .modal-input { width:100%; background:#080a0d; border:1px solid #1e2028; border-radius:9px; padding:12px 14px; color:#e5e7eb; font-size:14px; font-family:inherit; transition:border-color 0.15s; }
      .modal-input:focus { outline:none; border-color:#4ade80; }
      .modal-input::placeholder { color:#374151; }
      .primary-btn { background:#4ade80; color:#000; border:none; border-radius:10px; padding:13px; font-size:14px; font-weight:800; cursor:pointer; font-family:inherit; transition:all 0.15s; }
      .primary-btn:hover:not(:disabled) { background:#86efac; transform:translateY(-1px); }
      .primary-btn:disabled { cursor:not-allowed; }
    `}</style>
  );
}