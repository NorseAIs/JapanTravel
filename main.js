// ====== CONFIG / DATA ======
const defaultData = {
  year: 2026,
  departure: "",
  showFriend: true,
  cities: [
    { key:"tokyo",     name:"Tokyo",     lat:35.6895, lon:139.6917, plan:"Meet friends, Akihabara, Evangelion Store Tokyo-01", notes:"", dates:"", stay:"", transport:"Arrival", sideTrip:false },
    { key:"kawagoe",   name:"Kawagoe",   lat:35.9251, lon:139.4850, plan:"Little Edo streets, sweet potato snacks", notes:"Day/half-day from Tokyo", dates:"", stay:"", transport:"Tobu Tojo/Seibu", sideTrip:true },
    { key:"nagoya",    name:"Nagoya",    lat:35.1815, lon:136.9066, plan:"Miso katsu / hitsumabushi", notes:"Give Nagoya more time", dates:"", stay:"", transport:"Shinkansen", sideTrip:false },
    { key:"kanazawa",  name:"Kanazawa",  lat:36.5613, lon:136.6562, plan:"Kenroku-en / Omicho Market", notes:"", dates:"", stay:"", transport:"Hokuriku Shinkansen (via Tsuruga)", sideTrip:false },
    { key:"kyoto",     name:"Kyoto",     lat:35.0116, lon:135.7681, plan:"Cozy vibes", notes:"", dates:"", stay:"", transport:"Limited Express / Shinkansen", sideTrip:false },
    { key:"nara",      name:"Nara",      lat:34.6851, lon:135.8049, plan:"Tōdai-ji", notes:"Likely day trip from Kyoto/Osaka", dates:"", stay:"", transport:"Kintetsu/JR", sideTrip:true },
    { key:"hiroshima", name:"Hiroshima", lat:34.3853, lon:132.4553, plan:"Peace Memorial / okonomiyaki", notes:"Friends also going here", dates:"", stay:"", transport:"Shinkansen", sideTrip:false },
    { key:"osaka",     name:"Osaka",     lat:34.6937, lon:135.5023, plan:"Food tour, Dotonbori", notes:"", dates:"", stay:"", transport:"", sideTrip:false },
    { key:"gunma",     name:"Gunma (friend)",     lat:36.3907, lon:139.0600, sideTrip:true, friend:true },
    { key:"fukushima", name:"Fukushima (friend)", lat:37.7608, lon:140.4747, sideTrip:true, friend:true }
  ],
  budget: [],
  checklist: ["Passport", "eSIM (Ubigi)", "IC card (Suica/PASMO)", "Gym bands"],
  notes: [],
  itinerary: []
};

// ====== STORAGE / STATE ======
const LS_KEY = "jp_trip_planner_leaflet_jptheme_v5";
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    const base = structuredClone(defaultData);
    if(!raw) return base;
    const d = JSON.parse(raw);
    d.cities = (d.cities && d.cities.length ? d.cities.map(c=>({friend:false, sideTrip:false, ...c})) : base.cities);
    d.checklist = (d.checklist||base.checklist).map(x => typeof x === 'string' ? ({text:x, done:false}) : x);
    if (d.shared && (!d.notes || d.notes.length===0)) {
      d.notes = [{ title:'Shared', tag:'', body:String(d.shared), ts: Date.now() }];
      delete d.shared;
    }
    d.itinerary = Array.isArray(d.itinerary) ? d.itinerary : [];
    return {...base, ...d};
  }catch(e){
    return structuredClone(defaultData);
  }
}
let data = load();
const state = { selected: data.cities[0].key, dragging: null, activeDate:null };
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(data)); }

fetch('recommended.json')
  .then(response => response.json())
  .then(data => {
    // data is now an array of attractions
    renderRecommended(data);
  })
  .catch(error => console.error('Error loading recommended.json:', error));

// ====== HEADER / COUNTDOWN ======
const departInput = $('#departInput');
const countdown = $('#countdown');
const yearSpan = $('#yearSpan');

