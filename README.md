# GeoPulse AI 🗺️

> **Interest-Based Location Discovery App** — powered by FastAPI, React Native, Google Maps, and ML recommendations.

## Project Structure

```
geopulse-ai/
├── backend/
│   ├── main.py              # FastAPI app + all endpoints
│   ├── database.py          # SQLAlchemy models (User, Place, Interaction)
│   ├── recommendation.py    # ML engine (KMeans clustering + pandas analytics)
│   ├── requirements.txt
│   └── .env.example
├── mobile/
│   ├── App.js               # Navigation root
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── screens/
│       │   ├── OnboardingScreen.js
│       │   ├── HomeMapScreen.js
│       │   ├── DiscoveryFeed.js
│       │   ├── NotificationsScreen.js
│       │   └── ProfileScreen.js
│       └── utils/
│           ├── api.js
│           ├── location.js
│           └── theme.js
└── schema.sql               # Raw PostgreSQL schema
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| PostgreSQL | 14+ |
| Android Studio / Xcode | Latest |
| Google Cloud account | For API keys |

---

## 🔑 Google API Keys

You need **two** keys from [Google Cloud Console](https://console.cloud.google.com/):

1. **Google Places API** – enable `Places API`
2. **Google Maps SDK** – enable `Maps SDK for Android` + `Maps SDK for iOS`

---

## 🐍 Backend Setup

### 1. Create the database

```bash
psql -U postgres -c "CREATE DATABASE geopulse;"
psql -U postgres -d geopulse -f schema.sql
```

### 2. Configure environment

```bash
cd geopulse-ai/backend
cp .env.example .env
# Edit .env and fill in your DATABASE_URL and GOOGLE_PLACES_API_KEY
```

### 3. Install dependencies and run

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be live at `http://localhost:8000`
Interactive docs: `http://localhost:8000/docs`

---

## 📱 Mobile App Setup

### 1. Configure environment

```bash
cd geopulse-ai/mobile
cp .env.example .env
# Edit .env and fill in your GOOGLE_MAPS_API_KEY
```

### 2. Add Google Maps keys

**Android** – `android/app/src/main/AndroidManifest.xml`:
```xml
<meta-data
  android:name="com.google.android.geo.API_KEY"
  android:value="YOUR_GOOGLE_MAPS_API_KEY" />
```

**iOS** – `ios/GeoPulseAI/AppDelegate.mm`:
```objc
#import <GoogleMaps/GoogleMaps.h>
[GMSServices provideAPIKey:@"YOUR_GOOGLE_MAPS_API_KEY"];
```

### 3. Install dependencies

```bash
npm install

# iOS only (macOS required)
cd ios && pod install && cd ..
```

### 4. Run the app

```bash
# Android
npm run android

# iOS
npm run ios
```

> **Physical device**: Change `API_BASE_URL` in `mobile/src/utils/api.js` from `10.0.2.2` to your machine's local IP address (e.g., `192.168.1.x`).

---

## 🌐 API Endpoints

### `POST /user`
Create or update a user profile.

**Request:**
```json
{
  "device_id": "device-abc-123",
  "name": "Alex",
  "interests": ["Cafe", "Music", "Nightlife"],
  "latitude": 37.7749,
  "longitude": -122.4194,
  "push_token": "ExponentPushToken[xxxx]"
}
```

**Response:**
```json
{ "message": "User created", "user_id": 1 }
```

---

### `POST /update-location`
Update user's current GPS coordinates.

**Request:**
```json
{ "user_id": 1, "latitude": 37.7800, "longitude": -122.4100 }
```

**Response:**
```json
{ "message": "Location updated", "latitude": 37.78, "longitude": -122.41 }
```

---

### `GET /nearby-places?user_id=1&latitude=37.77&longitude=-122.41`
Returns places within 25 miles matching user interests (cached for 2 hours).

