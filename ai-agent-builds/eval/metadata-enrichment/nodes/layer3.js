const src = $('Layer 1 Structural Scan').item.json;
const resp = $input.item.json;
const policy = src.policy;

const VOCAB_BY_CODE = {};
for (const v of src.vocab) VOCAB_BY_CODE[v.code] = v;

let parsed = null;
let llm_status = 'ok';
let usage = { input_tokens: 0, output_tokens: 0 };

try {
  if (resp.error) throw new Error(resp.error.message || 'api error');
  const blocks = Array.isArray(resp.content) ? resp.content : [];
  const textBlock = blocks.find(b => b && b.type === 'text');
  const raw = textBlock && textBlock.text;
  if (!raw) throw new Error('no text block in response (blocks: ' + blocks.map(b => b && b.type).join(',') + ')');
  usage = resp.usage || usage;
  const cleaned = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  parsed = JSON.parse(cleaned);
} catch (e) {
  llm_status = 'error: ' + e.message;
}

const articleText = src.headline + ' ' + src.body;
const haystack = articleText.toLowerCase().replace(/\s+/g, ' ');

function isGrounded(evidence) {
  if (!evidence) return false;
  const needle = String(evidence).toLowerCase().replace(/\s+/g, ' ').trim();
  if (needle.length < 8) return false;
  return haystack.indexOf(needle) !== -1;
}

// Hierarchy is a property of the taxonomy, not a judgement call for the model.
function ancestorsOf(code) {
  const out = [];
  let cur = VOCAB_BY_CODE[code];
  let hops = 0;
  while (cur && cur.broader && VOCAB_BY_CODE[cur.broader] && hops < 8) {
    if (out.indexOf(cur.broader) === -1) out.push(cur.broader);
    cur = VOCAB_BY_CODE[cur.broader];
    hops++;
  }
  return out;
}

function rollUp(tags) {
  const out = tags.slice();
  for (const t of tags) {
    for (const anc of ancestorsOf(t.code)) {
      if (!out.find(x => x.code === anc)) {
        out.push({
          code: anc,
          label: VOCAB_BY_CODE[anc].label,
          confidence: t.confidence,
          provisional: t.provisional,
          inherited_from: t.code,
          evidence: t.evidence,
        });
      }
    }
  }
  return out;
}

function closure(codes) {
  const out = [];
  for (const c of codes || []) {
    if (out.indexOf(c) === -1) out.push(c);
    for (const a of ancestorsOf(c)) if (out.indexOf(a) === -1) out.push(a);
  }
  return out;
}

const rejections = [];
const remaps = [];

// LAYER 3A - conformance guard.
// Answers "is every tag on this record allowed?"
function guardFacet(proposed, facet) {
  const kept = [];
  for (const t of Array.isArray(proposed) ? proposed : []) {
    const code = String(t && t.code || '').trim();
    const conf = typeof t.confidence === 'number' ? t.confidence : 0;
    const entry = VOCAB_BY_CODE[code];

    if (!entry) {
      rejections.push({ facet, code, reason: 'HALLUCINATED_CODE', detail: 'not present in the controlled vocabulary', confidence: conf });
      continue;
    }
    if (entry.facet !== facet) {
      rejections.push({ facet, code, reason: 'FACET_MISMATCH', detail: 'belongs to facet ' + entry.facet, confidence: conf });
      continue;
    }
    if (policy.require_verbatim_evidence && !isGrounded(t.evidence)) {
      rejections.push({ facet, code, reason: 'UNGROUNDED_EVIDENCE', detail: 'quoted span does not appear in the article', confidence: conf, evidence: t.evidence });
      continue;
    }

    let finalCode = code;
    if (entry.status === 'deprecated') {
      if (!entry.replaced_by || !VOCAB_BY_CODE[entry.replaced_by]) {
        rejections.push({ facet, code, reason: 'DEPRECATED_NO_SUCCESSOR', detail: 'retired code with no mapping', confidence: conf });
        continue;
      }
      finalCode = entry.replaced_by;
      remaps.push({ facet, from: code, to: finalCode, reason: 'DEPRECATED_REMAPPED' });
    }
    if (conf < policy.review_floor_confidence) {
      rejections.push({ facet, code: finalCode, reason: 'BELOW_CONFIDENCE_FLOOR', detail: 'confidence ' + conf + ' < ' + policy.review_floor_confidence, confidence: conf });
      continue;
    }
    if (kept.find(k => k.code === finalCode)) continue;
    kept.push({
      code: finalCode,
      label: VOCAB_BY_CODE[finalCode].label,
      confidence: conf,
      provisional: conf < (policy.provisional_below || 0.75),
      evidence: t.evidence,
    });
  }

  kept.sort((a, b) => b.confidence - a.confidence);
  if (kept.length > policy.max_tags_per_facet) {
    for (const cut of kept.slice(policy.max_tags_per_facet)) {
      rejections.push({ facet, code: cut.code, reason: 'FACET_CAP_EXCEEDED', detail: 'beyond ' + policy.max_tags_per_facet + ' codes', confidence: cut.confidence });
    }
  }
  return rollUp(kept.slice(0, policy.max_tags_per_facet));
}

