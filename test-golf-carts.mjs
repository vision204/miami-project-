import assert from 'node:assert/strict';import fs from 'node:fs';
import {applyCommand,applyProgress,migrateAccount} from './economy-engine.js';
import {GOLF_CARTS} from './golf-carts.js';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url)));
let a=migrateAccount({save:{property:{cash:200000,homes:[],guns:['fists'],golfCart:{owned:['crown_tourer'],equipped:'crown_tourer'}}}},catalog);
assert.deepEqual(a.property.golfCart,{owned:[],equipped:'rental'});
assert.throws(()=>applyCommand(a,{type:'equip.golfCart',id:'crown_tourer'},catalog),e=>e.code==='not-owner');
for(const q of GOLF_CARTS){const before=a.property.cash,out=applyCommand(a,{type:'buy.golfCart',id:q.id,price:1},catalog);a=out.account;assert.equal(a.property.cash,before-q.price);assert.equal(a.property.golfCart.equipped,q.id);assert.throws(()=>applyCommand(a,{type:'buy.golfCart',id:q.id},catalog),e=>e.code==='already-owned');}
const keep=structuredClone(a.property.golfCart);a=applyProgress(a,{property:{golfCart:{owned:['fake'],equipped:'fake'},cash:99999999}},catalog).account;assert.deepEqual(a.property.golfCart,keep);
a=applyCommand(a,{type:'equip.golfCart',id:'caddie_classic'},catalog).account;assert.equal(a.property.golfCart.equipped,'caddie_classic');
a=applyCommand(a,{type:'equip.golfCart',id:'rental'},catalog).account;assert.equal(a.property.golfCart.owned.length,3);
assert.throws(()=>applyCommand({...a,property:{...a.property,cash:0,golfCart:{owned:[]}}},{type:'buy.golfCart',id:'dune_runner'},catalog),e=>e.code==='insufficient-funds');
assert.equal(fs.readFileSync(new URL('./golf-carts.js',import.meta.url),'utf8'),fs.readFileSync(new URL('../assets/sports/golf-carts.js',import.meta.url),'utf8'));
console.log('PASS golf carts: prices, balance, duplicate/unowned/forged save rejection, free rental and all ownership retained');
