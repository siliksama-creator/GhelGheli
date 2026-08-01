import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import GamesHub from './games.jsx';
import Support from './support.jsx';
import Wallet from './wallet.jsx';
import'./style.css';
// AFTER style.css on purpose: style.css is a single minified line full of
// `font-weight:900` (and one 1000), which would otherwise win the cascade
// and force the browser to synthesise a smeared fake bold. Vazirmatn's
// heaviest real cut is 800. Enforced by tool/typography.mjs.
import'./typography.css';

const API=import.meta.env.VITE_API_BASE||'https://api.ghelghelishop.ir';
// Accent palette for the admin-pinned announcement (mirrors the server's
// PIN_ACCENTS and the Flutter pinAccents map).
const PIN_COLORS={gold:'#FFC53D',green:'#34D399',blue:'#60A5FA',red:'#F87171'};
const avatars=['avatar_1_football.png','avatar_2_trophy.png','avatar_3_star.png','avatar_4_rocket.png','avatar_5_lion.png','avatar_6_tiger.png','avatar_7_eagle.png','avatar_8_target.png','avatar_9_bolt.png','avatar_10_crown.png'];
const fa=n=>new Intl.NumberFormat('fa-IR').format(Number(n||0));
const asset=v=>!v?'':String(v).startsWith('http')?v:API+v;

async function req(path,method='GET',body,token){
  const r=await fetch(API+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const err=new Error(d.message||'خطا در ارتباط با سرور');err.status=r.status;throw err}
  return d;
}

function App(){
  const[token,setToken]=useState(localStorage.token||'');
  const[mode,setMode]=useState(location.hostname.startsWith('register.')?'register':'login');
  // The big hero logo belongs on the LOGIN screen only. Rendering it inside
  // the portal pushed every screen a full viewport down — the user had to
  // scroll past a 220px logo to reach their own dashboard on every tab.
  return (
    <div className={`page ${token ? 'signedIn' : ''}`}>
      {!token && (
        <div className="hero">
          <img src="/logo.png" alt="قلقلی" />
          <b>قلقلی</b>
        </div>
      )}
      {token
        ? <Portal token={token} logout={()=>{localStorage.removeItem('token');setToken('')}}/>
        : <Auth mode={mode} setMode={setMode} done={t=>{localStorage.token=t;setToken(t)}}/>}
    </div>
  );
}

function Auth({mode,setMode,done}){
  const[f,setF]=useState({mobile:'',password:'',nickname:'',currentPassword:''});const[msg,setMsg]=useState('');const[needsCurrentPassword,setNeedsCurrentPassword]=useState(false);
  async function submit(e){e.preventDefault();setMsg('');try{const d=mode==='register'?await req('/api/auth/register-password','POST',{mobile:f.mobile,password:f.password,nickname:f.nickname||undefined,profileAvatarKey:avatars[0],...(needsCurrentPassword?{currentPassword:f.currentPassword}:{})}):await req('/api/auth/login','POST',{mobile:f.mobile,password:f.password});done(d.token)}catch(x){setMsg(x.message);if(mode==='register'&&x.status===409)setNeedsCurrentPassword(true)}}
  return <form className="card auth" onSubmit={submit}><h2>{mode==='register'?'ثبت‌نام سریع':'ورود کاربر'}</h2><div className="tabs"><button type="button" className={mode==='login'?'on':''} onClick={()=>setMode('login')}>ورود</button><button type="button" className={mode==='register'?'on':''} onClick={()=>setMode('register')}>ثبت‌نام</button></div><input placeholder="شماره موبایل" value={f.mobile} onChange={e=>setF({...f,mobile:e.target.value})}/><input placeholder="رمز عبور" type="password" value={f.password} onChange={e=>setF({...f,password:e.target.value})}/>{mode==='register'&&<><input placeholder="نام مستعار اختیاری" value={f.nickname} onChange={e=>setF({...f,nickname:e.target.value})}/><p className="hint">ثبت‌نام سریع است؛ بعد از ورود از بخش پروفایل، اطلاعات کامل را وارد می‌کنی. چون پیامک هنوز فعال نیست، اگر قبلاً با این شماره ثبت‌نام کرده‌ای رمز فعلی را هم وارد کن.</p>{needsCurrentPassword&&<input placeholder="رمز فعلی این شماره" type="password" value={f.currentPassword} onChange={e=>setF({...f,currentPassword:e.target.value})}/>}</>}<button className="main">{mode==='register'?'ثبت‌نام سریع':'ورود'}</button>{msg&&<p className="msg">{msg}</p>}</form>;
}


