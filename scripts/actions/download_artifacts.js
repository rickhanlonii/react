const cp = require('child_process');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function execHelper(command, options, streamStdout = false) {
  return new Promise((resolve, reject) => {
    const proc = cp.exec(command, options, (error, stdout) =>
      error ? reject(error) : resolve(stdout.trim())
    );
    if (streamStdout) {
      proc.stdout.pipe(process.stdout);
    }
  });
}

async function run(ciBuildId) {
  let artifactsUrl = `https://circleci.com/api/v1.1/project/github/facebook/react/${ciBuildId}/artifacts`;
  // This is a temporary, dirty hack to avoid needing a GitHub auth token in the circleci
  // workflow to notify this GitHub action. Sorry!
  let iter = 0;
  spinloop: while (iter < 15) {
    const res = await github.rest.repos.listCommitStatusesForRef({
      owner: context.repo.owner,
      repo: context.repo.repo,
      ref: context.sha,
    });
    for (const status of res.data) {
      if (/process_artifacts_combined/.test(status.context)) {
        switch (status.state) {
          case 'pending': {
            console.log(`${status.context} is still pending`);
            break;
          }
          case 'failure':
          case 'error': {
            throw new Error(`${status.context} has failed or errored`);
          }
          case 'success': {
            // The status does not include a build ID, but we can extract it
            // from the URL. I couldn't find a better way to do this.
            const ciBuildId = /\/facebook\/react\/([0-9]+)/.exec(
              status.target_url
            )[1];
            if (Number.parseInt(ciBuildId, 10) + '' === ciBuildId) {
              artifactsUrl = `https://circleci.com/api/v1.1/project/github/facebook/react/${ciBuildId}/artifacts`;
              console.log(`Found artifactsUrl: ${artifactsUrl}`);
              break spinloop;
            } else {
              throw new Error(`${ciBuildId} isn't a number`);
            }
            break;
          }
          default: {
            throw new Error(`Unhandled status state: ${status.state}`);
            break;
          }
        }
      }
    }
    iter++;
    console.log('Sleeping for 60s...');
    await sleep(60_000);
  }
  if (artifactsUrl != null) {
    const {CIRCLECI_TOKEN} = process.env;
    const res = await fetch(artifactsUrl, {
      headers: {
        'Circle-Token': CIRCLECI_TOKEN,
      },
    });
    const data = await res.json();
    if (!Array.isArray(data) && data.message != null) {
      throw `CircleCI returned: ${data.message}`;
    }
    for (const artifact of data) {
      if (artifact.path === 'build.tgz') {
        console.log(`Downloading and unzipping ${artifact.url}`);
        await execHelper(
          `curl -L ${artifact.url} -H "Circle-Token: ${CIRCLECI_TOKEN}" | tar -xvz`
        );
      }
    }
    return true;
  } else {
    return 'No artifacts found.';
  }
}

exports.run = run;
