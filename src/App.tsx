import React, { useMemo, useState } from 'react';
import {
  MessageCircle, Phone, Users, Sparkles, Compass, Search, Plus, MoreHorizontal,
  Video, Send, Paperclip, Mic, Smile, ArrowLeft, CheckCheck, Image, FileText,
  CalendarDays, Globe2, ShieldCheck, Settings, Bell, Moon, Sun, ChevronRight,
  CircleHelp, MapPin, Radio, X, Hash, Heart, Zap, LockKeyhole, Languages
} from 'lucide-react';

type Tab = 'chat' | 'calls' | 'spaces' | 'activity' | 'profile';
type Chat = { id:number; name:string; initials:string; color:string; preview:string; time:string; unread:number; online:boolean; pinned?:boolean; };
const initialChats:Chat[] = [
  {id:1,name:'Sofia Rossi',initials:'SR',color:'violet',preview:'Hai visto le foto del weekend? ✨',time:'09:41',unread:2,online:true,pinned:true},
  {id:2,name:'Gruppo Viaggio',initials:'GV',color:'blue',preview:'Marco: ho trovato un hotel fantastico',time:'09:32',unread:5,online:false},
  {id:3,name:'Mamma ❤️',initials:'MA',color:'coral',preview:'Ti ho mandato una posizione',time:'08:56',unread:0,online:true},
  {id:4,name:'Lavoro Team',initials:'LT',color:'mint',preview:'Elena: riunione spostata alle 11',time:'Ieri',unread:0,online:false},
  {id:5,name:'Andrea Bianchi',initials:'AB',color:'gold',preview:'🎙 Messaggio vocale (0:18)',time:'Ieri',unread:0,online:false},
  {id:6,name:'Eventi Roma',initials:'ER',color:'pink',preview:'Nuovo evento vicino a te',time:'Lun',unread:0,online:false}
];
const stories = [{name:'La tua storia',initials:'+',color:'add'},{name:'Sofia',initials:'SR',color:'violet'},{name:'Marco',initials:'MF',color:'blue'},{name:'Giulia',initials:'GR',color:'coral'},{name:'Viaggi',initials:'✦',color:'mint'},{name:'Luca',initials:'LB',color:'gold'}];

function Brand(){return <div className="brand"><span className="brand-symbol"><MessageCircle size={21}/><i/></span><span>CsC<span>Message</span></span></div>}
function Avatar({initials,color='blue',online=false,size='normal'}:{initials:string;color?:string;online?:boolean;size?:string}){return <div className={`avatar ${color} ${size}`}>{initials}{online&&<i className="online-dot"/>}</div>}

