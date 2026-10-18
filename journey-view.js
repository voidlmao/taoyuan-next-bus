import {query,QUERIES,distance} from './transit.js?v=8';
import {commonRouteIds,directJourneys,endpointRouteIds,transferJourneys,transitMapUrl} from './planner.js?v=14';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const api=(key,variables)=>query(QUERIES[key],variables,AbortSignal.timeout(25000));
const placeCache=new Map();let lastPlaceQuery=0,destination=null,busy=false,searchToken=0,planToken=0,trips=[],snapshot=0,staleSignature='';
function message(text){$('journeyNotice').textContent=text;$('journeyNotice').hidden=!text;}
function showJourney(){for(const id of ['nearbyView','routeView'])$(id).hidden=true;$('journeyView').hidden=false;for(const id of ['nearbyTab','routeTab'])$(id).setAttribute('aria-pressed','false');$('journeyTab').setAttribute('aria-pressed','true');}
function clearPlan(){planToken++;busy=false;$('journeyPlan').disabled=!destination;trips=[];snapshot=0;$('journeyResults').replaceChildren();$('journeyResultTitle').textContent='';$('journeyUpdated').textContent='';}
async function searchPlaces(term){
 if(placeCache.has(term))return placeCache.get(term);
 const gap=1100-(Date.now()-lastPlaceQuery);if(gap>0)await new Promise(r=>setTimeout(r,gap));lastPlaceQuery=Date.now();
 const url=new URL('https://photon.komoot.io/api/');url.search=new URLSearchParams({q:term,lang:'default',limit:'6',bbox:'119,21.5,123,26.2'});
 const responses=await Promise.allSettled([
  fetch(url,{signal:AbortSignal.timeout(20000),credentials:'omit'}).then(async r=>{if(!r.ok)throw new Error('地標服務暫時無法使用');const d=await r.json();return (d.features||[]).map(f=>{const p=f.properties||{},[lon,lat]=f.geometry.coordinates;return {lat,lon,name:p.name||[p.street,p.housenumber].filter(Boolean).join(' '),address:[p.city,p.district,p.street,p.housenumber].filter(Boolean).join(' '),source:'地標／地址'};});}),
  api('search',{name:term,lang:'zh'}).then(d=>(d.stationsByName?.edges||[]).map(e=>({...e.node,source:'公車站點',address:'桃園公車資料'})))
 ]);
 const places=[];for(const result of responses)if(result.status==='fulfilled')for(const p of result.value){p.lat=Number(p.lat);p.lon=Number(p.lon);if(!p.name||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;if(!places.some(a=>a.name===p.name&&distance(a,p)<80))places.push(p);}
 if(responses.every(r=>r.status==='rejected'))throw new Error('目的地搜尋暫時無法使用，請稍後重試。');
 const output={places:places.slice(0,10),limited:responses.some(r=>r.status==='rejected')};placeCache.set(term,output);return output;
}
function selectPlace(place){destination=place;clearPlan();$('placeResults').replaceChildren();$('destinationCard').hidden=false;$('transitPlan').href=transitMapUrl(place);$('destinationName').textContent=place.name;$('destinationAddress').textContent=place.address||'請確認目的地位置';$('journeyPlan').disabled=false;message('');}
async function lookupPlace(e){e.preventDefault();const term=$('destinationSearch').value.trim();if(!term){message('請輸入地標或地址，例如「桃園火車站」。');return;}const token=++searchToken;clearPlan();destination=null;$('destinationCard').hidden=true;$('journeyPlan').disabled=true;$('destinationSubmit').disabled=true;$('placeResults').replaceChildren(el('p','正在搜尋目的地…','loading'));message('');
 try{const {places,limited}=await searchPlaces(term);if(token!==searchToken)return;$('placeResults').replaceChildren();for(const p of places){const b=el('button',undefined,'place-result');b.type='button';b.append(el('strong',p.name),el('small',`${p.address||''} · ${p.source}`));b.onclick=()=>selectPlace(p);$('placeResults').append(b);}if(!places.length)message(limited?'地標搜尋服務暫時無法取得結果，請稍後再試，或改輸入附近公車站名。':'找不到這個地標或地址。請加上縣市、路名，或改輸入附近公車站名。');else if(limited)message('部分地標資料暫時無法取得，以下顯示可用結果。');}
 catch(error){if(token===searchToken){$('placeResults').replaceChildren();message(error.message);}}
 finally{if(token===searchToken)$('destinationSubmit').disabled=false;}
}
function getPosition(){return new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(new Error('此瀏覽器無法定位，請在支援定位的瀏覽器開啟。'));return;}navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy}),e=>reject(new Error(e.code===1?'位置權限被拒絕，請允許此網站定位後重試。':'無法取得目前位置，請確認定位服務後重試。')),{enableHighAccuracy:true,timeout:15000,maximumAge:15000});});}
async function inBatches(items,size,parallel,fn,active=()=>true){const output=[];for(let i=0;i<items.length;i+=size*parallel){if(!active())throw new Error('查詢已取消');const group=[];for(let j=i;j<Math.min(items.length,i+size*parallel);j+=size)group.push(fn(items.slice(j,j+size)));output.push(...await Promise.all(group));}return output;}
function progress(text){$('journeyResults').replaceChildren(el('p',text,'loading'));}
async function runPlan(){
 if(busy||!destination)return;busy=true;const token=++planToken;const goal={...destination};trips=[];snapshot=0;$('journeyPlan').disabled=true;message('');$('journeyResultTitle').textContent='';$('journeyUpdated').textContent='';progress('正在取得目前位置…');
 try{
  const origin=await getPosition();if(token!==planToken)return;const radius=Number($('journeyRadius').value),endRadius=Number($('destinationRadius').value);$('journeyOrigin').textContent=`目前位置 · 誤差約 ${Math.round(origin.accuracy)} 公尺`;progress('正在找起點與目的地附近的站牌…');
  const [a,b]=await Promise.all([api('nearby',{location:{lat:origin.lat,lon:origin.lon,radius},lang:'zh'}),api('nearby',{location:{lat:goal.lat,lon:goal.lon,radius:endRadius},lang:'zh'})]);if(token!==planToken)return;
  const near=(d,p,r)=>(d.nearStations?.edges||[]).map(e=>e.node).filter(s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lon))&&distance(p,s)<=r).sort((x,y)=>distance(p,x)-distance(p,y));
  const allFrom=near(a,origin,radius),allTo=near(b,goal,endRadius),from=allFrom.slice(0,600),to=allTo.slice(0,400),warnings=[];
  if(allFrom.length>from.length||allTo.length>to.length)warnings.push('站牌較多，本次比對最靠近起點與目的地的部分站牌紀錄。');
  if(!from.length||!to.length){$('journeyResults').replaceChildren();$('journeyResultTitle').textContent=!from.length?'目前位置附近沒有找到站牌':'目的地附近沒有找到站牌';message('桃園公車資料未涵蓋這一端附近的站牌，不代表沒有交通路線。請使用目的地下方的「跨市／公車捷運轉乘」。');return;}
  const fromIds=[...new Set(from.map(s=>Number(s.id)))],toIds=[...new Set(to.map(s=>Number(s.id)))],ids=[...new Set([...fromIds,...toIds])];progress('正在比對兩端可搭乘的路線…');
  const batches=await inBatches(ids,60,2,part=>api('routes',{ids:part,lang:'zh'}),()=>token===planToken);if(token!==planToken)return;const stations=batches.flatMap(d=>(d.stations?.edges||[]).map(e=>e.node));const found=new Set(stations.map(s=>Number(s.id)));if(ids.some(id=>!found.has(id)))warnings.push('部分站牌缺少路線資料，結果可能不完整。');
  const common=commonRouteIds(stations,fromIds,toIds),aIds=endpointRouteIds(stations,fromIds),bIds=endpointRouteIds(stations,toIds);const candidateIds=[...new Set([...common.slice(0,20),...aIds.slice(0,20),...bIds.slice(0,20)])];if(common.length>20||aIds.length>20||bIds.length>20)warnings.push('路線較多，本次各取部分起點與目的地路線，結果可能不完整。');
  let failed=0;progress('正在確認行車方向、上下車站序與到站時間…');
  const details=await inBatches(candidateIds,1,3,async part=>{try{const route=(await api('routeDetail',{id:part[0],lang:'zh'})).route;if(!route)failed++;return route?{...route,fetchedAt:Date.now()}:null;}catch{failed++;return null;}},()=>token===planToken);if(token!==planToken)return;if(failed)warnings.push('部分路線查詢失敗，結果可能不完整。');
  const routes=details.filter(Boolean);trips=[...directJourneys(routes,fromIds,toIds,origin,goal,radius,endRadius),...transferJourneys(routes,fromIds,toIds,origin,goal,radius,endRadius)];snapshot=Date.now();$('journeyResultTitle').textContent=trips.length?`找到 ${trips.length} 個搭乘候選`:warnings.length?'目前無法確認有可搭路線':'本次未找到直達或一次轉乘候選';
  if(!trips.length){$('journeyResults').replaceChildren(el('p','可擴大站牌範圍再試，或用目的地下方「跨市／公車捷運轉乘」查詢完整交通方案。','empty'));}else renderJourneys();
  if(warnings.length)message(warnings.join(' '));
 }catch(error){if(token===planToken){$('journeyResults').replaceChildren();$('journeyResultTitle').textContent='規劃未完成';message(error.name==='TimeoutError'?'公車資料查詢逾時，請重試。':error.message);}}
 finally{if(token===planToken){busy=false;$('journeyPlan').disabled=!destination;$('journeyPlan').textContent='從目前位置重新規劃';}}
}
function navLink(text,lat,lon){const a=el('a',text,'journey-link');a.href=`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`;a.target='_blank';a.rel='noopener';return a;}
function renderJourneys(){
 $('journeyResults').replaceChildren();staleSignature=trips.slice(0,12).map(t=>Date.now()-(t.fetchedAt||snapshot)>90000?'1':'0').join('');$('journeyUpdated').textContent=staleSignature.includes('1')?'部分到站資訊已過期，請重新規劃':`查詢於 ${new Date(snapshot).toLocaleTimeString('zh-TW',{hour12:false,hour:'2-digit',minute:'2-digit'})}`;
 for(const t of trips.slice(0,12)){if(t.kind==='transfer'){renderTransfer(t);continue;}const stale=Date.now()-(t.fetchedAt||snapshot)>90000;const card=el('article',undefined,'journey-card');const head=el('div',undefined,'section-head');head.append(el('strong',`${t.name} 往 ${t.towards}`),el('span',stale?'請更新':t.board.status.text,`eta${!stale&&t.board.status.live?' live':''}`));card.append(head);
  const steps=el('ol',undefined,'journey-steps');steps.append(el('li',`到「${t.board.name}」上車 · 距你 ${Math.round(t.walkTo)} 公尺（直線）`),el('li',`搭乘 ${t.rideStops} 站，不需轉乘`),el('li',`在「${t.alight.name}」下車 · 距目的地 ${Math.round(t.walkFrom)} 公尺（直線）`));card.append(steps);
  const actions=el('div',undefined,'journey-actions');actions.append(navLink('走到上車站 ↗',t.board.lat,t.board.lon));const route=el('button','查看完整路線','text-button');route.type='button';route.onclick=()=>document.dispatchEvent(new CustomEvent('open-bus-route',{detail:{id:t.routeId,name:t.name}}));actions.append(route);card.append(actions);$('journeyResults').append(card);
 }
 if(trips.length>12)$('journeyResults').append(el('p','目前顯示前 12 個搭乘方向。','hint'));
}

