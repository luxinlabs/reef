export const channelNames = ['X', 'Threads', 'LinkedIn', 'Reddit', 'Hacker News', 'Product Hunt'] as const;
export type Channel = typeof channelNames[number];
export type Claim = { text: string; evidence: string; status: 'source' | 'confirmed' | 'unverified' };
export type Draft = {
  id: string; channel: Channel; text: string; rationale: string;
  status: 'draft' | 'approved' | 'submitting' | 'accepted' | 'unknown' | 'failed' | 'manual';
  version: number; approval?: { version: number; at: string; by: string };
  providerId?: string; error?: string; channelId?: string;
};
/** Launch media: an automatic page screenshot, founder uploads, or a demo video link. */
export type Media = { id?: string; kind: 'screenshot' | 'image' | 'video' | 'link'; name: string; mime?: string; url?: string };
export type Campaign = {
  id: string; revision: number; demo: boolean; name: string; url: string;
  description: string; audience: string; goal: string; createdAt: string;
  brief: string; claims: Claim[]; drafts: Draft[]; github?: string; media?: Media[];
  events: { at: string; text: string }[]; uploadIds: string[];
};
export type Config = { muse: boolean; model: string; buffer: boolean; signedIn: boolean; userId: string | null };
export type BufferChannel = { id: string; name: string; displayName: string; service: string };
export const limits: Partial<Record<Channel, number>> = { X: 280, Threads: 500, LinkedIn: 3000 };
export const manualChannels = new Set<Channel>(['Reddit', 'Hacker News', 'Product Hunt']);
export function canEdit(d: Draft) { return !['accepted', 'submitting', 'unknown'].includes(d.status); }
export function approveDraft(d: Draft, actor: string, demo: boolean): Draft {
  if (demo) throw new Error('Sample campaigns cannot be approved for publication. Create your own launch first.');
  if (manualChannels.has(d.channel)) throw new Error('This destination requires manual submission.');
  if (!canEdit(d) || !d.text.trim()) throw new Error('This post cannot be approved.');
  if (d.text.length > (limits[d.channel] ?? 3000)) throw new Error('Shorten this post to fit the channel limit.');
  return { ...d, status: 'approved', error: undefined, approval: { version: d.version, at: new Date().toISOString(), by: actor } };
}
export function editDraft(d: Draft, text: string): Draft {
  if (!canEdit(d)) throw new Error('This post is already submitted or its outcome needs reconciliation.');
  return { ...d, text, version: d.version + 1, approval: undefined, status: manualChannels.has(d.channel) ? 'manual' : 'draft', error: undefined };
}
export function validatePublish(c: Campaign, d: Draft) {
  if (c.demo) throw new Error('Sample campaigns cannot be published.');
  if (manualChannels.has(d.channel)) throw new Error('Automatic posting is not supported for this destination.');
  if (d.status !== 'approved' || d.approval?.version !== d.version) throw new Error('Approve the current version before publishing.');
  if (!d.text.trim() || d.text.length > (limits[d.channel] ?? 3000)) throw new Error('Post length is invalid.');
}
export function sampleCampaign(): Campaign {
  const at = new Date().toISOString();
  return {
    id: crypto.randomUUID(), revision: 1, demo: true, name: 'Your next big thing', url: '',
    description: 'A sample launch for a tool that turns scattered meeting notes into clear action items.',
    audience: 'Small teams and independent makers', goal: 'Find my first users', createdAt: at,
    brief: 'Less time untangling notes. More time moving things forward. A simple workspace that turns meeting notes into clear, actionable next steps.',
    claims: [
      { text: 'Turns meeting notes into action items', evidence: 'Sample product description — illustrative, not a verified product.', status: 'unverified' },
      { text: 'Built for small teams', evidence: 'Sample audience — illustrative.', status: 'unverified' },
    ],
    drafts: [
      { id: crypto.randomUUID(), channel: 'X', text: 'The meeting ended. The work shouldn’t get lost.\n\nWe’re building a simpler way to turn scattered meeting notes into clear next steps. Made for small teams who would rather build than chase action items.\n\nWhat’s your biggest post-meeting headache?', rationale: 'Start a conversation with makers who recognize the problem.', status: 'draft', version: 1 },
      { id: crypto.randomUUID(), channel: 'Threads', text: 'Ever leave a meeting feeling productive… then open your notes and wonder who’s doing what?\n\nThat’s the problem we’re working on. A simple way to turn messy notes into clear next steps, built for small teams.\n\nWe’d love to hear how you handle it today.', rationale: 'A relatable question invites feedback before a hard sell.', status: 'draft', version: 1 },
      { id: crypto.randomUUID(), channel: 'Hacker News', text: '', rationale: 'When your product is ready to try, write your own Show HN submission. Explain what you built, how it works, and what feedback you want. Submit personally and stay available for discussion.', status: 'manual', version: 1 },
    ],
    events: [{ at, text: 'Sample launch opened. Nothing has been posted.' }], uploadIds: [],
  };
}
