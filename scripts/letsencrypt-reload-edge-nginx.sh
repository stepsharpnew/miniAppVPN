#!/bin/sh
# Положите на сервер: /etc/letsencrypt/renewal-hooks/deploy/reload-edge-nginx.sh
# chmod +x ... && certbot renew будет вызывать после успешного продления.
docker exec edge-nginx nginx -s reload 2>/dev/null || true
