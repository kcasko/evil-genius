import {readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const files=readdirSync(join(root,'tests')).filter(name=>
  (name.startsWith('v2_')&&name.endsWith('.test.mjs'))||name.endsWith('_overlay.test.cjs')
).sort().map(name=>join(root,'tests',name));
const run=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
process.exit(run.status??1);
