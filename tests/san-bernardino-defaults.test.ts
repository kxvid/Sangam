import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {decodeSanBernardinoDefaults, CountyResearchError} from '../src/connectors/san-bernardino-defaults';

// Every identifier and fact in these fixtures is invented; no county records are copied.
const headers = ['Roll Yr','Tax Rate Yr','Assessment Year','Account Number','Bill Number','Installment Number','Escrow Company','TRA Code','TRA Name','Installment Balance','Bill Amount','Bill Balance','Balance Status','Account Status','Roll','Transfer Destination','Bill Type','Bill Category','Tax Default Number','Tax Default Date','Redemption Status','Redemption Total','In Active Payment Plan?'];
const fixture = ['2021','2021','2021','0000000000001','000000001','1','','000000','EXAMPLE DISTRICT','100.25','200.50','100.25','Unpaid','Unpaid','Redemption','','Secured','Annual','000001','7/1/2022','Active','300.75','No'];
const csv = (rows: string[][], columns = headers) => [columns, ...rows].map(row => row.map(cell => `"${cell.replaceAll('"','""')}"`).join(',')).join('\r\n') + '\r\n';
const replace = (changes: Record<string,string>) => fixture.map((value, i) => changes[headers[i]] ?? value);
const metadata = {dataset:'newer' as const, sourceReference:'FICTIONAL local test export', exportDate:'2026-10-29', sourceUpdatedDate:'2026-10-25'};
const now = new Date('2026-10-29T12:00:00.000Z');
const decode = (input: string | Uint8Array, source = metadata) => decodeSanBernardinoDefaults(input, source, now);
const hasCode = (code: string) => (error: unknown) => error instanceof CountyResearchError && error.code === code;

test('county research retains leading zeros, original dates and source reference without creating a lead', () => {
  const result = decode(csv([fixture]));
  assert.equal(result.purpose, 'county_tax_default_research');
  assert.equal(result.status, 'held');
  assert.equal(result.provenance.exportDate, '2026-10-29');
  assert.equal(result.provenance.sourceUpdatedDate, '2026-10-25');
  assert.equal(result.provenance.sourceReference, 'FICTIONAL local test export');
  const account = result.accounts[0];
  assert.equal(account.sourceAccountNumber, '0000000000001');
  assert.equal(account.parcelNumber, null);
  assert.equal(account.observations[0].fields['Bill Number'], '000000001');
  assert.equal(account.observations[0].fields['Tax Default Date'], '7/1/2022');
  assert.equal(account.observations[0].normalized.taxDefaultDate, '2022-07-01');
  assert.ok(!('lead' in account) && !('score' in account) && !('ownerName' in account) && !('contactPermission' in account));
});

test('paid bill and unpaid account remain separate evidence; repeated redemption amounts are never added', () => {
  const result = decode(csv([
    replace({'Balance Status':'Paid in Full','Bill Balance':'0','Installment Balance':'0'}),
    replace({'Bill Number':'000000002'}),
  ]));
  assert.equal(result.summary.accounts, 1);
  assert.equal(result.summary.observations, 2);
  assert.equal(result.summary.paidBillObservations, 1);
  assert.equal(result.summary.unpaidBillObservations, 1);
  const [paid, unpaid] = result.accounts[0].observations;
  assert.equal(paid.normalized.billBalanceStatus, 'paid_in_full');
  assert.equal(paid.normalized.accountStatus, 'unpaid');
  assert.equal(unpaid.normalized.billBalanceStatus, 'unpaid');
  assert.equal(paid.fields['Redemption Total'], '300.75');
  assert.equal(unpaid.fields['Redemption Total'], '300.75');
  assert.ok(!('totalOwed' in result.accounts[0]) && !('totalOwed' in result.summary));
});

test('only exact duplicate observations collapse and all contributing source row numbers remain visible', () => {
  const result = decode(csv([fixture, fixture, replace({'Bill Balance':'99.00'})]));
  assert.equal(result.summary.inputRows, 3);
  assert.equal(result.summary.duplicateRows, 1);
  assert.equal(result.summary.observations, 2);
  assert.deepEqual(result.accounts[0].observations[0].sourceRows, [2,3]);
  assert.deepEqual(result.accounts[0].observations[1].sourceRows, [4]);
});

