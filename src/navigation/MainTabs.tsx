import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COLORS, FONTS } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

import HomeScreen        from '../screens/HomeScreen';
import GamesTabScreen    from '../screens/GamesTabScreen';
import FriendsScreen     from '../screens/FriendsScreen';
import ProfileScreen     from '../screens/ProfileScreen';
// NotificationsBell removed for now

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
  const scale     = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (focused) {
      scale.value     = withSpring(1.25, { damping: 8, stiffness: 180 });
      translateY.value = withSpring(-3, { damping: 10, stiffness: 180 });
    } else {
      scale.value     = withSpring(1, { damping: 14, stiffness: 200 });
      translateY.value = withSpring(0, { damping: 14, stiffness: 200 });
    }
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const [activeIcon, inactiveIcon] = ICONS[label];
  return (
    <Animated.View style={animatedStyle}>
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
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(0.82, { damping: 20, stiffness: 500 }),
      withSpring(1,    { damping: 6,  stiffness: 200 }),
    );
    onPress?.();
  };

  return (
    <Pressable style={[style, { flex: 1 }]} onPress={handlePress} onLongPress={onLongPress}>
      <Animated.View style={animatedStyle}>
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
          fontFamily: FONTS.semibold,
          marginBottom: 2,
        },

        headerShown:         true,
        headerTitle:         route.name,
        headerTitleStyle: {
          fontSize:   18,
          fontFamily: FONTS.extrabold,
          color:      COLORS.text,
        },
        headerStyle: {
          backgroundColor: COLORS.surface,
        },
        headerShadowVisible: false,
        headerRight: undefined,
      })}
    >
      <Tab.Screen name="Play"    component={HomeScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Games"   component={GamesTabScreen} />
      <Tab.Screen name="Social"  component={FriendsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
