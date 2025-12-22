import "./chunk-4B2QHNJT.js";

// node_modules/@capacitor-community/camera-preview/dist/esm/web.js
import { WebPlugin } from "@capacitor/core";
var CameraPreviewWeb = class extends WebPlugin {
  async start(options) {
    return new Promise(async (resolve, reject) => {
      var _a;
      await navigator.mediaDevices.getUserMedia({
        audio: !options.disableAudio,
        video: true
      }).then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      }).catch((error) => {
        reject(error);
      });
      const video = document.getElementById("video");
      const parent = document.getElementById(options.parent);
      if (!video) {
        const videoElement = document.createElement("video");
        videoElement.id = "video";
        videoElement.setAttribute("class", options.className || "");
        if (options.position !== "rear") {
          videoElement.setAttribute("style", "-webkit-transform: scaleX(-1); transform: scaleX(-1);");
        }
        const userAgent = navigator.userAgent.toLowerCase();
        const isSafari = userAgent.includes("safari") && !userAgent.includes("chrome");
        if (isSafari) {
          videoElement.setAttribute("autoplay", "true");
          videoElement.setAttribute("muted", "true");
          videoElement.setAttribute("playsinline", "true");
        }
        parent.appendChild(videoElement);
        if ((_a = navigator.mediaDevices) === null || _a === void 0 ? void 0 : _a.getUserMedia) {
          const constraints = {
            video: {
              width: { ideal: options.width },
              height: { ideal: options.height }
            }
          };
          if (options.position === "rear") {
            constraints.video.facingMode = "environment";
            this.isBackCamera = true;
          } else {
            this.isBackCamera = false;
          }
          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            videoElement.srcObject = stream;
            videoElement.play();
            resolve();
          }, (err) => {
            reject(err);
          });
        }
      } else {
        reject({ message: "camera already started" });
      }
    });
  }
  async startRecordVideo() {
    throw this.unimplemented("Not implemented on web.");
  }
  async stopRecordVideo() {
    throw this.unimplemented("Not implemented on web.");
  }
  async stop() {
    const video = document.getElementById("video");
    if (video) {
      video.pause();
      const st = video.srcObject;
      const tracks = st.getTracks();
      for (const track of tracks) {
        track.stop();
      }
      video.remove();
    }
  }
  async capture(options) {
    return new Promise((resolve) => {
      const video = document.getElementById("video");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (!this.isBackCamera) {
        context.translate(video.videoWidth, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      let base64EncodedImage;
      if (options.quality != void 0) {
        base64EncodedImage = canvas.toDataURL("image/jpeg", options.quality / 100).replace("data:image/jpeg;base64,", "");
      } else {
        base64EncodedImage = canvas.toDataURL("image/png").replace("data:image/png;base64,", "");
      }
      resolve({
        value: base64EncodedImage
      });
    });
  }
  async captureSample(_options) {
    return this.capture(_options);
  }
  async getSupportedFlashModes() {
    throw new Error("getSupportedFlashModes not supported under the web platform");
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setFlashMode(_options) {
    throw new Error("setFlashMode not supported under the web platform");
  }
  async flip() {
    throw new Error("flip not supported under the web platform");
  }
  async setOpacity(_options) {
    const video = document.getElementById("video");
    if (!!video && !!_options["opacity"]) {
      video.style.setProperty("opacity", _options["opacity"].toString());
    }
  }
  async isCameraStarted() {
    throw this.unimplemented("Not implemented on web.");
  }
};
export {
  CameraPreviewWeb
};
//# sourceMappingURL=web-EUDOIUFF.js.map
