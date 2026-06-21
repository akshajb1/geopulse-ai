"""
recommendation.py – GeoPulse AI
ML-powered interest-based place recommendation engine.

Pipeline:
  1. Load all users + their interactions from the database.
  2. Build feature vectors per user (one-hot interests + interaction counts per category).
  3. KMeans-cluster users into N groups of similar taste.
  4. For a target user → find their cluster → collect the most interacted places in that cluster.
  5. Return top-K place recommendations.

Analytics (pandas):
  - Most visited place types
  - User engagement trends over time
  - Popular categories
"""

import math
import logging
from typing import List, Dict, Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import MultiLabelBinarizer
from sqlalchemy.orm import Session

from database import User, Place, Interaction

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
ALL_INTERESTS = [
    "Cafe", "Restaurant", "Adventure", "Sports",
    "Music", "Nightlife", "Events"
]

N_CLUSTERS      = 5   # KMeans clusters
TOP_K           = 5   # Top recommendations to return
MIN_INTERACTIONS = 2  # Minimum interactions before ML kicks in


# ── Haversine distance (km) ────────────────────────────────────────────────────

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2   = math.radians(lat1), math.radians(lat2)
    dphi         = math.radians(lat2 - lat1)
    dlambda      = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return haversine_km(lat1, lon1, lat2, lon2) * 0.621371


# ── Feature vector builder ─────────────────────────────────────────────────────

def _build_user_features(users: List[User], interactions: List[Interaction], places: List[Place]) -> pd.DataFrame:
    """Return a DataFrame of shape (n_users, n_features) with user IDs as index."""
    mlb = MultiLabelBinarizer(classes=ALL_INTERESTS)

    interest_matrix = mlb.fit_transform([u.interests or [] for u in users])
    interest_df     = pd.DataFrame(interest_matrix, columns=ALL_INTERESTS, index=[u.id for u in users])

    # Map place_id → category
    place_cat = {p.id: p.category for p in places}

    # Count interactions per user per category
    inter_records = [
        {"user_id": i.user_id, "category": place_cat.get(i.place_id, "Unknown")}
        for i in interactions
    ]
    if inter_records:
        inter_df = (
            pd.DataFrame(inter_records)
            .groupby(["user_id", "category"])
            .size()
            .unstack(fill_value=0)
            .reindex(columns=ALL_INTERESTS, fill_value=0)
        )
    else:
        inter_df = pd.DataFrame(0, index=[u.id for u in users], columns=ALL_INTERESTS)

    inter_df = inter_df.reindex(interest_df.index, fill_value=0)

    # Combine: [interest_flags * 2] + [interaction_counts]  (weight interests more)
    combined = interest_df.values * 2 + inter_df.values
    return pd.DataFrame(combined, index=[u.id for u in users], columns=ALL_INTERESTS)


# ── Recommendation engine ──────────────────────────────────────────────────────

def get_recommendations(user_id: int, db: Session, latitude: float = None, longitude: float = None, top_k: int = TOP_K) -> List[Dict[str, Any]]:
    """
    Return top-K recommended Place objects for the given user.
    Falls back to interest-filtered popular places when data is sparse.
    Filters result to 50-mile radius if coordinates are provided.
    """
    users   = db.query(User).all()
    places  = db.query(Place).all()
    interactions = db.query(Interaction).all()

    if not users or not interactions:
        logger.info("Insufficient data – returning empty recommendations.")
        return []

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        return []

    # ── Build feature matrix ─────────────────────────────────────
    feature_df = _build_user_features(users, interactions, places)

    if feature_df.shape[0] < 2:
        return _fallback_recommendations(target_user, places, interactions, latitude, longitude, top_k)

    # ── KMeans clustering ────────────────────────────────────────
    n_clusters = min(N_CLUSTERS, feature_df.shape[0])
    kmeans     = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels     = kmeans.fit_predict(feature_df.values)

    user_index_map = {uid: idx for idx, uid in enumerate(feature_df.index)}
    if user_id not in user_index_map:
        return _fallback_recommendations(target_user, places, interactions, latitude, longitude, top_k)

    target_label    = labels[user_index_map[user_id]]
    cluster_user_ids = [
        list(feature_df.index)[i]
        for i, lbl in enumerate(labels)
        if lbl == target_label and list(feature_df.index)[i] != user_id
    ]

    # ── Collect cluster interactions ─────────────────────────────
    place_score: Dict[int, float] = {}
    for inter in interactions:
        if inter.user_id in cluster_user_ids:
            weight = {"visit": 3.0, "save": 2.0, "click": 1.0, "dismiss": -1.0}.get(inter.action_type, 1.0)
            place_score[inter.place_id] = place_score.get(inter.place_id, 0.0) + weight

    # Penalise places the user already interacted with
    already_seen = {i.place_id for i in interactions if i.user_id == user_id}
    for pid in already_seen:
        place_score[pid] = place_score.get(pid, 0.0) - 5.0

    place_map = {p.id: p for p in places}
    
    # Filter by distance if location is provided
    if latitude is not None and longitude is not None:
        filtered_scores = {}
        for pid, score in place_score.items():
            p = place_map.get(pid)
            if p:
                dist = haversine_miles(latitude, longitude, p.latitude, p.longitude)
                if dist <= 50.0:
                    filtered_scores[pid] = score
        place_score = filtered_scores

    sorted_places = sorted(place_score.items(), key=lambda x: x[1], reverse=True)

    results = []
    for pid, score in sorted_places[:top_k]:
        place = place_map.get(pid)
        if place:
            results.append(_place_to_dict(place, score))

    if len(results) < top_k:
        results += _fallback_recommendations(target_user, places, interactions, latitude, longitude, top_k - len(results), exclude={r["id"] for r in results})

    return results[:top_k]


