const item = $input.item.json;
const text = item.headline + '\n\n' + item.body;

// Common nouns that turn a company alias into an ordinary word.
// "Shell plc" is an entity; "shell companies" is not.
const COMMON_NOUN_AFTER = /^\s+(compan(y|ies)|corporat(e|ion|ions)|entit(y|ies)|firm|firms|structure|structures|game|games|script|scripts|account|accounts)\b/i;

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMentions(surface) {
  const s = String(surface);
  // A trailing \b after a non-word character (as in "Pfizer Inc.") can never match,
  // which would silently downgrade every full legal name to a weak alias hit.
  const lead = /^\w/.test(s) ? '\\b' : '';
  const trail = /\w$/.test(s) ? '\\b' : '';
  const re = new RegExp(lead + escapeRe(s) + trail, 'g');
  const hits = [];
  let m = re.exec(text);
  while (m !== null) {
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 24);
    if (!COMMON_NOUN_AFTER.test(tail)) {
      hits.push({ offset: m.index, surface: m[0] });
    }
    m = re.exec(text);
  }
  return hits;
}

// Deterministic entity candidate generation against the authority file.
// Full legal name and ticker are high-precision; bare aliases are weaker evidence.
const candidates = [];
for (const ent of item.entity_master) {
  const byName = findMentions(ent.name);
  const byTicker = ent.ticker && /^[A-Z.0-9]+$/.test(ent.ticker) ? findMentions(ent.ticker) : [];
  let byAlias = [];
  for (const al of ent.aliases) {
    byAlias = byAlias.concat(findMentions(al));
  }
  const total = byName.length + byTicker.length + byAlias.length;
  if (total === 0) continue;
  const firstOffset = Math.min(
    ...[].concat(byName, byTicker, byAlias).map(h => h.offset)
  );
  candidates.push({
    entity_id: ent.entity_id,
    name: ent.name,
    ticker: ent.ticker,
    match_strength: byName.length > 0 || byTicker.length > 0 ? 'strong' : 'alias_only',
    mention_count: total,
    first_offset: firstOffset,
    in_headline: firstOffset < item.headline.length,
  });
}
candidates.sort((a, b) => a.first_offset - b.first_offset);

const candidateBlock = candidates.length === 0
  ? '  (none matched the authority file)'
  : candidates.map(c =>
      '  ' + c.entity_id + ' = ' + c.name + ' [' + c.match_strength +
      ', ' + c.mention_count + ' mention(s)' + (c.in_headline ? ', appears in headline' : '') + ']'
    ).join('\n');

// Rule 4 carries two separate instructions that an earlier revision merged into
// one. Merging them cost 16 points of SUBJECT recall: the model read "most
// specific code" as "one code" and dropped co-equal secondary subjects.
const prompt =
  'You are an indexing analyst for a global news and business content operation. ' +
  'You assign controlled-vocabulary metadata to incoming articles so they can be retrieved by legal and business researchers.\n\n' +
  'RULES\n' +
  '1. Every code you return MUST be copied exactly from the vocabulary below. Never invent a code, never modify one, never return a code that is not listed.\n' +
  '2. For every code you return, quote the exact span of the article that justifies it. Copy the span verbatim, character for character. Do not paraphrase.\n' +
  '3. If no listed code applies to a facet, return an empty array for that facet. An empty facet is a correct and useful answer. Guessing is not.\n' +
  '4. Return EVERY distinct subject the story is about, not just one. A single article is often several things at once - an environmental matter that is also a regulatory action and also litigation - and each of those is a separate code. BUT for each subject you identify, return only its MOST SPECIFIC code, never also its broader term. If you tag SUBJ-PAT, do not also tag SUBJ-IP; the pipeline adds broader terms from the taxonomy itself. Two codes that are genuinely different subjects both belong; a code and its own ancestor do not.\n' +
  '5. Return at most ' + item.policy.max_tags_per_facet + ' codes per facet, ordered most to least central to the story.\n' +
  '6. confidence is your probability that a senior editor would keep the code. Use the full range. Be honest about weak evidence.\n\n' +
  'CONTROLLED VOCABULARY\n' + item.vocab_block + '\n\n' +
  'COMPANY AUTHORITY CANDIDATES DETECTED IN THIS TEXT\n' + candidateBlock + '\n' +
  'For each candidate decide role: "primary" if the company is a subject of the story, ' +
  '"passing" if it appears only as background, a former employer, a comparison, or a list member. ' +
  'Do not add companies that are not in the candidate list.\n\n' +
  'ARTICLE\n' +
  'HEADLINE: ' + item.headline + '\n' +
  'BODY: ' + item.body + '\n\n' +
  'For uncoded_note: return a sentence ONLY if a CENTRAL subject or industry of this story has no code in the vocabulary at all. ' +
  'Do not report uncodeable details such as figures, dates, party names, or sub-aspects of a concept that is already coded. ' +
  'Most articles should return an empty string. This field feeds a taxonomy change request, so a false positive costs a taxonomist real time.\n\n' +
  'Respond with ONLY valid JSON, no preamble and no code fences, in exactly this shape:\n' +
  '{"subject_codes":[{"code":"SUBJ-XXX","confidence":0.0,"evidence":"verbatim span from the article"}],' +
  '"industry_codes":[{"code":"IND-XXX","confidence":0.0,"evidence":"verbatim span"}],' +
  '"geography_codes":[{"code":"GEO-XXX","confidence":0.0,"evidence":"verbatim span"}],' +
  '"companies":[{"entity_id":"CO-0000","role":"primary","confidence":0.0,"evidence":"verbatim span"}],' +
  '"uncoded_note":""}';

return {
  json: {
    ...item,
    entity_candidates: candidates,
    prompt,
  },
};
