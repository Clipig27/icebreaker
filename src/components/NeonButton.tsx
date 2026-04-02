import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { COLORS } from '../constants/theme';

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

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      style={[
        styles.base,
        isGhost ? styles.ghost : styles.solid,
        disabled && styles.disabled,
        size === 'sm' && styles.sizeSm,
        size === 'lg' && styles.sizeLg,
        style,
      ]}
    >
      <Text style={[styles.text, isGhost && styles.ghostText, textStyle]}>
        {title}
      </Text>
    </TouchableOpacity>
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
    fontWeight: '700',
  },
  ghostText: {
    color: COLORS.text2,
    fontSize: 16,
    fontWeight: '600',
  },
});
