import React, { useEffect, useRef } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  phaseKey: string;
  children: React.ReactNode;
  style?: any;
}

/**
 * Wraps children in a fade+slide animation that triggers
 * every time `phaseKey` changes.
 */
export default function PhaseTransition({ phaseKey, children, style }: Props) {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const prevPhase = useRef(phaseKey);

  useEffect(() => {
    if (prevPhase.current !== phaseKey) {
      prevPhase.current = phaseKey;
      // Reset to invisible
      opacity.value = 0;
      translateY.value = 10;
      // Fade in
      opacity.value = withTiming(1, { duration: 300 });
      translateY.value = withTiming(0, { duration: 300 });
    }
  }, [phaseKey]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animStyle, style]}>
      {children}
    </Animated.View>
  );
}
