#!/bin/sh
# Xcode Cloud post-clone: the repo does not contain ios/App/Pods or ios/App/App/public (both git-ignored),
# so the archive fails with "Unable to open base configuration reference file ... Pods-App.release.xcconfig".
# Rebuild the web bundle, copy it into the iOS project and run `pod install` before Xcode builds.
set -eu
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"
cd "$REPO"

echo "== tools"
brew install node cocoapods >/dev/null 2>&1 || brew upgrade node cocoapods >/dev/null 2>&1 || true
node --version; npm --version; pod --version

echo "== build settings"
# .env is not in git: payment / Apple sign-in keys must be defined as Xcode Cloud environment variables.
for v in VITE_STRIPE_PUBLISHABLE_KEY_LIVE VITE_PAYSTACK_PUBLIC_KEY_LIVE VITE_APPLE_SERVICES_ID; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then echo "WARNING: $v is not set in the Xcode Cloud workflow - the related feature will be disabled in this build"; fi
done

echo "== web bundle"
npm ci --no-audit --no-fund
npm run build:capacitor

echo "== capacitor sync (copies dist -> ios/App/App/public, then pod install)"
npx cap sync ios

test -f ios/App/Pods/Target\ Support\ Files/Pods-App/Pods-App.release.xcconfig
echo "== done"
