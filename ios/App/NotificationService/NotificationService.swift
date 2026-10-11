import UserNotifications

// Downloads and attaches the sender's photo (see `imageUrl` in the FCM data
// payload, resolved server-side in send-push-notification/index.ts) to a
// message/match push so it shows as the rounded image iOS notifications
// display, matching what CustomFirebaseMessagingService.java already does
// on Android via setLargeIcon. Only runs when the push sets
// aps.mutable-content = 1; a missing/failed image just falls back to the
// plain notification rather than blocking delivery.
class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let bestAttemptContent = bestAttemptContent,
              let imageUrlString = request.content.userInfo["imageUrl"] as? String,
              let imageUrl = URL(string: imageUrlString) else {
            contentHandler(request.content)
            return
        }

        downloadImage(from: imageUrl) { [weak self] attachment in
            if let attachment = attachment {
                bestAttemptContent.attachments = [attachment]
            }
            self?.contentHandler?(bestAttemptContent)
        }
    }

    // iOS gives this extension a few seconds; if the download hasn't
    // finished, deliver the notification as-is rather than let it get
    // dropped entirely.
    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    private func downloadImage(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
        let task = URLSession.shared.downloadTask(with: url) { location, _, error in
            guard let location = location, error == nil else {
                completion(nil)
                return
            }

            let tmpDirectory = FileManager.default.temporaryDirectory
            let fileExtension = url.pathExtension.isEmpty ? "jpg" : url.pathExtension
            let tmpFile = tmpDirectory.appendingPathComponent(UUID().uuidString + "." + fileExtension)

            do {
                try FileManager.default.moveItem(at: location, to: tmpFile)
                let attachment = try UNNotificationAttachment(identifier: "senderPhoto", url: tmpFile, options: nil)
                completion(attachment)
            } catch {
                completion(nil)
            }
        }
        task.resume()
    }
}
 