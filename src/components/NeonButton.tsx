import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS } from '../constants/theme';

type Variant = 'primary' | 'secondary' | 'truth' | 'lie' | 'danger' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function NeonButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  style,
  textStyle,
}: Props) {
  const isGhost = variant === 'ghost' || variant === 'outline';
  const scale = useSharedValue(1);

  const onPressIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSpring(0.94, { damping: 15, stiffness: 400 });
  };

  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={disabled ? undefined : onPressIn}
        onPressOut={disabled ? undefined : onPressOut}
        style={[
          styles.base,
          isGhost ? styles.ghost : styles.solid,
          disabled && styles.disabled,
          size === 'sm' && styles.sizeSm,
          size === 'lg' && styles.sizeLg,
        ]}
      >
        <Text style={[styles.text, isGhost && styles.ghostText, textStyle]}>
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  solid: {
    backgroundColor: COLORS.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.borderHi,
  },
  disabled: { opacity: 0.4 },
  sizeSm: { height: 42 },
  sizeLg: { height: 54 },
  text: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: FONTS.bold,
  },
  ghostText: {
    color: COLORS.text2,
    fontSize: 16,
    fontFamily: FONTS.semibold,
  },
});
