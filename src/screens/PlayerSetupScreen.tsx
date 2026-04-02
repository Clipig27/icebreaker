import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import PrimaryButton from '../components/PrimaryButton';
import PlayerTag from '../components/PlayerTag';
import { COLORS } from '../constants/theme';
import { Player } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PlayerSetup'>;
};

export default function PlayerSetupScreen({ navigation }: Props) {
  const { setPlayers } = useGame();
  const [players, setLocalPlayers] = useState<Player[]>([]);
  const [input, setInput] = useState('');

  const addPlayer = () => {
    const name = input.trim();
    if (!name) return;
    if (players.length >= 10) {
      Alert.alert('Max Players', 'Maximum of 10 players allowed.');
      return;
    }
    if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Duplicate Name', 'That name is already taken.');
      return;
    }
    setLocalPlayers(prev => [
      ...prev,
      { id: String(Date.now()), name, score: 0 },
    ]);
    setInput('');
  };

  const removePlayer = (id: string) => {
    setLocalPlayers(prev => prev.filter(p => p.id !== id));
  };

  const handleContinue = () => {
    setPlayers(players);
    navigation.navigate('GameSelect');
  };

  const canContinue = players.length >= 3;
  const need = 3 - players.length;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Who's playing?</Text>
          <Text style={styles.subtitle}>
            {players.length}/10{'  ·  '}min 3 to start
          </Text>

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={addPlayer}
              placeholder="Enter name..."
              placeholderTextColor={COLORS.text3}
              returnKeyType="done"
              maxLength={20}
              autoCorrect={false}
              autoCapitalize="words"
            />
            <TouchableOpacity
              style={[styles.addBtn, !input.trim() && styles.addBtnDim]}
              onPress={addPlayer}
              disabled={!input.trim()}
              activeOpacity={0.75}
            >
              <Text style={styles.addBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Player list */}
          <FlatList
            data={players}
            keyExtractor={item => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => (
              <PlayerTag
                name={item.name}
                index={index}
                onRemove={() => removePlayer(item.id)}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyHint}>Add players above to get started.</Text>
            }
          />

          <PrimaryButton
            title={canContinue ? 'Continue →' : `Need ${need} more player${need !== 1 ? 's' : ''}`}
            onPress={handleContinue}
            disabled={!canContinue}
            style={styles.continueBtn}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
  },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: COLORS.text2, marginTop: 4, marginBottom: 20 },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  addBtn: {
    width: 52,
    height: 52,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDim: { backgroundColor: COLORS.border },
  addBtnText: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', lineHeight: 32 },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 12,
  },
  list: { flex: 1 },
  listContent: { gap: 8 },
  emptyHint: {
    color: COLORS.text3,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
    fontStyle: 'italic',
  },
  continueBtn: { marginTop: 16 },
});
