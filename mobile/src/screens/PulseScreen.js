/**
 * screens/PulseScreen.js – GeoPulse AI
 * High-fidelity discovery feed with premium cards and animations.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity,
  Animated, Dimensions, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, FONTS, SHADOWS, INTEREST_META } from '../utils/theme';
import { getRecommendations, getNearbyPlaces } from '../utils/api';
import { getCurrentPosition } from '../utils/location';

const { width } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────

export default function PulseScreen() {
  const [userName, setUserName] = useState('Explorer');
  const [locationName, setLocationName] = useState('Roorkee'); // Dynamic from GPS in future
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('Cafe');

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const uid = await AsyncStorage.getItem('user_id');
      const name = await AsyncStorage.getItem('user_name');
      if (name) setUserName(name);

      const pos = await getCurrentPosition();
      const data = await getRecommendations(uid, pos.latitude, pos.longitude);
      setPlaces(data.recommendations || []);
    } catch (err) {
      console.warn('Pulse init error:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.greetingText}>Good evening, <Text style={styles.locationText}>{locationName}</Text></Text>
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
        data={['Cafe', 'Nightlife', 'Adventure', 'Sports', 'Events']}
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
            <View style={styles.matchBadge}>
              <Text style={styles.matchText}>{Math.floor(80 + Math.random() * 19)}% MATCH</Text>
            </View>
            <View style={styles.distBadge}>
              <Text style={styles.distText}>{(Math.random() * 5).toFixed(1)} mi</Text>
            </View>
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
              <TouchableOpacity style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>SAVE</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.goBtn}>
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
          data={places}
          keyExtractor={item => item.id.toString()}
          renderItem={renderPlaceCard}
          contentContainerStyle={{ paddingBottom: 100 }}
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
