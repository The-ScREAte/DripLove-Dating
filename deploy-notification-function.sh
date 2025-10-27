#!/bin/bash

echo "Deploying send-push-notification function..."

# Deploy with timeout and background
timeout 120 supabase functions deploy send-push-notification --no-verify-jwt &
PID=$!

# Wait for a bit
sleep 10

# Check if process is still running
if ps -p $PID > /dev/null; then
   echo "Deploy is running in background (PID: $PID)"
   echo "Checking function status..."
   
   # Give it more time
   sleep 20
   
   if ps -p $PID > /dev/null; then
       echo "Deploy is still in progress. Letting it continue..."
       wait $PID
   else
       echo "Deploy completed"
   fi
else
   echo "Deploy already completed"
fi

echo "Done"
