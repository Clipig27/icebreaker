import { createNavigationContainerRef } from '@react-navigation/native';

// Untyped to avoid circular import with App.tsx (which defines RootStackParamList).
// Only used for imperative navigation from outside the component tree (e.g. GameContext).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const navigationRef = createNavigationContainerRef<any>();

export function navigateTo(screen: string) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(screen as never);
  }
}
