FROM eclipse-temurin:21-jre-alpine@sha256:3f08b13888f595cc49edabea7250ba69499ba25602b267da591720769400e08c

ARG PHOTON_VERSION=1.2.1
ARG PHOTON_JAR_SHA256=6ea66d598a3f6fc1b59b0f81ad4f8abee72ccdb9d3db03bc12008974cdebd58d

RUN apk add --no-cache curl \
  && addgroup -S -g 1000 photon \
  && adduser -S -D -H -u 1000 -G photon photon \
  && mkdir -p /opt/photon /data \
  && curl --fail --location --retry 3 \
    "https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar" \
    --output /opt/photon/photon.jar \
  && echo "${PHOTON_JAR_SHA256}  /opt/photon/photon.jar" | sha256sum -c - \
  && chown -R photon:photon /opt/photon /data

WORKDIR /data

USER photon

EXPOSE 2322

CMD ["java", "-jar", "/opt/photon/photon.jar", "serve", "-data-dir", "/data", "-listen-ip", "0.0.0.0", "-listen-port", "2322", "-default-language", "default", "-max-results", "10", "-max-reverse-results", "10", "-metrics-enable", "prometheus"]
