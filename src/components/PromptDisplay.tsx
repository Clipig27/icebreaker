import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

interface Props {
  text: string;
  size?: 'lg' | 'md';
}

export default function PromptDisplay({ text, size = 'lg' }: Props) {
  return (
    <Text style={[styles.base, size === 'lg' ? styles.lg : styles.md]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 8,
    color: COLORS.text,
  },
  lg: {
    fontSize: 28,
    fontFamily: FONTS.extrabold,
    lineHeight: 38,
  },
  md: {
    fontSize: 20,
    fontFamily: FONTS.bold,
    lineHeight: 28,
  },
});
