/**
 * screens/DiscoveryFeed.js – GeoPulse AI
 * Scrollable list of nearby places matching user interests.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, INTEREST_META, SHADOWS } from '../utils/theme';
import { getNearbyPlaces, recordInteraction } from '../utils/api';
import { getCurrentPosition, requestLocationPermission, getDistanceMiles, formatDistance } from '../utils/location';

const FILTER_ALL = 'All';
const FILTERS    = [FILTER_ALL, 'Cafe', 'Restaurant', 'Adventure', 'Sports', 'Music', 'Nightlife', 'Events'];

// ─────────────────────────────────────────────────────────────────────────────

export default function DiscoveryFeed() {
  const [userId,    setUserId]    = useState(null);
  const [userLoc,   setUserLoc]   = useState(null);
  const [places,    setPlaces]    = useState([]);
  const [filtered,  setFiltered]  = useState([]);
  const [filter,    setFilter]    = useState(FILTER_ALL);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [saved,     setSaved]     = useState(new Set());

  const listFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    applyFilter(filter);
  }, [places, filter]);

  const init = async () => {
    const uid = await AsyncStorage.getItem('user_id');
    setUserId(uid);
    await requestLocationPermission();
    const pos = await getCurrentPosition();
    setUserLoc(pos);
    await loadPlaces(uid, pos);
    setLoading(false);
  };

  const loadPlaces = async (uid, pos) => {
    try {
      const data = await getNearbyPlaces(uid, pos.latitude, pos.longitude);
      const list = (data.places || []).sort((a, b) => (a.distance_miles || 99) - (b.distance_miles || 99));
      setPlaces(list);
      Animated.timing(listFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    } catch (err) {
      console.warn('Discovery feed error:', err);
    }
  };

  const applyFilter = (f) => {
    setFiltered(f === FILTER_ALL ? places : places.filter(p => p.category === f));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (userId && userLoc) await loadPlaces(userId, userLoc);
    setRefreshing(false);
  };

  const handleSave = async (place) => {
    setSaved(prev => {
      const next = new Set(prev);
      next.has(place.id) ? next.delete(place.id) : next.add(place.id);
      return next;
    });
    if (userId) {
      try { await recordInteraction(userId, place.id, 'save'); } catch {}
    }
  };

  const handleVisit = async (place) => {
    if (userId) {
      try { await recordInteraction(userId, place.id, 'visit'); } catch {}
    }
  };

  const renderPlace = useCallback(({ item: place, index }) => {
    const meta  = INTEREST_META[place.category] || { color: COLORS.primary, emoji: '📍' };
    const dist  = userLoc
      ? formatDistance(getDistanceMiles(userLoc.latitude, userLoc.longitude, place.latitude, place.longitude))
      : null;
    const isSaved = saved.has(place.id);

    return (
      <Animated.View style={[styles.card, { opacity: listFadeAnim }]}>
        {/* Photo placeholder / gradient */}
        <LinearGradient
          colors={[`${meta.color}44`, `${meta.color}11`]}
          style={styles.cardPhoto}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Text style={styles.cardEmoji}>{meta.emoji}</Text>
          {place.is_open !== null && (
            <View style={[styles.openBadge, { backgroundColor: place.is_open ? '#4ECDC4' : COLORS.error }]}>
              <Text style={styles.openBadgeText}>{place.is_open ? 'Open' : 'Closed'}</Text>
            </View>
          )}
        </LinearGradient>

        <View style={styles.cardBody}>
          {/* Category badge */}
          <View style={[styles.categoryBadge, { backgroundColor: `${meta.color}22` }]}>
            <Text style={[styles.categoryText, { color: meta.color }]}>{place.category}</Text>
          </View>

          <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
          {place.address && (
            <Text style={styles.placeAddress} numberOfLines={1}>{place.address}</Text>
          )}

          {/* Rating + Distance row */}
          <View style={styles.metaRow}>
            {place.rating ? (
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <Icon
                    key={star}
                    name={place.rating >= star ? 'star' : place.rating >= star - 0.5 ? 'star-half-full' : 'star-outline'}
                    size={13}
                    color={COLORS.accentGold}
                  />
                ))}
                <Text style={styles.ratingNum}>{place.rating.toFixed(1)}</Text>
              </View>
            ) : <View />}
            {dist && (
              <View style={styles.distBadge}>
                <Icon name="map-marker-distance" size={12} color={COLORS.primary} />
                <Text style={styles.distText}>{dist}</Text>
              </View>
            )}
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => handleVisit(place)} style={styles.visitBtn} activeOpacity={0.8}>
              <LinearGradient colors={['#6C63FF', '#4A42CC']} style={styles.visitGrad}>
                <Icon name="map-marker-check" size={14} color="#fff" />
                <Text style={styles.visitText}>I'm Here</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleSave(place)} style={[styles.saveBtn, isSaved && styles.savedBtn]} activeOpacity={0.7}>
              <Icon name={isSaved ? 'heart' : 'heart-outline'} size={18} color={isSaved ? COLORS.error : COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  }, [userLoc, saved, userId]);

  return (
    <LinearGradient colors={['#0A0E1A', '#0F1525']} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Discover</Text>
          <Text style={styles.headerSub}>{filtered.length} places found</Text>
        </View>

        {/* Filter chips */}
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={f => f}
          contentContainerStyle={styles.filterList}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item: f }) => {
            const isActive = filter === f;
            const meta     = INTEREST_META[f];
            return (
              <TouchableOpacity
                onPress={() => setFilter(f)}
                style={[styles.filterChip, isActive && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                activeOpacity={0.75}
              >
                {meta && <Text>{meta.emoji} </Text>}
                <Text style={[styles.filterText, isActive && { color: '#fff' }]}>{f}</Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* Places list */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading nearby places…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={p => String(p.id)}
            contentContainerStyle={styles.list}
            renderItem={renderPlace}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Icon name="compass-off" size={48} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No places found</Text>
                <Text style={styles.emptySub}>Try a different filter or update your interests.</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle:  { fontSize: 28, fontWeight: '800', color: '#F0F4FF', letterSpacing: -0.5 },
  headerSub:    { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  filterList:   { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  filterChip:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#1A2538', marginRight: 8 },
  filterText:   { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },

  list:         { paddingHorizontal: 16, paddingBottom: 100 },
  card:         { backgroundColor: '#1A2538', borderRadius: 20, marginBottom: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(108,99,255,0.15)', ...SHADOWS.medium },
  cardPhoto:    { height: 110, alignItems: 'center', justifyContent: 'center' },
  cardEmoji:    { fontSize: 44 },
  openBadge:    { position: 'absolute', top: 10, right: 10, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  openBadgeText:{ color: '#fff', fontSize: 11, fontWeight: '700' },

  cardBody:     { padding: 16 },
  categoryBadge:{ alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  categoryText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  placeName:    { fontSize: 17, fontWeight: '700', color: '#F0F4FF', marginBottom: 4 },
  placeAddress: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 10 },

  metaRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingNum:    { color: COLORS.accentGold, fontSize: 12, fontWeight: '700', marginLeft: 4 },
  distBadge:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(108,99,255,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  distText:     { color: COLORS.primary, fontSize: 11, fontWeight: '700' },

  actions:      { flexDirection: 'row', gap: 10 },
  visitBtn:     { flex: 1, borderRadius: 12, overflow: 'hidden' },
  visitGrad:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 6 },
  visitText:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  saveBtn:      { width: 42, height: 42, borderRadius: 12, backgroundColor: '#0F1525', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  savedBtn:     { backgroundColor: 'rgba(255,107,107,0.15)', borderColor: 'rgba(255,107,107,0.3)' },

  centered:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:  { color: COLORS.textSecondary, fontSize: 15 },

  empty:        { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: COLORS.textSecondary },
  emptySub:     { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
});
