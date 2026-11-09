import { ensureBrowser } from '@remotion/renderer';

const status = await ensureBrowser();

console.log(`Remotion browser: ${status.type}`);
