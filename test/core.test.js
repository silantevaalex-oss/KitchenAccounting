import test from 'node:test';
import assert from 'node:assert/strict';
import { numberValue, totalRecordActual, dayOf, normalizeTechProductName, techCardPlanInKg, esc } from '../js/core.js';
import { summarizeRecords } from '../js/reports.js';

test('numberValue accepts decimal commas and grouped spaces',()=>{
 assert.equal(numberValue('1 234,5'),1234.5);
 assert.equal(numberValue('1\u00a0234,5'),1234.5);
 assert.equal(numberValue('не число'),0);
 assert.equal(numberValue(''),0);
});
test('actual yield includes recorded yield plus pieces exactly once',()=>{
 assert.equal(totalRecordActual({actualYield:10,steaks:4,unitWeight:0.25}),11);
 assert.equal(totalRecordActual({yield:8,steaks:2,unitWeight:0.5}),9);
});
test('day and product normalization are stable',()=>{
 assert.equal(dayOf('2026-11-09T12:30'),'2026-11-09');
 assert.equal(normalizeTechProductName('  Котлеты   домашние '),'котлеты домашние');
});
test('tech card output units convert to kilograms',()=>{
 assert.equal(techCardPlanInKg({outputQty:'1250',outputUnit:'г'}),1.25);
 assert.equal(techCardPlanInKg({outputQty:'2,5',outputUnit:'кг'}),2.5);
 assert.equal(techCardPlanInKg({outputQty:'250',outputUnit:'мл'}),0.25);
 assert.equal(techCardPlanInKg({outputQty:'2',outputUnit:'шт'}),null);
});
test('HTML escaping protects report output',()=>{
 assert.equal(esc('<b>Котлеты & "мясо"</b>'),'&lt;b&gt;Котлеты &amp; &quot;мясо&quot;&lt;/b&gt;');
});
test('report summary totals, product breakdown and completion percent',()=>{
 const result=summarizeRecords([
  {product:'Свинина',actualYield:10,steaks:4,unitWeight:0.25,plannedYield:12},
  {product:'Курица',actualYield:5,steaks:0,unitWeight:0,plannedYield:4},
  {product:'Свинина',actualYield:2,steaks:0,unitWeight:0,plannedYield:3}
 ]);
 assert.equal(result.actual,18);
 assert.equal(result.planned,19);
 assert.equal(result.difference,-1);
 assert.equal(result.completionPercent,18/19*100);
 assert.equal(result.count,3);
 assert.deepEqual(result.byProduct.map(x=>[x.product,x.count,x.actual,x.planned,x.difference]),[
  ['Курица',1,5,4,1],['Свинина',2,13,15,-2]
 ]);
});
test('empty report has no completion percentage',()=>{
 const result=summarizeRecords([]);
 assert.equal(result.actual,0);assert.equal(result.planned,0);assert.equal(result.completionPercent,null);assert.deepEqual(result.byProduct,[]);
});
