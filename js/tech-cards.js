import { numberValue } from './core.js';
export function ingredientContent(item){return JSON.stringify({id:String(item.id),name:String(item.name||''),unit:String(item.unit||'кг'),category:String(item.category||''),active:item.active!==false})}
export function cardContent(card){return JSON.stringify({cardId:String(card.cardId),version:Number(card.version)||1,product:String(card.product||''),outputQty:numberValue(card.outputQty),outputUnit:String(card.outputUnit||'кг'),createdAt:String(card.createdAt||''),comment:String(card.comment||''),ingredients:(card.ingredients||[]).map(item=>({ingredientId:String(item.ingredientId||''),name:String(item.name||''),quantity:numberValue(item.quantity),unit:String(item.unit||'кг')})),active:card.active!==false})}
export function activeTechCards(cards){
 const latest=new Map();
 cards.forEach(card=>{const previous=latest.get(card.cardId);if(!previous||Number(card.version)>Number(previous.version))latest.set(card.cardId,card)});
 return [...latest.values()].filter(card=>card.active!==false).sort((a,b)=>a.product.localeCompare(b.product,'ru'));
}
