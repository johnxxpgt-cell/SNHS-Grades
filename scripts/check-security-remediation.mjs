import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passes = [];

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full));
    else result.push(full);
  }
  return result;
}

async function read(rel) {
  return readFile(path.join(root, rel), 'utf8');
}

function check(name, ok, detail) {
  (ok ? passes : failures).push({ name, detail });
}

const proxy = await read('proxy.ts');
const nextConfig = await read('next.config.ts');
const layout = await read('app/layout.tsx');
const apiFiles = (await walk(path.join(root, 'app/api'))).filter((f) => f.endsWith('route.ts'));
const appCode = await walk(path.join(root, 'app'));
const componentFiles = await walk(path.join(root, 'components'));
const runtimeFiles = [...appCode, ...componentFiles, ...(await walk(path.join(root, 'lib')))]
  .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));
const runtimeSource = (await Promise.all(runtimeFiles.map((f) => readFile(f, 'utf8')))).join('\n');
const texts = new Map(await Promise.all(apiFiles.map(async (f) => [f, await readFile(f, 'utf8')])));
const forms = (await Promise.all(componentFiles.filter((f) => f.endsWith('.tsx')).map((f) => readFile(f, 'utf8')))).join('\n').match(/<form\b[^>]*>/g) ?? [];

check('Production CSP configured', proxy.includes('Content-Security-Policy') && proxy.includes("script-src 'self'") && proxy.includes("frame-ancestors 'none'") && proxy.includes("object-src 'none'"), 'proxy.ts sets a production nonce-based CSP. A deployed response retest is still required.');
check('CSP nonce passed to rendered layout', layout.includes('headers()') && layout.includes('x-nonce') && layout.includes('nonce={nonce}'), 'The JSON-LD script uses the request nonce; Next.js can nonce framework scripts.');
check('No permissive CORS header in app source', !/headers\.(?:set|append)\(\s*["']Access-Control-Allow-Origin["']/i.test(runtimeSource + '\n' + proxy) && !/["']Access-Control-Allow-Origin["']\s*:/i.test(runtimeSource + '\n' + proxy), 'No application source emits Access-Control-Allow-Origin.');
check('Cross-site API protections present', proxy.includes('origin !== request.nextUrl.origin') && proxy.includes('fetchSite === "cross-site"'), 'Mutating API requests require same-origin Origin; cross-site API fetches are rejected.');
check('Sensitive forms use POST', forms.length > 0 && forms.every((form) => /\bmethod="post"/.test(form)), `${forms.length} JSX form tags inspected.`);
check('No signed Supabase URL helper in runtime source', !/createSignedUrls?\s*\(/.test(runtimeSource), 'Production runtime no longer returns signed photo URLs.');
check('Private responses use no-store', proxy.includes('no-store, no-cache, must-revalidate, private') && (await read('lib/server/security.ts')).includes('no-store, no-cache, must-revalidate, private'), 'API and authenticated page responses are marked private and non-cacheable.');
check('Production browser source maps disabled', /productionBrowserSourceMaps:\s*false/.test(nextConfig), 'Production browser source maps are disabled.');
check('Sensitive request bodies are read with limits', apiFiles.filter((f) => /students\/(lookup|register|profile-photo|feedback)|api\/contact|api\/parent-feedback/.test(f)).every((f) => /readBodyLimited/.test(requireText(runtimeFiles, f))), 'Sensitive JSON/multipart handlers use streaming size limits.');
check('Suspicious code markers absent', !/\b(TODO|FIXME|XXX|HACK|DEBUG)\b/.test(runtimeSource), 'No common developer-only markers found in runtime application source; this is not a substitute for inspecting the exact ZAP response evidence.');

function requireText(_runtimeFiles, filepath) {
  return texts.get(filepath) ?? '';
}

for (const item of passes) console.log(`PASS  ${item.name} — ${item.detail}`);
for (const item of failures) console.error(`FAIL  ${item.name} — ${item.detail}`);
console.log(`\nResult: ${passes.length} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
