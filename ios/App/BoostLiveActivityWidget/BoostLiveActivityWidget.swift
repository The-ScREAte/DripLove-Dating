// The running Boost's countdown in the Dynamic Island and on the Lock Screen.
// Started/ended by the app (ios/App/App/BoostLiveActivityPlugin.swift); the countdown itself is drawn by the
// system from the end date, so it keeps ticking while the app is in the background or closed.
//
// Brand: pink #ec4899 -> purple #a855f7.

import ActivityKit
import SwiftUI
import WidgetKit

private enum Brand {
    static let pink = Color(red: 236 / 255, green: 72 / 255, blue: 153 / 255)
    static let purple = Color(red: 168 / 255, green: 85 / 255, blue: 247 / 255)
    static let gradient = LinearGradient(colors: [pink, purple], startPoint: .topLeading, endPoint: .bottomTrailing)
    /// Same URL the app's SceneDelegate intercepts (BoostLiveActivityPlugin.tapURL) - opens where a boost push opens.
    static let tapURL = URL(string: "driplove://boost-live-activity")
}

private extension BoostActivityAttributes.ContentState {
    /// startedAt...endsAt, never inverted (a ClosedRange with lower > upper would crash).
    var range: ClosedRange<Date> {
        let start = min(startedAt, endsAt)
        return start...endsAt
    }
}

/// Small pink->purple bolt.
private struct BoltView: View {
    var size: CGFloat = 14
    var body: some View {
        Image(systemName: "bolt.fill")
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(Brand.gradient)
    }
}

/// Bolt in a soft gradient circle (Lock Screen / expanded island).
private struct BoltBadge: View {
    var diameter: CGFloat = 36
    var body: some View {
        ZStack {
            Circle().fill(Brand.gradient)
            Image(systemName: "bolt.fill")
                .font(.system(size: diameter * 0.45, weight: .bold))
                .foregroundColor(.white)
        }
        .frame(width: diameter, height: diameter)
    }
}

private struct Countdown: View {
    let state: BoostActivityAttributes.ContentState
    var body: some View {
        Text(timerInterval: state.range, countsDown: true)
            .monospacedDigit()
    }
}

private struct BoostProgressBar: View {
    let state: BoostActivityAttributes.ContentState
    var body: some View {
        ProgressView(timerInterval: state.range, countsDown: true) {
            EmptyView()
        } currentValueLabel: {
            EmptyView()
        }
        .progressViewStyle(.linear)
        .tint(Brand.pink)
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<BoostActivityAttributes>
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                BoltBadge(diameter: 38)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.title)
                        .font(.headline)
                        .foregroundColor(.white)
                    Text(context.attributes.subtitle)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.7))
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Countdown(state: context.state)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(Brand.gradient)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 110, alignment: .trailing)
            }
            BoostProgressBar(state: context.state)
        }
        .padding(16)
    }
}

struct BoostLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BoostActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.82))
                .activitySystemActionForegroundColor(.white)
                .widgetURL(Brand.tapURL)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    BoltBadge(diameter: 34)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state)
                        .font(.system(size: 26, weight: .bold, design: .rounded))
                        .foregroundStyle(Brand.gradient)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 100, alignment: .trailing)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 1) {
                        Text(context.attributes.title)
                            .font(.headline)
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Text(context.attributes.subtitle)
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.7))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    BoostProgressBar(state: context.state)
                        .padding(.horizontal, 6)
                        .padding(.top, 4)
                }
            } compactLeading: {
                BoltView(size: 14)
                    .padding(.leading, 2)
            } compactTrailing: {
                Countdown(state: context.state)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundColor(Brand.pink)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 44, alignment: .trailing)
            } minimal: {
                BoltView(size: 13)
            }
            .widgetURL(Brand.tapURL)
            .keylineTint(Brand.pink)
        }
    }
}

@main
struct BoostLiveActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        BoostLiveActivityWidget()
    }
}
