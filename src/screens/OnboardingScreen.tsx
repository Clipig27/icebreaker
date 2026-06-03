import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ONBOARDING_KEY = '@icebreaker_onboarded';

interface OnboardingPage {
  emoji: string;
  title: string;
  subtitle: string;
  showButton?: boolean;
}

const PAGES: OnboardingPage[] = [
  {
    emoji: '⚡',
    title: 'Break the Ice',
    subtitle:
      'The party game that brings people together. Host a room, invite friends, and play 10+ unique games.',
  },
  {
    emoji: '🎮',
    title: 'Play Together',
    subtitle:
      'From lie detectors to word chains — every game is designed for laughs, debates, and surprises.',
  },
  {
    emoji: '🚀',
    title: 'Ready to Play?',
    subtitle:
      'Create your username and start hosting games in seconds.',
    showButton: true,
  },
];

function PageItem({ item, index }: { item: OnboardingPage; index: number }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleLetsGo = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    navigation.replace('UsernameSetup');
  }, [navigation]);

  return (
    <Animated.View
      entering={FadeIn.duration(400).delay(100)}
      style={styles.page}
    >
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
      {item.showButton && (
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.8}
          onPress={handleLetsGo}
        >
          <Text style={styles.buttonText}>Let's Go →</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleSkip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    navigation.replace('UsernameSetup');
  }, [navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Skip button — visible on pages 1 & 2 */}
      {activeIndex < 2 && (
        <TouchableOpacity
          style={[styles.skipButton, { top: insets.top + SPACING.sm }]}
          onPress={handleSkip}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={flatListRef}
        data={PAGES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => <PageItem item={item} index={index} />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        bounces={false}
      />

      {/* Dot indicators */}
      <View style={styles.dots}>
        {PAGES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === activeIndex ? COLORS.accent : COLORS.border },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  skipButton: {
    position: 'absolute',
    right: SPACING.lg,
    zIndex: 10,
  },
  skipText: {
    color: COLORS.text2,
    fontFamily: FONTS.semibold,
    fontSize: 15,
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emoji: {
    fontSize: 64,
    marginBottom: SPACING.lg,
  },
  title: {
    fontFamily: FONTS.extrabold,
    fontSize: 28,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  button: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.accent,
    height: 54,
    borderRadius: 14,
    paddingHorizontal: SPACING.xl,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 200,
  },
  buttonText: {
    color: COLORS.text,
    fontFamily: FONTS.extrabold,
    fontSize: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
