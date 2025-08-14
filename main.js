// ====== CONFIG / DATA ======
const defaultData = {
  year: 2026,
  departure: "",
  cities: [
    { key:"tokyo",     name:"Tokyo",     lat:35.6895, lon:139.6917, plan:"Meet friends, Akihabara, Evangelion Store Tokyo-01", notes:"", dates:"", stay:"", transport:"Arrival", sideTrip:false },
    { key:"kawagoe",   name:"Kawagoe",   lat:35.9251, lon:139.4850, plan:"Little Edo streets, sweet potato snacks", notes:"Day/half-day from Tokyo", dates:"", stay:"", transport:"Tobu Tojo/Seibu", sideTrip:true },
    { key:"nagoya",    name:"Nagoya",    lat:35.1815, lon:136.9066, plan:"Miso katsu / hitsumabushi", notes:"Give Nagoya more time", dates:"", stay:"", transport:"Shinkansen", sideTrip:false },
    { key:"kanazawa",  name:"Kanazawa",  lat:36.5613, lon:136.6562, plan:"Kenroku-en / Omicho Market", notes:"", dates:"", stay:"", transport:"Hokuriku Shinkansen (via Tsuruga)", sideTrip:false },
    { key:"kyoto",     name:"Kyoto",     lat:35.0116, lon:135.7681, plan:"Cozy vibes", notes:"", dates:"", stay:"", transport:"Limited Express / Shinkansen", sideTrip:false },
    { key:"nara",      name:"Nara",      lat:34.6851, lon:135.8049, plan:"Tōdai-ji", notes:"Likely day trip from Kyoto/Osaka", dates:"", stay:"", transport:"Kintetsu/JR", sideTrip:true },
    { key:"hiroshima", name:"Hiroshima", lat:34.3853, lon:132.4553, plan:"Peace Memorial / okonomiyaki", notes:"Friends also going here", dates:"", stay:"", transport:"Shinkansen", sideTrip:false },
    { key:"osaka",     name:"Osaka",     lat:34.6937, lon:135.5023, plan:"Food tour, Dotonbori", notes:"", dates:"", stay:"", transport:"", sideTrip:false }
  ],
  budget: [],
  checklist: ["Passport", "eSIM (Ubigi)", "IC card (Suica/PASMO)", "Gym bands"],
  notes: [],
  itinerary: []
};

// ====== STORAGE / STATE ======
const LS_KEY = "jp_trip_planner_leaflet_jptheme_v6";
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    const base = structuredClone(defaultData);
    if(!raw) return base;
    const d = JSON.parse(raw);

    d.cities = (d.cities && d.cities.length ? d.cities.map(c=>({ sideTrip:false, ...c })) : base.cities)
      .filter(c => !c.friend); // drop legacy friend cities

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
setInterval(updateCountdown, 60*1000);

// ---- Month Grid (compact) ----
const monthsView = document.getElementById('monthsView');

function renderMonths(months){
  if (!monthsView) return;
  if (!Array.isArray(months) || months.length === 0){
    monthsView.innerHTML = ''; // nothing to show
    return;
  }
  monthsView.innerHTML = months.map(m => `
    <div class="mcard">
      <div class="mhdr">
        <span class="mname">${m.name}</span>
        <span class="mtemp">${m.temp ?? '—'}</span>
      </div>
      <div class="mrow">
        <span class="mlabel">Crowds</span>
        <div class="mbar ${m.crowds || 'med'}"><i></i></div>
        <span class="badge ${m.crowds || 'med'}">${m.crowds || 'med'}</span>
      </div>
      <div class="mrow">
        <span class="mlabel">Prices</span>
        <div class="mbar ${m.cost || 'med'}"><i></i></div>
        <span class="badge ${m.cost || 'med'}">${m.cost || 'med'}</span>
      </div>
      <div class="mfoot">
        ${m.rain ? `<span class="mdot"></span><span>${m.rain}</span>` : ''}
      </div>
    </div>
  `).join('');
}

/* Helper that tries to find your month data.
   Plug in your real monthly data source here. */
