import test from 'node:test';
import assert from 'node:assert/strict';
import { numberValue, totalRecordActual, dayOf, normalizeTechProductName, techCardPlanInKg, esc } from '../js/core.js';
import { summarizeRecords } from '../js/reports.js';
import { readStore } from '../js/storage.js';
import { mergeVersioned } from '../js/sync-merge.js';
import { buildJournalHtml } from '../js/journal.js';
import { normalizeRecord, parseSheetRecord, recordContent } from '../js/google-sheets.js';
import { ingredientContent, cardContent, activeTechCards } from '../js/tech-cards.js';
import { createTechCardUI } from '../js/tech-card-ui.js';
import { createGoogleApi } from '../js/google-api.js';

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

test('storage reads valid JSON and safely falls back on invalid JSON',()=>{
 const storage={getItem:key=>key==='good'?'[1,2]':key==='broken'?'not-json':null};
 assert.deepEqual(readStore('good',[],storage),[1,2]);
 assert.deepEqual(readStore('broken',[],storage),[]);
 assert.deepEqual(readStore('missing',{safe:true},storage),{safe:true});
});
test('versioned merge selects the newer cloud or local revision',()=>{
 const content=x=>JSON.stringify({value:x.value});
 const cloudWins=mergeVersioned({value:2,updatedAt:'2026-11-09T12:00:00Z'},{value:1,updatedAt:'2026-11-09T11:00:00Z'},'test',content);
 const localWins=mergeVersioned({value:1,updatedAt:'2026-11-09T11:00:00Z'},{value:2,updatedAt:'2026-11-09T12:00:00Z'},'test',content);
 assert.equal(cloudWins.value,2);assert.equal(localWins.value,2);
});
test('versioned merge stops on conflicting equal or missing versions',()=>{
 const content=x=>JSON.stringify({value:x.value});
 assert.throws(()=>mergeVersioned({value:1,updatedAt:'same'},{value:2,updatedAt:'same'},'тест',content),/одинаковое время изменения/);
 assert.throws(()=>mergeVersioned({value:1},{value:2},'тест',content),/без версии/);
 assert.throws(()=>mergeVersioned({value:1,_versionInvalid:true},{value:2},'тест',content),/без подтверждённой версии/);
});

