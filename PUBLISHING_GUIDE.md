# Mobile App Publishing Guide (Android & iOS) 📱🚀

This guide provides the complete step-by-step workflow for generating release builds for **GeoPulse AI** (React Native) and publishing them to the **Google Play Store** and **Apple App Store**.

---

## 🛠️ Prerequisites & Developer Accounts

To publish to the app stores, you must have active developer accounts:
*   **Google Play Store**: A Google Play Developer Account ($25 one-time registration fee). Register at [Play Console](https://play.google.com/console).
*   **Apple App Store**: An Apple Developer Program membership ($99/year). Register at [Apple Developer](https://developer.apple.com/programs/).
*   **iOS Build Machine**: A macOS computer with Xcode installed is **required** to compile the iOS app.

---

## 🤖 Part 1: Android Release Build & Play Store Publishing

### Step 1: Generate an Upload Keystore (Signing Key)
Android requires all apps to be digitally signed with a certificate before they can be installed.

1. Open your terminal and run the following command (replace `my-upload-key` and `my-key-alias` with names specific to your project):
   ```bash
   keytool -genkeypair -v -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias geopulse-upload-key -keystore geopulse-upload-key.keystore
   ```
2. Keep this key safe! If you lose it, you will not be able to update your app on the Play Store.
3. Move the generated `geopulse-upload-key.keystore` file to the `mobile/android/app/` folder.
   > **Note:** The keystore is already configured to be ignored by Git in `.gitignore` to keep it secure.

### Step 2: Configure Gradle Variables
1. Open the file `mobile/android/gradle.properties` and add the following lines at the bottom (replace values with your keystore password/alias):
   ```properties
   MYAPP_UPLOAD_STORE_FILE=geopulse-upload-key.keystore
   MYAPP_UPLOAD_KEY_ALIAS=geopulse-upload-key
   MYAPP_UPLOAD_STORE_PASSWORD=YOUR_KEYSTORE_PASSWORD
   MYAPP_UPLOAD_KEY_PASSWORD=YOUR_KEYSTORE_PASSWORD
   ```

2. Open `mobile/android/app/build.gradle` and configure the signing configurations. Find the `signingConfigs` block and update it as follows:
   ```gradle
   signingConfigs {
       debug {
           storeFile file('debug.keystore')
           storePassword 'android'
           keyAlias 'androiddebugkey'
           keyPassword 'android'
       }
       release {
           if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
               storeFile file(MYAPP_UPLOAD_STORE_FILE)
               storePassword MYAPP_UPLOAD_STORE_PASSWORD
               keyAlias MYAPP_UPLOAD_KEY_ALIAS
               keyPassword MYAPP_UPLOAD_KEY_PASSWORD
           }
       }
   }
   buildTypes {
       release {
           signingConfig signingConfigs.release
           minifyEnabled enableProguardInReleaseBuilds
           proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
       }
   }
   ```

### Step 3: Generate the Android App Bundle (AAB)
Google Play requires submissions to be in the Android App Bundle (`.aab`) format.

1. Navigate to the android directory in your terminal:
   ```bash
   cd mobile/android
   ```
2. Clean and build the release bundle:
   ```bash
   ./gradlew clean
   ./gradlew bundleRelease
   ```
3. Your compiled app bundle will be generated at:
   `mobile/android/app/build/outputs/bundle/release/app-release.aab`

### Step 4: Publish to Google Play Console
1. Go to the [Google Play Console](https://play.google.com/console).
2. Click **Create App** and fill in your App Name, Default Language, and App Category.
3. In the left menu, navigate to **Release > Production** (or **Closed Testing** if you want to test with a small group first).
4. Click **Create new release**.
5. Upload your `app-release.aab` file.
6. Provide **Release notes** describing the new features.
7. Fill in the required dashboard checklists (Privacy Policy, Content Rating, Store Listing, pricing, screenshots, etc.).
8. Click **Save** and select **Rollout to Production** to submit your app for review. Review times typically range from 1 to 7 days.

---

## 🍎 Part 2: iOS Release Build & App Store Publishing

### Step 1: Set Up App Store Connect & Developer Account
1. Log in to [Apple Developer](https://developer.apple.com/) and go to **Certificates, Identifiers & Profiles**.
2. Register an **App ID** with your bundle identifier (e.g. `com.geopulse.ai`). Enable features like Push Notifications.
3. Create an **iOS Distribution Certificate** and a **Provisioning Profile** matching your App ID.
4. Log in to [App Store Connect](https://appstoreconnect.apple.com/) and create a new App using the App ID you registered.

### Step 2: Open and Configure Xcode
1. On a macOS machine, navigate to the iOS folder:
   ```bash
   cd mobile/ios
   ```
2. Run `pod install` to download dependencies.
3. Open the workspace file `GeoPulseAI.xcworkspace` in Xcode.
4. Select the project target in the left navigator, and click the **Signing & Capabilities** tab.
5. Check **Automatically manage signing**, select your Apple Developer Team, and ensure the **Bundle Identifier** matches your App Store Connect App ID.
6. Go to the **General** tab and set your **Version** (e.g., `1.0.0`) and **Build** number (e.g., `1`).

### Step 3: Generate the iOS Archive (IPA)
1. Select **Any iOS Device (arm64)** as the active scheme target in Xcode (not a simulator).
2. In the top Xcode menu, select **Product > Archive**.
3. Once the archive succeeds, the **Organizer** window will pop up.
4. Click **Distribute App** on the right sidebar.
5. Select **App Store Connect** -> **Upload**.
6. Follow the prompts (keep defaults for stripping symbols and signing) and click **Upload**.

### Step 4: Complete the Submission on App Store Connect
1. Go to [App Store Connect](https://appstoreconnect.apple.com/) -> **My Apps** -> Select your app.
2. If you want to distribute to internal/external beta testers, navigate to the **TestFlight** tab, select the build you uploaded, and add testers.
3. To publish to the App Store, navigate to **App Store > 1.0.0 Prepare for Submission**.
4. Add your App Screenshots (iPhone 6.5" and iPad sizes if applicable).
5. Enter description, keywords, support URL, and marketing URL.
6. Under **Build**, click the `+` button and select the build you uploaded from Xcode.
7. Fill in the **App Privacy** questionnaire, pricing details, and age ratings.
8. Click **Submit for Review** at the top right. Review times are usually 24–48 hours.

---

## ⚡ Premium Tip: Automate Everything with Fastlane

If you release updates regularly, manually running gradle builds and archiving Xcode projects is tedious. You can use [Fastlane](https://fastlane.tools/) to automate both pipelines.

1. Install Fastlane:
   ```bash
   # Using Homebrew (macOS)
   brew install fastlane
   ```
2. Initialize Fastlane in your `mobile/` directory:
   ```bash
   fastlane init
   ```
3. Set up a `Fastfile` to automate deployment. Example lane for Android:
   ```ruby
   lane :deploy_android do
     gradle(task: "clean bundleRelease")
     upload_to_play_store(track: "production")
   end
   ```
4. Example lane for iOS:
   ```ruby
   lane :deploy_ios do
     gym(scheme: "GeoPulseAI") # Compiles and signs the app
     deliver # Uploads to App Store Connect
   end
   ```
