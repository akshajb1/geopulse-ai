/**
 * screens/ProfileScreen.js – GeoPulse AI
 * User profile with editable interests, analytics, and stats.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, INTEREST_META, SHADOWS } from '../utils/theme';
import { createOrUpdateUser, getAnalytics } from '../utils/api';

const ALL_INTERESTS = ['Cafe', 'Restaurant', 'Adventure', 'Sports', 'Music', 'Nightlife', 'Events'];

// ─────────────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const [userId,    setUserId]    = useState(null);
  const [deviceId,  setDeviceId]  = useState(null);
  const [interests, setInterests] = useState(new Set());
  const [analytics, setAnalytics] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSavedState]= useState(false);

  const fadeAnim   = useRef(new Animated.Value(0)).current;
  const slideAnim  = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    loadProfile();
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const loadProfile = async () => {
    const uid = await AsyncStorage.getItem('user_id');
    const did = await AsyncStorage.getItem('device_id');
    const raw = await AsyncStorage.getItem('interests');
    setUserId(uid);
    setDeviceId(did);
    if (raw) setInterests(new Set(JSON.parse(raw)));

    try {
      const data = await getAnalytics();
      setAnalytics(data);
    } catch {}
  };

  const toggleInterest = (interest) => {
    setInterests(prev => {
      const next = new Set(prev);
      next.has(interest) ? next.delete(interest) : next.add(interest);
      return next;
    });
    setSavedState(false);
  };

  const handleSave = async () => {
    if (interests.size === 0) {
      Alert.alert('Keep at least one interest!');
      return;
    }
    setSaving(true);
    try {
      await createOrUpdateUser({
        device_id: deviceId,
        interests: Array.from(interests),
      });
      await AsyncStorage.setItem('interests', JSON.stringify(Array.from(interests)));
      setSavedState(true);
      Alert.alert('✅ Saved', 'Your interests have been updated!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save interests.');
    } finally {
      setSaving(false);
    }
  };

  const topCategories = analytics?.most_visited_types?.slice(0, 3) || [];
  const popularCats   = analytics?.popular_categories?.slice(0, 3) || [];

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Avatar hero */}
          <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <LinearGradient colors={[COLORS.primary, COLORS.primaryDark]} style={styles.avatar}>
              <Icon name="account" size={44} color="#000" />
            </LinearGradient>
            <Text style={styles.heroTitle}>My Profile</Text>
            <View style={styles.userIdBadge}>
              <Icon name="identifier" size={12} color={COLORS.textSecondary} />
              <Text style={styles.userIdText}>User #{userId}</Text>
            </View>
          </Animated.View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(0,240,255,0.15)', 'rgba(0,0,0,0)']} style={styles.statGrad}>
                <Icon name="heart" size={20} color={COLORS.primary} />
                <Text style={styles.statValue}>{interests.size}</Text>
                <Text style={styles.statLabel}>Interests</Text>
              </LinearGradient>
            </View>
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(78,205,196,0.2)', 'rgba(78,205,196,0.05)']} style={styles.statGrad}>
                <Icon name="map-marker-check" size={20} color={COLORS.accentGreen} />
                <Text style={[styles.statValue, { color: COLORS.accentGreen }]}>
                  {topCategories.reduce((s, c) => s + (c.interaction_count || 0), 0)}
                </Text>
                <Text style={styles.statLabel}>Interactions</Text>
              </LinearGradient>
            </View>
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(255,217,61,0.2)', 'rgba(255,217,61,0.05)']} style={styles.statGrad}>
                <Icon name="star" size={20} color={COLORS.accentGold} />
                <Text style={[styles.statValue, { color: COLORS.accentGold }]}>
                  {popularCats.length > 0 ? popularCats[0].avg_rating?.toFixed(1) : '–'}
                </Text>
                <Text style={styles.statLabel}>Top Rating</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Interests editor */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Interests</Text>
            <Text style={styles.sectionSub}>Tap to toggle. Save when done.</Text>
            <View style={styles.interestGrid}>
              {ALL_INTERESTS.map(interest => {
                const meta     = INTEREST_META[interest];
                const isActive = interests.has(interest);
                return (
                  <TouchableOpacity
                    key={interest}
                    onPress={() => toggleInterest(interest)}
                    activeOpacity={0.75}
                    style={[
                      styles.interestChip,
                      isActive && { borderColor: meta.color, backgroundColor: `${meta.color}22` },
                    ]}
                  >
                    <Text style={styles.interestEmoji}>{meta.emoji}</Text>
                    <Text style={[styles.interestLabel, isActive && { color: '#fff' }]}>
                      {interest}
                    </Text>
                    {isActive && (
                      <Icon name="check-circle" size={14} color={meta.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity onPress={handleSave} disabled={saving || saved} activeOpacity={0.8} style={styles.saveWrapper}>
              <LinearGradient
                colors={saved ? [COLORS.accentGreen, COLORS.accentGreen] : [COLORS.primary, COLORS.primaryDark]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.saveButton}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Icon name={saved ? 'check-circle' : 'content-save'} size={18} color="#fff" />
                    <Text style={styles.saveText}>{saved ? 'Saved!' : 'Save Interests'}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Analytics */}
          {analytics && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Usage Analytics</Text>

              {topCategories.length > 0 && (
                <>
                  <Text style={styles.subHeading}>Most Explored Categories</Text>
                  {topCategories.map((cat, idx) => (
                    <View key={cat.category} style={styles.analyticsRow}>
                      <Text style={styles.rankNum}>#{idx + 1}</Text>
                      <Text style={styles.analyticsCat}>{INTEREST_META[cat.category]?.emoji || '📍'} {cat.category}</Text>
                      <View style={styles.analyticsBar}>
                        <View style={[styles.analyticsBarFill, {
                          width: `${Math.min(100, (cat.interaction_count / (topCategories[0]?.interaction_count || 1)) * 100)}%`,
                          backgroundColor: INTEREST_META[cat.category]?.color || COLORS.primary,
                        }]} />
                      </View>
                      <Text style={styles.analyticsCount}>{cat.interaction_count}</Text>
                    </View>
                  ))}
                </>
              )}

              {popularCats.length > 0 && (
                <>
                  <Text style={[styles.subHeading, { marginTop: 20 }]}>Top Rated Categories</Text>
                  {popularCats.map(cat => (
                    <View key={cat.category} style={styles.analyticsRow}>
                      <Text style={styles.analyticsCat}>{INTEREST_META[cat.category]?.emoji || '📍'} {cat.category}</Text>
                      <View style={styles.ratingStars}>
                        <Icon name="star" size={13} color={COLORS.accentGold} />
                        <Text style={styles.analyticsRating}>{cat.avg_rating?.toFixed(1)}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#000' },
  scroll:        { paddingHorizontal: 20, paddingBottom: 40 },

  heroSection:   { alignItems: 'center', paddingTop: 24, paddingBottom: 20 },
  avatar:        { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 14, ...SHADOWS.medium },
  heroTitle:     { fontSize: 26, fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  userIdBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  userIdText:    { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },

  statsRow:      { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statCard:      { flex: 1, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statGrad:      { alignItems: 'center', paddingVertical: 16, gap: 4 },
  statValue:     { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  statLabel:     { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },

  section:       { backgroundColor: '#111111', borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  sectionTitle:  { fontSize: 18, fontWeight: '700', color: '#F0F4FF', marginBottom: 4 },
  sectionSub:    { fontSize: 13, color: COLORS.textSecondary, marginBottom: 18 },

  interestGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  interestChip:  { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#111', paddingVertical: 10, paddingHorizontal: 14 },
  interestEmoji: { fontSize: 16 },
  interestLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },

  saveWrapper:   { borderRadius: 14, overflow: 'hidden' },
  saveButton:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  saveText:      { fontSize: 15, fontWeight: '700', color: '#fff' },

  subHeading:    { fontSize: 13, color: COLORS.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  analyticsRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  rankNum:       { fontSize: 12, color: COLORS.textMuted, fontWeight: '700', width: 20 },
  analyticsCat:  { fontSize: 13, color: '#FFF', fontWeight: '600', minWidth: 100 },
  analyticsBar:  { flex: 1, height: 6, backgroundColor: '#111', borderRadius: 3, overflow: 'hidden' },
  analyticsBarFill:{ height: '100%', borderRadius: 3 },
  analyticsCount:{ fontSize: 12, color: COLORS.textSecondary, fontWeight: '700', width: 24, textAlign: 'right' },
  ratingStars:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  analyticsRating:{ fontSize: 13, color: COLORS.accentGold, fontWeight: '700' },
});
