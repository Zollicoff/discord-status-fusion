/**
 * Approved applications. Order is fallback display priority, used only when the
 * platform cannot report which app has focus.
 *
 * Each entry has a stable `id`, a canonical display `name`, an activity
 * `category` (see `src/core/activity.js`), and narrowly scoped name patterns.
 */
function app(id, name, category, ...patterns) {
  return Object.freeze({ id, name, category, patterns: Object.freeze(patterns) });
}

const APP_CATALOG = Object.freeze([
  // AI assistants and agentic coding tools
  app('chatgpt', 'ChatGPT', 'ai', /^chatgpt$/i),
  app('claude', 'Claude', 'ai', /^claude$/i),
  app('codex', 'Codex', 'ai', /^codex$/i),
  app('t3code', 'T3 Code', 'ai', /^t3 code(?: \((?:nightly|beta|alpha|dev)\))?$/i),

  // Editors and IDEs
  app('cursor', 'Cursor', 'code', /^cursor$/i),
  app('vscode', 'VS Code', 'code', /^(?:code|code-insiders)$/i, /^visual studio code(?: - insiders)?$/i),
  app('windsurf', 'Windsurf', 'code', /^windsurf$/i),
  app('zed', 'Zed', 'code', /^zed$/i),
  app('xcode', 'Xcode', 'code', /^xcode$/i),
  app('android-studio', 'Android Studio', 'code', /^(?:android studio|studio64)$/i),
  app('visual-studio', 'Visual Studio', 'code', /^devenv$/i),
  app('intellij', 'IntelliJ IDEA', 'code', /^(?:intellij idea(?: ce| ultimate)?|idea64?)$/i),
  app('pycharm', 'PyCharm', 'code', /^pycharm(?:64| ce| professional)?$/i),
  app('webstorm', 'WebStorm', 'code', /^webstorm(?:64)?$/i),
  app('phpstorm', 'PhpStorm', 'code', /^phpstorm(?:64)?$/i),
  app('goland', 'GoLand', 'code', /^goland(?:64)?$/i),
  app('rider', 'Rider', 'code', /^rider(?:64)?$/i),
  app('rustrover', 'RustRover', 'code', /^rustrover(?:64)?$/i),
  app('sublime', 'Sublime Text', 'code', /^(?:sublime text|sublime_text)$/i),
  app('nova', 'Nova', 'code', /^nova$/i),
  app('atom', 'Atom', 'code', /^atom$/i),
  app('neovim', 'Neovim', 'code', /^nvim$/i),
  app('vim', 'Vim', 'code', /^g?vim$/i),
  app('emacs', 'Emacs', 'code', /^emacs$/i),

  // Terminals
  app('warp', 'Warp', 'terminal', /^warp$/i),
  app('ghostty', 'Ghostty', 'terminal', /^ghostty$/i),
  app('iterm', 'iTerm', 'terminal', /^iterm2?$/i),
  app('terminal', 'Terminal', 'terminal', /^terminal$/i),
  app('kitty', 'kitty', 'terminal', /^kitty$/i),
  app('alacritty', 'Alacritty', 'terminal', /^alacritty$/i),
  app('wezterm', 'WezTerm', 'terminal', /^wezterm(?:-gui)?$/i),
  app('hyper', 'Hyper', 'terminal', /^hyper$/i),
  app('windows-terminal', 'Windows Terminal', 'terminal', /^(?:windows terminal|windowsterminal)$/i),

  // Design
  app('figma', 'Figma', 'design', /^figma$/i),
  app('sketch', 'Sketch', 'design', /^sketch$/i),
  app('illustrator', 'Adobe Illustrator', 'design', /^(?:adobe )?illustrator/i),
  app('indesign', 'Adobe InDesign', 'design', /^adobe indesign/i),
  app('canva', 'Canva', 'design', /^canva$/i),
  app('affinity-designer', 'Affinity Designer', 'design', /^affinity designer(?: 2)?$/i),
  app('affinity-publisher', 'Affinity Publisher', 'design', /^affinity publisher(?: 2)?$/i),
  app('affinity', 'Affinity', 'design', /^affinity$/i),

  // Photo
  app('photoshop', 'Adobe Photoshop', 'photo', /^(?:adobe )?photoshop/i),
  app('lightroom', 'Adobe Lightroom', 'photo', /^adobe lightroom/i),
  app('affinity-photo', 'Affinity Photo', 'photo', /^affinity photo(?: 2)?$/i),
  app('bridge', 'Adobe Bridge', 'photo', /^adobe bridge/i),

  // Video
  app('premiere', 'Adobe Premiere Pro', 'video', /^(?:adobe premiere pro|adobe premiere)/i),
  app('after-effects', 'Adobe After Effects', 'video', /^adobe after effects/i),
  app('final-cut', 'Final Cut Pro', 'video', /^final cut pro$/i),
  app('davinci', 'DaVinci Resolve', 'video', /^(?:davinci resolve|resolve)$/i),

  // Audio
  app('logic', 'Logic Pro', 'audio', /^logic pro(?: x)?$/i),
  app('pro-tools', 'Pro Tools', 'audio', /^pro tools$/i),
  app('audition', 'Adobe Audition', 'audio', /^adobe audition/i),
  app('ableton', 'Ableton Live', 'audio', /^ableton live(?: \d+)?(?: (?:suite|standard|intro|lite))?$/i),

  // 3D
  app('blender', 'Blender', '3d', /^blender$/i),
  app('cinema4d', 'Cinema 4D', '3d', /^cinema 4d$/i),
  app('maya', 'Maya', '3d', /^maya$/i),
  app('3ds-max', '3ds Max', '3d', /^3ds max$/i),

  // Writing and notes
  app('word', 'Microsoft Word', 'writing', /^(?:microsoft word|winword)$/i),
  app('pages', 'Pages', 'writing', /^pages$/i),
  app('notion', 'Notion', 'writing', /^notion$/i),
  app('obsidian', 'Obsidian', 'writing', /^obsidian$/i),
  app('roam', 'Roam Research', 'writing', /^roam research$/i),
  app('logseq', 'Logseq', 'writing', /^logseq$/i),
  app('acrobat', 'Adobe Acrobat', 'writing', /^adobe acrobat/i),

  // Spreadsheets, slides, and planning
  app('excel', 'Microsoft Excel', 'office', /^(?:microsoft excel|excel)$/i),
  app('numbers', 'Numbers', 'office', /^numbers$/i),
  app('powerpoint', 'Microsoft PowerPoint', 'office', /^(?:microsoft powerpoint|powerpnt)$/i),
  app('keynote', 'Keynote', 'office', /^keynote$/i),
  app('project', 'Microsoft Project', 'office', /^microsoft project$/i),
  app('visio', 'Microsoft Visio', 'office', /^microsoft visio$/i),
  app('outlook', 'Microsoft Outlook', 'planning', /^(?:microsoft outlook|outlook)$/i),
  app('notion-calendar', 'Notion Calendar', 'planning', /^notion calendar$/i),
  app('linear', 'Linear', 'planning', /^linear$/i),

  // Data and APIs
  app('tableplus', 'TablePlus', 'data', /^tableplus$/i),
  app('sequel-pro', 'Sequel Pro', 'data', /^sequel pro$/i),
  app('navicat', 'Navicat', 'data', /^navicat(?: premium)?$/i),
  app('dbeaver', 'DBeaver', 'data', /^dbeaver$/i),
  app('datagrip', 'DataGrip', 'data', /^datagrip(?:64)?$/i),
  app('postman', 'Postman', 'api', /^postman$/i),
  app('insomnia', 'Insomnia', 'api', /^insomnia$/i),
  app('paw', 'Paw', 'api', /^paw$/i),
  app('charles', 'Charles', 'api', /^charles$/i),
  app('wireshark', 'Wireshark', 'api', /^wireshark$/i),

  // Engineering and game development
  app('autocad', 'AutoCAD', 'cad', /^autocad(?: \d{4})?$/i),
  app('solidworks', 'SolidWorks', 'cad', /^(?:solidworks|sldworks)$/i),
  app('fusion360', 'Fusion 360', 'cad', /^(?:autodesk fusion(?: 360)?|fusion 360)$/i),
  app('unity', 'Unity', 'gamedev', /^unity$/i),
  app('unreal', 'Unreal Engine', 'gamedev', /^(?:unreal engine|unrealeditor)$/i),
  app('godot', 'Godot', 'gamedev', /^godot(?:_v[\w.-]+)?$/i),

  // Infrastructure and source control
  app('docker', 'Docker Desktop', 'infra', /^docker desktop$/i),
  app('vmware', 'VMware Fusion', 'infra', /^vmware fusion$/i),
  app('parallels', 'Parallels Desktop', 'infra', /^parallels desktop$/i),
  app('sourcetree', 'Sourcetree', 'git', /^sourcetree$/i),
  app('github-desktop', 'GitHub Desktop', 'git', /^(?:github desktop|githubdesktop)$/i),
  app('gitkraken', 'GitKraken', 'git', /^gitkraken$/i),
  app('tower', 'Tower', 'git', /^tower$/i),

  // Browsers
  app('chrome', 'Google Chrome', 'browser', /^(?:google chrome|google-chrome(?:-stable)?|chrome)$/i),
  app('safari', 'Safari', 'browser', /^safari$/i),
  app('firefox', 'Firefox', 'browser', /^firefox(?:-esr|-bin)?$/i),
  app('edge', 'Microsoft Edge', 'browser', /^(?:microsoft edge|msedge)$/i),
  app('brave', 'Brave', 'browser', /^(?:brave browser|brave-browser|brave)$/i),
  app('arc', 'Arc', 'browser', /^arc$/i),
  app('zen', 'Zen', 'browser', /^zen(?: browser)?$/i),
  app('opera', 'Opera', 'browser', /^opera$/i),
  app('vivaldi', 'Vivaldi', 'browser', /^vivaldi(?:-stable|-bin)?$/i)
]);

