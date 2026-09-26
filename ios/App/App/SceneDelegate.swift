import UIKit
import Capacitor
import UserNotifications

@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }
        self.window = UIWindow(windowScene: windowScene)
        // Opaque black backstop, not .clear: the camera-preview feature (see
        // FaceVerification.tsx's CameraPreview.start({ toBack: true })) only
        // needs the WEBVIEW layer to be transparent so its native camera view
        // - inserted directly behind the webview - can show through. It does
        // NOT need the window/root view themselves to be transparent, and
        // making them .clear too left nothing opaque behind the webview on
        // every other screen. On some iOS/WKWebView versions that renders as
        // a persistent white screen at launch instead of showing the page's
        // own (black) CSS background, which is what caused the white-screen
        // bug - a solid backstop here fixes that without touching the
        // camera-preview transparency it was originally added for.
        self.window?.backgroundColor = UIColor.black

        let bridgeVC = CAPBridgeViewController()
        self.window?.rootViewController = bridgeVC

        // Enable transparent WebView for camera preview
        bridgeVC.webView?.isOpaque = false
        bridgeVC.webView?.backgroundColor = UIColor.clear
        bridgeVC.webView?.scrollView.backgroundColor = UIColor.clear
        bridgeVC.webView?.scrollView.isOpaque = false
        bridgeVC.view.backgroundColor = UIColor.black

        if #available(iOS 15.0, *) {
            bridgeVC.webView?.underPageBackgroundColor = UIColor.black
        }

        self.window?.makeKeyAndVisible()

        // Handle deep links on cold start
        if let urlContext = connectionOptions.urlContexts.first {
            print("[SceneDelegate] Cold start openURL: \(urlContext.url.absoluteString)")
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared,
                                                           open: urlContext.url,
                                                           options: [:])
        }

        // Handle universal links on cold start
        if let userActivity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared,
                                                           continue: userActivity,
                                                           restorationHandler: { _ in })
        }
    }

    // Handle deep links while app is running / in background
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            print("[SceneDelegate] openURLContexts: \(context.url.absoluteString)")
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared,
                                                           open: context.url,
                                                           options: [:])
        }
    }

    // Handle universal links while app is running / in background
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared,
                                                       continue: userActivity,
                                                       restorationHandler: { _ in })
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        // Called as the scene is being released by the system.
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        // Called when the scene has moved from an inactive state to an active state.
        // applicationIconBadgeNumber = 0 clears the icon badge but also wipes every
        // delivered notification from Notification Center as a side effect - that's
        // what was clearing the whole notification shade on every app open/resume.
        // setBadgeCount only touches the icon number.
        if #available(iOS 16.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(0)
        }
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
