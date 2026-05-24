import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Animated,
  ScrollView, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

type Game = {
  id: string;
  title: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  accentColor: string;
  desc: string;
  players: string;
  instructions: string[];
};

const GAMES: Game[] = [
  {
    id: 'lieDetector',
    title: 'Lie Detector',
    iconName: 'eye',
    accentColor: '#9D80FF',
    desc: 'Answer a prompt — then fool everyone into guessing wrong.',
    players: '3+ players',
    instructions: [
      'A prompt is shown to everyone (e.g. "What is your biggest fear?").',
      'Each player secretly writes their real answer AND a fake one.',
      'Answers are read aloud. The group votes on which answer is the lie.',
      'Score points for every person you fool.',
      'The player with the most points at the end wins.',
    ],
  },
  {
    id: 'talentShow',
    title: 'Talent Show',
    iconName: 'musical-notes',
    accentColor: '#EC4899',
    desc: 'Perform a challenge. Survive the buzz. Win the crowd.',
    players: '3+ players',
    instructions: [
      'Each round, a random challenge card is drawn (e.g. "Do your best robot impression").',
      'Every player performs the challenge — no skipping.',
      'The group votes on the best and worst performance.',
      'Best performer gains points. Worst performer loses one.',
      'Play as many rounds as you like. Highest score wins.',
    ],
  },
  {
    id: 'standOut',
    title: 'Stand Out',
    iconName: 'flash',
    accentColor: '#F59E0B',
    desc: 'Give a unique answer or get penalised. First to 100 wins.',
    players: '3+ players',
    instructions: [
      'A question is asked (e.g. "Name a breakfast food").',
      'Everyone secretly writes an answer.',
      'Answers are revealed simultaneously.',
      'If your answer matches anyone else\'s, you score nothing.',
      'Unique answers score 10 points. First to 100 wins.',
    ],
  },
  {
    id: 'numberGuessor',
    title: 'Number Guessor',
    iconName: 'stats-chart',
    accentColor: '#06B6D4',
    desc: 'One player sets a number. Everyone else guesses it.',
    players: '3+ players',
    instructions: [
      'One player (the host) secretly picks a number within a set range.',
      'All other players take turns guessing the number.',
      'After each guess, the host says "Higher" or "Lower".',
      'The player who guesses correctly wins the round.',
      'Rotate the host role each round. Most wins takes the game.',
    ],
  },
  {
    id: 'pieCharts',
    title: 'Pie Charts',
    iconName: 'pie-chart',
    accentColor: '#10B981',
    desc: "Vote on 'who's most likely' questions. See who gets crowned.",
    players: '3+ players',
    instructions: [
      'A "who is most likely to..." question is shown to everyone.',
      'Each player simultaneously points at (or votes for) someone.',
      'The player with the most votes gets the card.',
      'Collect the most cards to win.',
      'The player voted most often overall is crowned at the end.',
    ],
  },
  {
    id: 'dealOrSteal',
    title: 'Deal or Steal',
    iconName: 'cash',
    accentColor: '#FBBF24',
    desc: 'Deal for mutual gains or steal from Dealers. 4–6 players.',
    players: '4–6 players',
    instructions: [
      'Players are split into Dealers and Stealers at the start.',
      'Each round, Dealers offer a deal — a proposed point split.',
      'Stealers secretly choose to Accept the deal or Steal.',
      'If both sides deal, both gain points.',
      'If a Stealer steals, they take all the points — but risk being caught.',
      'If everyone steals, nobody gets anything.',
      'After several rounds, highest points wins.',
    ],
  },
  {
    id: 'shadowProtocol',
    title: 'Shadow Protocol',
    iconName: 'moon',
    accentColor: '#F43F5E',
    desc: "Social deduction. Find the Shadows before it's too late.",
    players: '6–10 players',
    instructions: [
      'At the start, some players are secretly assigned as Shadows.',
      'Each round, all players discuss who they suspect is a Shadow.',
      'The group votes to eliminate one player.',
      'If a Shadow is eliminated, regular players score a point.',
      'If an innocent is eliminated, the Shadows score a point.',
      'Shadows win if they outlast the regular players.',
      'Regular players win by eliminating all Shadows.',
    ],
  },
];

function GameRow({ game, index, onPress }: { game: Game; index: number; onPress: () => void }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(entrance, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
      delay: index * 55,
    } as any).start();
  }, []);

  const opacity     = entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const translateX  = entrance.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }, { scale: pressScale }] }}>
      <Pressable
        style={s.row}
        onPressIn={() => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
        onPressOut={() => Animated.spring(pressScale, { toValue: 1,    useNativeDriver: true, speed: 20, bounciness: 10 }).start()}
        onPress={onPress}
      >
        <View style={[s.iconBox, { backgroundColor: game.accentColor + '1A', borderColor: game.accentColor + '40' }]}>
          <Ionicons name={game.iconName} size={22} color={game.accentColor} />
        </View>
        <View style={s.info}>
          <Text style={s.gameTitle}>{game.title}</Text>
          <Text style={s.gameDesc}>{game.desc}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.text3} />
      </Pressable>
    </Animated.View>
  );
}

export default function GamesTabScreen() {
  const [selected, setSelected] = useState<Game | null>(null);

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.list}>
        {GAMES.map((game, i) => (
          <React.Fragment key={game.id}>
            {i === 0 && <View style={s.divider} />}
            <GameRow game={game} index={i} onPress={() => setSelected(game)} />
            <View style={s.divider} />
          </React.Fragment>
        ))}
      </ScrollView>

      {/* Detail modal */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        <SafeAreaView style={s.modalSafe}>
          {selected && (
            <>
              <View style={s.modalHeader}>
                <View style={[s.modalIcon, { backgroundColor: selected.accentColor + '22', borderColor: selected.accentColor + '55' }]}>
                  <Ionicons name={selected.iconName} size={28} color={selected.accentColor} />
                </View>
                <View style={s.modalTitleBlock}>
                  <Text style={s.modalTitle}>{selected.title}</Text>
                  <Text style={[s.modalPlayers, { color: selected.accentColor }]}>{selected.players}</Text>
                </View>
                <Pressable style={s.closeBtn} onPress={() => setSelected(null)} hitSlop={12}>
                  <Ionicons name="close" size={20} color={COLORS.text2} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={s.modalBody}>
                <Text style={s.modalDesc}>{selected.desc}</Text>
                <Text style={s.howToPlay}>How to Play</Text>
                {selected.instructions.map((step, i) => (
                  <View key={i} style={s.step}>
                    <View style={[s.stepNum, { backgroundColor: selected.accentColor + '22' }]}>
                      <Text style={[s.stepNumText, { color: selected.accentColor }]}>{i + 1}</Text>
                    </View>
                    <Text style={s.stepText}>{step}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: COLORS.bg },
  list:    { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },

  divider: { height: 1, backgroundColor: COLORS.border },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 14,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info:      { flex: 1 },
  gameTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  gameDesc:  { fontSize: 13, color: COLORS.text2, marginTop: 2 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: '#1C1C1E' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleBlock: { flex: 1 },
  modalTitle:   { fontSize: 22, fontWeight: '800', color: COLORS.text },
  modalPlayers: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalBody:  { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 20 },
  modalDesc:  { fontSize: 15, color: COLORS.text2, lineHeight: 22 },

  howToPlay: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 4,
  },
  step: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumText: { fontSize: 13, fontWeight: '800' },
  stepText:    { flex: 1, fontSize: 15, color: COLORS.text2, lineHeight: 22 },
});
