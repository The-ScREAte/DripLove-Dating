import UIKit
import Capacitor

/// The app's Capacitor bridge view controller (created by SceneDelegate). Exists to register the app's own
/// local plugins: Capacitor only auto-discovers plugins that come from npm packages (capacitor.config.json's
/// packageClassList), so plugins that live in the App target are registered here by hand.
@objc(DripBridgeViewController)
class DripBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(BoostLiveActivityPlugin())
    }
}
