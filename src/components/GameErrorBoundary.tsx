import React, { Component, ReactNode } from 'react';
import { resetToMain } from '../navigation/navigationRef';

type Props = {
  children: ReactNode;
  onError?: () => void;
};

type State = {
  hasError: boolean;
};

/**
 * Wraps game screens so that any render error silently redirects to the home screen
 * instead of showing a big red error overlay.
 */
export default class GameErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('[GameErrorBoundary] caught error:', error.message);
    // Navigate home
    this.props.onError?.();
    resetToMain();
  }

  render() {
    if (this.state.hasError) {
      return null; // render nothing while redirecting
    }
    return this.props.children;
  }
}