const APPS_BY_ID = new Map(APP_CATALOG.map(entry => [entry.id, entry]));
const PRIORITY_BY_ID = new Map(APP_CATALOG.map((entry, index) => [entry.id, index]));

if (APPS_BY_ID.size !== APP_CATALOG.length) {
  throw new Error('APP_CATALOG ids must be unique');
}

/**
 * Find the catalog entry whose pattern matches a normalized app name.
 * @param {string} name
 * @returns {object|null}
 */
function matchApp(name) {
  if (typeof name !== 'string' || !name) {
    return null;
  }
  return APP_CATALOG.find(entry => entry.patterns.some(pattern => pattern.test(name))) || null;
}

function getApp(id) {
  return APPS_BY_ID.get(id) || null;
}

function getPriority(id) {
  return PRIORITY_BY_ID.has(id) ? PRIORITY_BY_ID.get(id) : Number.MAX_SAFE_INTEGER;
}

/**
 * Resolve a user-supplied app reference (id or display name, any case).
 * @param {string} reference
 * @returns {object|null}
 */
function resolveApp(reference) {
  if (typeof reference !== 'string') {
    return null;
  }
  const normalized = reference.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return APP_CATALOG.find(entry =>
    entry.id === normalized || entry.name.toLowerCase() === normalized
  ) || matchApp(reference.trim());
}

module.exports = {
  APP_CATALOG,
  getApp,
  getPriority,
  matchApp,
  resolveApp
};
