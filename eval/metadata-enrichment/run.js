// Replays n8n execution 49 of the metadata agent outside n8n.
// The four node bodies are used verbatim; only the n8n helpers ($input, $())
// are shimmed. Exported so the browser demo and the verifier share one path.
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const read = f => fs.readFileSync(path.join(DIR, f.endsWith('.json') ? 'data/' + f : 'nodes/' + f), 'utf8');

// Each node body ends in `return ...`, so wrapping it in a Function gives the
// node's own output with no edits to the source.
function nodeFn(file, args) {
  return new Function(...args, read(file));
}

const runQueue = nodeFn('queue.js', ['$input']);
const runLayer1 = nodeFn('layer1.js', ['$input']);
const runLayer3 = nodeFn('layer3.js', ['$input', '$']);
const runScorecard = nodeFn('scorecard.js', ['$input']);

const itemsIn = arr => ({
  all: () => arr.map(json => ({ json })),
  item: { json: arr[0] },
});

function replay(vocab, layer2) {
  const queue = runQueue(itemsIn(vocab)).map(r => r.json);

  const layer1 = queue.map(q => runLayer1({ item: { json: q } }).json);

  const layer3 = layer1.map((l1, i) => {
    const rec = layer2[i];
    // Rebuild the shape layer3.js reads off the Anthropic response node.
    const resp = rec.parsed === null
      ? { error: { message: 'api error' } }
      : {
          content: [{ type: 'text', text: JSON.stringify(rec.parsed) }],
          usage: rec.usage,
        };
    const $ = name => {
      if (name !== 'Layer 1 Structural Scan') throw new Error('unexpected node ref: ' + name);
      return { item: { json: l1 } };
    };
    return runLayer3({ item: { json: resp } }, $).json;
  });

  const scorecard = runScorecard(itemsIn(layer3))[0].json;
  return { queue, layer1, layer3, scorecard };
}

module.exports = { replay, read };

if (require.main === module) {
  const vocab = JSON.parse(read('vocab.json'));
  const layer2 = JSON.parse(read('run49-layer2.json'));
  const out = replay(vocab, layer2);
  fs.writeFileSync(path.join(DIR, 'run49-replay.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.scorecard, null, 1));
}
