/**
 * Smoke tests: render every game screen with every phase value.
 * Catches crashes, hooks-after-return bugs, missing imports, and null refs.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

// We need to mock the navigation prop each screen expects
const mockNavigation: any = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn(),
  canGoBack: () => true,
  getParent: () => mockNavigation,
  getState: () => ({ routes: [] }),
  isFocused: () => true,
  reset: jest.fn(),
};
const mockRoute: any = { params: {} };

// Helper: set room game state and render
const { __setMockGameContext } = require('../src/context/GameContext');

function setGameState(gameState: any, extras?: any) {
  __setMockGameContext({
    room: gameState ? {
      code: 'TEST',
      hostId: 'test-user',
      phase: 'playing',
      players: [
        { id: 'test-user', name: 'TestUser' },
        { id: 'player-2', name: 'Player2' },
        { id: 'player-3', name: 'Player3' },
      ],
      gameState,
      ...extras,
    } : null,
    players: [
      { id: 'test-user', name: 'TestUser' },
      { id: 'player-2', name: 'Player2' },
      { id: 'player-3', name: 'Player3' },
    ],
    isHost: true,
    ...extras,
  });
}

// ─── Lie Detector ──────────────────────────────────────────────────────────────

describe('LieDetectorScreen', () => {
  const LieDetectorScreen = require('../src/screens/LieDetectorScreen').default;
  const phases = ['intro', 'setup', 'entering', 'voting', 'results', 'scores', 'game-over'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'lieDetector',
        phase,
        prompt: 'Test prompt',
        speakerIndex: 0,
        playerOrder: ['test-user', 'player-2'],
        totalRounds: 2,
        currentRound: 1,
        votedPlayerIds: [],
        statement1: 'Statement 1',
        statement2: 'Statement 2',
        statementType: 'lietruth',
        votes: [],
        pointsAwarded: [],
      });
      expect(() => render(<LieDetectorScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });
});

// ─── Stand Out ─────────────────────────────────────────────────────────────────

describe('StandOutScreen', () => {
  const StandOutScreen = require('../src/screens/StandOutScreen').default;
  const phases = ['intro', 'prompt', 'entering', 'reveal', 'game-over'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'standOut',
        phase,
        roundNumber: 1,
        currentPrompt: { id: 'test', text: 'Test question', difficulty: 'easy' },
        targetScore: 50,
        submittedPlayerIds: [],
        answers: [],
        roundDeltas: [],
        totalScores: {},
      });
      expect(() => render(<StandOutScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });
});

// ─── Talent Show ───────────────────────────────────────────────────────────────

describe('TalentShowScreen', () => {
  const TalentShowScreen = require('../src/screens/TalentShowScreen').default;
  const phases = ['intro', 'round-intro', 'prep', 'get-ready', 'performing', 'r1-neutral-vote', 'r1-result', 'r2-voting', 'r3-voting', 'winner'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'talentShow',
        phase,
        round: 1,
        challenge: 'Do something funny',
        performers: ['test-user', 'player-2'],
        performerQueue: ['test-user', 'player-2'],
        currentPerformerIdx: 0,
        votes: {},
        results: [],
        advancedIds: [],
        eliminatedIds: [],
        goldenIds: [],
        winner: null,
        votedPlayerIds: [],
        r1Results: [],
        r1NeutralVoterIds: [],
        r1NeutralSubmittedIds: [],
        r2VotedIds: [],
        r3VotedIds: [],
        finalists: [],
      });
      expect(() => render(<TalentShowScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });
});

// ─── Number Guessor ────────────────────────────────────────────────────────────

describe('NumberGuessorScreen', () => {
  const NumberGuessorScreen = require('../src/screens/NumberGuessorScreen').default;
  const phases = ['intro', 'guessing', 'reveal', 'round-end', 'game-over'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'numberGuessor',
        phase,
        round: 1,
        totalRounds: 5,
        currentPrompt: { text: 'How many?', correctAnswer: 42, source: 'test', id: '1' },
        submittedGuesserIds: [],
        totalScores: {},
        guesses: [],
        results: [],
        timerStartedAt: null,
      });
      expect(() => render(<NumberGuessorScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });
});

// ─── Pie Charts ────────────────────────────────────────────────────────────────

describe('PieChartsScreen', () => {
  const PieChartsScreen = require('../src/screens/PieChartsScreen').default;
  const phases = ['intro', 'question-intro', 'voting', 'reveal', 'final-results'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'pieCharts',
        phase,
        round: 1,
        totalRounds: 5,
        questions: [{ id: '1', text: 'Who is most likely to...?' }],
        currentQuestionIdx: 0,
        votes: {},
        votedPlayerIds: [],
        results: [],
        totalVoteCounts: {},
      });
      expect(() => render(<PieChartsScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });
});

// ─── Deal or Steal ─────────────────────────────────────────────────────────────

describe('DealOrStealScreen', () => {
  const DealOrStealScreen = require('../src/screens/DealOrStealScreen').default;
  const phases = ['intro', 'round-intro', 'speaking', 'action', 'round-results', 'game-over'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'dealOrSteal',
        phase,
        round: 1,
        totalRounds: 3,
        balances: { 'test-user': 100, 'player-2': 100 },
        dealerId: 'test-user',
        speakerOrder: ['test-user', 'player-2'],
        currentSpeakerIdx: 0,
        actions: {},
        roundHistory: [],
      });
      expect(() => render(<DealOrStealScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });
});

// ─── Shadow Protocol ───────────────────────────────────────────────────────────

describe('ShadowProtocolScreen', () => {
  const ShadowProtocolScreen = require('../src/screens/ShadowProtocolScreen').default;
  const phases = ['intro', 'role-reveal', 'night', 'day-reveal', 'discussion', 'voting', 'game-over'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'shadowProtocol',
        phase,
        day: 1,
        roles: { 'test-user': 'AGENT', 'player-2': 'SHADOW' },
        alive: ['test-user', 'player-2', 'player-3'],
        votes: {},
        votedPlayerIds: [],
        nightActions: {},
        eliminatedToday: null,
        winner: null,
        log: [],
      });
      expect(() => render(<ShadowProtocolScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });
});

// ─── Pot Luck ──────────────────────────────────────────────────────────────────

describe('PotLuckScreen', () => {
  const PotLuckScreen = require('../src/screens/PotLuckScreen').default;
  const phases = ['intro', 'rolling', 'live', 'reveal', 'gameover'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'potLuck',
        phase,
        round: 1,
        turnOrder: ['test-user', 'player-2'],
        turnIdx: 0,
        pot: 0,
        scores: { 'test-user': 0, 'player-2': 0 },
        currentQuestion: { text: 'What is 2+2?', choices: ['3', '4', '5', '6'], correctIdx: 1, difficulty: 'easy', startingPot: 10 },
        feed: [],
      });
      expect(() => render(<PotLuckScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });
});

// ─── ChainLink ─────────────────────────────────────────────────────────────────

describe('ChainLinkScreen', () => {
  const ChainLinkScreen = require('../src/screens/ChainLinkScreen').default;
  const phases = ['intro', 'playing', 'win'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'chainLink',
        phase,
        hands: { 'test-user': ['word1', 'word2'], 'player-2': ['word3'] },
        chain: [{ word: 'start', by: 'system', reason: '' }],
        turnOrder: ['test-user', 'player-2'],
        turnIdx: 0,
        pending: null,
        challengeStartedAt: null,
        turnStartedAt: Date.now(),
        consecutiveSkips: 0,
        winner: phase === 'win' ? 'test-user' : null,
        log: [],
        drawPile: ['a', 'b', 'c'],
        referee: null,
      });
      expect(() => render(<ChainLinkScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });

  it('renders challenge panel without crashing', () => {
    setGameState({
      game: 'chainLink',
      phase: 'playing',
      hands: { 'test-user': ['word1'], 'player-2': ['word3'] },
      chain: [{ word: 'start', by: 'system', reason: '' }, { word: 'test', by: 'player-2', reason: 'related' }],
      turnOrder: ['test-user', 'player-2'],
      turnIdx: 1,
      pending: { card: 'test', reason: 'related', by: 'player-2' },
      challengeStartedAt: Date.now(),
      turnStartedAt: null,
      consecutiveSkips: 0,
      winner: null,
      log: [],
      drawPile: ['a', 'b'],
      referee: null,
    });
    expect(() => render(<ChainLinkScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
  });

  it('renders referee thinking without crashing', () => {
    setGameState({
      game: 'chainLink',
      phase: 'playing',
      hands: { 'test-user': ['word1'], 'player-2': ['word3'] },
      chain: [{ word: 'start', by: 'system', reason: '' }],
      turnOrder: ['test-user', 'player-2'],
      turnIdx: 0,
      pending: { card: 'test', reason: '', by: 'player-2' },
      challengeStartedAt: null,
      turnStartedAt: null,
      consecutiveSkips: 0,
      winner: null,
      log: [],
      drawPile: [],
      referee: { state: 'thinking', verdict: null, why: '', card: 'test', who: 'player-2', challenger: 'test-user' },
    });
    expect(() => render(<ChainLinkScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
  });
});

// ─── Plot Twist ────────────────────────────────────────────────────────────────

describe('PlotTwistScreen', () => {
  const PlotTwistScreen = require('../src/screens/PlotTwistScreen').default;
  const phases = ['intro', 'dealing', 'play', 'gameover'];

  phases.forEach(phase => {
    it(`renders without crashing in phase: ${phase}`, () => {
      setGameState({
        game: 'plotTwist',
        phase,
        turnOrder: ['test-user', 'player-2'],
        turnIdx: 0,
        hands: { 'test-user': ['the', 'cat'], 'player-2': ['a', 'dog'] },
        story: [],
        scores: { 'test-user': 0, 'player-2': 0 },
        round: 1,
        totalRounds: 5,
      });
      expect(() => render(<PlotTwistScreen navigation={mockNavigation} route={mockRoute} />)).not.toThrow();
    });
  });
});
