# AI agent builds

Workflow source for agents I built in n8n, plus a replay of one recorded run. The evaluation harness that measures them lives in its own repository: **[workflow-eval-harness](https://github.com/DHuberPortfolio/workflow-eval-harness)**.

Every build here answers the same three questions: what does it do, how often is it wrong, and what happens when it is. The write-ups with the measurements live at **[devinhuber.com](https://devinhuber.com/)**; this repository is the code behind them.

— Devin Huber · [devinhuber.com](https://devinhuber.com/) · [LinkedIn](https://www.linkedin.com/in/devinhuber/)

## What's here

| | |
|---|---|
| [`workflows/metadata-enrichment-agent/`](workflows/metadata-enrichment-agent/) | Tags incoming news against a controlled vocabulary. Deterministic entity resolution and deduplication, an LLM pass, then a conformance guard that decides what may reach the index. 17 nodes. |
| [`workflows/bar-compliance-content-reviewer/`](workflows/bar-compliance-content-reviewer/) | Reviews legal marketing copy against attorney advertising rules. Regex catches banned terms, the model catches implied ones, and the workflow scores its own silent error rate. 12 nodes. |
| [`workflows/metadata-enrichment-agent-golden-500/`](workflows/metadata-enrichment-agent-golden-500/) | Test copy of the metadata agent, scored against a 500-article answer key, with the fixes that measurement called for. The demo workflow is unchanged. 18 nodes. |
| [`workflows/bar-compliance-content-reviewer-golden-500/`](workflows/bar-compliance-content-reviewer-golden-500/) | Test copy of the compliance reviewer, scored against a 500-document answer key. The demo workflow is unchanged. 12 nodes. |
| [`workflows/competitor-watch-monthly-digest/`](workflows/competitor-watch-monthly-digest/) | Monthly competitor monitoring: snapshot, diff, score materiality, build a per-client digest. 14 nodes. |
| [`workflows/competitor-registry-builder/`](workflows/competitor-registry-builder/) | Reads internal links off a competitor homepage and identifies which pages are worth watching, regardless of what they are called. 9 nodes. |
| [`workflows/assessment-template-test-harness/`](workflows/assessment-template-test-harness/) | Runs a transcript through a long, rule-heavy clinical documentation prompt so prompt changes can be regression-tested against a fixed input. 2 nodes. |
| [`workflows/snapshot-backdating-fixture/`](workflows/snapshot-backdating-fixture/) | Test utility. Trims and backdates stored snapshots so a competitor-watch run has real change to detect. 5 nodes. |
| [`eval/metadata-enrichment/`](eval/metadata-enrichment/) | The replay of run 49's deterministic layers: runs the metadata agent's layers 1 and 3 outside n8n over the model output recorded in run 49, and reproduces that run's scorecard, figure for figure. |

Every workflow folder carries a README covering what the build does, how it is wired, what it does when it is wrong, and how to run it.

## The evaluation harness

**[github.com/DHuberPortfolio/workflow-eval-harness](https://github.com/DHuberPortfolio/workflow-eval-harness)** scores any workflow's runs against a golden set of test records with an answer key. Its headline is the silent error rate: of the records a workflow sent out without anyone reviewing them, the share that needed a person. It measured the builds here: it found that the compliance reviewer's own scorecard counted a note as a catch, and it scored both the compliance reviewer and the metadata agent on 500-record answer keys (the Golden 500 folders).

## Replaying run 49

`eval/metadata-enrichment/` is the replay of run 49's deterministic layers.

The metadata agent has three layers: a deterministic structural scan, an LLM call, and a deterministic conformance guard. Layers 1 and 3 are ordinary JavaScript, so they can run anywhere. The replay takes those node bodies **unmodified**, replays them over the model output recorded in a real run, and checks the result against that run's scorecard:

```bash
cd eval/metadata-enrichment
node verify.js
# PASS  56/56 figures match n8n execution 49
```

No dependencies, no network, no API key. All 56 figures — the routing split, per-facet precision, recall and F1, the deduplication pairs, the review-queue precision, cost to six decimals — come out identical to the run that produced them.

That is the point of the layout. If the guard is deterministic, its behaviour should be reproducible by anyone, and a claim about it should be checkable rather than taken on trust. The same replay backs the [interactive demo](https://devinhuber.com/demo/) on the site, which ships these same node bodies to the browser and executes them there.

`node run.js` writes `run49-replay.json` with the full per-record output if you want to inspect a single article end to end.

## Reading a workflow without n8n

Start with the README in the folder. If you want the export itself, `workflow.json` is standard n8n: `nodes` carries the steps, `connections` the wiring. The logic lives in `parameters.jsCode` on the Code nodes and in `parameters.*` on the HTTP and LLM nodes. To run one, import the JSON into any n8n instance and attach your own credentials.

## Notes on this code

**Test data is synthetic.** The 24-article set inside the metadata workflow was written by me as an answer key, with deliberate traps — a common noun that looks like a company name, a passing mention, retired codes, a renamed company, a near-duplicate. The articles, the company authority file and the controlled vocabulary are all invented. No client content is in this repository. The 500-record answer keys the Golden 500 copies run against are synthetic too, and are not included.

**Client and employer names are removed.** These were built speculatively, against publicly known problems, to show an approach. Organizations are referred to by category. Nothing here was built for, or belongs to, an employer.

**Credentials are stripped.** No credential references, API keys, webhook IDs, internal URLs or email addresses are present in any file. The sanitizer in the build that produces this repository enforces that with an audit that fails the build on a match.

**These are prototypes.** They were built to be measured, not to carry production volume. The scorecards say what each sample size can and cannot support; small sets show direction, not production error rates.

## Method

How I evaluate these — answer keys written before the run, adversarial cases, the four metrics, and a tuning change I reverted — is written up at [devinhuber.com/reliability](https://devinhuber.com/reliability/).

## License

MIT. See [LICENSE](LICENSE).
