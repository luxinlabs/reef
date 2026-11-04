import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database, failure, hasBufferAccess } from '@/lib/server';
export async function GET() {
  try {
    const user = await getChatGPTUser();
    const rows = user ? await database().prepare('SELECT data, revision FROM campaigns WHERE owner = ? ORDER BY updated_at DESC LIMIT 50').bind(user.userId).all<{data:string; revision:number}>() : {results: []};
    return Response.json({ campaigns: rows.results.map(r => ({...JSON.parse(r.data), revision:r.revision})), config: { muse: Boolean(env.MODEL_API_KEY), model: env.MUSE_MODEL || 'muse-spark-1.3', buffer: user ? hasBufferAccess(user.userId) : false, signedIn: Boolean(user), userId: user?.userId || null } }, {headers:{'Cache-Control':'no-store'}});
  } catch (e) { return failure(e, 503); }
}
