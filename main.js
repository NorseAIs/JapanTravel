// ====== CONFIG / DATA ======
const defaultData = {
  year: 2026,
  departure: "",
  showFriend: true,
  // Exact route order:
  cities: [
    { key:"tokyo",     name:"Tokyo",     lat:35.6895, lon:139.6917, plan:"Meet friends, Akihabara, Evangelion Store Tokyo-01", notes:"", dates:"", stay:"", transport:"Arrival", sideTrip:false },
    { key:"kawagoe",   name:"Kawagoe",   lat:35.9251, lon:139.4850, plan:"Little Edo streets, sweet potato snacks", notes:"Day/half-day from Tokyo", dates:"", stay:"", transport:"Tobu Tojo/Seibu", sideTrip:true },
    { key:"nagoya",    name:"Nagoya",    lat:35.1815, lon:136.9066, plan:"Miso katsu / hitsumabushi", notes:"Give Nagoya more time", dates:"", stay:"", transport:"Shinkansen", sideTrip:false },
    { key:"kanazawa",  name:"Kanazawa",  lat:36.5613, lon:136.6562, plan:"Kenroku-en / Omicho Market", notes:"", dates:"", stay:"", transport:"Hokuriku Shinkansen (via Tsuruga)", sideTrip:false },
    { key:"kyoto",     name:"Kyoto",     lat:35.0116, lon:135.7681, plan:"Cozy vibes", notes:"", dates:"", stay:"", transport:"Limited Express / Shinkansen", sideTrip:false },
    { key:"nara",      name:"Nara",      lat:34.6851, lon:135.8049, plan:"Tōdai-ji", notes:"Likely day trip from Kyoto/Osaka", dates:"", stay:"", transport:"Kintetsu/JR", sideTrip:true },
    { key:"hiroshima", name:"Hiroshima", lat:34.3853, lon:132.4553, plan:"Peace Memorial / okonomiyaki", notes:"Friends also going here", dates:"", stay:"", transport:"Shinkansen", sideTrip:false },
    { key:"osaka",     name:"Osaka",     lat:34.6937, lon:135.5023, plan:"Food tour, Dotonbori", notes:"", dates:"", stay:"", transport:"", sideTrip:false },
    // Friend layer (toggle)
    { key:"gunma",     name:"Gunma (friend)",     lat:36.3907, lon:139.0600, plan:"Friend side plan", notes:"", dates:"", stay:"", transport:"", sideTrip:true, friend:true },
    { key:"fukushima", name:"Fukushima (friend)", lat:37.7608, lon:140.4747, plan:"Friend side plan", notes:"", dates:"", stay:"", transport:"", sideTrip:true, friend:true }
  ],
  budget: [],
  // Checklist now stores objects: {text, done}
  checklist: ["Passport", "eSIM (Ubigi)", "IC card (Suica/PASMO)", "Gym bands"],
  // Shared notes (multi)
  notes: [],
  // Keep for migration if an old save has it:
  shared: ""
};

// ====== STORAGE / STATE ======
const LS_KEY = "jp_trip_planner_leaflet_jptheme_v3";
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    const base = JSON.parse(JSON.stringify(defaultData));
    if(!raw) return base;
    const d = JSON.parse(raw);
    // merge cities & defaults
    d.cities = (d.cities && d.cities.length ? d.cities.map(c=>({friend:false, sideTrip:false, ...c})) : base.cities);
    // migrate checklist strings -> objects
    d.checklist = (d.checklist||base.checklist).map(x => typeof x === 'string' ? ({text:x, done:false}) : x);
    // migrate old shared string -> notes[]
    if (d.shared && (!d.notes || d.notes.length===0)) {
      d.notes = [{ title:'Shared', tag:'', body:String(d.shared), ts: Date.now() }];
      delete d.shared;
    }
    return {...base, ...d};
  }catch(e){
    return JSON.parse(JSON.stringify(defaultData));
  }
}
let data = load();
const state = { selected: data.cities[0].key, dragging: null };
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(data)); }

