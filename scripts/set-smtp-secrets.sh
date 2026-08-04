#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

SUPABASE_ACCESS_TOKEN="sbp_3d88914e2f22f39a24bf7fa6e452112fa66cc28a"
PROJECT_REF="tgjsyyihabsovironesw"

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

python3 - "$TMP_JSON" <<'PYEOF'
import json, sys

out_path = sys.argv[1]
names = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM', 'EMAIL_FROM_NAME']
vals = {}

with open('server/.env') as f:
    for line in f:
        if '=' in line and not line.strip().startswith('#'):
            k, _, v = line.strip().partition('=')
            if k in names:
                vals[k] = v

missing = [n for n in names if n not in vals]
if missing:
    print(f"Missing from server/.env: {missing}", file=sys.stderr)
    sys.exit(1)

with open(out_path, 'w') as f:
    json.dump([{'name': n, 'value': vals[n]} for n in names], f)

print(f"Prepared {len(vals)} secrets from server/.env")
PYEOF

echo "Uploading secrets to Supabase project $PROJECT_REF..."

RESPONSE="$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @"$TMP_JSON")"

STATUS="$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)"
BODY="$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')"

echo "HTTP status: $STATUS"
echo "Response: $BODY"

if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
  echo "Success! SMTP secrets are set."
else
  echo "Something went wrong — see response above."
  exit 1
fi
