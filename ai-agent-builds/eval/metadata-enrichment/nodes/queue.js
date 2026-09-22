const vocabRows = $input.all().map(i => i.json);
if (vocabRows.length === 0) {
  throw new Error('Controlled vocabulary is empty. Seed the "Controlled Vocabulary" data table before running.');
}

const VOCAB = vocabRows.map(r => ({
  code: String(r.code || '').trim(),
  label: String(r.label || '').trim(),
  facet: String(r.facet || '').trim(),
  broader: String(r.broader || '').trim() || null,
  status: String(r.status || 'active').trim(),
  replaced_by: String(r.replaced_by || '').trim() || null,
})).filter(v => v.code);

const ACTIVE = VOCAB.filter(v => v.status === 'active');

function facetBlock(facet) {
  return ACTIVE.filter(v => v.facet === facet)
    .map(v => '  ' + v.code + ' = ' + v.label + (v.broader ? '  (narrower term of ' + v.broader + ')' : ''))
    .join('\n');
}

const VOCAB_BLOCK =
  'SUBJECT CODES\n' + facetBlock('SUBJECT') +
  '\n\nINDUSTRY CODES\n' + facetBlock('INDUSTRY') +
  '\n\nGEOGRAPHY CODES\n' + facetBlock('GEOGRAPHY');

// Entity master. In production this is the publisher's company authority file;
// here it is a 15-record extract with the alias forms that actually appear in copy.
const ENTITY_MASTER = [
  { entity_id: 'CO-0001', name: 'Alphabet Inc.', ticker: 'GOOGL', aliases: ['Alphabet', 'Google', 'Google LLC'] },
  { entity_id: 'CO-0002', name: 'Microsoft Corporation', ticker: 'MSFT', aliases: ['Microsoft'] },
  { entity_id: 'CO-0003', name: 'Pfizer Inc.', ticker: 'PFE', aliases: ['Pfizer'] },
  { entity_id: 'CO-0004', name: 'JPMorgan Chase & Co.', ticker: 'JPM', aliases: ['JPMorgan', 'JP Morgan', 'JPMorgan Chase'] },
  { entity_id: 'CO-0005', name: 'Tesla, Inc.', ticker: 'TSLA', aliases: ['Tesla'] },
  { entity_id: 'CO-0006', name: 'NVIDIA Corporation', ticker: 'NVDA', aliases: ['Nvidia', 'NVIDIA'] },
  { entity_id: 'CO-0007', name: 'Bayer AG', ticker: 'BAYRY', aliases: ['Bayer'] },
  { entity_id: 'CO-0008', name: 'Rio Tinto Group', ticker: 'RIO', aliases: ['Rio Tinto'] },
  { entity_id: 'CO-0009', name: 'Deutsche Bank AG', ticker: 'DB', aliases: ['Deutsche Bank'] },
  { entity_id: 'CO-0010', name: 'Shell plc', ticker: 'SHEL', aliases: ['Shell', 'Royal Dutch Shell'] },
  { entity_id: 'CO-0011', name: 'Samsung Electronics Co., Ltd.', ticker: '005930.KS', aliases: ['Samsung', 'Samsung Electronics'] },
  { entity_id: 'CO-0012', name: 'Elevance Health, Inc.', ticker: 'ELV', aliases: ['Elevance', 'Elevance Health', 'Anthem'] },
  { entity_id: 'CO-0013', name: 'Meta Platforms, Inc.', ticker: 'META', aliases: ['Meta', 'Meta Platforms', 'Facebook'] },
  { entity_id: 'CO-0014', name: 'Intel Corporation', ticker: 'INTC', aliases: ['Intel'] },
  { entity_id: 'CO-0015', name: 'Novartis AG', ticker: 'NVS', aliases: ['Novartis'] },
];

