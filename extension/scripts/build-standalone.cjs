/**
 * Offline packaging fallback for the WXT TypeScript source.
 * Uses TypeScript's transpileModule (not the WXT bundler) to make browser-loadable
 * artifacts when npm is unavailable. Normal/release builds should use `wxt build`.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist-standalone');

function canonical(file) { return path.relative(root, file).replaceAll('\\', '/'); }
function resolveRelative(from, name) {
  const abs = path.resolve(path.dirname(from), name);
  for (const attempt of [abs, abs + '.ts', abs + '.tsx', path.join(abs, 'index.ts')]) {
    if (fs.existsSync(attempt) && fs.statSync(attempt).isFile()) return attempt;
  }
  throw new Error(`Cannot resolve ${name} from ${from}`);
}
function bundle(entry) {
  const files = new Map();
  function visit(abs) {
    if (files.has(canonical(abs))) return;
    const content = fs.readFileSync(abs, 'utf8');
    files.set(canonical(abs), content);
    const parsed = ts.preProcessFile(content, true, true);
    for (const imp of parsed.importedFiles) {
      if (imp.fileName.startsWith('.')) visit(resolveRelative(abs, imp.fileName));
    }
  }
  visit(path.resolve(root, entry));
  const modules = [...files].map(([name, source]) => {
    const output = ts.transpileModule(source, { fileName:name, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    }}).outputText;
    return `${JSON.stringify(name)}: function(module,exports,require){\n${output}\n}`;
  });
  return `(function(){ 'use strict';
  const modules = {\n${modules.join(',\n')}\n};
  const cache = Object.create(null);
  const browserApi = typeof browser !== 'undefined' ? browser : chrome;
  const imports = {
    defineBackground(definition){ return typeof definition === 'function' ? definition() : definition.main(); },
    defineContentScript(definition){ Promise.resolve().then(()=>definition.main()).catch(e=>console.error('[HoverFX] content error', e)); return definition; }
  };
  function load(id) {
    if(id==='wxt/browser') return {browser:browserApi};
    if(id==='#imports') return imports;
    if(cache[id]) return cache[id].exports;
    const loader=modules[id]; if(!loader) throw Error('Module missing: '+id);
    const mod={exports:{}};cache[id]=mod;
    loader(mod,mod.exports, name => {
      if (name==='wxt/browser'||name==='#imports')return load(name);
      const parts=id.split('/');parts.pop();
      for(const p of name.split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p)}
      return load(parts.join('/')+'.ts');
    });
    return mod.exports;
  }
  load(${JSON.stringify(entry)});
})();`;
}

const base = {
  name: 'HoverFX — Currency on Hover',
  version: '0.2.1',
  description: 'Hover over webpage prices to see a conversion into your preferred currency.',
  icons: {16:'icon-16.png', 32:'icon-32.png', 48:'icon-48.png', 128:'icon-128.png'},
  content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'], run_at: 'document_idle', all_frames: false }],
};

for (const browser of ['chrome','firefox','edge']) {
  const output = path.join(dist,browser);
  fs.mkdirSync(path.join(output,'popup'), {recursive:true});
  fs.writeFileSync(path.join(output,'background.js'),bundle('entrypoints/background.ts'));
  fs.writeFileSync(path.join(output,'content.js'),bundle('entrypoints/content.ts'));
  fs.writeFileSync(path.join(output,'popup/main.js'),bundle('entrypoints/popup/main.ts'));
  fs.copyFileSync(path.join(root,'entrypoints/popup/style.css'),path.join(output,'popup/style.css'));
  fs.writeFileSync(path.join(output,'popup/index.html'),fs.readFileSync(path.join(root,'entrypoints/popup/index.html'),'utf8').replace('./main.ts','./main.js'));
  for(const icon of fs.readdirSync(path.join(root,'public'))) fs.copyFileSync(path.join(root,'public',icon),path.join(output,icon));
  const chromium = browser !== 'firefox';
  const manifest = chromium ? {
    ...base, manifest_version:3,
    permissions:['storage','tabs'],
    host_permissions:['https://api.frankfurter.dev/*'],
    action:{default_popup:'popup/index.html',default_title:'HoverFX settings'},
    background:{service_worker:'background.js'},
  } : {
    ...base, manifest_version:2,
    permissions:['storage','tabs','<all_urls>','https://api.frankfurter.dev/*'],
    browser_action:{default_popup:'popup/index.html',default_title:'HoverFX settings'},
    background:{scripts:['background.js']},
    browser_specific_settings:{ gecko: {id:'hoverfx@local',strict_min_version:'109.0'} },
  };
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Created ${output}`);
}
