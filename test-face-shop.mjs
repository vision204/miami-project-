// 2026-11-21 : 옷장 애니풍 표정 구매 (buy.face) 테스트 · node server/test-face-shop.mjs
import fs from 'node:fs';import assert from 'node:assert/strict';
import {applyCommand,migrateAccount} from './economy-engine.js';
const catalog=JSON.parse(fs.readFileSync(new URL('./economy-catalog.json',import.meta.url)));
assert.deepEqual(catalog.faces.map(f=>[f.id,f.p]),[[8,5000],[9,5000]],'catalog faces');
let s=migrateAccount(null,catalog);s.property.cash=12000;
let out=applyCommand(s,{type:'buy.face',id:8},catalog);s=out.account;
assert.equal(out.result.spent,5000);assert.equal(s.property.cash,7000);assert.deepEqual(s.property.clothes.faces,[8]);console.log('ok buy anime boy');
out=applyCommand(s,{type:'buy.face',id:8},catalog);s=out.account;assert.equal(s.property.cash,7000,'no double charge');console.log('ok owned → free');
out=applyCommand(s,{type:'buy.face',id:9},catalog);s=out.account;assert.equal(s.property.cash,2000);assert.deepEqual(s.property.clothes.faces,[8,9]);console.log('ok buy anime girl');
assert.throws(()=>applyCommand(s,{type:'buy.face',id:3},catalog),e=>e.code==='unknown-item');console.log('ok basic face not sold');
let poor=migrateAccount(null,catalog);poor.property.cash=100;assert.throws(()=>applyCommand(poor,{type:'buy.face',id:9},catalog));console.log('ok not enough money');
assert.deepEqual(s.property.clothes.owned??[0],s.property.clothes.owned??[0]);console.log('PASS');
