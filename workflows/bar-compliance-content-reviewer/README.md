# Bar Compliance Content Reviewer

*Reviews law-firm marketing copy against attorney advertising rules before it goes live.*

## What it does

State bar associations restrict what a law firm may claim in its marketing. A guarantee, a superlative, an unqualified comparison or a testimonial framed the wrong way can all be violations, and the rules differ by state.

Keyword matching catches the obvious ones and misses the rest, because the risky claims are usually implied — a guarantee phrased as a track record, a comparison phrased as a fact. So the review runs in two layers and reports its own accuracy rather than just returning verdicts.

## How it is wired

8 nodes. The ones that matter:

| Node | Type | What it does |
|---|---|---|
| `Load Clients and Eval Set` | Code | Loads the ground-truth document set with each client’s governing state and rule set. |
| `Layer 1 Deterministic Scan` | Code | Regex for terms a bar bans outright. Fast, free, and not a matter of judgement. |
| `Layer 2 LLM Review` | HTTP → Anthropic | Catches the implied violations regex cannot see, returning a violation code and the span it relies on. |
| `Merge and Route` | Code | Combines both layers and routes by confidence rather than returning a flat verdict. |
| `Scorecard` | Code | Scores the run against the ground truth: catch rate, false-positive rate and per-document cost. |

## What happens when it is wrong

| Failure | What the workflow does |
|---|---|
| A missed violation | The expensive failure — copy goes live carrying it. This is what the ground-truth set exists to measure, and adversarial documents were written specifically to slip past keyword matching. |
| A false positive | The cheap failure, but not free: every one is a reviewer’s time. Reported separately so the two are never traded off silently. |
| Low confidence | Routes to a human rather than being resolved either way. |
| Anything blocked or flagged | A person signs off. The workflow flags and routes; it does not approve copy. |

## Measured

- 40 ground-truth documents across 10 clients and 5 state rule sets.
- 7 violation codes on the LLM layer.
- Costed at $2 / $10 per million tokens to project cost per 1,000 documents.

## Running it

Import, attach an Anthropic credential to the Layer 2 node, and Execute. The client list and evaluation set are inline in the first Code node, so it runs with no external data.

No credentials are included in the export. Attach your own.

## Known limits

- Rule sets cover 5 states. Adding a sixth is data, not code, but it has not been done.
- It flags and routes. It does not decide, and nothing reaches publication without a person.

---

Test data is synthetic. Client and employer names are removed; organisations are referred to by category. Write-ups with the full measurements are at [devinhuber.com](https://devinhuber.com/builds/).