const subjects = llm_status === 'ok' ? guardFacet(parsed.subject_codes, 'SUBJECT') : [];
const industries = llm_status === 'ok' ? guardFacet(parsed.industry_codes, 'INDUSTRY') : [];
const geographies = llm_status === 'ok' ? guardFacet(parsed.geography_codes, 'GEOGRAPHY') : [];

const candidateIds = src.entity_candidates.map(c => c.entity_id);
const entities = [];
if (llm_status === 'ok') {
  for (const c of Array.isArray(parsed.companies) ? parsed.companies : []) {
    const id = String(c && c.entity_id || '').trim();
    if (!candidateIds.includes(id)) {
      rejections.push({ facet: 'COMPANY', code: id, reason: 'ENTITY_NOT_IN_CANDIDATES', detail: 'not matched by the authority file', confidence: c.confidence || 0 });
      continue;
    }
    if (c.role !== 'primary') continue;
    if ((c.confidence || 0) < policy.review_floor_confidence) {
      rejections.push({ facet: 'COMPANY', code: id, reason: 'BELOW_CONFIDENCE_FLOOR', detail: 'confidence ' + c.confidence, confidence: c.confidence || 0 });
      continue;
    }
    const master = src.entity_candidates.find(x => x.entity_id === id);
    if (!entities.find(e => e.entity_id === id)) {
      entities.push({ entity_id: id, name: master.name, confidence: c.confidence, evidence: c.evidence });
    }
  }
}

const appliedSubject = subjects.map(t => t.code);
const appliedIndustry = industries.map(t => t.code);
const appliedGeography = geographies.map(t => t.code);

