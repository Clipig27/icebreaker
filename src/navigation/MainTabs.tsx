import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { COLORS } from '../constants/theme';

import HomeScreen        from '../screens/HomeScreen';
import GamesTabScreen    from '../screens/GamesTabScreen';
import FriendsScreen     from '../screens/FriendsScreen';
import ProfileScreen     from '../screens/ProfileScreen';
import NotificationsBell from '../components/NotificationsBell';

export type TabParamList = {
  Play:    undefined;
  Games:   undefined;
  Social:  undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

function tabIcon(label: string, focused: boolean) {
  const icons: Record<string, string> = {
    Play:    '🎮',
    Games:   '🎯',
    Social:  '👥',
    Profile: '👤',
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>
      {icons[label]}
    </Text>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // ── Tab bar ──────────────────────────────────────────────────
        tabBarIcon: ({ focused }) => tabIcon(route.name, focused),
        tabBarLabel: route.name,
        tabBarActiveTintColor:   COLORS.accent,
        tabBarInactiveTintColor: COLORS.text2,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor:  COLORS.border,
          borderTopWidth:  1,
          paddingBottom:   4,
          height:          60,
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '600',
        },

        // ── Shared header with notifications bell ─────────────────────
        headerShown:          true,
        headerTitle:          route.name,
        headerTitleStyle: {
          fontSize:      18,
          fontWeight:    '800',
          color:         COLORS.text,
        },
        headerStyle: {
          backgroundColor: COLORS.surface,
        },
        headerShadowVisible:  false,
        headerRight: () => <NotificationsBell />,
      })}
    >
      <Tab.Screen name="Play"    component={HomeScreen} />
      <Tab.Screen name="Games"   component={GamesTabScreen} />
      <Tab.Screen name="Social"  component={FriendsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
