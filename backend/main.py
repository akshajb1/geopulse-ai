"""
main.py – GeoPulse AI Backend
FastAPI application with all API endpoints.
"""

import os
import math
import logging
from datetime import datetime, timedelta
from typing import List, Optional

import httpx
from fastapi import FastAPI, Depends, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from database import get_db, create_tables, User, Place, Interaction
from recommendation import get_recommendations, compute_analytics, haversine_miles

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────────
GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "")
NEARBY_SEARCH_RADIUS_METERS = 40_234   # 25 miles in meters
CACHE_TTL_HOURS = 2                    # Re-fetch from Google after 2 hours

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="GeoPulse AI API",
    description="Interest-based location discovery powered by ML",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    create_tables()


# ── Pydantic Schemas ───────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    device_id:  str              = Field(..., description="Unique device identifier")
    name:       Optional[str]    = Field(None, description="Display name")
    interests:  List[str]        = Field(..., description="List of interest categories")
    latitude:   Optional[float]  = Field(None, description="Current latitude")
    longitude:  Optional[float]  = Field(None, description="Current longitude")
    push_token: Optional[str]    = Field(None, description="Push notification token")


class UpdateLocationRequest(BaseModel):
    user_id:   int
    latitude:  float
    longitude: float


class InteractionRequest(BaseModel):
    user_id:     int
    place_id:    int
    action_type: str = Field(..., description="click | visit | save | dismiss")


class PlaceResponse(BaseModel):
    id:              int
    google_place_id: str
    name:            str
    category:        str
    address:         Optional[str]
    latitude:        float
    longitude:       float
    rating:          Optional[float]
    photo_url:       Optional[str]
    is_open:         Optional[bool]
    distance_miles:  Optional[float]

    class Config:
        from_attributes = True


# ── Google Places helper ───────────────────────────────────────────────────────

INTEREST_TO_GOOGLE_TYPE = {
    "Cafe":       "cafe",
    "Restaurant": "restaurant",
    "Adventure":  "park",
    "Sports":     "gym",
    "Music":      "night_club",
    "Nightlife":  "bar",
    "Events":     "tourist_attraction",
}

# Primary Google types that mean the place is fundamentally something else
# (a hotel, museum, store…) even if it happens to contain a cafe/restaurant.
# Used to stop those from being mis-recommended as a food/venue result.
# None of our searched types appear here, so real matches are never dropped.
NON_DESTINATION_PRIMARY = {
    "lodging", "museum", "hospital", "school", "university", "stadium",
    "airport", "spa", "shopping_mall", "store", "supermarket", "gas_station",
}


async def fetch_google_places(lat: float, lng: float, place_type: str) -> list:
    """Query the Google Places Nearby Search API and return raw results."""
    if not GOOGLE_PLACES_API_KEY:
        logger.warning("No GOOGLE_PLACES_API_KEY set – skipping Google Places fetch.")
        return []

    url    = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
    params = {
        "location": f"{lat},{lng}",
        "radius":   NEARBY_SEARCH_RADIUS_METERS,
        "type":     place_type,
        "key":      GOOGLE_PLACES_API_KEY,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            data     = response.json()
            return data.get("results", [])
    except Exception as exc:
        logger.error("Google Places API error: %s", exc)
        return []


def get_photo_url(photo_reference: str) -> str:
    return (
        f"https://maps.googleapis.com/maps/api/place/photo"
        f"?maxwidth=400&photoreference={photo_reference}&key={GOOGLE_PLACES_API_KEY}"
    )


def upsert_place(db: Session, raw: dict, category: str) -> Place:
    """Upsert a Google Places result into the local DB."""
    google_place_id = raw.get("place_id", "")
    existing = db.query(Place).filter(Place.google_place_id == google_place_id).first()

    photo_url = None
    photos    = raw.get("photos", [])
    if photos:
        photo_url = get_photo_url(photos[0].get("photo_reference", ""))

    loc = raw.get("geometry", {}).get("location", {})
    lat = loc.get("lat", 0.0)
    lng = loc.get("lng", 0.0)

    if existing:
        # Refresh cache
        existing.name      = raw.get("name", existing.name)
        existing.address   = raw.get("vicinity", existing.address)
        existing.rating    = raw.get("rating")
        existing.photo_url = photo_url
        existing.is_open   = raw.get("opening_hours", {}).get("open_now")
        existing.cached_at = datetime.utcnow()
        db.commit()
        return existing
    else:
        place = Place(
            google_place_id = google_place_id,
            name            = raw.get("name", "Unknown"),
            category        = category,
            address         = raw.get("vicinity"),
            latitude        = lat,
            longitude       = lng,
            rating          = raw.get("rating"),
            photo_url       = photo_url,
            is_open         = raw.get("opening_hours", {}).get("open_now"),
        )
        db.add(place)
        db.commit()
        db.refresh(place)
        return place


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "GeoPulse AI API", "version": "1.0.0"}


