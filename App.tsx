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
import HostLobbyScreen     from './src/screens/HostLobbyScreen';
import JoinRoomScreen      from './src/screens/JoinRoomScreen';

import { COLORS } from './src/constants/theme';

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
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <GameProvider>
        <NotificationsProvider>
          <NavigationContainer ref={navigationRef}>
          <StatusBar style="light" />
          <Stack.Navigator
            initialRouteName="MainTabs"
            screenOptions={{
              headerStyle:         { backgroundColor: COLORS.background },
              headerTintColor:     COLORS.text,
              headerTitleStyle:    { fontWeight: '800', fontSize: 18 },
              headerShadowVisible: false,
              contentStyle:        { backgroundColor: COLORS.background },
              animation:           'slide_from_right',
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
          </Stack.Navigator>
          </NavigationContainer>
        </NotificationsProvider>
      </GameProvider>
    </SafeAreaProvider>
  );
}
