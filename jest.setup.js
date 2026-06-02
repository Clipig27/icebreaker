// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

// Mock expo-blur
jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// Mock expo-font
jest.mock('expo-font', () => ({
  useFonts: () => [true],
  isLoaded: () => true,
}));

// Mock @expo-google-fonts
jest.mock('@expo-google-fonts/exo-2', () => ({
  useFonts: () => [true],
  Exo2_500Medium: 'Exo2_500Medium',
  Exo2_600SemiBold: 'Exo2_600SemiBold',
  Exo2_700Bold: 'Exo2_700Bold',
  Exo2_800ExtraBold: 'Exo2_800ExtraBold',
}));

// Mock supabase
jest.mock('./src/lib/supabase', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: jest.fn() }), subscribe: jest.fn() }),
    removeChannel: jest.fn(),
    from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }),
  },
}));

// Mock GameContext
const mockGameContext = {
  room: null,
  players: [],
  currentUser: { id: 'test-user', username: 'TestUser' },
  isHost: true,
  userLoaded: true,
  authError: null,
  sendGameState: jest.fn(),
  sendPlayerAction: jest.fn(),
  startGame: jest.fn(),
  leaveRoom: jest.fn(),
  kickPlayer: jest.fn(),
  endGame: jest.fn(),
  restartGame: jest.fn(),
  cancelRoom: jest.fn(),
  updateRoomScores: jest.fn(),
  setPlayers: jest.fn(),
  isConnected: true,
};

jest.mock('./src/context/GameContext', () => ({
  useGame: () => mockGameContext,
  GameProvider: ({ children }) => children,
  __setMockGameContext: (overrides) => Object.assign(mockGameContext, overrides),
}));

// Mock navigation
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() }),
  useFocusEffect: jest.fn(),
  useIsFocused: () => true,
}));

jest.mock('./src/navigation/navigationRef', () => ({
  navigationRef: { isReady: () => true, navigate: jest.fn(), getCurrentRoute: () => ({ name: 'MainTabs' }) },
  resetToMain: jest.fn(),
}));

// Mock socket
jest.mock('./src/socket', () => ({
  __esModule: true,
  default: { id: 'test-socket-id', connected: true, on: jest.fn(), off: jest.fn(), emit: jest.fn() },
}));

// Silence console warnings in tests
global.console.warn = jest.fn();
