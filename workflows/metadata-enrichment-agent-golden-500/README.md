# Metadata Enrichment Agent - Golden 500

*A test copy of the [Metadata Enrichment Agent](../metadata-enrichment-agent/) that scores the pipeline against a 500-article answer key, and where the fixes that measurement called for were made.*

## What it is

The demo’s built-in answer key is 24 articles. Three runs on it found no tag errors in the 23 articles that went out without review. On 500 articles, the 24 plus 476 more (34 of them retellings of another article), the same pipeline’s silent error rate was 27%. This copy is where that was measured and brought below 10%.

The demo workflow is unchanged.

## How it differs from the demo

18 nodes: the demo’s 17 plus `Load Golden 500`. What is different:

| Node | Type | What changed |
|---|---|---|
| `Load Golden 500` | Data Table | New. Reads the 500-article answer key, including which articles are retellings of another. |
| `Load Article Queue` | Code | Builds the queue from the table instead of an inline list, and checks every row against a fingerprint recorded when the key was frozen. If a row has been edited, added or removed since, the run stops. |
| `Layer 1 Structural Scan` | Code | **v2 prompt.** The rule against tagging broader terms now says what a broader term is, and two new rules say when a regulation or a litigation subject is tagged beside the main one. One company’s note says it is filed under two industries. |
| `Layer 2 Metadata Enrichment` | HTTP → Anthropic | Sends requests two at a time, 2 seconds apart, to stay under the API’s concurrency limit. |
| `Layer 3 Taxonomy Guard and Route` | Code | **v3 guard.** A new rung on the routing ladder, after the salience check: an article goes to an editor when the model proposed a code at 0.40 or more that the 0.60 confidence floor set aside. |
| `Harness Export` | Code | Knows the new rung. |

## Measured

Scored by the workflow’s own scorecard and by the [evaluation harness](https://github.com/DHuberPortfolio/workflow-eval-harness), which agree:

| Version | Silent error rate | Straight-through |
|---|---|---|
| The demo’s pipeline | 27.0% (54 of 200) | 40.0% |
| v2 prompt | 11.6% (27 of 233) | 46.6% |
| v3 guard, three runs of identical code | 6.5%, 6.3%, 8.6%; together 7.2% (44 of 615, likely 5.4–9.5%) | about 41% |

- **The v2 prompt fixed one gap.** 36 of the 54 articles with a tag error were missing a regulation or litigation subject beside the main one.
- **v3 is below 10% in every run**, and the drop from v2 is larger than the spread between identical runs.
- **It holds on articles it was not tuned on.** The 0.40 was chosen on half the articles and checked on the other half: 6.6% there (20 of 303), against 7.7% on the half it was tuned on.
- **Retellings are handled almost perfectly.** No real article was suppressed as a duplicate, and no retelling was published.
- **The price is reviews.** More than half of v3’s reviews are ones an editor did not need, and about 41% of articles now go out without review, down from 47% in v2.
- About $8.50 per 500-article run, $17 per 1,000 articles.

The full analysis is in the harness’s [metadata enrichment notes](https://github.com/DHuberPortfolio/workflow-eval-harness/blob/main/examples/metadata-enrichment/NOTES.md).

## Running it

Import, attach an Anthropic credential to the two HTTP nodes, seed the “Controlled Vocabulary” data table as for the demo, and create the answer-key table (columns `article_id`, `source`, `source_tier`, `published_at`, `headline`, `body`, `truth_subjects`, `truth_industries`, `truth_geographies`, `truth_entities`, `trap`, `duplicate_of`, `key_version`). The 500 articles are not in this repository, and the fingerprint check stops a run against any other key.

No credentials are included in the export. Attach your own.

## Known limits

- The v2 prompt rules were written after reading the demo pipeline’s mistakes on all 500 articles; only the v3 guard’s cut-off was checked on held-out articles.
- 5 articles are tag errors in all three v3 runs.
- The confidence gate and the salience check still send many articles to an editor that did not need one.

---

Test data is synthetic. Client and employer names are removed; organisations are referred to by category. Write-ups with the full measurements are at [devinhuber.com](https://devinhuber.com/builds/).
