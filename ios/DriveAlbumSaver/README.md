# DriveAlbumSaver iOS App

This is the native iPhone path for the full flow:

1. Sign in with Google.
2. Scan a shared Google Drive folder.
3. Count folders, photos, and videos.
4. Download photos/videos.
5. Save them into an iPhone Photos album.
6. Compare Drive media count with saved count.

The earlier web app can prepare links and payloads, but Safari cannot silently create Photos albums or save media into them. This iOS app uses the Photos framework, so it can request permission and save media directly.

## Required Setup In Xcode

1. Open `DriveAlbumSaver.xcodeproj` on a Mac with Xcode.
2. Create an iOS OAuth client in Google Cloud Console.
3. Put the iOS client ID into the app screen.
4. Replace the URL scheme in `Info.plist`:

```xml
com.googleusercontent.apps.REPLACE_WITH_CLIENT_ID_PREFIX
```

For a client ID like:

```text
1234567890-abcdefg.apps.googleusercontent.com
```

the URL scheme is:

```text
com.googleusercontent.apps.1234567890-abcdefg
```

5. Set the Bundle Identifier and Team in Xcode.
6. Run on your iPhone.

## Why URL Scheme Setup Is Still Needed

Google OAuth on iOS returns the login result to the app through a custom URL scheme. iOS requires that scheme to be registered inside the app bundle before install. A webpage cannot register it for the app after the fact.

