// Puts the exported models into packages/webtween/models before the package is built.
import path from 'node:path';

import { copyModels } from './models.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const copied = copyModels(path.join(root, 'models'), path.join(root, 'packages/webtween/models'));
process.stdout.write(`packed ${copied.join(', ')}\n`);
