import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';

import { palette, radius, spacing } from '../../theme';

type Props = {
  children: ReactNode;
  disabled?: boolean;
  onPress(): void;
  shortcut?: string;
  style: PressableProps['style'];
};

export function ShortcutPressable({ children, disabled, onPress, shortcut, style }: Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'web' && hovered && shortcut ? (
        <View pointerEvents="none" style={styles.tooltip}>
          <Text style={styles.tooltipText}>{shortcut}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onBlur={Platform.OS === 'web' ? () => setHovered(false) : undefined}
        onFocus={Platform.OS === 'web' ? () => setHovered(true) : undefined}
        onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
        onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
        onPress={onPress}
        style={style}
      >
        {children}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: [{ translateX: -20 }],
    marginBottom: spacing.xs,
    backgroundColor: 'rgba(18, 33, 25, 0.96)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    zIndex: 20,
  },
  tooltipText: {
    color: palette.paper,
    fontSize: 12,
    fontWeight: '700',
  },
});
