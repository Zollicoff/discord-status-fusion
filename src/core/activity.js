/**
 * Deterministic activity summaries.
 *
 * The phrase is chosen from the focus-ranked apps: the leading app's category
 * decides the activity, and the first supporting app with a known pairing can
 * refine it ("Writing code" + an AI assistant -> "Building with AI").
 * When several phrasings exist, a stable hash of the app set picks one so the
 * status reads naturally without changing from one poll to the next.
 */

const CATEGORY_PHRASES = Object.freeze({
  ai: ['Thinking with AI', 'Working with AI', 'Brainstorming with AI'],
  code: ['Writing code', 'Building software', 'Deep in the code'],
  terminal: ['Working in the terminal', 'Hacking in the shell'],
  git: ['Reviewing changes', 'Managing source control'],
  api: ['Testing APIs', 'Debugging requests'],
  data: ['Querying databases', 'Working with data'],
  infra: ['Managing infrastructure', 'Tending the servers'],
  design: ['Designing', 'Designing interfaces', 'Sketching ideas'],
  photo: ['Editing photos', 'Retouching images'],
  video: ['Editing video', 'Cutting footage'],
  audio: ['Producing audio', 'Mixing tracks'],
  '3d': ['3D modeling', 'Sculpting in 3D'],
  writing: ['Writing', 'Drafting ideas', 'Taking notes'],
  office: ['Working on documents', 'Doing office work'],
  planning: ['Planning', 'Getting organized'],
  cad: ['Engineering in CAD', 'Designing parts'],
  gamedev: ['Making a game', 'Building a game'],
  browser: ['Researching', 'Browsing the web']
});

function pairs(phrases, ...keys) {
  return keys.map(key => [key, phrases]);
}

const PAIR_PHRASES = Object.freeze(Object.fromEntries([
  ...pairs(['Building with AI', 'Pair programming with AI', 'Shipping with AI'],
    'code+ai', 'ai+code', 'terminal+ai', 'ai+terminal'),
  ...pairs(['Writing code', 'Building software', 'Shipping code'],
    'code+terminal', 'terminal+code', 'code+git', 'git+code'),
  ...pairs(['Building and researching', 'Coding with the docs open'], 'code+browser'),
  ...pairs(['Researching and building'], 'browser+code'),
  ...pairs(['Researching with AI'], 'ai+browser', 'browser+ai'),
  ...pairs(['Writing with AI'], 'ai+writing', 'writing+ai'),
  ...pairs(['Designing and building'], 'code+design', 'design+code'),
  ...pairs(['Designing with AI'], 'design+ai'),
  ...pairs(['Working on the backend', 'Building with data'], 'code+data', 'data+code'),
  ...pairs(['Building and testing APIs'], 'code+api', 'api+code'),
  ...pairs(['Working on infrastructure'], 'code+infra', 'infra+code', 'terminal+infra', 'infra+terminal'),
  ...pairs(['Making a game'], 'code+gamedev', 'gamedev+code', 'gamedev+3d', '3d+gamedev'),
  ...pairs(['Researching and writing'], 'writing+browser', 'browser+writing'),
  ...pairs(['Designing graphics'], 'design+photo', 'photo+design'),
  ...pairs(['Producing video'], 'video+audio', 'audio+video'),
  ...pairs(['Planning and organizing'], 'office+planning', 'planning+office', 'writing+planning', 'planning+writing')
]));

function hash(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

function pick(phrases, seed) {
  return phrases[hash(seed) % phrases.length];
}

/**
 * Describe what the focus-ranked apps suggest the person is doing.
 * @param {{id: string, category: string}[]} apps - Apps in focus order
 * @returns {string|null}
 */
function describeActivity(apps) {
  if (!Array.isArray(apps) || apps.length === 0) {
    return null;
  }

  const [primary, ...supporting] = apps;
  const seed = apps.map(entry => entry.id).sort().join('|');
  for (const entry of supporting) {
    const phrases = PAIR_PHRASES[`${primary.category}+${entry.category}`];
    if (phrases) {
      return pick(phrases, seed);
    }
  }

  return pick(CATEGORY_PHRASES[primary.category] || ['Working'], seed);
}

module.exports = {
  CATEGORY_PHRASES,
  PAIR_PHRASES,
  describeActivity,
  hash
};
