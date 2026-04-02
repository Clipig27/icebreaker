import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { navigateTo } from '../navigation/navigationRef';
import { useNotifications } from '../context/NotificationsContext';
import { COLORS } from '../constants/theme';

/**
 * Bell icon with unread-count badge.
 * Uses navigateTo() (root NavigationRef) so it works safely inside both
 * Tab.Navigator headers and Stack.Screen headers without needing useNavigation().
 */
export default function NotificationsBell() {
  const { unreadCount } = useNotifications();

  return (
    <TouchableOpacity
      style={s.wrap}
      onPress={() => navigateTo('Notifications')}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={s.bell}>🔔</Text>
      {unreadCount > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{unreadCount > 9 ? '9+' : String(unreadCount)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginRight: 4,
    padding:     6,
  },
  bell: { fontSize: 22 },
  badge: {
    position:          'absolute',
    top:               2,
    right:             2,
    backgroundColor:   COLORS.danger,
    borderRadius:      999,
    minWidth:          16,
    height:            16,
    paddingHorizontal: 3,
    alignItems:        'center',
    justifyContent:    'center',
  },
  badgeText: {
    color:      '#fff',
    fontSize:   9,
    fontWeight: '800',
    lineHeight: 16,
  },
});
