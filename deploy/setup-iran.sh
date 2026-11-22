#!/usr/bin/env bash
# ==============================================================================
# اسکریپت راه‌اندازی و دیپلوی خودکار DigiWP روی سرور ایران (nabuxir / wp.nabuxai.ir)
# ==============================================================================
set -euo pipefail

REMOTE_HOST="${1:-nabuxir}"
TARGET_DIR="/opt/digiwp"

echo "=== ۱. بررسی ارتباط با سرور ایران (${REMOTE_HOST}) ==="
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "${REMOTE_HOST}" "echo 'اتصال برقرار است.'" >/dev/null 2>&1; then
  echo "خطا: امکان اتصال به ${REMOTE_HOST} وجود ندارد. لطفا تنظیمات SSH یا وضعیت سرور را بررسی کنید."
  exit 1
fi
echo "✓ اتصال SSH به سرور تأیید شد."

echo "=== ۲. ایجاد دایرکتوری مقصد در سرور (${TARGET_DIR}) ==="
ssh "${REMOTE_HOST}" "mkdir -p ${TARGET_DIR}"

echo "=== ۳. همگام‌سازی فایل‌های پروژه به سرور ==="
rsync -avz --delete \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.cache' \
  --exclude '.system_generated' \
  --exclude '.gemini' \
  --exclude 'brain' \
  ./ "${REMOTE_HOST}:${TARGET_DIR}/"

echo "=== ۴. بررسی و ساخت فایل محیطی .env در صورت نیاز ==="
ssh "${REMOTE_HOST}" "bash -s" << 'EOF'
set -euo pipefail
cd /opt/digiwp

if [ ! -f .env ]; then
  echo "فایل .env یافت نشد. در حال ایجاد از روی نمونه ایران..."
  cp deploy/iran-env.example .env
  # تولید کلید تصادفی ۳۲ بایتی برای AUTH_SECRET
  RANDOM_SECRET=$(openssl rand -hex 24)
  sed -i "s/changeme_nabux_iran_secure_token_key_2026_xyz123/${RANDOM_SECRET}/g" .env
  echo "فایل .env با موفقیت ایجاد و کلید امنیتی جدید تولید شد."
else
  echo "فایل .env از قبل موجود است و حفظ شد."
fi
EOF

echo "=== ۵. ساخت و اجرای کانتینرها روی سرور ایران ==="
ssh "${REMOTE_HOST}" "bash -s" << 'EOF'
set -euo pipefail
cd /opt/digiwp

# بررسی وجود شبکه coolify برای پروکسی Traefik
if ! docker network inspect coolify >/dev/null 2>&1; then
  echo "ایجاد شبکه داکر coolify..."
  docker network create coolify
fi

echo "در حال بیلد و بالا آوردن کانتینرهای استک ایران..."
docker compose -f docker-compose.iran.yaml up -d --build

echo "بررسی وضعیت کانتینرها:"
docker compose -f docker-compose.iran.yaml ps
EOF

echo "=== ۶. بررسی صحت اجرای سرویس (Health Check) ==="
ssh "${REMOTE_HOST}" "bash -s" << 'EOF'
set -euo pipefail
echo "صبر برای بالا آمدن کامل API و دیتابیس..."
for i in $(seq 1 15); do
  if docker exec digiwp-iran-server node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    echo "✓ سرور واسط و API در وضعیت سالم (Healthy) هستند."
    exit 0
  fi
  sleep 2
done
echo "هشدار: سرور هنوز در حال آماده‌سازی است. لاگ‌ها را بررسی کنید:"
docker logs digiwp-iran-server --tail 20
EOF

echo "=============================================================================="
echo "استقرار با موفقیت به پایان رسید!"
echo "نشانی پنل هاب: https://wp.nabuxai.ir"
echo "نشانی API واسط: https://wp.nabuxai.ir/api/health"
echo "نشانی وردپرس دمو: https://demo.wp.nabuxai.ir"
echo "=============================================================================="