# ---------------------------------------------------------------------------- #
#  POST /user – Create or update a user
# ---------------------------------------------------------------------------- #
@app.post("/user", tags=["Users"], summary="Create or update a user")
def create_or_update_user(payload: CreateUserRequest, db: Session = Depends(get_db)):
    """
    Create a new user or update an existing one (matched by device_id).

    Example request body:
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
    """
    user = db.query(User).filter(User.device_id == payload.device_id).first()

    if user:
        user.interests  = payload.interests
        user.latitude   = payload.latitude
        user.longitude  = payload.longitude
        user.push_token = payload.push_token
        if payload.name:
            user.name   = payload.name
        user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        return {"message": "User updated", "user_id": user.id}
    else:
        new_user = User(
            device_id  = payload.device_id,
            name       = payload.name,
            interests  = payload.interests,
            latitude   = payload.latitude,
            longitude  = payload.longitude,
            push_token = payload.push_token,
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return {"message": "User created", "user_id": new_user.id}


# ---------------------------------------------------------------------------- #
#  POST /update-location
# ---------------------------------------------------------------------------- #
MOVEMENT_THRESHOLD_MILES = 5.0  # Invalidate cache when user has moved this far

@app.post("/update-location", tags=["Users"], summary="Update user's current location")
def update_location(payload: UpdateLocationRequest, db: Session = Depends(get_db)):
    """
    Update the GPS location for a given user.

    If the user has moved more than 5 miles from where we last fetched places,
    the cached places are purged so the next /nearby-places call fetches fresh
    results from Google. This ensures moving users (e.g. on a highway) always
    see relevant places, not stale ones from 50 km ago.
    """
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    cache_invalidated = False
    # ── Check if user has moved far enough to need fresh place data ──────────
    if user.last_fetch_lat is not None and user.last_fetch_lng is not None:
        distance_moved = haversine_miles(
            user.last_fetch_lat, user.last_fetch_lng,
            payload.latitude, payload.longitude,
        )
        if distance_moved > MOVEMENT_THRESHOLD_MILES:
            logger.info(
                "User %s moved %.2f miles — invalidating place cache.",
                payload.user_id, distance_moved,
            )
            # Delete places cached more than 1 minute ago (keep very recent ones)
            cutoff = datetime.utcnow() - timedelta(minutes=1)
            deleted = db.query(Place).filter(Place.cached_at < cutoff).delete()
            logger.info("Purged %d stale cached places.", deleted)
            # Reset the fetch anchor so it updates on the next /nearby-places call
            user.last_fetch_lat = None
            user.last_fetch_lng = None
            cache_invalidated = True

    user.latitude   = payload.latitude
    user.longitude  = payload.longitude
    user.updated_at = datetime.utcnow()
    db.commit()
    return {
        "message": "Location updated",
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "cache_invalidated": cache_invalidated,
    }


# ---------------------------------------------------------------------------- #
#  GET /nearby-places
# ---------------------------------------------------------------------------- #
@app.get("/nearby-places", tags=["Places"], summary="Get nearby places matching user interests")
async def get_nearby_places(
    user_id:   int   = Query(..., description="User ID"),
    latitude:  float = Query(..., description="Current latitude"),
    longitude: float = Query(..., description="Current longitude"),
    db: Session = Depends(get_db),
):
    """
    Returns places within 25 miles of the given location that match the user's interests.
    Results are cached in the database (TTL = 2 hours).

    Example response:
    ```json
    {
      "places": [
        {
          "id": 1,
          "name": "Blue Bottle Coffee",
          "category": "Cafe",
          "distance_miles": 0.42,
          "latitude": 37.7751,
          "longitude": -122.4137,
          "rating": 4.5,
          "is_open": true
        }
      ],
      "total": 1
    }
    ```
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    interests = user.interests or []
    if not interests:
        return {"places": [], "total": 0, "message": "No interests set for user"}

    # ── Serve from cache if fresh ──────────────────────────────────────────
    cache_cutoff = datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS)
    cached_places = (
        db.query(Place)
        .filter(Place.cached_at > cache_cutoff, Place.category.in_(interests))
        .all()
    )

    if cached_places:
        results = _filter_and_sort_places(cached_places, latitude, longitude)
        # Only trust the cache if it actually has places NEAR this location.
        # Otherwise the cache is for a different area (e.g. a previous city) and
        # we must fetch fresh results for where the user actually is.
        if results:
            return {"places": results, "total": len(results), "source": "cache"}

    # ── Fetch fresh from Google Places ─────────────────────────────────────
    all_places: List[Place] = []
    for interest in interests:
        google_type = INTEREST_TO_GOOGLE_TYPE.get(interest, "point_of_interest")
        raw_results = await fetch_google_places(latitude, longitude, google_type)
        for raw in raw_results:
            # Google returns several `types` per place (a museum-with-a-cafe is
            # ['museum','cafe',...]; a hotel-with-a-restaurant is ['lodging',...]).
            # Keep a place only if it's actually tagged the type we searched AND
            # its PRIMARY type isn't a fundamentally different kind of venue — so a
            # museum/hotel/store never gets recommended as a cafe or restaurant.
            raw_types = raw.get("types", [])
            if google_type != "point_of_interest":
                primary = raw_types[0] if raw_types else ""
                if google_type not in raw_types or primary in NON_DESTINATION_PRIMARY:
                    continue
            place = upsert_place(db, raw, interest)
            all_places.append(place)

    # ── Stamp the location of this fetch on the user object ─────────────────
    # This is the reference point used by /update-location to detect movement.
    user.last_fetch_lat = latitude
    user.last_fetch_lng = longitude
    db.commit()

    results = _filter_and_sort_places(all_places, latitude, longitude)
    return {"places": results, "total": len(results), "source": "google_api"}


def _filter_and_sort_places(places: List[Place], user_lat: float, user_lng: float) -> list:
    """Filter to 25 miles, calculate distance, sort by distance."""
    result = []
    seen   = set()
    for place in places:
        if place.id in seen:
            continue
        seen.add(place.id)
        dist = haversine_miles(user_lat, user_lng, place.latitude, place.longitude)
        if dist <= 25.0:
            result.append({
                "id":              place.id,
                "google_place_id": place.google_place_id,
                "name":            place.name,
                "category":        place.category,
                "address":         place.address,
                "latitude":        place.latitude,
                "longitude":       place.longitude,
                "rating":          place.rating,
                "photo_url":       place.photo_url,
                "is_open":         place.is_open,
                "distance_miles":  round(dist, 2),
            })
    return sorted(result, key=lambda x: x["distance_miles"])


# ---------------------------------------------------------------------------- #
#  POST /interaction
# ---------------------------------------------------------------------------- #
@app.post("/interaction", tags=["Interactions"], summary="Record a user interaction with a place")
def record_interaction(payload: InteractionRequest, db: Session = Depends(get_db)):
    """
    Record a user interaction (click, visit, save, dismiss) with a place.
    This data feeds the ML recommendation engine.

    Example request body:
    ```json
    {
      "user_id": 1,
      "place_id": 42,
      "action_type": "visit"
    }
    ```
    """
    valid_actions = {"click", "visit", "save", "dismiss"}
    if payload.action_type not in valid_actions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid action_type. Must be one of: {valid_actions}",
        )

    user  = db.query(User).filter(User.id == payload.user_id).first()
    place = db.query(Place).filter(Place.id == payload.place_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    interaction = Interaction(
        user_id     = payload.user_id,
        place_id    = payload.place_id,
        action_type = payload.action_type,
    )
    db.add(interaction)
    db.commit()
    return {"message": "Interaction recorded", "action": payload.action_type, "place": place.name}


# ---------------------------------------------------------------------------- #
#  GET /recommendations/{user_id}
# ---------------------------------------------------------------------------- #
@app.get("/recommendations/{user_id}", tags=["Recommendations"], summary="Get ML-powered place recommendations")
def get_user_recommendations(
    user_id: int, 
    latitude: float = Query(None, description="Current latitude"),
    longitude: float = Query(None, description="Current longitude"),
    db: Session = Depends(get_db)
):
    """
    Returns top-5 ML-powered place recommendations using KMeans user clustering.
    Falls back to interest-filtered popular places when data is sparse.
    If latitude/longitude provided, filters Results to 50 miles.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    recs = get_recommendations(user_id=user_id, db=db, latitude=latitude, longitude=longitude)
    return {"user_id": user_id, "recommendations": recs, "count": len(recs)}


# ---------------------------------------------------------------------------- #
#  GET /analytics
# ---------------------------------------------------------------------------- #
@app.get("/analytics", tags=["Analytics"], summary="Get aggregated usage analytics")
def get_analytics(db: Session = Depends(get_db)):
    """
    Returns pandas-computed analytics:
    - Most visited place types
    - User engagement trend (daily, last 30 days)
    - Popular categories by average rating
    """
    return compute_analytics(db)


# ---------------------------------------------------------------------------- #
#  GET /users/{user_id}
# ---------------------------------------------------------------------------- #
@app.get("/users/{user_id}", tags=["Users"], summary="Get user profile")
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id":         user.id,
        "device_id":  user.device_id,
        "name":       user.name,
        "interests":  user.interests,
        "latitude":   user.latitude,
        "longitude":  user.longitude,
        "created_at": user.created_at,
    }