// ====== HEADER / COUNTDOWN ======
const departInput = $('#departInput');
const countdown = $('#countdown');
const yearSpan = $('#yearSpan');
yearSpan.textContent = data.year;
if(data.departure) departInput.value = data.departure;
departInput.addEventListener('change',()=>{ data.departure = departInput.value; save(); updateCountdown(); });
function updateCountdown(){
  if(!data.departure){ countdown.textContent = ""; return }
  const now = new Date();
  const target = new Date(data.departure + 'T00:00:00');
  const diff = target - now;
  if(diff<=0){ countdown.textContent = "Itinerary live"; return }
  const days = Math.ceil(diff/86400000);
  countdown.textContent = `· ${days} days`;
}
updateCountdown();

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
    b.addEventListener('click',()=>{ state.selected=c.key; selectCity(); zoomAndPulse(c); });
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

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 12,
  minZoom: 4,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

const routeLayer  = L.layerGroup().addTo(map);
const cityLayer   = L.layerGroup().addTo(map);
const friendLayer = L.layerGroup().addTo(map);

function dotStyle(c){
  return {
    radius: 7,
    color: '#111827',
    weight: 2,
    fillColor: c.friend ? COLOR_FRIEND : (c.sideTrip ? COLOR_SIDE : COLOR_MAIN),
    fillOpacity: 1
  };
}
let markerIndex = new Map();

function drawMap(){
  routeLayer.clearLayers();
  cityLayer.clearLayers();
  friendLayer.clearLayers();
  markerIndex.clear();

  const vis = visibleCities();

  const mainPoints = vis.filter(c => !c.friend).map(c => [c.lat, c.lon]);
  if (mainPoints.length >= 2) {
    L.polyline(mainPoints, { weight: 4, color: COLOR_MAIN, opacity: 0.9 }).addTo(routeLayer);
  }

  vis.forEach((c, i) => {
    const m = L.circleMarker([c.lat, c.lon], dotStyle(c))
      .addTo(c.friend ? friendLayer : cityLayer)
      .bindTooltip(`${i+1}. ${c.name}`, { permanent: true, direction: 'right', offset: [10, 0], className: 'city-label' })
      .on('click', () => { state.selected = c.key; selectCity(); zoomAndPulse(c); });
    if (c.key === state.selected) m.setStyle({ radius: 10 });
    markerIndex.set(c.key, m);
  });

  const fit = vis.filter(c => !c.friend).map(c => [c.lat, c.lon]);
  if (fit.length) map.fitBounds(fit, { padding: [40, 40] });
}

let pulseNode = null;
function zoomAndPulse(city){
  map.setView([city.lat, city.lon], Math.max(map.getZoom(), 7), { animate: true });
  const m = markerIndex.get(city.key);
  if (m) m.setStyle({ radius: 11 });

  if (pulseNode){ pulseNode.remove(); pulseNode = null; }
  const pt = map.latLngToContainerPoint([city.lat, city.lon]);
  const wrap = document.createElement("div");
  wrap.className = "pulse-ring";
  wrap.style.left = `${pt.x}px`; wrap.style.top = `${pt.y}px`;
  map.getContainer().appendChild(wrap);
  pulseNode = wrap;
  setTimeout(()=>{ if(pulseNode){ pulseNode.remove(); pulseNode = null; } }, 900);
}
map.on('move', ()=>{
  if (!pulseNode) return;
  const c = currentCity();
  const pt = map.latLngToContainerPoint([c.lat, c.lon]);
  pulseNode.style.left = `${pt.x}px`;
  pulseNode.style.top  = `${pt.y}px`;
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
  ['budget','checklist','shared'].forEach(k=>{ $('#tab-'+k).style.display = (k===id)?'block':'none'; });
}));

// ====== BUDGET (editable) ======
const budgetCity=$('#budgetCity'), bItem=$('#bItem'), bCost=$('#bCost'),
      bPeople=$('#bPeople'), addBudget=$('#addBudget'),
      saveBudget=$('#saveBudget'), cancelEdit=$('#cancelEdit'),
      budgetTable=$('#budgetTable tbody'),
      totalCost=$('#totalCost'), totalPer=$('#totalPer');

let editingIndex = null;

function fillBudgetCities(){
  budgetCity.innerHTML='';
  visibleCities().forEach(c=>{ const o=document.createElement('option'); o.value=c.key; o.textContent=c.name; budgetCity.appendChild(o); });
}
function cityNameByKey(k){ const c=data.cities.find(x=>x.key===k); return c?c.name:k; }