// 24-item ingest queue with editor-assigned ground truth.
// trap describes what each record is there to prove; it is reported in the scorecard.
const ARTICLES = [
  {
    article_id: 'A01', source: 'Global Wire Service', source_tier: 1, published_at: '2026-09-02T11:04:00Z',
    headline: 'Pfizer to acquire Novartis gene therapy unit in $4.1 billion deal',
    body: 'Pfizer Inc. said on Tuesday it had agreed to acquire the gene therapy division of Novartis AG for $4.1 billion in cash, in a transaction the companies expect to close in the first quarter of next year. The agreement was signed in Delaware and remains subject to antitrust clearance in the United States and the European Union. Pfizer said the unit would be folded into its rare disease business.',
    truth_subjects: ['SUBJ-MNA'], truth_industries: ['IND-PHARM'], truth_geographies: ['GEO-US-DE', 'GEO-US', 'GEO-EU'],
    truth_entities: ['CO-0003', 'CO-0015'], trap: 'baseline clean record, should auto-publish',
  },
  {
    article_id: 'A02', source: 'Metro Business Daily', source_tier: 3, published_at: '2026-09-02T14:38:00Z',
    headline: 'Pfizer to acquire Novartis gene therapy unit in $4.1 billion deal',
    body: 'Pfizer Inc. said on Tuesday it had agreed to acquire the gene therapy division of Novartis AG for $4.1 billion in cash, in a transaction the companies expect to close in the first quarter of next year. The agreement was signed in Delaware and remains subject to antitrust clearance in the United States and the European Union. Pfizer said the unit would be folded into its rare disease business. Shares rose slightly in after-hours trading.',
    truth_subjects: ['SUBJ-MNA'], truth_industries: ['IND-PHARM'], truth_geographies: ['GEO-US-DE', 'GEO-US', 'GEO-EU'],
    truth_entities: ['CO-0003', 'CO-0015'], trap: 'near-duplicate of A01 from a lower-tier outlet, should be suppressed not re-tagged',
  },
  {
    article_id: 'A03', source: 'Global Wire Service', source_tier: 1, published_at: '2026-09-01T08:12:00Z',
    headline: 'Commerce Department tightens NVIDIA chip export licences for China',
    body: 'The U.S. Commerce Department has narrowed the licence conditions under which NVIDIA Corporation may ship advanced accelerators to customers in China, according to a notice published in Washington. The revised rule captures two product lines that had previously fallen below the performance threshold. Nvidia said it was reviewing the guidance and did not expect a material revenue impact this quarter.',
    truth_subjects: ['SUBJ-SANC', 'SUBJ-REG'], truth_industries: ['IND-SEMI'], truth_geographies: ['GEO-US', 'GEO-CN'],
    truth_entities: ['CO-0006'], trap: 'canonical of a duplicate pair. GEO-US-DC is deliberately NOT in the key: "published in Washington" does not distinguish the District from the state.',
  },
  {
    article_id: 'A04', source: 'Continental Press', source_tier: 2, published_at: '2026-09-01T09:55:00Z',
    headline: 'Irish regulator fines Meta 380 million euros over ad targeting consent',
    body: 'The Irish Data Protection Commission has fined Meta Platforms, Inc. 380 million euros, finding that the company relied on an invalid legal basis when it processed personal data for behavioural advertising across the European Union. The decision follows a four-year inquiry and orders Meta to bring its processing into compliance within three months. Meta said it would appeal.',
    truth_subjects: ['SUBJ-DATA', 'SUBJ-REG'], truth_industries: ['IND-TECH'], truth_geographies: ['GEO-IE', 'GEO-EU'],
    truth_entities: ['CO-0013'], trap: 'clean multi-jurisdiction record',
  },
  {
    article_id: 'A05', source: 'Regional Ledger', source_tier: 3, published_at: '2026-08-31T17:20:00Z',
    headline: 'Tesla to cut 1,400 jobs at Texas assembly plant',
    body: 'Tesla, Inc. notified the Texas Workforce Commission that it will eliminate roughly 1,400 positions at its Austin assembly facility beginning in November, citing a slowdown in demand for one vehicle programme. The filing was made under state plant-closing rules. Affected workers will receive eight weeks of severance, according to the notice.',
    truth_subjects: ['SUBJ-LAYOFF', 'SUBJ-LAB'], truth_industries: ['IND-AUTO'], truth_geographies: ['GEO-US-TX', 'GEO-US'],
    truth_entities: ['CO-0005'], trap: 'clean record with narrower/broader subject pair',
  },
  {
    article_id: 'A06', source: 'Global Wire Service', source_tier: 1, published_at: '2026-08-31T13:02:00Z',
    headline: 'JPMorgan settles SEC recordkeeping case for $290 million',
    body: 'JPMorgan Chase & Co. agreed to pay $290 million to resolve Securities and Exchange Commission allegations that employees discussed firm business on unapproved messaging applications, the regulator said. The settlement, filed in New York, does not require an admission of wrongdoing. The bank said it had since deployed a compliant archiving system across trading desks.',
    truth_subjects: ['SUBJ-SEC', 'SUBJ-REG'], truth_industries: ['IND-BANK'], truth_geographies: ['GEO-US-NY', 'GEO-US'],
    truth_entities: ['CO-0004'], trap: 'clean record',
  },
  {
    article_id: 'A07', source: 'Markets Brief', source_tier: 4, published_at: '2026-09-02T21:45:00Z',
    headline: 'Intel Q3 update',
    body: 'Intel reported results. Figures were in line.',
    truth_subjects: ['SUBJ-EARN'], truth_industries: ['IND-SEMI'], truth_geographies: [],
    truth_entities: ['CO-0014'], trap: 'signal-starved stub, should route to review rather than guess a jurisdiction',
  },
  {
    article_id: 'A08', source: 'Continental Press', source_tier: 2, published_at: '2026-08-30T10:15:00Z',
    headline: 'Prosecutors say network of shell companies moved 200 million euros',
    body: 'Frankfurt prosecutors allege that a network of shell companies registered in the Netherlands was used to move more than 200 million euros in proceeds from a VAT carousel fraud. Investigators executed search warrants at six addresses in Germany this week. No charges have been filed and the individuals under investigation have not been named.',
    truth_subjects: ['SUBJ-FRAUD', 'SUBJ-AML', 'SUBJ-TAX'], truth_industries: [], truth_geographies: ['GEO-DE', 'GEO-NL', 'GEO-EU'],
    truth_entities: [], trap: 'entity trap: the word "shell" must not resolve to Shell plc',
  },
  {
    article_id: 'A09', source: 'Energy Report', source_tier: 2, published_at: '2026-08-29T07:30:00Z',
    headline: 'Shell approves final investment decision on North Sea gas project',
    body: 'Shell plc has taken a final investment decision on a North Sea gas development expected to produce first output in 2029, the company said from its London headquarters. The United Kingdom regulator approved the field development plan in July. Shell said the project would use electrified compression to reduce operational emissions.',
    truth_subjects: ['SUBJ-REG'], truth_industries: ['IND-OILGAS', 'IND-ENERGY'], truth_geographies: ['GEO-UK'],
    truth_entities: ['CO-0010'], trap: 'the genuine Shell plc record, paired against A08',
  },
  {
    article_id: 'A10', source: 'Retail Wire', source_tier: 3, published_at: '2026-08-28T12:00:00Z',
    headline: 'Online grocery platform expands same-day delivery to nine metro markets',
    body: 'A privately held online grocery platform said it will extend same-day delivery to nine additional metropolitan markets in the United States by the end of the year, adding two automated fulfilment centres in California. The company said the expansion would roughly double the population it can serve within a two-hour window. Terms of the fulfilment centre leases were not disclosed.',
    truth_subjects: ['SUBJ-PROD'], truth_industries: ['IND-RETAIL'], truth_geographies: ['GEO-US-CA', 'GEO-US'],
    truth_entities: [], trap: 'deprecated-code bait: IND-DOTCOM and SUBJ-ECOMM are retired and must be remapped',
  },
  {
    article_id: 'A11', source: 'Global Wire Service', source_tier: 1, published_at: '2026-08-27T06:40:00Z',
    headline: 'Samsung sues Intel over memory controller patents in Seoul and Texas',
    body: 'Samsung Electronics Co., Ltd. filed parallel patent infringement suits against Intel Corporation in the Seoul Central District Court and the Eastern District of Texas, asserting four patents covering memory controller architectures. Samsung is seeking an injunction and unspecified damages. Intel called the claims meritless and said it would defend the cases vigorously.',
    truth_subjects: ['SUBJ-PAT', 'SUBJ-IP', 'SUBJ-LIT'], truth_industries: ['IND-SEMI'], truth_geographies: ['GEO-KR', 'GEO-US-TX', 'GEO-US'],
    truth_entities: ['CO-0011', 'CO-0014'], trap: 'two primary entities, three-level subject hierarchy',
  },
  {
    article_id: 'A12', source: 'Continental Press', source_tier: 2, published_at: '2026-08-26T22:10:00Z',
    headline: 'Rio Tinto agrees remediation plan for Western Australia tailings site',
    body: 'Rio Tinto Group has agreed a remediation plan with Western Australian regulators covering a legacy tailings storage facility, committing to a programme the state values at 180 million Australian dollars. The agreement resolves an enforcement notice issued last year. Traditional owners were consulted on the rehabilitation sequence, the company said.',
    truth_subjects: ['SUBJ-ENV', 'SUBJ-REG'], truth_industries: ['IND-MINING'], truth_geographies: ['GEO-AU'],
    truth_entities: ['CO-0008'], trap: 'clean record',
  },
  {
    article_id: 'A13', source: 'Financial Chronicle', source_tier: 2, published_at: '2026-08-25T15:25:00Z',
    headline: 'Deutsche Bank sets aside 500 million euros over correspondent banking review',
    body: 'Deutsche Bank AG has provisioned 500 million euros in connection with an internal review of correspondent banking relationships, after German and European supervisors raised concerns about transaction monitoring controls. The bank said no enforcement action has been commenced. A person familiar with the review said it covers activity between 2018 and 2022.',
    truth_subjects: ['SUBJ-AML', 'SUBJ-REG', 'SUBJ-FRAUD'], truth_industries: ['IND-BANK'], truth_geographies: ['GEO-DE', 'GEO-EU'],
    truth_entities: ['CO-0009'], trap: 'clean record',
  },
  {
    article_id: 'A14', source: 'Health Policy Wire', source_tier: 2, published_at: '2026-08-24T11:50:00Z',
    headline: 'Class action certified against Elevance over out-of-network reimbursement',
    body: 'A federal judge in New York certified a class of roughly 90,000 plan members suing Elevance Health, Inc. over the methodology it used to calculate out-of-network reimbursement rates. The order clears the case for trial next year. Elevance said it disagrees with the certification and is evaluating an appeal.',
    truth_subjects: ['SUBJ-CLASS', 'SUBJ-LIT'], truth_industries: ['IND-HEALTH', 'IND-INSUR'], truth_geographies: ['GEO-US-NY', 'GEO-US'],
    truth_entities: ['CO-0012'], trap: 'alias resolution: Elevance was formerly Anthem',
  },
  {
    article_id: 'A15', source: 'Global Wire Service', source_tier: 1, published_at: '2026-08-23T09:05:00Z',
    headline: 'Bayer loses appeal in California herbicide case',
    body: 'A California appeals court upheld a $78 million verdict against Bayer AG in a case brought by a groundskeeper who alleged that long-term exposure to a glyphosate herbicide caused his illness. Bayer said it would seek review by the state supreme court. The company faces several thousand remaining claims in United States courts.',
    truth_subjects: ['SUBJ-LIT', 'SUBJ-ENV'], truth_industries: ['IND-CHEM', 'IND-AGRI'], truth_geographies: ['GEO-US-CA', 'GEO-US'],
    truth_entities: ['CO-0007'], trap: 'clean record',
  },
  {
    article_id: 'A16', source: 'Continental Press', source_tier: 2, published_at: '2026-08-22T13:40:00Z',
    headline: 'European Commission opens competition probe into Microsoft cloud licensing',
    body: 'The European Commission has opened a formal competition investigation into Microsoft Corporation over licensing terms that rivals say make it costlier to run Windows Server workloads on competing cloud platforms. Microsoft said it had already made licensing changes in Europe and would cooperate with the inquiry. The Commission did not set a deadline for its findings.',
    truth_subjects: ['SUBJ-ANTI', 'SUBJ-REG'], truth_industries: ['IND-TECH'], truth_geographies: ['GEO-EU'],
    truth_entities: ['CO-0002'], trap: 'clean record',
  },
  {
    article_id: 'A17', source: 'Tech Desk', source_tier: 3, published_at: '2026-08-21T18:15:00Z',
    headline: 'Alphabet names new cloud infrastructure chief',
    body: 'Alphabet Inc. has appointed a new head of cloud infrastructure, effective in October, filling a role vacant since June. The incoming executive previously spent eleven years at Microsoft before joining a storage startup in 2023. Alphabet said the position reports directly to the cloud chief executive.',
    truth_subjects: ['SUBJ-EXEC'], truth_industries: ['IND-TECH'], truth_geographies: [],
    truth_entities: ['CO-0001'], trap: 'passing-mention trap: Microsoft appears in a biography line and is not a subject of the story. The article names no jurisdiction, so the correct geography set is empty.',
  },
  {
    article_id: 'A18', source: 'Sports Business Report', source_tier: 3, published_at: '2026-08-20T20:00:00Z',
    headline: 'Players union files unfair labor practice charge over training camp rules',
    body: 'A professional athletes union filed an unfair labor practice charge with the National Labor Relations Board, alleging that a league unilaterally changed training camp reporting requirements outside of collective bargaining. The league said the changes fall within existing management rights. A regional director will decide whether to issue a complaint.',
    truth_subjects: ['SUBJ-LAB', 'SUBJ-REG'], truth_industries: [], truth_geographies: ['GEO-US'],
    truth_entities: [], trap: 'no industry code exists for professional sports; the correct answer is to leave the facet empty',
  },
  {
    article_id: 'A19', source: 'Tech Desk', source_tier: 3, published_at: '2026-09-01T11:47:00Z',
    headline: 'US tightens NVIDIA export licences for Chinese customers',
    body: 'The U.S. Commerce Department has narrowed the licence conditions under which NVIDIA Corporation may ship advanced accelerators to customers in China, according to a notice published in Washington. The revised rule captures two product lines that had previously fallen below the performance threshold. Nvidia said it was reviewing the guidance and did not expect a material revenue impact this quarter.',
    truth_subjects: ['SUBJ-SANC', 'SUBJ-REG'], truth_industries: ['IND-SEMI'], truth_geographies: ['GEO-US', 'GEO-CN'],
    truth_entities: ['CO-0006'], trap: 'near-duplicate of A03 with a rewritten headline',
  },
  {
    article_id: 'A20', source: 'Financial Chronicle', source_tier: 2, published_at: '2026-08-19T08:20:00Z',
    headline: 'Payments processor discloses intrusion affecting clients in three regions',
    body: 'A payments processor disclosed that an intrusion into a vendor-managed file transfer system exposed transaction records for corporate clients in the United States, the United Kingdom and Singapore. The company said card numbers were not involved and that it had notified regulators in each jurisdiction. An external forensic firm has been retained.',
    truth_subjects: ['SUBJ-CYBER', 'SUBJ-DATA', 'SUBJ-REG'], truth_industries: ['IND-BANK'], truth_geographies: ['GEO-US', 'GEO-UK', 'GEO-SG'],
    truth_entities: [], trap: 'unnamed company, three jurisdictions',
  },
  {
    article_id: 'A21', source: 'Global Wire Service', source_tier: 1, published_at: '2026-08-18T05:10:00Z',
    headline: 'Bengaluru logistics software firm files for Mumbai listing',
    body: 'A Bengaluru-based logistics software company filed a draft red herring prospectus with the Securities and Exchange Board of India for a listing on the Mumbai exchange, seeking to raise about 12 billion rupees. The filing shows revenue growth of 41 percent in the most recent fiscal year. Existing investors will sell a portion of their holdings in the offering.',
    truth_subjects: ['SUBJ-IPO'], truth_industries: ['IND-TECH', 'IND-TRANS'], truth_geographies: ['GEO-IN'],
    truth_entities: [], trap: 'clean record, no entity in the master file',
  },
  {
    article_id: 'A22', source: 'Venture Beat Desk', source_tier: 3, published_at: '2026-08-17T16:30:00Z',
    headline: 'Palo Alto inference startup raises $210 million Series C',
    body: 'A Palo Alto company building inference optimisation software raised a $210 million Series C led by a growth fund, valuing it at $2.4 billion post-money. The company said it will use the proceeds to expand its engineering team and open an office in London. It did not disclose revenue.',
    truth_subjects: ['SUBJ-FUND'], truth_industries: ['IND-TECH'], truth_geographies: ['GEO-US-CA', 'GEO-US', 'GEO-UK'],
    truth_entities: [], trap: 'a second jurisdiction appears only in a subordinate clause ("open an office in London")',
  },
  {
    article_id: 'A23', source: 'Defence Procurement Wire', source_tier: 2, published_at: '2026-08-16T10:45:00Z',
    headline: 'France awards satellite ground segment contract to consortium',
    body: 'The French defence procurement agency awarded a contract valued at 640 million euros for a military satellite ground segment to a consortium including a United States supplier. Work will be split between facilities in Toulouse and Colorado. The agency said initial operating capability is targeted for 2030.',
    truth_subjects: ['SUBJ-CONTRACT'], truth_industries: ['IND-AERO'], truth_geographies: ['GEO-FR', 'GEO-EU', 'GEO-US'],
    truth_entities: [], trap: 'clean record',
  },
  {
    article_id: 'A24', source: 'Energy Report', source_tier: 2, published_at: '2026-08-15T14:05:00Z',
    headline: 'Brazilian regulator suspends offshore drilling permit pending review',
    body: 'Brazil environmental regulator suspended an offshore drilling permit in the Equatorial Margin pending a fresh review of oil spill response planning. The operator said it had submitted an updated contingency plan and expected the suspension to be lifted. Environmental groups had challenged the original licence in federal court.',
    truth_subjects: ['SUBJ-ENV', 'SUBJ-REG', 'SUBJ-LIT'], truth_industries: ['IND-OILGAS', 'IND-ENERGY'], truth_geographies: ['GEO-BR'],
    truth_entities: [], trap: 'clean record',
  },
];

