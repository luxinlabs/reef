import { z } from 'zod';
import { identity, insertCampaign, loadCampaign, saveCampaign, failure, buffer, bufferChannels, hasBufferAccess } from '@/lib/server';
import { sampleCampaign, approveDraft, editDraft, validatePublish } from '@/lib/domain';
const input = z.object({ action: z.enum(['sample','edit','approve','publish','brief']), id:z.string().optional(), revision:z.number().int().optional(), draftId:z.string().optional(), text:z.string().max(10000).optional(), channelId:z.string().optional(), brief:z.string().max(6000).optional(), audience:z.string().max(500).optional() });
export async function POST(request: Request) {
  try {
    const owner = await identity(request);
    const body = input.parse(await request.json());
    if (body.action === 'sample') { const c = sampleCampaign(); await insertCampaign(c, owner); return Response.json(c); }
    const c = await loadCampaign(body.id || '', owner);
    if (body.revision !== c.revision) throw new Error('This campaign changed. Refresh before continuing.');
    if (c.drafts.some(d => d.status === 'submitting')) throw new Error('A post is being submitted. Refresh its status before changing this campaign. If this persists, check Buffer before any retry.');
    const revision = c.revision;
    if (body.action === 'brief') {
      c.brief = body.brief ?? c.brief; c.audience = body.audience ?? c.audience;
      c.drafts = c.drafts.map(d => d.status === 'approved' ? {...d, status:'draft', approval:undefined} : d);
      c.events.unshift({at:new Date().toISOString(), text:'Product brief updated. Review draft accuracy before approval.'});
    } else {
      const index = c.drafts.findIndex(d => d.id === body.draftId);
      if (index < 0) throw new Error('Post not found.');
      const d = c.drafts[index];
      if (body.action === 'edit') c.drafts[index] = editDraft(d, body.text ?? '');
      if (body.action === 'approve') {
        c.drafts[index] = approveDraft(d, owner, c.demo);
        c.events.unshift({at:new Date().toISOString(), text:`${d.channel} post approved, version ${d.version}.`});
      }
      if (body.action === 'publish') {
        validatePublish(c, d);
        if (!hasBufferAccess(owner)) throw new Error('Connect Buffer for this account before publishing.');
        const channels = await bufferChannels(owner);
        const selected = channels.find(x => x.id === body.channelId);
        const service = { X:'twitter', Threads:'threads', LinkedIn:'linkedin' }[d.channel as 'X'|'Threads'|'LinkedIn'];
        if (!selected || selected.service.toLowerCase() !== service) throw new Error('Select a matching connected account.');
        d.status = 'submitting'; d.channelId = selected.id;
        await saveCampaign(c, owner, revision);
        try {
          const result = await buffer<{createPost:{post?:{id:string};message?:string}}>(`mutation { createPost(input: { text: ${JSON.stringify(d.text)}, channelId: ${JSON.stringify(selected.id)}, schedulingType: automatic, mode: addToQueue }) { ... on PostActionSuccess { post { id } } ... on MutationError { message } } }`);
          if (result.createPost.post?.id) {
            d.providerId = result.createPost.post.id; d.status = 'accepted';
            c.events.unshift({at:new Date().toISOString(), text:`${d.channel} accepted into ${selected.displayName || selected.name}’s Buffer queue. Publication is not yet confirmed.`});
          } else { d.status = 'failed'; d.approval = undefined; d.error = result.createPost.message || 'Buffer rejected this post.'; }
        } catch { d.status = 'unknown'; d.error = 'Submission outcome is uncertain. Check Buffer before taking any further action. Automatic retry is disabled.'; }
        await saveCampaign(c, owner, revision + 1);
        return Response.json(c);
      }
    }
    await saveCampaign(c, owner, revision);
    return Response.json(c);
  } catch(e) { return failure(e); }
}
