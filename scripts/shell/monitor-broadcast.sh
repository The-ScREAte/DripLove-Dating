#!/bin/bash
# Monitor broadcast queue progress
# Usage: ./scripts/shell/monitor-broadcast.sh <campaign_id>

CAMPAIGN_ID=$1

if [ -z "$CAMPAIGN_ID" ]; then
  echo "Usage: ./scripts/shell/monitor-broadcast.sh <campaign_id>"
  exit 1
fi

echo "Monitoring broadcast campaign: $CAMPAIGN_ID"
echo "Press Ctrl+C to stop"
echo ""

while true; do
  # Get campaign stats from Supabase
  curl -s "https://tgjsyyihabsovironesw.supabase.co/rest/v1/broadcast_campaigns?id=eq.$CAMPAIGN_ID&select=status,successful_sends,failed_sends,total_recipients" \
    -H "apikey: YOUR_ANON_KEY" \
    -H "Authorization: Bearer YOUR_ANON_KEY" \
    | jq '.[0] | "Status: \(.status) | Sent: \(.successful_sends) | Failed: \(.failed_sends) | Total: \(.total_recipients)"'
  
  sleep 3
done
 