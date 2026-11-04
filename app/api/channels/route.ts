import { identity, bufferChannels, failure } from '@/lib/server';
export async function GET() { try { return Response.json({channels:await bufferChannels(await identity())}); } catch(e) {return failure(e);} }