function normalizeYMD(d){
  if(!(d instanceof Date) || isNaN(d)) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function setYearFromDeparture(){
  if(data.departure){
    const y = new Date(data.departure).getFullYear();
    if(!isNaN(y)) { yearSpan.textContent = y; return; }
  }
  yearSpan.textContent = data.year;
}
function updateCountdown(){
  if(!data.departure){ countdown.textContent = "Set a departure date →"; setYearFromDeparture(); return; }
  const today = normalizeYMD(new Date());
  const target = normalizeYMD(new Date(data.departure));
  if(!target){ countdown.textContent = "Set a valid date →"; return; }
  const diffMs = target - today;
  const diffDays = Math.ceil(diffMs / 86400000);
  if(diffDays > 1){ countdown.textContent = `✈️ ${diffDays} days until departure`; }
  else if(diffDays === 1){ countdown.textContent = '✈️ 1 day until departure'; }
  else if(diffDays === 0){ countdown.textContent = '✈️ Today — have a great flight!'; }
  else { countdown.textContent = `Itinerary live · ${Math.abs(diffDays)} day${Math.abs(diffDays)===1?'':'s'} since departure`; }
  setYearFromDeparture();
}

yearSpan.textContent = data.year;
if(data.departure) departInput.value = data.departure;
departInput.addEventListener('change',()=>{ data.departure = departInput.value; save(); updateCountdown(); });
updateCountdown();
// Keep it fresh even if the tab stays open
setInterval(updateCountdown, 60*1000);

// ====== SIDEBAR / ROUTE ======
const routeList = $('#routeList');
const toggleFriend = $('#toggleFriend');
toggleFriend.checked = !!data.showFriend;
toggleFriend.addEventListener('change',()=>{ data.showFriend = toggleFriend.checked; save(); renderRoute(); drawMap(); fillBudgetCities(); });

function visibleCities(){ return data.cities.filter(c=>!c.friend || data.showFriend); }

function renderRoute(){
  routeList.innerHTML = '';
  visibleCities().forEach((c,i)=>{
    const b = document.createElement('button');
    b.textContent = `${i+1}. ${c.name}`;
    if(c.sideTrip){ const s=document.createElement('span'); s.className='badge'; s.textContent='side trip'; b.appendChild(s); }
    if(c.friend){ const s=document.createElement('span'); s.className='badge friend'; s.textContent='friend'; b.appendChild(s); }
    b.className = 'draggable';
    if(c.key===state.selected) b.classList.add('active');
    b.draggable = true;
    b.addEventListener('click',()=>{ state.selected=c.key; selectCity(); zoomAndPulse(c); highlightItineraryForCity(c.key); });
    b.addEventListener('dragstart', (e)=>{ state.dragging = c.key; e.dataTransfer.setData('text/plain', c.key); });
    b.addEventListener('dragover',(e)=>e.preventDefault());
    b.addEventListener('drop',(e)=>{ e.preventDefault(); reorder(state.dragging,c.key); state.dragging=null; });
    routeList.appendChild(b);
  });
}
function reorder(fromKey,toKey){
  const full = data.cities;
  const fi=full.findIndex(c=>c.key===fromKey), ti=full.findIndex(c=>c.key===toKey);
  if(fi<0||ti<0) return;
  const [moved] = full.splice(fi,1);
  full.splice(ti,0,moved);
  save(); renderRoute(); drawMap(); fillBudgetCities();
}

// ====== MAP (Leaflet + OSM, bounded to Japan) ======
const COLOR_MAIN = '#3b82f6';
const COLOR_SIDE = '#ef4444';
const COLOR_FRIEND = '#f59e0b';
const JAPAN_BOUNDS = L.latLngBounds([24.0, 122.0], [46.5, 146.0]);

const map = L.map('leafletMap', {
  zoomControl: true,
  scrollWheelZoom: true,
  worldCopyJump: false,
  maxBounds: JAPAN_BOUNDS,
  maxBoundsViscosity: 0.7,
});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:12, minZoom:4, attribution:'© OpenStreetMap contributors' }).addTo(map);

const routeLayer  = L.layerGroup().addTo(map);
const cityLayer   = L.layerGroup().addTo(map);
const friendLayer = L.layerGroup().addTo(map);
// NEW layers for day view:
const poiLayer    = L.layerGroup().addTo(map);
const dayRouteLayer = L.layerGroup().addTo(map);

function dotStyle(c){
  return { radius: 7, color:'#111827', weight:2, fillColor: c.friend ? COLOR_FRIEND : (c.sideTrip ? COLOR_SIDE : COLOR_MAIN), fillOpacity:1 };
}
let markerIndex = new Map();

function drawMap(){
  routeLayer.clearLayers(); cityLayer.clearLayers(); friendLayer.clearLayers();
  markerIndex.clear();

  const vis = visibleCities();
  const mainPoints = vis.filter(c => !c.friend).map(c => [c.lat, c.lon]);
  if (mainPoints.length >= 2) L.polyline(mainPoints, { weight: 4, color: COLOR_MAIN, opacity: 0.9 }).addTo(routeLayer);

  vis.forEach((c, i) => {
    const m = L.circleMarker([c.lat, c.lon], dotStyle(c))
      .addTo(c.friend ? friendLayer : cityLayer)
      .bindTooltip(`${i+1}. ${c.name}`, { permanent: true, direction: 'right', offset: [10, 0], className: 'city-label' })
      .on('click', () => { state.selected = c.key; selectCity(); zoomAndPulse(c); highlightItineraryForCity(c.key); });
    if (c.key === state.selected) m.setStyle({ radius: 10 });
    markerIndex.set(c.key, m);
  });

  const fit = vis.filter(c => !c.friend).map(c => [c.lat, c.lon]);
  if (fit.length) map.fitBounds(fit, { padding: [40, 40] });

  // if a day is active, re-show it after redraw
  if (state.activeDate) showDayOnMap(state.activeDate);
}

