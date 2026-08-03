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

# How strongly each action signals (dis)interest in a place's category.
ACTION_WEIGHTS = {"visit": 3.0, "save": 2.0, "click": 1.0, "dismiss": -1.0}


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
    Return top-K recommended places for the given user, ranked by how well each
    place matches the user's *own demonstrated tastes*.

    Signal, in priority order:
      1. Content-based category affinity — the user's onboarding interests plus
         the weighted actions they've taken (visit/save/click/dismiss) tell us
         which categories they actually engage with.
      2. Collaborative boost — when other users exist, KMeans clusters like-minded
         users and boosts places their cluster-mates liked.
      3. Place quality — Google rating as a tie-breaker.

    Already-visited places are excluded (this is a discovery feed). Results are
    limited to a 50-mile radius when coordinates are provided. Each result carries
    a 0–100 ``match_score`` reflecting the affinity above.
    """
    users        = db.query(User).all()
    places       = db.query(Place).all()
    interactions = db.query(Interaction).all()

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        return []

    place_map = {p.id: p for p in places}

    # 1. Content-based: how much does THIS user like each category?
    affinity = _category_affinity(target_user, interactions, place_map)
    max_aff  = max([v for v in affinity.values() if v > 0], default=1.0)

    # 2. Collaborative: places liked by like-minded users (empty when no peers).
    peer_boost = _collaborative_boost(user_id, users, interactions, places)

    # 3. Never recommend a place the user has already interacted with.
    already_seen = {i.place_id for i in interactions if i.user_id == user_id}

    scored = []
    for p in places:
        if p.id in already_seen:
            continue

        # Distance: hard-filter at 50mi, and keep a proximity signal (1 near → 0 far).
        proximity = 1.0
        if latitude is not None and longitude is not None:
            dist = haversine_miles(latitude, longitude, p.latitude, p.longitude)
            if dist > 50.0:
                continue
            proximity = max(0.0, 1.0 - dist / 50.0)

        cat_aff     = affinity.get(p.category, 0.0)
        aff_norm    = max(0.0, cat_aff / max_aff) if max_aff > 0 else 0.0     # 0..1 taste fit
        rating      = p.rating if p.rating is not None else 3.5
        # Spread ratings: map 3.0–5.0 → 0–1 so "good" and "great" actually differ.
        rating_norm = max(0.0, min(1.0, (rating - 3.0) / 2.0))

        # Ranking: taste leads, but proximity is weighted strongly (this is a
        # "near me" discovery app) — a close spot beats a far one of similar taste.
        score = aff_norm * 3.0 + proximity * 2.5 + rating_norm * 1.2 + peer_boost.get(p.id, 0.0) * 0.5

        # 0–100 match with genuine spread: taste 50%, closeness 30%, quality 20%.
        match = 100.0 * (0.50 * aff_norm + 0.30 * proximity + 0.20 * rating_norm)
        match = max(35.0, min(99.0, match))

        scored.append((p, score, match))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [_place_to_dict(p, score, match) for p, score, match in scored[:top_k]]


def _category_affinity(user: User, interactions: List[Interaction],
                       place_map: Dict[int, Place]) -> Dict[str, float]:
    """Score every interest category by the user's stated + behavioural affinity."""
    affinity = {c: 0.0 for c in ALL_INTERESTS}
    # Stated preference: onboarding interests give a baseline.
    for c in (user.interests or []):
        if c in affinity:
            affinity[c] += 2.0
    # Revealed preference: the user's own actions on places in each category.
    for i in interactions:
        if i.user_id == user.id:
            p = place_map.get(i.place_id)
            if p and p.category in affinity:
                affinity[p.category] += ACTION_WEIGHTS.get(i.action_type, 1.0)
    return affinity


def _collaborative_boost(user_id: int, users: List[User],
                         interactions: List[Interaction], places: List[Place]) -> Dict[int, float]:
    """KMeans-cluster users and return per-place score boosts from cluster-mates.

    Returns an empty dict when there aren't enough users/interactions to cluster,
    so the content-based signal cleanly stands alone for a single user.
    """
    if len(users) < 2 or not interactions:
        return {}
    try:
        feature_df = _build_user_features(users, interactions, places)
        if feature_df.shape[0] < 2 or user_id not in set(feature_df.index):
            return {}

        n_clusters = min(N_CLUSTERS, feature_df.shape[0])
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(feature_df.values)

        index_list   = list(feature_df.index)
        target_label = labels[index_list.index(user_id)]
        peers = {
            uid for uid, lbl in zip(index_list, labels)
            if lbl == target_label and uid != user_id
        }

        boost: Dict[int, float] = {}
        for i in interactions:
            if i.user_id in peers:
                boost[i.place_id] = boost.get(i.place_id, 0.0) + ACTION_WEIGHTS.get(i.action_type, 1.0)
        return boost
    except Exception as exc:  # clustering is best-effort; never break recs over it
        logger.warning("Collaborative boost skipped: %s", exc)
        return {}


def _place_to_dict(place: Place, score: float = 0.0, match: float = None) -> Dict[str, Any]:
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
        "match_score":     round(match) if match is not None else None,
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
