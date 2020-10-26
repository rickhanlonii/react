export default function run(testCase, options = {}) {
  const mountDurations = [];
  const updateDurations = [];
  const unmountDurations = [];

  let resolveFn = null;

  function handleTestComplete(mountDuration, updateDuration, unmountDuration) {
    mountDurations.push(mountDuration);
    updateDurations.push(updateDuration);
    unmountDurations.push(unmountDuration);

    const isConfident =
      getTestConfidence(mountDurations, options) &&
      getTestConfidence(updateDurations, options) &&
      getTestConfidence(unmountDurations, options);

    if (isConfident) {
      resolveFn([mountDurations, updateDurations, unmountDurations]);
    } else {
      runTestCase();
    }
  }

  function runTestCase() {
    testCase(handleTestComplete);
  }

  return new Promise(resolve => {
    resolveFn = resolve;
    runTestCase();
  });
}

function getTestConfidence(samples, options) {
  const {maxSampleSize = 100, minSampleSize = 5} = options;

  const sampleCount = samples.length;
  if (sampleCount >= maxSampleSize) {
    return true;
  } else if (sampleCount >= minSampleSize) {
    const indices = samples.map((_, index) => index);
    return calculateRegressionSlope(indices, samples) >= 0;
  } else {
    return false;
  }
}

function calculateMean(samples) {
  let total = 0;
  samples.forEach(value => {
    total += value;
  });
  return total / samples.length;
}

// See http://en.wikipedia.org/wiki/Simple_linear_regression
function calculateRegressionSlope(xValues, yValues) {
  const xMean = calculateMean(xValues);
  const yMean = calculateMean(yValues);

  let dividendSum = 0;
  let divisorSum = 0;

  for (let i = 0; i < xValues.length; i++) {
    dividendSum += (xValues[i] - xMean) * (yValues[i] - yMean);
    divisorSum += Math.pow(xValues[i] - xMean, 2);
  }

  return dividendSum / divisorSum;
}
