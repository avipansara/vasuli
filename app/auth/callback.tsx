import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

/**
 * OAuth redirects arrive here before WebBrowser returns the URL to the
 * initiating screen. The auth service consumes the URL and completes the
 * session; this route exists so Expo Router does not render an unmatched-route
 * error while Android hands the deep link back to the app.
 */
export default function AuthCallbackScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator size="small" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