test('blank and unfamiliar facts remain unknown instead of becoming false or unpaid', () => {
  const result = decode(csv([replace({'Balance Status':'Pending Review','Account Status':'','Tax Default Date':'','In Active Payment Plan?':'Maybe','Bill Balance':''})]));
  const row = result.accounts[0].observations[0];
  assert.equal(row.fields['Balance Status'], 'Pending Review');
  assert.equal(row.normalized.billBalanceStatus, 'unknown');
  assert.equal(row.normalized.accountStatus, 'unknown');
  assert.equal(row.normalized.taxDefaultDate, null);
  assert.equal(row.normalized.inActivePaymentPlan, null);
  assert.equal(row.normalized.billBalance, null);
  assert.equal(result.summary.rowsWithUnknownFacts, 1);
});

test('calendar-invalid, future and unsupported default dates fail the whole decode', () => {
  for (const date of ['2/29/2025','4/31/2026','13/1/2026','2026-02-30','10/30/2026','yesterday']) {
    assert.throws(() => decode(csv([replace({'Tax Default Date':date})])), hasCode('invalid_date'));
  }
  assert.equal(decode(csv([replace({'Tax Default Date':'2/29/2024'})])).accounts[0].observations[0].normalized.taxDefaultDate, '2024-02-29');
});

test('source evidence must include a real-shaped reference and dates, without inferring approval', () => {
  for (const source of [
    {...metadata, sourceReference:''}, {...metadata, exportDate:'2026-02-30'},
    {...metadata, exportDate:'2026-10-30'}, {...metadata, sourceUpdatedDate:'2026-10-30'},
    {...metadata, sourceReference:'a'.repeat(1_001)},
  ]) assert.throws(() => decode(csv([fixture]), source), CountyResearchError);
  assert.equal(decodeSanBernardinoDefaults(csv([fixture]), {...metadata, sourceUpdatedDate:undefined}, now).provenance.sourceUpdatedDate, null);
});

test('BOM, quoted commas and quoted line breaks decode while schema drift and malformed UTF-8 fail closed', () => {
  const result = decode('\uFEFF' + csv([replace({'TRA Name':'EXAMPLE, DISTRICT\nSECOND LINE'})]));
  assert.equal(result.accounts[0].observations[0].fields['TRA Name'], 'EXAMPLE, DISTRICT\nSECOND LINE');
  assert.throws(() => decode(csv([fixture], [...headers.slice(0,-1),'owner_name'])), hasCode('invalid_schema'));
  assert.throws(() => decode(csv([fixture], [...headers.slice(0,-1),'Account Number'])), hasCode('invalid_schema'));
  assert.throws(() => decode(new Uint8Array([0xc3,0x28])), hasCode('invalid_encoding'));
  assert.throws(() => decode(csv([fixture]).replace('"0000000000001"','"123"')), hasCode('invalid_identifier'));
});

test('byte, field and row bounds reject excess or truncation instead of returning partial research', () => {
  assert.throws(() => decode('a'.repeat(5_000_001)), hasCode('too_large'));
  assert.throws(() => decode(csv([replace({'TRA Name':'a'.repeat(4_097)})])), hasCode('too_large'));
  assert.throws(() => decode(csv(Array.from({length:10_001}, () => fixture))), hasCode('too_many_rows'));
  assert.throws(() => decode(csv([fixture]).slice(0,-4)), hasCode('malformed_csv'));
  assert.throws(() => decode(csv([fixture.slice(0,-1)])), hasCode('malformed_csv'));
});

const root = resolve(process.cwd());
const command = resolve(root,'scripts/prepare-county-research.ts');
function cli(input: string, extra: string[] = []) {
  return spawnSync(process.execPath, ['--import','tsx',command,input,'--dataset','newer','--source-reference','FICTIONAL test source','--export-date','2025-10-29',...extra], {cwd:root,encoding:'utf8'});
}

