#!/usr/bin/env bash
set -euo pipefail

# ===== Настройки =====
SSH_HOST="root@103.31.76.160"
SSH_KEY="/home/step/.ssh/losdan_private/shalos_bot.txt"
CONTAINER="meme-postgres"

# Куда сохранить локально (на твоём ПК)
LOCAL_BACKUP_DIR="$HOME/db-backups/meme-vpn"
mkdir -p "$LOCAL_BACKUP_DIR"

TS="$(date +%F_%H-%M-%S)"
LOCAL_FILE="$LOCAL_BACKUP_DIR/meme_${TS}.dump"

# ===== Бэкап =====
# ВАЖНО:
# 1) внутри контейнера должны быть PGUSER/PGPASSWORD/POSTGRES_DB (обычно есть)
# 2) если нет — добавь -U/-d и PGPASSWORD вручную
ssh -i "$SSH_KEY" "$SSH_HOST" \
  "docker exec -i $CONTAINER sh -lc 'pg_dump -Fc -U shalos -d shalos'" \
  > "$LOCAL_FILE"

echo "Backup saved: $LOCAL_FILE"

# ===== Быстрая проверка дампа =====
pg_restore -l "$LOCAL_FILE" | head -n 20 || true
echo "Done."