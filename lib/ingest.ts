export function publicWebsite(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Use a public HTTPS website URL.');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) || /(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname)) throw new Error('Use a public website domain.');
  return url;
}
async function validateDNS(host: string) {
  for (const type of ['A','AAAA']) {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {headers:{Accept:'application/dns-json'}, signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('Could not verify this website. Paste a product description instead.');
    const data = await response.json() as {Answer?:{type:number;data:string}[]};
    for (const answer of data.Answer || []) {
      if (answer.type === 1) {
        const octets = answer.data.split('.').map(Number); const [a,b] = octets;
        if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >=64 && b<=127) || (a===198 && (b===18 || b===19))) throw new Error('Private network URLs are not supported.');
      }
      if (answer.type === 28 && !/^2[0-9a-f]{3}:/i.test(answer.data)) throw new Error('Private network URLs are not supported.');
    }
  }
}
export async function websiteText(value: string) {
  let url = publicWebsite(value);
  for (let hop = 0; hop < 4; hop++) {
    await validateDNS(url.hostname);
    const response = await fetch(url, { redirect:'manual', signal:AbortSignal.timeout(12000), headers:{'User-Agent':'ReefLaunch/0.1 (product brief reader)'} });
    if (response.status >= 300 && response.status < 400) { url = publicWebsite(new URL(response.headers.get('location') || '', url).href); continue; }
    if (!response.ok) throw new Error('This website could not be read. Paste its product description instead.');
    if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('Use a website page, or upload the file separately.');
    const reader = response.body!.getReader(); const chunks:Uint8Array[]=[]; let size=0;
    try { while(true) { const {done,value}=await reader.read(); if(done)break; size += value.length; if(size>1_000_000) throw new Error('This page is too large. Paste the key product details instead.'); chunks.push(value); } } finally {await reader.cancel();}
    const text = new TextDecoder().decode(new Uint8Array(chunks.flatMap(c=>Array.from(c))));
    return text.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').slice(0,18000);
  }
  throw new Error('Too many website redirects. Paste your product description instead.');
}

/** Accepts https://github.com/owner/repo (optionally with .git, a trailing slash, or a deeper path). */
export function githubRepo(value: string) {
  const m = value.trim().match(/^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})(?:\/[^?#]*)?(?:[?#].*)?$/);
  const repo = m?.[2].replace(/\.git$/, '');
  if (!m || !repo || repo === '.' || repo === '..') throw new Error('Use a public GitHub repository URL, like https://github.com/owner/repo.');
  return { owner: m[1], repo };
}
async function limitedText(response: Response, max: number) {
  const reader = response.body!.getReader(); const decoder = new TextDecoder(); let text = '';
  try { while (text.length < max) { const {done, value} = await reader.read(); if (done) break; text += decoder.decode(value, {stream: true}); } } finally { await reader.cancel(); }
  return text.slice(0, max);
}
/**
 * Public repository context for the brief: description, homepage, topics, and README.
 * GITHUB_TOKEN is optional and only raises rate limits. Give it public read access only,
 * because every signed-in founder can point Reef at any repository the token can read.
 */
export async function githubText(value: string, token?: string) {
  const { owner, repo } = githubRepo(value);
  const headers: Record<string, string> = { 'User-Agent': 'ReefLaunch/0.1 (product brief reader)', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const meta = await fetch(base, { headers: { ...headers, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000) });
  if (meta.status === 404) throw new Error('That GitHub repository was not found. Check the URL and make sure the repository is public.');
  let about = '';
  if (meta.ok) {
    const r = await meta.json() as { full_name?: string; description?: string | null; homepage?: string | null; language?: string | null; topics?: string[]; license?: { name?: string } | null; private?: boolean };
    if (r.private) throw new Error('Reef reads public repositories only. Paste a description instead.');
    about = [r.full_name && `Repository: ${r.full_name}`, r.description && `Description: ${r.description}`, r.homepage && `Homepage: ${r.homepage}`, r.language && `Primary language: ${r.language}`, r.topics?.length && `Topics: ${r.topics.join(', ')}`, r.license?.name && `License: ${r.license.name}`].filter(Boolean).join('\n');
  }
  let readme = '';
  const api = await fetch(`${base}/readme`, { headers: { ...headers, Accept: 'application/vnd.github.raw' }, signal: AbortSignal.timeout(10000) });
  if (api.ok) readme = await limitedText(api, 40000);
  else if (api.status !== 404) {
    // The API is rate-limited per IP without a token; the raw host usually still answers.
    const raw = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/HEAD/README.md`, { headers: { 'User-Agent': headers['User-Agent'] }, signal: AbortSignal.timeout(10000) });
    if (raw.ok) readme = await limitedText(raw, 40000);
  }
  if (!about && !readme) throw new Error('This GitHub repository could not be read right now. Paste a product description instead.');
  readme = readme.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return `${about}${readme ? `\nREADME:\n${readme}` : ''}`.slice(0, 18000);
}
