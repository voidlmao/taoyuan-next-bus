import {distance,routeStopRows,routeDestination} from './transit.js?v=8';

export function commonRouteIds(stations,originIds,destinationIds){
 const from=new Set(originIds.map(String)),to=new Set(destinationIds.map(String));const originRoutes=new Set(),destinationRoutes=new Set();
 for(const s of stations){for(const e of s.routes?.edges||[]){const key=`${e.node.id}:${e.goBack}`;if(from.has(String(s.id)))originRoutes.add(key);if(to.has(String(s.id)))destinationRoutes.add(key);}}
 return [...new Set([...originRoutes].filter(key=>destinationRoutes.has(key)).map(key=>Number(key.split(':')[0])))];
}

export function directJourneys(routes,originIds,destinationIds,origin,destination,originRadius,destinationRadius){
 const from=new Set(originIds.map(String)),to=new Set(destinationIds.map(String)),results=[];
 for(const route of routes){for(const goBack of [1,2]){const stops=routeStopRows(route,goBack);let best=null;
  for(let i=0;i<stops.length;i++){const board=stops[i];if(!from.has(String(board.id)))continue;const walkTo=distance(origin,board);if(walkTo>originRadius)continue;
   for(let j=i+1;j<stops.length;j++){const alight=stops[j];if(!to.has(String(alight.id)))continue;const walkFrom=distance(destination,alight);if(walkFrom>destinationRadius)continue;
    const trip={fetchedAt:route.fetchedAt,routeId:Number(route.id),name:route.name,goBack,towards:routeDestination({...route,goBack}),board,alight,rideStops:j-i,walkTo,walkFrom};
    if(!best||walkTo+walkFrom<best.walkTo+best.walkFrom)best=trip;
   }
  }
  if(best)results.push(best);
 }}
 const tier=r=>r.board.status.live?0:r.board.status.text.startsWith('預定 ')?1:r.board.status.text==='尚未發車'?2:3;
 return results.sort((a,b)=>tier(a)-tier(b)||a.board.status.rank-b.board.status.rank||(a.walkTo+a.walkFrom)-(b.walkTo+b.walkFrom));
}

// Candidate paths only: live estimates do not predict a successful connection.
export function endpointRouteIds(stations,ids){
 const selected=new Set(ids.map(String));return [...new Set(stations.filter(s=>selected.has(String(s.id))).flatMap(s=>(s.routes?.edges||[]).map(e=>Number(e.node.id))))];
}
export function transferJourneys(routes,originIds,destinationIds,origin,destination,originRadius,destinationRadius,maxTransferWalk=250){
 const from=new Set(originIds.map(String)),to=new Set(destinationIds.map(String)),first=[],second=[];
 for(const route of routes)for(const goBack of [1,2]){
  const stops=routeStopRows(route,goBack),base={routeId:Number(route.id),name:route.name,goBack,towards:routeDestination({...route,goBack}),fetchedAt:route.fetchedAt};
  for(let x=0;x<stops.length;x++){
   let board=null,alight=null;
   for(let i=0;i<x;i++)if(from.has(String(stops[i].id))&&distance(origin,stops[i])<=originRadius){const walk=distance(origin,stops[i]);if(!board||walk<board.walk)board={stop:stops[i],index:i,walk};}
   for(let j=x+1;j<stops.length;j++)if(to.has(String(stops[j].id))&&distance(destination,stops[j])<=destinationRadius){const walk=distance(destination,stops[j]);if(!alight||walk<alight.walk)alight={stop:stops[j],index:j,walk};}
   if(board)first.push({...base,board:board.stop,alight:stops[x],rideStops:x-board.index,walkTo:board.walk});
   if(alight)second.push({...base,board:stops[x],alight:alight.stop,rideStops:alight.index-x,walkFrom:alight.walk});
  }
 }
 const buckets=new Map(),cell=.003,key=(y,x)=>`${y}:${x}`;
 for(const leg of second){const y=Math.floor(Number(leg.board.lat)/cell),x=Math.floor(Number(leg.board.lon)/cell),k=key(y,x);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(leg);}
 const best=new Map();
 for(const a of first){const y=Math.floor(Number(a.alight.lat)/cell),x=Math.floor(Number(a.alight.lon)/cell);
  for(let dy=-1;dy<=1;dy++)for(let dx=-2;dx<=2;dx++)for(const b of buckets.get(key(y+dy,x+dx))||[]){
   if(a.routeId===b.routeId)continue;const transferWalk=distance(a.alight,b.board);if(transferWalk>maxTransferWalk)continue;
   // Do not suggest going back to the starting pole or riding beyond the destination and back.
   if(String(a.board.id)===String(b.alight.id))continue;
   const score=a.walkTo+b.walkFrom+transferWalk+(a.rideStops+b.rideStops)*20;
   const k=`${a.routeId}:${a.goBack}>${b.routeId}:${b.goBack}`,old=best.get(k);
   if(!old||score<old.score)best.set(k,{kind:'transfer',legs:[a,b],name:`${a.name} → ${b.name}`,board:a.board,alight:b.alight,walkTo:a.walkTo,walkFrom:b.walkFrom,transferWalk,rideStops:a.rideStops+b.rideStops,fetchedAt:Math.min(a.fetchedAt||Date.now(),b.fetchedAt||Date.now()),score});
  }
 }
 return [...best.values()].sort((a,b)=>a.score-b.score).slice(0,12);
}
export function transitMapUrl(place){
 const url=new URL('https://www.google.com/maps/dir/');url.search=new URLSearchParams({api:'1',destination:[place.name,place.address].filter(Boolean).join(' '),travelmode:'transit',hl:'zh-TW'});return url.href;
}
