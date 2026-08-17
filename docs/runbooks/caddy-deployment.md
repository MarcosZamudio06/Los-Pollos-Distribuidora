# Caddy production deployment

This runbook is the host-side entry point for Architecture A single-host
production. Caddy terminates public HTTPS and proxies only to the two loopback
ports intentionally published by `docker-compose.production.yml`.

## Quick path

1. Copy `Caddyfile.production` to the host-managed Caddy configuration path.
2. Replace `erp.example.com` and `objects.example.com` with the approved
   domains on the deployment host only. Do not commit those values until the
   domains are real and approved.
3. Configure the application environment with matching public origins:

   ```text
   CORS_ORIGIN=https://erp.example.com
   OBJECT_STORAGE_PUBLIC_ENDPOINT=https://objects.example.com
   OBJECT_STORAGE_PUBLIC_ORIGIN=https://objects.example.com
   ```

4. Validate and reload Caddy:

   ```bash
   caddy validate --config /etc/caddy/Caddyfile.production --adapter caddyfile
   sudo systemctl reload caddy
   ```

5. Validate the Compose contract before starting or updating the stack:

   ```bash
   docker compose -f docker-compose.production.yml config >/dev/null
   ```

## Final topology

| Public hostname | Caddy upstream | Contract |
| --- | --- | --- |
| `https://erp.example.com` | `127.0.0.1:3000` | Frontend Nginx; it owns `/api/**`, `/api/socket.io`, and `/maps/**`. |
| `https://objects.example.com` | `127.0.0.1:8333` | Private SeaweedFS S3 gateway; only signed object URLs use this hostname. |

Caddy does **not** proxy `backend:4000`, `postgres:5432`, `photon:2322`,
`osrm:5000`, `vroom:3000`, or `tileserver:8080`. Those services remain private
on Docker `app_network` and have no host-published ports.

## Headers, WebSockets, and signed URLs

- `header_up Host {http.request.host}` keeps the public ERP or Object Storage
  hostname when sending the request upstream. This is required for SeaweedFS
  signed URL host validation.
- Caddy's `reverse_proxy` preserves the request URI and query string and
  automatically sets or augments `X-Forwarded-For` and `X-Forwarded-Proto`.
  The production template trusts only the listed Cloudflare ranges and uses
  strict right-to-left proxy parsing; refresh that list when Cloudflare
  publishes changes.
- The frontend Nginx image passes the forwarded protocol through for `/api/`,
  `/api/socket.io`, and `/maps/`. This prevents Caddy's public HTTPS scheme
  from being replaced by the internal HTTP hop.
- WebSocket upgrade is automatic in Caddy and is preserved by the frontend
  Nginx location for `/api/socket.io`. No separate WebSocket port is needed.
- The Object Storage site has no `rewrite`, `uri`, or `handle_path` directive.
  The signed URL path and query reach SeaweedFS unchanged.
- Object Storage responses are marked `private, no-store`; do not add a public
  CDN cache rule for delivery evidence.

## Cloudflare

Create proxied DNS records for both hostnames, pointing to the VPS:

| Record | Name | Target | Proxy |
| --- | --- | --- | --- |
| `A`/`AAAA` | `erp` | VPS public IP | Proxied |
| `A`/`AAAA` | `objects` | VPS public IP | Proxied |

Configure Cloudflare to use HTTPS to the origin with **Full (strict)** or an
equivalent strict mode. Do **not** use Flexible SSL: it would make the
Cloudflare-to-Caddy hop HTTP and would break the production HTTPS contract.
Keep WebSockets enabled for the zone. Caddy obtains/renews its own public
certificates, or the operator may install an origin certificate outside this
repository; never commit certificates, private keys, or Cloudflare API tokens.

## Firewall

Allow only:

- TCP `80` and `443` for the public Caddy entry point (or the approved
  Cloudflare edge ranges);
- SSH for a restricted administrative source range, never for the whole
  internet.

Block from the public network:

- TCP `3000`, `4000`, `5432`, `8333`, `2322`, `5000`, and `8080`;
- internal VROOM/GIS ports and any other Docker service port.

The Compose contract already binds the frontend to `127.0.0.1:3000` and
SeaweedFS to `127.0.0.1:8333`; the host firewall remains a second boundary.

## Verification

Run these checks after a deployment with real hostnames and healthy services:

```bash
caddy validate --config /etc/caddy/Caddyfile.production --adapter caddyfile
docker compose -f docker-compose.production.yml config >/dev/null
curl --fail --silent --show-error https://erp.example.com/
curl --fail --silent --show-error https://erp.example.com/api/health/ready
curl --fail --silent --show-error https://erp.example.com/maps/health
```

Use a browser or a Socket.IO client against `https://erp.example.com` to verify
the `/api/socket.io` connection. Generate a short-lived signed URL through the
backend and fetch it through `https://objects.example.com`; verify that the
request uses the generated path/query and that no public cache headers are
introduced. These DNS, TLS, Cloudflare, authenticated WebSocket, and signed
URL checks cannot be proven with the example hostnames in this repository.
