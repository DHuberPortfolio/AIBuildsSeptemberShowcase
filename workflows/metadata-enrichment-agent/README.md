# Metadata Enrichment Agent

*Assigns controlled-vocabulary labels to incoming news at ingest, and decides which articles can be filed without an editor.*

## What it does

A news publisher tags every incoming article against a fixed taxonomy: what it is about, which industry, which region, which companies. Editors do this by hand. A model can do it in seconds, but a wrong label that publishes silently does more damage than a slow correct one — it decides what a paying customer finds when they search.

So the agent has three jobs: label accurately, prove where every label came from, and know which articles still need a person.

## How it is wired

16 nodes. The ones that matter:

| Node | Type | What it does |
|---|---|---|
| `Load Controlled Vocabulary` | Data Table | The 65-term taxonomy lives in a table, so a taxonomist can add or retire codes without touching the workflow. |
| `Load Article Queue` | Code | Deduplicates the batch with 5-word shingles at Jaccard ≥ 0.50, picks the canonical copy by source tier then length then date, and builds the prompt. |
| `Layer 1 Structural Scan` | Code | Word-boundary regex against a company authority file, with a common-noun guard so “shell companies” never resolves to Shell plc. The model may only pick companies from this candidate list. |
| `Layer 2 Metadata Enrichment` | HTTP → Anthropic | Proposes subject, industry and geography codes, each with a confidence and a verbatim span of the article it claims supports the label. |
| `Layer 3 Taxonomy Guard and Route` | Code | Re-tests every proposal deterministically and decides the record’s fate. This is the file worth reading. |
| `Operations Scorecard` | Code | Scores the run against an answer key: precision, recall, F1 and exact-set match per facet, plus routing, gate precision and unit cost. |
| `Write Run Brief` | HTTP → Anthropic | Interprets the scorecard in prose. It may only cite figures already on the scorecard — it never produces its own. |
| `Export Brief as .doc` | Convert to File | Ships the brief as a document. If the brief call fails, the export still ships without it. |

## What happens when it is wrong

| Failure | What the workflow does |
|---|---|
| A code that does not exist | `HALLUCINATED_CODE` — rejected. A label outside the vocabulary cannot enter the index, whatever the model returns. |
| A real code under the wrong heading | `FACET_MISMATCH` — rejected. |
| A fabricated justification | `UNGROUNDED_EVIDENCE` — the quoted span is searched for verbatim in the source text. A confident invention is caught deterministically, and for free. |
| A retired code | Remapped to its successor where one exists, `DEPRECATED_NO_SUCCESSOR` and rejected where none does. |
| Low confidence | `BELOW_CONFIDENCE_FLOOR`. Floors are per facet — subject 0.85, industry 0.70, geography 0.85 — because the facets are not equally hard. |
| Too many labels | `FACET_CAP_EXCEEDED` past four per facet. |
| A missing label | Deterministic cues (place names, regulators, courts, tax, a matched company’s registered industry) block auto-publish when their code is absent. They never *add* a label, so they cannot introduce an error — they convert silent errors into editor reviews. |
| The model call fails | The record routes to a person. There is no path from an error to publishing. |

## Measured

- On the run reproduced in `../../eval/metadata-enrichment/`: 97 codes proposed, 84 accepted, 13 rejected.
- 7 of 24 records filed with no human, 15 held for review, 2 suppressed as duplicates.
- Zero of the auto-published records carried a tag error. $13.82 per 1,000 articles, measured — including the duplicates the run paid to enrich before suppressing them.

## Running it

Import, attach an Anthropic credential to the two HTTP nodes, seed a Data Table named “Controlled Vocabulary” with the 65 terms in `../../eval/metadata-enrichment/data/vocab.json`, and hit Execute. Or skip all of that and run the deterministic layers with `node verify.js` in the eval folder.

No credentials are included in the export. Attach your own.

## Known limits

- The answer key is 24 articles. Gate precision will fall on real volume, and a 0% silent-error rate on 7 auto-published records is far too small a base to generalise.
- The company authority file holds 15 records; production would need the full list.
- Subject recall (73.2%) trails the other facets. The review queue is currently covering that gap rather than the model.

---

Test data is synthetic. Client and employer names are removed; organisations are referred to by category. Write-ups with the full measurements are at [devinhuber.com](https://devinhuber.com/builds/).
