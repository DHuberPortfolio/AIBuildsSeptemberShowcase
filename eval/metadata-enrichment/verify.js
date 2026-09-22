// Asserts the local replay reproduces n8n execution 49 figure-for-figure.
const { replay, read } = require('./run.js');
const out = replay(JSON.parse(read('vocab.json')), JSON.parse(read('run49-layer2.json')));
const s = out.scorecard;

// Figures as reported by n8n execution 49 (workflow 5GPLuV1sd8DfQTes).
const EXPECT = {
  'records_ingested': [s.records_ingested, 24],
  'records_enriched_and_scored': [s.records_enriched_and_scored, 22],
  'route.EDITOR_REVIEW': [s.routing.by_decision.EDITOR_REVIEW, 15],
  'route.DUPLICATE_SUPPRESSED': [s.routing.by_decision.DUPLICATE_SUPPRESSED, 2],
  'route.AUTO_PUBLISH': [s.routing.by_decision.AUTO_PUBLISH, 7],
  'straight_through_pct': [s.routing.straight_through_pct, 29.2],
  'editor_touch_pct': [s.routing.editor_touch_pct, 62.5],
  'auto_published_with_tag_errors': [s.headline_safety_metric.auto_published_with_tag_errors, 0],
  'auto_published_total': [s.headline_safety_metric.auto_published_total, 7],
  'silent_error_rate_pct': [s.headline_safety_metric.silent_error_rate_pct, 0],
  'gate.records_blocked': [s.completeness_gate.records_blocked, 5],
  'gate.silent_errors_prevented': [s.completeness_gate.silent_errors_prevented, 5],
  'gate.blocked_but_actually_clean': [s.completeness_gate.blocked_but_actually_clean, 0],
  'gate.precision_pct': [s.completeness_gate.precision_pct, 100],
  'gate.blocked_ids': [s.completeness_gate.prevented_detail.map(d => d.article_id).join(','), 'A11,A12,A15,A20,A22'],
  'codes_proposed_by_model': [s.taxonomy_conformance.codes_proposed_by_model, 97],
  'codes_accepted_from_model': [s.taxonomy_conformance.codes_accepted_from_model, 84],
  'codes_inherited_from_taxonomy': [s.taxonomy_conformance.codes_inherited_from_taxonomy, 23],
  'rejection_rate_pct': [s.taxonomy_conformance.rejection_rate_pct, 13.4],
  'BELOW_CONFIDENCE_FLOOR': [s.taxonomy_conformance.rejections_by_reason.BELOW_CONFIDENCE_FLOOR, 13],
  'rejection_reason_count': [Object.keys(s.taxonomy_conformance.rejections_by_reason).length, 1],
  'hallucinated_codes': [s.taxonomy_conformance.hallucinated_codes.length, 0],
  'ungrounded_evidence': [s.taxonomy_conformance.ungrounded_evidence.length, 0],
  'SUBJECT.precision_pct': [s.facet_quality.SUBJECT.precision_pct, 93.8],
  'SUBJECT.recall_pct': [s.facet_quality.SUBJECT.recall_pct, 73.2],
  'SUBJECT.f1': [s.facet_quality.SUBJECT.f1, 0.822],
  'SUBJECT.exact_set_match_pct': [s.facet_quality.SUBJECT.exact_set_match_pct, 54.5],
  'SUBJECT.tp/fp/fn': [[s.facet_quality.SUBJECT.true_positives, s.facet_quality.SUBJECT.false_positives, s.facet_quality.SUBJECT.false_negatives].join('/'), '30/2/11'],
  'INDUSTRY.precision_pct': [s.facet_quality.INDUSTRY.precision_pct, 100],
  'INDUSTRY.recall_pct': [s.facet_quality.INDUSTRY.recall_pct, 82.8],
  'INDUSTRY.f1': [s.facet_quality.INDUSTRY.f1, 0.906],
  'INDUSTRY.tp/fp/fn': [[s.facet_quality.INDUSTRY.true_positives, s.facet_quality.INDUSTRY.false_positives, s.facet_quality.INDUSTRY.false_negatives].join('/'), '24/0/5'],
  'GEOGRAPHY.precision_pct': [s.facet_quality.GEOGRAPHY.precision_pct, 100],
  'GEOGRAPHY.recall_pct': [s.facet_quality.GEOGRAPHY.recall_pct, 95],
  'GEOGRAPHY.f1': [s.facet_quality.GEOGRAPHY.f1, 0.974],
  'GEOGRAPHY.tp/fp/fn': [[s.facet_quality.GEOGRAPHY.true_positives, s.facet_quality.GEOGRAPHY.false_positives, s.facet_quality.GEOGRAPHY.false_negatives].join('/'), '38/0/2'],
  'COMPANY.f1': [s.facet_quality.COMPANY.f1, 1],
  'COMPANY.tp/fp/fn': [[s.facet_quality.COMPANY.true_positives, s.facet_quality.COMPANY.false_positives, s.facet_quality.COMPANY.false_negatives].join('/'), '16/0/0'],
  'review.justified': [s.review_queue_quality.justified, 14],
  'review.unnecessary': [s.review_queue_quality.unnecessary, 1],
  'review.precision_pct': [s.review_queue_quality.precision_of_review_queue_pct, 93.3],
  'review.unnecessary_id': [s.review_queue_quality.unnecessary_detail.map(d => d.article_id).join(','), 'A24'],
  'entity.shell_A08_passed': [s.entity_resolution.shell_disambiguation_A08.passed, true],
  'entity.A17_resolved': [s.entity_resolution.passing_mention_A17.resolved_entities.join(','), 'CO-0001'],
  'dedup.clusters_detected': [s.deduplication.clusters_detected, 22],
  'dedup.duplicates_suppressed': [s.deduplication.duplicates_suppressed, 2],
  'dedup.duplicate_rate_pct': [s.deduplication.duplicate_rate_pct, 8.3],
  'dedup.pairs': [s.deduplication.suppressed_detail.map(d => d.article_id + '<-' + d.duplicate_of).join(','), 'A02<-A01,A19<-A03'],
  'taxonomy_gap_articles': [s.taxonomy_gap_report.articles_with_uncoded_concepts, 0],
  'enrichment_errors': [s.reliability.enrichment_errors, 0],
  'cost.total_usd': [s.unit_economics.total_usd, 0.3316],
  'cost.per_article_usd': [s.unit_economics.per_article_usd, 0.013817],
  'cost.per_1000_usd': [s.unit_economics.projected_usd_per_1000_articles, 13.82],
  'cost.wasted_on_duplicates_usd': [s.unit_economics.wasted_on_duplicates_usd, 0.0309],
  'cost.input_tokens': [s.unit_economics.input_tokens, 61626],
  'cost.output_tokens': [s.unit_economics.output_tokens, 9782],
};

let bad = 0;
for (const [k, [got, want]] of Object.entries(EXPECT)) {
  if (got !== want) { bad++; console.log('MISMATCH  ' + k + '  got=' + JSON.stringify(got) + '  want=' + JSON.stringify(want)); }
}
console.log(bad === 0
  ? 'PASS  ' + Object.keys(EXPECT).length + '/' + Object.keys(EXPECT).length + ' figures match n8n execution 49'
  : 'FAIL  ' + bad + ' of ' + Object.keys(EXPECT).length + ' figures differ');
process.exit(bad === 0 ? 0 : 1);
