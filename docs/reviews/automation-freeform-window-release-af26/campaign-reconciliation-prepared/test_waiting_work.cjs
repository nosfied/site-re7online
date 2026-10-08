const test = require('node:test');
const assert = require('node:assert/strict');
const {noWork} = require('./waiting-work.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const expected = {version:1,guardMustRemainClosed:true,jobs:[{id:'job',clientId:'tenant',status:'queued',leaseToken:null,leaseExpiresAt:null,attempt:0}],groups:[{id:'group',clientId:'tenant',status:'scheduled'}],sendingScheduled:[{id:'controller',clientId:'tenant',status:'scheduled'}],leases:0};
const actual = () => ({jobs:clone(expected.jobs),groups:clone(expected.groups),sendingScheduled:clone(expected.sendingScheduled),leases:0});
test('known waiting job is preserved; no active lease',()=>noWork(actual(),expected));
test('unknown job/client rejects',()=>{const q=actual();q.jobs.push({...q.jobs[0],id:'unknown',clientId:'other'});assert.throws(()=>noWork(q,expected),/drift/)});
test('running job and changed attempt reject',()=>{let q=actual();q.jobs[0].status='running';assert.throws(()=>noWork(q,expected),/not_inactive/);q=actual();q.jobs[0].attempt=1;assert.throws(()=>noWork(q,expected),/not_inactive/)});
test('admission intent and any unresolved lease reject',()=>{assert.throws(()=>noWork(actual(),{...expected,guardMustRemainClosed:false}),/closed_guard/);assert.throws(()=>noWork({...actual(),leases:1},expected),/lease/)});
test('missing/null/falsy collections reject',()=>{for(const value of [null,false,'',undefined])assert.throws(()=>noWork({...actual(),jobs:value},expected),/array/)});
test('group/controller removed or changed reject',()=>{assert.throws(()=>noWork({...actual(),groups:[]},expected),/drift/);const q=actual();q.sendingScheduled[0].status='sending';assert.throws(()=>noWork(q,expected),/not_inactive/)});

test('unknown/running/queued batch states reject even when copied to expected',()=>{for(const status of ['queued','running','needs_review','unexpected']){const q=actual();q.groups[0].status=status;assert.throws(()=>noWork(q,{...expected,groups:clone(q.groups)}),/group_not_inactive/)}});
