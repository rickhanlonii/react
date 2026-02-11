'use strict';

var childProcess = require('child_process');
var bundleTest = require('./bundle-test').bundleTest;
var parseResults = require('./ipc').parseResults;
var path = require('path');

var TESTER_BINARY = path.resolve(
  __dirname,
  '../../../../ios/.build/release/FantomTester',
);

class FantomRunner {
  constructor(globalConfig) {
    this._globalConfig = globalConfig;
  }

  async runTests(tests, watcher, onStart, onResult, onFailure) {
    for (var i = 0; i < tests.length; i++) {
      var test = tests[i];
      await onStart(test);
      try {
        var result = await this._runTest(test);
        await onResult(test, result);
      } catch (e) {
        await onFailure(test, e);
      }
    }
  }

  async _runTest(test) {
    var startTime = Date.now();

    // 1. Bundle the test file with esbuild
    var bundlePath = await bundleTest(test.path);

    // 2. Run FantomTester binary
    var stdout;
    var stderr = '';
    try {
      stdout = childProcess.execSync(
        JSON.stringify(TESTER_BINARY) + ' ' + JSON.stringify(bundlePath),
        {
          encoding: 'utf-8',
          timeout: 30000,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
    } catch (execError) {
      stderr = execError.stderr || '';
      // If the binary exits with code 1, stdout still has results
      if (execError.stdout) {
        stdout = execError.stdout;
      } else {
        throw new Error(
          'FantomTester failed: ' + (stderr || execError.message),
        );
      }
    }

    // 3. Parse results from stdout
    var results = parseResults(stdout);

    // 4. Build Jest TestResult
    var endTime = Date.now();

    var testResults = [];

    // Use the detailed tests array if available (new format)
    if (results.tests && results.tests.length > 0) {
      for (var i = 0; i < results.tests.length; i++) {
        var t = results.tests[i];
        if (t.status === 'passed') {
          testResults.push({
            ancestorTitles: [t.suite],
            failureMessages: [],
            fullName: t.suite + ' > ' + t.test,
            numPassingAsserts: 1,
            status: 'passed',
            title: t.test,
          });
        } else {
          testResults.push({
            ancestorTitles: [t.suite],
            failureMessages: [t.error + '\n' + (t.stack || '')],
            fullName: t.suite + ' > ' + t.test,
            numPassingAsserts: 0,
            status: 'failed',
            title: t.test,
          });
        }
      }
    } else if (results.errors) {
      // Legacy format fallback — generic names for passing tests
      for (var j = 0; j < results.passed; j++) {
        testResults.push({
          ancestorTitles: [],
          failureMessages: [],
          fullName: test.path + ' (test ' + (j + 1) + ')',
          numPassingAsserts: 1,
          status: 'passed',
          title: 'test ' + (j + 1),
        });
      }
      for (var k = 0; k < results.errors.length; k++) {
        var err = results.errors[k];
        testResults.push({
          ancestorTitles: [err.suite],
          failureMessages: [err.error + '\n' + (err.stack || '')],
          fullName: err.suite + ' > ' + err.test,
          numPassingAsserts: 0,
          status: 'failed',
          title: err.test,
        });
      }
    }

    // 5. Build console buffer from captured console messages and
    //    write them to stderr so they're always visible during runs
    var consoleBuffer = null;
    if (results.console && results.console.length > 0) {
      consoleBuffer = [];
      for (var m = 0; m < results.console.length; m++) {
        var msg = results.console[m];
        consoleBuffer.push({
          message: msg.message,
          origin: test.path,
          type: msg.level || 'log',
        });
        process.stderr.write(
          '  console.' + (msg.level || 'log') + ' ' + msg.message + '\n',
        );
      }
    }

    // 6. Build failure message summary
    var failureMessage = '';
    if (results.failed > 0) {
      var failedTests = testResults.filter(function (t) {
        return t.status === 'failed';
      });
      var lines = [];
      for (var n = 0; n < failedTests.length; n++) {
        lines.push(
          '  ● ' + failedTests[n].fullName + '\n\n' +
          '    ' + failedTests[n].failureMessages.join('\n    ') + '\n',
        );
      }
      failureMessage = lines.join('\n');
    }

    // Append stderr from the binary (JSC exceptions, warnings)
    if (stderr) {
      failureMessage = (failureMessage ? failureMessage + '\n' : '') +
        'FantomTester stderr:\n' + stderr;
    }

    return {
      console: consoleBuffer,
      failureMessage: failureMessage,
      numFailingTests: results.failed,
      numPassingTests: results.passed,
      numPendingTests: 0,
      numTodoTests: 0,
      perfStats: {
        end: endTime,
        start: startTime,
      },
      skipped: false,
      snapshot: {
        added: 0,
        fileDeleted: false,
        matched: 0,
        unchecked: 0,
        unmatched: 0,
        updated: 0,
      },
      sourceMaps: {},
      testExecError: null,
      testFilePath: test.path,
      testResults: testResults,
    };
  }
}

module.exports = FantomRunner;
