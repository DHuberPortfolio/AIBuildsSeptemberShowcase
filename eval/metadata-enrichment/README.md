# Metadata enrichment: reproducible evaluation

Replays a recorded run of the metadata enrichment agent outside n8n and checks the result against that run's scorecard.

```bash
node verify.js
# PASS  56/56 figures match n8n execution 49
```

Node 18 or later. No dependencies, no network calls, no API key.

## Why this is possible

The agent has three layers:

| Layer | What it does | Deterministic? |
|---|---|---|
| 1 · Structural scan | Deduplication by shingle overlap, company candidate resolution against an authority file | yes |
| 2 · Enrichment | An LLM proposes subject, industry, geography and company codes with confidences and evidence spans | no |
| 3 · Conformance guard | Vocabulary membership, facet match, verbatim evidence check, deprecation remapping, confidence floors, facet caps, routing | yes |

Only layer 2 is stochastic. Its output on one particular run is recorded in [`data/run49-layer2.json`](data/run49-layer2.json), so layers 1 and 3 can be re-executed over it as many times as you like and must produce the same answer every time. If they do not, something changed that should not have.

## Layout

```
nodes/queue.js        loads the vocabulary, deduplicates, builds the prompt   (n8n Code node, verbatim)
nodes/layer1.js       structural scan and entity candidates                   (n8n Code node, verbatim)
nodes/layer3.js       conformance guard and routing                           (n8n Code node, verbatim)
nodes/scorecard.js    scores the run against the answer key                   (n8n Code node, verbatim)
data/vocab.json       the 65-term controlled vocabulary
data/run49-layer2.json  what the model returned on each of the 24 articles
run.js                shims n8n's $input / $() so the node bodies run as-is
verify.js             asserts all 56 scorecard figures
```

The four files under `nodes/` are the bodies of the corresponding n8n Code nodes, unedited apart from client-name removal. They still contain their `return` statements and their references to `$input`; `run.js` wraps each one in a `Function` and supplies those, which is why nothing in them had to be rewritten to run here.

## What the 56 assertions cover

Routing split and straight-through rate · silent error rate and its base · completeness-gate blocks, prevented errors and precision · codes proposed, accepted, inherited and rejected, with the reason breakdown · per-facet precision, recall, F1 and exact-set-match for subject, industry, geography and company · review-queue precision and the record it flagged unnecessarily · both entity-resolution traps · deduplication clusters and the suppressed pairs · error count · cost, tokens and cost per thousand.

## Inspecting a single record

```bash
node run.js            # writes run49-replay.json
```

Each entry carries the article, the Layer 1 result, every guard rejection with its reason, the completeness and salience flags, the routing decision and its reason, and the applied codes beside the answer key.

The article IDs worth opening first: **A08** (the text says "shell companies" and must not resolve to Shell plc), **A09** (the genuine Shell plc article, paired against it), **A17** (a passing mention in a biography line), **A22** (the model returns the UK code at 0.5, the floor rejects it, and a cue blocks the record anyway), **A10** (retired codes), **A14** (a renamed company), **A02** and **A19** (near-duplicates).

## Test data

Synthetic. The articles, the company authority file and the controlled vocabulary were written as an answer key with deliberate traps. No client content.

24 articles is a small set: it shows whether the guard behaves as designed and which direction a change moves things. It cannot support a production error rate, and the scorecard says so in its own notes.
