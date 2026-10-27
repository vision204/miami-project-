// A calendar year from payment approval. Clamp leap day in the target month.
// Accounting records remain durable; expired lots confer no spendable/item entitlement.
export function paymentExpiresAt(paidAt,months=12){
 if(!Number.isFinite(paidAt)||!Number.isInteger(months)||months<1||months>12)throw Error('invalid-validity');
 const d=new Date(paidAt),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.getTime();
}
export function availableGrant(order,now=Date.now()){
 const active=order.state==='FULFILLED'&&Number.isFinite(order.validUntil)&&now<order.validUntil;
 return {expired:Number.isFinite(order.validUntil)&&now>=order.validUntil,units:active?(order.grant?.remaining||0):0,items:active?(order.items||[]):[]};
}
