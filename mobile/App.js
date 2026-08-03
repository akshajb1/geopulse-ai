/**
 * GeoPulse AI – App.js
 * Root navigation entry point.
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import OnboardingScreen from './src/screens/OnboardingScreen';
import PulseScreen from './src/screens/PulseScreen';
import HomeMapScreen from './src/screens/HomeMapScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { COLORS } from './src/utils/theme';

const Stack = createStackNavigator();
const Tab   = createBottomTabNavigator();

const Placeholder = ({ name }) => (
  <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: '#FFF' }}>{name} Screen coming soon...</Text>
  </View>
);

const SocialScreen = () => <Placeholder name="Social" />;

// ─────────────────────────────────────────────────────────────────────────────
// Bottom tab navigator (Pulse, Map, Social, Profile)
// ─────────────────────────────────────────────────────────────────────────────

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor:   COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginBottom: 6 },
        tabBarIcon: ({ color, size, focused }) => {
          const icons = {
            PULSE:   focused ? 'view-dashboard'      : 'view-dashboard-outline',
            MAP:     focused ? 'map-marker-radius'   : 'map-marker-radius-outline',
            SOCIAL:  focused ? 'account-group'       : 'account-group-outline',
            PROFILE: focused ? 'account'             : 'account-outline',
          };
          return (
            <Icon
              name={icons[route.name] || 'circle'}
              size={24}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="PULSE"   component={PulseScreen} />
      <Tab.Screen name="MAP"     component={HomeMapScreen} />
      <Tab.Screen name="SOCIAL"  component={SocialScreen} />
      <Tab.Screen name="PROFILE" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root Stack Navigator
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [isLoading,  setIsLoading]  = useState(true);
  const [hasOnboarded, setHasOnboarded] = useState(false);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const userId = await AsyncStorage.getItem('user_id');
      setHasOnboarded(!!userId);
    } catch {
      setHasOnboarded(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!hasOnboarded ? (
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            ) : null}
            <Stack.Screen name="Main" component={MainTabs} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0A0E1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    backgroundColor:    '#000000',
    borderTopColor:     'rgba(255,255,255,0.03)',
    borderTopWidth:     1,
    height:             84,
    paddingBottom:      20,
    paddingTop:         12,
    elevation:          0,
  },
});
