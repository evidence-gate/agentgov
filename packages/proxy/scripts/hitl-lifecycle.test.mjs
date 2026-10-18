import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDockerDbClient, runMigrations } from '../src/db/client.node.ts';
import { ensureAgent, createHold } from '../src/budget/ledger.ts';
import { getTicket, persistWorkflowTicket, finalizeWorkflowTicket } from '../src/hitl/queue.ts';
import { runHitlWorkflow } from '../src/hitl/workflow-run.ts';
async function fixture() {
 const db=createDockerDbClient('file::memory:'); await runMigrations(db); await ensureAgent(db,'synthetic',10);
 const hold=await createHold(db,'synthetic','gpt-4o',2); assert.ok(hold.approved);
 return { db, p:{ticketId:crypto.randomUUID(),agentId:'synthetic',actionName:'send_email',riskTier:'external',requestPayload:'{}',ttlSeconds:60,holdId:hold.holdId,callbackBaseUrl:'http://localhost'} };
}
async function verify(db,id,status) {
 assert.equal((await getTicket(db,id)).status,status);
 const b=(await db.$client.execute('SELECT * FROM budget_ledger')).rows[0]; assert.equal(b.reserved_usd,0); assert.equal(b.spent_usd,0);
 const rows=(await db.$client.execute('SELECT event_type,payload FROM audit_log')).rows;
 for(const type of ['budget_settle','hitl_suspended',`hitl_${status}`]) assert.equal(rows.filter(r=>r.event_type===type).length,1);
 assert.equal(JSON.parse(rows.find(r=>r.event_type===`hitl_${status}`).payload).ticketId,id);
}
for(const outcome of ['approved','denied','expired']) test(`HITL ${outcome}: ID consistency and retry-safe release/audit`,async()=>{
 const {db,p}=await fixture(); try {
 const step={do:async(name,fn)=>{const result=await fn();await fn();return result},waitForEvent:async()=>{if(outcome==='expired')throw Error('timeout');return {payload:{decision:outcome,actor:'reviewer'}}}};
 const notify=async d=>{assert.equal(d.ticketId,p.ticketId);assert.equal(d.expiresAt,(await getTicket(db,p.ticketId)).expiresAt)};
 await runHitlWorkflow({instanceId:p.ticketId,payload:p},step,()=>db,notify);
 await runHitlWorkflow({instanceId:p.ticketId,payload:p},step,()=>db,notify);
 await verify(db,p.ticketId,outcome);
 }finally{db.$client.close()}
});
test('late approval and simultaneous conflicting decisions expire exactly once',async()=>{
 const {db,p}=await fixture();try{
 await persistWorkflowTicket(db,p.ticketId,p);await db.$client.execute({sql:'UPDATE hitl_queue SET expires_at=0 WHERE id=?',args:[p.ticketId]});
 await Promise.all(['approved','denied'].map(decision=>finalizeWorkflowTicket(db,p.ticketId,{decision,actor:'a'})));
 await verify(db,p.ticketId,'expired');
 }finally{db.$client.close()}
});
test('mismatched workflow identity fails before persistence',async()=>{
 const {db,p}=await fixture();try{
 await assert.rejects(runHitlWorkflow({instanceId:'other',payload:p},{},()=>db),/identity mismatch/);
 assert.equal((await db.$client.execute('SELECT COUNT(*) AS n FROM hitl_queue')).rows[0].n,0);
 }finally{db.$client.close()}
});

test('notification failure releases hold and records denial',async()=>{
 const {db,p}=await fixture();try{
 const step={do:async(name,fn)=>fn(),waitForEvent:async()=>{throw Error('must not wait')}};
 await runHitlWorkflow({instanceId:p.ticketId,payload:p},step,()=>db,async()=>{throw Error('synthetic notification failure')});
 await verify(db,p.ticketId,'denied');
 }finally{db.$client.close()}
});
test('terminal audit failure leaves pending ticket; retry completes without a second settlement',async()=>{
 const {db,p}=await fixture();try{
 await persistWorkflowTicket(db,p.ticketId,p);
 await db.$client.execute("CREATE TRIGGER fail_decision BEFORE INSERT ON audit_log WHEN NEW.event_type='hitl_approved' BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END");
 await assert.rejects(finalizeWorkflowTicket(db,p.ticketId,{decision:'approved',actor:'a'}));
 assert.equal((await getTicket(db,p.ticketId)).status,'pending');
 await db.$client.execute('DROP TRIGGER fail_decision');
 await finalizeWorkflowTicket(db,p.ticketId,{decision:'approved',actor:'a'});
 await verify(db,p.ticketId,'approved');
 }finally{db.$client.close()}
});

for (const channel of ['webhook', 'slack']) {
 for (const failure of ['reject', 'http500', ...(channel === 'slack' ? ['api_error'] : [])]) {
  test(`real notify ${channel} ${failure} denies and releases reservation`, async () => {
   const {db,p}=await fixture(); const originalFetch=globalThis.fetch; let calls=0;
   try {
    globalThis.fetch=async()=>{ calls++; if(failure==='reject')throw Error('synthetic transport failure');
      return new Response(JSON.stringify({ok:false,error:'synthetic'}),{status:failure==='http500'?500:200}); };
    const params={...p,...(channel==='webhook'?{webhookUrl:'https://synthetic.invalid/hook'}:{slackBotToken:'synthetic-token',slackChannelId:'synthetic-channel'})};
    const step={do:async(name,fn)=>fn(),waitForEvent:async()=>{throw Error('must not wait')}};
    await runHitlWorkflow({instanceId:p.ticketId,payload:params},step,()=>db);
    assert.equal(calls,1); await verify(db,p.ticketId,'denied');
   } finally { globalThis.fetch=originalFetch; db.$client.close(); }
  });
 }
}
