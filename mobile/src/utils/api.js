/**
 * utils/api.js – GeoPulse AI
 * Axios instance + API helper functions.
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Platform } from 'react-native';

// Production backend (deployed on Render). HTTPS, reachable from anywhere —
// no Mac / Wi-Fi dependency. This is what ships to the App Store.
const BASE_URL = 'https://geopulse-api-y9gt.onrender.com';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Interceptors ──────────────────────────────────────────────────────────────

api.interceptors.request.use(
  config => config,
  error  => Promise.reject(error),
);

api.interceptors.response.use(
  response => response.data,
  error    => {
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      'Network error';
    return Promise.reject(new Error(message));
  },
);

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * Create or update user.
 */
export const createOrUpdateUser = async (payload) => {
  return api.post('/user', payload);
};

/**
 * Update user's current GPS location.
 */
export const updateLocation = async (userId, latitude, longitude) => {
  return api.post('/update-location', { user_id: userId, latitude, longitude });
};

/**
 * Get nearby places matching user interests.
 */
export const getNearbyPlaces = async (userId, latitude, longitude) => {
  return api.get('/nearby-places', {
    params: { user_id: userId, latitude, longitude },
  });
};

/**
 * Record a user interaction with a place.
 * @param {string} actionType - 'click' | 'visit' | 'save' | 'dismiss'
 */
export const recordInteraction = async (userId, placeId, actionType) => {
  return api.post('/interaction', {
    user_id:     userId,
    place_id:    placeId,
    action_type: actionType,
  });
};

/**
 * Get ML-powered recommendations for the user.
 */
export const getRecommendations = async (userId, latitude, longitude) => {
  return api.get(`/recommendations/${userId}`, {
    params: { latitude, longitude }
  });
};

/**
 * Get analytics data.
 */
export const getAnalytics = async () => {
  return api.get('/analytics');
};

/**
 * Get user profile.
 */
export const getUserProfile = async (userId) => {
  return api.get(`/users/${userId}`);
};

export default api;
