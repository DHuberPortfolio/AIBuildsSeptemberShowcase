# AI agent builds

Workflow source for agents I built in n8n, plus the evaluation harness that measures one of them.

Every build here answers the same three questions: what does it do, how often is it wrong, and what happens when it is. The write-ups with the measurements live at **[devinhuber.com](https://devinhuber.com/)**; this repository is the code behind them.

— Devin Huber · [devinhuber.com](https://devinhuber.com/) · [LinkedIn](https://www.linkedin.com/in/devinhuber/)

## What's here

| | |
|---|---|
| [`workflows/metadata-enrichment-agent.json`](workflows/metadata-enrichment-agent.json) | Tags incoming news against a controlled vocabulary. Deterministic entity resolution and deduplication, an LLM enrichment call, then a conformance guard that decides what may reach the index. 16 nodes. |
| [`workflows/bar-compliance-content-reviewer.json`](workflows/bar-compliance-content-reviewer.json) | Reviews legal marketing copy against attorney advertising rules. Regex catches banned terms, the model catches implied ones, and the workflow reports its own accuracy. 8 nodes. |
| [`workflows/competitor-watch-monthly-digest.json`](workflows/competitor-watch-monthly-digest.json) | Monthly competitor monitoring: snapshot, diff, score materiality, build a per-client digest. 14 nodes. |
| [`workflows/competitor-registry-builder.json`](workflows/competitor-registry-builder.json) | Reads internal links off a competitor homepage and identifies the case-results, attorneys, awards and news pages regardless of what they are called. 9 nodes. |
| [`workflows/assessment-template-test-harness.json`](workflows/assessment-template-test-harness.json) | Runs a transcript through a long, rule-heavy clinical documentation prompt so prompt changes can be regression-tested against a fixed input rather than eyeballed. 2 nodes. |
| [`workflows/snapshot-backdating-fixture.json`](workflows/snapshot-backdating-fixture.json) | Test utility. Trims and backdates stored snapshots so a competitor-watch run has real change to detect. 5 nodes. |
| [`eval/metadata-enrichment/`](eval/metadata-enrichment/) | Runs the metadata agent's deterministic layers outside n8n and reproduces a recorded production run, figure for figure. |

## The evaluation harness

`eval/metadata-enrichment/` is the part worth looking at first.

The metadata agent has three layers: a deterministic structural scan, an LLM call, and a deterministic conformance guard. Layers 1 and 3 are ordinary JavaScript, so they can run anywhere. The harness takes those node bodies **unmodified**, replays them over the model output recorded in a real run, and checks the result against that run's scorecard:

```bash
cd eval/metadata-enrichment
node verify.js
# PASS  56/56 figures match n8n execution 49
```

No dependencies, no network, no API key. All 56 figures — the routing split, per-facet precision, recall and F1, the deduplication pairs, the review-queue precision, cost to six decimals — come out identical to the run that produced them.

That is the point of the layout. If the guard is deterministic, its behaviour should be reproducible by anyone, and a claim about it should be checkable rather than taken on trust. The same harness backs the [interactive demo](https://devinhuber.com/projects/metadata/#demo) on the site, which ships these same node bodies to the browser and executes them there.

`node run.js` writes `run49-replay.json` with the full per-record output if you want to inspect a single article end to end.

## Reading a workflow without n8n

Each file is a standard n8n export: `nodes` carries the steps, `connections` the wiring. The logic lives in `parameters.jsCode` on the Code nodes and in `parameters.*` on the HTTP and LLM nodes. To run one, import the JSON into any n8n instance and attach your own credentials.

## Notes on this code

**Test data is synthetic.** The 24-article set inside the metadata workflow was written by me as an answer key, with deliberate traps — a common noun that looks like a company name, a passing mention, retired codes, a renamed company, a near-duplicate. The articles, the company authority file and the controlled vocabulary are all invented. No client content is in this repository.

**Client and employer names are removed.** These were built speculatively, against publicly known problems, to show an approach. Organizations are referred to by category. Nothing here was built for, or belongs to, an employer.

**Credentials are stripped.** No credential references, API keys, webhook IDs, internal URLs or email addresses are present in any file. `sanitize.py` in the build that produced this repository enforces that with an audit that fails the build on a match.

**These are prototypes.** They were built to be measured, not to carry production volume. The scorecards say what each sample size can and cannot support; small sets show direction, not production error rates.

## Method

How I evaluate these — answer keys written before the run, adversarial cases, the four metrics, and a tuning change I reverted — is written up at [devinhuber.com/evaluation](https://devinhuber.com/evaluation/).

## License

MIT. See [LICENSE](LICENSE).
