import { env } from 'cloudflare:workers';
import { identity, database, failure } from '@/lib/server';
export async function POST(request: Request) {
  try {
    const owner = await identity(request);
    if (Number(request.headers.get('content-length') || 0) > 6_000_000) throw new Error('Use a file smaller than 5 MB.');
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || file.size > 5_000_000 || !file.size) throw new Error('Choose a file under 5 MB.');
    const mime = file.type || (file.name.endsWith('.md') ? 'text/markdown' : '');
    if (!['text/plain','text/markdown','application/pdf','image/png','image/jpeg','image/webp'].includes(mime)) throw new Error('Upload a PDF, PNG, JPG, WebP, or text transcript. Video processing is not available in this version.');
    if (!env.BUCKET) throw new Error('Upload storage is not configured.');
    const id = crypto.randomUUID();
    await env.BUCKET.put(`${owner}/${id}`, await file.arrayBuffer(), {httpMetadata:{contentType:mime}});
    await database().prepare('INSERT INTO uploads (id, owner, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, owner, file.name.slice(0,200), mime, file.size, new Date().toISOString()).run();
    return Response.json({id, name:file.name, mime});
  } catch(e) {return failure(e);}
}