// Ingest-time near-duplicate detection. Wire copy is re-published verbatim across
// outlets; tagging the same story twice is pure re-work and pollutes counts.
function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function shingles(s) {
  const w = normalize(s).split(' ');
  const out = [];
  for (let i = 0; i + 5 <= w.length; i++) out.push(w.slice(i, i + 5).join(' '));
  return out;
}
function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  A.forEach(x => { if (B.has(x)) inter++; });
  const uni = A.size + B.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

const SIM_THRESHOLD = 0.50;
const sigs = ARTICLES.map(a => shingles(a.headline + ' ' + a.body));
const clusterOf = new Array(ARTICLES.length).fill(-1);
let nextCluster = 0;
for (let i = 0; i < ARTICLES.length; i++) {
  if (clusterOf[i] !== -1) continue;
  clusterOf[i] = nextCluster;
  for (let j = i + 1; j < ARTICLES.length; j++) {
    if (clusterOf[j] !== -1) continue;
    if (jaccard(sigs[i], sigs[j]) >= SIM_THRESHOLD) clusterOf[j] = nextCluster;
  }
  nextCluster++;
}

// Canonical = best available version: lowest source tier wins, then longest body,
// then earliest timestamp. A tier-1 wire beats a tier-3 rewrite.
const canonicalIdx = {};
for (let i = 0; i < ARTICLES.length; i++) {
  const c = clusterOf[i];
  const cur = canonicalIdx[c];
  if (cur === undefined) { canonicalIdx[c] = i; continue; }
  const a = ARTICLES[i];
  const b = ARTICLES[cur];
  if (a.source_tier < b.source_tier) { canonicalIdx[c] = i; continue; }
  if (a.source_tier === b.source_tier && a.body.length > b.body.length) { canonicalIdx[c] = i; continue; }
  if (a.source_tier === b.source_tier && a.body.length === b.body.length && a.published_at < b.published_at) canonicalIdx[c] = i;
}

