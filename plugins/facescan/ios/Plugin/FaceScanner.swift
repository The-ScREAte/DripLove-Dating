import Foundation
import Vision
import UIKit
import AVFoundation

class FaceScanner: NSObject {
    
    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var completion: ((MLMultiArray?, VNFaceObservation?, Error?) -> Void)?
    private var previewCallback: ((Float, Float) -> Void)?
    private var yawHistory: [Float] = []
    private var rollHistory: [Float] = []
    private let historySize = 2
    private let stabilityThreshold: Float = 3.0
    private var lastYaw: Float = 0
    private var lastRoll: Float = 0
    
    func setPreviewCallback(_ callback: @escaping (Float, Float) -> Void) {
        self.previewCallback = callback
    }
    
    func capture(completion: @escaping (MLMultiArray?, VNFaceObservation?, Error?) -> Void) {
        self.completion = completion
        
        // Setup camera session
        setupCameraSession()
    } 
    
    private func setupCameraSession() {
        captureSession = AVCaptureSession()
        captureSession?.sessionPreset = .photo
        
        guard let captureSession = captureSession else { return }
        guard let videoCaptureDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) else {
            completion?(nil, nil, FaceError.cameraUnavailable)
            return
        }
        
        do {
            let videoInput = try AVCaptureDeviceInput(device: videoCaptureDevice)
            
            if captureSession.canAddInput(videoInput) {
                captureSession.addInput(videoInput)
            }
            
            let videoOutput = AVCaptureVideoDataOutput()
            videoOutput.setSampleBufferDelegate(self, queue: DispatchQueue(label: "videoQueue"))
            
            if captureSession.canAddOutput(videoOutput) {
                captureSession.addOutput(videoOutput)
            }
            
            DispatchQueue.global(qos: .userInitiated).async {
                captureSession.startRunning()
            }
        } catch {
            completion?(nil, nil, error)
        }
    }
    
    private func stopCapture() {
        captureSession?.stopRunning()
        captureSession = nil
    }
    
    private func isStable(yaw: Float, roll: Float) -> Bool {
        yawHistory.append(yaw)
        rollHistory.append(roll)
        
        if yawHistory.count > historySize {
            yawHistory.removeFirst()
            rollHistory.removeFirst()
        }
        
        guard yawHistory.count == historySize else {
            return false
        }
        
        let yawAvg = yawHistory.reduce(0, +) / Float(historySize)
        let rollAvg = rollHistory.reduce(0, +) / Float(historySize)
        
        let yawStable = yawHistory.allSatisfy { abs($0 - yawAvg) <= stabilityThreshold }
        let rollStable = rollHistory.allSatisfy { abs($0 - rollAvg) <= stabilityThreshold }
        
        return yawStable && rollStable
    }
}