def _fallback_recommendations(user: User, places: List[Place], interactions: List[Interaction],
                               latitude: float = None, longitude: float = None,
                               top_k: int = TOP_K, exclude: set = None) -> List[Dict[str, Any]]:
    """Return interest-filtered places ranked by overall interaction count, filtered by distance."""
    exclude = exclude or set()
    interests = set(user.interests or [])

    # Map category → interaction count
    cat_count: Dict[str, int] = {}
    for inter in interactions:
        pass  # tallied below

    place_inter_count: Dict[int, int] = {}
    for inter in interactions:
        place_inter_count[inter.place_id] = place_inter_count.get(inter.place_id, 0) + 1

    filtered = [
        p for p in places
        if p.id not in exclude and p.category in interests
    ]
    
    # Filter by distance if location provided
    if latitude is not None and longitude is not None:
        filtered = [
            p for p in filtered
            if haversine_miles(latitude, longitude, p.latitude, p.longitude) <= 50.0
        ]

    sorted_filtered = sorted(filtered, key=lambda p: (place_inter_count.get(p.id, 0), p.rating or 0), reverse=True)
    return [_place_to_dict(p, place_inter_count.get(p.id, 0)) for p in sorted_filtered[:top_k]]


def _place_to_dict(place: Place, score: float = 0.0) -> Dict[str, Any]:
    return {
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
        "recommendation_score": round(score, 2),
    }


# ── Pandas Analytics ───────────────────────────────────────────────────────────

def compute_analytics(db: Session) -> Dict[str, Any]:
    """
    Returns:
      - most_visited_types: top 5 place categories by interaction count
      - engagement_trend:   daily active interactions over the last 30 days
      - popular_categories: category → avg rating
    """
    interactions = db.query(Interaction).all()
    places       = db.query(Place).all()

    if not interactions or not places:
        return {
            "most_visited_types":  [],
            "engagement_trend":    [],
            "popular_categories":  [],
        }

    place_df = pd.DataFrame([{
        "id":       p.id,
        "category": p.category,
        "rating":   p.rating or 0,
    } for p in places]).set_index("id")

    inter_df = pd.DataFrame([{
        "place_id":  i.place_id,
        "action":    i.action_type,
        "timestamp": i.timestamp,
    } for i in interactions])

    inter_df = inter_df.join(place_df, on="place_id", how="left")
    inter_df["timestamp"] = pd.to_datetime(inter_df["timestamp"])

    # 1. Most visited place types
    most_visited = (
        inter_df.groupby("category")
        .size()
        .reset_index(name="interaction_count")
        .sort_values("interaction_count", ascending=False)
        .head(5)
        .to_dict(orient="records")
    )

    # 2. Engagement trend (daily, last 30 days)
    inter_df["date"] = inter_df["timestamp"].dt.date
    trend = (
        inter_df.groupby("date")
        .size()
        .reset_index(name="interactions")
        .sort_values("date")
        .tail(30)
    )
    trend["date"] = trend["date"].astype(str)
    engagement_trend = trend.to_dict(orient="records")

    # 3. Popular categories (avg rating)
    popular_cats = (
        inter_df.groupby("category")["rating"]
        .mean()
        .reset_index(name="avg_rating")
        .sort_values("avg_rating", ascending=False)
        .to_dict(orient="records")
    )

    return {
        "most_visited_types": most_visited,
        "engagement_trend":   engagement_trend,
        "popular_categories": popular_cats,
    }
