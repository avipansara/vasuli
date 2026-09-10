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
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

export default function ScanQRScreen() {
  const { colors, isDark } = useThemeColors();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showMyCode, setShowMyCode] = useState(false);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    const parsed = parseInviteFromUrl(data);
    const friendId = parsed?.inviterId;

    if (friendId) {
      if (user?.id && friendId === user.id) {
        Alert.alert('Notice', 'This is your own QR code.');
        setScanned(false);
        return;
      }

      try {
        // Check if user exists
        const friend = await userService.getById(friendId);

        if (friend) {
          Alert.alert(
            'Friend Found!',
            `Add ${friend.name} as a friend?`,
            [
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => setScanned(false),
              },
              {
                text: 'Add Friend',
                onPress: async () => {
                  try {
                    if (user?.id) {
                      await friendshipService.createAccepted(user.id, friendId);
                      await invalidateFriendRelationshipSurfaces(queryClient, user.id, friendId);
                    }
                    Alert.alert('Connected!', `You and ${friend.name} are now friends.`, [
                      {
                        text: 'Done',
                        onPress: () => {
                          router.back();
                          router.push(`/friends/${friendId}` as any);
                        },
                      },
                    ]);
                  } catch (addErr: any) {
                    Alert.alert('Error', addErr?.message || 'Failed to connect with user');
                    setScanned(false);
                  }
                },
              },
            ]
          );
        } else {
          Alert.alert('Not Found', 'This user was not found. They may need to create an account first.');
          setScanned(false);
        }
      } catch (error) {
        console.error('Error finding user:', error);
        Alert.alert('Error', 'Failed to find user');
        setScanned(false);
      }
    } else {
      Alert.alert('Invalid QR Code', 'This QR code is not a valid Vasuli invite.');
      setScanned(false);
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#0A0A0F' : colors.background }]}>
        <ThemedText>Requesting camera permission...</ThemedText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <LinearGradient
        colors={isDark ? ['#0A0A0F', '#0F172A', '#0A0A0F'] : ['#F0FDF4', '#ECFDF5', '#F0FDF4']}
        style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, {
              backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
              borderColor: isDark ? 'rgba(45, 212, 191, 0.3)' : 'rgba(34, 197, 94, 0.3)',
            }]}>
            <IconSymbol size={20} name="chevron.left" color={isDark ? '#2DD4BF' : colors.tint} />
          </TouchableOpacity>
          <ThemedText type="subtitle" style={[styles.headerTitle, !isDark && { color: colors.text }]}>
            Scan QR Code
          </ThemedText>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.permissionContainer}>
          <View style={[styles.iconContainer, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)' }]}>
            <IconSymbol size={48} name="camera.fill" color={isDark ? '#2DD4BF' : colors.tint} />
          </View>
          <ThemedText type="subtitle" style={[styles.permissionTitle, !isDark && { color: colors.text }]}>
            Camera Access Required
          </ThemedText>
          <ThemedText style={[styles.permissionText, !isDark && { color: colors.textSecondary }]}>
            We need camera access to scan QR codes and add friends
          </ThemedText>
          <TouchableOpacity onPress={requestPermission}>
            <LinearGradient
              colors={isDark ? ['#2DD4BF', '#14B8A6'] : ['#22c55e', '#16a34a']}
              style={styles.permissionButton}>
              <ThemedText style={styles.permissionButtonText}>Continue</ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <NavigationHeader title="Scan QR Code" onBack={() => router.back()} />

        {/* Scanner Frame */}
        <View style={styles.scannerContainer}>
          <View style={styles.scannerFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <ThemedText style={styles.instructionsText}>
            Point your camera at a friend&apos;s QR code
          </ThemedText>

          <TouchableOpacity
            onPress={() => setShowMyCode(true)}
            style={styles.showMyCodeButton}
            activeOpacity={0.8}
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
