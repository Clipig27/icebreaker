import React from 'react';
import { View, Text, Pressable, StyleSheet, InputAccessoryView, Keyboard, Platform } from 'react-native';

export const KB_DONE_ID = 'ib-keyboard-done';

/**
 * Renders a dark-themed toolbar above the iOS keyboard with a "Done" button
 * that dismisses the keyboard. Invisible on Android (Android handles this
 * differently per-keyboard and has its own done key on the toolbar).
 *
 * Usage:
 *   1. Add inputAccessoryViewID={KB_DONE_ID} + keyboardAppearance="dark" to your TextInput
 *   2. Render <KeyboardDoneBar /> anywhere in the same screen component
 */
export function KeyboardDoneBar() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KB_DONE_ID}>
      <View style={s.bar}>
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={10} style={s.btn}>
          <Text style={s.label}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const s = StyleSheet.create({
  bar: {
    backgroundColor: '#120E22',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(124, 92, 246, 0.35)',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  btn: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  label: {
    color: '#A78BFA',
    fontSize: 16,
    fontWeight: '600',
  },
});
