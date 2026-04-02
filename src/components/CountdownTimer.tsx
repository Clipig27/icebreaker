import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

interface Props {
  seconds: number;
  onComplete: () => void;
}

export default function CountdownTimer({ seconds, onComplete }: Props) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setTimeLeft(seconds);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          // defer to avoid state update during render
          setTimeout(() => onCompleteRef.current(), 50);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds]);

  const ratio = timeLeft / seconds;
  const color =
    ratio > 0.6 ? COLORS.success : ratio > 0.3 ? COLORS.warning : COLORS.danger;

  return (
    <View style={styles.container}>
      <Text style={[styles.number, { color }]}>{timeLeft}</Text>
      <Text style={styles.label}>sec</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  number: { fontSize: 80, fontWeight: '900', letterSpacing: -3 },
  label: { fontSize: 12, color: COLORS.text3, fontWeight: '500', marginTop: -8 },
});
