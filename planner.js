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
