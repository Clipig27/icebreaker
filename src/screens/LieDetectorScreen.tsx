import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { useGame } from '../context/GameContext';
import socket from '../socket';
import PrimaryButton from '../components/PrimaryButton';
import SecondaryButton from '../components/SecondaryButton';
import ScoreDisplay from '../components/ScoreDisplay';
import { COLORS } from '../constants/theme';
import { LIE_DETECTOR_PROMPTS } from '../constants/prompts';
import { Player } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'LieDetector'>;
};

type Choice = 'truth' | 'lie';

interface LDVote {
  playerId: string;
  playerName: string;
  vote: Choice;
}

interface LDPoints {
  playerId: string;
  playerName: string;
  points: number;
}

interface LDGameState {
  game: 'lieDetector';
  phase: 'speaker-choice' | 'voting' | 'results';
  prompt: string;
  speakerIndex: number;
  // Who has voted so far (content kept secret until results)
  votedPlayerIds: string[];
  // Populated only in results phase
  speakerChoice?: Choice;
  votes?: LDVote[];
  pointsAwarded?: LDPoints[];
}

function pickPrompt(used: Set<number>): { prompt: string; index: number } {
  const all = LIE_DETECTOR_PROMPTS.map((_, i) => i);
  const available = all.filter(i => !used.has(i));
  const pool = available.length > 0 ? available : all;
  if (available.length === 0) used.clear();
  const index = pool[Math.floor(Math.random() * pool.length)];
  return { prompt: LIE_DETECTOR_PROMPTS[index], index };
}

function calcResults(
  votes: LDVote[],
  speakerChoice: Choice,
  speaker: Player,
  nonSpeakers: Player[]
): LDPoints[] {
  const incorrect = votes.filter(v => v.vote !== speakerChoice).length;
  const correct = votes.filter(v => v.vote === speakerChoice).length;
  const majorityWrong = incorrect > correct;
  const records: LDPoints[] = [
    { playerId: speaker.id, playerName: speaker.name, points: majorityWrong ? 1 : 0 },
  ];
  for (const p of nonSpeakers) {
    const vote = votes.find(v => v.playerId === p.id);
    records.push({
      playerId: p.id,
      playerName: p.name,
      points: vote?.vote === speakerChoice ? 1 : 0,
    });
  }
  return records;
}

