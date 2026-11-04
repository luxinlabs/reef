import { env } from 'cloudflare:workers';
import { database } from './server';
import { publicWebsite } from './ingest';
import type { Media } from './domain';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const IMAGE_LIMIT = 10_000_000;
export const VIDEO_LIMIT = 25_000_000;

export async function storeMedia(owner: string, name: string, mime: string, bytes: ArrayBuffer) {
  if (!env.BUCKET) throw new Error('Media storage is not configured.');
  const id = crypto.randomUUID();
  await env.BUCKET.put(`${owner}/${id}`, bytes, { httpMetadata: { contentType: mime } });
  await database().prepare('INSERT INTO uploads (id, owner, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, owner, name.slice(0, 200), mime, bytes.byteLength, new Date().toISOString()).run();
  return id;
}

/** Media rows the owner uploaded through /api/media (images and videos only). */
export async function ownedMedia(ids: string[], owner: string): Promise<Media[]> {
  const out: Media[] = [];
  for (const id of ids) {
    const row = await database().prepare('SELECT name, mime FROM uploads WHERE id = ? AND owner = ?').bind(id, owner).first<{ name: string; mime: string }>();
    if (!row || ![...IMAGE_TYPES, ...VIDEO_TYPES].includes(row.mime)) throw new Error('Media file not found.');
    out.push({ id, kind: row.mime.startsWith('video/') ? 'video' : 'image', name: row.name, mime: row.mime });
  }
  return out;
}

/** A public https link to a demo video (YouTube, Loom, Vimeo, or any page). */
export function videoLink(value: string): Media {
  const url = publicWebsite(value.trim());
  return { kind: 'link', name: url.hostname.replace(/^www\./, ''), url: url.href };
}

/**
 * Screenshot a public product page with Microlink and keep a copy in our own storage,
 * so it never expires and is served only to its owner. Works keyless on Microlink's
 * free tier; SCREENSHOT_API_KEY switches to the pro endpoint with higher limits.
 */
export async function captureScreenshot(target: string, owner: string): Promise<Media> {
  const page = publicWebsite(target);
  const base = env.SCREENSHOT_API_KEY ? 'https://pro.microlink.io/' : 'https://api.microlink.io/';
  const query = new URLSearchParams({ url: page.href, screenshot: 'true', meta: 'false', embed: 'screenshot.url', 'viewport.width': '1440', 'viewport.height': '900', waitUntil: 'networkidle2' });
  const response = await fetch(`${base}?${query}`, { headers: env.SCREENSHOT_API_KEY ? { 'x-api-key': env.SCREENSHOT_API_KEY } : {}, signal: AbortSignal.timeout(35000) });
  const mime = (response.headers.get('content-type') || '').split(';')[0].trim();
  if (!response.ok || !IMAGE_TYPES.includes(mime)) throw new Error(`Screenshot service returned HTTP ${response.status}.`);
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > IMAGE_LIMIT) throw new Error('Screenshot was empty or too large.');
  const host = page.hostname.replace(/^www\./, '');
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1];
  const id = await storeMedia(owner, `${host}-screenshot.${ext}`, mime, bytes);
  return { id, kind: 'screenshot', name: `Screenshot of ${host}`, mime, url: page.href };
}
