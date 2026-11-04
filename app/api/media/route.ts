import { env } from 'cloudflare:workers';
import { identity, database, failure } from '@/lib/server';
import { IMAGE_TYPES, VIDEO_TYPES, IMAGE_LIMIT, VIDEO_LIMIT, storeMedia } from '@/lib/media';

/** Upload launch media: images up to 10 MB, short videos up to 25 MB. Not sent to Muse. */
export async function POST(request: Request) {
  try {
    const owner = await identity(request);
    if (Number(request.headers.get('content-length') || 0) > VIDEO_LIMIT + 1_000_000) throw new Error('Use a video under 25 MB, or paste a video link instead.');
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || !file.size) throw new Error('Choose an image or video.');
    const mime = file.type;
    const video = VIDEO_TYPES.includes(mime);
    if (!video && !IMAGE_TYPES.includes(mime)) throw new Error('Use a PNG, JPG, WebP, GIF, MP4, WebM, or MOV file.');
    if (file.size > (video ? VIDEO_LIMIT : IMAGE_LIMIT)) throw new Error(video ? 'Use a video under 25 MB, or paste a video link instead.' : 'Use an image under 10 MB.');
    const id = await storeMedia(owner, file.name, mime, await file.arrayBuffer());
    return Response.json({ id, name: file.name, mime, kind: video ? 'video' : 'image' });
  } catch (e) { return failure(e); }
}

/** Serve a stored file to its owner only. ?download=1 forces a file download. */
export async function GET(request: Request) {
  try {
    const owner = await identity(request);
    const params = new URL(request.url).searchParams;
    const id = params.get('id') || '';
    const row = await database().prepare('SELECT name, mime FROM uploads WHERE id = ? AND owner = ?').bind(id, owner).first<{ name: string; mime: string }>();
    if (!row || ![...IMAGE_TYPES, ...VIDEO_TYPES].includes(row.mime) || !env.BUCKET) return failure(new Error('Media not found.'), 404);
    const object = await env.BUCKET.get(`${owner}/${id}`);
    if (!object) return failure(new Error('Media not found.'), 404);
    const name = row.name.replace(/[^\w.\- ]+/g, '_');
    return new Response(await object.arrayBuffer(), { headers: {
      'Content-Type': row.mime,
      'Content-Disposition': `${params.get('download') ? 'attachment' : 'inline'}; filename="${name}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (e) { return failure(e, 401); }
}
