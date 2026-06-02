import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Player } from '../types';
import { COLORS, FONTS } from '../constants/theme';

interface Props {
  players: Player[];
  highlightId?: string;
}

export default function ScoreDisplay({ players, highlightId }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <View style={styles.container}>
      {sorted.map((p, i) => {
        const isMe = p.id === highlightId;
        return (
          <View
            key={p.id}
            style={[styles.row, isMe && styles.highlighted]}
          >
            <Text style={[styles.rank, isMe && styles.rankMe]}>#{i + 1}</Text>
            <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>{p.name}</Text>
            {isMe && <Text style={styles.youBadge}>YOU</Text>}
            <Text style={[styles.score, { color: i === 0 ? COLORS.accentHi : COLORS.text2 }, isMe && styles.scoreMe]}>
              {p.score} pts
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  highlighted: {
    backgroundColor: '#2a2000',
    borderWidth: 1.5,
    borderColor: COLORS.warning,
  },
  rank: {
    color: COLORS.text3,
    fontSize: 12,
    fontFamily: FONTS.semibold,
    width: 30,
  },
  rankMe: {
    color: COLORS.warning,
  },
  name: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: FONTS.semibold,
  },
  nameMe: {
    color: COLORS.warning,
    fontFamily: FONTS.bold,
  },
  youBadge: {
    fontSize: 10,
    fontFamily: FONTS.extrabold,
    color: COLORS.warning,
    backgroundColor: COLORS.warning + '22',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginRight: 8,
    letterSpacing: 0.5,
  },
  score: {
    fontSize: 14,
    fontFamily: FONTS.bold,
  },
  scoreMe: {
    color: COLORS.warning,
  },
});