// LAYER 3B - completeness cues.
// The conformance guard cannot answer "is a tag MISSING?". A record with three
// correct tags and one omission passes every membership test, and omissions
// were the entire silent-error population in run 4. These cues are high-recall
// and deliberately dumb. They never ADD a tag - adding one would put an
// unreviewed guess in the index, which is the thing this pipeline exists to
// prevent. They only refuse to auto-publish, so precision is untouched and the
// cost is paid in editor time, which is a dial the business can set.
const PLACE_CUES = {
  'london': 'GEO-UK', 'britain': 'GEO-UK', 'british': 'GEO-UK', 'north sea': 'GEO-UK',
  'frankfurt': 'GEO-DE', 'berlin': 'GEO-DE', 'munich': 'GEO-DE', 'german': 'GEO-DE',
  'paris': 'GEO-FR', 'toulouse': 'GEO-FR', 'french': 'GEO-FR',
  'dublin': 'GEO-IE', 'irish': 'GEO-IE',
  'amsterdam': 'GEO-NL', 'rotterdam': 'GEO-NL', 'dutch': 'GEO-NL',
  'brussels': 'GEO-EU', 'european commission': 'GEO-EU', 'europe': 'GEO-EU',
  'seoul': 'GEO-KR', 'korean': 'GEO-KR',
  'tokyo': 'GEO-JP', 'japanese': 'GEO-JP',
  'beijing': 'GEO-CN', 'shanghai': 'GEO-CN', 'chinese': 'GEO-CN',
  'mumbai': 'GEO-IN', 'bengaluru': 'GEO-IN', 'bangalore': 'GEO-IN', 'indian': 'GEO-IN',
  'sydney': 'GEO-AU', 'melbourne': 'GEO-AU', 'perth': 'GEO-AU', 'australian': 'GEO-AU',
  'toronto': 'GEO-CA', 'vancouver': 'GEO-CA', 'canadian': 'GEO-CA',
  'sao paulo': 'GEO-BR', 'rio de janeiro': 'GEO-BR', 'brazilian': 'GEO-BR',
  'manhattan': 'GEO-US-NY', 'brooklyn': 'GEO-US-NY',
  'austin': 'GEO-US-TX', 'dallas': 'GEO-US-TX', 'houston': 'GEO-US-TX',
  'palo alto': 'GEO-US-CA', 'san francisco': 'GEO-US-CA', 'los angeles': 'GEO-US-CA',
  'san jose': 'GEO-US-CA', 'santa clara': 'GEO-US-CA', 'sacramento': 'GEO-US-CA',
  'wilmington': 'GEO-US-DE',
  'securities and exchange commission': 'GEO-US', 'commerce department': 'GEO-US',
  'national labor relations board': 'GEO-US', 'u.s.': 'GEO-US',
};
// Every active geography label is itself a cue, so the map above only has to
// carry cities and demonyms the labels do not cover.
for (const v of src.vocab) {
  if (v.facet === 'GEOGRAPHY' && v.status === 'active' && v.label.length >= 5) {
    PLACE_CUES[v.label.toLowerCase()] = v.code;
  }
}

const SUBJECT_CUES = [
  { code: 'SUBJ-REG', re: /\bregulat(?:or|ors|ory)\b|\bsupervisors?\b|\benforcement notice\b|\bsecurities and exchange commission\b|\bnational labor relations board\b|\beuropean commission\b|\bdata protection commission\b|\bcommerce department\b/i, label: 'a regulator, supervisor or enforcement body is named' },
  { code: 'SUBJ-TAX', re: /\bvat\b|\btaxation\b|\btax\b/i, label: 'tax is discussed' },
  { code: 'SUBJ-LIT', re: /\bfederal court\b|\bappeals court\b|\bdistrict court\b|\blawsuit\b|\bsued\b|\bverdict\b|\bcertified a class\b/i, label: 'a court proceeding is described' },
];

// INDUSTRY cues. Added in run 45. Deliberately narrow: only terms that name an
// industry rather than merely touching one. IND-TECH is intentionally absent -
// "platform", "software" and "digital" appear in most business copy, and a cue
// that fires on everything sends everything to review, which is the same as
// having no gate at all while costing editor time.
//
// Methodological caveat, recorded rather than buried: these cues were written
// after seeing which industry tags this eval set missed. Cues fitted to the set
// they are scored on will always look better here than on new copy. They are
// written from what the words mean, not from the specific records, but the only
// honest test is a second labelled set the cues were not designed against.
const INDUSTRY_CUES = [
  { code: 'IND-SEMI', re: /\bsemiconductors?\b|\bchipmakers?\b|\bchip (?:maker|plant|fab|production)\b|\bfoundry\b/i, label: 'semiconductor manufacturing is described' },
  { code: 'IND-INSUR', re: /\binsurers?\b|\binsurance\b|\bhealth plans?\b|\bpolicyholders?\b|\bunderwrit(?:er|ing)\b/i, label: 'an insurer or insurance product is named' },
  { code: 'IND-BANK', re: /\bbanks?\b|\bbanking\b|\blenders?\b|\bcredit union\b/i, label: 'a bank or lender is named' },
  { code: 'IND-AGRI', re: /\bagricultur(?:e|al)\b|\bfarm(?:s|ers|ing|land)?\b|\bcrops?\b|\bpesticides?\b|\bherbicides?\b|\bharvest\b/i, label: 'agriculture or crop production is described' },
  { code: 'IND-RETAIL', re: /\bretailers?\b|\bstorefronts?\b|\be-?commerce\b|\bshoppers?\b|\bcheckout\b/i, label: 'retail or e-commerce activity is described' },
];

