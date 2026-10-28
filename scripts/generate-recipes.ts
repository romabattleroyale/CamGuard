import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TARGET = Number(process.env.RECIPE_TARGET ?? 50000);
const BATCH_SIZE = Math.min(20, Math.max(1, Number(process.env.RECIPE_BATCH_SIZE ?? 10)));
const OUT_DIR = path.resolve('data/recipes');
const OUT_FILE = path.join(OUT_DIR, 'catalog.jsonl');
const STATE_FILE = path.join(OUT_DIR, 'generation-state.json');
const MODEL = process.env.RECIPE_MODEL ?? 'gemini-2.5-flash';

type Recipe = {
  id: string; title: string; summary: string; cuisine: string; category: string;
  servings: number; prepMinutes: number; cookMinutes: number; difficulty: 'facile'|'media'|'difficile';
  ingredients: { name: string; quantity: number | null; unit: string; notes?: string }[];
  steps: string[]; tags: string[]; allergens: string[]; imageStatus: 'pending';
};

const categories = [
  'Antipasti e aperitivi','Primi italiani','Pasta fresca e ripiena','Risotti e cereali',
  'Secondi di carne','Secondi di pesce','Piatti vegetariani','Piatti vegani','Contorni',
  'Pizza e focacce','Pane e lievitati','Insalate e bowl','Zuppe e minestre','Colazioni',
  'Brunch','Dolci e torte','Biscotti e pasticceria','Gelati e dessert freddi',
  'Cucina asiatica','Cucina mediorientale','Cucina africana','Cucina americana',
  'Cucina latinoamericana','Ricette regionali italiane','Senza glutine','Senza lattosio'
];

function normalizeTitle(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('Imposta GEMINI_API_KEY nel file .env prima di generare ricette.');
  await mkdir(OUT_DIR, { recursive: true });
  let existing: Recipe[] = [];
  try {
    const text = await readFile(OUT_FILE, 'utf8');
    existing = text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Recipe);
  } catch { /* first run */ }

  const seen = new Set(existing.map(r => normalizeTitle(r.title)));
  let generated = existing.length;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  console.log('Catalogo salvato:', generated, '/', TARGET);
  while (generated < TARGET) {
    const category = categories[Math.floor(generated / BATCH_SIZE) % categories.length];
    const count = Math.min(BATCH_SIZE, TARGET - generated);
    const prompt = `Crea esattamente ${count} ricette originali in italiano per un ricettario professionale. Categoria prioritaria: "${category}". Varia ingredienti, tecniche e tradizioni; evita varianti cosmetiche della stessa ricetta. Restituisci SOLO JSON valido nel formato {"recipes":[...]}. Ogni ricetta deve avere title, summary, cuisine, category, servings (intero 1-12), prepMinutes (intero positivo), cookMinutes (intero >=0), difficulty (facile|media|difficile), ingredients (array di {name, quantity (numero oppure null), unit, notes opzionale}), steps (4-10 passaggi concreti e ordinati), tags (array), allergens (array esplicito, usa "da verificare" se non deducibile con sicurezza). Quantità e unità devono essere coerenti; non inventare benefici medici. Non includere fotografie o URL. Le ricette devono essere realistiche, riproducibili e diverse fra loro.`;
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.8 }
    });
    const raw = response.text ?? '';
    let parsed: { recipes?: Omit<Recipe, 'id'|'imageStatus'>[] };
    try { parsed = JSON.parse(raw); } catch { console.error('Risposta JSON non valida; lotto saltato, riprova.'); continue; }
    const fresh: Recipe[] = [];
    for (const item of parsed.recipes ?? []) {
      if (!item.title || !Array.isArray(item.ingredients) || item.ingredients.length < 2 || !Array.isArray(item.steps) || item.steps.length < 3) continue;
      const key = normalizeTitle(item.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      fresh.push({ ...item, id: `savora-${String(generated + fresh.length + 1).padStart(5, '0')}`, imageStatus: 'pending' });
      if (fresh.length >= count) break;
    }
    if (!fresh.length) {
      console.warn('Nessuna ricetta nuova e valida nel lotto; arresto per evitare un ciclo infinito.');
      break;
    }
    await appendFile(OUT_FILE, fresh.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    generated += fresh.length;
    await writeFile(STATE_FILE, JSON.stringify({
      target: TARGET, generated, remaining: Math.max(0, TARGET - generated),
      updatedAt: new Date().toISOString(), model: MODEL, categories,
      note: 'Le ricette generate richiedono revisione editoriale e verifica allergeni prima della pubblicazione.'
    }, null, 2) + '\n');
    console.log(`Salvate ${generated}/${TARGET} ricette (${Math.max(0, TARGET-generated)} rimanenti).`);
  }
  console.log(`Operazione terminata. Ricette presenti nel catalogo: ${generated}. Le immagini restano in stato pending.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
