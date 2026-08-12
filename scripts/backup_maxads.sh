#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="/root/backups/maxads"
LOG_FILE="/root/backups/backup.log"
DRIVE_DESTINATION="manus_google_drive:Max Ads Manager — Backups"
RCLONE_CONFIG="/root/.config/rclone/rclone.conf"
STAMP="$(date +%Y%m%d_%H%M%S)"
SQL_FILE="${BACKUP_DIR}/maxads_${STAMP}.sql"
ARCHIVE_FILE="${SQL_FILE}.gz"

mkdir -p "${BACKUP_DIR}"

log() {
  printf '%s: %s\n' "$(date '+%F %T')" "$*" >> "${LOG_FILE}"
}

if mysqldump --single-transaction --routines --events -u root maxads > "${SQL_FILE}"; then
  gzip -f "${SQL_FILE}"
  log "Локальная копия создана: ${ARCHIVE_FILE}"

  if rclone copyto "${ARCHIVE_FILE}" "${DRIVE_DESTINATION}/$(basename "${ARCHIVE_FILE}")" \
    --config "${RCLONE_CONFIG}" --checksum; then
    log "Копия загружена в Google Drive: $(basename "${ARCHIVE_FILE}")"
  else
    log "ОШИБКА: локальная копия создана, но выгрузка в Google Drive не удалась"
  fi
else
  rm -f "${SQL_FILE}"
  log "ОШИБКА: MySQL-бэкап не создан"
  exit 1
fi

# Сохраняем последние 14 локальных архивов; старые внешние копии не удаляем автоматически.
ls -1t "${BACKUP_DIR}"/maxads_*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
log "Очистка локальных копий завершена"