function getMonthsForRegion(region){
  // If you already have per-month data, return it here.
  // Expected shape: [{name:'Jan', temp:'5–10°C', rain:'low', crowds:'low|med|high', cost:'low|med|high'}, ... x12]

  // Example placeholder so the UI renders immediately:
  const NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // You can replace this table with your real per-region dataset later.
  return NAMES.map((name,i) => ({
    name,
    temp: '—',          // fill with '5–10°C' etc.
    rain: '',           // e.g. 'rainy', 'typhoon season', etc.
    crowds: (i>=2&&i<=4) ? 'high' : (i===7 ? 'high' : (i===11?'med':'low')), // example
    cost:   (i>=2&&i<=4) ? 'high' : (i===7 ? 'high' : (i===11?'med':'low')),
  }));
}

// Call on load + when region changes:
function updateWhen(){
  const r = REGION[data.region] || REGION.japan;
  avgTemp.textContent = r.t;
  rain.textContent = r.r;
  crowds.textContent = r.c;
  cost.textContent = r.$;

  // Render the compact month grid
  const months = getMonthsForRegion(data.region);
  renderMonths(months);
}


// ====== SIDEBAR / ROUTE ======
const routeList = $('#routeList');

function visibleCities(){ return data.cities; }

function renderRoute(){
  routeList.innerHTML = '';
  visibleCities().forEach((c,i)=>{
    const b = document.createElement('button');
    b.textContent = `${i+1}. ${c.name}`;
    if(c.sideTrip){
      const s=document.createElement('span');
      s.className='badge';
      s.textContent='side trip';
      b.appendChild(s);
    }
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
const poiLayer    = L.layerGroup().addTo(map);
const dayRouteLayer = L.layerGroup().addTo(map);

function dotStyle(c){
  return { radius: 7, color:'#111827', weight:2, fillColor: (c.sideTrip ? COLOR_SIDE : COLOR_MAIN), fillOpacity:1 };
}
let markerIndex = new Map();

function drawMap(){
  routeLayer.clearLayers(); cityLayer.clearLayers();
  markerIndex.clear();

  const vis = visibleCities();
  const mainPoints = vis.map(c => [c.lat, c.lon]);
  if (mainPoints.length >= 2) L.polyline(mainPoints, { weight: 4, color: COLOR_MAIN, opacity: 0.9 }).addTo(routeLayer);

  vis.forEach((c, i) => {
    const m = L.circleMarker([c.lat, c.lon], dotStyle(c))
      .addTo(cityLayer)
      .bindTooltip(`${i+1}. ${c.name}`, { permanent: true, direction: 'right', offset: [10, 0], className: 'city-label' })
      .on('click', () => { state.selected = c.key; selectCity(); zoomAndPulse(c); highlightItineraryForCity(c.key); });
    if (c.key === state.selected) m.setStyle({ radius: 10 });
    markerIndex.set(c.key, m);
  });

  const fit = vis.map(c => [c.lat, c.lon]);
  if (fit.length) map.fitBounds(fit, { padding: [40, 40] });

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

// ====== TABS (robust) ======
const tabButtons = $$('.tabs .tab');
const TAB_KEYS = tabButtons.map(btn => btn.dataset.tab);
function showTab(id){
  TAB_KEYS.forEach(k => {
    const panel = document.getElementById('tab-' + k);
    if (panel) panel.style.display = (k === id) ? 'block' : 'none';
  });
}

tabButtons.forEach(t => t.addEventListener('click', () => {
  tabButtons.forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  showTab(t.dataset.tab);

  // persist tab to URL without reloading
  const url = new URL(location.href);
  url.searchParams.set('tab', t.dataset.tab);
  history.replaceState(null, '', url.toString());
}));

// ===== URL helpers & read-only/deep-link =====
const QS = new URLSearchParams(location.search);
function getQS(key){ return QS.get(key); }
function setReadOnlyMode(on){
  document.body.setAttribute('data-readonly', on ? '1' : '0');
  if(on){ document.querySelectorAll('input,select,textarea').forEach(el => el.disabled = true); }
}

// ===== Feedback =====

const feedbackBtn = document.getElementById('feedbackBtn');
if (feedbackBtn){
  feedbackBtn.addEventListener('click', ()=>{
    const subj = encodeURIComponent('Japan Trip Planner — Feedback');
    const body = encodeURIComponent([
      'Tell me what worked and what didn’t 👇',
      '',
      '— My browser/OS:',
      navigator.userAgent,
      '',
      '— What I tried:',
      '',
      '— What I expected:',
      '',
      '— What happened instead:',
      '',
      '---',
      `URL: ${location.href}`
    ].join('\n'));
    location.href = `mailto:your.email@example.com?subject=${subj}&body=${body}`;
  });
}


// ====== BUDGET ======
const budgetCity=$('#budgetCity'), bItem=$('#bItem'), bCost=$('#bCost'),
      bPeople=$('#bPeople'), addBudget=$('#addBudget'),
      saveBudget=$('#saveBudget'), cancelEdit=$('#cancelEdit'),
      budgetTable=$('#budgetTable tbody'),
      totalCost=$('#totalCost'), totalPer=$('#totalPer');
let editingIndex = null;

function fillBudgetCities(){
  budgetCity.innerHTML='';
  visibleCities().forEach(c=>{
    const o=document.createElement('option'); o.value=c.key; o.textContent=c.name; budgetCity.appendChild(o);
  });
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
  itCity.innerHTML='';
  visibleCities().forEach(c=>{
    const o=document.createElement('option'); o.value=c.key; o.textContent=c.name; itCity.appendChild(o);
  });
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
        citySel.innerHTML = visibleCities().map(c=>`<option value="${c.key}" ${c.key===item.ref?'selected':''}>${c.name}</option>`).join('');
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
          item.type = typeSel.value;
          item.time = timeIn.value || '';
          if(item.type==='city'){
            item.ref = citySel.value; delete item.title; delete item.lat; delete item.lon;
          } else if(item.type==='poi'){
            item.ref = citySel.value || '';
            item.title = titleIn.value.trim() || 'POI';
            const la = parseFloat(latIn.value), lo = parseFloat(lonIn.value);
            if(Number.isFinite(la) && Number.isFinite(lo)){ item.lat=la; item.lon=lo; } else { delete item.lat; delete item.lon; }
          } else {
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

  cityLayer.eachLayer(l=> l.setStyle && l.setStyle({opacity:1, fillOpacity:1, radius:7}));

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

  cityLayer.eachLayer(l => l.setStyle && l.setStyle({opacity:.25, fillOpacity:.25}));
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
      data = { ...fresh, ...d };
      data.cities = (data.cities || []).map(c => ({ sideTrip: false, ...c })).filter(c => !c.friend);
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

// ====== SHAREABLE LINKS (no backend) ======
function encodeState(obj){
  try { return LZString.compressToEncodedURIComponent(JSON.stringify(obj)); }
  catch(e){ return ""; }
}
function decodeState(str){
  try { return JSON.parse(LZString.decompressFromEncodedURIComponent(str) || ""); }
  catch(e){ return null; }
}

// If URL has a shared state (#d=...), load it
(function loadFromHash(){
  const h = location.hash || "";
  if (h.startsWith("#d=")){
    const payload = h.slice(3);
    const d = decodeState(payload);
    if (d && typeof d === "object"){
      const fresh = load();
      data = { ...fresh, ...d };
      data.cities = (data.cities || []).map(c => ({ sideTrip: false, ...c })).filter(c => !c.friend);
      data.checklist = (data.checklist||[]).map(x=> typeof x==='string'?({text:x,done:false}):x);
      data.itinerary = Array.isArray(data.itinerary) ? data.itinerary : [];
      save();
    }
    history.replaceState(null, "", location.pathname + location.search);
  }
})();

// Share button → copies a URL with state encoded in the hash
const shareBtn = document.getElementById('shareBtn');
if (shareBtn){
  shareBtn?.addEventListener('click', async () => {
  const url = location.origin + location.pathname + location.search + '#d=' + encodeState(data);
  try {
    await navigator.clipboard.writeText(url);
    shareBtn.textContent = 'Copied!';
    // Screen readers: announce success without stealing focus
    document.getElementById('ariaStatus')?.replaceChildren(
      document.createTextNode('Link copied to clipboard')
    );
    setTimeout(() => (shareBtn.textContent = 'Share'), 1200);
  } catch (_) {
    prompt('Copy link:', url);
  }
});
}

document.getElementById('ariaStatus')?.replaceChildren(document.createTextNode('Link copied to clipboard'));

// ====== STARTER TEMPLATES & ONBOARDING ======================
const ONBOARD_LS = 'jp_onboard_done_v1';
const TEMPLATES = {
  firstTimer: {
    name: '7-Day First-Timer',
    cities: [
      { key:"tokyo", name:"Tokyo", lat:35.6895, lon:139.6917, plan:"Shibuya, Asakusa, teamLab", sideTrip:false },
      { key:"kyoto", name:"Kyoto", lat:35.0116, lon:135.7681, plan:"Fushimi Inari, Kiyomizu-dera, Gion", sideTrip:false },
      { key:"osaka", name:"Osaka", lat:34.6937, lon:135.5023, plan:"Dotonbori, Kuromon, Osaka Castle", sideTrip:false },
      { key:"hiroshima", name:"Hiroshima", lat:34.3853, lon:132.4553, plan:"Peace Park, Miyajima", sideTrip:false },
    ],
    days: [
      { city:"tokyo",  items:["Shibuya Crossing","Meiji Shrine","Harajuku Takeshita"] },
      { city:"tokyo",  items:["Asakusa Senso-ji","Sumida River","teamLab Planets"] },
      { city:"kyoto",  items:["Fushimi Inari","Gion walk","Kiyomizu-dera"] },
      { city:"kyoto",  items:["Arashiyama Bamboo Grove","Nishiki Market"] },
      { city:"osaka",  items:["Dotonbori food crawl","Osaka Castle"] },
      { city:"hiroshima", items:["Peace Memorial Park","Okonomiyaki"] },
      { city:"hiroshima", items:["Miyajima (Itsukushima Shrine)"] },
    ]
  },
  animeTokyo: {
    name: 'Anime Tour (Tokyo)',
    cities: [
      { key:"tokyo", name:"Tokyo", lat:35.6895, lon:139.6917, plan:"Akihabara, Nakano Broadway, Odaiba", sideTrip:false }
    ],
    days: [
      { city:"tokyo", items:["Akihabara Electric Town","Radio Kaikan","Gachapon Hall"] },
      { city:"tokyo", items:["Nakano Broadway","Mandarake complex"] },
      { city:"tokyo", items:["Odaiba DiverCity","Gundam statue","Palette Town"] },
    ]
  }  ,
fourteenDay: {
  name: '14-Day Plan',
  cities: [
    { key:"tokyo",     name:"Tokyo",     lat:35.6895, lon:139.6917, plan:"Shibuya / Asakusa / Akihabara / Evangelion Store Tokyo-01", sideTrip:false },
    { key:"nagoya",    name:"Nagoya",    lat:35.1815, lon:136.9066, plan:"Miso katsu / hitsumabushi / Osu / Toyota/SCMAGLEV museum", sideTrip:false },
    { key:"kanazawa",  name:"Kanazawa",  lat:36.5613, lon:136.6562, plan:"Kenroku-en / Omicho Market / Higashi Chaya", sideTrip:false },
    { key:"kyoto",     name:"Kyoto",     lat:35.0116, lon:135.7681, plan:"Fushimi Inari / Gion / Kiyomizu-dera / Arashiyama", sideTrip:false },
    { key:"nara",      name:"Nara",      lat:34.6851, lon:135.8049, plan:"Tōdai-ji (day trip from Kyoto/Osaka)", sideTrip:true },
    { key:"hiroshima", name:"Hiroshima", lat:34.3853, lon:132.4553, plan:"Peace Park / Miyajima / okonomiyaki", sideTrip:false },
    { key:"osaka",     name:"Osaka",     lat:34.6937, lon:135.5023, plan:"Dotonbori / Kuromon / Osaka Castle / Umeda", sideTrip:false }
  ],
  days: [
    // Tokyo (4)
    { city:"tokyo", items:["Shibuya Crossing","Meiji Shrine","Shinjuku Omoide Yokocho"] },
    { city:"tokyo", items:["Asakusa Senso-ji","Nakamise","Tokyo Skytree view"] },
    { city:"tokyo", items:["Akihabara Electric Town","Kanda Myojin","Evangelion Store Tokyo-01 (Ikebukuro)"] },
    { city:"tokyo", items:["teamLab Planets","Odaiba DiverCity Gundam","Evening transfer prep"] },

    // Nagoya (2)
    { city:"nagoya", items:["Nagoya Castle","Osu Shopping Street","Miso katsu dinner"] },
    { city:"nagoya", items:["Toyota Commemorative Museum or SCMAGLEV & Railway Park","Sakae area walk"] },

    // Kanazawa (2)
    { city:"kanazawa", items:["Kenroku-en Garden","Omicho Market lunch"] },
    { city:"kanazawa", items:["Higashi Chaya District","21st Century Museum of Contemporary Art"] },

    // Kyoto (2)
    { city:"kyoto", items:["Fushimi Inari","Gion walk","Kiyomizu-dera"] },
    { city:"kyoto", items:["Arashiyama Bamboo Grove","Nishiki Market"] },

    // Nara day trip (1)
    { city:"nara", items:["Tōdai-ji Great Buddha","Nara Park","Kasuga Taisha","Return evening"] },

    // Hiroshima (1)
    { city:"hiroshima", items:["Peace Memorial Park & Museum","Okonomiyaki"] },

    // Miyajima + Osaka (arrival) (1)
    { city:"hiroshima", items:["Miyajima (Itsukushima Shrine)","Ferry views","Evening transfer to Osaka"] },

    // Osaka (final day)
    { city:"osaka", items:["Osaka Castle","Umeda Sky Building","Dotonbori & Kuromon Market","Optional: Arima Onsen day trip from Osaka"] }
  ]
}


};

function parseISO(d){ const x=new Date(d); return isNaN(x)?null:x; }
function addDays(d, n){ const z = new Date(d); z.setDate(z.getDate()+n); return z; }
function fmtYMD(d){ return d.toISOString().slice(0,10); }

function chooseStartDate(){
  const s = departInput && departInput.value ? departInput.value : prompt("Start date (YYYY-MM-DD)?", "");
  const d = s ? parseISO(s) : null;
  return d ? fmtYMD(d) : null;
}
function applyTemplate(key){
  const tpl = TEMPLATES[key];
  if(!tpl) return;

  const start = chooseStartDate();
  if(!start) return alert("Template canceled — need a valid date.");

  data.cities = tpl.cities.map(c => ({
    key: c.key, name: c.name, lat: c.lat, lon: c.lon,
    plan: c.plan || "", notes:"", dates:"", stay:"", transport:"",
    sideTrip: !!c.sideTrip
  }));

  data.itinerary = [];
  const startDate = parseISO(start);
  tpl.days.forEach((day, idx) => {
    const date = fmtYMD(addDays(startDate, idx));
    if(day.city){
      data.itinerary.push({ id:newId(), date, time:"", type:"city", ref: day.city });
    }
    (day.items||[]).forEach(t=>{
      data.itinerary.push({ id:newId(), date, time:"", type:"poi", ref: day.city||"", title: t });
    });
  });

  state.selected = data.cities[0]?.key || state.selected;
  save();
  renderRoute(); drawMap(); fillBudgetCities(); renderBudget();
  renderChecklist(); renderNotes(); selectCity(); updateCountdown();
  fillItineraryCities(); renderItinerary();
  showTab('itinerary');
  const firstDay = document.querySelector('.it-day');
  if(firstDay) firstDay.scrollIntoView({behavior:'smooth', block:'start'});
}

// Hook up header buttons and onboarding
(function initTemplatesUI(){
  const templateBtn   = document.getElementById('templateBtn');
  const printBtn      = document.getElementById('printBtn');
  const onboardCard   = document.getElementById('onboardCard');
  const tplFirstTimer = document.getElementById('tplFirstTimer');
  const tplAnimeTour  = document.getElementById('tplAnimeTour');
    const tplFourteenDay = document.getElementById('tplFourteenDay');
  if (tplFourteenDay) tplFourteenDay.addEventListener('click', ()=> applyTemplate('fourteenDay'));

  // Optional: wire the Templates panel buttons (data-days → template key mapping)
  document.querySelectorAll('#templatesPanel .tpl').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const d = String(btn.dataset.days||'');
      if (d==='7')       applyTemplate('firstTimer');
      else if (d==='14') applyTemplate('fourteenDay');
      else if (d==='21') alert('21-day template coming soon'); // placeholder
    });
  });

  const onboardDismiss= document.getElementById('onboardDismiss');
  const showOnboard   = document.getElementById('showOnboard'); // NEW
  const initiallyActive = document.querySelector('.tabs .tab.active');
showTab((initiallyActive ? initiallyActive.dataset.tab : (TAB_KEYS[0] || 'budget')));

  // Print
  if (printBtn) { printBtn.addEventListener('click', ()=> window.print()); }

  // Template picker
  if (templateBtn) {
    templateBtn.addEventListener('click', ()=>{
      const pick = prompt("Choose a template:\n1) 7-Day First-Timer\n2) Anime Tour (Tokyo)\n\nType 1 or 2","");
      if(pick==='1') applyTemplate('firstTimer');
      else if(pick==='2') applyTemplate('animeTokyo');
    });
  }

  // Show onboarding once unless dismissed previously
  const seen = localStorage.getItem(ONBOARD_LS);
  if (!seen && onboardCard) onboardCard.style.display = 'block';

  // One-click template buttons
  if (tplFirstTimer) tplFirstTimer.addEventListener('click', ()=> applyTemplate('firstTimer'));
  if (tplAnimeTour)  tplAnimeTour.addEventListener('click',  ()=> applyTemplate('animeTokyo'));

  // Dismiss just hides and remembers your choice
  if (onboardDismiss) onboardDismiss.addEventListener('click', ()=>{
    if (onboardCard) onboardCard.style.display='none';
    localStorage.setItem(ONBOARD_LS, '1');
  });

  // NEW: bring onboarding back and persist that choice
  if (showOnboard) showOnboard.addEventListener('click', ()=>{
    localStorage.removeItem(ONBOARD_LS);     // allow it to show on next load too
    if (onboardCard) onboardCard.style.display='block';
  });
})();


// ====== RECOMMENDED (fetch JSON → cards with Add buttons) ======
let RECOMMENDED = [];
const recList = $('#recommendedList');
const recCityFilter = $('#recCityFilter');
const recCategoryFilter = $('#recCategoryFilter');

function cityKeyByName(name){
  const m = data.cities.find(c => c.name.toLowerCase() === String(name||'').toLowerCase());
  return m ? m.key : '';
}
function currentFilteredRecommended(){
  const citySel = (recCityFilter && recCityFilter.value) || '';
  const catSel  = (recCategoryFilter && recCategoryFilter.value) || '';
  return (RECOMMENDED||[]).filter(x =>
    (!citySel || String(x.city).toLowerCase() === citySel.toLowerCase()) &&
    (!catSel  || String(x.category).toLowerCase() === catSel.toLowerCase())
  );
}
function renderRecommendedList(){
  if(!recList) return;
  recList.innerHTML = '';

  const items = currentFilteredRecommended();

  if(items.length === 0){
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'No items match the filters.';
    recList.appendChild(empty);
    return;
  }

  items.forEach(x => {
    const card = document.createElement('div');
    card.className = 'note-card';

    const head = document.createElement('div'); head.className='note-head';
    const t = document.createElement('div'); t.className='note-title'; t.textContent = x.name;
    const meta = document.createElement('div'); meta.className='note-meta'; meta.textContent = `${x.city} • ${x.category}`;
    head.append(t, meta);

    const body = document.createElement('div'); body.className='note-body'; body.textContent = x.description || '';

    const actions = document.createElement('div'); actions.className='note-actions';
    const addBtn = document.createElement('button'); addBtn.className='btn ok'; addBtn.textContent='Add to Itinerary';
    addBtn.addEventListener('click', ()=>{
      const date = itDate.value || prompt('Date (YYYY-MM-DD)?', '');
      if(!date) return;
      const ref = itCity.value || cityKeyByName(x.city);
      const item = { id:newId(), date, time: itTime.value||'', type:'poi', ref, title: x.name };
      if (Number.isFinite(+x.lat) && Number.isFinite(+x.lon)) { item.lat = +x.lat; item.lon = +x.lon; }
      data.itinerary.push(item); save(); renderItinerary(); if(state.activeDate===date) showDayOnMap(date);
    });
    actions.append(addBtn);

    card.append(head, body, actions);
    recList.appendChild(card);
  });
}
function populateRecFilters(){
  if(recCityFilter){
    const cities = Array.from(new Set(RECOMMENDED.map(r => r.city))).sort();
    recCityFilter.innerHTML = '<option value="">All cities</option>' + cities.map(c=>`<option value="${c}">${c}</option>`).join('');
  }
}
function renderRecommended(){
  populateRecFilters();
  renderRecommendedList();
}
if(recCityFilter) recCityFilter.addEventListener('change', renderRecommendedList);
if(recCategoryFilter) recCategoryFilter.addEventListener('change', renderRecommendedList);

// Bulk-add recommended to a given day
const addAllRecBtn = document.getElementById('addAllRec');
if (addAllRecBtn){
  addAllRecBtn.addEventListener('click', ()=>{
    if (document.body.getAttribute('data-readonly') === '1') return;
    if (!RECOMMENDED || !RECOMMENDED.length) return;

    const date = itDate.value || prompt('Date (YYYY-MM-DD)?','');
    if(!date) return;

    const list = currentFilteredRecommended();
    if(!list.length) { alert('No items match the current filters.'); return; }

    const fallbackRef = itCity.value || '';
    list.forEach(x=>{
      const item = { id:newId(), date, time:'', type:'poi', ref: fallbackRef || cityKeyByName(x.city), title: x.name };
      if (Number.isFinite(+x.lat) && Number.isFinite(+x.lon)) { item.lat = +x.lat; item.lon = +x.lon; }
      data.itinerary.push(item);
    });

    save(); renderItinerary();
    if (state.activeDate === date) showDayOnMap(date);
    showTab('itinerary');
  });
}

fetch('recommended.json', { cache: 'no-store' })
  .then(r => r.ok ? r.json() : [])
  .then(arr => { 
    RECOMMENDED = Array.isArray(arr) ? arr : []; 
    renderRecommended();
    drawMap && drawMap(); // make sure map runs even if fetch is slow
  })
  .catch(() => { 
    RECOMMENDED = []; 
    renderRecommended();
    drawMap && drawMap(); // run map even if fetch fails
  });
// ====== WHEN TO VISIT (seasonality data + renderer) =========
// Values are illustrative, tuned to “feel right” for visitors.
// crowd: 0=Low, 1=Med, 2=High
// price: 1..4 (how expensive; more green $ = pricier)

const WHEN_DATA = {
  japan: {
    name: 'Japan (overall)',
    months: [
      { m:'Jan', hi:8,  lo:1,  crowd:0, price:1 },
      { m:'Feb', hi:9,  lo:2,  crowd:0, price:1 },
      { m:'Mar', hi:13, lo:5,  crowd:1, price:2 },
      { m:'Apr', hi:18, lo:10, crowd:2, price:3 },
      { m:'May', hi:22, lo:15, crowd:2, price:2 },
      { m:'Jun', hi:25, lo:19, crowd:1, price:2 },
      { m:'Jul', hi:29, lo:23, crowd:2, price:3 },
      { m:'Aug', hi:31, lo:24, crowd:2, price:3 },
      { m:'Sep', hi:27, lo:21, crowd:1, price:2 },
      { m:'Oct', hi:22, lo:15, crowd:1, price:2 },
      { m:'Nov', hi:17, lo:10, crowd:1, price:3 },
      { m:'Dec', hi:12, lo:5,  crowd:0, price:2 }
    ]
  },
  tokyo: {
    name: 'Tokyo (Kantō)',
    months: [
      { m:'Jan', hi:10, lo:2,  crowd:0, price:1 },
      { m:'Feb', hi:11, lo:3,  crowd:0, price:1 },
      { m:'Mar', hi:14, lo:6,  crowd:1, price:2 },
      { m:'Apr', hi:19, lo:10, crowd:2, price:3 },
      { m:'May', hi:23, lo:15, crowd:2, price:2 },
      { m:'Jun', hi:25, lo:19, crowd:1, price:2 },
      { m:'Jul', hi:29, lo:23, crowd:2, price:3 },
      { m:'Aug', hi:31, lo:24, crowd:2, price:3 },
      { m:'Sep', hi:27, lo:22, crowd:1, price:2 },
      { m:'Oct', hi:22, lo:16, crowd:1, price:2 },
      { m:'Nov', hi:17, lo:11, crowd:1, price:3 },
      { m:'Dec', hi:12, lo:6,  crowd:0, price:2 }
    ]
  },
  kansai: {
    name: 'Kyoto / Osaka (Kansai)',
    months: [
      { m:'Jan', hi:8,  lo:1,  crowd:0, price:1 },
      { m:'Feb', hi:9,  lo:2,  crowd:0, price:1 },
      { m:'Mar', hi:13, lo:5,  crowd:1, price:2 },
      { m:'Apr', hi:19, lo:10, crowd:2, price:3 },
      { m:'May', hi:23, lo:15, crowd:2, price:2 },
      { m:'Jun', hi:26, lo:20, crowd:1, price:2 },
      { m:'Jul', hi:30, lo:24, crowd:2, price:3 },
      { m:'Aug', hi:32, lo:25, crowd:2, price:3 },
      { m:'Sep', hi:28, lo:22, crowd:1, price:2 },
      { m:'Oct', hi:23, lo:16, crowd:1, price:2 },
      { m:'Nov', hi:18, lo:10, crowd:2, price:3 },
      { m:'Dec', hi:12, lo:6,  crowd:0, price:2 }
    ]
  },
  hokkaido: {
    name: 'Hokkaidō (Sapporo)',
    months: [
      { m:'Jan', hi:-1, lo:-7, crowd:1, price:2 },
      { m:'Feb', hi:0,  lo:-7, crowd:1, price:2 },
      { m:'Mar', hi:4,  lo:-3, crowd:1, price:2 },
      { m:'Apr', hi:11, lo:3,  crowd:1, price:2 },
      { m:'May', hi:17, lo:8,  crowd:1, price:2 },
      { m:'Jun', hi:21, lo:13, crowd:1, price:2 },
      { m:'Jul', hi:24, lo:17, crowd:1, price:2 },
      { m:'Aug', hi:26, lo:19, crowd:2, price:3 },
      { m:'Sep', hi:22, lo:15, crowd:1, price:2 },
      { m:'Oct', hi:16, lo:8,  crowd:1, price:2 },
      { m:'Nov', hi:8,  lo:1,  crowd:1, price:2 },
      { m:'Dec', hi:2,  lo:-4, crowd:1, price:2 }
    ]
  },
  okinawa: {
    name: 'Okinawa (Naha)',
    months: [
      { m:'Jan', hi:19, lo:14, crowd:0, price:1 },
      { m:'Feb', hi:20, lo:14, crowd:0, price:1 },
      { m:'Mar', hi:22, lo:16, crowd:1, price:2 },
      { m:'Apr', hi:25, lo:19, crowd:1, price:2 },
      { m:'May', hi:27, lo:22, crowd:1, price:2 },
      { m:'Jun', hi:29, lo:25, crowd:1, price:2 },
      { m:'Jul', hi:32, lo:26, crowd:2, price:3 },
      { m:'Aug', hi:32, lo:27, crowd:2, price:3 },
      { m:'Sep', hi:31, lo:26, crowd:1, price:2 },
      { m:'Oct', hi:28, lo:23, crowd:1, price:2 },
      { m:'Nov', hi:24, lo:20, crowd:0, price:2 },
      { m:'Dec', hi:21, lo:16, crowd:0, price:2 }
    ]
  }
};

function crowdLabel(n){ return n===2?'High':(n===1?'Med':'Low'); }
function crowdClass(n){ return n===2?'high':(n===1?'med':'low'); }

function renderWhen(cityKey){
  const grid = document.getElementById('whenGrid');
  if(!grid) return;
  const city = WHEN_DATA[cityKey] || WHEN_DATA.japan;
  grid.innerHTML = '';

  city.months.forEach(row=>{
    const box = document.createElement('div');
    box.className = 'when-month';
    box.innerHTML = `
      <strong>${row.m}</strong>
      <div class="temp">${row.hi}°C / ${row.lo}°C</div>
      <div class="crowd ${crowdClass(row.crowd)}">${crowdLabel(row.crowd)}</div>
      <div class="price-dollars">
        <span class="dollar ${row.price>=1?'on':'off'}">$</span>
        <span class="dollar ${row.price>=2?'on':'off'}">$</span>
        <span class="dollar ${row.price>=3?'on':'off'}">$</span>
        <span class="dollar ${row.price>=4?'on':'off'}">$</span>
      </div>
    `;
    grid.appendChild(box);
  });
}

const whenCitySel = document.getElementById('whenCitySel');
if (whenCitySel){
  whenCitySel.addEventListener('change', ()=> renderWhen(whenCitySel.value));
}


// ====== INIT ======
function init(){
  // Deep-link tab via ?tab=...
  const urlTab = getQS('tab');
  if (urlTab) {
    const btn = document.querySelector(`.tabs .tab[data-tab="${urlTab}"]`);
    if (btn) {
      document.querySelectorAll('.tabs .tab').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
    }
  }

  // Public view via ?public=1 or ?mode=public
  const isPublic = getQS('public') === '1' || getQS('mode') === 'public';
  if (isPublic) setReadOnlyMode(true);

    // Tips: When to visit (default to Japan overall)
  renderWhen((document.getElementById('whenCitySel')?.value) || 'japan');

  const banner = document.getElementById('publicBanner');
if (banner) banner.style.display = isPublic ? 'block' : 'none';


  renderRoute(); drawMap(); fillBudgetCities(); renderBudget();
  renderChecklist(); renderNotes(); selectCity(); updateCountdown();
  fillItineraryCities(); renderItinerary();

  const initiallyActive = document.querySelector('.tabs .tab.active');
  showTab((initiallyActive ? initiallyActive.dataset.tab : (TAB_KEYS[0] || 'budget')));
  map.fitBounds(JAPAN_BOUNDS, { padding:[40,40] });
}
init();

