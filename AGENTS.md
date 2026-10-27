# CamGuard development guidelines

## Stack
- React, TypeScript, Vite and Capacitor 8.
- Android package id: `com.romabattleroyale.camguard`.
- The current Codemagic workflow builds a debug APK; it does not run the Express backend inside Android.

## Critical behavior requirements
- Do not show a camera as "live" until a media stream or successful WebRTC connection is confirmed.
- Distinguish permission denial, unavailable media APIs, missing devices, busy devices and network/signaling failures.
- Camera permission and microphone permission must be declared in AndroidManifest.xml and handled by the Android WebView permission flow at runtime.
- Never treat sample room images as actual IP-camera video. Label sample cameras as simulated until a real RTSP-to-supported-stream backend is available.
- Never treat a simulated retry, snapshot, or recording button as a real operation.
- Keep the server signaling reachable to every device participating in a session. Relative `/api` calls inside the Capacitor WebView do not automatically reach an external Express server.
- Validate session identity, participant role, message type, payload size and authorization on all signaling endpoints.
- Do not commit secrets, camera passwords, signing keys or API credentials.

## Build verification
- Generate and commit a complete lockfile with npm in an environment that can resolve dependencies before switching CI to `npm ci`; never use a hand-written partial lockfile.
- Run `npm run lint` and `npm run build` before packaging.
- Verify the manifest contains CAMERA and RECORD_AUDIO after Capacitor sync and before Gradle build.
- Ensure Codemagic selects Java 21 and print `java -version`.
- Treat an APK as release-ready only after installation and camera/microphone tests on a physical Android device, plus a two-device signaling/WebRTC test.