const clusterSize = {};
for (let i = 0; i < ARTICLES.length; i++) {
  clusterSize[clusterOf[i]] = (clusterSize[clusterOf[i]] || 0) + 1;
}

// Routing policy. Thresholds are configuration, not code: an editorial lead
// tunes these per facet without touching the pipeline.
// auto_publish_min_confidence is tested against the LEAD tag of each required
// facet, not the minimum across every tag. Broader-term roll-ups are correctly
// tagged at lower confidence, and gating on the minimum sent 87.5% of a clean
// queue to human review in the first calibration run.
const POLICY = {
  auto_publish_min_confidence: 0.85,
  review_floor_confidence: 0.60,
  provisional_below: 0.75,
  max_tags_per_facet: 4,
  required_facets: ['SUBJECT', 'INDUSTRY'],
  require_verbatim_evidence: true,
};

return ARTICLES.map((a, idx) => {
  const cid = 'CL-' + String(clusterOf[idx] + 1).padStart(3, '0');
  return {
    json: {
      article_id: a.article_id,
      source: a.source,
      source_tier: a.source_tier,
      published_at: a.published_at,
      headline: a.headline,
      body: a.body,
      truth_subjects: a.truth_subjects,
      truth_industries: a.truth_industries,
      truth_geographies: a.truth_geographies,
      truth_entities: a.truth_entities,
      trap: a.trap,
      cluster_id: cid,
      cluster_size: clusterSize[clusterOf[idx]],
      is_canonical: canonicalIdx[clusterOf[idx]] === idx,
      canonical_article_id: ARTICLES[canonicalIdx[clusterOf[idx]]].article_id,
      vocab: VOCAB,
      vocab_block: VOCAB_BLOCK,
      entity_master: ENTITY_MASTER,
      policy: POLICY,
      queue_size: ARTICLES.length,
    },
  };
});
