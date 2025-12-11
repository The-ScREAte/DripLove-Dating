package com.driplove.facescan;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import android.Manifest;
import android.util.Log;

@CapacitorPlugin(
    name = "FaceScan",
    permissions = {
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        )
    }
)
public class FaceScanPlugin extends Plugin {

    private FaceScanner scanner;
    private static final float FRONT_TOLERANCE = 5f;
    private static final float SIDE_THRESHOLD = 20f;
    private static final float MAX_ROLL = 10f;

    @Override
    public void load() {
        scanner = new FaceScanner(getContext(), getActivity());
        
        // Setup preview callback to send real-time yaw/roll updates
        scanner.setPreviewCallback((yaw, roll) -> {
            JSObject data = new JSObject();
            data.put("yaw", yaw);
            data.put("roll", roll);
            notifyListeners("previewUpdate", data);
        });
    }

    @PluginMethod
    public void captureDescriptor(PluginCall call) {
        String angle = call.getString("angle", "front");
        if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
            requestAllPermissions(call, "cameraPermsCallback");
        } else {
            startCapture(call, angle);
        }
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject ret = new JSObject();
        boolean hasPermission = getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED;
        ret.put("hasPermission", hasPermission);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        requestAllPermissions(call, "permissionCallback");
    }

    @PluginCallback
    private void permissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        boolean hasPermission = getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED;
        ret.put("hasPermission", hasPermission);
        call.resolve(ret);
    }

    @PluginCallback
    private void cameraPermsCallback(PluginCall call) {
        if (getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED) {
            String angle = call.getString("angle", "front");
            startCapture(call, angle);
        } else {
            call.reject("Camera permission denied");
        }
    }

    private void startCapture(PluginCall call, String angle) {
        scanner.capture(
            (descriptor, yaw, roll) -> {
                Log.d("FaceScan", "Yaw: " + yaw + " Roll: " + roll + " Angle: " + angle);
                
                if (!isRollCompliant(roll)) {
                    call.reject("Keep your head level. Please avoid tilting.");
                    return;
                }

                if (!isAngleCompliant(angle, yaw)) {
                    call.reject(angleFailureMessage(angle));
                    return;
                }

                JSObject ret = new JSObject();
                ret.put("descriptor", descriptor);
                ret.put("success", true);
                ret.put("yaw", yaw);
                ret.put("roll", roll);
                call.resolve(ret);
            },
            error -> {
                call.reject(error);
            }
        );
    }

    private boolean isAngleCompliant(String angle, float yaw) {
        switch (angle) {
            case "front":
                return Math.abs(yaw) <= FRONT_TOLERANCE;
            case "left":
                return yaw <= -SIDE_THRESHOLD;
            case "right":
                return yaw >= SIDE_THRESHOLD;
            default:
                return false;
        }
    }

    private boolean isRollCompliant(float roll) {
        return Math.abs(roll) <= MAX_ROLL;
    }

    private String angleFailureMessage(String angle) {
        switch (angle) {
            case "front":
                return "Please face the camera straight on before capturing.";
            case "left":
                return "Turn your head slowly to the LEFT until prompted.";
            case "right":
                return "Turn your head slowly to the RIGHT until prompted.";
            default:
                return "Face not aligned.";
        }
    }
}