export default function LieDetectorScreen({ navigation }: Props) {
  const { players, room, isHost, sendGameState, sendPlayerAction, setPlayers, updateRoomScores } = useGame();
  const myId = socket.id;

  // Host-only secrets — never pushed to gameState until results
  const speakerChoiceRef = useRef<Choice | null>(null);
  const votesRef = useRef<LDVote[]>([]);
  const usedPromptsRef = useRef(new Set<number>());

  // Refs so socket handler always sees latest values without stale closures
  const gsRef = useRef<LDGameState | null>(null);
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);


  const gs = (room?.gameState?.game === 'lieDetector' ? room.gameState : null) as LDGameState | null;
  useEffect(() => { gsRef.current = gs; }, [gs]);

  // Setup timeout — if the game state hasn't arrived after 8 s, the socket is likely down
  const [setupTimedOut, setSetupTimedOut] = useState(false);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (gs?.prompt) {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
      return;
    }
    setupTimerRef.current = setTimeout(() => setSetupTimedOut(true), 8_000);
    return () => {
      if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
    };
  }, [!!gs?.prompt]);

  // ── Host: initialize secrets — server owns the initial gameState ──────────
  useEffect(() => {
    if (!isHost) return;
    speakerChoiceRef.current = null;
    votesRef.current = [];
  }, []);

  // Mark the server's initial prompt as used so handleNextPlayer never repeats it
  useEffect(() => {
    if (!isHost || !gs?.prompt) return;
    const idx = LIE_DETECTOR_PROMPTS.indexOf(gs.prompt);
    if (idx >= 0) usedPromptsRef.current.add(idx);
  }, [!!gs?.prompt]); // eslint-disable-line

  // ── Host: handle player actions ───────────────────────────────────────────
  useEffect(() => {
    if (!isHost) return;

    const handler = ({ playerId, action, data }: any) => {
      const state = gsRef.current;
      const allPlayers = playersRef.current;
      if (!state) return;

      // Speaker secretly chose truth or lie
      if (action === 'ld-choice' && state.phase === 'speaker-choice') {
        speakerChoiceRef.current = data.choice;
        votesRef.current = [];
        const next: LDGameState = { ...state, phase: 'voting', votedPlayerIds: [] };
        gsRef.current = next;
        sendGameState(next);
      }

      // A voter cast their vote
      if (action === 'ld-vote' && state.phase === 'voting') {
        if (state.votedPlayerIds.includes(playerId)) return; // ignore duplicate
        const voter = allPlayers.find(p => p.id === playerId);
        if (!voter) return;
        votesRef.current = [...votesRef.current, { playerId, playerName: voter.name, vote: data.vote }];
        const newVotedIds = [...state.votedPlayerIds, playerId];
        const nonSpeakers = allPlayers.filter((_, i) => i !== state.speakerIndex);

        if (newVotedIds.length >= nonSpeakers.length) {
          // All voted — compute results and reveal
          const speaker = allPlayers[state.speakerIndex];
          const results = calcResults(votesRef.current, speakerChoiceRef.current!, speaker, nonSpeakers);
          const updatedPlayers = allPlayers.map(p => {
            const r = results.find(r => r.playerId === p.id);
            return r && r.points > 0 ? { ...p, score: p.score + r.points } : p;
          });
          setPlayers(updatedPlayers);
          updateRoomScores(updatedPlayers);
          const next: LDGameState = {
            ...state,
            phase: 'results',
            votedPlayerIds: newVotedIds,
            speakerChoice: speakerChoiceRef.current!,
            votes: votesRef.current,
            pointsAwarded: results,
          };
          gsRef.current = next;
          sendGameState(next);
        } else {
          const next: LDGameState = { ...state, votedPlayerIds: newVotedIds };
          gsRef.current = next;
          sendGameState(next);
        }
      }
    };

    socket.on('playerActionReceived', handler);
    return () => { socket.off('playerActionReceived', handler); };
  }, [isHost]); // eslint-disable-line

  // ── Host: advance to next player ──────────────────────────────────────────
  const handleNextPlayer = () => {
    if (!isHost || !gs) return;
    const nextIdx = (gs.speakerIndex + 1) % players.length;
    const { prompt, index } = pickPrompt(usedPromptsRef.current);
    usedPromptsRef.current.add(index);
    speakerChoiceRef.current = null;
    votesRef.current = [];
    const next: LDGameState = {
      game: 'lieDetector',
      phase: 'speaker-choice',
      prompt,
      speakerIndex: nextIdx,
      votedPlayerIds: [],
    };
    gsRef.current = next;
    sendGameState(next);
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!gs || !gs.prompt) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          {setupTimedOut ? (
            <>
              <Text style={styles.waitTitle}>Could not load game</Text>
              <Text style={styles.waitSub}>Lost connection to the server. Check your network and try again.</Text>
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
                <Text style={[styles.waitSub, { textDecorationLine: 'underline' }]}>← Go back</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.waitTitle}>Setting up...</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const speaker = players[gs.speakerIndex ?? 0];
  const nonSpeakers = players.filter((_, i) => i !== (gs.speakerIndex ?? 0));
  const iAmSpeaker = myId === speaker?.id;

  // ── Phase: speaker-choice ──────────────────────────────────────────────────
  if (gs.phase === 'speaker-choice') {
    if (iAmSpeaker) {
      return (
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🎤 Your turn, {speaker.name}</Text>
            </View>
            <Text style={styles.sectionLabel}>Your prompt</Text>
            <View style={styles.promptBox}>
              <Text style={styles.promptText}>{gs.prompt}</Text>
            </View>
            <Text style={styles.instruction}>Answer out loud. Then secretly choose:</Text>
            <View style={styles.choiceRow}>
              <TouchableOpacity
                style={[styles.choiceBtn, styles.truthBtn]}
                onPress={() => sendPlayerAction('ld-choice', { choice: 'truth' })}
                activeOpacity={0.78}
              >
                <Text style={styles.choiceIcon}>✓</Text>
                <Text style={[styles.choiceBtnText, { color: COLORS.success }]}>TRUTH</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.choiceBtn, styles.lieBtn]}
                onPress={() => sendPlayerAction('ld-choice', { choice: 'lie' })}
                activeOpacity={0.78}
              >
                <Text style={styles.choiceIcon}>✗</Text>
                <Text style={[styles.choiceBtnText, { color: COLORS.danger }]}>LIE</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.waitEmoji}>🎤</Text>
          <Text style={styles.waitTitle}>{speaker?.name} is deciding...</Text>
          <Text style={styles.waitSub}>They'll answer their prompt, then choose secretly.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: voting ──────────────────────────────────────────────────────────
  if (gs.phase === 'voting') {
    const iHaveVoted = (gs.votedPlayerIds ?? []).includes(myId ?? '');
    const votesIn = (gs.votedPlayerIds ?? []).length;
    const totalVoters = nonSpeakers.length;

    if (iAmSpeaker) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>🔒</Text>
            <Text style={styles.waitTitle}>Your secret is safe.</Text>
            <Text style={styles.waitSub}>{votesIn} / {totalVoters} players have voted</Text>
          </View>
        </SafeAreaView>
      );
    }

    if (iHaveVoted) {
      return (
        <SafeAreaView style={styles.safe}>
          <View style={styles.centered}>
            <Text style={styles.waitEmoji}>✅</Text>
            <Text style={styles.waitTitle}>You voted!</Text>
            <Text style={styles.waitSub}>{votesIn} / {totalVoters} players have voted</Text>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.votingScreen}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🗳️ Your vote</Text>
          </View>
          <View style={styles.promptQuote}>
            <Text style={styles.promptQuoteText}>"{gs.prompt}"</Text>
          </View>
          <Text style={styles.votingQuestion}>{speaker?.name} answered. Truth or lie?</Text>
          <View style={styles.choiceRow}>
            <TouchableOpacity
              style={[styles.choiceBtn, styles.truthBtn]}
              onPress={() => sendPlayerAction('ld-vote', { vote: 'truth' })}
              activeOpacity={0.75}
            >
              <Text style={styles.choiceIcon}>✓</Text>
              <Text style={[styles.choiceBtnText, { color: COLORS.success }]}>TRUTH</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.choiceBtn, styles.lieBtn]}
              onPress={() => sendPlayerAction('ld-vote', { vote: 'lie' })}
              activeOpacity={0.75}
            >
              <Text style={styles.choiceIcon}>✗</Text>
              <Text style={[styles.choiceBtnText, { color: COLORS.danger }]}>LIE</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.voterProgress}>{votesIn} / {totalVoters} voted</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Phase: results ─────────────────────────────────────────────────────────
  const truthVotes = (gs.votes ?? []).filter(v => v.vote === 'truth').length;
  const lieVotes = (gs.votes ?? []).filter(v => v.vote === 'lie').length;
  const pointWinners = (gs.pointsAwarded ?? []).filter(r => r.points > 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.resultsTitle}>The verdict.</Text>

        <View style={styles.revealRow}>
          <Text style={styles.revealLabel}>{speaker?.name} chose</Text>
          <Text style={[styles.revealChoice, { color: gs.speakerChoice === 'truth' ? COLORS.success : COLORS.danger }]}>
            {gs.speakerChoice?.toUpperCase()}
          </Text>
        </View>

        <View style={styles.tallyRow}>
          <View style={styles.tallyBox}>
            <Text style={[styles.tallyNum, { color: COLORS.success }]}>{truthVotes}</Text>
            <Text style={styles.tallyWord}>TRUTH</Text>
          </View>
          <View style={styles.tallyBox}>
            <Text style={[styles.tallyNum, { color: COLORS.danger }]}>{lieVotes}</Text>
            <Text style={styles.tallyWord}>LIE</Text>
          </View>
        </View>

        <View style={styles.pointsBlock}>
          <Text style={styles.sectionLabel}>Points</Text>
          {pointWinners.length > 0 ? (
            pointWinners.map(r => (
              <View key={r.playerId} style={styles.pointRow}>
                <Text style={styles.pointPlus}>+1</Text>
                <Text style={styles.pointName}>{r.playerName}</Text>
                {r.playerId === speaker?.id && <Text style={styles.pointTag}>fooled the crowd</Text>}
              </View>
            ))
          ) : (
            <Text style={styles.noPoints}>No points this round.</Text>
          )}
        </View>

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>Scores</Text>
        <ScoreDisplay players={players} />

        <View style={styles.actions}>
          {isHost ? (
            <>
              <PrimaryButton title="Next Player →" onPress={handleNextPlayer} />
              <SecondaryButton title="Back to Games" onPress={() => navigation.goBack()} />
            </>
          ) : (
            <Text style={styles.waitSub}>Waiting for host to continue...</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 24,
  },
  votingScreen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  waitEmoji: { fontSize: 52 },
  waitTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  waitSub: { fontSize: 14, color: COLORS.text2, textAlign: 'center', lineHeight: 20 },
  badge: {
    backgroundColor: COLORS.surface2,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  badgeText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text3,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  promptBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderHi,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  promptText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.text,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  instruction: { fontSize: 14, color: COLORS.text2, lineHeight: 22 },
  choiceRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  choiceBtn: {
    flex: 1,
    height: 130,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    gap: 8,
  },
  truthBtn: { backgroundColor: '#071d0f', borderColor: COLORS.success },
  lieBtn: { backgroundColor: '#1d0710', borderColor: COLORS.danger },
  choiceIcon: { fontSize: 22, color: COLORS.text },
  choiceBtnText: { fontSize: 22, fontWeight: '900' },
  promptQuote: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.text3,
    paddingLeft: 12,
  },
  promptQuoteText: { fontSize: 15, fontWeight: '500', color: COLORS.text2, lineHeight: 22 },
  votingQuestion: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 8 },
  voterProgress: { fontSize: 13, color: COLORS.text3, textAlign: 'center', marginTop: 'auto' },
  resultsTitle: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: COLORS.text },
  revealRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  revealLabel: { fontSize: 13, color: COLORS.text2 },
  revealChoice: { fontSize: 32, fontWeight: '900' },
  tallyRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  tallyBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  tallyNum: { fontSize: 36, fontWeight: '900' },
  tallyWord: { fontSize: 11, fontWeight: '600', color: COLORS.text3, textTransform: 'uppercase', letterSpacing: 1.5 },
  pointsBlock: { gap: 8 },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointPlus: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  pointName: { fontSize: 15, fontWeight: '600', color: COLORS.text, flex: 1 },
  pointTag: { fontSize: 12, color: COLORS.text3, fontStyle: 'italic' },
  noPoints: { fontSize: 14, color: COLORS.text2, fontStyle: 'italic' },
  divider: { height: 1, backgroundColor: COLORS.border },
  actions: { gap: 10, marginTop: 8, alignItems: 'center' },
});
