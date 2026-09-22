const rows = $input.all().map(i => i.json);
const FACETS = ['SUBJECT', 'INDUSTRY', 'GEOGRAPHY', 'COMPANY'];

const pct = (n, d) => (d === 0 ? null : Number(((n / d) * 100).toFixed(1)));
const r3 = n => Number(n.toFixed(3));

const scored = rows.filter(r => r.decision !== 'DUPLICATE_SUPPRESSED' && r.llm_status === 'ok');
const suppressed = rows.filter(r => r.decision === 'DUPLICATE_SUPPRESSED');

function hasTagError(r) {
  return FACETS.some(f => {
    const got = (r.applied_codes[f] || []).slice().sort().join('|');
    const want = (r.truth_codes[f] || []).slice().sort().join('|');
    return got !== want;
  });
}

const facetQuality = {};
for (const facet of FACETS) {
  let tp = 0, fp = 0, fn = 0;
  let exact = 0;
  const errors = [];
  for (const r of scored) {
    const got = r.applied_codes[facet] || [];
    const want = r.truth_codes[facet] || [];
    const missed = want.filter(c => !got.includes(c));
    const extra = got.filter(c => !want.includes(c));
    tp += got.filter(c => want.includes(c)).length;
    fp += extra.length;
    fn += missed.length;
    if (missed.length === 0 && extra.length === 0) exact++;
    if (missed.length > 0 || extra.length > 0) {
      errors.push({ article_id: r.article_id, missed, extra, decision: r.decision });
    }
  }
  const precision = tp + fp === 0 ? null : tp / (tp + fp);
  const recall = tp + fn === 0 ? null : tp / (tp + fn);
  const f1 = precision && recall && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
  facetQuality[facet] = {
    precision_pct: precision === null ? null : Number((precision * 100).toFixed(1)),
    recall_pct: recall === null ? null : Number((recall * 100).toFixed(1)),
    f1: f1 === null ? null : r3(f1),
    exact_set_match_pct: pct(exact, scored.length),
    true_positives: tp, false_positives: fp, false_negatives: fn,
    errors,
  };
}

let proposed = 0, appliedFromModel = 0, inherited = 0;
const byReason = {};
const hallucinated = [];
const ungrounded = [];
const remapped = [];
for (const r of rows) {
  proposed += r.guard.proposed_total;
  inherited += (r.guard.inherited_total || 0);
  appliedFromModel += r.guard.applied_total - (r.guard.inherited_total || 0);
  for (const rej of r.guard.rejections) {
    byReason[rej.reason] = (byReason[rej.reason] || 0) + 1;
    if (rej.reason === 'HALLUCINATED_CODE') hallucinated.push({ article_id: r.article_id, code: rej.code, facet: rej.facet, confidence: rej.confidence });
    if (rej.reason === 'UNGROUNDED_EVIDENCE') ungrounded.push({ article_id: r.article_id, code: rej.code, facet: rej.facet, evidence: rej.evidence });
  }
  for (const rm of r.guard.remaps) remapped.push({ article_id: r.article_id, from: rm.from, to: rm.to });
}

const byDecision = {};
for (const r of rows) byDecision[r.decision] = (byDecision[r.decision] || 0) + 1;

const autoCount = byDecision.AUTO_PUBLISH || 0;
const editorCount = (byDecision.EDITOR_REVIEW || 0) + (byDecision.SPECIALIST_REVIEW || 0);

const silentErrors = [];
for (const r of scored) {
  if (r.decision !== 'AUTO_PUBLISH') continue;
  const wrong = FACETS.filter(f => {
    const got = (r.applied_codes[f] || []).slice().sort().join('|');
    const want = (r.truth_codes[f] || []).slice().sort().join('|');
    return got !== want;
  });
  if (wrong.length > 0) {
    silentErrors.push({
      article_id: r.article_id, facets: wrong, trap: r.trap,
      got: r.applied_codes, expected: r.truth_codes,
    });
  }
}

// What the completeness layer bought, and what it cost.
// A record it blocked that had no tag error is an editor minute spent for
// nothing; a record it blocked that did have one is a silent error prevented.
const blocked = scored.filter(r => r.completeness && r.completeness.blocked);
const blockedWithError = blocked.filter(hasTagError);
const blockedClean = blocked.filter(r => !hasTagError(r));

const reviewJustified = [];
const reviewUnnecessary = [];
for (const r of scored) {
  if (r.decision !== 'EDITOR_REVIEW' && r.decision !== 'SPECIALIST_REVIEW') continue;
  const rec = { article_id: r.article_id, why: r.decision_reason, trap: r.trap };
  if (hasTagError(r)) reviewJustified.push(rec); else reviewUnnecessary.push(rec);
}

const taxonomyGaps = rows
  .filter(r => r.uncoded_note && String(r.uncoded_note).trim().length > 0)
  .map(r => ({ article_id: r.article_id, note: r.uncoded_note }));

const totalCost = rows.reduce((s, r) => s + (r.cost_usd || 0), 0);
const dupCost = suppressed.reduce((s, r) => s + (r.cost_usd || 0), 0);
const errorRows = rows.filter(r => r.llm_status !== 'ok');