function Portal({token,logout}){
  const [tab,setTab]=useState('home');
  const [p,setP]=useState(null);
  const [rewards,setRewards]=useState([]);
  const [msg,setMsg]=useState('');
  const [publicUser,setPublicUser]=useState(null);

  async function load(){
    const pr=await req('/api/profile','GET',null,token);
    setP(pr);
    setRewards(await req('/api/rewards','GET',null,token));
  }
  useEffect(()=>{load()},[]);

  // Auto-dismiss toasts; they used to stay on screen forever and pile up.
  useEffect(()=>{
    if(!msg) return;
    const t=setTimeout(()=>setMsg(''),4000);
    return ()=>clearTimeout(t);
  },[msg]);

  if(!p) return <div className="card loadingCard"><span className="spinner"/>در حال بارگذاری...</div>;

  const TABS=[
    ['home','خانه','🏠'],
    ['rewards','جوایز','🎁'],
    ['wallet','کیف پول','👛'],
    ['league','لیگ','🏆'],
    ['club','چت و بازی','🎮'],
    ['support','پشتیبانی','🎧'],
    ['profile','پروفایل','👤'],
  ];
  const u=p.user||{};

  return (
    <div className="portal">
      <header className="appBar">
        <img className="appLogo" src="/logo.png" alt="" />
        <div className="appWho">
          <b>{u.nickname||'کاربر'}</b>
          <span>{fa(u.current_points)} امتیاز</span>
        </div>
        <button className="iconBtn danger" onClick={logout} title="خروج">⏻</button>
      </header>

      <nav className="mobileNav">
        {TABS.map(x=>(
          <button key={x[0]} className={tab===x[0]?'on':''} onClick={()=>setTab(x[0])}>
            <span className="navIcon">{x[2]}</span>
            <span className="navLabel">{x[1]}</span>
          </button>
        ))}
      </nav>

      {msg && <div className="toast">{msg}</div>}

      <main className="tabPane" key={tab}>
        {tab==='home'    && <Home token={token} p={p} rewards={rewards} load={load} setMsg={setMsg} openWallet={()=>setTab('wallet')}/>}
        {tab==='profile' && <Profile token={token} p={p} load={load} setMsg={setMsg}/>}
        {tab==='rewards' && <Rewards rewards={rewards}/>}
        {tab==='wallet'  && <Wallet token={token} req={req} reloadProfile={load} setMsg={setMsg}/>}
        {tab==='league'  && <League token={token} openProfile={setPublicUser}/>}
        {tab==='club'    && <Club token={token} openProfile={setPublicUser}/>}
        {tab==='support' && <Support token={token} api={API} req={req} asset={asset}/>}
      </main>

      {publicUser && <PublicProfile token={token} userId={publicUser} close={()=>setPublicUser(null)}/>}
    </div>
  );
}

// Circular user avatar. Restored after it was accidentally dropped during the
// Portal refactor — its absence threw "Avatar is not defined" and blanked the
// entire logged-in area. Now also survives a broken/missing image URL.
function Avatar({u,size=72}){
  const fallback=`/avatars/${u?.profile_avatar_key||avatars[0]}`;
  const src=u?.profile_image_url?asset(u.profile_image_url):fallback;
  return <img className="avatar" style={{width:size,height:size}} src={src} alt=""
    onError={e=>{ if(e.currentTarget.src!==location.origin+fallback) e.currentTarget.src=fallback; }}/>;
}

