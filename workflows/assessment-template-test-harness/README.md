# Assessment Template Test Harness

*Runs a transcript through a long, rule-heavy clinical documentation prompt so prompt changes can be regression-tested rather than eyeballed.*

## What it does

An occupational-therapy documentation assistant fills in an assessment form from the transcript of a practitioner’s visit. A qualified practitioner reviews and signs everything it produces, so the failure mode is not a crash — it is a form that reads plausibly and says something the person never said.

The prompt is the product: around 9,800 characters of rules about using only what is in the transcript, never inferring a diagnosis or eligibility, preserving contradictions rather than resolving them, and reproducing figures verbatim. Change one rule and the failure surfaces three sections away.

So the workflow is deliberately two nodes. The value is not the plumbing, it is having a fixed input you can re-run after every prompt change.

## How it is wired

2 nodes. The ones that matter:

| Node | Type | What it does |
|---|---|---|
| `Submit Transcript` | Form Trigger | Paste a transcript and run it. No setup, no fixture files. |
| `Apply OT Template` | Anthropic | Temperature 0.1, the full template prompt, and 11 self-check items the model must clear before returning. |

## What happens when it is wrong

| Failure | What the workflow does |
|---|---|
| An inferred diagnosis, risk or eligibility | Explicitly prohibited in the prompt. The assistant records; it does not assess. |
| A contradiction in the transcript | Preserved, not resolved. If the person and their carer disagree, both go in the form — smoothing that over is the failure, not the fix. |
| A figure or quote | Reproduced verbatim. No paraphrasing of numbers. |
| Anything at all | A practitioner reviews, edits and signs off every field. Nothing reaches a record unsigned. |

## Measured

- Temperature 0.1 · 11 self-check items before return.
- A companion analysis tested 15 candidate drivers of summary quality across 200 recorded conversations. Corrected for multiple comparisons, none survived — and the dashboard reports that rather than the flattering version.

## Running it

Import, attach an Anthropic credential, open the form URL, paste any transcript.

No credentials are included in the export. Attach your own.

## Known limits

- Covers one template version.
- Two nodes by design. If you are looking for architecture here, it is in the prompt, not the graph.

---

Test data is synthetic. Client and employer names are removed; organisations are referred to by category. Write-ups with the full measurements are at [devinhuber.com](https://devinhuber.com/builds/).
