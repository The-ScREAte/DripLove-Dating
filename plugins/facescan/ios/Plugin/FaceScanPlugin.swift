import Foundation
import Capacitor
import Vision
import UIKit
import AVFoundation

@objc(FaceScanPlugin)
public class FaceScanPlugin: CAPPlugin {
    private let scanner = FaceScanner()
    private let frontTolerance: Float = 5 // degrees
    private let sideThreshold: Float = 20 // degrees
    private let maxRoll: Float = 10 // degrees
    
    public override func load() {
        // Setup preview callback to send real-time yaw/roll updates
        scanner.setPreviewCallback { [weak self] yaw, roll in
            self?.notifyListeners("previewUpdate", data: [
                "yaw": yaw,
                "roll": roll
            ]) 
        }
    }
    
    @objc func captureDescriptor(_ call: CAPPluginCall) {
        let requestedAngle = call.getString("angle") ?? "front"
        scanner.capture { descriptor, faceObservation, error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else if let descriptor = descriptor, let face = faceObservation {
                let yawDegrees = Float((face.yaw ?? 0) * 180 / .pi)
                let rollDegrees = Float((face.roll ?? 0) * 180 / .pi)
                
                print("[FaceScan] Yaw:", yawDegrees, "Roll:", rollDegrees, "Angle:", requestedAngle)
                
                guard self.isRollCompliant(rollDegrees) else {
                    call.reject("Keep your head level. Please avoid tilting.")
                    return
                }
                
                guard self.isAngleCompliant(requestedAngle, yaw: yawDegrees) else {
                    call.reject(self.angleFailureMessage(for: requestedAngle))
                    return
                }
                
                // Convert MLMultiArray to Data and encode as base64
                let data = self.convertDescriptorToData(descriptor)
                call.resolve([
                    "descriptor": data.base64EncodedString(),
                    "success": true,
                    "yaw": yawDegrees,
                    "roll": rollDegrees
                ])
            } else {
                call.reject("No face detected")
            }
        }
    }
    
    @objc func hasPermission(_ call: CAPPluginCall) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        call.resolve([
            "hasPermission": status == .authorized,
            "status": self.statusToString(status)
        ])
    }
    
    @objc func requestPermission(_ call: CAPPluginCall) {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            call.resolve([
                "hasPermission": granted
            ])
        }
    }
    
    private func convertDescriptorToData(_ descriptor: MLMultiArray) -> Data {
        let count = descriptor.count
        var floatArray = [Float](repeating: 0, count: count)
        
        for i in 0..<count {
            floatArray[i] = descriptor[i].floatValue
        }
        
        return Data(bytes: &floatArray, count: count * MemoryLayout<Float>.size)
    }
    
    private func statusToString(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        @unknown default: return "unknown"
        }
    }
    
    private func isAngleCompliant(_ angle: String, yaw: Float) -> Bool {
        switch angle {
        case "front":
            return abs(yaw) <= frontTolerance
        case "left":
            return yaw <= -sideThreshold
        case "right":
            return yaw >= sideThreshold
        default:
            return false
        }
    }
    
    private func isRollCompliant(_ roll: Float) -> Bool {
        return abs(roll) <= maxRoll
    }
    
    private func angleFailureMessage(for angle: String) -> String {
        switch angle {
        case "front":
            return "Please face the camera straight on before capturing."
        case "left":
            return "Turn your head slowly to the LEFT until prompted."
        case "right":
            return "Turn your head slowly to the RIGHT until prompted."
        default:
            return "Face not aligned."
        }
    }
}