let pulseNode = null;
function zoomAndPulse(city){
  map.setView([city.lat, city.lon], Math.max(map.getZoom(), 7), { animate: true });
  const m = markerIndex.get(city.key); if (m) m.setStyle({ radius: 11 });

  if (pulseNode){ pulseNode.remove(); pulseNode = null; }
  const pt = map.latLngToContainerPoint([city.lat, city.lon]);
  const wrap = document.createElement("div");
  wrap.className = "pulse-ring";
  wrap.style.left = `${pt.x}px`; wrap.style.top = `${pt.y}px`;
  map.getContainer().appendChild(wrap);
  pulseNode = wrap;
  setTimeout(()=>{ pulseNode?.remove(); pulseNode=null; }, 900);
}
map.on('move', ()=>{
  if (!pulseNode) return;
  const c = currentCity();
  const pt = map.latLngToContainerPoint([c.lat, c.lon]);
  pulseNode.style.left = `${pt.x}px`; pulseNode.style.top = `${pt.y}px`;
});

// ====== CITY EDITOR ======
const cityName=$('#cityName'), cityDates=$('#cityDates'), cityStay=$('#cityStay'),
      cityTransport=$('#cityTransport'), cityPlan=$('#cityPlan'), cityNotes=$('#cityNotes');
const saveCityBtn=$('#saveCity'), delCityBtn=$('#deleteCity'), saveHint=$('#saveHint');

function currentCity(){ return data.cities.find(c=>c.key===state.selected) || data.cities[0]; }

function selectCity(){
  renderRoute(); drawMap();
  const c=currentCity();
  cityName.value=c.name; cityDates.value=c.dates||''; cityStay.value=c.stay||'';
  cityTransport.value=c.transport||''; cityPlan.value=c.plan||''; cityNotes.value=c.notes||'';
}
saveCityBtn.addEventListener('click',()=>{
  const c=currentCity();
  c.name=cityName.value.trim()||c.name; c.dates=cityDates.value; c.stay=cityStay.value;
  c.transport=cityTransport.value; c.plan=cityPlan.value; c.notes=cityNotes.value;
  save(); saveHint.textContent='Saved'; setTimeout(()=>saveHint.textContent='',1000);
  renderRoute(); drawMap(); fillBudgetCities();
});
delCityBtn.addEventListener('click',()=>{
  const idx=data.cities.findIndex(x=>x.key===state.selected);
  if(idx>-1){ data.cities.splice(idx,1); save(); state.selected = data.cities[0]?.key || null; renderRoute(); drawMap(); fillBudgetCities(); selectCity(); }
});