test('journal groups records by day and calculates day totals',()=>{
 const html=buildJournalHtml([
  {id:'a',stamp:'2026-11-08T10:00',product:'Свинина',actualYield:10,steaks:4,unitWeight:.25,plannedYield:12},
  {id:'b',stamp:'2026-11-08T11:00',product:'Курица',actualYield:5,plannedYield:4},
  {id:'c',stamp:'2026-11-09T09:00',product:'Говядина',actualYield:3,plannedYield:3}
 ]);
 assert.equal((html.match(/class="journal-day"/g)||[]).length,2);
 assert.match(html,/2026-11-09/);
 assert.match(html,/2026-11-08/);
 assert.match(html,/Факт за день/);
 assert.match(html,/Свинина/);
 assert.match(html,/Изменить/);
});
test('journal filter, order and empty state are deterministic',()=>{
 const records=[{id:'1',stamp:'2026-11-08T10:00',product:'Первый',actualYield:1},{id:'2',stamp:'2026-11-09T10:00',product:'Второй',actualYield:2}];
 const html=buildJournalHtml(records,'2026-11-09','asc');
 assert.match(html,/Второй/);assert.doesNotMatch(html,/Первый/);
 assert.equal(buildJournalHtml([],'' ,'desc'),'<div class="empty">Записей пока нет</div>');
 assert.equal(buildJournalHtml([],'2026-11-09','desc'),'<div class="empty">За выбранную дату записей нет</div>');
});
test('journal escapes user supplied text',()=>{
 const html=buildJournalHtml([{id:'x<1',stamp:'2026-11-09T10:00',product:'<script>alert(1)</script>',actualYield:1,comment:'<img src=x>'}]);
 assert.doesNotMatch(html,/<script>/);assert.doesNotMatch(html,/<img src=x>/);
 assert.match(html,/&lt;script&gt;/);
});
test('Google Sheets record parser reads current schema and tombstones',()=>{
 const header=['ID','Дата и время','Продукт','Фактический выход','Плановый выход','Кол-во (шт)','Вес 1 шт (кг)','Комментарий','Статус','Пересчёт по техкарте','Версионный ID','Снимок данных','Время изменения','Время удаления'];
 const parsed=parseSheetRecord(['r1','2026-11-09T10:00','Свинина','10','12','4','0.25','тест','','','r1','','2026-11-09T11:00',''],header);
 assert.equal(parsed.id,'r1');assert.equal(parsed.actualYield,10);assert.equal(parsed.plannedYield,12);assert.equal(parsed.steaks,4);assert.equal(parsed.unitWeight,.25);
 const deleted=parseSheetRecord(['r1','','','','','','','','DELETE','','r1','DELETE','','2026-11-09T12:00'],header);
 assert.equal(deleted.status,'DELETE');assert.equal(deleted.deletedAt,'2026-11-09T12:00');
});
test('Google Sheets parser remains compatible with legacy headers',()=>{
 const header=['ID','Дата и время','Продукт','Фактический выход','Раскладка 1','Количество','Вес 1 шт (кг)','Приход','Плановый выход','Комментарий'];
 const parsed=parseSheetRecord(['old','2026-11-08T08:00','Курица','8','','2','0.5','','9','старый формат'],header);
 assert.equal(parsed.actualYield,8);assert.equal(parsed.plannedYield,9);assert.equal(parsed.steaks,2);assert.equal(parsed.comment,'старый формат');
});
test('Google record content excludes updatedAt but retains business data',()=>{
 const a={id:'r',product:'Свинина',actualYield:10,plannedYield:12,updatedAt:'one'};
 const b={...a,updatedAt:'two'};
 assert.equal(recordContent(a),recordContent(b));
 assert.notEqual(recordContent(a),recordContent({...a,actualYield:11}));
});
test('tech card fingerprints normalize fields and latest active version is selected',()=>{
 const card={cardId:'c1',version:1,product:'Котлеты',outputQty:'2,5',outputUnit:'кг',ingredients:[{ingredientId:'i',name:'Мясо',quantity:'1,25',unit:'кг'}]};
 assert.equal(cardContent(card),cardContent({...card,outputQty:2.5,ingredients:[{...card.ingredients[0],quantity:1.25}]}));
 assert.equal(ingredientContent({id:'i',name:'Мясо'}),ingredientContent({id:'i',name:'Мясо',unit:'кг',active:true,category:''}));
 const latest=activeTechCards([{...card,version:1},{...card,version:2},{...card,cardId:'c2',product:'Бульон',version:1},{...card,cardId:'c3',product:'Суп',version:1,active:false}]);
 assert.deepEqual(latest.map(x=>[x.cardId,x.version]),[['c2',1],['c1',2]]);
 assert.equal(latest.some(x=>x.cardId==='c3'),false);
});

test('Google API requires an in-memory access token',async()=>{
 const api=createGoogleApi({clientId:'client',sheetId:'sheet',scope:'scope',getToken:()=>null,setToken:()=>{},fetchImpl:async()=>{throw new Error('fetch must not run')}});
 await assert.rejects(api.request('/values/A1'),/Сначала подключи Google/);
 assert.equal(api.hasToken(),false);
});
test('Google API reads ranges with authorization and JSON headers',async()=>{
 let requested;
 const api=createGoogleApi({clientId:'client',sheetId:'sheet id',scope:'scope',getToken:()=>'test-token',setToken:()=>{},fetchImpl:async(url,options)=>{requested={url,options};return{ok:true,status:200,json:async()=>({values:[['A'],['B']]})}}});
 assert.deepEqual(await api.read('Records!A1:A'),[['A'],['B']]);
 assert.match(requested.url,/https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/sheet id\/values\/Records!A1%3AA/);
 assert.equal(requested.options.headers.Authorization,'Bearer test-token');
 assert.equal(requested.options.headers['Content-Type'],'application/json');
});
test('Google API writes rows with RAW value input',async()=>{
 let requested;
 const api=createGoogleApi({clientId:'client',sheetId:'sheet',scope:'scope',getToken:()=>'token',setToken:()=>{},fetchImpl:async(url,options)=>{requested={url,options};return{ok:true,status:200,json:async()=>({updatedRows:1})}}});
 const result=await api.write('Products!A1',[['Название'],['Свинина']]);
 assert.equal(result.updatedRows,1);
 assert.match(requested.url,/valueInputOption=RAW/);
 assert.equal(requested.options.method,'PUT');
 assert.deepEqual(JSON.parse(requested.options.body).values,[['Название'],['Свинина']]);
});
test('Google API clears expired token and reports unauthorized state',async()=>{
 let token='expired',cleared=false,unauthorized=0,status='';
 const api=createGoogleApi({clientId:'client',sheetId:'sheet',scope:'scope',getToken:()=>token,setToken:value=>{token=value;cleared=value===null},onUnauthorized:()=>unauthorized++,onStatus:value=>status=value,fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:'Unauthorized'}})})});
 await assert.rejects(api.request('/values/A1'),/Unauthorized/);
 assert.equal(cleared,true);assert.equal(unauthorized,1);assert.match(status,/Сессия Google истекла/);assert.equal(api.hasToken(),false);
});