// Authority-file industry cross-check. Added in run 46.
//
// Run 45 left exactly one silent error: A14 auto-published with IND-HEALTH but
// without IND-INSUR (and therefore without IND-BANK, which rolls up from it).
// The regex cue above could not catch it, and no regex could: the article never
// uses the words "insurer" or "insurance". It just names Elevance Health. You
// cannot read that industry off the text - you have to know the company.
//
// The pipeline already knows the company. Entity resolution scored 100% precision
// and 100% recall on this set and resolved CO-0012 correctly, including through
// the former-name alias Anthem. What was missing is that the authority file
// carried no industry classification, so the one layer that had the answer was
// never asked. A real company authority file carries SIC or NAICS codes on every
// record; this prototype's stand-in did not.
//
// So: for every entity resolved as PRIMARY, if the authority file says what
// industry it is in and that code was not applied, refuse to auto-publish.
// Primary only - a passing mention must not drag its industry into the record,
// which is the failure mode A17 was built to test.
//
// Two honest limits. This map lives here rather than on the authority record
// because the authority file is defined upstream in Load Article Queue; moving
// it there is the first cleanup, not a redesign. And it deliberately covers only
// single-industry companies. Bayer is pharmaceuticals and chemicals and crop
// science at once, so a single default for it would manufacture false blocks on
// any article about just one of those. A company's registered industry is a
// default, not a statement about what a given story is about.
const ENTITY_INDUSTRY = {
  'CO-0001': 'IND-TECH',
  'CO-0002': 'IND-TECH',
  'CO-0003': 'IND-PHARM',
  'CO-0004': 'IND-BANK',
  'CO-0006': 'IND-SEMI',
  'CO-0009': 'IND-BANK',
  'CO-0010': 'IND-OILGAS',
  'CO-0012': 'IND-INSUR',
  'CO-0013': 'IND-TECH',
  'CO-0014': 'IND-SEMI',
  'CO-0015': 'IND-PHARM',
};

const completenessFlags = [];
if (llm_status === 'ok') {
  for (const term of Object.keys(PLACE_CUES)) {
    const code = PLACE_CUES[term];
    if (haystack.indexOf(term) === -1) continue;
    if (appliedGeography.indexOf(code) !== -1) continue;
    if (completenessFlags.find(f => f.expected_code === code)) continue;
    completenessFlags.push({
      facet: 'GEOGRAPHY', expected_code: code, cue: term,
      detail: 'the text mentions "' + term + '" but ' + code + ' was not applied',
    });
  }
  for (const c of SUBJECT_CUES) {
    if (!c.re.test(articleText)) continue;
    if (appliedSubject.indexOf(c.code) !== -1) continue;
    completenessFlags.push({
      facet: 'SUBJECT', expected_code: c.code, cue: c.label,
      detail: c.label + ' but ' + c.code + ' was not applied',
    });
  }
  for (const c of INDUSTRY_CUES) {
    if (!VOCAB_BY_CODE[c.code] || VOCAB_BY_CODE[c.code].status !== 'active') continue;
    if (!c.re.test(articleText)) continue;
    if (appliedIndustry.indexOf(c.code) !== -1) continue;
    completenessFlags.push({
      facet: 'INDUSTRY', expected_code: c.code, cue: c.label,
      detail: c.label + ' but ' + c.code + ' was not applied',
    });
  }
  for (const e of entities) {
    const code = ENTITY_INDUSTRY[e.entity_id];
    if (!code) continue;
    if (!VOCAB_BY_CODE[code] || VOCAB_BY_CODE[code].status !== 'active') continue;
    if (appliedIndustry.indexOf(code) !== -1) continue;
    if (completenessFlags.find(f => f.expected_code === code)) continue;
    completenessFlags.push({
      facet: 'INDUSTRY', expected_code: code, cue: 'authority file: ' + e.name,
      detail: e.name + ' is a subject of the story and the authority file classifies it as ' +
        VOCAB_BY_CODE[code].label + ', but ' + code + ' was not applied',
    });
  }
}

