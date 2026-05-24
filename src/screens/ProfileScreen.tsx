import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import { getFriends } from '../storage/friendStorage';
import { checkUsernameAvailable, patchUser } from '../storage/userStorage';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Profile'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

const USERNAME_RE = /^[a-zA-Z0-9_]{2,20}$/;

function validateUsername(val: string): string {
  if (val.length < 2) return 'At least 2 characters required';
  if (val.length > 20) return 'Max 20 characters';
  if (!USERNAME_RE.test(val)) return 'Letters, numbers, and _ only';
  return '';
}

export default function ProfileScreen({ navigation }: Props) {
  const { currentUser, setCurrentUser } = useGame();
  const [friendsCount, setFriendsCount] = useState<number | null>(null);

  // Username edit state
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    getFriends()
      .then(f => setFriendsCount(f.length))
      .catch(() => setFriendsCount(null));
  }, [currentUser?.id]);

  const handleStartEdit = () => {
    setNewUsername(currentUser?.username ?? '');
    setUsernameError('');
    setEditingUsername(true);
  };

  const handleCancelEdit = () => {
    setEditingUsername(false);
    setUsernameError('');
  };

  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim();
    const err = validateUsername(trimmed);
    if (err) { setUsernameError(err); return; }
    if (trimmed === currentUser?.username) { setEditingUsername(false); return; }

    setSavingUsername(true);
    try {
      const available = await checkUsernameAvailable(trimmed, currentUser?.id);
      if (!available) {
        setUsernameError('That username is already taken. Try another.');
        return;
      }
      const updated = await patchUser({ username: trimmed });
      if (updated) setCurrentUser(updated);
      setEditingUsername(false);
    } catch {
      setUsernameError('Something went wrong. Please try again.');
    } finally {
      setSavingUsername(false);
    }
  };

  if (!currentUser) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.container}>
          <Text style={s.empty}>No profile loaded.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initials = currentUser.username.slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.container}>
          <Text style={s.screenLabel}>PROFILE</Text>

          {/* Avatar placeholder */}
          <View style={s.avatarCircle}>
            <Text style={s.avatarInitials}>{initials}</Text>
          </View>

          {/* Username + edit */}
          {editingUsername ? (
            <View style={s.editBlock}>
              <TextInput
                style={[s.usernameInput, usernameError ? s.inputError : undefined]}
                value={newUsername}
                onChangeText={(v) => {
                  setNewUsername(v);
                  if (usernameError) setUsernameError(validateUsername(v.trim()));
                }}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={handleSaveUsername}
                placeholder="new username"
                placeholderTextColor={COLORS.text3}
                keyboardAppearance="dark"
              />
              {!!usernameError && <Text style={s.errorText}>{usernameError}</Text>}
              <View style={s.editActions}>
                <TouchableOpacity
                  style={[s.saveBtn, (savingUsername || !newUsername.trim()) && s.btnDisabled]}
                  onPress={handleSaveUsername}
                  disabled={savingUsername || !newUsername.trim()}
                >
                  {savingUsername
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.saveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={handleCancelEdit} disabled={savingUsername}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={s.nameRow} onPress={handleStartEdit} activeOpacity={0.7}>
              <Text style={s.username}>{currentUser.username}</Text>
              {currentUser.isPro && (
                <View style={s.proBadge}>
                  <Text style={s.proBadgeText}>PRO</Text>
                </View>
              )}
              <Text style={s.editPencil}>✏️</Text>
            </TouchableOpacity>
          )}

          {/* Stats */}
          <View style={s.stats}>
            <StatBox label="Trophies" value={currentUser.trophies} />
            <StatBox label="Wins"     value={currentUser.wins} />
            <StatBox label="Played"   value={currentUser.gamesPlayed} />
            <StatBox label="Friends"  value={friendsCount ?? '—'} />
          </View>

          {/* Navigation entry points */}
          <View style={s.links}>
            <TouchableOpacity
              style={s.linkRow}
              onPress={() => navigation.navigate('Social')}
            >
              <Text style={s.linkIcon}>👥</Text>
              <Text style={s.linkLabel}>Friends</Text>
              <Text style={s.linkChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.linkRow}
              onPress={() => navigation.navigate('Social')}
            >
              <Text style={s.linkIcon}>📬</Text>
              <Text style={s.linkLabel}>Friend Requests</Text>
              <Text style={s.linkChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.linkRow, s.linkDisabled]} disabled>
              <Text style={s.linkIcon}>⚙️</Text>
              <Text style={[s.linkLabel, s.linkLabelMuted]}>Settings</Text>
              <Text style={s.linkChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={s.statBox}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl },

  screenLabel: {
    fontSize:      11,
    fontWeight:    '800',
    letterSpacing: 2,
    color:         COLORS.text2,
    marginBottom:  SPACING.xl,
  },

  // Avatar
  avatarCircle: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: COLORS.accent,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    SPACING.md,
  },
  avatarInitials: {
    fontSize:   28,
    fontWeight: '800',
    color:      '#fff',
  },

  // Name row (tap to edit)
  nameRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            SPACING.sm,
    marginBottom:   SPACING.xl,
  },
  username: {
    fontSize:   28,
    fontWeight: '800',
    color:      COLORS.text,
  },
  editPencil: { fontSize: 16 },
  proBadge: {
    backgroundColor: COLORS.warning,
    borderRadius:    RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  proBadgeText: {
    fontSize:      10,
    fontWeight:    '800',
    color:         '#000',
    letterSpacing: 1,
  },

  // Edit block
  editBlock: {
    width: '100%',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  usernameInput: {
    backgroundColor: COLORS.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     2,
    borderColor:     COLORS.accent,
    color:           COLORS.text,
    fontSize:        22,
    fontWeight:      '700',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    letterSpacing:   0.3,
  },
  inputError: { borderColor: COLORS.danger },
  errorText:  { fontSize: 13, color: COLORS.danger },
  editActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  saveBtn: {
    flex:              1,
    backgroundColor:   COLORS.accent,
    borderRadius:      RADIUS.md,
    paddingVertical:   12,
    alignItems:        'center',
  },
  btnDisabled:  { opacity: 0.4 },
  saveBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelBtn: {
    flex:            1,
    backgroundColor: COLORS.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     COLORS.borderHi,
    paddingVertical: 12,
    alignItems:      'center',
  },
  cancelBtnText: { color: COLORS.text2, fontSize: 15, fontWeight: '600' },

  // Stats row
  stats: {
    flexDirection: 'row',
    gap:           SPACING.sm,
    marginBottom:  SPACING.xl,
  },
  statBox: {
    flex:            1,
    backgroundColor: COLORS.surface,
    borderRadius:    RADIUS.md,
    borderWidth:     1,
    borderColor:     COLORS.border,
    paddingVertical: SPACING.sm,
    alignItems:      'center',
  },
  statValue: {
    fontSize:   20,
    fontWeight: '800',
    color:      COLORS.accent,
  },
  statLabel: {
    fontSize:   10,
    color:      COLORS.text2,
    marginTop:  3,
    fontWeight: '600',
  },

  // Entry-point links
  links: { gap: SPACING.sm },
  linkRow: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  COLORS.surface,
    borderRadius:     RADIUS.md,
    borderWidth:      1,
    borderColor:      COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical:   16,
  },
  linkDisabled:   { opacity: 0.45 },
  linkIcon:       { fontSize: 18, marginRight: SPACING.md },
  linkLabel: {
    flex:       1,
    fontSize:   15,
    fontWeight: '600',
    color:      COLORS.text,
  },
  linkLabelMuted: { color: COLORS.text2 },
  linkChevron:    { fontSize: 20, color: COLORS.text2 },

  empty: { color: COLORS.text2, fontSize: 15 },
});
