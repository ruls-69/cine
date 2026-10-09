import { build } from 'rolldown';
import { copyFile } from 'node:fs/promises';

for (const [input, file] of [
  ['src/app/admin.js', 'admin.js'],
  ['src/app/public.js', 'app.js'],
  ['src/app/trailers.js', 'trailers.js'],
]) {
  await build({ input, output: { file, format: 'iife', minify: false },
    treeshake: true });
}
await copyFile('.build/shared/ui.js', 'ui.js');
console.log('Feature modules bundled to the existing public script URLs.');
