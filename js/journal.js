import { dayOf, esc, kg, numberValue, totalRecordActual } from './core.js';

export function buildJournalHtml(records,filterDate='',order='desc'){
 const filtered=records.filter(record=>!filterDate||dayOf(record.stamp)===filterDate)
  .slice().sort((a,b)=>order==='asc'?a.stamp.localeCompare(b.stamp):b.stamp.localeCompare(a.stamp));
 if(!filtered.length)return '<div class="empty">'+(filterDate?'За выбранную дату записей нет':'Записей пока нет')+'</div>';
 const groups=new Map();
 filtered.forEach(record=>{const day=dayOf(record.stamp);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(record)});
 let out='';
 [...groups.keys()].sort((a,b)=>order==='asc'?a.localeCompare(b):b.localeCompare(a)).forEach(day=>{
  const list=groups.get(day),actualSum=list.reduce((sum,r)=>sum+totalRecordActual(r),0),planSum=list.reduce((sum,r)=>sum+numberValue(r.plannedYield??r.layout1),0),diff=actualSum-planSum,qtySum=list.reduce((sum,r)=>sum+(Number(r.steaks)||0),0);
  out+='<section class="journal-day"><div class="daytitle"><span>'+esc(day)+'</span><span class="day-count">'+list.length+' обработок</span></div><div class="day-summary"><div class="journal-metric"><span>Факт за день</span><strong>'+kg(actualSum)+' кг</strong></div><div class="journal-metric"><span>План</span><strong>'+kg(planSum)+' кг</strong></div><div class="journal-metric"><span>Отклонение</span><strong class="deviation-value '+(diff>=0?'good':'bad')+'">'+(diff>0?'+':'')+kg(diff)+' кг</strong></div><div class="journal-metric"><span>Количество</span><strong>'+qtySum+' шт</strong></div></div>';
  list.forEach(r=>{
   const actual=totalRecordActual(r),plan=numberValue(r.plannedYield??r.layout1),d=actual-plan,qty=Number(r.steaks)||0,unitWeight=Number(r.unitWeight)||0;
   out+='<article class="journal-record"><div class="journal-record-head"><h3>'+esc(r.product)+'</h3><span class="journal-time">'+esc((r.stamp||'').slice(11,16))+'</span></div><div class="journal-fields"><div class="journal-field"><span>Фактический выход</span><strong class="good">'+kg(actual)+' кг</strong></div><div class="journal-field"><span>Плановый выход</span><strong>'+kg(plan)+' кг</strong></div><div class="journal-field"><span>Отклонение</span><strong class="deviation-value '+(d>=0?'good':'bad')+'">'+(d>0?'+':'')+kg(d)+' кг</strong></div><div class="journal-field"><span>Количество</span><strong>'+qty+' шт</strong></div><div class="journal-field"><span>Вес 1 шт</span><strong>'+kg(unitWeight)+' кг</strong></div></div>'+(r.comment?'<div class="journal-comment">'+esc(r.comment)+'</div>':'')+(r.techCardScale&&Array.isArray(r.techCardScale.ingredients)?'<details class="tc-scale-saved"><summary>Пересчёт по техкарте · '+esc(r.techCardScale.ingredient?.name||'ингредиент')+' — '+kg(r.techCardScale.ingredient?.quantity)+' '+esc(r.techCardScale.ingredient?.unit||'')+'</summary><div class="tc-scale-saved-meta">Коэффициент: '+Number(r.techCardScale.factor||0).toLocaleString('ru-RU',{maximumFractionDigits:4})+' · План по пересчёту: '+kg(r.techCardScale.scaledPlanKg)+' кг</div>'+r.techCardScale.ingredients.map(x=>'<div class="tc-scale-saved-row"><span>'+esc(x.name)+'</span><strong>'+Number(x.quantity||0).toLocaleString('ru-RU',{maximumFractionDigits:3})+' '+esc(x.unit||'')+'</strong></div>').join('')+'</details>':'')+'<div class="actions"><button class="secondary" data-action="edit" data-record-id="'+esc(r.id)+'">Изменить</button><button class="danger" data-action="delete" data-record-id="'+esc(r.id)+'">Удалить</button></div></article>';
  });
  out+='</section>';
 });
 return out;
}
