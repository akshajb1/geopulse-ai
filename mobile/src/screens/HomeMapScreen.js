/**
 * screens/HomeMapScreen.js – GeoPulse AI
 * Google Map with user location, animated place markers, and 25-mile radius.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, ActivityIndicator, Platform,
} from 'react-native';
import MapView, { Marker, Circle, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, INTEREST_META, SHADOWS } from '../utils/theme';
import { getNearbyPlaces, getRecommendations, recordInteraction } from '../utils/api';
import { getCurrentPosition, requestLocationPermission, getDistanceMiles, formatDistance, watchPosition } from '../utils/location';

const { width, height } = Dimensions.get('window');
const MILES_25_IN_METERS = 40234;

// ─────────────────────────────────────────────────────────────────────────────

export default function HomeMapScreen() {
  const mapRef = useRef(null);

  const [userId,    setUserId]    = useState(null);
  const [userLoc,   setUserLoc]   = useState(null);
  const [places,    setPlaces]    = useState([]);
  const [recs,      setRecs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [showRecs,  setShowRecs]  = useState(false);

  // Pulse animation for user marker
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  // Per-marker scale animations
  const markerAnims = useRef({});

  useEffect(() => {
    startPulse();
    init();

    // Watch position in background
    let watchId = null;
    const startWatching = async () => {
      const granted = await requestLocationPermission();
      if (!granted) return;

      watchId = watchPosition(async (pos) => {
        setUserLoc(pos);
        // Sync with backend
        try {
          const res = await updateLocation(userId || 0, pos.latitude, pos.longitude);
          if (res.cache_invalidated) {
             console.log('📍 Location changed significantly, refreshing data...');
             loadNearbyPlaces(userId, pos.latitude, pos.longitude);
             loadRecommendations(userId, pos.latitude, pos.longitude);
          }
        } catch (err) {
          console.warn('Location sync error:', err);
        }
      });
    };

    if (userId !== null) {
      startWatching();
    }

    return () => {
      if (watchId !== null) {
        import('@react-native-community/geolocation').then(Geo => {
          Geo.default.clearWatch(watchId);
        });
      }
    };
  }, [userId]);

  const startPulse = () => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim,    { toValue: 1.5, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim,    { toValue: 1.0, duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, { toValue: 0.0, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        ]),
      ])
    ).start();
  };

  const getMarkerAnim = (placeId) => {
    if (!markerAnims.current[placeId]) {
      markerAnims.current[placeId] = new Animated.Value(0);
    }
    return markerAnims.current[placeId];
  };

  const animateMarkerIn = (placeId, delay = 0) => {
    Animated.spring(getMarkerAnim(placeId), {
      toValue: 1, delay, useNativeDriver: true, tension: 80, friction: 7,
    }).start();
  };

  const init = async () => {
    try {
      const uid = await AsyncStorage.getItem('user_id');
      setUserId(uid);

      await requestLocationPermission();
      const pos = await getCurrentPosition();
      setUserLoc(pos);

      await Promise.all([
        loadNearbyPlaces(uid, pos.latitude, pos.longitude),
        loadRecommendations(uid, pos.latitude, pos.longitude),
      ]);
    } catch (err) {
      console.warn('HomeMap init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadNearbyPlaces = async (uid, lat, lng) => {
    try {
      const data = await getNearbyPlaces(uid, lat, lng);
      const list = data.places || [];
      setPlaces(list);
      list.forEach((p, idx) => animateMarkerIn(p.id, idx * 80));
    } catch (err) {
      console.warn('Nearby places error:', err);
    }
  };

  const loadRecommendations = async (uid, lat, lng) => {
    try {
      const data = await getRecommendations(uid, lat, lng);
      setRecs(data.recommendations || []);
    } catch {/* sparse data – no-op */}
  };

  const handleMarkerPress = useCallback(async (place) => {
    setSelected(place);
    if (userId) {
      try { await recordInteraction(userId, place.id, 'click'); } catch {}
    }
    // Bounce animation
    const anim = getMarkerAnim(place.id);
    Animated.sequence([
      Animated.timing(anim, { toValue: 1.3, duration: 150, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1.0, duration: 150, useNativeDriver: true }),
    ]).start();
  }, [userId]);

  const centerOnUser = () => {
    if (userLoc && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude:       userLoc.latitude,
        longitude:      userLoc.longitude,
        latitudeDelta:  0.05,
        longitudeDelta: 0.05,
      }, 600);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0A0E1A', '#162035']} style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Finding places near you…</Text>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={{
          latitude:       userLoc?.latitude  || 37.7749,
          longitude:      userLoc?.longitude || -122.4194,
          latitudeDelta:  0.12,
          longitudeDelta: 0.12,
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
      >
        {/* 25 mile radius */}
        {userLoc && (
          <Circle
            center={{ latitude: userLoc.latitude, longitude: userLoc.longitude }}
            radius={MILES_25_IN_METERS}
            fillColor="rgba(108,99,255,0.07)"
            strokeColor="rgba(108,99,255,0.3)"
            strokeWidth={1.5}
          />
        )}

        {/* User location marker */}
        {userLoc && (
          <Marker coordinate={{ latitude: userLoc.latitude, longitude: userLoc.longitude }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.userDotWrapper}>
              <Animated.View style={[styles.userPulse, { transform: [{ scale: pulseAnim }], opacity: pulseOpacity }]} />
              <View style={styles.userDot} />
            </View>
          </Marker>
        )}

        {/* Place markers */}
        {places.map((place) => {
          const meta  = INTEREST_META[place.category] || { color: COLORS.primary, emoji: '📍' };
          const anim  = getMarkerAnim(place.id);
          const dist  = userLoc ? getDistanceMiles(userLoc.latitude, userLoc.longitude, place.latitude, place.longitude) : null;
          return (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.latitude, longitude: place.longitude }}
              onPress={() => handleMarkerPress(place)}
              anchor={{ x: 0.5, y: 1 }}
            >
              <Animated.View style={{ transform: [{ scale: anim }] }}>
                <View style={[styles.markerBubble, { backgroundColor: meta.color }]}>
                  <Text style={styles.markerEmoji}>{meta.emoji}</Text>
                </View>
                <View style={[styles.markerTail, { borderTopColor: meta.color }]} />
              </Animated.View>
              <Callout tooltip style={styles.calloutWrapper}>
                <View style={styles.callout}>
                  <Text style={styles.calloutName} numberOfLines={1}>{place.name}</Text>
                  <View style={styles.calloutRow}>
                    <View style={[styles.calloutBadge, { backgroundColor: `${meta.color}33` }]}>
                      <Text style={[styles.calloutBadgeText, { color: meta.color }]}>{place.category}</Text>
                    </View>
                    {dist !== null && (
                      <Text style={styles.calloutDist}>{formatDistance(dist)}</Text>
                    )}
                  </View>
                  {place.rating && (
                    <View style={styles.calloutRow}>
                      <Icon name="star" size={12} color={COLORS.accentGold} />
                      <Text style={styles.calloutRating}>{place.rating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      {/* Header overlay */}
      <SafeAreaView pointerEvents="box-none">
        <View style={styles.header}>
          <LinearGradient colors={['#6C63FF', '#4A42CC']} style={styles.headerBadge}>
            <Icon name="map-marker-radius" size={16} color="#fff" />
          </LinearGradient>
          <Text style={styles.headerTitle}>GeoPulse AI</Text>
          <TouchableOpacity onPress={() => setShowRecs(!showRecs)} style={styles.recBtn}>
            <Icon name="star-shooting" size={20} color={COLORS.accentGold} />
          </TouchableOpacity>
        </View>

        {/* Stats bar */}
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <Icon name="map-marker-multiple" size={14} color={COLORS.primary} />
            <Text style={styles.statText}>{places.length} nearby</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Icon name="radius" size={14} color={COLORS.accentGreen} />
            <Text style={styles.statText}>25 mi radius</Text>
          </View>
          {recs.length > 0 && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Icon name="star" size={14} color={COLORS.accentGold} />
                <Text style={styles.statText}>{recs.length} for you</Text>
              </View>
            </>
          )}
        </View>

        {/* Recommendations overlay */}
        {showRecs && recs.length > 0 && (
          <View style={styles.recPanel}>
            <Text style={styles.recPanelTitle}>🤖 AI Picks For You</Text>
            {recs.map(rec => {
              const meta = INTEREST_META[rec.category] || { emoji: '📍', color: COLORS.primary };
              return (
                <View key={rec.id} style={styles.recItem}>
                  <Text style={styles.recEmoji}>{meta.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recName} numberOfLines={1}>{rec.name}</Text>
                    <Text style={styles.recCat}>{rec.category}</Text>
                  </View>
                  {rec.rating && (
                    <View style={styles.recRating}>
                      <Icon name="star" size={11} color={COLORS.accentGold} />
                      <Text style={styles.recRatingText}>{rec.rating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </SafeAreaView>

      {/* FABs */}
      <View style={styles.fabContainer}>
        <TouchableOpacity onPress={centerOnUser} style={styles.fab}>
          <LinearGradient colors={['#6C63FF', '#4A42CC']} style={styles.fabGradient}>
            <Icon name="crosshairs-gps" size={22} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => init()} style={[styles.fab, { marginTop: 12 }]}>
          <LinearGradient colors={['#1A2538', '#0F1525']} style={styles.fabGradient}>
            <Icon name="refresh" size={22} color={COLORS.textSecondary} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Place count badge */}
      {places.length === 0 && !loading && (
        <View style={styles.emptyBadge}>
          <Icon name="map-search" size={24} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>No places found nearby.{'\n'}Try updating your interests.</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#0A0E1A' },
  loading:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText:  { color: COLORS.textSecondary, fontSize: 15 },

  header:       { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, backgroundColor: 'rgba(10,14,26,0.85)', borderRadius: 16, padding: 12, gap: 10, borderWidth: 1, borderColor: 'rgba(108,99,255,0.2)', ...SHADOWS.medium },
  headerBadge:  { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { flex: 1, fontSize: 17, fontWeight: '700', color: '#F0F4FF' },
  recBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,217,61,0.15)', alignItems: 'center', justifyContent: 'center' },

  statsBar:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, backgroundColor: 'rgba(10,14,26,0.80)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statItem:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statText:     { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  statDivider:  { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 12 },

  recPanel:     { backgroundColor: 'rgba(15,21,37,0.95)', marginHorizontal: 16, marginTop: 8, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(108,99,255,0.2)', ...SHADOWS.large },
  recPanelTitle:{ color: '#F0F4FF', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  recItem:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  recEmoji:     { fontSize: 20 },
  recName:      { color: '#F0F4FF', fontSize: 13, fontWeight: '600' },
  recCat:       { color: COLORS.textSecondary, fontSize: 11 },
  recRating:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  recRatingText:{ color: COLORS.accentGold, fontSize: 11, fontWeight: '600' },

  userDotWrapper: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  userPulse:    { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary },
  userDot:      { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', borderWidth: 3, borderColor: COLORS.primary },

  markerBubble: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...SHADOWS.small },
  markerEmoji:  { fontSize: 18 },
  markerTail:   { width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', alignSelf: 'center', marginTop: -1 },

  calloutWrapper: { width: 180 },
  callout:      { backgroundColor: '#1A2538', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(108,99,255,0.3)', ...SHADOWS.medium },
  calloutName:  { color: '#F0F4FF', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  calloutRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  calloutBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  calloutBadgeText: { fontSize: 11, fontWeight: '600' },
  calloutDist:  { color: COLORS.textSecondary, fontSize: 11 },
  calloutRating:{ color: COLORS.accentGold, fontSize: 11, fontWeight: '600', marginLeft: 2 },

  fabContainer: { position: 'absolute', bottom: 24, right: 16 },
  fab:          { width: 50, height: 50, borderRadius: 16, overflow: 'hidden', ...SHADOWS.medium },
  fabGradient:  { flex: 1, alignItems: 'center', justifyContent: 'center' },

  emptyBadge:   { position: 'absolute', bottom: 100, alignSelf: 'center', backgroundColor: 'rgba(15,21,37,0.9)', borderRadius: 16, padding: 20, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  emptyText:    { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

// Custom dark map style
const DARK_MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#0A0E1A' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#0A0E1A' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#8A9BB8' }] },
  { featureType: 'road',                elementType: 'geometry',           stylers: [{ color: '#162035' }] },
  { featureType: 'road',                elementType: 'geometry.stroke',    stylers: [{ color: '#0F1525' }] },
  { featureType: 'road.highway',        elementType: 'geometry',           stylers: [{ color: '#1A2538' }] },
  { featureType: 'water',               elementType: 'geometry',           stylers: [{ color: '#0F1A2E' }] },
  { featureType: 'water',               elementType: 'labels.text.fill',   stylers: [{ color: '#4A5568' }] },
  { featureType: 'poi',                 stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',             stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative',      elementType: 'geometry',           stylers: [{ color: '#162035' }] },
];
