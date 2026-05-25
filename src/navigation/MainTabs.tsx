import React, { useRef, useEffect } from 'react';
import { Pressable, Animated } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

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

const ICONS: Record<string, [React.ComponentProps<typeof Ionicons>['name'], React.ComponentProps<typeof Ionicons>['name']]> = {
  Play:    ['flash',   'flash-outline'],
  Games:   ['grid',    'grid-outline'],
  Social:  ['people',  'people-outline'],
  Profile: ['person',  'person-outline'],
};

// Icon that bounces + lifts when the tab becomes focused
function AnimatedTabIcon({ label, focused }: { label: string; focused: boolean }) {
  const scale     = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (focused) {
      Animated.parallel([
        Animated.spring(scale,      { toValue: 1.25, useNativeDriver: true, speed: 30, bounciness: 14 }),
        Animated.spring(translateY, { toValue: -3,   useNativeDriver: true, speed: 30, bounciness: 10 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scale,      { toValue: 1, useNativeDriver: true, speed: 25, bounciness: 6 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 25, bounciness: 6 }),
      ]).start();
    }
  }, [focused]);

  const [activeIcon, inactiveIcon] = ICONS[label];
  return (
    <Animated.View style={{ transform: [{ scale }, { translateY }] }}>
      <Ionicons
        name={focused ? activeIcon : inactiveIcon}
        size={22}
        color={focused ? '#9D80FF' : '#8585A0'}
      />
    </Animated.View>
  );
}

// Tab button that squishes on press then bounces back
function AnimatedTabButton({ onPress, onLongPress, children, style }: any) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.82, useNativeDriver: true, speed: 80, bounciness: 0 }),
      Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 18, bounciness: 20 }),
    ]).start();
    onPress?.();
  };

  return (
    <Pressable style={[style, { flex: 1 }]} onPress={handlePress} onLongPress={onLongPress}>
      <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <AnimatedTabIcon label={route.name} focused={focused} />,
        tabBarButton: (props) => <AnimatedTabButton {...props} />,
        tabBarLabel: route.name,
        tabBarActiveTintColor:   COLORS.accent,
        tabBarInactiveTintColor: COLORS.text2,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor:  COLORS.border,
          borderTopWidth:  1,
          paddingBottom:   8,
          paddingTop:      6,
          height:          70,
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '600',
          marginBottom: 2,
        },

        headerShown:         true,
        headerTitle:         route.name,
        headerTitleStyle: {
          fontSize:   18,
          fontWeight: '800',
          color:      COLORS.text,
        },
        headerStyle: {
          backgroundColor: COLORS.surface,
        },
        headerShadowVisible: false,
        headerRight: () => <NotificationsBell />,
      })}
    >
      <Tab.Screen name="Play"    component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Games"   component={GamesTabScreen} />
      <Tab.Screen name="Social"  component={FriendsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
