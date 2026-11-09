# One-job GitHub Actions runner for the desk CI host. The launcher starts a
# fresh container from this image for each job and deletes it afterwards.
FROM ubuntu:24.04

ARG RUNNER_VERSION=2.338.2
ARG RUNNER_SHA256=670adb2f268fe21dcbb58b3db0e0aa9d5b3bddfe2c651481336e561ff86de945

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bubblewrap build-essential ca-certificates curl git jq libicu74 python3 sudo unzip xz-utils zstd \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /bin/bash runner \
  && echo 'runner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/runner \
  && chmod 0440 /etc/sudoers.d/runner

USER runner
WORKDIR /home/runner
RUN curl --fail --silent --show-error --location --output runner.tar.gz \
    "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz" \
  && echo "${RUNNER_SHA256}  runner.tar.gz" | sha256sum --check --status \
  && tar xzf runner.tar.gz \
  && rm runner.tar.gz

# scripts/prepare-ci-bubblewrap.sh uses this bubblewrap instead of downloading
# the x86_64 package that the hosted runners use.
ENV DSH_CI_BUBBLEWRAP_PREINSTALLED=1

# The one-time runner config arrives by environment name, so it never appears
# in a host process argument; it is cleared before the runner starts jobs.
ENTRYPOINT ["/bin/bash", "-c", "config=\"$DSH_JITCONFIG\"; unset DSH_JITCONFIG; exec ./run.sh --jitconfig \"$config\""]
