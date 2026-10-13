/**
 * tests/runner.js
 * Autonomous E2E Test Runner for AG Pet
 * Executes Tiers 1-4 test suites, tracks timing and assertions,
 * formats structured summary report, and returns exit code 0/1.
 */

const fs = require('node:fs');
const path = require('node:path');

const TIERS = [
  { id: 1, name: 'Tier 1: Feature Coverage (≥5 tests/feature)', dir: path.join(__dirname, 'tier1-features') },
  { id: 2, name: 'Tier 2: Boundary & Corner Cases (≥5 tests/feature)', dir: path.join(__dirname, 'tier2-boundaries') },
  { id: 3, name: 'Tier 3: Cross-Feature Pairwise (≥14 tests)', dir: path.join(__dirname, 'tier3-integration') },
  { id: 4, name: 'Tier 4: Real-World Workload Scenarios (≥7 tests)', dir: path.join(__dirname, 'tier4-workloads') }
];

// CLI options
const args = process.argv.slice(2);
let tierFilter = null;
let nameFilter = null;

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--tier=')) {
    tierFilter = parseInt(args[i].split('=')[1], 10);
  } else if (args[i] === '-t' && args[i + 1]) {
    tierFilter = parseInt(args[++i], 10);
  } else if (args[i].startsWith('--filter=')) {
    nameFilter = args[i].split('=')[1].toLowerCase();
  } else if (args[i] === '-f' && args[i + 1]) {
    nameFilter = args[++i].toLowerCase();
  }
}

async function runTestFile(filePath) {
  const fileName = path.basename(filePath);
  let suite;
  try {
    suite = require(filePath);
  } catch (err) {
    return {
      fileName,
      suiteName: fileName,
      error: `Failed to load ${fileName}: ${err.message}`,
      tests: [{ name: 'Load file', passed: false, error: err.stack, durationMs: 0 }]
    };
  }

  const suiteName = suite.name || fileName;
  const testsToRun = Array.isArray(suite.tests) ? suite.tests : [];
  const results = [];

  for (const t of testsToRun) {
    if (nameFilter && !t.name.toLowerCase().includes(nameFilter)) {
      continue;
    }
    const start = performance.now();
    try {
      if (typeof t.fn === 'function') {
        await t.fn();
      }
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      results.push({ name: t.name, passed: true, durationMs });
    } catch (err) {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      results.push({ name: t.name, passed: false, error: err.message, stack: err.stack, durationMs });
    }
  }

  return {
    fileName,
    suiteName,
    tests: results
  };
}

async function main() {
  console.log('='.repeat(78));
  console.log(' AG PET E2E TEST SUITE RUNNER');
  console.log('='.repeat(78));

  const overallStart = performance.now();
  const tierReports = [];
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const tier of TIERS) {
    if (tierFilter && tierFilter !== tier.id) continue;

    console.log(`\n▶ [Tier ${tier.id}] ${tier.name}`);
    console.log('-'.repeat(78));

    if (!fs.existsSync(tier.dir)) {
      console.log(`  (Directory not found: ${path.relative(process.cwd(), tier.dir)})`);
      continue;
    }

    const files = fs.readdirSync(tier.dir)
      .filter(f => f.endsWith('.test.js'))
      .sort();

    if (files.length === 0) {
      console.log('  (No test files found in tier directory)');
      continue;
    }

    let tierPassed = 0;
    let tierFailed = 0;

    for (const file of files) {
      const fullPath = path.join(tier.dir, file);
      const suiteResult = await runTestFile(fullPath);

      const suitePassed = suiteResult.tests.filter(t => t.passed).length;
      const suiteFailed = suiteResult.tests.filter(t => !t.passed).length;

      tierPassed += suitePassed;
      tierFailed += suiteFailed;

      const symbol = suiteFailed === 0 ? '✔' : '✖';
      console.log(`  ${symbol} ${suiteResult.suiteName} (${file}): ${suitePassed}/${suiteResult.tests.length} passed`);

      for (const t of suiteResult.tests) {
        if (!t.passed) {
          console.log(`    ✖ FAIL: ${t.name} (${t.durationMs}ms)`);
          console.log(`      Error: ${t.error}`);
        }
      }
    }

    totalTests += (tierPassed + tierFailed);
    totalPassed += tierPassed;
    totalFailed += tierFailed;

    tierReports.push({
      tier: tier.id,
      name: tier.name,
      passed: tierPassed,
      failed: tierFailed,
      total: tierPassed + tierFailed
    });
  }

  const overallDuration = Math.round(performance.now() - overallStart);

  console.log('\n' + '='.repeat(78));
  console.log(' SUMMARY REPORT');
  console.log('='.repeat(78));
  console.log(String('Tier').padEnd(8) + String('Total').padEnd(10) + String('Passed').padEnd(10) + String('Failed').padEnd(10) + 'Status');
  console.log('-'.repeat(78));

  for (const tr of tierReports) {
    const status = tr.failed === 0 ? 'PASS' : 'FAIL';
    console.log(
      String(`Tier ${tr.tier}`).padEnd(8) +
      String(tr.total).padEnd(10) +
      String(tr.passed).padEnd(10) +
      String(tr.failed).padEnd(10) +
      status
    );
  }

  console.log('-'.repeat(78));
  console.log(
    String('Total').padEnd(8) +
    String(totalTests).padEnd(10) +
    String(totalPassed).padEnd(10) +
    String(totalFailed).padEnd(10) +
    (totalFailed === 0 ? 'ALL PASSED' : 'FAILURES DETECTED')
  );
  console.log(`Execution time: ${overallDuration}ms`);
  console.log('='.repeat(78));

  if (totalFailed > 0 || totalTests === 0) {
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
  await new Promise(r => setTimeout(r, 50));
}

main().catch(err => {
  console.error('Fatal runner crash:', err);
  process.exit(1);
});
