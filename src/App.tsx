import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, SlidersHorizontal, Heart, Clock3, Users, ChefHat, Sparkles, ShoppingBasket,
  CalendarDays, Bookmark, ArrowRight, Plus, Minus, Check, ChevronDown, Flame, Leaf,
  MessageCircle, Send, X, Menu, Home, Compass, BookOpen, UserRound, Utensils, WandSparkles
} from 'lucide-react';

type Recipe = {
  id: number; title: string; subtitle: string; image: string; time: number; difficulty: string;
  category: string; rating: string; author: string; servings: number; tags: string[];
};

const recipes: Recipe[] = [
  { id: 1, title: 'Spaghetti cremosi al limone', subtitle: 'Freschi, profumati, irresistibilmente vellutati', image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1200&q=85', time: 20, difficulty: 'Facile', category: 'Primi', rating: '4.9', author: 'Giulia R.', servings: 2, tags: ['Vegetariano', 'Veloce'] },
  { id: 2, title: 'Bowl mediterranea', subtitle: 'Verdure di stagione, ceci croccanti e tahina', image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=85', time: 25, difficulty: 'Facile', category: 'Vegetariano', rating: '4.8', author: 'Marco F.', servings: 2, tags: ['Vegetariano', 'Healthy'] },
  { id: 3, title: 'Gnocchi al pomodoro arrosto', subtitle: 'Il comfort food della domenica, in ogni giorno', image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1200&q=85', time: 35, difficulty: 'Media', category: 'Primi', rating: '5.0', author: 'Elena C.', servings: 4, tags: ['Comfort food', 'Vegetariano'] },
  { id: 4, title: 'Salmone glassato al miele', subtitle: 'Crosta lucida, cuore tenero, erbe fresche', image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1200&q=85', time: 30, difficulty: 'Facile', category: 'Secondi', rating: '4.9', author: 'Luca P.', servings: 2, tags: ['Ricco di proteine'] },
  { id: 5, title: 'Pancake soffici ai frutti rossi', subtitle: 'Una colazione lenta che sa di weekend', image: 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=1200&q=85', time: 18, difficulty: 'Facile', category: 'Colazioni', rating: '4.8', author: 'Sara M.', servings: 3, tags: ['Colazione', 'Dolce'] },
  { id: 6, title: 'Tiramisù classico', subtitle: 'Crema setosa, caffè intenso, cacao amaro', image: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?auto=format&fit=crop&w=1200&q=85', time: 40, difficulty: 'Media', category: 'Dolci', rating: '5.0', author: 'Nonna Ada', servings: 6, tags: ['Tradizione', 'Da preparare prima'] },
];
const categories = ['Tutte', 'Primi', 'Secondi', 'Vegetariano', 'Colazioni', 'Dolci'];

function Brand() {
  return <a className="brand" href="#" aria-label="Savora home"><span className="brand-mark"><Utensils size={19} strokeWidth={1.8}/></span><span>SAVORA<span className="brand-dot">.</span></span></a>;
}

function RecipeCard({ recipe, saved, onSave, onOpen }: { recipe: Recipe; saved: boolean; onSave: () => void; onOpen: () => void }) {
  return <motion.article className="recipe-card" layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
    <button className="card-image-button" onClick={onOpen} aria-label={'Apri ' + recipe.title}>
      <img className="card-image" src={recipe.image} alt={recipe.title} loading="lazy" />
      <span className="card-time"><Clock3 size={13}/>{recipe.time} min</span>
    </button>
    <button className={'save-button ' + (saved ? 'is-saved' : '')} onClick={onSave} aria-label={saved ? 'Rimuovi dai preferiti' : 'Salva nei preferiti'}><Heart size={17} fill={saved ? 'currentColor' : 'none'}/></button>
    <div className="recipe-card-body">
      <div className="card-meta"><span>{recipe.category}</span><span className="rating">★ {recipe.rating}</span></div>
      <button className="recipe-title-button" onClick={onOpen}><h3>{recipe.title}</h3></button>
      <p>{recipe.subtitle}</p>
      <div className="card-author"><span className="avatar">{recipe.author.split(' ').map(s => s[0]).join('').slice(0,2)}</span><span>di <b>{recipe.author}</b></span><button onClick={onOpen} className="card-arrow" aria-label="Vedi ricetta"><ArrowRight size={17}/></button></div>
    </div>
  </motion.article>;
}

export default function App() {
  const [activeCategory, setActiveCategory] = useState('Tutte');
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState<number[]>([2]);
  const [activeTab, setActiveTab] = useState('Scopri');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(2);
  const [checkedSteps, setCheckedSteps] = useState<number[]>([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantText, setAssistantText] = useState('');
  const [assistantAnswer, setAssistantAnswer] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);

  const filtered = useMemo(() => recipes.filter(r => (activeCategory === 'Tutte' || r.category === activeCategory) &&
    (r.title + ' ' + r.subtitle + ' ' + r.category + ' ' + r.tags.join(' ')).toLowerCase().includes(query.toLowerCase())), [activeCategory, query]);

  const toggleSaved = (id: number) => setSaved(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const openRecipe = (recipe: Recipe) => { setSelectedRecipe(recipe); setServings(recipe.servings); setCheckedSteps([]); };
  const askAssistant = () => {
    const text = assistantText.trim();
    if (!text) return;
    const ingredient = text;
    const match = recipes.find(r => (r.title + ' ' + r.subtitle + ' ' + r.tags.join(' ')).toLowerCase().includes(ingredient.toLowerCase()));
    setAssistantAnswer(match
      ? 'Ti consiglio “' + match.title + '”: si prepara in circa ' + match.time + ' minuti. Apri la ricetta dal ricettario per vedere ingredienti e passaggi.'
      : 'Partiamo da quello che hai: ' + ingredient + '. Prova a cercare nel ricettario con un ingrediente alla volta oppure scegli una categoria. L’assistente AI completo verrà collegato al servizio di generazione nella prossima fase.');
  };

  return <div className="app-shell">
    <header className="topbar">
      <Brand />
      <nav className="desktop-nav" aria-label="Navigazione principale">
        {['Scopri', 'Ricettario', 'Menu settimanale', 'Community'].map(item => <button key={item} className={activeTab === item ? 'nav-link active' : 'nav-link'} onClick={() => { setActiveTab(item); if (item === 'Ricettario') document.getElementById('ricettario')?.scrollIntoView({ behavior: 'smooth' }); }}>{item}</button>)}
      </nav>
      <div className="top-actions"><button className="icon-button desktop-only" onClick={() => setAssistantOpen(true)} aria-label="Apri assistente"><Sparkles size={19}/></button><button className="profile-button" onClick={() => setActiveTab('Il mio spazio')}><span className="profile-avatar">C</span><span className="profile-label">Il mio spazio</span><ChevronDown size={15}/></button><button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(v => !v)} aria-label="Apri menu"><Menu size={22}/></button></div>
    </header>
    {mobileMenu && <div className="mobile-nav">{['Scopri', 'Ricettario', 'Menu settimanale', 'Community'].map(item => <button key={item} onClick={() => { setActiveTab(item); setMobileMenu(false); }}>{item}</button>)}</div>}

    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line"/> IL PIACERE DI CUCINARE, OGNI GIORNO</div>
          <h1>Ogni giorno,<br/>un <em>nuovo sapore.</em></h1>
          <p>Ricette da amare, idee da condividere e piccoli segreti per portare qualcosa di speciale in tavola.</p>
          <div className="hero-actions"><button className="button-primary" onClick={() => document.getElementById('ricettario')?.scrollIntoView({ behavior: 'smooth' })}>Esplora le ricette <ArrowRight size={17}/></button><button className="button-text" onClick={() => setAssistantOpen(true)}><Sparkles size={16}/> Chiedi a Savora</button></div>
          <div className="hero-proof"><div className="proof-avatars"><span>G</span><span>M</span><span>A</span><span>+</span></div><div><b>Una cucina, mille idee</b><small>Inizia da quello che hai in frigo.</small></div></div>
        </div>
        <div className="hero-visual"><img src="https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1400&q=90" alt="Tavola mediterranea con ingredienti freschi" /><div className="hero-photo-shade"/><div className="hero-note"><span className="note-icon"><Leaf size={17}/></span><div><b>Buono, bello, di stagione</b><small>Idee fresche per la tua cucina</small></div><ArrowRight size={17}/></div><div className="hero-stamp"><span>IL GUSTO</span><b>di casa</b><span>IN OGNI PIATTO</span></div></div>
      </section>

      <section className="quick-strip" aria-label="Esplora Savora">
        <button onClick={() => { setActiveCategory('Tutte'); document.getElementById('ricettario')?.scrollIntoView({behavior:'smooth'}); }}><span className="quick-icon olive"><BookOpen size={19}/></span><span><b>Ricette per ogni giorno</b><small>Da provare subito</small></span><ArrowRight size={16}/></button>
        <button onClick={() => setAssistantOpen(true)}><span className="quick-icon peach"><WandSparkles size={19}/></span><span><b>Il tuo sous-chef AI</b><small>Dimmi cosa hai in frigo</small></span><ArrowRight size={16}/></button>
        <button onClick={() => setActiveTab('Menu settimanale')}><span className="quick-icon yellow"><CalendarDays size={19}/></span><span><b>Organizza la settimana</b><small>Menu e lista della spesa</small></span><ArrowRight size={16}/></button>
      </section>

      <section className="section recipe-section" id="ricettario">
        <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line"/> ISPIRAZIONE QUOTIDIANA</div><h2>La tua prossima <em>ricetta preferita.</em></h2><p>Scelte con cura, da portare subito in cucina.</p></div><button className="view-all" onClick={() => { setActiveCategory('Tutte'); setQuery(''); }}>Vedi tutte <ArrowRight size={16}/></button></div>
        <div className="search-row"><div className="search-box"><Search size={19}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca una ricetta, un ingrediente…" aria-label="Cerca ricette"/>{query && <button onClick={() => setQuery('')} aria-label="Cancella ricerca"><X size={16}/></button>}</div><button className="filter-button" onClick={() => setActiveCategory(activeCategory === 'Tutte' ? 'Vegetariano' : 'Tutte')}><SlidersHorizontal size={17}/><span>Filtri</span></button></div>
        <div className="category-pills">{categories.map(cat => <button key={cat} className={activeCategory === cat ? 'category-pill active' : 'category-pill'} onClick={() => setActiveCategory(cat)}>{cat}</button>)}</div>
        {filtered.length ? <div className="recipe-grid">{filtered.map(recipe => <RecipeCard key={recipe.id} recipe={recipe} saved={saved.includes(recipe.id)} onSave={() => toggleSaved(recipe.id)} onOpen={() => openRecipe(recipe)}/>)}</div> : <div className="empty-state"><Search size={28}/><b>Nessuna ricetta trovata</b><span>Prova un altro ingrediente o cambia categoria.</span><button className="button-primary" onClick={() => {setQuery('');setActiveCategory('Tutte');}}>Mostra tutte le ricette</button></div>}
      </section>

      <section className="assistant-banner">
        <div className="assistant-art"><div className="assistant-orbit orbit-one"/><div className="assistant-orbit orbit-two"/><div className="assistant-spark"><Sparkles size={31}/></div><div className="ingredient ingredient-one">🍋</div><div className="ingredient ingredient-two">🌿</div><div className="ingredient ingredient-three">🍅</div></div>
        <div className="assistant-banner-copy"><div className="eyebrow"><span className="eyebrow-line"/> IL TUO AIUTO IN CUCINA</div><h2>Hai qualcosa in frigo.<br/><em>Facciamone magia.</em></h2><p>Scrivi gli ingredienti che hai a disposizione e trova l'ispirazione per il prossimo piatto.</p><button className="button-primary" onClick={() => setAssistantOpen(true)}>Parla con Savora <Sparkles size={17}/></button></div>
      </section>

      <section className="community-section">
        <div className="community-copy"><div className="eyebrow"><span className="eyebrow-line"/> LA CUCINA È PIÙ BELLA INSIEME</div><h2>Ricette da condividere.<br/><em>Storie da assaporare.</em></h2><p>Scopri le idee della community, salva le tue preferite e lasciati ispirare da chi ama cucinare come te.</p><button className="button-outline" onClick={() => setActiveTab('Community')}>Entra nella community <ArrowRight size={16}/></button></div>
        <div className="community-photos"><img className="community-main" src="https://images.unsplash.com/photo-1556761223-4c4282c73f77?auto=format&fit=crop&w=900&q=85" alt="Amici che condividono un pasto"/><img className="community-small" src="https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=700&q=85" alt="Preparazione di una ricetta in cucina"/><div className="community-bubble"><MessageCircle size={17}/><span><b>Una community che ispira</b><small>Ogni piatto racconta qualcosa</small></span></div></div>
      </section>

      <section className="newsletter"><div className="newsletter-icon"><ChefHat size={25}/></div><div><h3>Una buona idea, ogni settimana.</h3><p>Ricette di stagione, trucchi e ispirazioni direttamente nella tua casella.</p></div><form onSubmit={e => {e.preventDefault(); alert('Grazie! La funzione newsletter sarà attivata quando collegheremo il servizio email.');}}><input type="email" placeholder="La tua email" aria-label="La tua email" required/><button type="submit" aria-label="Iscriviti"><ArrowRight size={18}/></button></form></section>
    </main>

    <footer className="footer"><Brand/><span>Il gusto di trovare sempre una nuova idea.</span><div><a href="#ricettario">Ricettario</a><button onClick={() => setAssistantOpen(true)}>Assistente AI</button><a href="#top">Torna su ↑</a></div><small>© 2026 Savora · Fatto con amore e un pizzico di curiosità.</small></footer>

    <nav className="mobile-bottom-nav" aria-label="Navigazione mobile">
      {[{label:'Scopri',icon:Home},{label:'Ricettario',icon:BookOpen},{label:'Assistente',icon:Sparkles},{label:'Salvati',icon:Bookmark}].map(({label,icon:Icon}) => <button key={label} className={activeTab === label ? 'selected' : ''} onClick={() => label === 'Assistente' ? setAssistantOpen(true) : label === 'Salvati' ? setActiveTab('Salvati') : (setActiveTab(label), label === 'Ricettario' && document.getElementById('ricettario')?.scrollIntoView({behavior:'smooth'}))}><Icon size={20}/><span>{label}</span></button>)}
    </nav>

    <AnimatePresence>
      {selectedRecipe && <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={e => {if(e.target === e.currentTarget) setSelectedRecipe(null);}}>
        <motion.div className="recipe-modal" initial={{y:24,opacity:0,scale:.98}} animate={{y:0,opacity:1,scale:1}} exit={{y:16,opacity:0}} transition={{duration:.22}}>
          <button className="modal-close" onClick={() => setSelectedRecipe(null)} aria-label="Chiudi"><X size={20}/></button>
          <img className="modal-hero" src={selectedRecipe.image} alt={selectedRecipe.title}/>
          <div className="modal-content"><div className="card-meta"><span>{selectedRecipe.category}</span><span className="rating">★ {selectedRecipe.rating}</span></div><h2>{selectedRecipe.title}</h2><p className="modal-subtitle">{selectedRecipe.subtitle}</p><div className="modal-stats"><span><Clock3 size={16}/>{selectedRecipe.time} min</span><span><Flame size={16}/>{selectedRecipe.difficulty}</span><span><Users size={16}/>{servings} porzioni</span></div>
            <div className="servings-row"><b>Ingredienti</b><div className="servings-control"><button onClick={() => setServings(v => Math.max(1,v-1))} aria-label="Meno porzioni"><Minus size={14}/></button><span>{servings}</span><button onClick={() => setServings(v => Math.min(20,v+1))} aria-label="Più porzioni"><Plus size={14}/></button></div></div>
            <ul className="ingredient-list">{(selectedRecipe.id === 1 ? [['Spaghetti', '160 g'],['Limone non trattato','1'],['Parmigiano grattugiato','35 g'],['Olio extravergine','2 cucchiai'],['Basilico fresco','q.b.']] : selectedRecipe.id === 2 ? [['Ceci già cotti','240 g'],['Pomodorini','150 g'],['Cetriolo','1'],['Insalata mista','80 g'],['Tahina e limone','2 cucchiai']] : selectedRecipe.id === 3 ? [['Gnocchi di patate','500 g'],['Pomodori maturi','400 g'],['Aglio','1 spicchio'],['Basilico','q.b.'],['Olio extravergine','2 cucchiai']] : selectedRecipe.id === 4 ? [['Filetti di salmone','2'],['Miele','1 cucchiaio'],['Salsa di soia','1 cucchiaio'],['Limone','½'],['Erbe aromatiche','q.b.']] : selectedRecipe.id === 5 ? [['Farina','180 g'],['Latte','180 ml'],['Uovo','1'],['Lievito per dolci','1 cucchiaino'],['Frutti rossi','120 g']] : [['Mascarpone','500 g'],['Savoiardi','250 g'],['Uova pastorizzate','4'],['Caffè freddo','300 ml'],['Cacao amaro','q.b.']]).map(([name,amount],i) => <li key={name}><span>{name}</span><b>{amount.includes('q.b.') || amount === '1' || amount === '½' ? amount : amount.replace(/[0-9]+/g, n => String(Math.round(Number(n)*servings/selectedRecipe.servings)))}</b></li>)}</ul>
            <div className="method-heading"><b>Preparazione</b><span>{checkedSteps.length}/3 completati</span></div>
            {['Prepara tutti gli ingredienti e porta sul piano di lavoro ciò che ti serve. Lava e taglia le verdure o gli aromi indicati.','Cuoci gli ingredienti principali seguendo i tempi indicati, assaggia e regola sale e condimenti. Mantieni la fiamma controllata per valorizzare i sapori.','Impiatta con cura, aggiungi le erbe fresche o la finitura suggerita e servi subito. Buon appetito!'].map((step,i) => <button key={i} className={'method-step '+(checkedSteps.includes(i)?'step-done':'')} onClick={() => setCheckedSteps(prev => prev.includes(i)?prev.filter(x=>x!==i):[...prev,i])}><span className="step-number">{checkedSteps.includes(i)?<Check size={16}/>:String(i+1).padStart(2,'0')}</span><span><b>{['Prepara','Cuoci','Impiatta'][i]}</b><small>{step}</small></span></button>)}
            <p className="recipe-disclaimer">Nota: questa è una scheda dimostrativa iniziale. Ingredienti e passaggi definitivi andranno verificati ricetta per ricetta prima della pubblicazione.</p>
            <button className="button-primary full-button" onClick={() => toggleSaved(selectedRecipe.id)}>{saved.includes(selectedRecipe.id)?<Check size={17}/>:<Heart size={17}/>} {saved.includes(selectedRecipe.id)?'Salvata nei preferiti':'Salva la ricetta'}</button>
          </div>
        </motion.div>
      </motion.div>}
      {assistantOpen && <motion.div className="assistant-drawer-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={e => {if(e.target===e.currentTarget)setAssistantOpen(false);}}>
        <motion.aside className="assistant-drawer" initial={{x:420}} animate={{x:0}} exit={{x:420}} transition={{type:'spring',damping:28,stiffness:260}}>
          <div className="drawer-head"><div className="drawer-mark"><Sparkles size={21}/></div><div><b>Il sous-chef Savora</b><small>Un'idea alla volta, insieme.</small></div><button className="icon-button" onClick={() => setAssistantOpen(false)} aria-label="Chiudi assistente"><X size={20}/></button></div>
          <div className="assistant-chat"><div className="chat-welcome"><span className="chat-spark"><Sparkles size={24}/></span><h3>Cosa prepariamo oggi?</h3><p>Dimmi cosa hai in frigorifero, quanto tempo hai o che tipo di piatto ti va.</p></div><div className="suggestion-chips">{['Ho pomodori e pasta','Cena pronta in 20 minuti','Qualcosa di vegetariano'].map(s=><button key={s} onClick={()=>setAssistantText(s)}>{s}</button>)}</div>{assistantAnswer && <div className="assistant-response"><Sparkles size={16}/><p>{assistantAnswer}</p></div>}</div>
          <form className="assistant-input-row" onSubmit={e=>{e.preventDefault();askAssistant();}}><input value={assistantText} onChange={e=>setAssistantText(e.target.value)} placeholder="Es. uova, zucchine, ricotta…" aria-label="Ingredienti o richiesta"/><button type="submit" aria-label="Invia richiesta"><Send size={18}/></button></form><small className="ai-note">Versione iniziale: suggerimenti locali di esempio. Il modello AI e il catalogo completo saranno collegati nella fase backend.</small>
        </motion.aside>
      </motion.div>}
    </AnimatePresence>
  </div>;
}
