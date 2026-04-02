import React, { useRef } from 'react';
import { Animated, Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  color?: string;
}

export default function SecondaryButton({ title, onPress, disabled = false, style, color }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95,
      speed: 60,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 18,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={disabled ? undefined : onPressIn}
        onPressOut={disabled ? undefined : onPressOut}
        style={[
          styles.btn,
          { borderColor: color ?? COLORS.borderHi },
        ]}
      >
        <Text style={[styles.text, { color: color ?? COLORS.text2 }]}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});