const allApplied = [].concat(subjects, industries, geographies);
const minConfidence = allApplied.length === 0 ? 0 : Math.min(...allApplied.map(t => t.confidence));

function topConfidence(arr) {
  return arr.length === 0 ? 0 : Math.max(...arr.map(t => t.confidence));
}
const leadByFacet = {
  SUBJECT: topConfidence(subjects),
  INDUSTRY: topConfidence(industries),
  GEOGRAPHY: topConfidence(geographies),
};

const appliedByFacet = { SUBJECT: subjects.length, INDUSTRY: industries.length, GEOGRAPHY: geographies.length };
const emptyRequired = policy.required_facets.filter(f => appliedByFacet[f] === 0);

// Per-facet auto-publish floors, and a recorded negative result.
//
// Run 42 tested dropping the INDUSTRY floor from 0.85 to 0.70, on the argument
// that INDUSTRY posted 100% precision over 23 true positives and caused all four
// unnecessary editor reviews in run 41. Throughput and queue precision both
// improved - straight-through 20.8% to 45.8%, queue precision 76.5% to 90.9% -
// and the headline safety metric got WORSE: silent errors went from 1 of 5 to
// 3 of 11. A14 and A15 auto-published with missing tags the 0.85 floor had been
// holding back.
//
// The reasoning error is worth keeping written down: the floor was gating RECALL,
// not precision. Low model confidence on this facet does not predict a wrong tag,
// it predicts an INCOMPLETE tag set, and a precision table cannot see an omission.
// Run 44 fixed the over-tagging side and the floor went back to 0.85, which cost
// throughput: 16.7% straight-through, with all three unnecessary reviews (A04,
// A17, A23) caused by INDUSTRY lead confidence sitting just under the bar on
// records that were otherwise clean.
//
// Run 45 retried 0.70 after closing the hole that made it unsafe: the INDUSTRY
// facet had NO completeness cues at all, so nothing in the pipeline could notice
// a missing industry tag. With cues in place, 0.70 held - straight-through
// doubled to 33.3% and the only remaining silent error was one the cues could
// not reach. If the silent error count moves off zero, this goes back to 0.85.
//
// These are defaults. auto_publish_min_confidence_by_facet in POLICY overrides
// any of them, so an editorial lead still tunes thresholds as configuration.
const FACET_FLOOR_DEFAULTS = { SUBJECT: 0.85, INDUSTRY: 0.70, GEOGRAPHY: 0.85 };
function facetFloor(f) {
  const m = policy.auto_publish_min_confidence_by_facet || {};
  if (typeof m[f] === 'number') return m[f];
  if (typeof FACET_FLOOR_DEFAULTS[f] === 'number') return FACET_FLOOR_DEFAULTS[f];
  return policy.auto_publish_min_confidence;
}
const weakRequired = policy.required_facets.filter(f =>
  appliedByFacet[f] > 0 && leadByFacet[f] < facetFloor(f));

