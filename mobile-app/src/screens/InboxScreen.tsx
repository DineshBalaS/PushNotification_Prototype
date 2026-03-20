import { FlashList, ListRenderItem } from '@shopify/flash-list';
import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Notification,
  useNotificationStore,
} from '../store/useNotificationStore';

// ---------------------------------------------------------------------------
// Status badge colours
// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<string, string> = {
  PENDING: '#F59E0B',
  ACCEPTED: '#10B981',
  REJECTED: '#EF4444',
  CANCELLED: '#6B7280',
};

// ---------------------------------------------------------------------------
// Individual notification row
// ---------------------------------------------------------------------------
interface NotificationItemProps {
  item: Notification;
  onPress: (id: string) => void;
  isDark: boolean;
}

const NotificationItem = React.memo(
  ({ item, onPress, isDark }: NotificationItemProps) => {
    const statusColor = STATUS_COLORS[item.status] ?? '#6B7280';
    const formattedTime = new Date(item.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const formattedDate = new Date(item.timestamp).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onPress(item.id)}
        style={[
          styles.row,
          isDark ? styles.rowDark : styles.rowLight,
          !item.read && (isDark ? styles.rowUnreadDark : styles.rowUnreadLight),
        ]}
      >
        {/* Unread indicator dot */}
        <View style={styles.dotWrapper}>
          {!item.read && <View style={styles.unreadDot} />}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.title,
                isDark ? styles.textDark : styles.textLight,
                !item.read && styles.titleUnread,
              ]}
            >
              {item.title}
            </Text>
            <Text style={[styles.time, isDark ? styles.timeDark : styles.timeLight]}>
              {formattedDate} · {formattedTime}
            </Text>
          </View>

          <Text
            numberOfLines={2}
            style={[
              styles.body,
              isDark ? styles.bodyDark : styles.bodyLight,
            ]}
          >
            {item.body}
          </Text>

          {/* Status badge */}
          <View style={[styles.badge, { backgroundColor: `${statusColor}22` }]}>
            <View style={[styles.badgeDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.badgeLabel, { color: statusColor }]}>
              {item.status}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
const EmptyState = ({ isDark }: { isDark: boolean }) => (
  <View style={styles.emptyContainer}>
    <Text style={styles.emptyIcon}>🔔</Text>
    <Text style={[styles.emptyTitle, isDark ? styles.textDark : styles.textLight]}>
      No notifications yet
    </Text>
    <Text style={[styles.emptySubtitle, isDark ? styles.bodyDark : styles.bodyLight]}>
      Appointment updates will appear here
    </Text>
  </View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
const InboxScreen = () => {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handlePress = useCallback(
    (id: string) => {
      markAsRead(id);
    },
    [markAsRead],
  );

  const renderItem: ListRenderItem<Notification> = useCallback(
    ({ item }) => (
      <NotificationItem item={item} onPress={handlePress} isDark={isDark} />
    ),
    [handlePress, isDark],
  );

  const keyExtractor = useCallback((item: Notification) => item.id, []);

  return (
    <View
      style={[
        styles.screen,
        isDark ? styles.screenDark : styles.screenLight,
        { paddingTop: insets.top },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, isDark ? styles.headerDark : styles.headerLight]}>
        <Text style={[styles.headerTitle, isDark ? styles.textDark : styles.textLight]}>
          Inbox
        </Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>

      {/* List */}
      <FlashList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimatedItemSize={88}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState isDark={isDark} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenLight: {
    backgroundColor: '#F3F4F6',
  },
  screenDark: {
    backgroundColor: '#111827',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLight: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#E5E7EB',
  },
  headerDark: {
    backgroundColor: '#1F2937',
    borderBottomColor: '#374151',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  unreadBadge: {
    marginLeft: 10,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // List
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  // Row
  row: {
    flexDirection: 'row',
    borderRadius: 12,
    marginVertical: 4,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  rowLight: {
    backgroundColor: '#FFFFFF',
  },
  rowDark: {
    backgroundColor: '#1F2937',
  },
  rowUnreadLight: {
    backgroundColor: '#EFF6FF',
  },
  rowUnreadDark: {
    backgroundColor: '#1E3A5F',
  },

  // Unread dot
  dotWrapper: {
    width: 10,
    paddingTop: 5,
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },

  // Content
  content: {
    flex: 1,
    marginLeft: 8,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  titleUnread: {
    fontWeight: '700',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },

  // Status badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 5,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Typography
  textLight: {
    color: '#111827',
  },
  textDark: {
    color: '#F9FAFB',
  },
  bodyLight: {
    color: '#6B7280',
  },
  bodyDark: {
    color: '#9CA3AF',
  },
  time: {
    fontSize: 11,
    fontWeight: '400',
  },
  timeLight: {
    color: '#9CA3AF',
  },
  timeDark: {
    color: '#6B7280',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 120,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
  },
});

export default InboxScreen;
