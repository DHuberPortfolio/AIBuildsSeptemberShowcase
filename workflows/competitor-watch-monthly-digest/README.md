# Competitor Watch — Monthly Client Digest

*Watches a fixed set of competitor pages per client, detects what changed since last month, scores how much it matters, and writes the digest.*

## What it does

An account team wants to know what their client’s competitors did last month. Done by hand it is hours of opening tabs, and most of what you find is a reworded paragraph rather than news.

The problem is not fetching pages, it is separating signal from noise. A new case result matters; a rotated testimonial does not. So the change detection is deterministic and the *materiality* judgement is scored against calibrated bands, with a target of a 90-second read.

## How it is wired

14 nodes. The ones that matter:

| Node | Type | What it does |
|---|---|---|
| `Monthly Sweep` | Schedule | Runs monthly, per client. |
| `Load Snapshots / Load Registry` | Data Table | Last month’s stored page content, and the list of pages worth watching for each competitor. |
| `Fetch Competitor Page` | HTTP | Pulls each tracked page. |
| `Hash and Diff` | Code | Hashes and diffs against the stored snapshot. No model involved in deciding whether something changed. |
| `Save Snapshots` | Data Table | Writes this month’s content, becoming next month’s baseline. |
| `Score Materiality` | HTTP → Anthropic | Judges how much each change matters on a calibrated scale, across 7 categories. |
| `Build Client Digests` | Code | Assembles a per-client digest, leading with what actually moved. |
| `Write Executive Brief` | HTTP → Anthropic | A second pass that turns the digest into a short brief. |

## What happens when it is wrong

| Failure | What the workflow does |
|---|---|
| A trivial change scored as material | Wastes the reader’s attention, which is the whole budget. The 0.65 threshold and 5 calibrated bands exist to hold this down. |
| A real change scored as trivial | The failure that matters. Low-confidence findings escalate into the brief rather than being dropped quietly. |
| A page that will not fetch | Skipped, and its previous snapshot is left intact so a fetch failure never reads as “nothing changed”. |
| A quiet month | The digest says so in a line. It does not manufacture three paragraphs — a report that always looks the same stops being read. |

## Measured

- Run against 17 tracked pages across 9 competitor sites.
- 0.65 materiality threshold · 5 calibrated bands · 7 categories.
- 90-second target read time per client digest.

## Running it

Needs the registry populated first — run `competitor-registry-builder`, then `snapshot-backdating-fixture` to give this run something to detect.

No credentials are included in the export. Attach your own.

## Known limits

- Snapshots are capped at 20,000 characters per page.
- Pages under 500 characters of HTML are skipped when building the registry.
- Materiality scoring is the one judgement call in the pipeline, and it is the part I would calibrate hardest before trusting it unattended.

---

Test data is synthetic. Client and employer names are removed; organisations are referred to by category. Write-ups with the full measurements are at [devinhuber.com](https://devinhuber.com/builds/).
