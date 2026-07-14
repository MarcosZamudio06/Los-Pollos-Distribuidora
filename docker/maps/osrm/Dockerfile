ARG OSRM_VERSION=v5.27.1
FROM ghcr.io/project-osrm/osrm-backend:${OSRM_VERSION}

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
