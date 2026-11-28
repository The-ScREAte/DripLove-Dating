# BoostLiveActivityWidget

Shows the running Boost's countdown in the Dynamic Island and on the Lock Screen (iOS Live Activity), so the
countdown sits at the top of the device next to the camera instead of in the app header.

## How it fits together

| Piece | Where | Target |
| --- | --- | --- |
| Shared model `BoostActivityAttributes` | `BoostLiveActivityWidget/BoostActivityAttributes.swift` | **App + BoostLiveActivityWidget** |
| Widget UI (Dynamic Island compact/minimal/expanded, Lock Screen) | `BoostLiveActivityWidget/BoostLiveActivityWidget.swift` | BoostLiveActivityWidget |
| Extension Info.plist | `BoostLiveActivityWidget/Info.plist` | BoostLiveActivityWidget |
| Capacitor plugin `BoostLiveActivity` (start / end / isSupported) | `App/BoostLiveActivityPlugin.swift` | App |
| Registers the local plugin | `App/DripBridgeViewController.swift` (SceneDelegate creates it) | App |
| Tap on the activity -> Boost | `App/SceneDelegate.swift` swallows `driplove://boost-live-activity` | App |
| `NSSupportsLiveActivities = YES` | `App/Info.plist` | App |
| JS side | `src/native/boostLiveActivity.ts`, `src/native/boostLiveActivityBridge.ts` (started in `src/main.tsx`) | web bundle |

The JS bridge calls `start({ boostId, endsAt, startedAt, title, subtitle })` when a boost starts or is found running,
and `end()` when it is over. The countdown and progress bar are drawn by the system from the end date, so they keep
ticking while the app is in the background or closed.

## Project setup (already done in `App.xcodeproj`)

The `BoostLiveActivityWidget` target was added to `App.xcodeproj/project.pbxproj` by hand, mirroring the existing
`NotificationService` extension. It was checked with `plutil -lint` and `xcodebuild -list` / `-showBuildSettings`,
but nobody has built it yet. It is set up like this:

- Widget extension (`com.apple.product-type.app-extension`, `NSExtensionPointIdentifier = com.apple.widgetkit-extension`)
- Bundle id `com.driplove.dating.BoostLiveActivityWidget`, deployment target **iOS 16.1**, automatic signing (team
  inherited from the project, RK88F7ATDV), Swift 5
- Links WidgetKit + SwiftUI; embedded in the App through "Embed App Extensions"; the App depends on it
- `BoostActivityAttributes.swift` is compiled into both targets
- The App target links ActivityKit weakly (`OTHER_LDFLAGS += -weak_framework ActivityKit`) because the app still
  supports iOS 15. Every ActivityKit call is behind `#available(iOS 16.1, *)`.
- `MARKETING_VERSION` 2.0.1 / `CURRENT_PROJECT_VERSION` 1, the same as the App. **When you bump the app version,
  bump the widget target too.** App Store Connect warns when an extension's version doesn't match the app's.
- No App Group, no Push Notifications capability, and no extra entitlements are needed. The activity is started
  and ended locally, with no ActivityKit push updates.

## Owner steps

1. `npx cap sync ios` as usual. `pod install` only touches the App target, so the widget target is left alone.
2. Open `ios/App/App.xcworkspace`. In the project navigator you should see a **BoostLiveActivityWidget** group and
   a **BoostLiveActivityWidget** target.
3. Select the **BoostLiveActivityWidget** target > Signing & Capabilities. Check that "Automatically manage signing"
   is on with the same team as App. Xcode registers the new bundle id the first time. For Xcode Cloud / App Store
   Connect, make sure the identifier `com.driplove.dating.BoostLiveActivityWidget` exists. Automatic signing
   usually creates it.
4. Build and run the **App** scheme on a real iPhone running iOS 16.1 or later. The Dynamic Island needs an iPhone
   14 Pro or later; other iPhones show the Lock Screen banner. Start a boost: the island shows the pink bolt on the
   left and the countdown on the right. Long-press it to see the expanded view. Lock the phone to see the banner.
   Tapping either one opens the app on DripCheck with the Boost sheet.
5. If nothing appears, check Settings > DripLove > Live Activities (the user can turn it off).
   `BoostLiveActivity.isSupported()` then returns `{ supported: false }`.

QA without a backend: `localStorage.dl_boost_preview = '1'` (and `dl_boost_preview_seconds = '60'` for a short
boost). The mocked boost goes through the same bridge, so it shows the real Live Activity.

## Known limits

- When the boost runs out while the app is suspended or closed, the activity can't be removed at that exact
  moment without ActivityKit push updates (that needs a server push). The countdown stops at 0:00. The
  activity is marked stale at `endsAt` and is removed as soon as the app runs again: the bridge calls
  `end({ onlyExpired: true })` at start-up, and `end()` when the boost service reports the boost over.
  iOS also removes ended or stale activities on its own after a while.

## If the hand-made target ever gives trouble: recreate it in Xcode

1. In Xcode, select the BoostLiveActivityWidget target and delete it (minus button). Also remove its entry from App >
   Build Phases > Embed App Extensions if it is still there. Keep the files on disk.
2. File > New > Target... > iOS > **Widget Extension** > Next.
   - Product Name: `BoostLiveActivityWidget`
   - Team: the same team as App
   - **Include Live Activity: ON**. Include Configuration App Intent: OFF. Include Control: OFF.
   - Embed in Application: **App**
   - Finish. If asked "Activate scheme?", choose either.
3. Xcode creates template files in `ios/App/BoostLiveActivityWidget/`. It may suffix the folder name if the folder
   already exists. Delete the generated template Swift files (`BoostLiveActivityWidgetBundle.swift`,
   `BoostLiveActivityWidgetLiveActivity.swift`, `BoostLiveActivityWidget.swift` from the template,
   `AppIntent.swift` and so on) and the generated `Info.plist` if it duplicates ours. Then add the files in this
   folder to the target (right-click the group > Add Files..., target = BoostLiveActivityWidget):
   `BoostLiveActivityWidget.swift` and `Info.plist`. Don't add `Info.plist` to "Copy Bundle Resources". Set
   Build Settings > Info.plist File = `BoostLiveActivityWidget/Info.plist` and Generate Info.plist File = No.
4. Select `BoostActivityAttributes.swift` and, in the File inspector > Target Membership, tick **both App and
   BoostLiveActivityWidget**.
5. BoostLiveActivityWidget target > General > Minimum Deployments: **iOS 16.1**. Set the version and build to the
   App's version and build.
6. App target > Build Settings > Other Linker Flags: add `-weak_framework ActivityKit`, keeping `$(inherited)`.
7. Check that `App/BoostLiveActivityPlugin.swift` and `App/DripBridgeViewController.swift` are members of the
   **App** target, and that `App/Info.plist` has `NSSupportsLiveActivities = YES`.
