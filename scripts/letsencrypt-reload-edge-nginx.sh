#!/bin/sh
# Хук после успешного certbot renew: перечитать сертификаты в edge-nginx (Docker).
# На сервер: sudo install -m 755 scripts/letsencrypt-reload-edge-nginx.sh /etc/letsencrypt/renewal-hooks/deploy/reload-edge-nginx.sh
docker exec edge-nginx nginx -s reload 2>/dev/null || true
