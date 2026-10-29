import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendSMS } from '../src/lib/twilio';
import { sendEmail } from '../src/lib/resend';
import { completeText } from '../src/lib/anthropic';
import { fetchCashBuyers } from '../src/lib/propertyradar';
import { getProperty, getSaleAvm } from '../src/lib/rentcast';
import { skipTrace } from '../src/lib/skiptrace';
import { runDiscovery } from '../src/jobs/nightly-discovery';
import { sendOutreach } from '../src/jobs/send-outreach';
import { matchBuyers } from '../src/jobs/match-buyers';
import { scoreDeal } from '../src/jobs/score-deal';
import { scrapeCAInvestors } from '../src/scrapers/biggerpockets';
import { scrapeActiveCommenters } from '../src/scrapers/fb-groups';
import { fetchRecentGrantDeeds } from '../src/scrapers/la-county-recorder';

test('manual release refuses every legacy sender and paid enrichment path before network access', async()=>{
  const original = globalThis.fetch;
  let requests=0;
  globalThis.fetch=async()=>{requests++; throw new Error('Unexpected network request');};
  try {
    for(const operation of [
      ()=>sendSMS('+15555550100','test'),
      ()=>sendEmail({to:'fictional@example.invalid',subject:'test',html:'test'}),
      ()=>completeText('test'), ()=>fetchCashBuyers({}),()=>getProperty('fictional'),
      ()=>skipTrace({}),()=>runDiscovery(),()=>sendOutreach('fictional',{dryRun:false}),
      ()=>matchBuyers('fictional'),()=>scoreDeal({address:'fictional',askingPrice:1}),
      ()=>getSaleAvm('fictional'),()=>scrapeCAInvestors(),()=>scrapeActiveCommenters('fictional'),()=>fetchRecentGrantDeeds()
    ]) await assert.rejects(operation(),/disabled in the manual Acquisition release/);
    assert.equal(requests,0);
  }finally{globalThis.fetch=original;}
});