test('tech card UI module renders empty directories without changing saved data',()=>{
 const elements=new Map();
 const makeElement=()=>({value:'',innerHTML:'',textContent:'',checked:false,dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return true}},addEventListener(){},scrollIntoView(){}});
 const $=id=>{if(!elements.has(id))elements.set(id,makeElement());return elements.get(id)};
 const saved={ingredients:[],techCards:[]},writes=[];
 const ui=createTechCardUI({
  $,readStore:key=>key.includes('Ingredients')?saved.ingredients:saved.techCards,
  storage:{setItem:(key,value)=>writes.push([key,value])},scheduleGoogleSync:()=>{},
  nowLocal:()=> '2026-11-09T10:00',versionNow:()=> '2026-11-09T10:00',
  numberValue:value=>Number(value)||0,normalizeTechProductName:value=>String(value||'').trim().toLowerCase(),
  techCardPlanInKg:()=>null,kg:value=>String(value),esc:value=>String(value),
  calc:()=>{},getEditing:()=>null,getProducts:()=>[],updateProducts:()=>{},
  alertFn:()=>{},confirmFn:()=>true,promptFn:()=>'',cryptoApi:{randomUUID:()=>'generated-id'},
  productsKey:'products'
 });
 ui.renderStage1();
 assert.match($('ingredientList').innerHTML,/Справочник пока пуст/);
 assert.match($('techCardList').innerHTML,/Технологических карт пока нет/);
 assert.deepEqual(writes,[]);
});

import { createGoogleSync } from '../js/google-sync.js';

test('Google sync restores local state after merge and writes expected sheet tabs',async()=>{
 const state={records:[],products:[],deletedIds:[],deletedAt:{},ingredients:[],techCards:[]};
 const writes=[],store=new Map(),statuses=[];
 const api={hasToken:()=>true,request:async path=>path.includes('fields=')?{sheets:[{properties:{title:'Ingredients'}},{properties:{title:'TechCards'}},{properties:{title:'TechCardIngredients'}}]}:{},read:async range=>range==='Products!A2:A'?[['Морковь']]:range==='Records!A2:N'?[['r1','2026-11-01T10:00','Морковь',12,10,0,0,'', '', '', 'r1','', '2026-11-01T10:01','']]:range==='Records!A1:N1'?[['ID','Дата и время','Продукт','Фактический выход','Плановый выход','Кол-во (шт)','Вес 1 шт (кг)','Комментарий','Статус','Пересчёт по техкарте','Версионный ID','Снимок данных','Время изменения','Время удаления']]:[],write:async(range,values)=>{writes.push({range,values})}};
 const storage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
 const helpers={normalizeRecord:r=>({...r}),parseSheetRecord:row=>({id:String(row[0]),stamp:String(row[1]),product:String(row[2]),actualYield:Number(row[3])||0,plannedYield:Number(row[4])||0,steaks:Number(row[5])||0,unitWeight:Number(row[6])||0,updatedAt:String(row[12]||''),status:row[8]||''}),recordContent:()=> 'fingerprint',mergeRecordLocalWins:(cloud,local)=>({...cloud,...local}),versionNow:()=>'2026-11-01T11:00:00',numberValue:value=>Number(value)||0,mergeVersioned:(cloud,local)=>({...cloud,...local}),ingredientContent:()=>'',cardContent:()=>''};
 const sync=createGoogleSync({api,storage,keys:{records:'r',products:'p',deletedIds:'d',deletedAt:'da',ingredients:'i',techCards:'tc'},getState:()=>state,setState:next=>Object.assign(state,next),helpers,ui:{$:()=>null,renderAll:()=>{},googleStatus:s=>statuses.push(s)}});
 await sync.syncGoogle();
 assert.equal(state.records.length,1);assert.equal(state.records[0].product,'Морковь');assert.deepEqual(state.products,['Морковь']);
 assert.ok(writes.some(x=>x.range==='Records!A1'));assert.ok(writes.some(x=>x.range==='Products!A1'));assert.match(statuses.at(-1),/Синхронизация завершена/);
});