function Home({token,p,rewards,load,setMsg,openWallet}){const[code,setCode]=useState('');const[bigCard,setBigCard]=useState(null);const u=p.user;const sorted=[...rewards].sort((a,b)=>a.required_points-b.required_points);let next=sorted.find(r=>u.current_points<r.required_points)||sorted.at(-1);const progress=next?Math.min(1,u.current_points/next.required_points):0;async function redeem(){try{const d=await req('/api/cards/redeem','POST',{code},token);setMsg(d.message);setCode('');load()}catch(e){setMsg(e.message)}}return <div className="grid"><section className="card heroCard"><Avatar u={u}/><h2>{u.nickname||u.mobile}</h2><h1>{fa(u.current_points)} امتیاز</h1><div className="bar"><span style={{width:(progress*100)+'%'}}/></div><p>{next?`تا جایزه ${next.name}: ${fa(Math.max(0,next.required_points-u.current_points))} امتیاز مانده`:'هنوز جایزه‌ای تعریف نشده'}</p><button className={`walletEntry${Number(u.wallet_balance)>0?' hasMoney':''}`} onClick={openWallet}><span className="weIcon">👛</span><span className="weBody"><small>کیف پول من</small><b>{fa(u.wallet_balance)} <i>تومان</i></b></span><span className="weCta">{Number(u.wallet_balance)>0?'برداشت':'مشاهده'} ‹</span></button><h2>ثبت کد کارت های قلقلی</h2><p className="hint">(پک کارت های قلقلی بصورت فیزیکی در فروشگاه ها و سوپرمارکت ها به فروش می رسند.)</p><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="کد کارت"/><button className="main" onClick={redeem}>ثبت کد</button></section><section className="card"><h2>موجودی کارت‌ها</h2>{(p.inventory||[]).length
      ? <div className="invGrid">{(p.inventory||[]).map(i=>
          <button className="invCard" key={i.id} onClick={()=>setBigCard(i)} title="نمایش بزرگ کارت">
            <span className="invArt"><img src={asset(i.image_url)||'/avatars/avatar_1_football.png'} alt={i.name||'کارت'}/></span>
            <b>{i.name}</b>
            <small>{fa(i.quantity)}× · {fa(i.point_value)} امتیاز</small>
          </button>)}</div>
      : <div className="empty">🃏 هنوز کارتی ثبت نکرده‌ای. کد پشت کارت را بالا وارد کن.</div>}</section>{bigCard&&<CardLightbox item={bigCard} close={()=>setBigCard(null)}/>}</div>}

// Full-size view of an inventory card: the thumbnail crops the player
// artwork the admin uploaded, so tapping opens it properly.
function CardLightbox({item,close}){
  return <div className="modalShade" onClick={close}>
    <div className="cardBig" onClick={e=>e.stopPropagation()}>
      <button className="close" onClick={close}>×</button>
      <img src={asset(item.image_url)||'/avatars/avatar_1_football.png'} alt={item.name||'کارت'}/>
      <h2>{item.name||'کارت'}</h2>
      <p>تعداد: {fa(item.quantity)} — {fa(item.point_value)} امتیاز</p>
      {item.description&&<p className="hint">{item.description}</p>}
    </div>
  </div>;
}
function Profile({token,p,load,setMsg}){const u=p.user;const[edit,setEdit]=useState({firstName:u.first_name||'',lastName:u.last_name||'',nickname:u.nickname||'',age:u.age||'',city:u.city||'',province:u.province||'',bankAccount:u.bank_account||'',profileAvatarKey:u.profile_avatar_key||avatars[0]});const[pw,setPw]=useState({currentPassword:'',newPassword:''});const[pwMsg,setPwMsg]=useState('');async function save(){try{await req('/api/profile','PATCH',edit,token);setMsg('پروفایل ذخیره شد');load()}catch(e){setMsg(e.message)}}async function changePassword(e){e.preventDefault();setPwMsg('');try{await req('/api/profile/change-password','POST',pw,token);setPwMsg('رمز عبور با موفقیت تغییر کرد');setPw({currentPassword:'',newPassword:''})}catch(e){setPwMsg(e.message)}}return <section className="card wide"><h2>تکمیل پروفایل خصوصی</h2><p className="hint">این اطلاعات فقط برای مدیر است. در چت فقط نام مستعار و عکس دیده می‌شود.</p><div className="avatars">{avatars.map(a=><img key={a} className={edit.profileAvatarKey===a?'sel':''} src={`/avatars/${a}`} onClick={()=>setEdit({...edit,profileAvatarKey:a})}/>)}</div><div className="formgrid">
      <Field label="نام" value={edit.firstName} onChange={v=>setEdit({...edit,firstName:v})}/>
      <Field label="نام خانوادگی" value={edit.lastName} onChange={v=>setEdit({...edit,lastName:v})}/>
      <Field label="نام مستعار عمومی" hint="این نام در چت و لیگ دیده می‌شود" value={edit.nickname} onChange={v=>setEdit({...edit,nickname:v})}/>
      <Field label="سن" type="number" inputMode="numeric" value={edit.age} onChange={v=>setEdit({...edit,age:v})}/>
      <Field label="استان" value={edit.province} onChange={v=>setEdit({...edit,province:v})}/>
      <Field label="شهر / محل زندگی" value={edit.city} onChange={v=>setEdit({...edit,city:v})}/>
      <Field label="شماره کارت بانکی / شبا" inputMode="numeric" value={edit.bankAccount} onChange={v=>setEdit({...edit,bankAccount:v})}/>
    </div><button className="main" onClick={save}>ذخیره پروفایل</button><hr className="divider"/><h2>تغییر رمز عبور</h2><p className="hint">چون فعلاً سامانه پیامک فعال نیست، بازیابی خودکار رمز در دسترس نیست؛ رمز را فقط از همینجا (با وارد کردن رمز فعلی) می‌توانید عوض کنید. اگر رمز را فراموش کرده‌اید، از پشتیبانی بخواهید رمز موقت برایتان تنظیم کند.</p><form className="formgrid" onSubmit={changePassword}>
      <Field label="رمز فعلی" type="password" value={pw.currentPassword} onChange={v=>setPw({...pw,currentPassword:v})}/>
      <Field label="رمز جدید" hint="حداقل ۶ کاراکتر" type="password" value={pw.newPassword} onChange={v=>setPw({...pw,newPassword:v})}/>
      <button className="main" type="submit">تغییر رمز عبور</button>
    </form>{pwMsg&&<p className="msg">{pwMsg}</p>}</section>}

