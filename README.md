# CsCMessage

CsCMessage is a mobile-first messaging product prototype for Android and iOS.

## Current prototype
- Futuristic responsive inbox and conversation UI
- Local demo chat interactions (no real message delivery yet)
- Explicit opt-in CsC AI preview
- Calls, Spaces, Activity and Profile screens
- Dark/light theme toggle
- Playwright smoke tests with desktop and mobile screenshots

## Development
```bash
npm install
npm run dev
```

## Validation
```bash
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright screenshots are written to `test-results/`.

## Android
The CI workflow creates the Capacitor Android platform and builds a debug APK. The APK is a UI prototype; real-time messaging, accounts, push notifications, WebRTC and end-to-end encryption still require backend implementation and security review.

## iOS
The Capacitor configuration is prepared for iOS. A signed iOS build requires macOS/Xcode and Apple signing credentials.
