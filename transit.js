export const ENDPOINT='https://ebus.tycg.gov.tw/ebus/graphql';
export const QUERIES={
 nearby:`query($location:NearStationInput!,$lang:String!){nearStations(location:$location,lang:$lang){edges{node{id name lat lon}}}}`,
 search:`query($name:String!,$lang:String!){stationsByName(name:$name,lang:$lang){edges{node{id name lat lon}}}}`,
 routes:`query($ids:[Int!]!,$lang:String!){stations(ids:$ids,lang:$lang){edges{node{id ... on Station{routes{edges{goBack node{id name departure destination}}}}}}}}`,
 estimates:`query($targets:[EstimateStationInput!]!){stationEstimates(targets:$targets){edges{node{id goBack comeTime isSuspended isConstruction isEvent isOperationDay etas{etaTime isLast}}}}}`
};
export async function query(query,variables,signal){
 const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal});
 if(!response.ok)throw new Error(`公車資料服務暫時無法使用（${response.status}）`);
 const result=await response.json();
 if(result.errors?.length||!result.data)throw new Error('公車資料服務回應異常，請稍後重試。');
 return result.data;
}
export function distance(a,b){const rad=Math.PI/180;const x=Math.sin((b.lat-a.lat)*rad/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lon-a.lon)*rad/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(Math.max(0,1-x)));}
export function groupStops(nodes,position){
 const groups=new Map();
 for(const n of nodes){const lat=Number(n.lat),lon=Number(n.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<21||lat>26||lon<119||lon>123)continue;
 // Only merge records at identical coordinates. Same-name stops across a road remain separate.
 const key=`${n.name}|${lat}|${lon}`;
 if(!groups.has(key))groups.set(key,{key,name:n.name,lat,lon,ids:[],distance:position?distance(position,{lat,lon}):null});
 const ids=groups.get(key).ids;if(!ids.includes(Number(n.id)))ids.push(Number(n.id));
 }
 return [...groups.values()].sort((a,b)=>position?a.distance-b.distance:a.name.localeCompare(b.name,'zh-Hant'));
}
export function routeTargets(stations){
 const unique=new Map();
 for(const s of stations)for(const e of s.routes?.edges||[]){const r={...e.node,xno:Number(e.node.id),stationId:Number(s.id),goBack:Number(e.goBack)};const key=`${r.xno}:${r.goBack}`;if(!unique.has(key))unique.set(key,r);}
 return [...unique.values()];
}
export function arrivalStatus(n){
 if(!n)return {text:'暫無資料',live:false,rank:Infinity};
 if(n.isOperationDay===false)return {text:'今日未營運',live:false,rank:Infinity};
 if(n.isSuspended)return {text:'末班已過',live:false,rank:Infinity};
 if(n.isConstruction||n.isEvent)return {text:'改道不停靠',live:false,rank:Infinity};
 // Official etaTime is minutes, not seconds. Never infer an ETA from the timetable.
 const times=(n.etas||[]).map(e=>e.etaTime).filter(t=>typeof t==='number'&&Number.isFinite(t)&&t>=0);
 if(times.length){const min=Math.min(...times);return {text:min<1?'進站中':min<3?'即將到站':`${Math.round(min)} 分鐘`,live:true,soon:min<3,rank:min,last:n.etas.some(e=>e.etaTime===min&&e.isLast)};}
 if(n.comeTime)return {text:`預定 ${n.comeTime}`,live:false,rank:Infinity};
 return {text:'尚未發車',live:false,rank:Infinity};
}