function renderTransfer(t){
 const [a,b]=t.legs,card=el('article',undefined,'journey-card');card.append(el('strong',`${a.name} → ${b.name} · 轉乘一次`));
 const steps=el('ol',undefined,'journey-steps');const stale=Date.now()-(t.fetchedAt||snapshot)>90000;
 steps.append(el('li',`到「${a.board.name}」搭 ${a.name} 往 ${a.towards} · 距你 ${Math.round(t.walkTo)} 公尺（直線）`),el('li',`第一段到站：${stale?'請更新':a.board.status.text}；搭 ${a.rideStops} 站，在「${a.alight.name}」下車`),el('li',`前往「${b.board.name}」轉搭 ${b.name} 往 ${b.towards} · 轉乘距離 ${Math.round(t.transferWalk)} 公尺（直線）`),el('li',`第二段搭 ${b.rideStops} 站，在「${b.alight.name}」下車 · 距目的地 ${Math.round(t.walkFrom)} 公尺（直線）`));card.append(steps,el('p','第二段班次尚未銜接計算，可能需要等車；請在轉乘時重新查到站。步行路線與過街位置請先確認。','hint'));
 const actions=el('div',undefined,'journey-actions');actions.append(navLink('走到第一段上車站 ↗',a.board.lat,a.board.lon));for(const leg of t.legs){const button=el('button',`查 ${leg.name} 各站`,'text-button');button.type='button';button.onclick=()=>document.dispatchEvent(new CustomEvent('open-bus-route',{detail:{id:leg.routeId,name:leg.name}}));actions.append(button);}card.append(actions);$('journeyResults').append(card);
}
$('journeyTab').onclick=showJourney;
$('destinationForm').onsubmit=lookupPlace;
$('journeyPlan').onclick=runPlan;
for(const id of ['journeyRadius','destinationRadius'])$(id).onchange=()=>{clearPlan();message('範圍已調整，請重新規劃。');};
setInterval(()=>{if(!$('journeyView').hidden&&trips.length&&snapshot&&trips.slice(0,12).map(t=>Date.now()-(t.fetchedAt||snapshot)>90000?'1':'0').join('')!==staleSignature)renderJourneys();},1000);
