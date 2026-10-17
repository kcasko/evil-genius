# Submission publication checklist

The live game is public. The source, article, and demo package are prepared for review; their preparation does not satisfy the contest's public-submission requirements by itself.

## Before publication

1. Review `builder-center-article.md`, the source ZIP, and the actual recorded demo. The article must link to the final publicly accessible source repository and demo video.
2. Confirm the participant meets the contest's personal eligibility terms and that the agent satisfies its originality/prior-publication requirement. A private repository creation date alone does not answer that question.
3. Resolve the standing **no push/merge** restriction before updating GitHub. The existing `kcasko/evil-genius` repository is private and predates the deployed overlays. Merely changing its visibility would expose an outdated implementation.
4. Review the source provenance and secret-scan findings. The archive intentionally excludes Git metadata, developer configuration, local logs, recordings, credentials, and billing snapshots.

## Publish the reviewed entry

- Publish the reviewed source snapshot and reusable pattern to the intended public repository. Verify it anonymously, including the current game assets and instructions. Making a repository public is a separate action from preparing this archive.
- Publish the captioned demo to a publicly accessible video location, then check anonymous playback and duration under three minutes. The local MP4 does not count as a public video link.
- Add the final repository and video links to the article, publish on AWS Builder Center, and attach it to the hackathon project.
- Apply both `#strands-decider-2b` and `#tool-selection` before the deadline.
- Recheck all three public links and the live game without an authenticated session. Keep the deployment available through judging while respecting the spending controls.

The published event page currently lists October 23, 2026 at 11:59 PM Pacific as the deadline, equivalent to October 24 at 2:59 AM in Michigan. Recheck the event page before submitting in case AWS changes it.

Official requirements: https://builder.aws.com/build/hackathons/4f50957c-1d08-37ab-b11c-97516b9adeb4/agent-experience-hackathon.
