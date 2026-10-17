import {query,QUERIES,FAVORITE_ROUTES,routeStopRows} from './transit.js?v=8';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let catalog=null,catalogLoading=false,current=null,currentId=null,direction=1,revision=0,busy=false,lastAttempt=0,updatedAt=0,expired=false;
const api=(key,variables)=>query(QUERIES[key],variables,AbortSignal.timeout(20000));
function message(text){$('routeNotice').hidden=!text;$('routeNotice').textContent=text;}
function showRouteMode(enabled){$('nearbyView').hidden=enabled;$('routeView').hidden=!enabled;$('nearbyTab').setAttribute('aria-pressed',String(!enabled));$('routeTab').setAttribute('aria-pressed',String(enabled));}
async function loadCatalog(){
 if(catalog||catalogLoading){if(catalog)renderMatches();return;}catalogLoading=true;$('routeMatches').replaceChildren(el('p','正在載入路線…','loading'));message('');
 try{const d=await api('routeList',{lang:'zh'});catalog=(d.routes?.edges||[]).map(e=>e.node);renderMatches();}
 catch(e){$('routeMatches').replaceChildren();message(e.name==='TimeoutError'?'路線清單載入逾時，請再按搜尋。':e.message);}
 finally{catalogLoading=false;}
}
function renderMatches(){
 if(!catalog)return;$('routeMatches').hidden=false;const term=$('routeSearch').value.trim().toUpperCase();
 const matches=catalog.filter(r=>term?String(r.name).toUpperCase().includes(term):FAVORITE_ROUTES.includes(r.name)).sort((a,b)=>Number(b.name.toUpperCase()===term)-Number(a.name.toUpperCase()===term)||a.name.localeCompare(b.name,'zh-Hant',{numeric:true}));
 $('routeMatches').replaceChildren();
 if(!matches.length){$('routeMatches').append(el('p','找不到這個公車號碼，請確認後重試。','empty'));return;}
 for(const r of matches.slice(0,40)){const b=el('button',undefined,'route-match');b.type='button';const text=el('span',undefined,'route-match-text');text.append(el('strong',`${r.departure||'起點未提供'} ⇄ ${r.destination||'終點未提供'}`),el('small',r.description||'查看全部站點與到站時間'));b.append(el('span',r.name,'route-code'),text,el('span','↗'));b.onclick=()=>loadRoute(Number(r.id));$('routeMatches').append(b);}
 if(matches.length>40)$('routeMatches').append(el('p',`找到 ${matches.length} 條路線，請輸入更完整的號碼。`,'hint'));
}
function renderDirections(){
 $('routeDirections').replaceChildren();if(!current)return;
 const available=[...new Set((current.stations?.edges||[]).map(e=>Number(e.goBack)))].filter(d=>d===1||d===2);
 if(!available.includes(direction))direction=available[0]||1;
 for(const d of available){const dest=d===1?current.destination:current.departure;const b=el('button',`${d===1?'去程':'返程'} · 往 ${dest||'方向未提供'}`);b.type='button';b.setAttribute('aria-pressed',String(direction===d));b.onclick=()=>{direction=d;renderDirections();renderStops();};$('routeDirections').append(b);}
}
function clock(minutes){return new Date(updatedAt+minutes*60000).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit',hour12:false});}
function renderStops(){
 $('routeStopList').replaceChildren();if(!current)return;const stops=routeStopRows(current,direction);
 $('routeStopCount').textContent=`${stops.length} 站 · ${direction===1?'去程':'返程'}`;
 for(const [i,s] of stops.entries()){
  const row=el('div',undefined,'route-stop-row');const name=el('div',undefined,'route-stop-name');name.append(el('strong',s.name));const eta=el('div',undefined,`eta${s.status.live?' live':''}${s.status.soon?' soon':''}`);eta.append(el('span',s.status.text));
  if(s.status.live&&s.status.rank>=3)eta.append(el('small',`約 ${clock(s.status.rank)}`));
  if(s.status.last)name.append(el('small','末班車'));
  row.append(el('span',String(i+1),'station-seq'),name,eta);$('routeStopList').append(row);
 }
 if(!stops.length)$('routeStopList').append(el('p','這個方向目前沒有站序資料。','empty'));
 updateAge();
}
function clearEstimates(){if(current)current={...current,estimateTimes:{edges:[]}};}
async function loadRoute(id,isRefresh=false){
 if(isRefresh&&busy)return;const token=++revision;busy=true;lastAttempt=Date.now();currentId=id;message('');$('routeDetailPanel').hidden=false;$('routeRefresh').disabled=true;$('routeRefresh').textContent='查詢中…';
 if(!isRefresh){$('routeMatches').hidden=true;current=null;updatedAt=0;direction=1;$('routeTitle').textContent='正在查詢路線';$('routeEndpoints').textContent='';$('routeDirections').replaceChildren();$('routeStopCount').textContent='各站到站時間';$('routeUpdated').textContent='';$('routeStopList').replaceChildren(el('p','正在載入站序與到站資訊…','loading'));}
 try{const d=await api('routeDetail',{id,lang:'zh'});if(token!==revision)return;if(!d.route)throw new Error('找不到這條公車路線。');current=d.route;updatedAt=Date.now();expired=false;$('routeTitle').textContent=`${current.name} 公車`;$('routeEndpoints').textContent=`${current.departure||'起點未提供'} ⇄ ${current.destination||'終點未提供'}`;renderDirections();renderStops();}
 catch(e){if(token!==revision)return;updatedAt=0;clearEstimates();if(current)renderStops();else $('routeStopList').replaceChildren(el('p','查詢失敗，請按更新重試。','empty'));$('routeUpdated').textContent='更新失敗';message(e.name==='TimeoutError'?'到站查詢逾時，請再按更新。':e.message);}
 finally{if(token===revision){busy=false;$('routeRefresh').disabled=false;$('routeRefresh').textContent='↻ 更新';}}
}
function updateAge(){if(!updatedAt)return;const seconds=Math.floor((Date.now()-updatedAt)/1000);$('routeUpdated').textContent=seconds<5?'剛剛更新':`${seconds} 秒前更新`;if(seconds>90&&!expired){expired=true;clearEstimates();renderStops();message('到站資料已過期，請按更新重新查詢。');}$('routeUpdated').textContent=expired?'資料已過期':$('routeUpdated').textContent;}
$('nearbyTab').onclick=()=>showRouteMode(false);
$('routeTab').onclick=()=>{showRouteMode(true);void loadCatalog();};
$('routeSearchForm').onsubmit=e=>{e.preventDefault();if(catalog)renderMatches();else void loadCatalog();};
$('routeSearch').oninput=()=>renderMatches();
document.querySelectorAll('[data-route-shortcut]').forEach(b=>{b.onclick=async()=>{$('routeSearch').value=b.dataset.routeShortcut;await loadCatalog();renderMatches();const exact=catalog?.filter(r=>r.name.toUpperCase()===b.dataset.routeShortcut);if(exact?.length===1)void loadRoute(Number(exact[0].id));};});
$('routeRefresh').onclick=()=>{if(currentId!==null)void loadRoute(currentId,!!current);};
document.addEventListener('open-bus-route',e=>{showRouteMode(true);void loadRoute(Number(e.detail.id));});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('routeView').hidden&&currentId!==null&&Date.now()-lastAttempt>=30000)void loadRoute(currentId,!!current);});
setInterval(()=>{if(document.hidden||$('routeView').hidden)return;updateAge();if(currentId!==null&&!busy&&Date.now()-lastAttempt>=30000)void loadRoute(currentId,!!current);},1000);
