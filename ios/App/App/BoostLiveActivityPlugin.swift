// BoostLiveActivity - starts/ends the running Boost's Live Activity (Dynamic Island + Lock Screen).
// JS side: src/native/boostLiveActivity.ts (+ boostLiveActivityBridge.ts, which drives it from the boost service).
// UI: ios/App/BoostLiveActivityWidget/ (widget extension). Shared model: BoostActivityAttributes.swift (both targets).
//
// Registered by DripBridgeViewController.capacitorDidLoad() (local plugins are not auto-discovered).
// Needs iOS 16.1+ and NSSupportsLiveActivities = YES in App/Info.plist; on older iOS every call is a quiet no-op.

import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

extension Notification.Name {
    /// Posted by SceneDelegate when the Live Activity (or Dynamic Island) is tapped.
    static let boostLiveActivityTapped = Notification.Name("DLBoostLiveActivityTapped")
}

@objc(BoostLiveActivityPlugin)
public class BoostLiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BoostLiveActivityPlugin"
    public let jsName = "BoostLiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise)
    ]

    /// widgetURL of the Live Activity (see BoostLiveActivityWidget.swift). SceneDelegate swallows it so the OAuth
    /// deep-link handler never sees it, and posts .boostLiveActivityTapped instead.
    static let tapURL = "driplove://boost-live-activity"
    static func isTapURL(_ url: URL) -> Bool {
        return url.scheme == "driplove" && url.host == "boost-live-activity"
    }
    /// A tap that arrived before the plugin loaded (cold start).
    static var pendingTap = false

    private var tapObserver: NSObjectProtocol?

    override public func load() {
        tapObserver = NotificationCenter.default.addObserver(forName: .boostLiveActivityTapped,
                                                             object: nil,
                                                             queue: .main) { [weak self] _ in
            BoostLiveActivityPlugin.pendingTap = false
            self?.notifyListeners("tap", data: [:], retainUntilConsumed: true)
        }
        if BoostLiveActivityPlugin.pendingTap {
            BoostLiveActivityPlugin.pendingTap = false
            notifyListeners("tap", data: [:], retainUntilConsumed: true)
        }
    }

    deinit {
        if let tapObserver = tapObserver {
            NotificationCenter.default.removeObserver(tapObserver)
        }
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
            return
        }
        #endif
        call.resolve(["supported": false])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let boostId = call.getString("boostId"), !boostId.isEmpty,
              let endsAtMs = call.getDouble("endsAt") else {
            call.reject("boostId and endsAt are required")
            return
        }
        let endsAt = Date(timeIntervalSince1970: endsAtMs / 1000)
        guard endsAt > Date() else {
            call.resolve()
            return
        }
        let startedAt = call.getDouble("startedAt").map { Date(timeIntervalSince1970: $0 / 1000) } ?? Date()
        let title = call.getString("title") ?? "Boost is on"
        let subtitle = call.getString("subtitle") ?? "You're boosted"

        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.resolve()
                return
            }
            Task {
                do {
                    try await BoostActivityController.start(boostId: boostId,
                                                            startedAt: min(startedAt, endsAt),
                                                            endsAt: endsAt,
                                                            title: title,
                                                            subtitle: subtitle)
                    call.resolve()
                } catch {
                    call.reject("Could not start the Live Activity", nil, error)
                }
            }
            return
        }
        #endif
        call.resolve()
    }

    @objc func end(_ call: CAPPluginCall) {
        let onlyExpired = call.getBool("onlyExpired") ?? false
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            Task {
                await BoostActivityController.endAll(except: nil, onlyExpired: onlyExpired)
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }
}

#if canImport(ActivityKit)
@available(iOS 16.1, *)
private enum BoostActivityController {
    typealias BoostActivity = Activity<BoostActivityAttributes>

    static func start(boostId: String, startedAt: Date, endsAt: Date, title: String, subtitle: String) async throws {
        // Only one boost runs at a time: anything else still showing is from an older boost.
        await endAll(except: boostId, onlyExpired: false)

        if let existing = BoostActivity.activities.first(where: {
            $0.attributes.boostId == boostId && isShowing($0.activityState)
        }) {
            // Same boost (app relaunched, or the end time was corrected): keep the original start for the bar.
            let state = BoostActivityAttributes.ContentState(startedAt: min(currentState(of: existing).startedAt, startedAt),
                                                             endsAt: endsAt)
            if #available(iOS 16.2, *) {
                await existing.update(ActivityContent(state: state, staleDate: endsAt))
            } else {
                await existing.update(using: state)
            }
            return
        }

        let attributes = BoostActivityAttributes(boostId: boostId, title: title, subtitle: subtitle)
        let state = BoostActivityAttributes.ContentState(startedAt: startedAt, endsAt: endsAt)
        if #available(iOS 16.2, *) {
            _ = try BoostActivity.request(attributes: attributes,
                                          content: ActivityContent(state: state, staleDate: endsAt),
                                          pushType: nil)
        } else {
            _ = try BoostActivity.request(attributes: attributes, contentState: state, pushType: nil)
        }
    }

    /// Ends every boost activity (except `boostId`), or with `onlyExpired` only those whose end time has passed.
    static func endAll(except boostId: String?, onlyExpired: Bool) async {
        let now = Date()
        for activity in BoostActivity.activities {
            if let boostId = boostId, activity.attributes.boostId == boostId { continue }
            let state = currentState(of: activity)
            if onlyExpired && state.endsAt > now { continue }
            if #available(iOS 16.2, *) {
                await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .immediate)
            } else {
                await activity.end(using: state, dismissalPolicy: .immediate)
            }
        }
    }

    private static func currentState(of activity: BoostActivity) -> BoostActivityAttributes.ContentState {
        if #available(iOS 16.2, *) {
            return activity.content.state
        }
        return activity.contentState
    }

    private static func isShowing(_ state: ActivityState) -> Bool {
        switch state {
        case .active:
            return true
        case .ended, .dismissed:
            return false
        default:
            // .stale (iOS 16.2+) and anything newer: still on screen, can be updated.
            return true
        }
    }
}
#endif
