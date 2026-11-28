// Shared between the App target (BoostLiveActivityPlugin starts/ends the activity) and the
// BoostLiveActivityWidget extension (renders it in the Dynamic Island and on the Lock Screen).
// This one file must be a member of BOTH targets. Its type name and fields are the contract between
// the two binaries - change them only together.

import Foundation

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct BoostActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// When the boost started (drives the progress bar).
        var startedAt: Date
        /// When the boost ends (drives the countdown).
        var endsAt: Date
    }

    /// The server's boost id - lets the app re-attach to the same activity after a relaunch.
    var boostId: String
    /// Localized "Boost is on".
    var title: String
    /// Localized "You're boosted".
    var subtitle: String
}
#endif
