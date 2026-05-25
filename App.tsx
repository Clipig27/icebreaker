import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GameProvider }           from './src/context/GameContext';
import { NotificationsProvider }  from './src/context/NotificationsContext';
import { navigationRef }          from './src/navigation/navigationRef';
import MainTabs                   from './src/navigation/MainTabs';
import NotificationsScreen        from './src/screens/NotificationsScreen';

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
import HostLobbyScreen     from './src/screens/HostLobbyScreen';
import JoinRoomScreen      from './src/screens/JoinRoomScreen';
import InstructionsScreen  from './src/screens/InstructionsScreen';

import { COLORS } from './src/constants/theme';
import InviteModal from './src/components/InviteModal';
import HostOptionsMenu from './src/components/HostOptionsMenu';
import HostStatusBanner from './src/components/HostStatusBanner';
import { useGame } from './src/context/GameContext';
import { TouchableOpacity, Text, View } from 'react-native';

export type RootStackParamList = {
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
  Instructions:  { game?: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Game screen names where back navigation should be blocked for the host during play
const GAME_SCREENS = new Set([
  'LieDetector', 'TalentShow', 'StandOut', 'NumberGuessor',
  'PieCharts', 'DealOrSteal', 'ShadowProtocol', 'PotLuck', 'ChainLink',
]);

function AppInner() {
  const { currentUser, room, isHost } = useGame();

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
  };

  // True when the host is mid-game and should not be able to back-navigate
  const hostInActiveGame = isHost && room?.phase === 'playing';

  // Rendered as headerRight on every screen
  function HeaderRight({ routeName, nav }: { routeName: string; nav: any }) {
    const gameId = ROUTE_TO_GAME[routeName];
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {/* Host: show Host Options menu. Non-host: show room code pill */}
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
            <Text style={{ color: COLORS.text2, fontSize: 12, fontWeight: '800', letterSpacing: 2 }}>
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
            <Text style={{ color: COLORS.accentHi, fontSize: 20, fontWeight: '800' }}>?</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="MainTabs"
          screenOptions={({ navigation, route }) => {
            // Block the host from pressing back on game screens during an active game
            const blockHostBack = hostInActiveGame && GAME_SCREENS.has(route.name);
            return {
              headerStyle:         { backgroundColor: COLORS.background },
              headerTintColor:     COLORS.text,
              headerTitleStyle:    { fontWeight: '800', fontSize: 18 },
              headerShadowVisible: false,
              contentStyle:        { backgroundColor: COLORS.background },
              animation:           'slide_from_right',
              gestureEnabled:      !blockHostBack,
              headerLeft:          blockHostBack ? () => null : undefined,
              // Room code pill + ? button — always visible (code only when in a room)
              headerRight: () => <HeaderRight routeName={route.name} nav={navigation} />,
            };
          }}
        >
          <Stack.Screen name="MainTabs"      component={MainTabs}            options={{ headerShown: false }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
          <Stack.Screen name="UsernameSetup" component={UsernameSetupScreen} options={{ headerShown: false }} />
          <Stack.Screen name="PlayerSetup"   component={PlayerSetupScreen}   options={{ title: 'Players' }} />
          <Stack.Screen name="HostLobby"     component={HostLobbyScreen}     options={{ title: 'Host Game' }} />
          <Stack.Screen name="JoinRoom"      component={JoinRoomScreen}      options={{ title: 'Join Game' }} />
          <Stack.Screen name="GameSelect"    component={GameSelectScreen}    options={{ title: 'Select Game', headerBackTitle: 'Players' }} />
          <Stack.Screen name="LieDetector"   component={LieDetectorScreen}   options={{ title: 'Lie Detector',   headerBackTitle: 'Games' }} />
          <Stack.Screen name="TalentShow"    component={TalentShowScreen}    options={{ title: 'Talent Show',    headerBackTitle: 'Games' }} />
          <Stack.Screen name="StandOut"      component={StandOutScreen}      options={{ title: 'Stand Out',      headerBackTitle: 'Games' }} />
          <Stack.Screen name="NumberGuessor" component={NumberGuessorScreen} options={{ title: 'Number Guessor', headerBackTitle: 'Games' }} />
          <Stack.Screen name="PieCharts"     component={PieChartsScreen}     options={{ title: 'Pie Charts',     headerBackTitle: 'Games' }} />
          <Stack.Screen name="DealOrSteal"      component={DealOrStealScreen}      options={{ title: 'Deal or Steal',     headerBackTitle: 'Games' }} />
          <Stack.Screen name="ShadowProtocol"   component={ShadowProtocolScreen}   options={{ title: 'Shadow Protocol',   headerBackTitle: 'Games' }} />
          <Stack.Screen name="PotLuck"          component={PotLuckScreen}          options={{ title: 'Pot Luck',          headerBackTitle: 'Games' }} />
          <Stack.Screen name="ChainLink"        component={ChainLinkScreen}        options={{ title: 'ChainLink',         headerBackTitle: 'Games' }} />
          <Stack.Screen name="Instructions"     component={InstructionsScreen}     options={({ route }) => ({
            title: (route.params as any)?.game
              ? (() => {
                  const names: Record<string, string> = {
                    lieDetector: 'Lie Detector', talentShow: 'Talent Show',
                    standOut: 'Stand Out', numberGuessor: 'Number Guessor',
                    pieCharts: 'Pie Charts', dealOrSteal: 'Deal or Steal',
                    shadowProtocol: 'Shadow Protocol', potLuck: 'Pot Luck',
                    chainLink: 'ChainLink',
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
  return (
    <SafeAreaProvider>
      <GameProvider>
        <NotificationsProvider>
          <AppInner />
        </NotificationsProvider>
      </GameProvider>
    </SafeAreaProvider>
  );
}
