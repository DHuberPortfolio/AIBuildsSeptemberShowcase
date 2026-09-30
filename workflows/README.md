# Workflows

Standard n8n exports. Each folder holds the workflow and a README covering what it does, how it is wired, and what it does when it is wrong.

| Build | What it is |
|---|---|
| [Metadata Enrichment Agent](metadata-enrichment-agent/) | Assigns controlled-vocabulary labels to incoming news at ingest, and decides which articles can be filed without an editor. |
| [Bar Compliance Content Reviewer](bar-compliance-content-reviewer/) | Reviews law-firm marketing copy against attorney advertising rules before it goes live. |
| [Metadata Enrichment Agent - Golden 500](metadata-enrichment-agent-golden-500/) | A test copy of the metadata agent, scored against a 500-article answer key, where the fixes that measurement called for were made. The demo workflow is unchanged. |
| [Bar Compliance Content Reviewer - Golden 500](bar-compliance-content-reviewer-golden-500/) | A test copy of the compliance reviewer, scored against a 500-document answer key. The demo workflow is unchanged. |
| [Competitor Watch — Monthly Client Digest](competitor-watch-monthly-digest/) | Watches a fixed set of competitor pages per client, detects what changed since last month, scores how much it matters, and writes the digest. |
| [Competitor Registry Builder](competitor-registry-builder/) | Reads the links off a competitor homepage and works out which pages are worth watching, regardless of what that firm calls them. |
| [Snapshot Backdating Fixture](snapshot-backdating-fixture/) | A test utility. Trims and backdates stored snapshots so a competitor-watch run has real change to detect. |
| [Assessment Template Test Harness](assessment-template-test-harness/) | Runs a transcript through a long, rule-heavy clinical documentation prompt so prompt changes can be regression-tested rather than eyeballed. |

Import any of these into an n8n instance and attach your own credentials — none are included.

The deterministic layers of the metadata agent can be run with no n8n instance at all: see [`../eval/metadata-enrichment/`](../eval/metadata-enrichment/), which replays run 49. The runs of these workflows are scored by the [evaluation harness](https://github.com/DHuberPortfolio/workflow-eval-harness).
