# Competitor Registry Builder

*Reads the links off a competitor homepage and works out which pages are worth watching, regardless of what that firm calls them.*

## What it does

The watch workflow needs to know which pages matter: case results, attorneys, awards, news. Every firm names them differently — “Results”, “Verdicts & Settlements”, “Our Wins” — so a hard-coded URL list breaks on the second site you add.

This builds that list once per competitor, using a model for the one thing that genuinely needs judgement: reading a link and deciding what kind of page it points at.

## How it is wired

9 nodes. The ones that matter:

| Node | Type | What it does |
|---|---|---|
| `Purge Non-Client and Guessed Pages` | Data Table | Clears previously guessed entries first, so a bad classification cannot persist across rebuilds. |
| `Load Client Homepages` | Data Table | The competitor set for each client. |
| `Fetch Homepage HTML` | HTTP | Pulls the homepage. |
| `Extract Internal Links` | Code | Deterministic: pulls internal links and their anchor text. No model involved. |
| `Identify Material Pages` | HTTP → Anthropic | Classifies each link into a category, or declines to. |
| `Parse Discovered Pages` | Code | Validates the response before anything is written. |
| `Add Pages to Registry` | Data Table | Writes the classified pages. |

## What happens when it is wrong

| Failure | What the workflow does |
|---|---|
| A page it cannot classify | Left out. An unclassified page is better than a wrong category, because the watch workflow reads this list as fact. |
| A bad classification from a previous run | The purge step runs first, so a rebuild corrects rather than accumulates. |
| A malformed model response | The parse step drops it rather than writing a partial row. |

## Measured

- Feeds the registry behind 17 tracked pages across 9 competitor sites.

## Running it

Import, attach an Anthropic credential, seed a Data Table of competitor homepages, and Execute.

No credentials are included in the export. Attach your own.

## Known limits

- Classification quality is only spot-checked, not scored against a labelled set. That is the honest gap in this one.

---

Test data is synthetic. Client and employer names are removed; organisations are referred to by category. Write-ups with the full measurements are at [devinhuber.com](https://devinhuber.com/builds/).