function renderBudget(){
  budgetTable.innerHTML='';
  let sum=0, per=0;
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

// ====== CHECKLIST (aligned rows) ======
const checklist=$('#checklist'), cItem=$('#cItem'), addCheck=$('#addCheck'), clearChecked=$('#clearChecked');
function renderChecklist(){
  checklist.innerHTML='';
  (data.checklist||[]).forEach((it,idx)=>{
    const row = (typeof it === 'string') ? {text:it, done:false} : it;
    data.checklist[idx] = row; // normalize & persist
    const li=document.createElement('li');

    const cb=document.createElement('input');
    cb.type='checkbox'; cb.checked=!!row.done;
    cb.addEventListener('change',()=>{ data.checklist[idx].done = cb.checked; save(); renderChecklist(); });

    const span=document.createElement('span');
    span.className='item-text'+(row.done?' done':'');
    span.textContent=row.text;

    const del=document.createElement('button'); del.className='btn'; del.textContent='×'; del.title='remove';
    del.addEventListener('click',()=>{ data.checklist.splice(idx,1); save(); renderChecklist(); });

    li.append(cb, span, del);
    checklist.appendChild(li);
  });
}
addCheck.addEventListener('click',()=>{
  const t=cItem.value.trim(); if(!t) return;
  data.checklist.push({text:t, done:false}); save(); cItem.value=''; renderChecklist();
});
clearChecked.addEventListener('click',()=>{ data.checklist=[]; save(); renderChecklist(); });

// ====== SHARED NOTES (multi-note) ======
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
    edit.addEventListener('click',()=>{
      editingNoteIndex=idx;
      noteTitle.value=n.title||''; noteTag.value=n.tag||''; noteBody.value=n.body||'';
      addNoteBtn.style.display='none'; saveNoteBtn.style.display='inline-block'; cancelNoteBtn.style.display='inline-block';
    });
    const del=document.createElement('button'); del.className='btn'; del.textContent='Delete';
    del.addEventListener('click',()=>{ data.notes.splice(idx,1); save(); renderNotes(); });

    actions.append(edit, del);

    card.append(head, body);
    if(n.tag) card.append(tags);
    card.append(actions);
    notesList.appendChild(card);
  });
}
function resetNoteForm(){
  editingNoteIndex=null; noteTitle.value=''; noteTag.value=''; noteBody.value='';
  addNoteBtn.style.display='inline-block'; saveNoteBtn.style.display='none'; cancelNoteBtn.style.display='none';
}
addNoteBtn.addEventListener('click',()=>{
  const title=noteTitle.value.trim(); const tag=noteTag.value.trim(); const body=noteBody.value.trim();
  if(!title && !body) return;
  data.notes.unshift({ title, tag, body, ts: Date.now() });
  save(); resetNoteForm(); renderNotes();
});
saveNoteBtn.addEventListener('click',()=>{
  if(editingNoteIndex==null) return;
  const title=noteTitle.value.trim(); const tag=noteTag.value.trim(); const body=noteBody.value.trim();
  data.notes[editingNoteIndex] = { title, tag, body, ts: Date.now() };
  save(); resetNoteForm(); renderNotes();
});
cancelNoteBtn.addEventListener('click', resetNoteForm);

// ====== IMPORT / EXPORT ======
const exportBtn = $('#exportBtn');
const importFile = $('#importFile');
exportBtn.addEventListener('click',()=>{
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'japan-trip-planner.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
importFile.addEventListener('change',(e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ try{
      const d = JSON.parse(reader.result);
      data = load(); // start from safe defaults
      Object.assign(data, d);
      // re-run migrations in case import is old
      data.cities = (data.cities||[]).map(c=>({friend:false, sideTrip:false, ...c}));
      data.checklist = (data.checklist||[]).map(x=> typeof x==='string'?({text:x,done:false}):x);
      if (data.shared && (!data.notes || data.notes.length===0)) {
        data.notes = [{ title:'Shared', tag:'', body:String(data.shared), ts: Date.now() }];
        delete data.shared;
      }
      save(); init();
    } catch(err){ alert('Invalid JSON'); } };
  reader.readAsText(file);
});

// ====== INIT ======
function init(){
  renderRoute(); drawMap(); fillBudgetCities(); renderBudget();
  renderChecklist(); renderNotes(); selectCity(); updateCountdown();
  map.fitBounds(JAPAN_BOUNDS, { padding:[40,40] });
}
init();
