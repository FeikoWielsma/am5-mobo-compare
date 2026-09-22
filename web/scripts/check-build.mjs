import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const buildDir = join(import.meta.dirname, '..', 'build');
const dataFiles = [
  'boards.json',
  'build-meta.json',
  'compare-layout.json',
  'features.json',
  'structure.json',
  'ui-metadata.json'
];

for (const name of dataFiles) {
  const file = join(buildDir, 'data', name);
  assert.ok(existsSync(file), `Missing built data file: ${name}`);
  JSON.parse(readFileSync(file, 'utf8'));
}

const boards = JSON.parse(readFileSync(join(buildDir, 'data', 'boards.json'), 'utf8'));
assert.ok(Array.isArray(boards) && boards.length > 0, 'Built board catalog is empty');

let boardPhotos = 0;
for (const board of boards) {
  for (const key of ['board_image', 'board_image_thumb', 'rear_io_image', 'rear_io_image_thumb']) {
    const url = board.typed?.[key];
    if (!url?.startsWith('/')) continue;
    assert.ok(existsSync(join(buildDir, url.slice(1))), `Missing ${key} for ${board.id}: ${url}`);
    if (key === 'board_image') boardPhotos++;
  }
}

assert.ok(boardPhotos > 0, 'No motherboard PCB photos were packaged');
console.log(`Build assets verified: ${boards.length} boards, ${boardPhotos} PCB photos`);