const entityTrapA08 = rows.find(r => r.article_id === 'A08');
const entityTrapA17 = rows.find(r => r.article_id === 'A17');

return [{
  json: {
    run_at: new Date().toISOString(),
    records_ingested: rows.length,
    records_enriched_and_scored: scored.length,

    routing: {
      by_decision: byDecision,
      straight_through_pct: pct(autoCount, rows.length),
      editor_touch_pct: pct(editorCount, rows.length),
      note: 'Straight-through rate is the throughput number. Editor touch rate is the cost number. Neither means anything without the silent error count below.',
    },

    headline_safety_metric: {
      auto_published_with_tag_errors: silentErrors.length,
      auto_published_total: autoCount,
      silent_error_rate_pct: pct(silentErrors.length, autoCount),
      detail: silentErrors,
      note: 'The only errors that reach a customer are the ones that auto-published. Every other error was caught by a human or by the guard.',
    },

    completeness_gate: {
      records_blocked: blocked.length,
      silent_errors_prevented: blockedWithError.length,
      blocked_but_actually_clean: blockedClean.length,
      precision_pct: pct(blockedWithError.length, blocked.length),
      prevented_detail: blockedWithError.map(r => ({ article_id: r.article_id, flags: r.completeness.flags.map(f => f.expected_code + ' <- ' + f.cue) })),
      cost_detail: blockedClean.map(r => ({ article_id: r.article_id, flags: r.completeness.flags.map(f => f.expected_code + ' <- ' + f.cue) })),
      note: 'Deterministic cues that detect under-tagging. They never add a tag, so precision is unaffected - they convert silent errors into editor reviews. silent_errors_prevented is the benefit, blocked_but_actually_clean is the bill.',
    },

    taxonomy_conformance: {
      codes_proposed_by_model: proposed,
      codes_accepted_from_model: appliedFromModel,
      codes_inherited_from_taxonomy: inherited,
      rejection_rate_pct: pct(proposed - appliedFromModel, proposed),
      rejections_by_reason: byReason,
      hallucinated_codes: hallucinated,
      ungrounded_evidence: ungrounded,
      deprecated_remaps: remapped,
      note: 'A code that is not in the vocabulary cannot enter the index, whatever the model returns. Evidence spans are checked verbatim against the source text, so a confident but fabricated justification is caught deterministically and for free.',
    },

    facet_quality: facetQuality,

    review_queue_quality: {
      justified: reviewJustified.length,
      unnecessary: reviewUnnecessary.length,
      precision_of_review_queue_pct: pct(reviewJustified.length, reviewJustified.length + reviewUnnecessary.length),
      unnecessary_detail: reviewUnnecessary,
      note: 'Records routed to a human that a human would not have changed. Drives the threshold down when it is high.',
    },

    entity_resolution: {
      shell_disambiguation_A08: entityTrapA08
        ? { resolved_entities: entityTrapA08.applied_codes.COMPANY, expected: [], passed: entityTrapA08.applied_codes.COMPANY.length === 0 }
        : null,
      passing_mention_A17: entityTrapA17
        ? { resolved_entities: entityTrapA17.applied_codes.COMPANY, expected: ['CO-0001'], passed: entityTrapA17.applied_codes.COMPANY.length === 1 && entityTrapA17.applied_codes.COMPANY[0] === 'CO-0001' }
        : null,
      note: 'A08 contains the word "shell" but no Shell plc. A17 mentions Microsoft only as a former employer.',
    },

    deduplication: {
      clusters_detected: new Set(rows.map(r => r.cluster_id)).size,
      duplicates_suppressed: suppressed.length,
      duplicate_rate_pct: pct(suppressed.length, rows.length),
      suppressed_detail: suppressed.map(r => ({ article_id: r.article_id, duplicate_of: r.canonical_article_id, source: r.source })),
      note: 'Duplicates were enriched in this prototype so the cost could be measured. Moving the dedup gate ahead of the model call removes that spend entirely.',
    },

    taxonomy_gap_report: {
      articles_with_uncoded_concepts: taxonomyGaps.length,
      detail: taxonomyGaps,
      note: 'Standing input to taxonomy governance. Repeated gaps are the case for a new code, evidenced rather than asserted.',
    },

    reliability: {
      enrichment_errors: errorRows.length,
      error_rate_pct: pct(errorRows.length, rows.length),
      errored_articles: errorRows.map(r => ({ article_id: r.article_id, status: r.llm_status })),
      note: 'Every errored record routes to a human. The pipeline has no path from failure to auto-publish.',
    },

    unit_economics: {
      total_usd: Number(totalCost.toFixed(4)),
      per_article_usd: Number((totalCost / rows.length).toFixed(6)),
      projected_usd_per_1000_articles: Number(((totalCost / rows.length) * 1000).toFixed(2)),
      wasted_on_duplicates_usd: Number(dupCost.toFixed(4)),
      input_tokens: rows.reduce((s, r) => s + (r.input_tokens || 0), 0),
      output_tokens: rows.reduce((s, r) => s + (r.output_tokens || 0), 0),
    },
  },
}];