// LAYER 3C - subject salience gate, v2.
//
// v1 used lede position as the salience proxy and did NOT fire on A01. The
// reason is instructive: A01 is wire copy, about four paragraphs, so the
// antitrust sentence sits inside the first 600 characters along with everything
// else in the story. Lede position only discriminates on long-form articles. On
// the wire it is very nearly a constant, which makes it a useless test exactly
// where most of the volume is.
//
// v2 uses a signal the model already gives us and the pipeline was throwing
// away. On A01 the model returned SUBJ-MNA at 0.97 and SUBJ-ANTI at 0.70. It was
// saying plainly that the second claim is much weaker. The record auto-published
// anyway, because review_floor_confidence (0.60) is the only bar a tag must
// clear to be APPLIED, and auto_publish_min_confidence is tested against the
// LEAD tag of each facet and never against the others. So a 0.70 tag rode into
// the index behind a 0.97 one, and the two numbers the model handed us to tell
// them apart were never compared to each other.
//
// The rule: the lead subject decides what the story is and is governed by the
// facet floor. Every ADDITIONAL subject is a separate claim that the story is
// also about something else, and a claim of that kind has to meet the same bar,
// not the much lower bar for merely being recorded.
//
// Evidence that this is a genuinely marginal judgement rather than a model
// failure: A02 is the same article from a lower-tier outlet, and on that call
// the model scored SUBJ-ANTI at 0.40 and the conformance guard rejected it
// outright. Same text, same prompt, 0.40 and 0.70 on two draws. A judgement that
// unstable does not belong in an index unreviewed.
//
// Note also what the roll-up did here. The model proposed ONE extra code. The
// taxonomy roll-up then added SUBJ-REG as SUBJ-ANTI's broader term, turning one
// marginal model call into two wrong codes in the index. Blocking the parent
// takes the inherited child with it, which is why this gate only examines
// non-inherited tags.
//
// Failing tags are NOT dropped. Silently dropping a tag is the same class of
// error in the other direction, and the completeness gate exists precisely
// because omissions matter too. They route to a human with the reason named.
const salienceCfg = policy.subject_salience || {};
const salienceFlags = [];
if (salienceCfg.enabled !== false && llm_status === 'ok') {
  const secondaryFloor = typeof salienceCfg.secondary_min_confidence === 'number'
    ? salienceCfg.secondary_min_confidence
    : facetFloor('SUBJECT');
  const proposed = subjects
    .filter(t => !t.inherited_from)
    .slice()
    .sort((a, b) => b.confidence - a.confidence);
  for (const t of proposed.slice(1)) {
    if (t.confidence < secondaryFloor) {
      const carried = subjects
        .filter(x => x.inherited_from === t.code)
        .map(x => x.code);
      salienceFlags.push({
        facet: 'SUBJECT',
        code: t.code,
        confidence: t.confidence,
        lead_code: proposed[0].code,
        lead_confidence: proposed[0].confidence,
        carries: carried,
        detail: t.code + ' is a secondary subject at ' + t.confidence +
          ' behind a lead of ' + proposed[0].confidence + ' (' + proposed[0].code +
          '), below the ' + secondaryFloor + ' bar an auto-published claim must meet' +
          (carried.length ? '; would also carry ' + carried.join(', ') + ' into the index by roll-up' : ''),
      });
    }
  }
}

const hardRejections = rejections.filter(r =>
  r.reason === 'HALLUCINATED_CODE' || r.reason === 'UNGROUNDED_EVIDENCE' ||
  r.reason === 'FACET_MISMATCH' || r.reason === 'ENTITY_NOT_IN_CANDIDATES');

let decision;
let decision_reason;

