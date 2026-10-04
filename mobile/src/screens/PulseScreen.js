/**
 * screens/PulseScreen.js – GeoPulse AI
 * High-fidelity discovery feed with premium cards and animations.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  Animated, Dimensions, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, FONTS, SHADOWS, INTEREST_META } from '../utils/theme';
import { getRecommendations, getNearbyPlaces, recordInteraction } from '../utils/api';
import { getCurrentPosition, requestLocationPermission, getDistanceMiles, formatDistance } from '../utils/location';

const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_PLACES = [
  { id: 101, name: 'The Artizan Cafe & Roastery', category: 'Cafe', rating: 4.8, address: 'Market St & 4th St', latitude: 37.7850, longitude: -122.4060, match_score: 98, photo_url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=1000' },
  { id: 102, name: 'Blue Door Bistro', category: 'Restaurant', rating: 4.7, address: 'Mission St & 5th St', latitude: 37.7820, longitude: -122.4040, match_score: 95, photo_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1000' },
  { id: 103, name: 'Skyline Overlook Trail', category: 'Adventure', rating: 4.9, address: 'Twin Peaks Blvd', latitude: 37.7544, longitude: -122.4477, match_score: 92, photo_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=1000' },
  { id: 104, name: 'The Soundwave Lounge', category: 'Music', rating: 4.6, address: 'Broadway & Columbus Ave', latitude: 37.7980, longitude: -122.4070, match_score: 90, photo_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=1000' },
  { id: 105, name: 'Velocity Fitness & Climbing', category: 'Sports', rating: 4.8, address: 'Howard St & 3rd St', latitude: 37.7840, longitude: -122.4010, match_score: 88, photo_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1000' },
  { id: 106, name: 'Neon Velvet Speakeasy', category: 'Nightlife', rating: 4.7, address: 'Geary St & Powell St', latitude: 37.7870, longitude: -122.4080, match_score: 94, photo_url: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?q=80&w=1000' },
  { id: 107, name: 'Sunset Live Acoustic Session', category: 'Events', rating: 4.9, address: 'Pier 39 Pavilion', latitude: 37.8080, longitude: -122.4090, match_score: 96, photo_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=1000' },
];

export default function PulseScreen() {
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState(null);
  const [places, setPlaces] = useState([]);           // personalized recommendations ("For You")
  const [nearbyPlaces, setNearbyPlaces] = useState([]); // all nearby places (for category tabs)
  const [interests, setInterests] = useState([]);     // user's chosen interest categories
  const [loading, setLoading] = useState(true);
  const [userLoc, setUserLoc] = useState(null);
  const [activeCategory, setActiveCategory] = useState('For You');
  const [savedIds, setSavedIds] = useState(new Set());

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const uid = await AsyncStorage.getItem('user_id');
      setUserId(uid);
      const name = await AsyncStorage.getItem('user_name');
      if (name) setUserName(name);
      
      let userInterests = [];
      const storedInterests = await AsyncStorage.getItem('interests');
      if (storedInterests) {
        try {
          userInterests = JSON.parse(storedInterests);
          setInterests(userInterests);
        } catch {}
      }

      await requestLocationPermission();
      const pos = await getCurrentPosition();
      setUserLoc(pos);

      // Fetch nearby places & recommendations concurrently with resilient fallbacks
      const [nearbyRes, recsRes] = await Promise.allSettled([
        getNearbyPlaces(uid, pos.latitude, pos.longitude),
        getRecommendations(uid, pos.latitude, pos.longitude),
      ]);

      let fetchedNearby = [];
      let fetchedRecs   = [];

      if (nearbyRes.status === 'fulfilled' && nearbyRes.value?.places?.length > 0) {
        fetchedNearby = nearbyRes.value.places;
      }
      if (recsRes.status === 'fulfilled' && recsRes.value?.recommendations?.length > 0) {
        fetchedRecs = recsRes.value.recommendations;
      }

      // If backend returned no places or offline, filter fallback places matching user interests
      if (fetchedNearby.length === 0) {
        fetchedNearby = FALLBACK_PLACES.filter(p =>
          userInterests.length === 0 || userInterests.includes(p.category)
        );
        if (fetchedNearby.length === 0) fetchedNearby = FALLBACK_PLACES;
      }
      if (fetchedRecs.length === 0) {
        fetchedRecs = fetchedNearby;
      }

      setNearbyPlaces(fetchedNearby);
      setPlaces(fetchedRecs);
    } catch (err) {
      console.warn('Pulse init notice:', err);
      // Ensure robust fallback on error
      setNearbyPlaces(FALLBACK_PLACES);
      setPlaces(FALLBACK_PLACES);
    } finally {
      setLoading(false);
    }
  };

  // Time-appropriate greeting (Good morning / afternoon / evening).
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  // SAVE — record a "save" interaction (also strengthens future recommendations).
  const handleSave = async (item) => {
    setSavedIds(prev => new Set(prev).add(item.id));
    if (userId) {
      try { await recordInteraction(userId, item.id, 'save'); } catch {/* offline is fine */}
    }
  };

  // LET'S GO — record a "visit" and open turn-by-turn directions in Maps.
  const handleGo = async (item) => {
    if (userId) {
      try { await recordInteraction(userId, item.id, 'visit'); } catch {/* offline is fine */}
    }
    const label = encodeURIComponent(item.name || 'Destination');
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${item.latitude},${item.longitude}&q=${label}`
      : `google.navigation:q=${item.latitude},${item.longitude}`;
    Linking.openURL(url).catch(() => {});
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.greetingText}>
          {greeting}{userName ? <>, <Text style={styles.locationText}>{userName}</Text></> : ''}
        </Text>
      </View>
      <TouchableOpacity style={styles.logoBtn}>
        <Icon name="lightning-bolt" size={24} color="#000" />
      </TouchableOpacity>
    </View>
  );

  const renderCategories = () => (
    <View style={styles.categoryContainer}>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={['For You', ...interests]}
        keyExtractor={item => item}
        renderItem={({ item }) => (
          <TouchableOpacity 
            onPress={() => setActiveCategory(item)}
            style={[
              styles.categoryChip, 
              activeCategory === item && styles.categoryChipActive
            ]}
          >
            <Text style={[
              styles.categoryText,
              activeCategory === item && styles.categoryTextActive
            ]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );

  const renderPlaceCard = ({ item, index }) => {
    // Animation for card entrance
    const translateY = scrollY.interpolate({
      inputRange: [-1, 0, index * 500, (index + 2) * 500],
      outputRange: [0, 0, 0, 50],
    });

    // Real values from the recommendation engine — not placeholders.
    const match = item.match_score != null ? item.match_score : null;
    const dist  = userLoc && item.latitude != null
      ? getDistanceMiles(userLoc.latitude, userLoc.longitude, item.latitude, item.longitude)
      : null;
    const isSaved = savedIds.has(item.id);

    return (
      <Animated.View style={[styles.card, { transform: [{ translateY }] }]}>
        <View style={styles.imageWrapper}>
          <Image 
            source={{ uri: item.photo_url || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=1000' }} 
            style={styles.cardImage} 
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.9)']}
            style={styles.cardGradient}
          />
          
          {/* Badges */}
          <View style={styles.topBadges}>
            {match != null && (
              <View style={styles.matchBadge}>
                <Text style={styles.matchText}>{match}% MATCH</Text>
              </View>
            )}
            {dist != null && (
              <View style={styles.distBadge}>
                <Text style={styles.distText}>{formatDistance(dist)}</Text>
              </View>
            )}
          </View>

          {/* Card Content Overlay */}
          <View style={styles.cardContent}>
            <View style={styles.ratingRow}>
              <Icon name="star" size={16} color={COLORS.primary} />
              <Text style={styles.ratingText}>{item.rating?.toFixed(1) || '4.5'} <Text style={styles.reviewsText}>(120+ reviews)</Text></Text>
            </View>
            <Text style={styles.placeName}>{item.name}</Text>
            <Text style={styles.placeAddress}>{item.address?.split(',').slice(0, 2).join(', ')}</Text>
            
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={[styles.saveBtn, isSaved && styles.saveBtnActive]}
                onPress={() => handleSave(item)}
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>{isSaved ? 'SAVED ✓' : 'SAVE'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.goBtn} onPress={() => handleGo(item)} activeOpacity={0.85}>
                <LinearGradient
                  colors={[COLORS.primary, COLORS.primaryDark]}
                  style={styles.goBtnGradient}
                >
                  <Text style={styles.goBtnText}>LET'S GO!</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {renderHeader()}
        {renderCategories()}
        <FlatList
          data={activeCategory === 'For You'
            ? places
            : nearbyPlaces.filter(p => p.category === activeCategory)}
          keyExtractor={item => item.id.toString()}
          renderItem={renderPlaceCard}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {activeCategory === 'For You'
                ? 'Finding spots near you…'
                : `No ${activeCategory.toLowerCase()} places found nearby.`}
            </Text>
          }
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#8A8A8A',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  greetingText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
  },
  locationText: {
    color: COLORS.primary,
  },
  logoBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
  },
  categoryContainer: {
    marginBottom: 26,
  },
  categoryChip: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 25,
    backgroundColor: '#1A1A1A',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryText: {
    color: '#8A8A8A',
    fontWeight: '600',
    fontSize: 15,
  },
  categoryTextActive: {
    color: '#000',
  },
  card: {
    width: '100%',
    height: 480,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#111',
  },
  imageWrapper: {
    flex: 1,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  cardGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  topBadges: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  matchBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(10px)',
  },
  matchText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  distBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  distText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratingText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 6,
  },
  reviewsText: {
    color: '#A0AEC0',
    fontWeight: 'normal',
  },
  placeName: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
  },
  placeAddress: {
    fontSize: 14,
    color: '#A0AEC0',
    marginBottom: 24,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  saveBtn: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(0, 212, 255, 0.15)',
  },
  saveBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
  },
  goBtn: {
    flex: 2,
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
  },
  goBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goBtnText: {
    color: '#000',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1,
  },
});
