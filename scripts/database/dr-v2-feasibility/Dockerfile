# Isolated experiment only. Never used by production Compose.
FROM --platform=linux/amd64 postgis/postgis:16-3.5-alpine@sha256:becb8d49a20a2c1fcce1b154e853e1ea1a19cd5de99310852888b998694ec2ea
RUN apk add --no-cache openssl build-base meson ninja pkgconf openssl-dev libxml2-dev lz4-dev zstd-dev bzip2-dev yaml-dev postgresql-dev curl python3 py3-yaml py3-boto3
WORKDIR /build
RUN curl --fail --location --retry 2 https://github.com/pgbackrest/pgbackrest/archive/refs/tags/release/2.60.0.tar.gz -o source.tar.gz \
 && sha256sum source.tar.gz > /pgbackrest-source.sha256 \
 && tar -xzf source.tar.gz --strip-components=1 \
 && meson setup out --buildtype=release \
 && ninja -C out \
 && cp out/src/pgbackrest /usr/local/bin/pgbackrest \
 && pgbackrest version
WORKDIR /
