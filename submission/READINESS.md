# Submission readiness

Reviewed code: 009f082635d46fa4ac9e8a5540c05542082bbe57.

## Prepared

- [x] Ready-to-paste project title, tagline, descriptions, problem, audience, Meta usage, implementation, differentiation, challenge, and roadmap.
- [x] Two-minute recording script and screenshot list.
- [x] Judge walkthrough and honest implementation boundaries.
- [x] Current production build and TypeScript check.
- [x] Existing domain tests and mocked API integration suite.
- [x] Current GitHub URL pattern compiles with the browser’s v regex flag.
- [x] Repository URL identified from Git origin: https://github.com/luxinlabs/reef.

## Still required / not verified

- [ ] Actual submission field labels, limits, and required uploads from the authenticated portal.
- [ ] Entrant/team details, correct track, eligibility, and required attestations.
- [ ] Judge-accessible live demo URL. Native Sites metadata currently reports no live deployment and version 0; another deployment may exist but has not been supplied.
- [ ] Confirm repository visibility and that the intended latest commit is pushed.
- [ ] Successful live Muse generation with the configured account and current model.
- [ ] Live browser walkthrough of the current GitHub/media/compose additions.
- [ ] Demo recording uploaded to a judge-accessible link.
- [ ] Real application screenshots or logo upload if the actual form requires them.
- [ ] Final form review and submission receipt. No form has been filled or submitted in this session.

## Earlier console and connection questions

The chrome-extension://kbfnbcaeplbcioakkpcpgfkobkghlhen errors originate in Grammarly. They do not establish a Reef backend or Muse failure. Disable Grammarly for the page temporarily to separate extension noise from application errors.

The invalid pattern was a real HTML regex issue: under the browser's v regex flag, a slash in a character class must be escaped. The latest code escapes it, and commit 0e26e82 records that fix. A browser still reporting the old unescaped pattern may be showing an older deployment or cached page. Reload the latest build. If Generate still fails, the actual /api/generate response and the in-app error are needed to identify why; the pasted console lines alone do not establish the cause.

Current direct posting: approve a draft, then choose Post on X or Post on Threads. Reef opens the native compose screen with text. Sign in on that platform and press Post yourself. No social OAuth account connection exists inside Reef for this handoff.

BUFFER_API_KEY is a server credential for the optional Buffer API path. BUFFER_OWNER_ID is the Reef authenticated user ID allowed to use that credential; it is not an X username or Buffer channel ID. Both are optional for the current compose-link workflow. The latest settings UI intentionally removed the Buffer setup section; it currently reports Muse setup only. Self-service social OAuth remains future work.

## Claims to avoid

Do not claim fully autonomous posting to X/Reddit/HN, AI-generated HN submissions, automatic video understanding, automatic media attachment via compose links, live signup attribution, user traction, proven conversion gains, or a published deployment without evidence.

## Suggested final sequence

1. Complete the missing identity/link fields and map the prepared copy to the actual portal.
2. Verify the working product and access from a judge's perspective.
3. Record the demo, following the real duration limit.
4. Add real screenshots if requested.
5. Check that descriptions distinguish implemented integrations from live-verified behavior.
6. Review eligibility and attestations personally, submit, and retain the confirmation/receipt.
