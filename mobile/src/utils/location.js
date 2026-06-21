/**
 * utils/location.js – GeoPulse AI
 * Geolocation helpers and Haversine distance calculator.
 */

import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

// ── Haversine distance ────────────────────────────────────────────────────────

/**
 * Calculate distance in miles between two GPS coordinates.
 */
export function getDistanceMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

/**
 * Format distance for display.
 */
export function formatDistance(miles) {
  if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
  return `${miles.toFixed(1)} mi`;
}

// ── Permissions ───────────────────────────────────────────────────────────────

export async function requestLocationPermission() {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title:   'GeoPulse AI Location Permission',
          message: 'GeoPulse AI needs access to your location to discover amazing places nearby.',
          buttonNeutral:  'Ask Me Later',
          buttonNegative: 'Deny',
          buttonPositive: 'Allow',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }
  return true; // iOS handles permissions via Info.plist
}

// ── Get current position ──────────────────────────────────────────────────────

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => resolve({
        latitude:  position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy:  position.coords.accuracy,
      }),
      error   => reject(error),
      {
        enableHighAccuracy: true,
        timeout:            15000,
        maximumAge:         10000,
      },
    );
  });
}

/**
 * Watch position and call callback on each update.
 * Returns the watch ID (call Geolocation.clearWatch(id) to stop).
 */
export function watchPosition(callback) {
  return Geolocation.watchPosition(
    position =>
      callback({
        latitude:  position.coords.latitude,
        longitude: position.coords.longitude,
      }),
    () => {},
    { enableHighAccuracy: true, distanceFilter: 50 },
  );
}
