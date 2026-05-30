import { useState, useRef, useEffect, useMemo } from "react";

const SUPABASE_URL = "https://ceivofdaqtbskdmxcsox.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlaXZvZmRhcXRic2tkbXhjc294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNDI3NjcsImV4cCI6MjA5NTYxODc2N30.DhUo5UVxsWTVVZ2sxFbhxrF4WsHiIZKkY98dZnmTIIs";
const ADMIN_EMAIL = "maximilianjaufer@gmail.com";

// ─── REWARDS CONFIG ───────────────────────────────────────────────────────────
const REWARDS = [
  { id:"free_ship",  threshold:29.99, type:"shipping", label:"Gratis Versand",    icon:"🚚", desc:"Ab €30 — weil wir nett sind. Manchmal." },
  { id:"bonus_can",  threshold:49.99, type:"gift",     label:"+1 Dose gratis",    icon:"🎁", desc:"Ab €50 kriegst du eine Extradose. Nicht verdient, aber hey." },
  { id:"vip",        threshold:89.99, type:"vip",      label:"VIP Status",        icon:"👑", desc:"Ab €90 bist du offiziell süchtig. Glückwunsch." },
];
const SHIPPING_COST = 4.99;

const sb = {
  async signUp(e,p){const r=await fetch(`${SUPABASE_URL}/auth/v1/signup`,{method:"POST",headers:{apikey:SUPABASE_ANON,"Content-Type":"application/json"},body:JSON.stringify({email:e,password:p})});return r.json();},
  async signIn(e,p){const r=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:SUPABASE_ANON,"Content-Type":"application/json"},body:JSON.stringify({email:e,password:p})});return r.json();},
  async signInMagic(e){const r=await fetch(`${SUPABASE_URL}/auth/v1/magiclink`,{method:"POST",headers:{apikey:SUPABASE_ANON,"Content-Type":"application/json"},body:JSON.stringify({email:e})});return r.json();},
  async getProducts(){const r=await fetch(`${SUPABASE_URL}/rest/v1/products?active=eq.true&order=name`,{headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${SUPABASE_ANON}`}});return r.json();},
  async createOrder(tok,uid,items,total){const ro=await fetch(`${SUPABASE_URL}/rest/v1/orders`,{method:"POST",headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${tok}`,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify({user_id:uid,total,status:"pending"})});const[order]=await ro.json();await fetch(`${SUPABASE_URL}/rest/v1/order_items`,{method:"POST",headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${tok}`,"Content-Type":"application/json"},body:JSON.stringify(items.map(i=>({order_id:order.id,product_id:i.id,qty:i.qty,price_at_purchase:i.price})))});return order;},
  async getOrders(tok,uid){const r=await fetch(`${SUPABASE_URL}/rest/v1/orders?user_id=eq.${uid}&order=created_at.desc`,{headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${tok}`}});return r.json();},
  async adminGetOrders(tok){const r=await fetch(`${SUPABASE_URL}/rest/v1/orders?order=created_at.desc`,{headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${tok}`}});return r.json();},
  async adminGetOrderItems(tok,oid){const r=await fetch(`${SUPABASE_URL}/rest/v1/order_items?order_id=eq.${oid}&select=*,products(name,brand,color)`,{headers:{apikey:SUPABASE_ANON,Authorization:`Bearer ${tok}`}});return r.json();},
};

const STRENGTH_LABEL=["","Leicht","Medium","Strong","X-Strong","Ultra"];
const STRENGTH_COLOR=["","#22c55e","#84cc16","#f59e0b","#ef4444","#991b1b"];
const STATUS_COLOR={pending:"#f59e0b",paid:"#22c55e",shipped:"#0ea5e9",delivered:"#8b5cf6",cancelled:"#ef4444"};
const SORT_OPTIONS=[{value:"name_asc",label:"Name A–Z"},{value:"name_desc",label:"Name Z–A"},{value:"price_asc",label:"Günstigste zuerst"},{value:"price_desc",label:"Teuerste zuerst"},{value:"strength_asc",label:"Schwächste zuerst"},{value:"strength_desc",label:"Stärkste zuerst"}];

// ─── REWARD UTILS ─────────────────────────────────────────────────────────────
function getUnlockedRewards(total){ return REWARDS.filter(r=>total>=r.threshold); }
function getNextReward(total){ return REWARDS.find(r=>total<r.threshold)||null; }
function hasShipping(total){ return total>=REWARDS[0].threshold; }

export default function App() {
  const[page,setPage]=useState("shop");
  const[modal,setModal]=useState(null);
  const[ageVerified,setAgeVerified]=useState(false);
  const[session,setSession]=useState(null);
  const[products,setProducts]=useState([]);
  const[loadingProducts,setLoadingProducts]=useState(true);
  const[cart,setCart]=useState([]);
  const[pendingProduct,setPendingProduct]=useState(null);
  const[search,setSearch]=useState("");
  const[filterStrength,setFilterStrength]=useState(0);
  const[filterFlavor,setFilterFlavor]=useState("Alle");
  const[filterBrand,setFilterBrand]=useState("Alle");
  const[sortBy,setSortBy]=useState("name_asc");
  const[toasts,setToasts]=useState([]);
  const[orders,setOrders]=useState([]);
  const[placingOrder,setPlacingOrder]=useState(false);
  const[dobData,setDobData]=useState({day:"",month:"",year:""});
  const[dobErr,setDobErr]=useState("");
  const[wishlist,setWishlist]=useState([]);
  const[filtersOpen,setFiltersOpen]=useState(false);
  const[rewardAnim,setRewardAnim]=useState(null);
  const toastRef=useRef(0);
  const searchRef=useRef(null);
  const prevUnlocked=useRef([]);

  useEffect(()=>{
    sb.getProducts().then(d=>{setProducts(Array.isArray(d)?d:[]);setLoadingProducts(false);}).catch(()=>setLoadingProducts(false));
    const h=(e)=>{if(e.key==="/"&&document.activeElement.tagName!=="INPUT"){e.preventDefault();searchRef.current?.focus();}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  const cartTotal=useMemo(()=>cart.reduce((s,x)=>s+x.price*x.qty,0),[cart]);
  const cartCount=useMemo(()=>cart.reduce((s,x)=>s+x.qty,0),[cart]);
  const unlockedRewards=useMemo(()=>getUnlockedRewards(cartTotal),[cartTotal]);
  const nextReward=useMemo(()=>getNextReward(cartTotal),[cartTotal]);
  const shippingFree=hasShipping(cartTotal);
  const orderTotal=shippingFree?cartTotal:cartTotal+SHIPPING_COST;

  // Detect newly unlocked rewards
  useEffect(()=>{
    const prev=prevUnlocked.current.map(r=>r.id);
    const curr=unlockedRewards.map(r=>r.id);
    const newOnes=curr.filter(id=>!prev.includes(id));
    if(newOnes.length>0){
      const r=REWARDS.find(x=>x.id===newOnes[0]);
      if(r){setRewardAnim(r);setTimeout(()=>setRewardAnim(null),3500);}
    }
    prevUnlocked.current=unlockedRewards;
  },[unlockedRewards]);

  const toast=(msg,type="ok")=>{
    const id=++toastRef.current;
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3000);
  };

  const isAdmin=session?.user?.email===ADMIN_EMAIL;
  const flavors=useMemo(()=>["Alle",...new Set(products.map(p=>p.flavor))],[products]);
  const brands=useMemo(()=>["Alle",...new Set(products.map(p=>p.brand))],[products]);

  const filtered=useMemo(()=>{
    let list=products.filter(p=>{
      const q=search.toLowerCase();
      return(!q||p.name.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q)||p.flavor.toLowerCase().includes(q))
        &&(filterStrength===0||p.strength===filterStrength)
        &&(filterFlavor==="Alle"||p.flavor===filterFlavor)
        &&(filterBrand==="Alle"||p.brand===filterBrand);
    });
    switch(sortBy){
      case"name_desc":return list.sort((a,b)=>b.name.localeCompare(a.name));
      case"price_asc":return list.sort((a,b)=>a.price-b.price);
      case"price_desc":return list.sort((a,b)=>b.price-a.price);
      case"strength_asc":return list.sort((a,b)=>a.strength-b.strength);
      case"strength_desc":return list.sort((a,b)=>b.strength-a.strength);
      default:return list.sort((a,b)=>a.name.localeCompare(b.name));
    }
  },[products,search,filterStrength,filterFlavor,filterBrand,sortBy]);

  const activeFilters=[filterStrength!==0&&`Stärke: ${"●".repeat(filterStrength)}`,filterFlavor!=="Alle"&&filterFlavor,filterBrand!=="Alle"&&filterBrand,search&&`"${search}"`].filter(Boolean);

  const handleBuy=(p)=>{
    if(!ageVerified){setPendingProduct(p);setModal("age");return;}
    if(!session){setPendingProduct(p);setModal("auth");return;}
    addToCart(p);
  };
  const addToCart=(p)=>{
    setCart(c=>{const ex=c.find(x=>x.id===p.id);if(ex)return c.map(x=>x.id===p.id?{...x,qty:x.qty+1}:x);return[...c,{...p,qty:1}];});
    toast(`✅ ${p.name} drin. Gute Wahl — ausnahmsweise.`);
  };
  const toggleWishlist=(p)=>{
    setWishlist(w=>{
      const has=w.find(x=>x.id===p.id);
      if(has){toast(`💔 ${p.name} von der Wunschliste entfernt.`);return w.filter(x=>x.id!==p.id);}
      toast(`❤️ ${p.name} auf der Wunschliste. Träum weiter.`);return[...w,p];
    });
  };
  const verifyAge=()=>{
    const{day,month,year}=dobData;
    if(!day||!month||!year||year.length<4){setDobErr("Vollständiges Datum, du Genie.");return;}
    const dob=new Date(+year,+month-1,+day);
    const age=Math.floor((Date.now()-dob)/(365.25*24*3600*1000));
    if(isNaN(age)||age<0||age>120){setDobErr("Das ist kein echtes Datum.");return;}
    if(age<18){setDobErr("Unter 18. Tschüss. 👋");return;}
    setAgeVerified(true);setDobErr("");
    if(!session)setModal("auth");
    else{setModal(null);if(pendingProduct){addToCart(pendingProduct);setPendingProduct(null);}}
  };
  const handleAuthSuccess=(data)=>{
    setSession({token:data.access_token,user:data.user||data});
    setModal(null);
    if(pendingProduct){addToCart(pendingProduct);setPendingProduct(null);}
    toast(`👋 Da bist du ja endlich.`);
  };
  const handleCheckout=async()=>{
    if(!session||cart.length===0)return;
    setPlacingOrder(true);
    try{
      await sb.createOrder(session.token,session.user.id,cart,orderTotal);
      setCart([]);setModal(null);
      toast(`🎉 Bestellung aufgegeben! Endlich tust du was Sinnvolles.`);
    }catch(e){toast("❌ Fehler. Wie dein Leben.","err");}
    setPlacingOrder(false);
  };
  const openOrders=async()=>{
    if(!session){setModal("auth");return;}
    const d=await sb.getOrders(session.token,session.user.id);
    setOrders(Array.isArray(d)?d:[]);setModal("orders");
  };

  if(page==="admin"&&isAdmin)return<AdminDashboard session={session} onBack={()=>setPage("shop")} sb={sb} products={products}/>;

  return(
    <div style={{minHeight:"100vh",background:"#08090c",color:"#d1d5db",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",overflowX:"hidden"}}>
      <GlobalStyles/>

      {/* REWARD UNLOCK POPUP */}
      {rewardAnim&&(
        <div style={{position:"fixed",top:80,left:"50%",transform:"translateX(-50%)",zIndex:500,background:"linear-gradient(135deg,#0f1a0f,#0e1a10)",border:"2px solid #4ade80",borderRadius:16,padding:"1.25rem 2rem",textAlign:"center",animation:"rewardPop 0.5s cubic-bezier(0.34,1.56,0.64,1)",boxShadow:"0 0 60px rgba(74,222,128,0.3)",minWidth:280}}>
          <div style={{fontSize:40,marginBottom:6,animation:"spin 0.6s ease"}}>{rewardAnim.icon}</div>
          <div style={{fontSize:16,fontWeight:900,color:"#4ade80",letterSpacing:-0.5}}>Reward freigeschaltet!</div>
          <div style={{fontSize:13,color:"#86efac",marginTop:4}}>{rewardAnim.label}</div>
          <div style={{fontSize:11,color:"#4b5563",marginTop:4}}>{rewardAnim.desc}</div>
        </div>
      )}

      {/* NAVBAR */}
      <nav style={{position:"sticky",top:0,zIndex:100,background:"rgba(8,9,12,0.95)",backdropFilter:"blur(24px)",borderBottom:"1px solid #1a1c22",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 1.5rem",height:60,gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:22,fontWeight:900,color:"#fff",fontFamily:"'Bebas Neue','Impact',sans-serif",letterSpacing:2}}>SNØVAULT</span>
          <span style={{background:"#16a34a22",color:"#4ade80",border:"1px solid #16a34a44",fontSize:9,fontWeight:800,letterSpacing:2,padding:"2px 7px",borderRadius:4}}>PREMIUM</span>
        </div>
        <div style={{flex:1,maxWidth:400,position:"relative"}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#374151"}}>🔍</span>
          <input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} placeholder='Suchen... (oder "/" drücken)'
            style={{width:"100%",background:"#111318",border:"1px solid #1e2028",borderRadius:10,padding:"9px 12px 9px 36px",color:"#e5e7eb",fontSize:13,fontFamily:"inherit",outline:"none",transition:"border-color 0.15s"}}
            onFocus={e=>e.target.style.borderColor="#4ade80"} onBlur={e=>e.target.style.borderColor="#1e2028"}/>
          {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#374151",cursor:"pointer",fontSize:16}}>×</button>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {session?<>
            {isAdmin&&<button onClick={()=>setPage("admin")} className="nav-btn" style={{borderColor:"#f59e0b44",color:"#f59e0b"}}>⚡ Admin</button>}
            <button onClick={openOrders} className="nav-btn">📦</button>
            <button onClick={()=>setModal("wishlist")} className="nav-btn" style={{position:"relative"}}>
              ❤️{wishlist.length>0&&<span className="cart-badge" style={{background:"#f43f5e"}}>{wishlist.length}</span>}
            </button>
            <button onClick={()=>{setSession(null);toast("Tschüss. War nett. Oder so.");}} className="nav-btn">Logout</button>
          </>:<button onClick={()=>setModal("auth")} className="nav-btn">Login</button>}
          <button onClick={()=>setModal("cart")} className="cart-btn" style={{position:"relative"}}>
            🛒{cartCount>0&&<span className="cart-badge">{cartCount}</span>}
          </button>
        </div>
      </nav>

      {/* REWARD PROGRESS BAR (wenn was im Warenkorb) */}
      {cartTotal>0&&cartTotal<REWARDS[REWARDS.length-1].threshold&&nextReward&&(
        <div style={{background:"#0b0d10",borderBottom:"1px solid #1a1c22",padding:"0.6rem 1.5rem",display:"flex",alignItems:"center",gap:"1rem"}}>
          <span style={{fontSize:11,color:"#4b5563",whiteSpace:"nowrap",fontFamily:"monospace"}}>
            {nextReward.icon} Noch <span style={{color:"#4ade80",fontWeight:800}}>€{Math.max(0,nextReward.threshold-cartTotal+0.01).toFixed(2)}</span> bis {nextReward.label}
          </span>
          <div style={{flex:1,height:4,background:"#1a1c22",borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",width:`${Math.min(100,(cartTotal/nextReward.threshold)*100)}%`,background:"linear-gradient(90deg,#4ade80,#22c55e)",borderRadius:2,transition:"width 0.4s ease"}}/>
          </div>
          <span style={{fontSize:10,color:"#374151",fontFamily:"monospace",whiteSpace:"nowrap"}}>{Math.round((cartTotal/nextReward.threshold)*100)}%</span>
        </div>
      )}

      {/* HERO */}
      <div style={{padding:"5rem 2rem 3rem",textAlign:"center",background:"radial-gradient(ellipse 100% 70% at 50% -10%, rgba(74,222,128,0.07) 0%, transparent 65%)",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(#1a1c22 1px, transparent 1px)",backgroundSize:"32px 32px",opacity:0.4}}/>
        <div style={{position:"relative",zIndex:1}}>
          <p style={{fontSize:11,letterSpacing:5,color:"#4ade80",fontFamily:"monospace",marginBottom:"1rem"}}>ÖSTERREICHS BESTER SNUS-SHOP — ANGEBLICH</p>
          <h1 style={{fontSize:"clamp(2.5rem,7vw,6rem)",fontWeight:900,lineHeight:0.95,letterSpacing:-3,color:"#fff",fontFamily:"'Bebas Neue','Impact',sans-serif"}}>
            NIKOTINPOWER<br/><span style={{color:"#4ade80",WebkitTextStroke:"1px #4ade80",WebkitTextFillColor:"transparent"}}>FÜR ERWACHSENE</span>
          </h1>
          <p style={{marginTop:"1.25rem",color:"#4b5563",fontSize:13,maxWidth:380,margin:"1.25rem auto 0"}}>Nur für Personen über 18. Wenn du das liest und 17 bist — Glückwunsch, du kannst lesen.</p>

          {/* REWARD TIERS */}
          <div style={{marginTop:"2rem",display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            {REWARDS.map(r=>(
              <div key={r.id} style={{background:unlockedRewards.find(u=>u.id===r.id)?"#16a34a22":"#111318",border:`1px solid ${unlockedRewards.find(u=>u.id===r.id)?"#4ade8055":"#1e2028"}`,borderRadius:100,padding:"7px 16px",fontSize:12,color:unlockedRewards.find(u=>u.id===r.id)?"#4ade80":"#6b7280",transition:"all 0.3s",display:"flex",alignItems:"center",gap:6}}>
                <span>{r.icon}</span>
                <span>{r.label}</span>
                <span style={{opacity:0.5,fontSize:11}}>ab €{r.threshold.toFixed(0)}</span>
                {unlockedRewards.find(u=>u.id===r.id)&&<span style={{fontSize:10,color:"#4ade80"}}>✓</span>}
              </div>
            ))}
          </div>
          <div style={{marginTop:"1rem",display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            {["🇦🇹 Österreich-Versand","⚡ Express 24h","🔒 18+ verifiziert",`📦 ${products.length} Sorten`].map(t=>(
              <span key={t} style={{background:"#111318",border:"1px solid #1e2028",borderRadius:100,padding:"7px 14px",fontSize:12,color:"#6b7280"}}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{maxWidth:1300,margin:"0 auto",padding:"1rem 1.5rem 0"}}>
        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:"0.75rem"}}>
          <button onClick={()=>setFiltersOpen(f=>!f)} style={{display:"flex",alignItems:"center",gap:6,background:filtersOpen?"#1e2028":"transparent",border:"1px solid #1e2028",color:filtersOpen?"#fff":"#6b7280",padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",transition:"all 0.15s"}}>
            ⚙️ Filter {activeFilters.length>0&&<span style={{background:"#4ade80",color:"#000",borderRadius:"50%",width:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900}}>{activeFilters.length}</span>}
          </button>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:"#111318",border:"1px solid #1e2028",borderRadius:8,padding:"7px 12px",color:"#9ca3af",fontSize:12,fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
            {SORT_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <span style={{fontSize:12,color:"#374151",fontFamily:"monospace",marginLeft:"auto"}}>{filtered.length} Produkte</span>
          {activeFilters.length>0&&<button onClick={()=>{setFilterStrength(0);setFilterFlavor("Alle");setFilterBrand("Alle");setSearch("");}} style={{background:"#7f1d1d22",border:"1px solid #7f1d1d44",color:"#fca5a5",padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"inherit"}}>✕ Reset</button>}
        </div>
        {filtersOpen&&(
          <div style={{background:"#0e0f14",border:"1px solid #1e2028",borderRadius:12,padding:"1.25rem",marginBottom:"1rem",animation:"fadeUp 0.2s ease"}}>
            <div style={{display:"flex",gap:"2rem",flexWrap:"wrap"}}>
              <div>
                <p style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:8,fontFamily:"monospace"}}>STÄRKE</p>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {[0,1,2,3,4,5].map(s=>(
                    <button key={s} onClick={()=>setFilterStrength(s)} style={{padding:"5px 12px",borderRadius:6,fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${filterStrength===s?(STRENGTH_COLOR[s]||"#4ade80"):"#1e2028"}`,background:filterStrength===s?`${STRENGTH_COLOR[s]||"#4ade80"}22`:"transparent",color:filterStrength===s?(STRENGTH_COLOR[s]||"#4ade80"):"#4b5563",transition:"all 0.15s"}}>{s===0?"Alle":"●".repeat(s)}</button>
                  ))}
                </div>
              </div>
              <div>
                <p style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:8,fontFamily:"monospace"}}>GESCHMACK</p>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",maxWidth:500}}>
                  {flavors.map(f=>(
                    <button key={f} onClick={()=>setFilterFlavor(f)} style={{padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${filterFlavor===f?"#4ade80":"#1e2028"}`,background:filterFlavor===f?"#4ade8022":"transparent",color:filterFlavor===f?"#4ade80":"#4b5563",transition:"all 0.15s"}}>{f}</button>
                  ))}
                </div>
              </div>
              <div>
                <p style={{fontSize:10,color:"#4b5563",letterSpacing:2,marginBottom:8,fontFamily:"monospace"}}>MARKE</p>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",maxWidth:600}}>
                  {brands.map(b=>(
                    <button key={b} onClick={()=>setFilterBrand(b)} style={{padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${filterBrand===b?"#f59e0b":"#1e2028"}`,background:filterBrand===b?"#f59e0b22":"transparent",color:filterBrand===b?"#f59e0b":"#4b5563",transition:"all 0.15s"}}>{b}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {activeFilters.length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:"0.75rem"}}>
            {activeFilters.map(f=><span key={f} style={{background:"#4ade8018",color:"#4ade80",border:"1px solid #4ade8033",borderRadius:100,padding:"3px 10px",fontSize:11,fontWeight:600}}>{f}</span>)}
          </div>
        )}
      </div>

      {/* NO RESULTS */}
      {!loadingProducts&&filtered.length===0&&(
        <div style={{textAlign:"center",padding:"5rem 2rem",color:"#374151"}}>
          <div style={{fontSize:48,marginBottom:"1rem"}}>🔭</div>
          <p style={{fontSize:16,fontWeight:700,color:"#6b7280"}}>Nichts gefunden.</p>
          <p style={{fontSize:13,marginTop:6}}>Entweder schreibst du wie ein Kleinkind oder wir haben's nicht.</p>
          <button onClick={()=>{setSearch("");setFilterStrength(0);setFilterFlavor("Alle");setFilterBrand("Alle");}} style={{marginTop:"1.5rem",background:"#4ade80",color:"#000",border:"none",borderRadius:8,padding:"10px 20px",fontWeight:800,cursor:"pointer",fontFamily:"inherit",fontSize:13}}>Filter zurücksetzen</button>
        </div>
      )}

      {/* PRODUCTS GRID */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:"1rem",padding:"1rem 1.5rem 4rem",maxWidth:1300,margin:"0 auto"}}>
        {loadingProducts?Array(12).fill(0).map((_,i)=><SkeletonCard key={i}/>):filtered.map((p,i)=><ProductCard key={p.id} product={p} index={i} onBuy={handleBuy} loggedIn={!!session} wishlisted={wishlist.some(w=>w.id===p.id)} onWishlist={toggleWishlist}/>)}
      </div>

      {/* AGE MODAL */}
      {modal==="age"&&<Modal onClose={()=>{setModal(null);setPendingProduct(null);}}>
        <div style={{textAlign:"center",marginBottom:"1.75rem"}}>
          <div style={{fontSize:48,marginBottom:"0.75rem"}}>🔞</div>
          <h2 style={{fontSize:22,fontWeight:900,color:"#fff"}}>Altersverifikation</h2>
          <p style={{fontSize:13,color:"#4b5563",marginTop:6}}>Nur für Personen ab 18.<br/>Lüg nicht — du weißt es selbst.</p>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:"0.75rem"}}>
          {[{key:"day",ph:"TT",w:"30%",max:2},{key:"month",ph:"MM",w:"30%",max:2},{key:"year",ph:"JJJJ",w:"40%",max:4}].map(f=>(
            <input key={f.key} maxLength={f.max} placeholder={f.ph} value={dobData[f.key]} onChange={e=>setDobData(d=>({...d,[f.key]:e.target.value.replace(/\D/,"")}))} className="modal-input" style={{width:f.w,textAlign:"center"}}/>
          ))}
        </div>
        {dobErr&&<p style={{color:"#ef4444",fontSize:12,marginBottom:"0.75rem",textAlign:"center"}}>{dobErr}</p>}
        <button onClick={verifyAge} className="primary-btn" style={{width:"100%",marginTop:"0.5rem"}}>Bestätigen →</button>
      </Modal>}

      {modal==="auth"&&<AuthModal onClose={()=>{setModal(null);setPendingProduct(null);}} onSuccess={handleAuthSuccess} toast={toast}/>}

      {/* WISHLIST MODAL */}
      {modal==="wishlist"&&<Modal onClose={()=>setModal(null)}>
        <h2 style={{fontSize:20,fontWeight:900,color:"#fff",marginBottom:"1.5rem"}}>❤️ Wunschliste ({wishlist.length})</h2>
        {wishlist.length===0
          ?<div style={{textAlign:"center",color:"#374151",padding:"2rem 0"}}><div style={{fontSize:40}}>💨</div><p style={{marginTop:12,fontSize:13}}>Leer. Genau wie deine Ambitionen.</p></div>
          :wishlist.map(p=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"0.75rem 0",borderBottom:"1px solid #111318"}}>
              <div style={{width:36,height:36,borderRadius:8,background:`${p.color}22`,border:`1px solid ${p.color}44`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{width:14,height:14,borderRadius:"50%",background:p.color}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#e5e7eb"}}>{p.name}</div>
                <div style={{fontSize:11,color:"#4b5563"}}>{p.brand} · €{Number(p.price).toFixed(2)}</div>
              </div>
              <button onClick={()=>{handleBuy(p);setModal(null);}} style={{background:`${p.color}22`,border:`1px solid ${p.color}44`,color:p.color,padding:"6px 12px",borderRadius:7,fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>+ Warenkorb</button>
              <button onClick={()=>toggleWishlist(p)} style={{background:"none",border:"none",color:"#374151",cursor:"pointer",fontSize:16}}>×</button>
            </div>
          ))
        }
      </Modal>}

      {/* CART MODAL */}
      {modal==="cart"&&<Modal onClose={()=>setModal(null)}>
        <h2 style={{fontSize:20,fontWeight:900,color:"#fff",marginBottom:"1.5rem"}}>🛒 Warenkorb ({cartCount})</h2>
        {cart.length===0
          ?<div style={{textAlign:"center",color:"#374151",padding:"2rem 0"}}><div style={{fontSize:40}}>📭</div><p style={{marginTop:12,fontSize:13}}>Leer. Wie du ohne Snus.</p></div>
          :<>
            {cart.map(item=>(
              <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"0.8rem 0",borderBottom:"1px solid #111318"}}>
                <div style={{width:36,height:36,borderRadius:8,background:`${item.color}22`,border:`1px solid ${item.color}44`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{width:14,height:14,borderRadius:"50%",background:item.color}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#e5e7eb"}}>{item.name}</div>
                  <div style={{fontSize:11,color:"#4b5563"}}>{item.brand} · {item.mg}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <button onClick={()=>setCart(c=>c.map(x=>x.id===item.id?{...x,qty:Math.max(1,x.qty-1)}:x))} style={{width:24,height:24,background:"#1a1c22",border:"none",color:"#fff",borderRadius:5,cursor:"pointer"}}>−</button>
                  <span style={{fontSize:12,fontFamily:"monospace",minWidth:16,textAlign:"center",color:"#fff"}}>{item.qty}</span>
                  <button onClick={()=>setCart(c=>c.map(x=>x.id===item.id?{...x,qty:x.qty+1}:x))} style={{width:24,height:24,background:"#1a1c22",border:"none",color:"#fff",borderRadius:5,cursor:"pointer"}}>+</button>
                </div>
                <span style={{fontSize:13,fontFamily:"monospace",color:"#4ade80",minWidth:52,textAlign:"right"}}>€{(item.price*item.qty).toFixed(2)}</span>
                <button onClick={()=>setCart(c=>c.filter(x=>x.id!==item.id))} style={{background:"none",border:"none",color:"#374151",cursor:"pointer",fontSize:16}}>×</button>
              </div>
            ))}

            {/* UNLOCKED REWARDS IN CART */}
            {unlockedRewards.length>0&&(
              <div style={{margin:"1rem 0",display:"flex",flexDirection:"column",gap:6}}>
                {unlockedRewards.map(r=>(
                  <div key={r.id} style={{background:"#16a34a18",border:"1px solid #16a34a44",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:8,animation:"fadeUp 0.3s ease"}}>
                    <span style={{fontSize:18}}>{r.icon}</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:800,color:"#4ade80"}}>{r.label} freigeschaltet!</div>
                      <div style={{fontSize:11,color:"#16a34a"}}>{r.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* NEXT REWARD PROGRESS */}
            {nextReward&&(
              <div style={{margin:"0.75rem 0",background:"#111318",border:"1px solid #1e2028",borderRadius:8,padding:"10px 12px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:11,color:"#6b7280"}}>{nextReward.icon} Noch €{Math.max(0,nextReward.threshold-cartTotal+0.01).toFixed(2)} bis {nextReward.label}</span>
                  <span style={{fontSize:11,color:"#4ade80",fontFamily:"monospace"}}>{Math.round((cartTotal/nextReward.threshold)*100)}%</span>
                </div>
                <div style={{height:4,background:"#1a1c22",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(100,(cartTotal/nextReward.threshold)*100)}%`,background:"linear-gradient(90deg,#4ade80,#22c55e)",borderRadius:2,transition:"width 0.4s ease"}}/>
                </div>
              </div>
            )}

            {/* TOTALS */}
            <div style={{marginTop:"0.75rem",display:"flex",flexDirection:"column",gap:4}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#6b7280"}}>
                <span>Produkte</span>
                <span style={{fontFamily:"monospace"}}>€{cartTotal.toFixed(2)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                <span style={{color:shippingFree?"#4ade80":"#6b7280"}}>Versand</span>
                <span style={{fontFamily:"monospace",color:shippingFree?"#4ade80":"#9ca3af"}}>{shippingFree?"GRATIS 🚚":`€${SHIPPING_COST.toFixed(2)}`}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",paddingTop:8,borderTop:"1px solid #1e2028",marginTop:4}}>
                <span style={{color:"#6b7280"}}>Gesamt</span>
                <span style={{fontSize:22,fontWeight:900,color:"#4ade80",fontFamily:"monospace"}}>€{orderTotal.toFixed(2)}</span>
              </div>
            </div>

            <button className="primary-btn" style={{width:"100%",marginTop:"1rem",opacity:placingOrder?0.6:1}} onClick={session?handleCheckout:()=>setModal("auth")} disabled={placingOrder}>
              {placingOrder?"Wird bearbeitet...":session?"Jetzt bestellen →":"Login zum Bestellen →"}
            </button>
          </>
        }
      </Modal>}

      {/* ORDERS MODAL */}
      {modal==="orders"&&<Modal onClose={()=>setModal(null)}>
        <h2 style={{fontSize:20,fontWeight:900,color:"#fff",marginBottom:"1.5rem"}}>📦 Meine Bestellungen</h2>
        {orders.length===0
          ?<div style={{textAlign:"center",color:"#374151",padding:"2rem 0"}}><div style={{fontSize:40}}>🕸️</div><p style={{marginTop:12,fontSize:13}}>Keine Bestellungen. Schäm dich.</p></div>
          :orders.map(o=>(
            <div key={o.id} style={{background:"#111318",border:"1px solid #1e2028",borderRadius:10,padding:"1rem",marginBottom:"0.75rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:11,fontFamily:"monospace",color:"#6b7280"}}>#{o.id.slice(0,8).toUpperCase()}</span>
                <span style={{fontSize:10,fontWeight:800,letterSpacing:1,padding:"2px 8px",borderRadius:4,background:`${STATUS_COLOR[o.status]}22`,color:STATUS_COLOR[o.status]}}>{o.status.toUpperCase()}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                <span style={{fontSize:12,color:"#4b5563"}}>{new Date(o.created_at).toLocaleDateString("de-AT")}</span>
                <span style={{fontSize:14,fontWeight:800,color:"#f9fafb",fontFamily:"monospace"}}>€{Number(o.total).toFixed(2)}</span>
              </div>
            </div>
          ))
        }
      </Modal>}

      {/* TOASTS */}
      <div style={{position:"fixed",bottom:24,right:24,zIndex:999,display:"flex",flexDirection:"column",gap:8}}>
        {toasts.map(t=>(
          <div key={t.id} className="toast" style={{background:"#111318",border:`1px solid ${t.type==="err"?"#7f1d1d":"#1e2028"}`,borderRadius:10,padding:"11px 16px",fontSize:13,color:"#e5e7eb",maxWidth:300,boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
function AdminDashboard({session,onBack,sb,products}){
  const[orders,setOrders]=useState([]);
  const[loading,setLoading]=useState(true);
  const[expandedOrder,setExpandedOrder]=useState(null);
  const[orderItems,setOrderItems]=useState({});
  const[tab,setTab]=useState("orders");
  const loaded=useRef(false);

  useEffect(()=>{
    if(loaded.current)return;
    loaded.current=true;
    sb.adminGetOrders(session.token).then(d=>{setOrders(Array.isArray(d)?d:[]);setLoading(false);});
  },[]);

  const toggleOrder=async(oid)=>{
    if(expandedOrder===oid){setExpandedOrder(null);return;}
    setExpandedOrder(oid);
    if(!orderItems[oid]){const items=await sb.adminGetOrderItems(session.token,oid);setOrderItems(p=>({...p,[oid]:Array.isArray(items)?items:[]}));}
  };

  const totalRevenue=orders.reduce((s,o)=>s+Number(o.total),0);
  const statusCounts=orders.reduce((acc,o)=>{acc[o.status]=(acc[o.status]||0)+1;return acc;},{});

  return(
    <div style={{minHeight:"100vh",background:"#06070a",color:"#d1d5db",fontFamily:"'DM Sans','Helvetica Neue',sans-serif"}}>
      <GlobalStyles/>
      <nav style={{background:"rgba(6,7,10,0.95)",backdropFilter:"blur(20px)",borderBottom:"1px solid #f59e0b33",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 2rem",height:60,position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={onBack} style={{background:"none",border:"1px solid #1e2028",color:"#6b7280",padding:"6px 12px",borderRadius:7,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>← Shop</button>
          <span style={{fontSize:18,fontWeight:900,color:"#fff",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2}}>ADMIN</span>
          <span style={{background:"#f59e0b22",color:"#f59e0b",border:"1px solid #f59e0b44",fontSize:9,fontWeight:800,letterSpacing:2,padding:"2px 7px",borderRadius:4}}>SNØVAULT</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          {[["orders","📋 Bestellungen"],["products","📦 Produkte"],["stats","📊 Stats"]].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${tab===k?"#f59e0b44":"#1e2028"}`,background:tab===k?"#f59e0b18":"transparent",color:tab===k?"#f59e0b":"#6b7280",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit",transition:"all 0.15s"}}>{l}</button>
          ))}
        </div>
      </nav>
      <div style={{maxWidth:1100,margin:"0 auto",padding:"2rem"}}>
        {tab==="stats"&&(
          <div style={{animation:"fadeUp 0.4s ease"}}>
            <h2 style={{fontSize:28,fontWeight:900,color:"#fff",marginBottom:"2rem",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>ÜBERSICHT</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:"1rem",marginBottom:"2rem"}}>
              {[{label:"Gesamtumsatz",value:`€${totalRevenue.toFixed(2)}`,color:"#4ade80",icon:"💰"},{label:"Bestellungen",value:orders.length,color:"#60a5fa",icon:"📋"},{label:"Produkte",value:products.length,color:"#f59e0b",icon:"📦"},{label:"Ausstehend",value:statusCounts.pending||0,color:"#f97316",icon:"⏳"}].map(s=>(
                <div key={s.label} style={{background:"#0e0f14",border:`1px solid ${s.color}33`,borderRadius:14,padding:"1.5rem",position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${s.color},transparent)`}}/>
                  <div style={{fontSize:28,marginBottom:8}}>{s.icon}</div>
                  <div style={{fontSize:30,fontWeight:900,color:s.color,fontFamily:"monospace",lineHeight:1}}>{s.value}</div>
                  <div style={{fontSize:12,color:"#4b5563",marginTop:4}}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{background:"#0e0f14",border:"1px solid #1e2028",borderRadius:14,padding:"1.5rem"}}>
              <h3 style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:"1rem"}}>Status-Verteilung</h3>
              {Object.entries(STATUS_COLOR).map(([status,color])=>{
                const count=statusCounts[status]||0;
                const pct=orders.length?(count/orders.length)*100:0;
                return(<div key={status} style={{marginBottom:"0.75rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:12,color,fontWeight:700}}>{status.toUpperCase()}</span>
                    <span style={{fontSize:12,fontFamily:"monospace",color:"#6b7280"}}>{count}</span>
                  </div>
                  <div style={{height:6,background:"#1a1c22",borderRadius:3,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,transition:"width 0.5s ease"}}/>
                  </div>
                </div>);
              })}
            </div>
          </div>
        )}
        {tab==="orders"&&(
          <div style={{animation:"fadeUp 0.4s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
              <h2 style={{fontSize:28,fontWeight:900,color:"#fff",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>BESTELLUNGEN</h2>
              <span style={{fontSize:12,color:"#4b5563",fontFamily:"monospace"}}>{orders.length} total · €{totalRevenue.toFixed(2)}</span>
            </div>
            {loading?<div style={{textAlign:"center",color:"#374151",padding:"4rem"}}>Lädt...</div>
              :orders.length===0?<div style={{textAlign:"center",color:"#374151",padding:"4rem"}}><div style={{fontSize:48}}>📭</div><p style={{marginTop:12}}>Keine Bestellungen. Noch.</p></div>
              :orders.map(o=>(
                <div key={o.id} style={{background:"#0e0f14",border:"1px solid #1e2028",borderRadius:12,marginBottom:"0.75rem",overflow:"hidden"}}>
                  <div onClick={()=>toggleOrder(o.id)} style={{display:"flex",alignItems:"center",gap:"1rem",padding:"1rem 1.25rem",cursor:"pointer"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <span style={{fontSize:12,fontFamily:"monospace",color:"#6b7280",fontWeight:700}}>#{o.id.slice(0,8).toUpperCase()}</span>
                        <span style={{fontSize:10,fontWeight:800,letterSpacing:1,padding:"2px 8px",borderRadius:4,background:`${STATUS_COLOR[o.status]}22`,color:STATUS_COLOR[o.status]}}>{o.status.toUpperCase()}</span>
                      </div>
                      <div style={{fontSize:11,color:"#374151",marginTop:3}}>{new Date(o.created_at).toLocaleString("de-AT")}</div>
                    </div>
                    <span style={{fontSize:18,fontWeight:900,color:"#f9fafb",fontFamily:"monospace"}}>€{Number(o.total).toFixed(2)}</span>
                    <span style={{color:"#374151",fontSize:12,transition:"transform 0.2s",display:"inline-block",transform:expandedOrder===o.id?"rotate(90deg)":"none"}}>▶</span>
                  </div>
                  {expandedOrder===o.id&&(
                    <div style={{borderTop:"1px solid #1a1c22",padding:"1rem 1.25rem",background:"#0a0b0e"}}>
                      {!orderItems[o.id]?<p style={{fontSize:12,color:"#374151"}}>Lädt...</p>
                        :orderItems[o.id].length===0?<p style={{fontSize:12,color:"#374151"}}>Keine Produkte.</p>
                        :orderItems[o.id].map(item=>(
                          <div key={item.id} style={{display:"flex",alignItems:"center",gap:12,padding:"0.5rem 0",borderBottom:"1px solid #111318"}}>
                            <div style={{width:32,height:32,borderRadius:6,background:`${item.products?.color||"#333"}22`,border:`1px solid ${item.products?.color||"#333"}44`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <div style={{width:12,height:12,borderRadius:"50%",background:item.products?.color||"#333"}}/>
                            </div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:13,fontWeight:700,color:"#e5e7eb"}}>{item.products?.name||"Unbekannt"}</div>
                              <div style={{fontSize:11,color:"#4b5563"}}>{item.products?.brand} · {item.qty}x · €{Number(item.price_at_purchase).toFixed(2)}/Stk</div>
                            </div>
                            <span style={{fontSize:13,fontFamily:"monospace",color:"#4ade80"}}>€{(item.qty*item.price_at_purchase).toFixed(2)}</span>
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
        {tab==="products"&&(
          <div style={{animation:"fadeUp 0.4s ease"}}>
            <h2 style={{fontSize:28,fontWeight:900,color:"#fff",marginBottom:"1.5rem",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>PRODUKTE ({products.length})</h2>
            <div style={{background:"#0e0f14",border:"1px solid #1e2028",borderRadius:12,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{borderBottom:"1px solid #1e2028"}}>
                  {["Produkt","Brand","Stärke","Geschmack","Preis","Portionen"].map(h=>(
                    <th key={h} style={{padding:"12px 16px",textAlign:"left",fontSize:10,color:"#4b5563",fontWeight:800,letterSpacing:2,fontFamily:"monospace"}}>{h.toUpperCase()}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {products.map((p,i)=>(
                    <tr key={p.id} style={{borderBottom:"1px solid #111318",background:i%2===0?"transparent":"#0a0b0e"}}>
                      <td style={{padding:"10px 16px"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:26,height:26,borderRadius:6,background:`${p.color}22`,border:`1px solid ${p.color}44`,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:10,height:10,borderRadius:"50%",background:p.color}}/></div><span style={{fontSize:13,fontWeight:700,color:"#e5e7eb"}}>{p.name}</span></div></td>
                      <td style={{padding:"10px 16px",fontSize:12,color:"#6b7280"}}>{p.brand}</td>
                      <td style={{padding:"10px 16px"}}><div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(s=><div key={s} style={{width:6,height:6,borderRadius:"50%",background:s<=p.strength?STRENGTH_COLOR[p.strength]:"#1a1c22"}}/>)}</div></td>
                      <td style={{padding:"10px 16px",fontSize:12,color:"#6b7280"}}>{p.flavor}</td>
                      <td style={{padding:"10px 16px",fontSize:13,fontFamily:"monospace",color:"#4ade80",fontWeight:700}}>€{Number(p.price).toFixed(2)}</td>
                      <td style={{padding:"10px 16px",fontSize:12,color:"#6b7280"}}>{p.portions}</td>
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

function AuthModal({onClose,onSuccess,toast}){
  const[tab,setTab]=useState("login");
  const[email,setEmail]=useState("");
  const[pass,setPass]=useState("");
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const[magicSent,setMagicSent]=useState(false);
  const handle=async()=>{
    if(!email){setErr("Email, Champ.");return;}
    setLoading(true);setErr("");
    try{
      if(tab==="magic"){await sb.signInMagic(email);setMagicSent(true);}
      else if(tab==="login"){const d=await sb.signIn(email,pass);if(!d.access_token){setErr(d.error_description||"Falsches Login. 🤡");}else onSuccess(d);}
      else{const d=await sb.signUp(email,pass);if(d.error){setErr(d.msg||"Fehler.");}else{toast("📧 Bestätigungsmail gesendet!");onClose();}}
    }catch(e){setErr("Netzwerkfehler. Auch das noch.");}
    setLoading(false);
  };
  return(<Modal onClose={onClose}>
    <div style={{textAlign:"center",marginBottom:"1.75rem"}}><div style={{fontSize:40,marginBottom:"0.5rem"}}>🔑</div><h2 style={{fontSize:22,fontWeight:900,color:"#fff"}}>Konto</h2></div>
    <div style={{display:"flex",background:"#080a0d",borderRadius:10,padding:4,marginBottom:"1.25rem",gap:4}}>
      {[["login","Login"],["register","Register"],["magic","Magic Link"]].map(([k,l])=>(
        <button key={k} onClick={()=>{setTab(k);setErr("");setMagicSent(false);}} style={{flex:1,padding:"8px 4px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,transition:"all 0.15s",background:tab===k?"#1e2028":"transparent",color:tab===k?"#f9fafb":"#4b5563",fontFamily:"inherit"}}>{l}</button>
      ))}
    </div>
    {magicSent?<div style={{textAlign:"center",padding:"1.5rem 0"}}><div style={{fontSize:40,marginBottom:"0.75rem"}}>📬</div><p style={{color:"#4ade80",fontWeight:700}}>Magic Link gesendet!</p><p style={{fontSize:12,color:"#4b5563",marginTop:6}}>Check dein Postfach. Und Spam.</p></div>
      :<div style={{display:"flex",flexDirection:"column",gap:"0.75rem"}}>
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} className="modal-input" type="email"/>
        {tab!=="magic"&&<input placeholder="Passwort" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} className="modal-input" type="password"/>}
        {err&&<p style={{color:"#ef4444",fontSize:12,textAlign:"center"}}>{err}</p>}
        <button onClick={handle} className="primary-btn" disabled={loading} style={{opacity:loading?0.6:1}}>{loading?"...":tab==="login"?"Einloggen →":tab==="register"?"Registrieren →":"Magic Link →"}</button>
      </div>
    }
  </Modal>);
}

function ProductCard({product:p,index,onBuy,loggedIn,wishlisted,onWishlist}){
  const[hovered,setHovered]=useState(false);
  const[added,setAdded]=useState(false);
  const handleBuy=()=>{
    onBuy(p);
    if(loggedIn){setAdded(true);setTimeout(()=>setAdded(false),600);}
  };
  return(
    <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{background:hovered?"#0e1014":"#0b0c0f",border:`1px solid ${hovered?p.color+"55":"#1a1c22"}`,borderRadius:14,padding:"1.25rem",transition:"transform 0.25s, box-shadow 0.25s, border-color 0.25s, background 0.25s",transform:hovered?"translateY(-4px)":"none",boxShadow:hovered?`0 20px 50px rgba(0,0,0,0.5),0 0 30px ${p.color}18`:"none",animationDelay:`${Math.min(index,20)*0.04}s`,animation:"fadeUp 0.5s ease both",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${p.color},transparent)`,opacity:hovered?1:0.3,transition:"opacity 0.25s"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1rem"}}>
        <div style={{width:48,height:48,borderRadius:10,background:`${p.color}18`,border:`1px solid ${p.color}33`,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{width:22,height:22,borderRadius:"50%",background:p.color,boxShadow:`0 0 12px ${p.color}88`,transition:"transform 0.3s",transform:hovered?"scale(1.15)":"scale(1)"}}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
          <button onClick={e=>{e.stopPropagation();onWishlist(p);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,opacity:wishlisted?1:0.25,transition:"all 0.2s",transform:wishlisted?"scale(1.2)":"scale(1)"}} title={wishlisted?"Entfernen":"Wunschliste"}>❤️</button>
          <div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(s=><div key={s} style={{width:5,height:5,borderRadius:"50%",background:s<=p.strength?STRENGTH_COLOR[p.strength]:"#1a1c22",transition:"background 0.2s"}}/>)}</div>
        </div>
      </div>
      <div style={{fontSize:9,color:"#374151",letterSpacing:2,fontFamily:"monospace",marginBottom:3}}>{p.brand.toUpperCase()}</div>
      <h3 style={{fontSize:15,fontWeight:800,color:"#f9fafb",marginBottom:3,lineHeight:1.2}}>{p.name}</h3>
      <p style={{fontSize:11,color:"#4b5563",marginBottom:"0.9rem"}}>{p.flavor} · {p.mg} · {p.portions} Portionen</p>
      <div style={{display:"flex",gap:5,marginBottom:"1rem"}}>
        <span style={{background:`${STRENGTH_COLOR[p.strength]}18`,color:STRENGTH_COLOR[p.strength],border:`1px solid ${STRENGTH_COLOR[p.strength]}33`,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:4}}>{STRENGTH_LABEL[p.strength]}</span>
        <span style={{background:"#1a1c22",color:"#6b7280",fontSize:9,padding:"2px 7px",borderRadius:4}}>{p.weight}</span>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:20,fontWeight:900,color:"#f9fafb",fontFamily:"monospace"}}>€{Number(p.price).toFixed(2)}</span>
        <button onClick={handleBuy} style={{background:added?"#22c55e":loggedIn?p.color:"transparent",border:`1px solid ${added?"#22c55e":p.color}`,color:added?"#000":loggedIn?"#000":p.color,padding:"8px 14px",borderRadius:8,fontSize:11,fontWeight:800,cursor:"pointer",transition:"all 0.2s",transform:added?"scale(0.95)":"scale(1)"}}>
          {added?"✓ Drin!":loggedIn?"+ Warenkorb":"🔒 Kaufen"}
        </button>
      </div>
    </div>
  );
}

function SkeletonCard(){
  return(<div style={{background:"#0b0c0f",border:"1px solid #1a1c22",borderRadius:14,padding:"1.25rem"}}>
    {[48,10,14,11,22].map((h,i)=><div key={i} style={{height:h,background:"linear-gradient(90deg,#111318 25%,#1a1c22 50%,#111318 75%)",backgroundSize:"200% 100%",borderRadius:8,marginBottom:10,animation:"shimmer 1.5s infinite",width:i===1?"40%":i===2?"65%":i===3?"45%":"100%"}}/>)}
  </div>);
}

function Modal({children,onClose}){
  return(<div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
    <div onClick={onClose} style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)"}}/>
    <div style={{position:"relative",background:"#0e1014",border:"1px solid #1e2028",borderRadius:18,padding:"2.5rem 2rem",width:"100%",maxWidth:440,boxShadow:"0 40px 100px rgba(0,0,0,0.7)",animation:"popIn 0.3s ease",maxHeight:"90vh",overflowY:"auto"}}>
      <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:"#374151",cursor:"pointer",fontSize:18}}>✕</button>
      {children}
    </div>
  </div>);
}

function GlobalStyles(){
  return(<style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    ::-webkit-scrollbar{width:5px;background:#08090c;}
    ::-webkit-scrollbar-thumb{background:#1a1c22;border-radius:3px;}
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes popIn{0%{opacity:0;transform:scale(0.92)}100%{opacity:1;transform:scale(1)}}
    @keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    @keyframes rewardPop{0%{opacity:0;transform:translateX(-50%) scale(0.7) translateY(-20px)}70%{transform:translateX(-50%) scale(1.05) translateY(4px)}100%{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}
    @keyframes spin{from{transform:rotate(-20deg) scale(0.8)}to{transform:rotate(0deg) scale(1)}}
    .toast{animation:toastIn 0.3s ease both;}
    .nav-btn{background:transparent;border:1px solid #1e2028;color:#9ca3af;padding:7px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.15s;font-family:inherit;}
    .nav-btn:hover{border-color:#4ade80;color:#4ade80;}
    .cart-btn{background:#111318;border:1px solid #1e2028;color:#9ca3af;padding:8px 12px;border-radius:8px;cursor:pointer;font-size:15px;position:relative;transition:all 0.15s;font-family:inherit;font-weight:700;}
    .cart-btn:hover{border-color:#4ade80;}
    .cart-badge{position:absolute;top:-8px;right:-8px;background:#4ade80;color:#000;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;}
    .modal-input{width:100%;background:#080a0d;border:1px solid #1e2028;border-radius:9px;padding:12px 14px;color:#e5e7eb;font-size:14px;font-family:inherit;transition:border-color 0.15s;}
    .modal-input:focus{outline:none;border-color:#4ade80;}
    .modal-input::placeholder{color:#374151;}
    .primary-btn{background:#4ade80;color:#000;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;transition:all 0.15s;}
    .primary-btn:hover:not(:disabled){background:#86efac;transform:translateY(-1px);}
    .primary-btn:disabled{cursor:not-allowed;}
    select option{background:#111318;color:#e5e7eb;}
  `}</style>);
}