import {buildPropertyRadarPreviewPlan, previewPropertyRadarCost, PropertyRadarPreviewError} from '../src/connectors/propertyradar-preview';

async function main() {
  try {
    let preview = false, limit = 10, sawLimit = false;
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--preview' && !preview) preview = true;
      else if (args[index] === '--limit' && !sawLimit && /^\d+$/.test(args[index + 1] ?? '')) {
        limit = Number(args[++index]); sawLimit = true;
      } else throw new PropertyRadarPreviewError('invalid_request', 'Accepted options are --preview and --limit followed by a whole number from 1 to 100. Do not pass credentials as arguments.');
    }
    const plan = buildPropertyRadarPreviewPlan({limit});
    if (!preview) {
      console.log(JSON.stringify({mode:'offline_plan', networkRequests:0, recordsImported:0, purchasePerformed:false, plan,
        nextStep:'After configuring the authorized paid account token in the server environment, --preview requests count/cost only. It never collects leads.'}, null, 2));
      return;
    }
    const estimate = await previewPropertyRadarCost({limit}, process.env.PROPERTYRADAR_API_TOKEN ?? '');
    console.log(JSON.stringify(estimate, null, 2));
  } catch (error) {
    const safe = error instanceof PropertyRadarPreviewError ? error : new PropertyRadarPreviewError('unavailable', 'The cost preview could not be completed.');
    console.error(JSON.stringify({error:safe.code, message:safe.message}));
    process.exitCode = 1;
  }
}

void main();
