import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distance,groupStops,routeTargets,arrivalStatus} from './transit.js';
test('opposite-side stops remain separate; colocated route records merge',()=>{
 const nodes=[{id:1,name:'同名站',lat:25,lon:121.3},{id:2,name:'同名站',lat:25,lon:121.3},{id:3,name:'同名站',lat:25.0001,lon:121.3}];const g=groupStops(nodes,{lat:25,lon:121.3});assert.equal(g.length,2);assert.deepEqual(g[0].ids,[1,2]);assert.ok(g[1].distance>10);assert.equal(distance(nodes[0],nodes[1]),0);
});
test('same route in opposite directions stays distinct',()=>{const r=routeTargets([{id:'10',routes:{edges:[{goBack:1,node:{id:'20'}},{goBack:2,node:{id:'20'}}]}}]);assert.equal(r.length,2);assert.equal(typeof r[0].stationId,'number');});
test('ETA uses minutes and service flags take priority',()=>{assert.equal(arrivalStatus({etas:[{etaTime:8}]}).text,'8 分鐘');assert.equal(arrivalStatus({etas:[{etaTime:2}]}).text,'即將到站');assert.equal(arrivalStatus({isSuspended:true,etas:[{etaTime:1}]}).live,false);assert.equal(arrivalStatus({isOperationDay:false,etas:[{etaTime:1}]}).text,'今日未營運');});
test('scheduled or missing data never becomes a live arrival',()=>{assert.equal(arrivalStatus({comeTime:'13:30',etas:[]}).text,'預定 13:30');assert.equal(arrivalStatus({comeTime:'13:30',etas:[]}).live,false);assert.equal(arrivalStatus(null).text,'暫無資料');assert.equal(arrivalStatus({etas:[{etaTime:-1}]}).live,false);});
test('provider text status is not labeled a scheduled departure',()=>{assert.equal(arrivalStatus({comeTime:'今日未營運',etas:[]}).text,'今日未營運');assert.equal(arrivalStatus({comeTime:'尚未發車',etas:[]}).live,false);});
