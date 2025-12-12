import UIKit
import Capacitor

@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }
        self.window = UIWindow(windowScene: windowScene)
        self.window?.backgroundColor = UIColor.clear
        self.window?.isOpaque = false
        
        let bridgeVC = CAPBridgeViewController()
        self.window?.rootViewController = bridgeVC
        
        // Enable transparent WebView for camera preview
        bridgeVC.webView?.isOpaque = false
        bridgeVC.webView?.backgroundColor = UIColor.clear
        bridgeVC.webView?.scrollView.backgroundColor = UIColor.clear
        bridgeVC.webView?.scrollView.isOpaque = false
        bridgeVC.view.backgroundColor = UIColor.clear
        bridgeVC.view.isOpaque = false

        // Defensive: ensure any superviews remain transparent
        bridgeVC.view.superview?.backgroundColor = UIColor.clear
        bridgeVC.view.superview?.isOpaque = false

        if #available(iOS 15.0, *) {
            bridgeVC.webView?.underPageBackgroundColor = UIColor.clear
        }
        
        self.window?.makeKeyAndVisible()
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        // Called as the scene is being released by the system.
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Called when the scene has moved from an inactive state to an active state.
        // Clear badge count when scene becomes active
        UIApplication.shared.applicationIconBadgeNumber = 0
    }

    func sceneWillResignActive(_ scene: UIScene) {
        // Called when the scene will move from an active state to an inactive state.
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        // Called as the scene transitions from the background to the foreground.
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        // Called as the scene transitions from the foreground to the background.
    }
}
