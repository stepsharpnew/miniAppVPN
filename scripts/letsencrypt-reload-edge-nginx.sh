#!/bin/sh
# [Не используется на prod sslip по умолчанию] Хук после certbot renew для контейнера edge-nginx.
# Установка на сервер: /etc/letsencrypt/renewal-hooks/deploy/reload-edge-nginx.sh, chmod +x
docker exec edge-nginx nginx -s reload 2>/dev/null || true
