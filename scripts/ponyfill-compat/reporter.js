'use strict';

// A jest reporter that writes the subset of the --json output that report.js
// needs. --json can fail with "Converting circular structure to JSON" when a
// failure's details hold fibers.

const fs = require('fs');

class PonyfillCompatReporter {
  constructor(globalConfig, options) {
    this._outputFile = options.outputFile;
  }
  onRunComplete(contexts, results) {
    if (!this._outputFile) {
      return;
    }
    const out = {
      numPassedTests: results.numPassedTests,
      numFailedTests: results.numFailedTests,
      testResults: results.testResults.map(file => ({
        name: file.testFilePath,
        message: file.failureMessage || '',
        assertionResults: file.testResults.map(a => ({
          ancestorTitles: a.ancestorTitles,
          title: a.title,
          status: a.status,
          failureMessages: a.failureMessages,
        })),
      })),
    };
    fs.writeFileSync(this._outputFile, JSON.stringify(out));
  }
}

module.exports = PonyfillCompatReporter;
