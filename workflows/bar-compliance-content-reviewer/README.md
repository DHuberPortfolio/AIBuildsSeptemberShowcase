# Bar Compliance Content Reviewer

*Reviews law-firm marketing copy against attorney advertising rules before it goes live.*

## What it does

State bar associations restrict what a law firm may claim in its marketing. A guarantee, a superlative, an unqualified comparison or a testimonial framed the wrong way can all be violations, and the rules differ by state.

Keyword matching catches the obvious ones and misses the rest, because the risky claims are usually implied — a guarantee phrased as a track record, a comparison phrased as a fact. So the review runs in two layers and reports its own accuracy rather than just returning verdicts.

## How it is wired

12 nodes. The ones that matter:

| Node | Type | What it does |
|---|---|---|
| `Load Clients and Eval Set` | Code | Loads the ground-truth document set with each client’s governing state and rule set. |
| `Answer Key v2 Additions` | Code | Adds 9 violations the original answer key missed, as a dated amendment, so the original key stays readable. |
| `Layer 1 Deterministic Scan` | Code | Regex for terms a bar bans outright. Fast, free, and not a matter of judgement. Also builds the Layer 2 prompt. |
| `Layer 2 LLM Review` | HTTP → Anthropic | Catches the implied violations regex cannot see, returning a violation code, the span it relies on, and a confidence on an anchored scale. |
| `Merge and Route` | Code | Combines both layers and routes by confidence against each client’s threshold, rather than returning a flat verdict. |
| `Scorecard` | Code | Scores the run against the ground truth. Headline: the silent error rate, the share of copy that went out without review but needed a person. Beside it: catch rate, false alarm rate, review precision and per-document cost. |
| `Collect Notes` → `Pass-with-Notes Log` | Code → Data Table | Writes every note on copy that went out as `PASS_WITH_NOTES` to a data table, one row per note, so recurring problems can be spotted. |

## What changed

Measured with the [evaluation harness](https://github.com/DHuberPortfolio/workflow-eval-harness), which scores this workflow’s runs against its answer key:

- **Prompt v2.** The first prompt told the model to be conservative, and it hedged the confidence of findings it did report: real implied violations came back at 0.55–0.85, under the client thresholds (0.80–0.90), so the copy went out with only a note. The prompt now anchors what each confidence level means, and keeps caution for *whether* to report, not for how confident a report is. On the 40 documents, the silent error rate fell from 22–30% to 6.7% in four runs out of four.
- **Silent-error scorecard.** The scorecard used to count a note as a catch, and reported a 100% catch rate while 22–30% of the copy that went out needed a person. A note is no longer a catch: the copy still went out.
- **Pass-with-notes log.** `PASS_WITH_NOTES` copy goes out without review, so without a log its notes would be seen by nobody.
- **Answer key v2.** The harness listed violations the model named in every run that the key did not; each was read against the copy, and 9 were added.

## What happens when it is wrong

| Failure | What the workflow does |
|---|---|
| A missed violation | The expensive failure — copy goes out carrying it. The scorecard’s headline counts it, and adversarial documents were written specifically to slip past keyword matching. |
| A finding below the client’s threshold | The copy goes out as `PASS_WITH_NOTES`. The note is logged, and the scorecard counts the copy as a miss if it was a violation. |
| A false positive | The cheap failure, but not free: every one is a reviewer’s time. Reported separately so the two are never traded off silently. |
| The model call fails | Routes to a person, never out without review. |
| Anything blocked or flagged for review | A person signs off. |

## Measured

- 40 ground-truth documents across 10 clients and 5 state rule sets; 7 violation codes on the LLM layer.
- Silent error rate 6.7% (1 of 15) in four runs out of four with prompt v2; 22–30% with the first prompt.
- On a 500-document answer key, run in the [Golden 500 test copy](../bar-compliance-content-reviewer-golden-500/): 9.8% (25 of 256).
- Costed at $2 / $10 per million tokens to project cost per 1,000 documents.

## Running it

Import, attach an Anthropic credential to the Layer 2 node, and Execute. The client list and evaluation set are inline in the first Code node. The `Pass-with-Notes Log` node writes to an n8n data table: create one with the columns listed in the node, or disable the node.

No credentials are included in the export. Attach your own.

## Known limits

- Rule sets cover 5 states. Adding a sixth is data, not code, but it has not been done.
- Copy it passes, with or without notes, goes out without a person. The silent error rate measures how often that was wrong; on the 500-document set, award and rating claims are the largest source, because the model rates them 0.75, under every client’s threshold.

---

Test data is synthetic. Client and employer names are removed; organisations are referred to by category. Write-ups with the full measurements are at [devinhuber.com](https://devinhuber.com/builds/).
