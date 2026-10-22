import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOperator } from './services/operator.service.js';

export type { PendingReport, OperatorStore } from './models/report.model.js';
export * from './services/operator.service.js';

// Importing this module never reads env or invokes a privileged operation.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runOperator(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
