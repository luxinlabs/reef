import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleCampaign, approveDraft, editDraft, validatePublish } from '../lib/domain.ts';
import { publicWebsite, websiteText } from '../lib/ingest.ts';

test('sample campaigns cannot approve or publish',()=>{
 const c=sampleCampaign();assert.throws(()=>approveDraft(c.drafts[0],'owner',true),/Sample/);
 assert.throws(()=>validatePublish(c,c.drafts[0]),/Sample/);
});
test('approval is invalidated by edits',()=>{
 const c=sampleCampaign();c.demo=false;const approved=approveDraft(c.drafts[0],'owner',false);
 assert.doesNotThrow(()=>validatePublish(c,approved));const changed=editDraft(approved,'A new claim');
 assert.equal(changed.approval,undefined);assert.equal(changed.version,2);
 assert.throws(()=>validatePublish(c,changed),/Approve/);
});
test('stale approvals cannot publish',()=>{
 const c=sampleCampaign();c.demo=false;const d=approveDraft(c.drafts[0],'owner',false);d.version++;
 assert.throws(()=>validatePublish(c,d),/Approve/);
});
test('HN cannot be automatically approved or published',()=>{
 const c=sampleCampaign();c.demo=false;const d=c.drafts.find(d=>d.channel==='Hacker News')!;
 assert.throws(()=>approveDraft(d,'owner',false),/manual/);assert.throws(()=>validatePublish(c,d),/not supported/);
});
test('submitted or uncertain posts cannot be edited or reapproved',()=>{
 const c=sampleCampaign();for(const status of ['accepted','submitting','unknown'] as const){const d={...c.drafts[0],status};assert.throws(()=>editDraft(d,'new'));assert.throws(()=>approveDraft(d,'owner',false));}
});
test('overlong X content cannot be approved',()=>{const c=sampleCampaign();assert.throws(()=>approveDraft({...c.drafts[0],text:'a'.repeat(281)},'owner',false),/Shorten/);});
test('website input rejects local, credentialed, non-HTTPS and numeric hosts',()=>{
 for(const url of ['http://example.com','https://127.0.0.1','https://localhost','https://host.internal','https://[::1]','https://user:pass@example.com','https://example.com:8443'])assert.throws(()=>publicWebsite(url));
 assert.equal(publicWebsite('https://example.com/product').hostname,'example.com');
});
test('DNS responses to private networks are rejected before page fetch',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({Answer:[{type:1,data:'10.0.0.1'}]});};
 try{await assert.rejects(websiteText('https://example.com'),/Private/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('redirects are validated before follow',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input)=>String(input).includes('dns-query')?Response.json({Answer:[{type:1,data:'93.184.216.34'}]}):new Response(null,{status:302,headers:{location:'https://127.0.0.1'}});
 try{await assert.rejects(websiteText('https://example.com'),/public website/);}finally{globalThis.fetch=original;}
});
