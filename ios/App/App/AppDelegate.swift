import UIKit
import Capacitor
import UserNotifications
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    // MARK: - App Launch (NO WINDOW CREATION)
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // Initialize Firebase
        FirebaseApp.configure()

        // Notification presentation/tap handling is owned by Capacitor's own
        // NotificationRouter (installed automatically when the bridge/scene
        // is created - see capacitor.config.ts's ios.handleApplicationNotifications),
        // which forwards taps into the PushNotifications plugin's
        // `pushNotificationActionPerformed` JS event. This used to set itself
        // as UNUserNotificationCenter's delegate here and hand-roll
        // willPresent/didReceive, which silently intercepted every
        // notification tap before the router could ever see it - the app
        // would open, but always to the default tab, never to the specific
        // match/chat a message or match notification pointed at, because the
        // JS side never received the tap event at all.
        Messaging.messaging().delegate = self

        return true
    }

    // MARK: - UIScene Configuration
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        
        return UISceneConfiguration(name: "Default Configuration",
                                    sessionRole: connectingSceneSession.role)
    }

    func application(_ application: UIApplication,
                     didDiscardSceneSessions sceneSessions: Set<UISceneSession>) {
    }

    // MARK: - URL Handling
    func application(_ app: UIApplication,
                     open url: URL,
                     options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        print("[AppDelegate] open url: \(url.absoluteString)")
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication,
                     continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application,
                                                           continue: userActivity,
                                                           restorationHandler: restorationHandler)
    }

    // MARK: - Push Notifications
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        
        Messaging.messaging().apnsToken = deviceToken
        
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }
}

// MARK: - MessagingDelegate
extension AppDelegate: MessagingDelegate {
    
    func messaging(_ messaging: Messaging,
                   didReceiveRegistrationToken fcmToken: String?) {
        print("📱 Firebase FCM token refreshed: \(fcmToken ?? "nil")")
        
        if let token = fcmToken {
            NotificationCenter.default.post(
                name: Notification.Name("FCMTokenRefreshed"),
                object: nil,
                userInfo: ["token": token]
            )
        }
    }
}
