import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import type { Campaign, BufferChannel } from './domain';
export async function identity(request?: Request) {
  if (request && request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new Error('Cross-origin action rejected.');
  }
  const user = await getChatGPTUser();
  if (!user) throw new Error('Sign in to save and manage your launches.');
  return user.userId;
}
export function database() {
  if (!env.DB) throw new Error('Campaign storage is not configured.');
  return env.DB;
}
export async function loadCampaign(id: string, owner: string) {
  const row = await database().prepare('SELECT data, revision FROM campaigns WHERE id = ? AND owner = ?').bind(id, owner).first<{data: string; revision: number}>();
  if (!row) throw new Error('Campaign not found.');
  return { ...JSON.parse(row.data), revision: row.revision } as Campaign;
}
export async function insertCampaign(c: Campaign, owner: string) {
  await database().prepare('INSERT INTO campaigns (id, owner, data, revision, updated_at) VALUES (?, ?, ?, ?, ?)').bind(c.id, owner, JSON.stringify(c), 1, new Date().toISOString()).run();
}
export async function saveCampaign(c: Campaign, owner: string, expectedRevision: number) {
  c.revision = expectedRevision + 1;
  const result = await database().prepare('UPDATE campaigns SET data = ?, revision = ?, updated_at = ? WHERE id = ? AND owner = ? AND revision = ?').bind(JSON.stringify(c), c.revision, new Date().toISOString(), c.id, owner, expectedRevision).run();
  if (!result.meta.changes) throw new Error('This campaign changed in another session. Refresh and try again.');
}
export async function buffer<T>(query: string): Promise<T> {
  if (!env.BUFFER_API_KEY) throw new Error('Buffer is not connected.');
  const response = await fetch('https://api.buffer.com', { method: 'POST', headers: { Authorization: `Bearer ${env.BUFFER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Buffer returned HTTP ${response.status}. Check the connection before retrying.`);
  const payload = await response.json() as { data: T; errors?: {message: string}[] };
  if (payload.errors?.length) throw new Error('Buffer rejected the request. Check account access and API configuration.');
  return payload.data;
}
export function hasBufferAccess(owner: string) { return Boolean(env.BUFFER_API_KEY && env.BUFFER_OWNER_ID === owner); }
export async function bufferChannels(owner: string): Promise<BufferChannel[]> {
  if (!hasBufferAccess(owner)) return [];
  const data = await buffer<{account:{organizations:{id:string}[]}}>('query { account { organizations { id } } }');
  const lists = await Promise.all(data.account.organizations.map(async org => {
    const result = await buffer<{channels:BufferChannel[]}>(`query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name displayName service } }`);
    return result.channels;
  }));
  return lists.flat();
}
export function failure(error: unknown, status = 400) {
  return Response.json({ error: error instanceof Error ? error.message : 'Something went wrong. Please try again.' }, { status });
}