test('CLI validates without writing or printing account identifiers, then writes a private held JSON only on request', () => {
  const dir = mkdtempSync(join(tmpdir(),'sangam-county-test-'));
  try {
    const input = join(dir,'fictional.csv'); writeFileSync(input,csv([fixture]));
    const validation = cli(input);
    assert.equal(validation.status,0,validation.stderr);
    const summary = JSON.parse(validation.stdout);
    assert.equal(summary.outputWritten,false);
    assert.equal(summary.summary.accounts,1);
    assert.ok(!validation.stdout.includes('0000000000001'));
    const output = join(dir,'research.json');
    const exported = cli(input,['--output',output]);
    assert.equal(exported.status,0,exported.stderr);
    assert.equal(statSync(output).mode & 0o777,0o600);
    assert.equal(JSON.parse(readFileSync(output,'utf8')).status,'held');
    const overwrite = cli(input,['--output',output]);
    assert.notEqual(overwrite.status,0);
    assert.equal(JSON.parse(readFileSync(output,'utf8')).accounts[0].sourceAccountNumber,'0000000000001');
    assert.deepEqual(readdirSync(dir).sort(),['fictional.csv','research.json']);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('CLI rejects invalid source rows before opening any output and does not reveal their contents', () => {
  const dir = mkdtempSync(join(tmpdir(),'sangam-county-invalid-test-'));
  try {
    const input = join(dir,'fictional.csv'); writeFileSync(input,csv([replace({'Tax Default Date':'2/29/2025'})]));
    const output = join(dir,'research.json');
    const result = cli(input,['--output',output]);
    assert.notEqual(result.status,0);
    assert.equal(JSON.parse(result.stderr).error,'invalid_date');
    assert.equal(existsSync(output),false);
    assert.ok(!result.stdout.includes('0000000000001') && !result.stderr.includes('0000000000001'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('legacy Tax Year header stays evidence without inferring a duration, and unsupported money is rejected', () => {
  const result = decode(csv([fixture],headers.map(header => header === 'Assessment Year' ? 'Tax Year' : header)));
  assert.equal(result.accounts[0].observations[0].fields['Tax Year'],'2021');
  assert.ok(!('taxDelinquentYears' in result.accounts[0]));
  assert.throws(() => decode(csv([replace({'Bill Balance':'=1+1'})])),hasCode('invalid_amount'));
});

test('CLI refuses output in a Git checkout or through a symlink into one', () => {
  const dir = mkdtempSync(join(tmpdir(),'sangam-county-path-test-'));
  try {
    const input = join(dir,'fictional.csv'); writeFileSync(input,csv([fixture]));
    const publicRepo = join(dir,'public-repo'); mkdirSync(publicRepo); mkdirSync(join(publicRepo,'.git'));
    const link = join(dir,'linked-repo'); symlinkSync(publicRepo,link,'dir');
    for (const destination of [join(publicRepo,'research.json'),join(link,'research.json'),resolve(root,'src','research.json')]) {
      const result = cli(input,['--output',destination]);
      assert.notEqual(result.status,0);
      assert.equal(JSON.parse(result.stderr).error,'unsafe_output');
      assert.ok(!result.stderr.includes('0000000000001'));
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('CLI permits the current repository data folder only while its destination is Git-ignored', () => {
  const data = resolve(root,'data');
  mkdirSync(data,{recursive:true});
  const dir = mkdtempSync(join(data,'county-test-'));
  try {
    const input = join(dir,'fictional.csv'); writeFileSync(input,csv([fixture]));
    const output = join(dir,'research.json');
    const ignored = spawnSync('git',['check-ignore','--quiet','--',output],{cwd:root});
    assert.equal(ignored.status,0,'The repository must ignore operational data.');
    const result = cli(input,['--output',output]);
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(readFileSync(output,'utf8')).status,'held');
    assert.equal(statSync(output).mode & 0o777,0o600);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
