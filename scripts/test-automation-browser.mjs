/** Isolated fictional UI harness; no hosted routes, credentials or live records. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import contractModule from '../src/automation/contracts.ts';
import ruleModule from '../src/automation/rules.ts';
import adapterModule from '../src/automation/adapters.ts';
import domainModule from '../src/acquisition/domain.ts';
const {automationCommandSchema} = contractModule;
const {createSellerRule, createBuyerRule} = ruleModule;
const {evaluateSeller, evaluateBuyer} = adapterModule;
const {initialState, execute} = domainModule;
const root = resolve(import.meta.dirname, '..');
const temporary = await mkdtemp(join(tmpdir(), 'sangam-automation-ui-'));
const now = '2026-10-28T16:00:00.000Z';
const workspace = {id:randomUUID(),name:'Fictional automation UI test',role:'admin'};
const actor = {actorId:'fictional-browser-admin',role:'admin',now};
const csv = 'county,apn,address,city,zip,owner_name,mailing_address,phone,property_type,equity_pct,tax_delinquent_years,years_owned,nod,vacant,absentee,inherited,code_violations\nRiverside,TEST-001,101 Example Street,Riverside,92501,Example Owner,"101 Example Street, Riverside CA 92501",9095550100,SFR,70,2,11,false,true,true,false,false\n';
const snapshot = {sources:[],rules:[],jobs:[],records:[],recordCount:0,recordLimit:250,decisions:[],workspace,role:'admin',acquisition:{contracts:[],buyers:[],leads:[],version:0},defaults:{seller:createSellerRule(workspace.id),buyer:createBuyerRule(workspace.id)}};
const errors = [], requests = [];
let browser, server;
const jsonBody = async request => {const parts=[];for await(const part of request) parts.push(part);return JSON.parse(Buffer.concat(parts).toString('utf8'));};
function resultsFor(rule) {
  return snapshot.records.map(record => {
    const source=snapshot.sources.find(item=>item.id===record.sourceId);
    const evaluation=evaluateSeller(rule,record.lead,{workspaceId:workspace.id,asOf:now,sourceId:source.id,suppressed:false,expectedSynthetic:source.synthetic,sourceGrants:[{workspaceId:workspace.id,sourceId:source.id,status:source.status==='approved'?'approved':'revoked',purposes:['seller_research','buyer_fit'],permissionReference:source.permissionReference,expiresAt:source.rightsExpiresAt}]});
    return {recordId:record.id,sourceId:source.id,sourceRevision:source.revision,leadId:record.lead.id,name:record.lead.ownerName,address:record.lead.address,purpose:'seller_research',evaluation};
  });
}
function mutate(command) {
  requests.push(command);
  if(command.type==='save_source') {
    if(command.source.status==='approved' && !command.source.synthetic) throw new Error('The data_provenance gate needs current approved evidence.');
    const existing=snapshot.sources.find(item=>item.id===command.source.id);
    if((existing?.revision??0)!==command.expectedRevision) throw new Error('Source changed. Refresh before retrying.');
    const source={...command.source,id:existing?.id??randomUUID(),workspaceId:workspace.id,revision:(existing?.revision??0)+1,updatedAt:now,updatedBy:actor.actorId};
    if(existing) snapshot.sources=snapshot.sources.map(item=>item.id===source.id?source:item); else snapshot.sources.push(source);
    return source;
  }
  if(command.type==='create_rule') {
    const revision=snapshot.rules.filter(item=>item.purpose===command.purpose).length+1;
    const rule=command.purpose==='seller_research'?createSellerRule(workspace.id,'seller-ui',revision,{farmZips:command.farmZips,minimumScore:command.minimumScore}):createBuyerRule(workspace.id,'buyer-ui',revision);
    const item={id:randomUUID(),ruleId:rule.id,workspaceId:workspace.id,revision,purpose:rule.purpose,status:'draft',rule,createdAt:now,createdBy:actor.actorId};snapshot.rules.unshift(item);return item;
  }
  if(command.type==='publish_rule') {const item=snapshot.rules.find(item=>item.id===command.ruleVersionId);for(const prior of snapshot.rules) if(prior.purpose===item.purpose && prior.status==='published')prior.status='retired';item.status='published';return item;}
  if(command.type==='dry_run_rule') {const rule=snapshot.rules.find(item=>item.id===command.ruleVersionId).rule;return {results:resultsFor(rule),counts:{eligible:1,excluded:0,review:0}};}
  if(command.type==='upload_source') {
    const source=snapshot.sources.find(item=>item.id===command.sourceId);assert.equal(source.status,'approved');
    const input={csv:command.csv,source:source.name,sourceDate:command.sourceDate,permissionReference:source.permissionReference,synthetic:source.synthetic};
    const preview=execute(initialState(),{type:'preview_import',...input},actor).result;
    const state=execute(initialState(),{type:'import_leads',...input,previewHash:preview.previewHash},actor).state;
    snapshot.records=state.leads.map(lead=>({id:randomUUID(),workspaceId:workspace.id,sourceId:source.id,recordKey:lead.id,contentHash:'a'.repeat(64),lead,lastRunId:randomUUID(),updatedAt:now}));snapshot.recordCount=snapshot.records.length;
    const job={id:randomUUID(),workspaceId:workspace.id,sourceId:source.id,sourceRevision:source.revision,kind:'ingest',status:'completed',attempts:1,recordCount:state.leads.length,errorCode:null,createdAt:now,completedAt:now,nextAttemptAt:now,leaseExpiresAt:null};snapshot.jobs.unshift(job);
    const rule=snapshot.rules.find(item=>item.status==='published'&&item.purpose==='seller_research');
    if(rule) snapshot.decisions.unshift({id:randomUUID(),workspaceId:workspace.id,ruleVersionId:rule.id,jobId:job.id,createdAt:now,results:resultsFor(rule.rule)});
    return job;
  }
  if(command.type==='run_source') return {id:randomUUID()};
  if(command.type==='evaluate') {const rule=snapshot.rules.find(item=>item.status==='published'&&item.purpose==='seller_research');const results=resultsFor(rule.rule);snapshot.decisions.unshift({id:randomUUID(),workspaceId:workspace.id,ruleVersionId:rule.id,jobId:null,createdAt:now,results});return {results};}
  if(command.type==='preview_record') return {recordId:command.recordId,previewHash:'b'.repeat(64),preview:{count:1,newCount:1,updatedCount:0,eligibleScoreCount:1,synthetic:true,rows:[]}};
  if(command.type==='promote_record') {assert.equal(command.previewHash,'b'.repeat(64));const record=snapshot.records.find(item=>item.id===command.recordId);snapshot.acquisition.leads.push(record.lead);return {imported:1};}
  throw new Error(`Unsupported fixture action: ${command.type}`);
}
try {
  await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import {AutomationDesk} from "./components/automation-desk";createRoot(document.getElementById("root")).render(<AutomationDesk/>);',resolveDir:root,sourcefile:'automation-ui-fixture.tsx',loader:'tsx'},outfile:join(temporary,'app.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-link',setup(build){build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'import React from "react";export default function Link(props){return <a {...props}/>}',loader:'jsx',resolveDir:root}));}}]});
  execFileSync(process.execPath,[resolve(root,'node_modules/tailwindcss/lib/cli.js'),'-i',resolve(root,'app/globals.css'),'-o',join(temporary,'app.css'),'--minify'],{cwd:root,stdio:'pipe'});
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional automation UI fixture</title><link rel="stylesheet" href="/app.css"></head><body><main id="root" style="max-width:1200px;margin:auto;padding:24px"></main><script src="/app.js"></script></body></html>';
  server=createServer(async(request,response)=>{const json=(status,body)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(body));};try{const path=new URL(request.url,'http://127.0.0.1').pathname;if(path==='/api/workspaces')return json(200,{workspaces:[workspace]});if(path==='/api/automation'){let result;if(request.method==='POST'){const body=await jsonBody(request);assert.equal(body.workspaceId,workspace.id);assert.equal(body.version,0);result=mutate(automationCommandSchema.parse(body.command));}const offset=Number(new URL(request.url,'http://127.0.0.1').searchParams.get('offset')??0);return json(200,{...snapshot,records:snapshot.records.slice(offset,offset+250),recordOffset:offset,result});}if(['/app.js','/app.css'].includes(path)){response.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':'text/css'});response.end(await readFile(join(temporary,path.slice(1))));return;}response.writeHead(200,{'Content-Type':'text/html'});response.end(html);}catch(error){json(400,{error:error.message});}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1100},timezoneId:'America/Los_Angeles'});
  page.setDefaultTimeout(10000);
  page.on('pageerror',error=>{errors.push(error.message);console.error('Fixture browser error:',error.message);});
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin);
  const form=title=>page.locator('form').filter({has:page.getByRole('heading',{name:title,exact:true})});
  const tab=name=>page.getByRole('navigation',{name:'Sourcing and matching sections'}).getByRole('button',{name,exact:true}).click();
  const notice=text=>page.getByRole('status').getByText(text,{exact:false}).waitFor();
  await page.getByRole('heading',{name:'Sourcing & matching',exact:true}).waitFor();
  await page.getByRole('heading',{name:'Add your first source'}).waitFor();
  const sourceForm=form('Source details');
  await sourceForm.getByLabel('Source name').fill('Fictional PropStream export');
  await sourceForm.getByLabel('Source permission reference').fill('SYNTHETIC FIXTURE — no vendor data and no real person');
  await sourceForm.getByLabel('Fictional practice source').check();
  await sourceForm.getByRole('button',{name:'Save source draft'}).click();
  await notice('Source draft saved.');
  assert.equal(snapshot.sources.length,1);assert.equal(snapshot.sources[0].status,'draft');assert.deepEqual(snapshot.sources[0].config,{});
  const approval=form('Review source permission');
  await approval.getByLabel('Enable scheduled refresh of uploaded records').check();
  await approval.getByRole('button',{name:'Approve source',exact:true}).click();
  await notice('Source approval recorded.');
  assert.equal(snapshot.sources[0].status,'approved');assert.equal(snapshot.sources[0].enabled,true);
  await tab('Rules');
  await page.getByRole('button',{name:'Create draft',exact:true}).click();
  await notice('Rule draft created.');
  assert.equal(snapshot.rules[0].rule.minimumScore,8);
  await page.getByRole('button',{name:'Preview decisions',exact:true}).click();
  await notice('Dry run completed.');
  await page.getByText('No compatible records are available for this preview.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Publish this version',exact:true}).click();
  await notice('Rule version published');assert.equal(snapshot.rules[0].status,'published');
  await tab('Jobs');
  await page.getByLabel('Approved source').selectOption(snapshot.sources[0].id);
  await page.getByLabel('Actual source/export date').fill('2026-10-28');
  const fixture=join(temporary,'fictional-source.csv');await writeFile(fixture,csv);
  await page.getByLabel('Source CSV export').setInputFiles(fixture);
  await page.getByRole('button',{name:'Process export',exact:true}).click();
  await notice('Export submitted for automatic processing.');
  assert.equal(snapshot.records.length,1);assert.equal(snapshot.records[0].lead.score,12);assert.equal(snapshot.acquisition.leads.length,0);
  assert.equal(requests.find(item=>item.type==='upload_source').sourceDate,'2026-10-28');
  await page.getByText('Completed',{exact:true}).waitFor();
  await tab('Matches');
  await page.getByRole('button',{name:/101 Example Street/}).click();
  await page.getByRole('heading',{name:'Required conditions',exact:true}).waitFor();
  await page.getByText('Known score 12',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Review for Acquisition',exact:true}).click();
  await page.getByRole('heading',{name:'Confirm this reviewed candidate'}).waitFor();
  assert.equal(snapshot.acquisition.leads.length,0,'Review must not silently promote a lead');
  await page.getByRole('button',{name:'Add reviewed candidate',exact:true}).click();
  await notice('Candidate added to Acquisition.');assert.equal(snapshot.acquisition.leads.length,1);
  const contractLead=snapshot.acquisition.leads[0];
  contractLead.underwriting={arv:400000,repairs:20000,closingCosts:10000,assignmentFee:15000,profitPercent:0.3,compReferences:['Example 1','Example 2','Example 3'],mao:235000,recordedAt:now};
  const buyer={id:randomUUID(),name:'Example Buyer LLC',email:'buyer@example.com',phone:'+19095550101',zips:['92501'],minPrice:100000,maxPrice:400000,propertyTypes:['SFR'],rehabMax:50000,permissionReference:'SYNTHETIC buyer permission',permissionAt:now,sourceReference:'SYNTHETIC buyer research',synthetic:true,active:true,cashPurchases24m:3,lastCashPurchaseDate:'2026-10-01',entity:true,purchasedFarmZip:true,updatedAt:now};
  const contract={id:randomUUID(),leadId:contractLead.id,offerId:randomUUID(),price:200000,signedAt:now,reference:'SYNTHETIC contract',assignable:true,disclosuresReference:'SYNTHETIC disclosures',closingDate:'2026-11-30',amendments:[],termination:null,synthetic:true,createdAt:now};
  snapshot.acquisition.buyers.push(buyer);snapshot.acquisition.contracts.push(contract);
  const otherContract={...contract,id:randomUUID()};snapshot.acquisition.contracts.push(otherContract);
  const buyerRule=createBuyerRule(workspace.id,'buyer-ui',1);
  snapshot.rules.push({id:randomUUID(),ruleId:buyerRule.id,workspaceId:workspace.id,revision:1,purpose:'buyer_fit',status:'published',rule:buyerRule,createdAt:now,createdBy:actor.actorId});
  const source=snapshot.sources[0],buyerSourceId=`buyer-${buyer.id}`;
  const buyerEvaluation=evaluateBuyer(buyerRule,buyer,contractLead,contract,{workspaceId:workspace.id,asOf:now,sourceId:source.id,buyerSourceId,suppressed:false,expectedSynthetic:true,contractUnavailable:false,sourceGrants:[{workspaceId:workspace.id,sourceId:source.id,status:'approved',purposes:['seller_research','buyer_fit'],permissionReference:source.permissionReference,expiresAt:null},{workspaceId:workspace.id,sourceId:buyerSourceId,status:'approved',purposes:['buyer_fit'],permissionReference:buyer.permissionReference,expiresAt:null}]});
  assert.equal(buyerEvaluation.decision,'eligible');
  snapshot.decisions.unshift({id:randomUUID(),workspaceId:workspace.id,ruleVersionId:snapshot.rules.at(-1).id,jobId:null,createdAt:now,results:[{recordId:`${contract.id}:${buyer.id}`,sourceId:source.id,sourceRevision:source.revision,leadId:contractLead.id,name:buyer.name,address:contractLead.address,purpose:'buyer_fit',contractId:contract.id,buyerId:buyer.id,evaluation:buyerEvaluation}]});
  await page.reload();await tab('Matches');await page.getByRole('button',{name:/101 Example Street/}).waitFor();
  await page.getByText('Saved matching results for the selected contract.',{exact:false}).waitFor();
  await page.getByText('Example Buyer LLC · Suitable for review',{exact:true}).waitFor();
  assert.equal(requests.filter(item=>item.type==='match_buyers').length,0,'Saved automatic buyer results must appear without a manual matching action');
  await page.getByLabel('Contracted property',{exact:true}).selectOption(otherContract.id);
  await page.getByRole('heading',{name:'No saved buyer decisions for this contract',exact:true}).waitFor();
  assert.equal(await page.getByText('Example Buyer LLC · Suitable for review',{exact:true}).count(),0,'Buyer results must not leak from another selected contract');
  await page.getByLabel('Contracted property',{exact:true}).selectOption(contract.id);
  await page.getByText('Example Buyer LLC · Suitable for review',{exact:true}).waitFor();
  await tab('Sources');await page.getByRole('button',{name:'Fictional PropStream export',exact:false}).click();
  await page.getByRole('button',{name:'Pause source',exact:true}).click();await notice('Source paused.');assert.equal(snapshot.sources[0].status,'paused');assert.equal(snapshot.sources[0].enabled,false);
  await tab('Matches');await page.getByText('Historical · re-evaluate',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:/101 Example Street/}).click();assert.equal(await page.getByRole('button',{name:'Review for Acquisition'}).isDisabled(),true);
  const firstRecord=snapshot.records[0];
  for(let index=0;index<260;index++) snapshot.records.push({...firstRecord,id:randomUUID(),recordKey:`page-test-${index}`,lead:{...firstRecord.lead,id:randomUUID(),address:`${1000+index} Example Street`}});
  snapshot.recordCount=snapshot.records.length;
  await page.reload();await tab('Matches');
  await page.getByText('Showing 1–250 of 261 records',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  await page.getByText('Showing 251–261 of 261 records',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Next page',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Previous page',exact:true}).click();
  await page.getByText('Showing 1–250 of 261 records',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Search this page of research records'}).fill('1109 Example Street');
  assert.equal(await page.locator('tbody tr').count(),1);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('body').evaluate(body=>body.scrollWidth<=window.innerWidth+1),'Mobile page should not overflow horizontally');
  snapshot.role='operator';workspace.role='operator';await page.reload();await tab('Sources');
  assert.equal(await page.getByRole('button',{name:'Save source draft'}).count(),0,'Operator UI must not expose source approvals');
  await tab('Rules');assert.equal(await page.getByRole('button',{name:'Create draft',exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('Automation UI: 14 fictional workflow checks passed (source draft/review/schedule, rule draft/preview/publish, schema-valid upload, explained result, two-step promotion, reload, stored buyer matches on reload and contract isolation, stale-source hold, paging/search, mobile layout, operator controls). No production requests or outbound actions.');
} finally {await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(temporary,{recursive:true,force:true});}