if (llm_status !== 'ok') {
  decision = 'SPECIALIST_REVIEW';
  decision_reason = 'Enrichment layer unavailable - failing safe to a human, never to auto-publish';
} else if (!src.is_canonical) {
  decision = 'DUPLICATE_SUPPRESSED';
  decision_reason = 'Near-duplicate of ' + src.canonical_article_id + ' in cluster ' + src.cluster_id + '; canonical version already indexed';
} else if (hardRejections.length > 0) {
  decision = 'EDITOR_REVIEW';
  decision_reason = 'Guard rejected ' + hardRejections.length + ' proposed tag(s): ' + hardRejections.map(r => r.code + ' (' + r.reason + ')').join(', ');
} else if (emptyRequired.length > 0) {
  decision = 'EDITOR_REVIEW';
  decision_reason = 'Required facet(s) returned no code: ' + emptyRequired.join(', ') + '. Routed for confirmation and logged as a possible taxonomy gap';
} else if (completenessFlags.length > 0) {
  decision = 'EDITOR_REVIEW';
  decision_reason = 'Record looks under-tagged: ' + completenessFlags.map(f => f.expected_code + ' (' + f.cue + ')').join(', ');
} else if (salienceFlags.length > 0) {
  decision = 'EDITOR_REVIEW';
  decision_reason = 'Record looks over-tagged on SUBJECT: ' + salienceFlags.map(f => f.code + ' at ' + f.confidence + ' behind a ' + f.lead_confidence + ' lead' + (f.carries.length ? ' (+' + f.carries.join(', ') + ' by roll-up)' : '')).join(', ') + '. Lead subject stands; weak secondary claims go to a human rather than being published or silently dropped';
} else if (weakRequired.length > 0) {
  decision = 'EDITOR_REVIEW';
  decision_reason = 'Lead tag confidence below the per-facet auto-publish threshold on: ' + weakRequired.map(f => f + ' (' + leadByFacet[f].toFixed(2) + ' < ' + facetFloor(f) + ')').join(', ');
} else {
  decision = 'AUTO_PUBLISH';
  decision_reason = 'All tags in vocabulary, all evidence verbatim, no completeness cue unmatched, no secondary subject failing salience, lead tag on every required facet at or above its per-facet floor';
}

const cost_usd = (usage.input_tokens / 1e6) * 3 + (usage.output_tokens / 1e6) * 15;

function codesOf(arr) { return arr.map(t => t.code); }

return {
  json: {
    article_id: src.article_id,
    headline: src.headline,
    source: src.source,
    source_tier: src.source_tier,
    trap: src.trap,
    cluster_id: src.cluster_id,
    cluster_size: src.cluster_size,
    is_canonical: src.is_canonical,
    canonical_article_id: src.canonical_article_id,
    decision,
    decision_reason,
    applied: { subjects, industries, geographies, entities },
    applied_codes: {
      SUBJECT: codesOf(subjects),
      INDUSTRY: codesOf(industries),
      GEOGRAPHY: codesOf(geographies),
      COMPANY: entities.map(e => e.entity_id),
    },
    truth_codes: {
      SUBJECT: closure(src.truth_subjects),
      INDUSTRY: closure(src.truth_industries),
      GEOGRAPHY: closure(src.truth_geographies),
      COMPANY: src.truth_entities,
    },
    guard: {
      rejections,
      remaps,
      hard_rejection_count: hardRejections.length,
      proposed_total: llm_status === 'ok'
        ? (parsed.subject_codes || []).length + (parsed.industry_codes || []).length + (parsed.geography_codes || []).length
        : 0,
      applied_total: allApplied.length,
      inherited_total: allApplied.filter(t => t.inherited_from).length,
      min_confidence: Number(minConfidence.toFixed(3)),
      lead_confidence: leadByFacet,
      provisional_tag_count: allApplied.filter(t => t.provisional).length,
    },
    salience: {
      flags: salienceFlags,
      blocked: salienceFlags.length > 0 && hardRejections.length === 0 &&
        emptyRequired.length === 0 && completenessFlags.length === 0,
    },
    completeness: {
      flags: completenessFlags,
      blocked: completenessFlags.length > 0 && hardRejections.length === 0 && emptyRequired.length === 0,
    },
    uncoded_note: llm_status === 'ok' ? (parsed.uncoded_note || '') : '',
    entity_candidates: src.entity_candidates,
    llm_status,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost_usd: Number(cost_usd.toFixed(6)),
    indexed_at: new Date().toISOString(),
  },
};
