# Workflows

Standard n8n exports. Import into any n8n instance and attach your own credentials — none are included.

## metadata-enrichment-agent.json

Assigns controlled-vocabulary subject, industry, geography and company codes to incoming news, and decides which records can publish without an editor.

Deduplicates by 5-word shingle overlap at Jaccard ≥ 0.50 and picks the canonical copy by source tier, then body length, then date. Resolves companies with word-boundary regex against an authority file, with a rule that drops an alias followed by an ordinary noun so *shell companies* never matches Shell plc. The model may only choose companies from that candidate list, and must label each one primary or passing.

The guard then re-checks everything: codes must exist in the vocabulary and sit in the right facet, evidence spans must appear verbatim in the article, retired codes are remapped or rejected, per-facet confidence floors apply (subject 0.85, industry 0.70, geography 0.85), and each facet is capped at four tags. Broader terms are inherited from the taxonomy hierarchy rather than proposed by the model. Two further layers decide only whether a record is safe to auto-publish, never what it is tagged: completeness cues catch under-tagging, salience checks catch weak secondary tags behind a strong lead. Records route to auto-publish, editor review, specialist review or duplicate-suppressed, and a failed model call always routes to a person.

The vocabulary lives in an n8n Data Table so a taxonomist can add or retire codes without touching the workflow. See [`../eval/metadata-enrichment/`](../eval/metadata-enrichment/) to run the deterministic layers and reproduce a real run.

## bar-compliance-content-reviewer.json

Reviews law-firm marketing copy against attorney advertising rules before it goes live.

Layer 1 is regex for terms a bar association bans outright. Layer 2 is a model pass for the implied violations that keyword matching cannot see — a guarantee phrased as a track record, a comparison phrased as a fact. Findings route by confidence, and the workflow reports its own accuracy against the ground-truth set rather than just returning verdicts.

## competitor-watch-monthly-digest.json

Monthly monitoring of a fixed competitor set per client.

Fetches each tracked page, diffs it against last month's stored snapshot, scores how material the change is against a calibrated threshold, and assembles a per-client digest that leads with what actually moved. Quiet months produce a short digest rather than filler.

## competitor-registry-builder.json

Builds the page registry the watch workflow reads.

Reads internal links off a competitor homepage and uses a model to identify which are the case-results, attorneys, awards and news pages, regardless of what a given firm calls them, then writes them into the registry. Pages it cannot classify are left out rather than guessed at.

## assessment-template-test-harness.json

Regression-tests a long, rule-heavy prompt instead of eyeballing its output.

An occupational-therapy documentation assistant fills in an assessment form from the transcript of a practitioner's visit. The prompt is the product: around 9,800 characters of rules about using only what is in the transcript, never inferring a diagnosis, and running eleven self-checks before returning anything. Change one rule and the failure shows up three sections away, in a form a practitioner then signs.

So the workflow is two nodes and a form trigger: paste a transcript, run it through the template at temperature 0.1, read the result. The value is entirely in having a repeatable input, so a prompt change can be compared against the same transcript rather than against memory. Merging two rules into one, in a comparable pipeline, cost 16 points of recall — the kind of regression that is invisible without a fixed input.

## snapshot-backdating-fixture.json

A test utility, not production. Trims each stored snapshot to roughly its first half and backdates it 30 days, so the next watch run sees genuine new content and the diff and materiality scoring are exercised end to end instead of on an empty changeset.
