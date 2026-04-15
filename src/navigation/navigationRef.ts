import { createNavigationContainerRef, StackActions } from '@react-navigation/native';

// Untyped to avoid circular import with App.tsx (which defines RootStackParamList).
// Only used for imperative navigation from outside the component tree (e.g. GameContext).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const navigationRef = createNavigationContainerRef<any>();

export function navigateTo(screen: string) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(screen as never);
  }
}

/** Resets the navigation stack to just MainTabs — used after leaving/cancelling a room. */
export function resetToMain() {
  if (navigationRef.isReady()) {
    navigationRef.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }
}

/** Goes back one screen — used when host leaves a game to send non-hosts back to JoinRoom. */
export function goBack() {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack();
  }
}

/** Replaces the current screen with a fresh instance — forces remount on game restart. */
export function replaceWith(screen: string) {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(StackActions.replace(screen));
  }
}

/** Returns the name of the currently focused screen. */
export function getCurrentRouteName(): string | undefined {
  return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
}