extension FaceScanner: AVCaptureVideoDataOutputSampleBufferDelegate {
    
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        
        // Use VNDetectFaceLandmarksRequest for accurate yaw/roll
        let request = VNDetectFaceLandmarksRequest { [weak self] request, error in
            guard let self = self else { return }
            
            if let error = error {
                self.completion?(nil, nil, error)
                self.stopCapture()
                return
            }
            
            guard let results = request.results as? [VNFaceObservation], !results.isEmpty else {
                // No face detected, keep trying
                return
            }
            
            guard let face = results.first else { return }
            
            // Extract yaw/roll - VNFaceObservation returns NSNumber in radians
            let yawRadians = face.yaw?.floatValue ?? 0
            let rollRadians = face.roll?.floatValue ?? 0
            
            // Convert radians to degrees
            let rawYaw = yawRadians * 180 / Float.pi
            let rawRoll = rollRadians * 180 / Float.pi
            
            // Apply exponential smoothing to reduce flutter
            let smoothedYaw = rawYaw * 0.4 + self.lastYaw * 0.6
            let smoothedRoll = rawRoll * 0.4 + self.lastRoll * 0.6
            
            self.lastYaw = smoothedYaw
            self.lastRoll = smoothedRoll
            
            // Send preview update in degrees (CRITICAL: React expects degrees)
            self.previewCallback?(smoothedYaw, smoothedRoll)
            
            // Debug logging
            print("[FaceScanner] Raw: yaw=\(rawYaw)° roll=\(rawRoll)° | Smoothed: yaw=\(smoothedYaw)° roll=\(smoothedRoll)°")
            
            // Only generate descriptor when stable (CRITICAL FIX)
            guard self.isStable(yaw: smoothedYaw, roll: smoothedRoll) else {
                return
            }
            
            // Face is stable, now generate descriptor
            self.generateFaceDescriptor(from: pixelBuffer, face: face)
        }
        
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        
        do {
            try handler.perform([request])
        } catch {
            // Ignore errors, keep trying
        }
    }
    
    private func generateFaceDescriptor(from pixelBuffer: CVPixelBuffer, face: VNFaceObservation) {
        // Face is already detected and stable, create descriptor
        let request = VNDetectFaceLandmarksRequest { [weak self] request, error in
            guard let self = self else { return }
            
            if let error = error {
                self.completion?(nil, nil, error)
                self.stopCapture()
                return
            }
            
            guard let results = request.results as? [VNFaceObservation], let face = results.first else {
                self.completion?(nil, nil, FaceError.noFaceFound)
                self.stopCapture()
                return
            }
            
            // Extract yaw and roll for stability check
            let yaw = face.yaw?.floatValue ?? 0
            let roll = face.roll?.floatValue ?? 0
            let yawDegrees = yaw * 180 / Float.pi
            let rollDegrees = roll * 180 / Float.pi
            
            // Check stability before accepting capture
            guard self.isStable(yaw: yawDegrees, roll: rollDegrees) else {
                return
            }
            
            // Create a simple descriptor from landmarks
            let descriptor = self.createDescriptorFromLandmarks(face)
            self.completion?(descriptor, face, nil)
            self.stopCapture()
        }
        
        request.revision = VNDetectFaceLandmarksRequestRevision3
        
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        
        do {
            try handler.perform([request])
        } catch {
            self.completion?(nil, nil, error)
            self.stopCapture()
        }
    }
    
    private func createDescriptorFromLandmarks(_ face: VNFaceObservation) -> MLMultiArray {
        // Create a 128-dimensional descriptor from face landmarks and geometry
        let descriptorSize = 128
        guard let descriptor = try? MLMultiArray(shape: [descriptorSize as NSNumber], dataType: .float32) else {
            fatalError("Unable to create MLMultiArray")
        }
        
        // Use face bounding box and landmarks to create a unique descriptor
        let bbox = face.boundingBox
        descriptor[0] = NSNumber(value: Float(bbox.origin.x))
        descriptor[1] = NSNumber(value: Float(bbox.origin.y))
        descriptor[2] = NSNumber(value: Float(bbox.size.width))
        descriptor[3] = NSNumber(value: Float(bbox.size.height))
        descriptor[4] = NSNumber(value: Float(face.roll ?? 0))
        descriptor[5] = NSNumber(value: Float(face.yaw ?? 0))
        
        // Add landmark data if available
        if let landmarks = face.landmarks {
            var idx = 6
            
            // Normalize and add key landmark points
            if let leftEye = landmarks.leftEye {
                for i in 0..<min(leftEye.pointCount, 10) {
                    let point = leftEye.normalizedPoints[i]
                    if idx < descriptorSize - 1 {
                        descriptor[idx] = NSNumber(value: Float(point.x))
                        descriptor[idx + 1] = NSNumber(value: Float(point.y))
                        idx += 2
                    }
                }
            }
            
            if let rightEye = landmarks.rightEye {
                for i in 0..<min(rightEye.pointCount, 10) {
                    let point = rightEye.normalizedPoints[i]
                    if idx < descriptorSize - 1 {
                        descriptor[idx] = NSNumber(value: Float(point.x))
                        descriptor[idx + 1] = NSNumber(value: Float(point.y))
                        idx += 2
                    }
                }
            }
            
            if let nose = landmarks.nose {
                for i in 0..<min(nose.pointCount, 10) {
                    let point = nose.normalizedPoints[i]
                    if idx < descriptorSize - 1 {
                        descriptor[idx] = NSNumber(value: Float(point.x))
                        descriptor[idx + 1] = NSNumber(value: Float(point.y))
                        idx += 2
                    }
                }
            }
            
            if let outerLips = landmarks.outerLips {
                for i in 0..<min(outerLips.pointCount, 10) {
                    let point = outerLips.normalizedPoints[i]
                    if idx < descriptorSize - 1 {
                        descriptor[idx] = NSNumber(value: Float(point.x))
                        descriptor[idx + 1] = NSNumber(value: Float(point.y))
                        idx += 2
                    }
                }
            }
            
            // Fill remaining with zeros
            while idx < descriptorSize {
                descriptor[idx] = 0
                idx += 1
            }
        }
        
        return descriptor
    }
}

enum FaceError: Error {
    case noFaceFound
    case cameraUnavailable
    case timeout
}
