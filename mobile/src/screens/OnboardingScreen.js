/**
 * screens/OnboardingScreen.js – GeoPulse AI
 * Animated interest selection screen.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Dimensions, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, INTEREST_META, SHADOWS } from '../utils/theme';
import { createOrUpdateUser } from '../utils/api';
import { requestLocationPermission, getCurrentPosition } from '../utils/location';

const { width } = Dimensions.get('window');

const INTERESTS = ['Cafe', 'Restaurant', 'Adventure', 'Sports', 'Music', 'Nightlife', 'Events'];

// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingScreen({ navigation }) {
  const [selected, setSelected]   = useState(new Set());
  const [loading,  setLoading]    = useState(false);

  // Entrance animations
  const fadeAnim    = useRef(new Animated.Value(0)).current;
  const slideAnim   = useRef(new Animated.Value(40)).current;
  const chipAnims   = INTERESTS.map(() => useRef(new Animated.Value(0)).current);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
      Animated.stagger(60, chipAnims.map(anim =>
        Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 })
      )),
    ]).start();
  }, []);

  const toggleInterest = (interest) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(interest) ? next.delete(interest) : next.add(interest);
      return next;
    });
  };

  const handleGetStarted = async () => {
    if (selected.size < 1) {
      Alert.alert('Pick Your Interests', 'Select at least one interest to continue.');
      return;
    }

    setLoading(true);
    try {
      const hasPermission = await requestLocationPermission();
      let lat = null, lng = null;
      if (hasPermission) {
        try {
          const pos = await getCurrentPosition();
          lat = pos.latitude;
          lng = pos.longitude;
        } catch {/* no-op */}
      }

      const deviceId = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await createOrUpdateUser({
        device_id:  deviceId,
        interests:  Array.from(selected),
        latitude:   lat,
        longitude:  lng,
      });

      await AsyncStorage.setItem('user_id',   String(response.user_id));
      await AsyncStorage.setItem('device_id', deviceId);
      await AsyncStorage.setItem('interests', JSON.stringify(Array.from(selected)));

      navigation.replace('Main');
    } catch (err) {
      Alert.alert('Oops!', err.message || 'Failed to set up your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <View style={styles.logoRow}>
              <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.logoBadge}>
                <Icon name="map-marker-radius" size={32} color="#000" />
              </LinearGradient>
            </View>
            <Text style={styles.title}>GeoPulse AI</Text>
            <Text style={styles.subtitle}>
              Tell us what you love.{'\n'}We'll find the best spots nearby.
            </Text>
          </Animated.View>

          {/* Interest grid */}
          <Text style={styles.sectionLabel}>Choose your interests</Text>
          <View style={styles.grid}>
            {INTERESTS.map((interest, idx) => {
              const meta     = INTEREST_META[interest];
              const isActive = selected.has(interest);
              return (
                <Animated.View
                  key={interest}
                  style={{ transform: [{ scale: chipAnims[idx] }], opacity: chipAnims[idx] }}
                >
                  <TouchableOpacity
                    onPress={() => toggleInterest(interest)}
                    activeOpacity={0.75}
                    style={[
                      styles.chip,
                      isActive && { borderColor: meta.color, backgroundColor: `${meta.color}22` },
                    ]}
                  >
                    <LinearGradient
                      colors={isActive ? [meta.color, `${meta.color}88`] : ['transparent', 'transparent']}
                      style={styles.chipGradient}
                    >
                      <Text style={styles.chipEmoji}>{meta.emoji}</Text>
                      <Text style={[styles.chipLabel, isActive && { color: '#fff' }]}>
                        {interest}
                      </Text>
                      {isActive && (
                        <Icon name="check-circle" size={14} color="#fff" style={styles.checkIcon} />
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>

          {/* Selection count */}
          {selected.size > 0 && (
            <Animated.Text style={styles.countLabel}>
              {selected.size} interest{selected.size > 1 ? 's' : ''} selected ✓
            </Animated.Text>
          )}

          {/* CTA */}
          <TouchableOpacity
            onPress={handleGetStarted}
            disabled={loading}
            activeOpacity={0.8}
            style={styles.ctaWrapper}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cta}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.ctaText}>Explore Nearby Places</Text>
                  <Icon name="arrow-right" size={20} color="#fff" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  scroll:       { paddingHorizontal: 24, paddingBottom: 40 },
  logoRow:      { alignItems: 'center', marginTop: 40, marginBottom: 24 },
  logoBadge:    { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', ...SHADOWS.medium },
  title:        { fontSize: 34, fontWeight: '800', color: '#FFF', textAlign: 'center', letterSpacing: -0.5 },
  subtitle:     { fontSize: 16, color: '#A0AEC0', textAlign: 'center', marginTop: 10, marginBottom: 32, lineHeight: 24 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.primary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip:         { borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', backgroundColor: '#111' },
  chipGradient: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 18, gap: 8 },
  chipEmoji:    { fontSize: 18 },
  chipLabel:    { fontSize: 14, fontWeight: '600', color: '#A0AEC0' },
  checkIcon:    { marginLeft: 2 },
  countLabel:   { textAlign: 'center', color: COLORS.success, fontSize: 13, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  ctaWrapper:   { marginTop: 28, borderRadius: 18, overflow: 'hidden', ...SHADOWS.medium },
  cta:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 10 },
  ctaText:      { fontSize: 17, fontWeight: '700', color: '#000', letterSpacing: 0.3 },
});
