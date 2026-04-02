import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing, typography } from '../src/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>That route does not exist.</Text>
      <Link href="/" style={styles.link}>
        Return home
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.table,
    padding: spacing.lg,
  },
  title: {
    color: palette.paper,
    fontSize: typography.title,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  link: {
    color: palette.accent,
    fontSize: typography.body,
  },
});
