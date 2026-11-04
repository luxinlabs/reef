# Reef — judge guide

## What this prototype demonstrates

A Muse-powered workflow from product context to an editable launch campaign, with source references, preview, approval, and a human-controlled social-posting handoff.

## Quick walkthrough

1. Open the submitted live demo URL and complete its required sign-in. The final submission must provide an accessible URL and clear access instructions; the registered Sites project currently has no live URL.
2. Choose **New launch**. Enter a product name, a public website or GitHub repository, and a short accurate description. Source text alone is enough if a website is inaccessible.
3. Select a goal and click **Create my launch plan**. A working server-side Meta Model API key is required.
4. Inspect **Product brief** and expand the suggested evidence. Claims remain marked for human review.
5. Open **Campaigns**, preview a post, and edit it. Approve the final version.
6. Use **Post on X** or **Post on Threads** to open the text in the platform composer. The platform handles sign-in. You still press Post yourself; testing does not require a public post.
7. Download a launch image or video if you want to attach it. Compose links transfer text, not media files.
8. Inspect the Hacker News task. It supplies preparation guidance rather than generated submission text.

## Sample mode

**Explore a sample** demonstrates the layout and draft-review experience without a model call. The sample is labeled and cannot be approved for publishing. It is not evidence of a successful live model request.

## Important distinctions

- Muse calls happen on the server; no API key belongs in a public form or browser bundle.
- Public GitHub input reads repository metadata and README context, not an exhaustive code audit.
- Source PDFs and images can be sent to Muse; separate launch-media uploads are stored for preview/download.
- A demo-video URL is saved and can inform a link in the generated copy. Reef does not currently watch or transcribe that video.
- Automatic page screenshots are best-effort Microlink captures, not Muse-generated artwork.
- Opening a social composer is not the same as publishing a post.
- The optional Buffer path submits approved text to a queue. Provider acceptance is not proof of publication.
- Conversion tracking and signup analytics are not implemented; their empty states are deliberate.

## Build and tests

See ../README.md for local setup. At reviewed code revision 009f082:

- Production build passes.
- TypeScript check passes.
- Nine domain/URL-boundary tests pass.
- In-process route integration test passes using SQLite and mocked Muse/Buffer responses.

The automated checks do not establish live external-provider behavior or full browser usability. New GitHub, screenshot, media, and compose flows need a live demonstration before claiming end-to-end verification.

## Technology and attribution

React, TypeScript, Vinext, Cloudflare Workers/D1/R2, Zod, Drizzle, Meta Model API, GitHub API, Microlink, and optional Buffer. ASCII Sharks is reused under its retained MIT license; the current sky interface builds on that visual approach. See lib/ascii-sharks/LICENSE and DEVELOPMENT.md for framework information.