export default function App(){
 const [tab,setTab]=useState<Tab>('chat');
 const [chats,setChats]=useState(initialChats);
 const [selected,setSelected]=useState<number|null>(null);
 const [search,setSearch]=useState('');
 const [message,setMessage]=useState('');
 const [dark,setDark]=useState(true);
 const [showNew,setShowNew]=useState(false);
 const [showAi,setShowAi]=useState(false);
 const [aiPrompt,setAiPrompt]=useState('');
 const [aiAnswer,setAiAnswer]=useState('');
 const [notice,setNotice]=useState('');
 const active=chats.find(c=>c.id===selected);
 const [thread,setThread]=useState<Record<number,{from:'me'|'them';text:string;time:string}[]>>({
  1:[{from:'them',text:'Ehi! Hai visto le foto del weekend? ✨',time:'09:38'},{from:'me',text:'Sì, sono bellissime! Dobbiamo rifarlo presto.',time:'09:39'},{from:'them',text:'Assolutamente! Organizziamo qualcosa per il prossimo mese?',time:'09:41'}],
  2:[{from:'them',text:'Ho trovato un hotel fantastico vicino al mare!',time:'09:32'}]
 });
 const filtered=useMemo(()=>chats.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())||c.preview.toLowerCase().includes(search.toLowerCase())),[chats,search]);
 function send(){if(!message.trim()||!selected)return;setThread(t=>({...t,[selected]:[...(t[selected]||[]),{from:'me',text:message.trim(),time:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}]}));setChats(cs=>cs.map(c=>c.id===selected?{...c,preview:message.trim(),time:'Ora'}:c));setMessage('')}
 function toast(t:string){setNotice(t);window.setTimeout(()=>setNotice(''),2600)}
 function createChat(){const c:Chat={id:Date.now(),name:'Nuova conversazione',initials:'NC',color:'mint',preview:'Nessun messaggio',time:'Ora',unread:0,online:false};setChats([c,...chats]);setSelected(c.id);setShowNew(false);setTab('chat')}
 return <div className={`app-shell ${dark?'dark':'light'}`}>
  <aside className="sidebar">
   <Brand/><button className="compose-button" onClick={()=>setShowNew(true)}><Plus size={18}/> Nuova chat</button>
   <div className="side-label">WORKSPACE</div>
   <nav className="side-nav">
    <button className={tab==='chat'?'active':''} onClick={()=>{setTab('chat');setSelected(null)}}><MessageCircle/>Chat <b className="nav-count">7</b></button>
    <button className={tab==='calls'?'active':''} onClick={()=>setTab('calls')}><Phone/>Chiamate</button>
    <button className={tab==='spaces'?'active':''} onClick={()=>setTab('spaces')}><Users/>Spaces <span className="new-pill">NEW</span></button>
    <button className={tab==='activity'?'active':''} onClick={()=>setTab('activity')}><Compass/>Attività</button>
   </nav>
   <div className="side-label side-label-spaced">PERSONALE</div>
   <button className={tab==='profile'?'profile-nav active':'profile-nav'} onClick={()=>setTab('profile')}><Avatar initials="CR" color="violet"/><span><b>Carlo Rossi</b><small>Il tuo profilo</small></span><Settings size={16}/></button>
   <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={17}/><span><b>La tua privacy conta</b><small>Connessione protetta</small></span></div><button className="theme-toggle" onClick={()=>setDark(!dark)}>{dark?<Sun size={16}/>:<Moon size={16}/>} {dark?'Modalità chiara':'Modalità scura'}</button><small className="version">CsCMessage · Preview 0.1</small></div>
  </aside>
  <main className="main-area">
   <header className="topbar"><div className="mobile-brand"><Brand/></div><div className="breadcrumb"><span>Workspace</span><ChevronRight size={14}/><b>{tab==='chat'?'Messaggi':tab==='calls'?'Chiamate':tab==='spaces'?'Spaces':tab==='activity'?'Attività':'Profilo'}</b></div><div className="top-actions"><button className="icon-btn" aria-label="Aiuto" onClick={()=>toast('Centro assistenza in arrivo')}><CircleHelp/></button><button className="icon-btn notification" aria-label="Notifiche" onClick={()=>setTab('activity')}><Bell/><i/></button><Avatar initials="CR" color="violet"/></div></header>
   {tab==='chat'&&!selected&&<section className="inbox-page">
    <div className="welcome-row"><div><div className="eyebrow"><span className="pulse"/> IL TUO SPAZIO, LE TUE PERSONE</div><h1>Le connessioni<br/><em>contano.</em></h1><p>Tutto quello che conta, in una conversazione.</p></div><div className="date-chip"><span>VENERDÌ</span><b>30 OTT</b></div></div>
    <button className="ai-banner" onClick={()=>setShowAi(true)}><div className="ai-orb"><Sparkles size={25}/></div><div className="ai-copy"><span>IL TUO ASSISTENTE INTELLIGENTE</span><b>Le tue conversazioni, <em>in una nuova dimensione.</em></b><small>Riassumi, traduci e organizza. Solo quando lo chiedi tu.</small></div><span className="ai-cta">Apri CsC AI <ChevronRight size={16}/></span></button>
    <div className="section-head"><div><h2>Storie <span>•</span></h2><p>Momenti condivisi dalle tue persone</p></div><button className="text-action" onClick={()=>toast('Creazione storia in arrivo')}><Plus size={16}/> Aggiungi</button></div>
    <div className="stories">{stories.map((s,i)=><button className="story" key={s.name} onClick={()=>toast(i===0?'Crea la tua prima storia':'Storia di '+s.name)}><div className={`story-ring ${s.color}`}><Avatar initials={s.initials} color={s.color}/>{i===0&&<i className="story-plus">+</i>}</div><span>{s.name}</span></button>)}</div>
    <div className="section-head chats-heading"><div><h2>Messaggi <span className="live-tag">LIVE</span></h2><p>Le tue conversazioni recenti</p></div><button className="icon-btn search-mobile" onClick={()=>document.getElementById('chat-search')?.focus()}><Search/></button></div>
    <div className="search-box"><Search size={18}/><input id="chat-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca persone, messaggi o contenuti..."/><kbd>⌘ K</kbd></div>
    <div className="chat-list">{filtered.map(c=><button className="chat-row" key={c.id} onClick={()=>setSelected(c.id)}><Avatar initials={c.initials} color={c.color} online={c.online}/><span className="chat-info"><b>{c.name}{c.pinned&&<span className="pin">PIN</span>}</b><small>{c.preview}</small></span><span className="chat-meta"><small>{c.time}</small>{c.unread>0&&<b className="unread">{c.unread}</b>}</span><ChevronRight className="row-arrow" size={16}/></button>)}{filtered.length===0&&<div className="empty-state">Nessuna conversazione trovata.</div>}</div>
   </section>}
   {tab==='chat'&&selected&&active&&<section className="conversation-page"><div className="conversation-head"><button className="back-btn" onClick={()=>setSelected(null)}><ArrowLeft/></button><Avatar initials={active.initials} color={active.color} online={active.online}/><div className="person-title"><b>{active.name}</b><small>{active.online?'Online adesso':'Ultimo accesso di recente'}</small></div><div className="conversation-actions"><button className="icon-btn" onClick={()=>toast('Chiamata audio: demo interfaccia')}><Phone/></button><button className="icon-btn" onClick={()=>toast('Videochiamata: demo interfaccia')}><Video/></button><button className="icon-btn" onClick={()=>toast('Dettagli conversazione')}><MoreHorizontal/></button></div></div><div className="message-area"><div className="day-divider"><span>OGGI</span></div>{(thread[selected]||[]).map((m,i)=><div className={`message-line ${m.from}`} key={i}><div className="bubble">{m.text}<small>{m.time} {m.from==='me'&&<CheckCheck size={13}/>}</small></div></div>)}</div><form className="composer" onSubmit={e=>{e.preventDefault();send()}}><button type="button" className="icon-btn" onClick={()=>toast('Allegati: foto, file e posizione')}><Paperclip/></button><input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Scrivi un messaggio..." aria-label="Scrivi un messaggio"/><button type="button" className="icon-btn" onClick={()=>toast('Messaggio vocale: demo interfaccia')}><Mic/></button><button className="send-btn" type="submit" aria-label="Invia messaggio"><Send size={18}/></button></form></section>}
   {tab==='calls'&&<section className="generic-page"><div className="eyebrow">SEMPRE VICINI</div><h1>Le tue <em>chiamate.</em></h1><p>Voce e video, senza perdere il filo.</p><div className="feature-grid"><article><div className="feature-icon blue"><Phone/></div><h3>Chiamate audio</h3><p>Parla con una persona o crea una chiamata di gruppo.</p><button onClick={()=>toast('La chiamata audio sarà disponibile con il backend WebRTC')}>Avvia chiamata <ChevronRight/></button></article><article><div className="feature-icon violet"><Video/></div><h3>Video HD</h3><p>Ritrova i tuoi amici faccia a faccia, ovunque siano.</p><button onClick={()=>toast('La videochiamata sarà disponibile con il backend WebRTC')}>Avvia video <ChevronRight/></button></article></div><h2>Recenti</h2>{['Sofia Rossi · Ieri, 18:42','Mamma ❤️ · Ieri, 12:10','Gruppo Viaggio · Lunedì, 09:30'].map(x=><div className="simple-row" key={x}><Phone size={17}/>{x}<span>↗</span></div>)}</section>}
   {tab==='spaces'&&<section className="generic-page"><div className="eyebrow">INSIEME, IN TEMPO REALE</div><h1>Entra nei tuoi <em>Spaces.</em></h1><p>Conversazioni che diventano esperienze condivise.</p><div className="space-card"><div className="space-visual"><div className="space-orbit"><Users size={34}/></div><span>SPAZIO CONDIVISO · 4 PERSONE</span></div><div className="space-body"><div><span className="live-tag">ATTIVO ORA</span><h3>Weekend a Barcellona</h3><p>Organizza il viaggio, vota le idee e condividi tutto in un unico spazio.</p></div><button className="primary-btn" onClick={()=>toast('Space demo: apertura stanza in arrivo')}>Apri Space <ChevronRight/></button></div><div className="space-tools"><span><CheckCheck/> Checklist condivisa</span><span><Users/> 4 partecipanti</span><span><CalendarDays/> 12–16 Aprile</span></div></div><button className="outline-btn" onClick={()=>toast('Creazione Space in arrivo')}><Plus/> Crea un nuovo Space</button></section>}
   {tab==='activity'&&<section className="generic-page"><div className="eyebrow">TUTTO SOTTO CONTROLLO</div><h1>La tua <em>attività.</em></h1><p>Aggiornamenti importanti, senza rumore.</p><div className="activity-card"><div className="activity-icon violet"><AtIcon/></div><div><b>Sofia ti ha menzionato</b><p>“Carlo, che ne pensi di questa idea?”</p><small>10 minuti fa · Gruppo Viaggio</small></div></div><div className="activity-card"><div className="activity-icon blue"><CalendarDays/></div><div><b>Promemoria in programma</b><p>Riunione con il team alle 11:00.</p><small>Oggi · Calendario</small></div></div><div className="activity-card"><div className="activity-icon mint"><Sparkles/></div><div><b>Il tuo riepilogo è pronto</b><p>Hai 3 conversazioni da riprendere.</p><small>Ieri · CsC AI</small></div></div></section>}
   {tab==='profile'&&<section className="generic-page"><div className="eyebrow">IL TUO MONDO DIGITALE</div><h1>Il tuo <em>profilo.</em></h1><div className="profile-card"><Avatar initials="CR" color="violet" size="large"/><div><h2>Carlo Rossi</h2><p>@carlo · Disponibile</p></div><button className="outline-btn" onClick={()=>toast('Modifica profilo in arrivo')}>Modifica</button></div><h2>Impostazioni</h2>{[{icon:LockKeyhole,title:'Privacy e sicurezza',desc:'Controlla chi può contattarti'},{icon:Bell,title:'Notifiche',desc:'Suoni, avvisi e priorità'},{icon:Globe2,title:'Lingua e traduzione',desc:'Italiano · Traduzione automatica'},{icon:Settings,title:'Preferenze',desc:'Aspetto e accessibilità'}].map(x=><button className="settings-row" key={x.title} onClick={()=>toast(x.title+' · impostazioni demo')}><x.icon/><span><b>{x.title}</b><small>{x.desc}</small></span><ChevronRight/></button>)}<button className="theme-toggle profile-theme" onClick={()=>setDark(!dark)}>{dark?<Sun/>:<Moon/>}{dark?'Passa alla modalità chiara':'Passa alla modalità scura'}</button></section>}
  </main>
  <nav className="mobile-bottom">{([{id:'chat',icon:MessageCircle,label:'Chat'},{id:'calls',icon:Phone,label:'Chiamate'},{id:'spaces',icon:Users,label:'Spaces'},{id:'activity',icon:Compass,label:'Attività'},{id:'profile',icon:Settings,label:'Profilo'}] as const).map(x=><button className={tab===x.id?'active':''} key={x.id} onClick={()=>{setTab(x.id);setSelected(null)}}><x.icon/><span>{x.label}</span></button>)}</nav>
  {showNew&&<div className="modal-backdrop" onClick={()=>setShowNew(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowNew(false)}><X/></button><div className="feature-icon blue"><Plus/></div><h2>Nuova conversazione</h2><p>Inizia a creare una nuova connessione.</p><input placeholder="Nome o username" aria-label="Nome o username"/><button className="primary-btn modal-action" onClick={createChat}>Crea conversazione <ChevronRight/></button></div></div>}
  {showAi&&<div className="modal-backdrop" onClick={()=>setShowAi(false)}><div className="modal ai-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowAi(false)}><X/></button><div className="ai-orb modal-orb"><Sparkles/></div><span className="eyebrow">CS C INTELLIGENCE</span><h2>Chiedi a <em>CsC AI.</em></h2><p>Un assistente che ti aiuta a riassumere, tradurre e organizzare. L'accesso alle conversazioni avviene solo su tua richiesta.</p><div className="ai-suggestions"><button onClick={()=>setAiPrompt('Riassumi le cose importanti da fare oggi')}>✦ Riassumi le cose importanti</button><button onClick={()=>setAiPrompt('Traduci questo messaggio in inglese')}>◎ Traduci un messaggio</button><button onClick={()=>setAiPrompt('Aiutami a organizzare un evento')}>⌁ Organizza un evento</button></div><form className="ai-form" onSubmit={e=>{e.preventDefault();setAiAnswer('Questa anteprima mostra il flusso di CsC AI. Il collegamento al modello e ai dati privati sarà implementato solo con consenso esplicito.')}}><input value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="Chiedi qualcosa a CsC AI..."/><button className="send-btn"><Send/></button></form>{aiAnswer&&<div className="ai-answer">{aiAnswer}</div>}<small className="demo-note">Anteprima locale · Nessun messaggio reale viene letto o inviato</small></div></div>}
  {notice&&<div className="toast"><Zap size={16}/>{notice}</div>}
 </div>
}
function AtIcon(){return <Hash size={20}/>}
