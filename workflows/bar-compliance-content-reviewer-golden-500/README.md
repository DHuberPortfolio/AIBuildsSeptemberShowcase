# Bar Compliance Content Reviewer - Golden 500

*A test copy of the [Bar Compliance Content Reviewer](../bar-compliance-content-reviewer/) that scores the same pipeline against a 500-document answer key.*

## What it is

The demo workflow carries a 40-document answer key inline. That shows direction, not an error rate: 0 false alarms on 14 clean documents still allows a real rate up to 21.5%. This copy runs the same pipeline (prompt v2, the pass-with-notes log, the silent-error scorecard) over 500 documents held in an n8n data table: the original 40 and 460 more, 243 with a violation and 257 clean, 112 of the clean ones written to look like a violation.

The demo workflow is unchanged.

## How it differs from the demo

12 nodes. What is different:

| Node | Type | What changed |
|---|---|---|
| `Load Golden 500` | Data Table | New. Reads the 500-document answer key. |
| `Load Clients and Eval Set` | Code | Builds the evaluation set from the table instead of an inline list, and checks every row against a fingerprint recorded when the key was frozen. If a row has been edited, added or removed since, the run stops rather than scoring against a key nobody signed off. |
| `Layer 2 LLM Review` | HTTP → Anthropic | Sends requests two at a time, 1.5 seconds apart. Two 500-record runs at once hit the API’s concurrency limit, and the refused calls went to a person rather than being retried. |

The demo’s `Answer Key v2 Additions` node is gone: those 9 additions are part of the table. An advisory Florida rule is kept as an expected note rather than a violation, since it can never block copy.

## Measured

One run, scored by the workflow’s own scorecard and by the [evaluation harness](https://github.com/DHuberPortfolio/workflow-eval-harness), which agree:

- **Silent error rate 9.8%**: 25 of the 256 documents that went out without review needed a person (likely range 6.7–14.0%).
- 89.7% of violations reached a person. 26 of the 257 clean documents were sent to a person anyway.
- 15 of the 25 silent errors are award, rating or list claims (“Named to the 2025 Super Lawyers list”). The model rates them 0.75 almost every time, under every client’s threshold.
- 23 of the 26 unnecessary reviews come from the regex layer, which cannot read context: a fee counted as a result, a certification that names its certifying body, “We cannot guarantee” read as a guarantee.
- $1.92 for the run, $3.83 per 1,000 documents.

The full analysis, including what two policy changes would do on these 500 documents, is in the harness’s [compliance reviewer notes](https://github.com/DHuberPortfolio/workflow-eval-harness/blob/main/examples/compliance-reviewer/NOTES.md).

## Running it

Import, attach an Anthropic credential to the Layer 2 node, and create two data tables: the answer key (columns `item_id`, `client_id`, `content`, `expected_violations`, `expected_notes`, `detectable_by`, `label_confidence`, `trap`, `key_version`) and the pass-with-notes log. The 500 documents are not in this repository, and the fingerprint check stops a run against any other key. To accept a deliberate change to the key, update the fingerprints in `Load Clients and Eval Set`.

No credentials are included in the export. Attach your own.

## Known limits

- One run. How much the numbers move between runs of identical code has not been measured at this size.
- The fixes the run points to (award claims always to a person, thresholds no higher than the model’s reliable range, four regex rules that misread context) are not applied here.

---

Test data is synthetic. Client and employer names are removed; organisations are referred to by category. Write-ups with the full measurements are at [devinhuber.com](https://devinhuber.com/builds/).
