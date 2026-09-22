# Snapshot Backdating Fixture

*A test utility. Trims and backdates stored snapshots so a competitor-watch run has real change to detect.*

## What it does

A monthly diff is hard to test, because testing it honestly means waiting a month. Run it twice in a day and there is nothing to find, so every code path past the diff goes unexercised.

This fabricates that month: it trims each stored snapshot to roughly its first half and backdates it 30 days. The next watch run then sees genuine new content and exercises the diff, the materiality scoring and the digest end to end.

## How it is wired

5 nodes. The ones that matter:

| Node | Type | What it does |
|---|---|---|
| `Load Snapshots` | Data Table | Reads the current stored content. |
| `Rewind Client Competitors` | Code | Truncates to roughly the first half of the sentences and backdates the timestamp. |
| `Write Rewound Snapshots` | Data Table | Writes the altered snapshots back. |

## What happens when it is wrong

| Failure | What the workflow does |
|---|---|
| Run against production data | It would destroy real snapshots. This is test-only and should never point at a live table — that is why it is a separate workflow with a manual trigger rather than a flag on the watch workflow. |

## Running it

Run it once between two executions of `competitor-watch-monthly-digest`, against test data only.

No credentials are included in the export. Attach your own.

## Known limits

- Deliberately crude. It simulates “content was added”, not “content was rewritten” or “a page disappeared”, so it does not exercise every diff path.

---

Test data is synthetic. Client and employer names are removed; organisations are referred to by category. Write-ups with the full measurements are at [devinhuber.com](https://devinhuber.com/builds/).
