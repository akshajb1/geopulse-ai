/**
 * screens/NotificationsScreen.js – GeoPulse AI
 * Push notification alerts and nearby discovery alerts.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PushNotification from 'react-native-push-notification';

import { COLORS, INTEREST_META, SHADOWS } from '../utils/theme';
import { getNearbyPlaces } from '../utils/api';
import { getCurrentPosition } from '../utils/location';

const NOTIF_KEY = 'geopulse_notifications';

// ─────────────────────────────────────────────────────────────────────────────

function setupPushNotifications() {
  PushNotification.configure({
    onNotification: function (notification) {
      console.log('NOTIFICATION:', notification);
    },
    requestPermissions: Platform.OS === 'ios',
  });

  PushNotification.createChannel(
    { channelId: 'geopulse-channel', channelName: 'GeoPulse AI Alerts', importance: 4 },
    () => {},
  );
}

function sendLocalNotification(title, message) {
  PushNotification.localNotification({
    channelId:   'geopulse-channel',
    title,
    message,
    largeIcon:   'ic_launcher',
    smallIcon:   'ic_notification',
    color:       COLORS.primary,
    vibrate:     true,
    playSound:   true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);

  const headerFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setupPushNotifications();
    loadStoredNotifications();
    checkForNewPlaces();

    Animated.timing(headerFadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  const loadStoredNotifications = async () => {
    try {
      const raw  = await AsyncStorage.getItem(NOTIF_KEY);
      const list = raw ? JSON.parse(raw) : [];
      setNotifications(list);
      setUnreadCount(list.filter(n => !n.read).length);
    } catch {}
  };

  const checkForNewPlaces = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      if (!userId) return;

      const pos  = await getCurrentPosition();
      const data = await getNearbyPlaces(userId, pos.latitude, pos.longitude);
      const topPlaces = (data.places || []).slice(0, 3);

      if (topPlaces.length === 0) return;

      const newNotifs = topPlaces.map(place => {
        const meta = INTEREST_META[place.category] || { emoji: '📍' };
        return {
          id:        `${place.id}-${Date.now()}`,
          type:      'nearby_discovery',
          title:     `${meta.emoji} New place discovered!`,
          body:      `${place.name} is ${place.distance_miles ? `${place.distance_miles} mi` : 'nearby'} away.`,
          category:  place.category,
          place,
          timestamp: new Date().toISOString(),
          read:      false,
        };
      });

      // Send local push for the first new place
      if (newNotifs[0]) {
        sendLocalNotification(newNotifs[0].title, newNotifs[0].body);
      }

      const raw      = await AsyncStorage.getItem(NOTIF_KEY);
      const existing = raw ? JSON.parse(raw) : [];
      const merged   = [...newNotifs, ...existing].slice(0, 50); // keep last 50
      await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(merged));

      setNotifications(merged);
      setUnreadCount(merged.filter(n => !n.read).length);
    } catch (err) {
      console.warn('Notification check error:', err);
    }
  };

  const markAllRead = async () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    setUnreadCount(0);
    await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(updated));
  };

  const markRead = async (id) => {
    const updated = notifications.map(n => n.id === id ? { ...n, read: true } : n);
    setNotifications(updated);
    setUnreadCount(updated.filter(n => !n.read).length);
    await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(updated));
  };

  const clearAll = async () => {
    setNotifications([]);
    setUnreadCount(0);
    await AsyncStorage.removeItem(NOTIF_KEY);
  };

  const renderItem = ({ item, index }) => {
    const meta  = INTEREST_META[item.category] || { color: COLORS.primary, emoji: '🔔' };
    const time  = new Date(item.timestamp);
    const label = formatRelativeTime(time);
    return (
      <TouchableOpacity onPress={() => markRead(item.id)} activeOpacity={0.75}>
        <Animated.View style={[styles.card, !item.read && styles.unreadCard]}>
          <LinearGradient colors={[`${meta.color}33`, `${meta.color}11`]} style={styles.iconBubble}>
            <Text style={styles.notifEmoji}>{meta.emoji}</Text>
          </LinearGradient>
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              {!item.read && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.cardBody} numberOfLines={2}>{item.body}</Text>
            <Text style={styles.cardTime}>{label}</Text>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={['#0A0E1A', '#0F1525']} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerFadeAnim }]}>
          <View>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <Text style={styles.unreadLabel}>{unreadCount} unread</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={markAllRead} style={styles.actionBtn}>
                <Icon name="check-all" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            )}
            {notifications.length > 0 && (
              <TouchableOpacity onPress={clearAll} style={styles.actionBtn}>
                <Icon name="delete-sweep" size={18} color={COLORS.error} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Unread count banner */}
        {unreadCount > 0 && (
          <View style={styles.banner}>
            <Icon name="bell-ring" size={16} color={COLORS.accentGold} />
            <Text style={styles.bannerText}>You have {unreadCount} new alert{unreadCount > 1 ? 's' : ''} nearby!</Text>
          </View>
        )}

        {/* Notification List */}
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="bell-sleep" size={52} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySub}>We'll alert you when great places appear nearby.</Text>
            </View>
          }
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(date) {
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle:  { fontSize: 28, fontWeight: '800', color: '#F0F4FF', letterSpacing: -0.5 },
  unreadLabel:  { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  headerActions:{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  actionBtn:    { width: 38, height: 38, borderRadius: 12, backgroundColor: '#1A2538', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  banner:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 12, backgroundColor: 'rgba(255,217,61,0.12)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,217,61,0.25)' },
  bannerText:   { color: COLORS.accentGold, fontSize: 13, fontWeight: '600' },

  list:         { paddingHorizontal: 16, paddingBottom: 100 },
  card:         { flexDirection: 'row', gap: 12, backgroundColor: '#1A2538', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', ...SHADOWS.small },
  unreadCard:   { borderColor: 'rgba(108,99,255,0.3)', backgroundColor: 'rgba(108,99,255,0.07)' },

  iconBubble:   { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifEmoji:   { fontSize: 22 },
  cardContent:  { flex: 1 },
  cardHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: '#F0F4FF', flex: 1 },
  unreadDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginLeft: 8 },
  cardBody:     { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginBottom: 6 },
  cardTime:     { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

  empty:        { alignItems: 'center', paddingTop: 100, gap: 12 },
  emptyTitle:   { fontSize: 18, fontWeight: '700', color: COLORS.textSecondary },
  emptySub:     { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 40 },
});
