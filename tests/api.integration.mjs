import { build } from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

// In-process route integration tests. No server socket, credentials, or external calls.
const db = new DatabaseSync(':memory:');
db.exec(await readFile('drizzle/0000_glossy_vulcan.sql','utf8'));
const d1={prepare(sql){return {bind(...values){return {
 async first(){return db.prepare(sql).get(...values)??null;},
 async all(){return {results:db.prepare(sql).all(...values)};},
 async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};}
};}};}};
const files=new Map();
globalThis.reefTestEnv={DB:d1,BUCKET:{async put(k,b){files.set(k,b);},async get(k){const b=files.get(k);return b?{arrayBuffer:async()=>b,text:async()=>new TextDecoder().decode(b)}:null;}}};
globalThis.reefTestHeaders=new Headers();
const out='/private/tmp/reef-route-tests';await mkdir(out,{recursive:true});
const aliases={
 'cloudflare:workers':'export const env=globalThis.reefTestEnv;',
 'next/headers':'export async function headers(){return globalThis.reefTestHeaders;}',
 'next/navigation':'export function redirect(){throw new Error("redirect");}'
};
const routes={};
for(const name of ['workspace','campaign','generate','channels','upload']){
 const outfile=path.join(out,`${name}.mjs`);
 await build({entryPoints:[`app/api/${name}/route.ts`],outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:[{name:'test-environment',setup(b){b.onResolve({filter:/^(cloudflare:workers|next\/headers|next\/navigation)$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:aliases[args.path],loader:'js'}));}}]});
 routes[name]=await import(`file://${outfile}`);
}
const post=(route,data,origin='https://reef.test')=>routes[route].POST(new Request(`https://reef.test/api/${route}`,{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(data)}));
let calls=0,posts=0,timeout=false,lastMuse='';
globalThis.fetch=async(url,options={})=>{
 calls++;
 if(String(url)==='https://api.github.com/repos/acme/notes')return Response.json({full_name:'acme/notes',description:'Open-source note organizer',topics:['notes','productivity'],private:false});
 if(String(url)==='https://api.github.com/repos/acme/notes/readme')return new Response('# Notes\n![build](https://ci.example/badge.svg)\nSearchable notes for small teams.');
 if(String(url).startsWith('https://api.github.com/repos/acme/missing'))return new Response('{}',{status:404});
 if(String(url)==='https://api.meta.ai/v1/responses'){lastMuse=String(options.body);}
 if(String(url)==='https://api.meta.ai/v1/responses')return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({brief:'A focused note organizer.',audience:'Small teams',claims:[{text:'Organizes notes',evidence:'Founder description'}],drafts:[{channel:'X',text:'Notes, organized. Try our new workspace.',rationale:'Reach makers.'},{channel:'Threads',text:'How do you keep notes organized? We built a workspace for that.',rationale:'Invite a conversation.'}]})}]}]});
 if(String(url)==='https://api.buffer.com'){
  const {query}=JSON.parse(options.body);
  if(query.includes('createPost')){posts++;if(timeout)throw new Error('timeout');return Response.json({data:{createPost:{post:{id:'provider-1'}}}});}
  if(query.includes('organizations'))return Response.json({data:{account:{organizations:[{id:'org-1'}]}}});
  return Response.json({data:{channels:[{id:'x-1',name:'founder',displayName:'Founder',service:'twitter'}]}});
 }
 throw new Error(`Unexpected outbound request: ${url}`);
};
let response=await post('campaign',{action:'sample'});assert.equal(response.status,400);assert.match((await response.json()).error,/Sign in/);
globalThis.reefTestHeaders=new Headers({'oai-authenticated-user-id':'owner-1','oai-authenticated-user-email':'owner@example.test'});
response=await post('generate',{name:'Notes',description:'Organizes notes',goal:'Get feedback'});assert.equal(response.status,503);assert.equal(calls,0);
globalThis.reefTestEnv.MODEL_API_KEY='test-fixture-only';
response=await post('generate',{name:'Notes',description:'Organizes notes',goal:'Get feedback'});assert.equal(response.status,200);let c=await response.json();assert.equal(c.demo,false);assert.equal(c.drafts.length,3);assert.equal(c.drafts[2].channel,'Hacker News');assert.equal(c.drafts[2].text,'');
response=await post('generate',{name:'Notes OSS',github:'https://github.com/acme/notes',goal:'Get feedback'});assert.equal(response.status,200);let gh=await response.json();assert.equal(gh.github,'https://github.com/acme/notes');assert.match(lastMuse,/Searchable notes for small teams/);assert.match(lastMuse,/Open-source note organizer/);assert.doesNotMatch(lastMuse,/badge\.svg/);
response=await post('generate',{name:'Missing',github:'https://github.com/acme/missing',goal:'Get feedback'});assert.equal(response.status,400);assert.match((await response.json()).error,/not found/);
response=await post('generate',{name:'Bad',github:'https://gitlab.com/acme/notes',goal:'Get feedback'});assert.equal(response.status,400);assert.match((await response.json()).error,/GitHub repository URL/);
let state=await (await routes.workspace.GET()).json();assert.equal(state.campaigns.length,2);
let d=c.drafts[0];
response=await post('campaign',{action:'approve',id:c.id,revision:c.revision,draftId:d.id});assert.equal(response.status,200);c=await response.json();
const approvedRevision=c.revision;
response=await post('campaign',{action:'edit',id:c.id,revision:c.revision,draftId:d.id,text:'A revised post.'});assert.equal(response.status,200);c=await response.json();assert.equal(c.drafts[0].approval,undefined);
response=await post('campaign',{action:'publish',id:c.id,revision:c.revision,draftId:d.id,channelId:'x-1'});assert.equal(response.status,400);assert.equal(posts,0);
response=await post('campaign',{action:'approve',id:c.id,revision:approvedRevision,draftId:d.id});assert.equal(response.status,400);
response=await post('campaign',{action:'approve',id:c.id,revision:c.revision,draftId:d.id});c=await response.json();
globalThis.reefTestEnv.BUFFER_API_KEY='test-fixture-only';globalThis.reefTestEnv.BUFFER_OWNER_ID='owner-1';
const publishBody={action:'publish',id:c.id,revision:c.revision,draftId:d.id,channelId:'x-1'};
const submitted=await Promise.all([post('campaign',publishBody),post('campaign',publishBody)]);assert.equal(submitted.filter(r=>r.status===200).length,1);assert.equal(posts,1);
c=await submitted.find(r=>r.status===200).json();assert.equal(c.drafts[0].status,'accepted');assert.equal(c.drafts[0].providerId,'provider-1');
response=await post('campaign',{action:'sample'});const sample=await response.json();response=await post('campaign',{action:'approve',id:sample.id,revision:1,draftId:sample.drafts[0].id});assert.equal(response.status,400);
response=await post('generate',{name:'Another',description:'Organizes notes',goal:'Get feedback'});let uncertain=await response.json();response=await post('campaign',{action:'approve',id:uncertain.id,revision:uncertain.revision,draftId:uncertain.drafts[0].id});uncertain=await response.json();timeout=true;
response=await post('campaign',{action:'publish',id:uncertain.id,revision:uncertain.revision,draftId:uncertain.drafts[0].id,channelId:'x-1'});uncertain=await response.json();assert.equal(uncertain.drafts[0].status,'unknown');
response=await post('campaign',{action:'approve',id:uncertain.id,revision:uncertain.revision,draftId:uncertain.drafts[0].id});assert.equal(response.status,400);
response=await post('campaign',{action:'sample'},'https://attacker.test');assert.equal(response.status,400);
const form=new FormData();form.set('file',new File(['Source text'], 'notes.txt',{type:'text/plain'}));response=await routes.upload.POST(new Request('https://reef.test/api/upload',{method:'POST',headers:{origin:'https://reef.test'},body:form}));assert.equal(response.status,200);const upload=await response.json();assert.ok(files.has(`owner-1/${upload.id}`));
globalThis.reefTestHeaders=new Headers({'oai-authenticated-user-id':'owner-2','oai-authenticated-user-email':'other@example.test'});
state=await (await routes.workspace.GET()).json();assert.equal(state.campaigns.length,0);assert.equal(state.config.buffer,false);
response=await post('campaign',{action:'edit',id:c.id,revision:c.revision,draftId:d.id,text:'unauthorized'});assert.equal(response.status,400);assert.match((await response.json()).error,/not found/);
response=await post('generate',{name:'Steal source',description:'Anything',goal:'Get feedback',uploadIds:[upload.id]});assert.equal(response.status,400);assert.match((await response.json()).error,/not found/);
console.log('PASS: real route handlers + SQLite persistence + mocked Muse/Buffer: authentication, missing key, generation, manual HN, save/edit, stale approval, concurrent submission, uncertain outcome, cross-origin rejection, upload ownership, and tenant isolation. No external calls made.');
