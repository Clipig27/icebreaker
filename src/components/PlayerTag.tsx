import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

interface Props {
  name: string;
  index?: number;
  onRemove?: () => void;
}

export default function PlayerTag({ name, index, onRemove }: Props) {
  return (
    <View style={styles.row}>
      {index !== undefined && (
        <Text style={styles.index}>{index + 1}</Text>
      )}
      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      {onRemove && (
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.removeHit}
        >
          <Text style={styles.remove}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 46,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  index: {
    color: COLORS.text3,
    fontSize: 12,
    fontWeight: '600',
    width: 20,
    marginRight: 8,
  },
  name: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  removeHit: {
    padding: 4,
  },
  remove: {
    color: COLORS.text2,
    fontSize: 14,
    fontWeight: '600',
  },
});
