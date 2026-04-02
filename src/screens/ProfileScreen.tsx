import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabParamList } from '../navigation/MainTabs';
import type { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import { getFriends } from '../storage/friendStorage';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

type Props = {
  navigation: CompositeNavigationProp<
    BottomTabNavigationProp<TabParamList, 'Profile'>,
    NativeStackNavigationProp<RootStackParamList>
  >;
};

export default function ProfileScreen({ navigation }: Props) {
  const { currentUser } = useGame();
  const [friendsCount, setFriendsCount] = useState<number | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    getFriends()
      .then(f => setFriendsCount(f.length))
      .catch(() => setFriendsCount(null));
  }, [currentUser?.id]);

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
      <View style={s.container}>
        <Text style={s.screenLabel}>PROFILE</Text>

        {/* Avatar placeholder */}
        <View style={s.avatarCircle}>
          <Text style={s.avatarInitials}>{initials}</Text>
        </View>

        {/* Username + pro badge */}
        <View style={s.nameRow}>
          <Text style={s.username}>{currentUser.username}</Text>
          {currentUser.isPro && (
            <View style={s.proBadge}>
              <Text style={s.proBadgeText}>PRO</Text>
            </View>
          )}
        </View>

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

  // Name
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
