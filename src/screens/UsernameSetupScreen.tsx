import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { checkUsernameAvailable, upsertProfile } from '../storage/userStorage';
import { useGame } from '../context/GameContext';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import { supabase } from '../lib/supabase';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'UsernameSetup'>;
};

const USERNAME_RE = /^[a-zA-Z0-9_]{2,20}$/;

function validate(val: string): string {
  if (val.length < 2)       return 'At least 2 characters required';
  if (val.length > 20)      return 'Max 20 characters';
  if (!USERNAME_RE.test(val)) return 'Letters, numbers, and _ only';
  return '';
}

export default function UsernameSetupScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [error, setError]       = useState('');
  const [saving, setSaving]     = useState(false);
  const { setCurrentUser }      = useGame();

  const handleChange = (val: string) => {
    setUsername(val);
    if (error) setError(validate(val.trim()));
  };

  const handleSave = async () => {
    const trimmed = username.trim();
    const err = validate(trimmed);
    if (err) { setError(err); return; }

    setSaving(true);
    try {
      // 1. Require an active session (created on app startup)
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        setError('No active session. Please restart the app.');
        return;
      }

      // 2. Enforce case-insensitive uniqueness
      const available = await checkUsernameAvailable(trimmed);
      if (!available) {
        setError('That username is already taken. Try another.');
        return;
      }

      // 3. Upsert profile row (sets id, username, username_lower, updated_at)
      const profile = await upsertProfile(user.id, trimmed);

      // 4. Sync app state
      setCurrentUser(profile);

      // 5. Replace so the user can't navigate back to setup
      navigation.replace('MainTabs');
    } catch (err) {
      console.error('SAVE USER ERROR:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.emoji}>⚡</Text>
          <Text style={styles.title}>Pick a username</Text>
          <Text style={styles.sub}>
            This is how you'll appear in every game.{'\n'}
            Letters, numbers, and _ only.
          </Text>

          <TextInput
            style={[styles.input, error ? styles.inputError : undefined]}
            placeholder="coolname_99"
            placeholderTextColor={COLORS.text3}
            value={username}
            onChangeText={handleChange}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            keyboardAppearance="dark"
          />
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.btn, (!username.trim() || saving) && styles.btnDisabled]}
            onPress={handleSave}
            disabled={!username.trim() || saving}
          >
            <Text style={styles.btnText}>{saving ? 'Saving…' : "Let's Go →"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  kav:  { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: 12,
  },
  emoji: { fontSize: 52, marginBottom: 8 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 14,
    color: COLORS.text2,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  input: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
    padding: SPACING.md,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  inputError: { borderColor: COLORS.danger },
  errorText: { fontSize: 13, color: COLORS.danger, textAlign: 'center' },
  btn: {
    width: '100%',
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