// ====== TABS ======
$$('.tab').forEach(t=>t.addEventListener('click',()=>{
  $$('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  const id=t.getAttribute('data-tab');
  ['budget','checklist','shared','itinerary'].forEach(k=>{ $('#tab-'+k).style.display = (k===id)?'block':'none'; });
}));

// ====== BUDGET ======
const budgetCity=$('#budgetCity'), bItem=$('#bItem'), bCost=$('#bCost'),
      bPeople=$('#bPeople'), addBudget=$('#addBudget'),
      saveBudget=$('#saveBudget'), cancelEdit=$('#cancelEdit'),
      budgetTable=$('#budgetTable tbody'),
      totalCost=$('#totalCost'), totalPer=$('#totalPer');
let editingIndex = null;

function fillBudgetCities(){
  budgetCity.innerHTML=''; visibleCities().forEach(c=>{ const o=document.createElement('option'); o.value=c.key; o.textContent=c.name; budgetCity.appendChild(o); });
}
function cityNameByKey(k){ const c=data.cities.find(x=>x.key===k); return c?c.name:k; }
function renderBudget(){
  budgetTable.innerHTML=''; let sum=0, per=0;
  data.budget.forEach((b,idx)=>{
    const tr=document.createElement('tr');
    const perPerson = b.people? Math.round(b.cost / b.people) : b.cost;
    sum += b.cost; per += perPerson;
    tr.innerHTML = `
      <td>${cityNameByKey(b.city)}</td>
      <td>${b.item}</td>
      <td class="num">${b.cost.toLocaleString()}</td>
      <td class="num">${b.people}</td>
      <td class="num">${perPerson.toLocaleString()}</td>
      <td>
        <button class="btn ok" data-edit="${idx}">Edit</button>
        <button class="btn" data-del="${idx}">Delete</button>
      </td>`;
    budgetTable.appendChild(tr);
  });
  totalCost.textContent=sum.toLocaleString(); totalPer.textContent=per.toLocaleString();

  budgetTable.querySelectorAll('button[data-del]').forEach(btn=>btn.addEventListener('click',()=>{
    const i=+btn.getAttribute('data-del'); data.budget.splice(i,1); save(); renderBudget();
    if(editingIndex===i) resetBudgetForm();
  }));
  budgetTable.querySelectorAll('button[data-edit]').forEach(btn=>btn.addEventListener('click',()=>{
    const i=+btn.getAttribute('data-edit'); const row=data.budget[i];
    editingIndex=i;
    budgetCity.value=row.city; bItem.value=row.item; bCost.value=row.cost; bPeople.value=row.people;
    addBudget.style.display='none'; saveBudget.style.display='inline-block'; cancelEdit.style.display='inline-block';
  }));
}
function resetBudgetForm(){
  editingIndex=null; bItem.value=''; bCost.value=''; bPeople.value='1';
  addBudget.style.display='inline-block'; saveBudget.style.display='none'; cancelEdit.style.display='none';
}
addBudget.addEventListener('click',()=>{
  const city = budgetCity.value; const item=bItem.value.trim(); const cost=parseInt(bCost.value,10)||0; const ppl=parseInt(bPeople.value,10)||1;
  if(!item||!cost) return;
  data.budget.push({city,item,cost,people:ppl}); save(); resetBudgetForm(); renderBudget();
});
saveBudget.addEventListener('click',()=>{
  if(editingIndex==null) return;
  const city = budgetCity.value; const item=bItem.value.trim(); const cost=parseInt(bCost.value,10)||0; const ppl=parseInt(bPeople.value,10)||1;
  if(!item||!cost) return;
  data.budget[editingIndex] = {city,item,cost,people:ppl};
  save(); resetBudgetForm(); renderBudget();
});
cancelEdit.addEventListener('click', resetBudgetForm);

// ====== CHECKLIST ======
const checklist=$('#checklist'), cItem=$('#cItem'), addCheck=$('#addCheck'), clearChecked=$('#clearChecked');
function renderChecklist(){
  checklist.innerHTML='';
  (data.checklist||[]).forEach((it,idx)=>{
    const row = (typeof it === 'string') ? {text:it, done:false} : it;
    data.checklist[idx] = row;
    const li=document.createElement('li');
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!row.done;
    cb.addEventListener('change',()=>{ data.checklist[idx].done = cb.checked; save(); renderChecklist(); });
    const span=document.createElement('span'); span.className='item-text'+(row.done?' done':''); span.textContent=row.text;
    const del=document.createElement('button'); del.className='btn'; del.textContent='×'; del.title='remove';
    del.addEventListener('click',()=>{ data.checklist.splice(idx,1); save(); renderChecklist(); });
    li.append(cb, span, del); checklist.appendChild(li);
  });
}
addCheck.addEventListener('click',()=>{ const t=cItem.value.trim(); if(!t) return; data.checklist.push({text:t, done:false}); save(); cItem.value=''; renderChecklist(); });
clearChecked.addEventListener('click',()=>{ data.checklist=[]; save(); renderChecklist(); });

// ====== SHARED NOTES ======
const noteTitle = $('#noteTitle'); const noteTag = $('#noteTag'); const noteBody = $('#noteBody');
const addNoteBtn = $('#addNoteBtn'); const saveNoteBtn = $('#saveNoteBtn'); const cancelNoteBtn = $('#cancelNoteBtn');
const notesList = $('#notesList');
let editingNoteIndex = null;

function renderNotes(){
  notesList.innerHTML='';
  (data.notes||[]).forEach((n,idx)=>{
    const card=document.createElement('div'); card.className='note-card';
    const head=document.createElement('div'); head.className='note-head';
    const t=document.createElement('div'); t.className='note-title'; t.textContent=n.title || '(Untitled)';
    const meta=document.createElement('div'); meta.className='note-meta'; meta.textContent=new Date(n.ts||Date.now()).toLocaleDateString();
    head.append(t, meta);
    const body=document.createElement('div'); body.className='note-body'; body.textContent=n.body||'';
    const tags=document.createElement('div'); tags.className='note-tags'; tags.textContent = n.tag ? `#${n.tag}` : '';
    const actions=document.createElement('div'); actions.className='note-actions';
    const edit=document.createElement('button'); edit.className='btn ok'; edit.textContent='Edit';
    edit.addEventListener('click',()=>{ editingNoteIndex=idx; noteTitle.value=n.title||''; noteTag.value=n.tag||''; noteBody.value=n.body||''; addNoteBtn.style.display='none'; saveNoteBtn.style.display='inline-block'; cancelNoteBtn.style.display='inline-block'; });
    const del=document.createElement('button'); del.className='btn'; del.textContent='Delete';
    del.addEventListener('click',()=>{ data.notes.splice(idx,1); save(); renderNotes(); });
    actions.append(edit, del);
    card.append(head, body); if(n.tag) card.append(tags); card.append(actions); notesList.appendChild(card);
  });
}
function resetNoteForm(){ editingNoteIndex=null; noteTitle.value=''; noteTag.value=''; noteBody.value=''; addNoteBtn.style.display='inline-block'; saveNoteBtn.style.display='none'; cancelNoteBtn.style.display='none'; }
addNoteBtn.addEventListener('click',()=>{ const title=noteTitle.value.trim(), tag=noteTag.value.trim(), body=noteBody.value.trim(); if(!title && !body) return; data.notes.unshift({ title, tag, body, ts: Date.now() }); save(); resetNoteForm(); renderNotes(); });
saveNoteBtn.addEventListener('click',()=>{ if(editingNoteIndex==null) return; const title=noteTitle.value.trim(), tag=noteTag.value.trim(), body=noteBody.value.trim(); data.notes[editingNoteIndex]={ title, tag, body, ts: Date.now() }; save(); resetNoteForm(); renderNotes(); });
cancelNoteBtn.addEventListener('click', resetNoteForm);

// ====== ITINERARY (↔ Map) ======
const itDate=$('#itDate'), itTime=$('#itTime'), itType=$('#itType'), itCity=$('#itCity'), itTitle=$('#itTitle'), itLat=$('#itLat'), itLon=$('#itLon');
const addItineraryBtn = $('#addItinerary');
const itineraryList = $('#itineraryList');

function fillItineraryCities(){
  itCity.innerHTML=''; visibleCities().filter(c=>!c.friend).forEach(c=>{ const o=document.createElement('option'); o.value=c.key; o.textContent=c.name; itCity.appendChild(o); });
}
function newId(){ return 'it_'+Math.random().toString(36).slice(2,9); }
function sortByTimeThenIndex(a,b){
  const ta=(a.time||''), tb=(b.time||'');
  if(ta===tb) return 0;
  return ta < tb ? -1 : 1;
}
function groupByDate(list){
  const g={}; list.forEach(x=>{ (g[x.date]??=[]).push(x); });
  Object.keys(g).forEach(d=> g[d].sort(sortByTimeThenIndex));
  return g;

 // Theme switcher (paste near the bottom of main.js)
const THEME_LS_KEY = 'jp_theme_v1';
const themeSelect = document.querySelector('#themeSelect');

function applyTheme(name){
  document.body.setAttribute('data-theme', name || 'default');
  try{ localStorage.setItem(THEME_LS_KEY, name||'default'); }catch(e){}
}

function initTheme(){
  if(!themeSelect) return;
  const stored = localStorage.getItem(THEME_LS_KEY) || 'default';
  themeSelect.value = stored;
  applyTheme(stored);
  themeSelect.addEventListener('change', ()=> applyTheme(themeSelect.value));
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initTheme);
}else{
  initTheme();
}

// Helpers to read CSS variables and render theme decorations
function cssVar(name, fallback=''){
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function renderThemeDeco(theme){
  const host = document.getElementById('themeDeco');
  if(!host) return;
  const accent = cssVar('--accent','#f97316');
  const gold   = cssVar('--jp-gold','#eab308');
  const red    = cssVar('--jp-red','#b91c1c');

  // small inline SVG snippets (original, generic)
  const svg = {
    autumn: `
      <!-- maple leaf -->
      <svg viewBox="0 0 64 64" width="120" class="float" style="top:10%; right:4%;">
        <path d="M33 6l6 10 11-4-6 10 9 6-11 2 3 11-9-7-9 7 3-11-11-2 9-6-6-10 11 4z"
              fill="${red}" stroke="#5a1f00" stroke-width="1.5" />
      </svg>
      <!-- ginkgo -->
      <svg viewBox="0 0 64 64" width="130" style="bottom:8%; left:6%;">
        <path d="M12 42c10-8 18-6 22 2 2 5 2 8 0 12-2-4-4-7-8-9-6-2-10-1-14-5z"
              fill="${gold}" stroke="#694f00" stroke-width="1.2"/>
      </svg>
    `,
    bleach: `
      <!-- abstract sword stroke -->
      <svg viewBox="0 0 200 60" width="260" style="top:8%; right:4%;">
        <path d="M5 30 C60 5, 140 5, 195 30 C140 55, 60 55, 5 30 Z"
              fill="${accent}" opacity=".22"/>
        <rect x="92" y="10" width="16" height="40" rx="2" fill="#111827" opacity=".6"/>
      </svg>
      <!-- diagonal stripe -->
      <svg viewBox="0 0 200 200" width="120" style="bottom:10%; left:5%;">
        <rect x="-20" y="80" width="240" height="40" transform="rotate(-30 100 100)"
              fill="${accent}" opacity=".18"/>
      </svg>
    `,
    naruto: `
      <!-- wind swirl -->
      <svg viewBox="0 0 120 120" width="160" class="float" style="top:12%; left:6%;">
        <path d="M20 70c25 10 60 0 70-20M20 50c20 10 50 2 60-12"
              fill="none" stroke="${accent}" stroke-width="6" stroke-linecap="round" opacity=".35"/>
        <circle cx="92" cy="32" r="4" fill="${accent}" opacity=".5"/>
      </svg>
      <!-- shuriken (generic) -->
      <svg viewBox="0 0 64 64" width="120" style="bottom:8%; right:6%;">
        <path d="M32 6l6 14 14 6-14 6-6 14-6-14-14-6 14-6z"
              fill="#1f2937" stroke="${accent}" stroke-width="2" opacity=".7"/>
      </svg>
    `,
    jdm: `
      <!-- neon car silhouette (generic sedan coupe) -->
      <svg viewBox="0 0 200 70" width="320" style="bottom:6%; right:4%;">
        <path d="M10 45c10-12 24-18 40-18h30c15 0 35 6 45 12l20 2c4 0 7 3 7 7v6H10z"
              fill="none" stroke="${cssVar('--accent','#00e5ff')}" stroke-width="3" opacity=".85"/>
        <circle cx="60" cy="54" r="8" fill="none" stroke="${cssVar('--accent-2','#ff1f70')}" stroke-width="3"/>
        <circle cx="140" cy="54" r="8" fill="none" stroke="${cssVar('--accent-2','#ff1f70')}" stroke-width="3"/>
      </svg>
      <!-- light streaks -->
      <svg viewBox="0 0 220 40" width="240" class="float" style="top:10%; left:8%;">
        <path d="M0 20 H220" stroke="${cssVar('--accent','#00e5ff')}" stroke-width="3" opacity=".18"/>
        <path d="M10 30 H190" stroke="${cssVar('--accent-2','#ff1f70')}" stroke-width="3" opacity=".18"/>
      </svg>
    `
  };

  host.innerHTML = (svg[theme] || '');
}

// Hook deco rendering into theme switching
const oldApplyTheme = applyTheme; // keep your existing function
applyTheme = function(name){
  oldApplyTheme(name);
  renderThemeDeco(name || 'default');
}

// === Optional: make Leaflet markers match the active theme ===
// Replace fixed colors with CSS-driven ones.
function themeColors(){
  return {
    main: cssVar('--accent', '#3b82f6'),
    side: '#ef4444',
    friend: cssVar('--jp-gold','#eab308')
  };
}

// If you have COLOR_MAIN / etc as consts, you can leave them,
// but update dotStyle() to read current theme:
const _origDotStyle = typeof dotStyle === 'function' ? dotStyle : null;
function dotStyle(c){
  const cols = themeColors();
  return { radius: 7, color:'#111827', weight:2,
           fillColor: c.friend ? cols.friend : (c.sideTrip ? cols.side : cols.main),
           fillOpacity:1 };
}

// Ensure decorations render on initial load too
document.addEventListener('DOMContentLoaded', ()=> renderThemeDeco(document.body.getAttribute('data-theme') || 'default'));


}
function renderItinerary(){
  itineraryList.innerHTML='';
  const g = groupByDate(data.itinerary||[]);
  Object.keys(g).sort().forEach(date=>{
    const dayWrap = document.createElement('div'); dayWrap.className='it-day';
    const head = document.createElement('div'); head.className='it-head';
    const h3   = document.createElement('h3'); h3.textContent = new Date(date).toDateString();
    const btn  = document.createElement('button'); btn.className='btn'; btn.textContent='Focus on map';
    head.append(h3, btn); dayWrap.appendChild(head);

    const itemsWrap = document.createElement('div'); itemsWrap.className='it-items'; itemsWrap.dataset.date = date;

    g[date].forEach(item=>{
      const el = document.createElement('div'); el.className='it-item'; el.draggable=true; el.dataset.id=item.id;

      // view row
      const type = document.createElement('div'); type.className='it-type'; type.textContent=item.type;
      const time = document.createElement('div'); time.className='it-time'; time.textContent=item.time||'';
      const title= document.createElement('div'); title.className='it-title';
      title.textContent = item.type==='city' ? cityNameByKey(item.ref) : (item.title||'(Untitled)');

      const edit = document.createElement('button'); edit.className='btn ok'; edit.textContent='Edit';
      const del  = document.createElement('button'); del.className='btn it-del'; del.textContent='×';

      el.append(type, time, title, edit, del);
      itemsWrap.appendChild(el);

      // focus ↔ map
      el.addEventListener('click', (e)=>{ if(e.target===edit||e.target===del) return; focusItemOnMap(item); });

      // delete
      del.addEventListener('click', ()=>{
        data.itinerary = data.itinerary.filter(x=>x.id!==item.id); save(); renderItinerary(); if(state.activeDate===date) showDayOnMap(date);
      });

      // inline edit
      edit.addEventListener('click', ()=>{
        // replace content with inline form
        el.innerHTML = '';
        const typeSel = document.createElement('select');
        typeSel.innerHTML = `
          <option value="city" ${item.type==='city'?'selected':''}>city</option>
          <option value="poi" ${item.type==='poi'?'selected':''}>poi</option>
          <option value="note" ${item.type==='note'?'selected':''}>note</option>
        `;
        const timeIn = document.createElement('input'); timeIn.type='time'; timeIn.value=item.time||'';
        const titleIn= document.createElement('input'); titleIn.type='text'; titleIn.placeholder='Title (POI/Note)'; titleIn.value=item.title||'';
        const citySel= document.createElement('select');
        citySel.innerHTML = visibleCities().filter(c=>!c.friend).map(c=>`<option value="${c.key}" ${c.key===item.ref?'selected':''}>${c.name}</option>`).join('');
        const latIn  = document.createElement('input'); latIn.type='number'; latIn.step='any'; latIn.placeholder='Lat'; latIn.value=(item.lat ?? '');
        const lonIn  = document.createElement('input'); lonIn.type='number'; lonIn.step='any'; lonIn.placeholder='Lon'; lonIn.value=(item.lon ?? '');
        const saveBtn= document.createElement('button'); saveBtn.className='btn ok'; saveBtn.textContent='Save';
        const cancel = document.createElement('button'); cancel.className='btn'; cancel.textContent='Cancel';

        const dateLabel = document.createElement('div'); dateLabel.className='it-type'; dateLabel.textContent = new Date(date).toDateString();

        function syncVis(){
          const v = typeSel.value;
          citySel.style.display = (v==='city'||v==='poi')?'':'none';
          titleIn.style.display = (v!=='city')?'':'none';
          latIn.style.display   = (v==='poi')?'':'none';
          lonIn.style.display   = (v==='poi')?'':'none';
        }
        typeSel.addEventListener('change', syncVis); syncVis();

        el.append(dateLabel, typeSel, timeIn, titleIn, citySel, latIn, lonIn, saveBtn, cancel);

        cancel.addEventListener('click', ()=> renderItinerary());

        saveBtn.addEventListener('click', ()=>{
          // write back
          item.type = typeSel.value;
          item.time = timeIn.value || '';
          if(item.type==='city'){
            item.ref = citySel.value; delete item.title; delete item.lat; delete item.lon;
          } else if(item.type==='poi'){
            item.ref = citySel.value || '';
            item.title = titleIn.value.trim() || 'POI';
            const la = parseFloat(latIn.value), lo = parseFloat(lonIn.value);
            if(Number.isFinite(la) && Number.isFinite(lo)){ item.lat=la; item.lon=lo; } else { delete item.lat; delete item.lon; }
          } else { // note
            item.title = titleIn.value.trim() || 'Note';
            delete item.ref; delete item.lat; delete item.lon;
          }
          save(); renderItinerary(); if(state.activeDate===date) showDayOnMap(date);
        });
      });

      // drag within day
      el.addEventListener('dragstart', ()=>{ el.classList.add('dragging'); });
      el.addEventListener('dragend',   ()=>{ el.classList.remove('dragging'); save(); });
    });

    // dragover to reorder within same day
    itemsWrap.addEventListener('dragover', (e)=>{
      e.preventDefault();
      const dragging = itemsWrap.querySelector('.dragging'); if(!dragging) return;
      const after = Array.from(itemsWrap.querySelectorAll('.it-item:not(.dragging)')).find(sibling=>{
        const box = sibling.getBoundingClientRect();
        return e.clientY < box.top + box.height/2;
      });
      if(after) itemsWrap.insertBefore(dragging, after); else itemsWrap.appendChild(dragging);
    });
    // on drop -> write new order back into data
    itemsWrap.addEventListener('drop', ()=>{
      const ids = Array.from(itemsWrap.querySelectorAll('.it-item')).map(el=>el.dataset.id);
      const rest = (data.itinerary||[]).filter(x=>x.date!==date);
      const reordered = ids.map(id => g[date].find(x=>x.id===id));
      data.itinerary = rest.concat(reordered);
      save(); renderItinerary(); if(state.activeDate===date) showDayOnMap(date);
    });

    // day header click → map focus
    head.addEventListener('click', ()=>{ state.activeDate = date; showDayOnMap(date); });

    dayWrap.appendChild(itemsWrap);
    itineraryList.appendChild(dayWrap);
  });
}
function focusItemOnMap(item){
  if(item.type==='city'){
    const c = data.cities.find(x=>x.key===item.ref); if(!c) return;
    zoomAndPulse(c);
  } else if(item.type==='poi'){
    const lat = item.lat, lon=item.lon;
    const coord = (lat && lon) ? [lat,lon] : null;
    if(coord){
      map.setView(coord, Math.max(map.getZoom(), 12), {animate:true});
      const pt = map.latLngToContainerPoint(coord);
      const wrap = document.createElement('div'); wrap.className='pulse-ring';
      wrap.style.left = `${pt.x}px`; wrap.style.top = `${pt.y}px`;
      map.getContainer().appendChild(wrap); setTimeout(()=>wrap.remove(),900);
    } else if(item.ref){
      const c = data.cities.find(x=>x.key===item.ref); if(c) zoomAndPulse(c);
    }
  }
}
function highlightItineraryForCity(cityKey){
  const item = (data.itinerary||[]).find(x=> x.type==='city' && x.ref===cityKey);
  if(!item) return;
  const el = itineraryList.querySelector(`.it-item[data-id="${item.id}"]`);
  if(el){ el.scrollIntoView({behavior:'smooth', block:'center'}); el.classList.add('dragging'); setTimeout(()=>el.classList.remove('dragging'),600); }
}
function showDayOnMap(date){
  state.activeDate = date;
  poiLayer.clearLayers(); dayRouteLayer.clearLayers();

  // reset marker opacity
  cityLayer.eachLayer(l=> l.setStyle && l.setStyle({opacity:1, fillOpacity:1, radius:7}));
  friendLayer.eachLayer(l=> l.setStyle && l.setStyle({opacity:1, fillOpacity:1}));

  const items = (data.itinerary||[]).filter(x=>x.date===date).sort(sortByTimeThenIndex);
  const pts = [];

  items.forEach(item=>{
    if(item.type==='note') return;
    if(item.type==='city'){
      const c = data.cities.find(cc => cc.key === item.ref); if(!c) return;
      pts.push([c.lat, c.lon]);
      const m = markerIndex.get(c.key); if(m) m.setStyle({radius:11});
    } else if(item.type==='poi'){
      const lat=item.lat, lon=item.lon;
      let coord = null;
      if(lat && lon){ coord=[lat,lon]; }
      else if(item.ref){ const c = data.cities.find(cc=>cc.key===item.ref); if(c) coord=[c.lat,c.lon]; }
      if(coord){
        pts.push(coord);
        L.circleMarker(coord, {radius:7, color:'#111827', weight:2, fillColor:'#22c55e', fillOpacity:1})
          .addTo(poiLayer)
          .bindTooltip(item.title || 'POI', {permanent:true, direction:'right', offset:[10,0], className:'city-label'})
          .on('click', ()=> focusItemOnMap(item));
      }
    }
  });

  if(pts.length>=2) L.polyline(pts, {color:'#f97316', weight:4, opacity:.9}).addTo(dayRouteLayer);
  if(pts.length) map.fitBounds(L.latLngBounds(pts), {padding:[40,40]});

  // dim non-active markers
  cityLayer.eachLayer(l => l.setStyle && l.setStyle({opacity:.25, fillOpacity:.25}));
  friendLayer.eachLayer(l => l.setStyle && l.setStyle({opacity:.15, fillOpacity:.15}));
  // re-highlight active city markers
  items.forEach(it=>{
    if(it.type==='city'){
      const m = markerIndex.get(it.ref);
      if(m) m.setStyle({opacity:1, fillOpacity:1, radius:11});
    }
  });
}

// Add itinerary (top form)
addItineraryBtn.addEventListener('click', ()=>{
  const date = itDate.value;
  const time = itTime.value || '';
  const type = itType.value;
  const ref  = itCity.value || '';
  const title= itTitle.value.trim();
  const lat  = parseFloat(itLat.value);
  const lon  = parseFloat(itLon.value);

  if(!date) return;
  if(type==='city' && !ref) return;
  if(type==='poi' && !title) return;

  const item = { id:newId(), date, time, type };
  if(type==='city'){ item.ref = ref; }
  if(type==='poi'){ item.ref = ref || ''; if(Number.isFinite(lat) && Number.isFinite(lon)) { item.lat=lat; item.lon=lon; } item.title=title; }
  if(type==='note'){ item.title = title || 'Note'; }

  data.itinerary.push(item); save();
  itTitle.value=''; itLat.value=''; itLon.value='';
  renderItinerary();
  if(state.activeDate===date) showDayOnMap(date);
});

// Type toggles visible fields
itType.addEventListener('change', ()=>{
  const v = itType.value;
  itCity.style.display = (v==='city'||v==='poi') ? '' : 'none';
  itTitle.style.display= (v!=='city') ? '' : 'none';
  itLat.style.display  = (v==='poi') ? '' : 'none';
  itLon.style.display  = (v==='poi') ? '' : 'none';
});
itType.dispatchEvent(new Event('change'));

// ====== IMPORT / EXPORT ======
const exportBtn = $('#exportBtn');
const importFile = $('#importFile');
exportBtn.addEventListener('click',()=>{
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'japan-trip-planner.json'; a.click();
  URL.revokeObjectURL(a.href);
});
importFile.addEventListener('change',(e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ try{
      const d = JSON.parse(reader.result);
      const fresh = load();
      data = {...fresh, ...d};
      data.cities = (data.cities||[]).map(c=>({friend:false, sideTrip:false, ...c}));
      data.checklist = (data.checklist||[]).map(x=> typeof x==='string'?({text:x,done:false}):x);
      if (data.shared && (!data.notes || data.notes.length===0)) {
        data.notes = [{ title:'Shared', tag:'', body:String(data.shared), ts: Date.now() }];
        delete data.shared;
      }
      data.itinerary = Array.isArray(data.itinerary) ? data.itinerary : [];
      save(); init();
    } catch(err){ alert('Invalid JSON'); } };
  reader.readAsText(file);
});

// ====== INIT ======
function init(){
  renderRoute(); drawMap(); fillBudgetCities(); renderBudget();
  renderChecklist(); renderNotes(); selectCity(); updateCountdown();
  fillItineraryCities(); renderItinerary();
  map.fitBounds(JAPAN_BOUNDS, { padding:[40,40] });
}
init();

// Add to your existing main.js — minimal theme support
// Stores selection in localStorage and toggles data-theme on <body>

const THEME_LS_KEY = 'jp_theme_v1';
const themeSelect = document.querySelector('#themeSelect');

function applyTheme(name){
  const body = document.body;
  body.setAttribute('data-theme', name || 'default');
  try{ localStorage.setItem(THEME_LS_KEY, name||'default'); }catch(e){}
}

function initTheme(){
  if(!themeSelect) return;
  const stored = localStorage.getItem(THEME_LS_KEY) || 'default';
  themeSelect.value = stored;
  applyTheme(stored);
  themeSelect.addEventListener('change', ()=> applyTheme(themeSelect.value));
}

// Call after DOM is ready
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initTheme);
}else{
  initTheme();
}

