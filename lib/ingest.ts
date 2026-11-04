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
