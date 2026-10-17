import {query,QUERIES,groupStops,routeTargets,arrivalStatus} from './transit.js';
const $=id=>document.getElementById(id);
let position=null,groups=[],selected=null,targets=[],rows=[],generation=0,lookupGeneration=0,busy=false,updatedAt=0,lastAttempt=0;
const routeCache=new Map();
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
function working(text){const p=el('div',text,'loading');$('arrivals').replaceChildren(p);}
function formatDistance(d){return d===null?'未使用定位':d<1000?`${Math.round(d)} 公尺`:`${(d/1000).toFixed(1)} 公里`;}
async function api(key,variables){return query(QUERIES[key],variables,AbortSignal.timeout(20000));}
function renderStops(){
 $('stops').replaceChildren();
 groups.slice(0,40).forEach((s,i)=>{const b=el('button',undefined,`stop${selected?.key===s.key?' active':''}`);b.type='button';b.setAttribute('aria-pressed',String(selected?.key===s.key));b.append(el('span',String(i+1).padStart(2,'0'),'stop-dot'));const t=el('span');t.append(el('strong',s.name),el('small',`${formatDistance(s.distance)} · 站點 ${i+1}`));b.append(t,el('span','↗','arrow'));b.onclick=()=>selectStop(s);$('stops').append(b);});
 if(!groups.length)$('stops').append(el('p','找不到站牌。請擴大範圍或換個站名。','empty'));
}
async function lookup(name){
 const token=++lookupGeneration;generation++;busy=false;targets=[];selected=null;rows=[];updatedAt=0;
 $('workspace').hidden=false;$('welcome').hidden=true;$('stops').replaceChildren(el('p','正在找站牌…','loading'));$('stopName').textContent='正在尋找站牌';$('stopDistance').textContent='';$('navigate').hidden=true;$('summaryText').textContent='正在查詢…';$('updated').textContent='';working('正在取得站點');notice('');
 try{
  const d=name?await api('search',{name,lang:'zh'}):await api('nearby',{location:{...position,radius:Number($('radius').value)},lang:'zh'});
  if(token!==lookupGeneration)return;
  groups=groupStops((d[name?'stationsByName':'nearStations']?.edges||[]).map(e=>e.node),position);
  if(!name)groups=groups.filter(g=>g.distance<=Number($('radius').value));
  $('listTitle').textContent=name?'搜尋結果':'附近站牌';$('radius').disabled=!!name;renderStops();
  if(groups.length)await selectStop(groups[0]);
  else{$('stopName').textContent='找不到符合的站牌';$('summaryText').textContent='請換個站名或擴大範圍';$('arrivals').replaceChildren();}
 }catch(e){if(token!==lookupGeneration)return;notice(e.name==='TimeoutError'?'查詢逾時，請重試。':e.message);$('stops').replaceChildren(el('p','查詢失敗，請重新定位或搜尋。','empty'));$('summaryText').textContent='目前無法查詢';$('stopName').textContent='尚未選擇站牌';$('arrivals').replaceChildren();}
}
async function selectStop(s){
 const token=++generation;busy=false;lastAttempt=0;$('refresh').disabled=false;$('refresh').textContent='↻ 更新';selected=s;targets=[];rows=[];updatedAt=0;renderStops();$('stopName').textContent=s.name;$('stopDistance').textContent=s.distance===null?'搜尋站點':`距你 ${formatDistance(s.distance)}（直線）`;$('navigate').hidden=false;$('navigate').href=`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=walking`;$('summaryText').textContent='正在查詢到站資訊…';$('updated').textContent='';working('正在查詢路線');notice('');
 try{
  let r=routeCache.get(s.key);if(!r){const d=await api('routes',{ids:s.ids,lang:'zh'});r=routeTargets((d.stations?.edges||[]).map(e=>e.node));routeCache.set(s.key,r);}
  if(token!==generation)return;targets=r;
  if(!r.length){$('summaryText').textContent='這個站點目前沒有路線資料';$('arrivals').replaceChildren(el('p','可選擇附近另一個站點。','empty'));return;}
  await refresh(token);
 }catch(e){if(token!==generation)return;arrivalError(e);}
}
function arrivalError(e){rows=[];updatedAt=0;$('updated').textContent='更新失敗';$('summaryText').textContent='目前無法確認公車到站';$('arrivals').replaceChildren(el('p','查詢失敗。請按「更新」重試。','empty'));notice(e.name==='TimeoutError'?'公車服務回應逾時。':e.message);}
async function refresh(token=generation){
 if(busy||!targets.length)return;busy=true;lastAttempt=Date.now();$('refresh').disabled=true;$('refresh').textContent='查詢中…';
 try{
  const d=await api('estimates',{targets:targets.map(({xno,stationId,goBack})=>({xno,stationId,goBack}))});
  if(token!==generation)return;
  const estimates=d.stationEstimates?.edges?.map(e=>e.node);
  if(!Array.isArray(estimates)||estimates.length!==targets.length)throw new Error('到站資料不完整，請稍後重試。');
  rows=targets.map((r,i)=>({...r,estimate:estimates[i],status:arrivalStatus(estimates[i])})).sort((a,b)=>a.status.rank-b.status.rank||a.name.localeCompare(b.name,'zh-Hant',{numeric:true}));updatedAt=Date.now();renderArrivals();notice('');
 }catch(e){if(token===generation)arrivalError(e);}
 finally{if(token===generation){busy=false;$('refresh').disabled=false;$('refresh').textContent='↻ 更新';}}
}
function renderArrivals(){
 $('arrivals').replaceChildren();
 for(const r of rows){const item=el('div',undefined,'route');const dest=r.goBack===1?r.destination:r.departure;const text=el('div',undefined,'route-destination');text.append(el('strong',`往 ${dest||'方向未提供'}`),el('small',`${r.goBack===1?'去程':'返程'}${r.status.last?' · 末班車':''}`));item.append(el('span',r.name,'route-code'),text,el('span',r.status.text,`eta${r.status.live?' live':''}${r.status.soon?' soon':''}`));$('arrivals').append(item);}
 const next=rows.find(r=>r.status.live);
 $('summaryText').textContent=next?`${next.name} · ${next.status.text}`:'目前沒有即時到站預估';
 updateClock();
}
function updateClock(){if(updatedAt){const age=Math.floor((Date.now()-updatedAt)/1000);$('updated').textContent=age<5?'剛剛更新':`${age} 秒前更新`;if(age>90){$('summaryText').textContent='資料已過期，請更新';$('updated').textContent='資料已過期';$('arrivals').replaceChildren(el('p','上一筆到站資訊已過期，請更新。','empty'));rows=[];}}}
$('locate').onclick=()=>{
 if(!navigator.geolocation){notice('這個瀏覽器不支援定位，請改用站名搜尋。');return;}
 $('locate').disabled=true;$('locationStatus').textContent='正在取得你的位置…';notice('');
 navigator.geolocation.getCurrentPosition(async p=>{position={lat:p.coords.latitude,lon:p.coords.longitude};$('locationStatus').textContent=`定位完成 · 誤差約 ${Math.round(p.coords.accuracy)} 公尺${p.coords.accuracy>100?'，請確認站牌位置':''}`;$('locate').disabled=false;await lookup();},e=>{$('locate').disabled=false;$('locationStatus').textContent='定位未完成。仍可使用站名搜尋。';notice(e.code===1?'位置權限未開啟。請在瀏覽器設定允許定位，或輸入站名。':e.code===2?'無法取得位置，請確認裝置定位服務已開啟。':'定位逾時，請到訊號較好的地方重試。');},{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
};
$('searchForm').onsubmit=e=>{e.preventDefault();const name=$('search').value.trim();if(!name){notice('請輸入站名，例如「桃園火車站」。');return;}lookup(name);};
$('radius').onchange=()=>{if(position)lookup();};
$('refresh').onclick=()=>{if(selected){if(targets.length)refresh();else selectStop(selected);}};
$('speak').onclick=()=>{if(!('speechSynthesis'in window)){notice('這個瀏覽器不支援朗讀。');return;}const next=rows.find(r=>r.status.live);const text=selected?`${selected.name}。${next&&updatedAt&&Date.now()-updatedAt<90000?`${next.name}，往${next.goBack===1?next.destination:next.departure}，${next.status.text}。`:'目前無法確認下一班到站時間。'}`:'請先選擇站牌。';speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='zh-TW';speechSynthesis.speak(u);};
document.addEventListener('visibilitychange',()=>{if(!document.hidden){updateClock();if(selected&&Date.now()-lastAttempt>30000)refresh();}});
setInterval(()=>{if(!document.hidden){updateClock();if(selected&&!busy&&Date.now()-lastAttempt>=30000)refresh();}},1000);