**Response:**
```json
{
  "places": [
    {
      "id": 12,
      "name": "Blue Bottle Coffee",
      "category": "Cafe",
      "address": "66 Mint St, San Francisco",
      "latitude": 37.7751,
      "longitude": -122.4137,
      "rating": 4.5,
      "is_open": true,
      "distance_miles": 0.42,
      "photo_url": "https://maps.googleapis.com/..."
    }
  ],
  "total": 1,
  "source": "cache"
}
```

---

### `POST /interaction`
Record a user interaction with a place.

**Request:**
```json
{ "user_id": 1, "place_id": 12, "action_type": "visit" }
```

**action_type** options: `click`, `visit`, `save`, `dismiss`

**Response:**
```json
{ "message": "Interaction recorded", "action": "visit", "place": "Blue Bottle Coffee" }
```

---

### `GET /recommendations/1`
Get top-5 ML-powered place recommendations for user #1.

**Response:**
```json
{
  "user_id": 1,
  "recommendations": [
    {
      "id": 8,
      "name": "The Jazz House",
      "category": "Music",
      "rating": 4.7,
      "recommendation_score": 6.5
    }
  ],
  "count": 5
}
```

---

### `GET /analytics`
Returns pandas-computed analytics.

**Response:**
```json
{
  "most_visited_types": [
    { "category": "Cafe", "interaction_count": 24 }
  ],
  "engagement_trend": [
    { "date": "2026-03-14", "interactions": 12 }
  ],
  "popular_categories": [
    { "category": "Restaurant", "avg_rating": 4.6 }
  ]
}
```

---

## 🤖 ML Recommendation Engine

The engine in `recommendation.py` follows this pipeline:

```
User interests + interactions
        ↓
One-hot interest features + interaction count features
        ↓
KMeans clustering (N=5 clusters)
        ↓
Find user's cluster → aggregate cluster interactions
        ↓
Score places (visit=3, save=2, click=1, dismiss=-1)
        ↓
Top-5 recommended places
```

**Fallback**: When interaction data is sparse, returns interest-filtered places ranked by overall popularity.

---

## ✨ App Features

| Feature | Detail |
|---------|--------|
| Onboarding | Animated interest chip selector |
| Map view | Dark Google Maps with animated emoji markers + 25mi radius |
| Marker callouts | Place name, category, distance, rating |
| ML Recommendations | AI picks panel on map + feed |
| Discovery feed | Filterable, sortable place cards with save/visit |
| Notifications | Push notification setup + local alerts + persistence |
| Profile | Editable interests + analytics bar charts |
| Caching | Nearby places cached in DB (2-hour TTL) |
| Distance | Haversine-accurate distance in miles |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native 0.73 (non-Expo) |
| Navigation | React Navigation 6 (Stack + Bottom Tabs) |
| Maps | react-native-maps (Google Maps SDK) |
| HTTP | Axios |
| Storage | AsyncStorage |
| Push | react-native-push-notification |
| Backend | Python FastAPI |
| Database | PostgreSQL + SQLAlchemy |
| ML | scikit-learn (KMeans) |
| Analytics | pandas |
| External API | Google Places API |

---

## 🚀 Pushing to GitHub

To publish this project to your own GitHub account:

1. **GitHub Push Guide**: For detailed, step-by-step instructions (including troubleshooting and using GitHub CLI), refer to the [GITHUB_PUSH_GUIDE.md](GITHUB_PUSH_GUIDE.md).
2. **Quick Start Commands**:
   ```bash
   # 1. Initialize git and commit
   git init
   git add .
   git commit -m "Initial commit: GeoPulse AI complete repository"
   git branch -M main

   # 2. Add your GitHub remote URL and push
   git remote add origin https://github.com/YOUR_USERNAME/geopulse-ai.git
   git push -u origin main
   ```

---

## 📦 App Store & Play Store Deployment

To build release packages and submit the React Native application to the Apple App Store and Google Play Store:

*   **Mobile Publishing Guide**: Refer to the comprehensive, step-by-step guide in [PUBLISHING_GUIDE.md](PUBLISHING_GUIDE.md) to generate Android App Bundles (`.aab`) and iOS App Store packages (`.ipa`), configure signing certificates, and submit builds for review.


