import 'react-native-reanimated';
import React from 'react';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Exo2_500Medium, Exo2_600SemiBold, Exo2_700Bold, Exo2_800ExtraBold } from '@expo-google-fonts/exo-2';
import { ActivityIndicator, View as RNView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { GameProvider }           from './src/context/GameContext';
import { NotificationsProvider }  from './src/context/NotificationsContext';
import { navigationRef, resetToMain } from './src/navigation/navigationRef';
import MainTabs                   from './src/navigation/MainTabs';
import NotificationsScreen        from './src/screens/NotificationsScreen';

import OnboardingScreen    from './src/screens/OnboardingScreen';
import UsernameSetupScreen from './src/screens/UsernameSetupScreen';
import PlayerSetupScreen   from './src/screens/PlayerSetupScreen';
import GameSelectScreen    from './src/screens/GameSelectScreen';
import LieDetectorScreen   from './src/screens/LieDetectorScreen';
import TalentShowScreen    from './src/screens/TalentShowScreen';
import StandOutScreen      from './src/screens/StandOutScreen';
import NumberGuessorScreen from './src/screens/NumberGuessorScreen';
import PieChartsScreen     from './src/screens/PieChartsScreen';
import DealOrStealScreen      from './src/screens/DealOrStealScreen';
import ShadowProtocolScreen   from './src/screens/ShadowProtocolScreen';
import PotLuckScreen          from './src/screens/PotLuckScreen';
import ChainLinkScreen        from './src/screens/ChainLinkScreen';
import PlotTwistScreen        from './src/screens/PlotTwistScreen';
import BlindRankingScreen     from './src/screens/BlindRankingScreen';
import HostLobbyScreen     from './src/screens/HostLobbyScreen';
import JoinRoomScreen      from './src/screens/JoinRoomScreen';
import InstructionsScreen  from './src/screens/InstructionsScreen';
import SettingsScreen      from './src/screens/SettingsScreen';

import GameErrorBoundary from './src/components/GameErrorBoundary';
import { ToastProvider } from './src/components/Toast';
import { COLORS, FONTS } from './src/constants/theme';

SystemUI.setBackgroundColorAsync('#0A0A0F');

import InviteModal from './src/components/InviteModal';
import HostOptionsMenu from './src/components/HostOptionsMenu';
import HostStatusBanner from './src/components/HostStatusBanner';
import { useGame } from './src/context/GameContext';
import { TouchableOpacity, Text, View, Alert } from 'react-native';

export type RootStackParamList = {
  Onboarding:    undefined;
  MainTabs:      undefined;
  UsernameSetup: undefined;
  Notifications: undefined;
  PlayerSetup:   undefined;
  HostLobby:     undefined;
  JoinRoom:      { roomCode?: string } | undefined;
  GameSelect:    undefined;
  LieDetector:   undefined;
  TalentShow:    undefined;
  StandOut:      undefined;
  NumberGuessor: undefined;
  PieCharts:     undefined;
  DealOrSteal:      undefined;
  ShadowProtocol:   undefined;
  PotLuck:          undefined;
  ChainLink:        undefined;
  PlotTwist:        undefined;
  BlindRanking:     undefined;
  Instructions:  { game?: string } | undefined;
  Settings:      undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Wrap game screens with error boundary so crashes go home instead of showing red screen
const Safe = (C: React.ComponentType<any>) =>
  function SafeScreen(props: any) {
    return <GameErrorBoundary><C {...props} /></GameErrorBoundary>;
  };
const SafeLieDetector     = Safe(LieDetectorScreen);
const SafeTalentShow      = Safe(TalentShowScreen);
const SafeStandOut        = Safe(StandOutScreen);
const SafeNumberGuessor   = Safe(NumberGuessorScreen);
const SafePieCharts       = Safe(PieChartsScreen);
const SafeDealOrSteal     = Safe(DealOrStealScreen);
const SafeShadowProtocol  = Safe(ShadowProtocolScreen);
const SafePotLuck         = Safe(PotLuckScreen);
const SafeChainLink       = Safe(ChainLinkScreen);
const SafePlotTwist       = Safe(PlotTwistScreen);
const SafeBlindRanking    = Safe(BlindRankingScreen);

// Game screen names where back navigation should be blocked for the host during play
const GAME_SCREENS = new Set([
  'LieDetector', 'TalentShow', 'StandOut', 'NumberGuessor',
  'PieCharts', 'DealOrSteal', 'ShadowProtocol', 'PotLuck', 'ChainLink', 'PlotTwist', 'BlindRanking',
]);

function AppInner() {
  const { currentUser, room, isHost, leaveRoom } = useGame();

  const [onboarded, setOnboarded] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    AsyncStorage.getItem('@icebreaker_onboarded').then((v) => setOnboarded(v === 'true'));
  }, []);

  // If there's no room but we're stuck on a game screen, go home.
  // Only resets from game screens — NOT from lobby/join/setup screens where room may be temporarily null.
  React.useEffect(() => {
    if (room) return;
    const timer = setTimeout(() => {
      if (!navigationRef.isReady()) return;
      const route = navigationRef.getCurrentRoute()?.name;
      if (route && GAME_SCREENS.has(route)) {
        resetToMain();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [room]);

  const ROUTE_TO_GAME: Record<string, string> = {
    LieDetector: 'lieDetector',
    TalentShow: 'talentShow',
    StandOut: 'standOut',
    NumberGuessor: 'numberGuessor',
    PieCharts: 'pieCharts',
    DealOrSteal: 'dealOrSteal',
    ShadowProtocol: 'shadowProtocol',
    PotLuck: 'potLuck',
    ChainLink: 'chainLink',
    PlotTwist: 'plotTwist',
    BlindRanking: 'blindRanking',
  };

  // True when the host is mid-game and should not be able to back-navigate
  const hostInActiveGame = isHost && room?.phase === 'playing';

  // Rendered as headerRight on every screen — memoized to prevent re-renders during transitions
  const HeaderRight = React.useCallback(({ routeName, nav }: { routeName: string; nav: any }) => {
    const gameId = ROUTE_TO_GAME[routeName];
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {isHost && room?.code ? (
          <HostOptionsMenu />
        ) : room?.code ? (
          <View style={{
            backgroundColor: '#1a1a1a',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: COLORS.borderHi,
            paddingHorizontal: 9,
            paddingVertical: 4,
          }}>
            <Text style={{ color: COLORS.text2, fontSize: 12, fontFamily: FONTS.extrabold, letterSpacing: 2 }}>
              {room.code}
            </Text>
          </View>
        ) : null}
        {routeName !== 'Instructions' && (
          <TouchableOpacity
            onPress={() => nav.navigate('Instructions', gameId ? { game: gameId } : undefined)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 4 }}
            style={{ paddingHorizontal: 4 }}
          >
            <Text style={{ color: COLORS.accentHi, fontSize: 20, fontFamily: FONTS.extrabold }}>?</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [isHost, room?.code]);

  if (onboarded === null) {
    return (
      <RNView style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.accent} />
      </RNView>
    );
  }

  return (
    <>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName={onboarded ? 'MainTabs' : 'Onboarding'}
          screenOptions={({ navigation, route }) => {
            const isGameScreen = GAME_SCREENS.has(route.name);
            const isRoomScreen = isGameScreen || ['HostLobby', 'JoinRoom', 'GameSelect', 'PlayerSetup'].includes(route.name);
            const inRoom = !!room?.code;
            const showLeave = isRoomScreen && inRoom;
            return {
              headerStyle:         { backgroundColor: COLORS.background },
              headerTintColor:     COLORS.text,
              headerTitleStyle:    { fontFamily: FONTS.extrabold, fontSize: 18 },
              headerShadowVisible: false,
              contentStyle:        { backgroundColor: COLORS.background },
              animation:           'slide_from_right',
              gestureEnabled:      !showLeave,
              headerLeft:          showLeave ? () => (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      'Leave Game?',
                      isHost
                        ? 'Host role will transfer to another player. The game continues without you.'
                        : 'You will leave the room and return to the home screen.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Leave', style: 'destructive', onPress: leaveRoom },
                      ],
                    );
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{
                    backgroundColor: COLORS.danger + '18',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: COLORS.danger + '44',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text style={{ color: COLORS.danger, fontSize: 12, fontFamily: FONTS.bold }}>Leave</Text>
                </TouchableOpacity>
              ) : undefined,
              // Room code pill + ? button — always visible (code only when in a room)
              headerRight: () => <HeaderRight routeName={route.name} nav={navigation} />,
            };
          }}
        >
          <Stack.Screen name="Onboarding"    component={OnboardingScreen}    options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="MainTabs"      component={MainTabs}            options={{ headerShown: false }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
          <Stack.Screen name="UsernameSetup" component={UsernameSetupScreen} options={{ headerShown: false }} />
          <Stack.Screen name="PlayerSetup"   component={PlayerSetupScreen}   options={{ title: 'Players' }} />
          <Stack.Screen name="HostLobby"     component={HostLobbyScreen}     options={{ title: 'Host Game' }} />
          <Stack.Screen name="JoinRoom"      component={JoinRoomScreen}      options={{ title: 'Join Game' }} />
          <Stack.Screen name="GameSelect"    component={GameSelectScreen}    options={{ title: 'Select Game', headerBackTitle: 'Players' }} />
          <Stack.Screen name="LieDetector"   component={SafeLieDetector}     options={{ title: 'Liar Liar',   headerBackTitle: 'Games' }} />
          <Stack.Screen name="TalentShow"    component={SafeTalentShow}      options={{ title: "Nobody's Got Talent",    headerBackTitle: 'Games' }} />
          <Stack.Screen name="StandOut"      component={SafeStandOut}        options={{ title: 'Copycat',      headerBackTitle: 'Games' }} />
          <Stack.Screen name="NumberGuessor" component={SafeNumberGuessor}   options={{ title: '1 to 100', headerBackTitle: 'Games' }} />
          <Stack.Screen name="PieCharts"     component={SafePieCharts}       options={{ title: 'Pie Charts',     headerBackTitle: 'Games' }} />
          <Stack.Screen name="DealOrSteal"      component={SafeDealOrSteal}       options={{ title: 'Deal or Steal',     headerBackTitle: 'Games' }} />
          <Stack.Screen name="ShadowProtocol"   component={SafeShadowProtocol}    options={{ title: 'Shadow Protocol',   headerBackTitle: 'Games' }} />
          <Stack.Screen name="PotLuck"          component={SafePotLuck}           options={{ title: 'Pot Luck',          headerBackTitle: 'Games' }} />
          <Stack.Screen name="ChainLink"        component={SafeChainLink}         options={{ title: 'Link or Sink',         headerBackTitle: 'Games' }} />
          <Stack.Screen name="PlotTwist"        component={SafePlotTwist}         options={{ title: 'Plot Twist',       headerBackTitle: 'Games' }} />
          <Stack.Screen name="BlindRanking"     component={SafeBlindRanking}      options={{ title: 'Blind Ranking',    headerBackTitle: 'Games' }} />
          <Stack.Screen name="Settings"         component={SettingsScreen}         options={{ title: 'Settings' }} />
          <Stack.Screen name="Instructions"     component={InstructionsScreen}     options={({ route }) => ({
            title: (route.params as any)?.game
              ? (() => {
                  const names: Record<string, string> = {
                    lieDetector: 'Liar Liar', talentShow: "Nobody's Got Talent",
                    standOut: 'Copycat', numberGuessor: '1 to 100',
                    pieCharts: 'Pie Charts', dealOrSteal: 'Deal or Steal',
                    shadowProtocol: 'Shadow Protocol', potLuck: 'Pot Luck',
                    chainLink: 'Link or Sink',
                    plotTwist: 'Plot Twist',
                    blindRanking: 'Blind Ranking',
                  };
                  return names[(route.params as any).game] ?? 'How to Play';
                })()
              : 'How to Play',
            headerBackTitle: 'Back',
          })} />
        </Stack.Navigator>
      </NavigationContainer>
      <InviteModal userId={currentUser?.id ?? null} />
      <HostStatusBanner />
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Exo2_500Medium,
    Exo2_600SemiBold,
    Exo2_700Bold,
    Exo2_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <RNView style={{ flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.accent} />
      </RNView>
    );
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <GameProvider>
          <NotificationsProvider>
            <AppInner />
          </NotificationsProvider>
        </GameProvider>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
