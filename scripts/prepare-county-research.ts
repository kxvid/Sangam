import {constants, closeSync, existsSync, fsyncSync, fstatSync, linkSync, openSync, readSync, realpathSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {basename, dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CountyResearchError, decodeSanBernardinoDefaults, MAX_COUNTY_CSV_BYTES, type CountySourceMetadata} from '../src/connectors/san-bernardino-defaults';

const REPOSITORY = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const HELP = `Validate a local San Bernardino tax-default CSV as held research; no network or app import.
Usage: node --import tsx scripts/prepare-county-research.ts INPUT.csv
  --dataset newer|older --source-reference REFERENCE --export-date YYYY-MM-DD
  [--source-updated-date YYYY-MM-DD] [--output PRIVATE_FILE.json]
Without --output, prints counts only and writes nothing. Output parents must already exist.
Output is refused in Git checkouts except this repository's ignored data/ directory.
`;

function within(parent: string, path: string): boolean {
  const rel = relative(parent,path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
function checkoutRoot(path: string): string | null {
  let current = path;
  for (;;) {
    if (existsSync(resolve(current,'.git'))) return current;
    const next = dirname(current);
    if (next === current) return null;
    current = next;
  }
}
function privateOutput(path: string): string {
  const absolute = resolve(path);
  if (!absolute.endsWith('.json')) throw new CountyResearchError('unsafe_output','Output must be a private .json file.');
  const parent = realpathSync(dirname(absolute));
  if (!statSync(parent).isDirectory()) throw new CountyResearchError('unsafe_output','Output parent must be an existing directory.');
  const canonical = resolve(parent,basename(absolute));
  const repo = checkoutRoot(parent);
  if (repo && !(repo === REPOSITORY && within(resolve(REPOSITORY,'data'),parent))) {
    throw new CountyResearchError('unsafe_output','Refusing operational data in a Git checkout. Use this repository\'s ignored data/ folder or a private directory outside Git.');
  }
  if (within(REPOSITORY,canonical) && !within(resolve(REPOSITORY,'data'),canonical)) {
    throw new CountyResearchError('unsafe_output','Refusing operational data outside this repository\'s ignored data/ folder.');
  }
  if (within(REPOSITORY,canonical)) {
    const ignored = spawnSync('git',['check-ignore','--quiet','--',relative(REPOSITORY,canonical)],{cwd:REPOSITORY,stdio:'ignore'});
    if (ignored.status !== 0) throw new CountyResearchError('unsafe_output','Output inside data/ must be untracked and ignored by Git.');
  }
  return canonical;
}
function writePrivateJson(output: string, result: unknown): void {
  const temporary = resolve(dirname(output),`.county-research-${randomUUID()}.tmp`);
  const fd = openSync(temporary,constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,0o600);
  try {
    try {writeFileSync(fd,JSON.stringify(result,null,2)+'\n','utf8'); fsyncSync(fd);}
    finally {closeSync(fd);}
    // A hard link publishes the completed file atomically and refuses an existing destination.
    linkSync(temporary,output);
  } finally {unlinkSync(temporary);}
}
function readBounded(path: string): Uint8Array {
  const fd = openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(fd);
    if (!info.isFile()) throw new CountyResearchError('invalid_input','Input must be a regular local CSV file.');
    if (info.size > MAX_COUNTY_CSV_BYTES) throw new CountyResearchError('too_large','County CSV exceeds 5 MB; no partial output was produced.');
    const buffer = Buffer.alloc(MAX_COUNTY_CSV_BYTES + 1);
    let offset = 0;
    for (;;) {
      const count = readSync(fd,buffer,offset,buffer.length - offset,null);
      offset += count;
      if (offset > MAX_COUNTY_CSV_BYTES) throw new CountyResearchError('too_large','County CSV exceeds 5 MB; no partial output was produced.');
      if (!count) break;
    }
    return buffer.subarray(0,offset);
  } finally {closeSync(fd);}
}

function main(args: string[]) {
  if (args.length === 1 && args[0] === '--help') {process.stdout.write(HELP); return;}
  const input = args[0];
  if (!input || input.startsWith('--')) throw new CountyResearchError('invalid_arguments','Provide one local CSV path; use --help for usage.');
  const values: Record<string,string> = {};
  const flags = new Set(['--dataset','--source-reference','--export-date','--source-updated-date','--output']);
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i], value = args[i+1];
    if (!flags.has(flag) || values[flag] !== undefined || !value || value.startsWith('--')) {
      throw new CountyResearchError('invalid_arguments','Unknown, duplicate or missing argument; use --help for usage.');
    }
    values[flag] = value;
  }
  const source = {dataset:values['--dataset'],sourceReference:values['--source-reference'],exportDate:values['--export-date'],sourceUpdatedDate:values['--source-updated-date']} as CountySourceMetadata;
  const result = decodeSanBernardinoDefaults(readBounded(input),source);
  if (values['--output']) {
    const output = privateOutput(values['--output']);
    writePrivateJson(output,result);
  }
  process.stdout.write(JSON.stringify({status:result.status,purpose:result.purpose,summary:result.summary,outputWritten:Boolean(values['--output'])})+'\n');
}

try {main(process.argv.slice(2));}
catch (error) {
  if (error instanceof CountyResearchError) process.stderr.write(JSON.stringify({error:error.code,message:error.message})+'\n');
  else process.stderr.write(JSON.stringify({error:'file_error',message:'Could not read the local file or create a new private output. Check paths, permissions and whether the output already exists. No successful export is claimed.'})+'\n');
  process.exitCode = 1;
}