// Labelled form field.
//
// Placeholders alone are not labels: they vanish the moment the field has a
// value, so a filled form becomes a column of anonymous boxes. This keeps the
// label visible at all times, matching the Flutter app's InputDecoration.
function Field({label,value,onChange,type='text',hint,inputMode}){
  return <label className="field">
    <span className="fieldLabel">{label}</span>
    <input type={type} inputMode={inputMode} value={value}
      placeholder={hint||label}
      onChange={e=>onChange(e.target.value)}/>
    {hint&&<small className="fieldHint">{hint}</small>}
  </label>;
}

function Rewards({rewards}){
  // An empty list used to render a bare heading over blank space, with no
  // explanation — the Flutter app has always shown a real empty state here.
  if(!rewards||!rewards.length) return <section className="card wide">
    <h2>جوایز</h2>
    <div className="empty">🎁 هنوز جایزه‌ای تعریف نشده است.</div>
  </section>;
  return <section className="card wide"><h2>جوایز</h2><div className="cards">{rewards.map(r=><div className="rewardCard" key={r.id}><img src={asset(r.image_url)||'/avatars/avatar_2_trophy.png'} alt={r.name||'جایزه'}/><b>{r.name}</b><p>{fa(r.required_points)} امتیاز</p>{r.reward_value&&<small>{r.reward_value}</small>}</div>)}</div></section>;
}
function League({token,openProfile}){
  const[d,setD]=useState(null);
  useEffect(()=>{req('/api/league/current','GET',null,token).then(setD)},[]);
  if(!d)return <div className="card leaguePage"><div className="skeleton"/>در حال بارگذاری لیگ...</div>;
  const entries=d.entries||[]; const season=d.season||{};
  const end=season.ends_at?new Date(season.ends_at):null;
  const days=end?Math.max(0,Math.ceil((end-Date.now())/86400000)):0;
  const top=entries.slice(0,3); const rest=entries.slice(3);
  return <section className="card wide leaguePage"><div className="sectionHead"><div><h2>لیگ ماهانه قلقلی</h2><p>رتبه‌بندی زنده کاربران تا پایان ماه؛ امتیاز لیگ آخر ماه ریست می‌شود، امتیاز کلی دست نمی‌خورد.</p></div><b className="countdown">{fa(days)} روز مانده</b></div><div className="podium">{top.map((e,i)=><div className={`podiumCard p${i+1}`} onClick={()=>openProfile(e.user_id)} key={e.user_id}><span className="medal">{['🥇','🥈','🥉'][i]}</span><b>{e.nickname||e.first_name||'کاربر'}</b><strong>{fa(e.points)} امتیاز</strong></div>)}</div><div className="leagueList">{rest.map((e,i)=><div className="row clickable leagueRow" key={e.user_id} onClick={()=>openProfile(e.user_id)}><b>#{fa(i+4)}</b><span>{e.nickname||e.first_name||'کاربر'}</span><strong>{fa(e.points)} امتیاز</strong></div>)}</div>{!entries.length&&<div className="empty">هنوز امتیازی در لیگ ثبت نشده است.</div>}</section>
}
// Chat and games are both social features; merging them behind one switcher
// frees a nav slot and keeps related things together.
function Club({token,openProfile}){
  const[sub,setSub]=useState('chat');
  return <div className="clubWrap">
    <div className="clubTabs">
      <button className={sub==='chat'?'on':''} onClick={()=>setSub('chat')}>💬 چت روم</button>
      <button className={sub==='games'?'on':''} onClick={()=>setSub('games')}>🎮 بازی‌ها</button>
    </div>
    {sub==='chat'
      ? <Chat token={token} openProfile={openProfile}/>
      : <GamesHub api={API} token={token} openProfile={openProfile}/>}
  </div>;
}

function Chat({token,openProfile}){
  const[messages,setMessages]=useState([]),[stickers,setStickers]=useState([]),[text,setText]=useState(''),[err,setErr]=useState(''),[reply,setReply]=useState(null),[canned,setCanned]=useState([]),[cannedOpen,setCannedOpen]=useState(false),[pinned,setPinned]=useState(null),[cooldown,setCooldown]=useState(0),[cdLeft,setCdLeft]=useState(0);
  const boxRef=useRef(null); const lastCount=useRef(0);
  const emojis=['😀','😍','🔥','⚽','🏆','👏','😂','😎','❤️','👍','🎉','💚','🥇','✨','🙌','😜'];
  async function load(){
    try{
      const cfg=await req('/api/chat/config','GET',null,token);
      setPinned(cfg.pinned||null);
      if(typeof cfg.messageCooldownSeconds==='number') setCooldown(cfg.messageCooldownSeconds);
      const msgs=await req('/api/chat/messages','GET',null,token);
      // Auto-scroll only when a NEW message arrives, and only if the reader is
      // already near the bottom — yanking the view while someone reads history
      // would be hostile.
      const grew=msgs.length>lastCount.current;
      lastCount.current=msgs.length;
      setMessages(msgs);
      setStickers(await req('/api/chat/stickers','GET',null,token));
      setCanned(await req('/api/chat/canned-messages','GET',null,token));
      setErr('');
      if(grew) scrollDown();
    }catch(e){setErr(e.message)}
  }
  function scrollDown(force){
    requestAnimationFrame(()=>{
      const el=boxRef.current; if(!el) return;
      const near=el.scrollHeight-el.scrollTop-el.clientHeight<260;
      if(force||near) el.scrollTo({top:el.scrollHeight,behavior:'smooth'});
    });
  }
  // Visible cooldown so the send button explains the wait instead of the
  // server silently rejecting the message.
  useEffect(()=>{
    if(cdLeft<=0) return;
    const t=setTimeout(()=>setCdLeft(c=>c-1),1000);
    return ()=>clearTimeout(t);
  },[cdLeft]);
  // Poll only while the tab is visible, and at a calmer cadence. The old
  // 3-second interval kept running on a hidden/background tab, hammering the
  // API and draining mobile battery for updates nobody could see.
  useEffect(()=>{
    load();
    let t=null;
    const start=()=>{ if(!t) t=setInterval(load,8000); };
    const stop=()=>{ if(t){ clearInterval(t); t=null; } };
    const onVis=()=>{ if(document.hidden) stop(); else { load(); start(); } };
    if(!document.hidden) start();
    document.addEventListener('visibilitychange',onVis);
    return ()=>{ stop(); document.removeEventListener('visibilitychange',onVis); };
  },[]);
  async function send(stickerId=null, msgText=text){
    if(cdLeft>0) return;
    try{
      if(!stickerId&&!msgText.trim())return;
      await req('/api/chat/messages','POST',{message:msgText,stickerId,replyTo:reply?.id},token);
      setText('');setReply(null);setCannedOpen(false);
      setCdLeft(cooldown);
      await load();
      scrollDown(true);   // always show our own message
    }catch(e){setErr(e.message)}
  }
  async function like(m){try{await req(`/api/chat/messages/${m.id}/like`,'POST',{},token);load()}catch(e){setErr(e.message)}}async function report(m){try{await req(`/api/chat/messages/${m.id}/report`,'POST',{},token);setErr('گزارش ثبت شد و برای مدیر ارسال می‌شود')}catch(e){setErr(e.message)}}
  return <section className="card wide chatPage"><div className="sectionHead"><div><h2>چت روم قلقلی</h2><p>با هواداران دیگر گفتگو کن ⚽</p></div><span className="liveBadge">زنده</span></div>{pinned&&pinned.active&&pinned.text&&<div className="pinnedBanner" style={{'--pin':PIN_COLORS[pinned.accent]||PIN_COLORS.gold}}><span className="pinIcon">📌</span><div><b>اعلان مدیریت</b><p>{pinned.text}</p></div></div>}{err&&<p className="msg">{err}</p>}{reply&&<div className="replybar">در پاسخ به {reply.nickname||'کاربر'}: {reply.message_text}<button onClick={()=>setReply(null)}>×</button></div>}<div className="stickerTray">{stickers.map(st=><button key={st.id} onClick={()=>send(st.id)} title={st.title}><img src={asset(st.image_url)}/></button>)}{!stickers.length&&<span className="hint">استیکری هنوز توسط مدیر اضافه نشده است.</span>}</div><div className="chatbox" ref={boxRef}>{messages.map(m=><div className="chatmsg" key={m.id}><img onClick={()=>openProfile(m.user_id)} src={m.profile_image_url?asset(m.profile_image_url):`/avatars/${m.profile_avatar_key||avatars[0]}`}/><div className="chatbody"><b onClick={()=>openProfile(m.user_id)} className="clickableText">{m.nickname||m.first_name||'کاربر'}</b>{m.reply_text&&<small className="reply">↩ {m.reply_nickname||'کاربر'}: {m.reply_text}</small>}{m.message_type==='sticker'&&m.sticker_url?<img className="stickerMsg" src={asset(m.sticker_url)}/>:<p>{m.message_text}</p>}<div className="chatActions"><button onClick={()=>setReply(m)}>ریپلای</button><button onClick={()=>like(m)}>❤ {fa(m.like_count)}</button><button onClick={()=>report(m)}>گزارش</button></div></div></div>)}</div><div className="sendDock">
  <button className="emojiBtn" onClick={() => setCannedOpen(!cannedOpen)}>💬 انتخاب پیام</button>
  {cannedOpen && <div className="cannedPopover">
    {canned.map((c, i) => <button key={i} onClick={() => { setText(c); setCannedOpen(false); }}>{c}</button>)}
  </div>}
  <input value={text} readOnly placeholder="یک پیام آماده انتخاب کنید..." onClick={() => setCannedOpen(true)} />
  <button className="main" disabled={cdLeft>0} onClick={() => send(null, text)}>
    {cdLeft>0 ? `${fa(cdLeft)} ثانیه` : 'ارسال'}
  </button>
</div></section>
}
function PublicProfile({token,userId,close}){const[u,setU]=useState(null),[err,setErr]=useState('');useEffect(()=>{req(`/api/users/${userId}/public`,'GET',null,token).then(setU).catch(e=>setErr(e.message))},[userId]);return <div className="modalShade" onClick={close}><div className="publicModal" onClick={e=>e.stopPropagation()}><button className="close" onClick={close}>×</button>{err&&<p className="msg">{err}</p>}{!u&&!err?<p>در حال بارگذاری...</p>:u&&<><div className="publicHead"><img src={u.profile_image_url?asset(u.profile_image_url):`/avatars/${u.profile_avatar_key||avatars[0]}`}/><div><h2>{u.nickname||'کاربر'}</h2><p>عضویت: {new Date(u.joined_at).toLocaleDateString('fa-IR')}</p><p>امتیاز کسب‌شده: {fa(u.lifetime_points)} | امتیاز فعلی: {fa(u.current_points)}</p></div></div><h3>کارت‌های ثبت‌شده</h3>{(!u.cards||!u.cards.length)&&<p className="hint">هنوز کارتی ثبت نکرده است.</p>}{(u.cards||[]).map(c=><div className="reward" key={c.card_type_id}><img src={asset(c.image_url)||'/avatars/avatar_1_football.png'}/><div><b>{c.name}</b><p>تعداد ثبت: {fa(c.registered_count)} — {fa(c.point_value)} امتیاز</p></div></div>)}<h3>جوایز دریافت‌شده</h3>{(!u.rewards||!u.rewards.length)&&<p className="hint">هنوز جایزه تاییدشده‌ای ندارد.</p>}{(u.rewards||[]).map((r,i)=><div className="reward" key={i}><img src={asset(r.image_url)||'/avatars/avatar_2_trophy.png'}/><div><b>{r.name}</b><p>{r.status}</p></div></div>)}</>}</div></div>}
createRoot(document.getElementById('root')).render(<App/>);
