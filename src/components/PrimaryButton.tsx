import React, { useRef } from 'react';
import { Animated, Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function PrimaryButton({ title, onPress, disabled = false, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, {
      toValue: 0.94,
      speed: 60,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 18,
      bounciness: 10,
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
          { backgroundColor: disabled ? COLORS.surface : COLORS.accent },
          disabled && styles.disabled,
        ]}
      >
        <Text style={styles.text}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
