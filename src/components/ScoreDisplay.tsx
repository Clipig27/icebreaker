import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Player } from '../types';
import { COLORS } from '../constants/theme';

interface Props {
  players: Player[];
  highlightId?: string;
}

export default function ScoreDisplay({ players, highlightId }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <View style={styles.container}>
      {sorted.map((p, i) => (
        <View
          key={p.id}
          style={[styles.row, p.id === highlightId && styles.highlighted]}
        >
          {p.id === highlightId && <View style={styles.accentBar} />}
          <Text style={styles.rank}>#{i + 1}</Text>
          <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
          <Text style={[styles.score, { color: i === 0 ? COLORS.accentHi : COLORS.text2 }]}>
            {p.score} pts
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    overflow: 'hidden',
  },
  highlighted: {
    backgroundColor: COLORS.accent + '12',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: COLORS.accent,
  },
  rank: {
    color: COLORS.text3,
    fontSize: 12,
    fontWeight: '600',
    width: 30,
  },
  name: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
  score: {
    fontSize: 14,
    fontWeight: '700',
  },
});
