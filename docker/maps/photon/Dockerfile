FROM eclipse-temurin:21-jre-alpine

ARG PHOTON_VERSION=1.2.1

RUN apk add --no-cache curl \
  && mkdir -p /opt/photon /data \
  && curl --fail --location --retry 3 \
    "https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar" \
    --output /opt/photon/photon.jar

WORKDIR /data

EXPOSE 2322

CMD ["java", "-jar", "/opt/photon/photon.jar", "serve", "-data-dir", "/data", "-listen-ip", "0.0.0.0", "-listen-port", "2322", "-default-language", "es", "-max-results", "10", "-max-reverse-results", "10", "-metrics-enable"]
