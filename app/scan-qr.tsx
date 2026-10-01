import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NavigationHeader } from '@/components/ui/screen-header';
import { MyQRCodeModal } from '@/components/friends/my-qr-code-modal';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { parseInviteFromUrl } from '@/lib/invite-deeplink';
import { friendshipService } from '@/services/friendship-service';
import { invalidateFriendRelationshipSurfaces } from '@/services/friend-relationship-invalidation';
import { userService } from '@/services/user-service';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ScanQRScreen() {
  const { colors, gradients, isDark } = useThemeColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const scanInProgress = useRef(false);
  const [scanned, setScanned] = useState(false);
  const [showMyCode, setShowMyCode] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getPermission();
    });
    return () => subscription.remove();
  }, [getPermission]);

  const resumeScanning = () => {
    scanInProgress.current = false;
    setScanned(false);
  };

  const showScanNotice = (title: string, message: string) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: resumeScanning }], {
      cancelable: true,
      onDismiss: resumeScanning,
    });
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanInProgress.current || showMyCode || !isFocused) return;
    scanInProgress.current = true;
    setScanned(true);

    const parsed = parseInviteFromUrl(data);
    const friendId = parsed?.inviterId;

    if (friendId) {
      if (user?.id && friendId === user.id) {
        showScanNotice('Notice', 'This is your own QR code.');
        return;
      }

      try {
        // Check if user exists
        const friend = await userService.getById(friendId);

        if (friend) {
          if (!user?.id) {
            showScanNotice('Sign In Required', 'Please sign in before adding a friend.');
            return;
          }

          const openFriend = () => {
            router.back();
            router.push(`/friends/${friendId}` as any);
          };

          if (await friendshipService.areFriends(user.id, friendId)) {
            Alert.alert(
              'Already Friends',
              `You're already friends with ${friend.name}.`,
              [
                { text: 'Cancel', style: 'cancel', onPress: resumeScanning },
                { text: 'Open Friend', onPress: openFriend },
              ],
              { cancelable: true, onDismiss: resumeScanning }
            );
            return;
          }

          Alert.alert(
            'Friend Found!',
            `Add ${friend.name} as a friend?`,
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: resumeScanning,
              },
              {
                text: 'Add Friend',
                onPress: async () => {
                  try {
                    if (!user?.id) throw new Error('Please sign in before adding a friend.');
                    await friendshipService.createAccepted(user.id, friendId);
                    await invalidateFriendRelationshipSurfaces(queryClient, user.id, friendId);
                    Alert.alert('Connected!', `You and ${friend.name} are now friends.`, [
                      {
                        text: 'Done',
                        onPress: openFriend,
                      },
                    ]);
                  } catch (addErr: any) {
                    showScanNotice('Error', addErr?.message || 'Failed to connect with user');
                  }
                },
              },
            ],
            { cancelable: true, onDismiss: resumeScanning }
          );
        } else {
          showScanNotice('Not Found', 'This user was not found. They may need to create an account first.');
        }
      } catch (error) {
        console.error('Error finding user:', error);
        showScanNotice('Error', 'Failed to find user. Please check your connection and try again.');
      }
    } else {
      showScanNotice('Invalid QR Code', 'This QR code is not a valid Vasuli invite.');
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ThemedText>Requesting camera permission...</ThemedText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
        <NavigationHeader title="Scan QR Code" onBack={() => router.back()} />

        <View style={styles.permissionContainer}>
          <View style={[styles.iconContainer, { backgroundColor: isDark ? '#064e3b' : 'rgba(34, 197, 94, 0.12)' }]}>
            <IconSymbol size={48} name="camera.fill" color={colors.accent} />
          </View>
          <ThemedText type="subtitle" style={[styles.permissionTitle, !isDark && { color: colors.text }]}>
            Camera Access Required
          </ThemedText>
          <ThemedText style={[styles.permissionText, !isDark && { color: colors.textSecondary }]}>
            We need camera access to scan QR codes and add friends
          </ThemedText>
          <TouchableOpacity
            onPress={() => {
              if (permission.canAskAgain) {
                void requestPermission();
              } else {
                void Linking.openSettings().catch(() => {
                  Alert.alert('Camera Access', 'Open your phone settings and allow camera access for Vasuli.');
                });
              }
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={permission.canAskAgain ? "Continue to camera permission" : "Open camera permission settings"}
            style={[styles.permissionButton, { backgroundColor: colors.accent }]}
          >
            <ThemedText style={styles.permissionButtonText}>{permission.canAskAgain ? 'Continue' : 'Open Settings'}</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const cornerStyle = { borderColor: colors.accent };

  return (
    <View style={styles.container}>
      {isFocused && <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned || showMyCode ? undefined : handleBarCodeScanned}
      />}

      {/* Overlay */}
      <View style={styles.overlay}>
        <NavigationHeader title="Scan QR Code" onBack={() => router.back()} />

        {/* Scanner Frame */}
        <View style={styles.scannerContainer}>
          <View style={styles.scannerFrame}>
            <View style={[styles.corner, styles.cornerTL, cornerStyle]} />
            <View style={[styles.corner, styles.cornerTR, cornerStyle]} />
            <View style={[styles.corner, styles.cornerBL, cornerStyle]} />
            <View style={[styles.corner, styles.cornerBR, cornerStyle]} />
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <ThemedText style={styles.instructionsText}>
            Point your camera at a friend&apos;s QR code
          </ThemedText>

          <TouchableOpacity
            onPress={() => setShowMyCode(true)}
            style={[
              styles.showMyCodeButton,
              {
                backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.25)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.45)',
              },
            ]}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Show my QR code"
          >
            <IconSymbol name="qrcode" size={20} color="#fff" />
            <ThemedText style={styles.showMyCodeText}>Show My Code</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <MyQRCodeModal
        visible={showMyCode}
        onClose={() => setShowMyCode(false)}
        user={user}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 54,
    paddingBottom: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerTitleLight: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerRight: {
    width: 44,
  },
  scannerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: 280,
    height: 280,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#2DD4BF',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  instructionsContainer: {
    paddingHorizontal: 40,
    paddingBottom: 60,
    alignItems: 'center',
  },
  instructionsText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.9,
  },
  showMyCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  showMyCodeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 32,
    lineHeight: 20,
  },
  permissionButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
