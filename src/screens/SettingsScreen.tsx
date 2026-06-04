import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import { patchUser, checkUsernameAvailable } from '../storage/userStorage';
import { showToast } from '../components/Toast';
import { COLORS, FONTS, SPACING, RADIUS } from '../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const HAPTICS_KEY = '@icebreaker_haptics';
const ONBOARDED_KEY = '@icebreaker_onboarded';
const PRIVACY_URL = 'https://icebreaker.app/privacy';

export default function SettingsScreen({ navigation }: Props) {
  const { currentUser, setCurrentUser } = useGame();
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(HAPTICS_KEY).then((v) => {
      if (v !== null) setHapticsEnabled(v === 'true');
    });
  }, []);

  const toggleHaptics = (value: boolean) => {
    setHapticsEnabled(value);
    AsyncStorage.setItem(HAPTICS_KEY, String(value));
  };

  const handleChangeUsername = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Change Username',
        'Enter your new username (2-20 characters, letters, numbers, _ only)',
        async (input) => {
          if (!input) return;
          const trimmed = input.trim();
          if (trimmed.length < 2 || trimmed.length > 20 || !/^[a-zA-Z0-9_]{2,20}$/.test(trimmed)) {
            showToast('Invalid username format');
            return;
          }
          try {
            const available = await checkUsernameAvailable(trimmed, currentUser?.id);
            if (!available) {
              showToast('Username already taken');
              return;
            }
            const updated = await patchUser({ username: trimmed });
            if (updated) setCurrentUser(updated);
            showToast('Username updated');
          } catch {
            showToast('Failed to update username');
          }
        },
        'plain-text',
        currentUser?.username ?? '',
      );
    } else {
      // Android fallback — Alert.prompt is iOS-only
      Alert.alert('Change Username', 'To change your username, go to your Profile and tap the edit icon.');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure? This will clear all local data and sign you out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.clear();
            navigation.reset({ index: 0, routes: [{ name: 'UsernameSetup' }] });
          },
        },
      ],
    );
  };

  const handleResetOnboarding = async () => {
    await AsyncStorage.removeItem(ONBOARDED_KEY);
    showToast('Onboarding will show on next launch');
  };

  const handleLogOut = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          navigation.reset({ index: 0, routes: [{ name: 'UsernameSetup' }] });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        {/* ── Account ── */}
        <Text style={s.sectionHeader}>ACCOUNT</Text>

        <TouchableOpacity style={s.row} onPress={handleChangeUsername} activeOpacity={0.7}>
          <Ionicons name="person-outline" size={18} color={COLORS.text2} style={s.rowIcon} />
          <Text style={s.rowLabel}>Change Username</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text2} />
        </TouchableOpacity>

        <TouchableOpacity style={s.row} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={18} color={COLORS.danger} style={s.rowIcon} />
          <Text style={[s.rowLabel, s.dangerText]}>Delete Account</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text2} />
        </TouchableOpacity>

        {/* ── Preferences ── */}
        <Text style={s.sectionHeader}>PREFERENCES</Text>

        <View style={s.row}>
          <Ionicons name="settings-outline" size={18} color={COLORS.text2} style={s.rowIcon} />
          <Text style={s.rowLabel}>Haptic Feedback</Text>
          <Switch
            value={hapticsEnabled}
            onValueChange={toggleHaptics}
            trackColor={{ false: COLORS.border, true: COLORS.accent }}
            thumbColor="#fff"
          />
        </View>

        {/* ── About ── */}
        <Text style={s.sectionHeader}>ABOUT</Text>

        <TouchableOpacity
          style={s.row}
          onPress={() => Linking.openURL(PRIVACY_URL)}
          activeOpacity={0.7}
        >
          <Ionicons name="shield-outline" size={18} color={COLORS.text2} style={s.rowIcon} />
          <Text style={s.rowLabel}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text2} />
        </TouchableOpacity>

        <View style={s.row}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.text2} style={s.rowIcon} />
          <Text style={s.rowLabel}>Version</Text>
          <Text style={s.rowValue}>1.0.0</Text>
        </View>

        <TouchableOpacity style={s.row} onPress={handleResetOnboarding} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={18} color={COLORS.text2} style={s.rowIcon} />
          <Text style={s.rowLabel}>Reset Onboarding</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text2} />
        </TouchableOpacity>

        {/* ── Log Out ── */}
        <TouchableOpacity style={s.logOutBtn} onPress={handleLogOut} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.danger} style={{ marginRight: 8 }} />
          <Text style={s.logOutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  sectionHeader: {
    fontSize: 12,
    fontFamily: FONTS.bold,
    color: COLORS.text3,
    letterSpacing: 2,
    marginBottom: 12,
    marginTop: SPACING.lg,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  rowValue: {
    fontSize: 15,
    fontFamily: FONTS.medium,
    color: COLORS.text2,
  },
  dangerText: {
    color: COLORS.danger,
  },

  logOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + '44',
    paddingVertical: 16,
    marginTop: SPACING.xl,
  },
  logOutText: {
    fontSize: 15,
    fontFamily: FONTS.bold,
    color: COLORS.danger,
  },
});
