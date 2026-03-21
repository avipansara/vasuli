import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { LoadingState } from '@/components/ui/loading-state';
import { useAuth } from '@/contexts/auth-context-otp';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { PENDING_INVITE_PATH_KEY, buildInvitePath } from '@/lib/invite-deeplink';
import { friendshipService } from '@/services/friendship-service';
import { invitationService } from '@/services/invitation-service';
import { userService } from '@/services/user-service';
import type { User } from '@/types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

function firstQueryParam(v: string | string[] | undefined): string | undefined {
    if (v == null) return undefined;
    return Array.isArray(v) ? v[0] : v;
}

export default function InviteScreen() {
    const params = useLocalSearchParams<{ id: string | string[]; invitation?: string | string[] }>();
    const id = firstQueryParam(params.id);
    const invitation = params.invitation;
    const { gradients, colors, isDark } = useThemeColors();
    const { user } = useAuth();

    const [inviter, setInviter] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (!id) return;
        const invId = firstQueryParam(invitation);
        const path = buildInvitePath(String(id), invId);
        if (user) {
            AsyncStorage.removeItem(PENDING_INVITE_PATH_KEY).catch(() => undefined);
        } else {
            AsyncStorage.setItem(PENDING_INVITE_PATH_KEY, path).catch(() => undefined);
        }
    }, [id, invitation, user]);

    useEffect(() => {
        async function loadInviter() {
            if (!id) return;
            try {
                const inviterUser = await userService.getById(String(id));
                setInviter(inviterUser);
            } catch (error) {
                console.error('Error loading inviter:', error);
                Alert.alert('Error', 'Invalid invitation link');
                router.replace('/');
            } finally {
                setLoading(false);
            }
        }
        loadInviter();
    }, [id]);

    const handleAccept = async () => {
        if (!inviter) return;

        if (!user) {
            Alert.alert(
                'Sign in required',
                'Sign in with the email address your friend invited so we can link your accounts.',
            );
            return;
        }

        if (user.id === inviter.id) {
            Alert.alert('Error', 'You cannot accept your own invitation');
            router.replace('/');
            return;
        }

        setProcessing(true);
        try {
            const invitationId = firstQueryParam(invitation);

            await invitationService.acceptInvitationFromLink({
                invitationId,
                inviterId: inviter.id,
                inviteeEmail: user.email,
            });

            await friendshipService.createAccepted(user.id, inviter.id);

            await AsyncStorage.removeItem(PENDING_INVITE_PATH_KEY).catch(() => undefined);
            Alert.alert('Success', `You are now connected with ${inviter.name}`);
            router.replace('/(tabs)');
        } catch (error) {
            console.error('Error accepting invitation:', error);
            Alert.alert('Error', 'Failed to connect with user');
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return <LoadingState message="Loading invitation..." />;
    }

    if (!inviter) {
        return (
            <View style={styles.container}>
                <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />
                <View style={styles.content}>
                    <IconSymbol name="exclamationmark.triangle.fill" size={64} color={colors.error} />
                    <ThemedText style={styles.errorText}>Invitation not found</ThemedText>
                    <TouchableOpacity onPress={() => router.replace('/')} style={styles.button}>
                        <ThemedText style={styles.buttonText}>Go Home</ThemedText>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient colors={gradients.screenBackground} style={StyleSheet.absoluteFill} />

            <View style={styles.content}>
                <View style={[styles.avatarContainer, {
                    backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(34, 197, 94, 0.1)',
                    borderColor: isDark ? '#2DD4BF' : '#22c55e'
                }]}>
                    <ThemedText style={[styles.avatarText, { color: isDark ? '#2DD4BF' : '#16a34a' }]}>
                        {inviter.name.charAt(0).toUpperCase()}
                    </ThemedText>
                </View>

                <ThemedText type="title" style={[styles.title, !isDark && { color: colors.text }]}>
                    {inviter.name} invited you!
                </ThemedText>

                <ThemedText style={[styles.subtitle, !isDark && { color: colors.textSecondary }]}>
                    Connect on Vasuli to split expenses seamlessly.
                </ThemedText>

                <TouchableOpacity
                    onPress={handleAccept}
                    disabled={processing}
                    style={[styles.primaryButton, { opacity: processing ? 0.7 : 1 }]}
                >
                    <LinearGradient
                        colors={gradients.buttonPrimary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.gradientButton}
                    >
                        {processing ? (
                            <ThemedText style={styles.buttonText}>Connecting...</ThemedText>
                        ) : (
                            <>
                                <IconSymbol name="checkmark" size={20} color="#fff" />
                                <ThemedText style={styles.buttonText}>Accept & Connect</ThemedText>
                            </>
                        )}
                    </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => router.replace('/')}
                    style={styles.secondaryButton}
                >
                    <ThemedText style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                        Skip for now
                    </ThemedText>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        width: '100%',
        padding: 32,
        alignItems: 'center',
    },
    avatarContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        marginBottom: 24,
    },
    avatarText: {
        fontSize: 40,
        fontWeight: '700',
    },
    title: {
        textAlign: 'center',
        marginBottom: 12,
    },
    subtitle: {
        textAlign: 'center',
        fontSize: 16,
        opacity: 0.7,
        marginBottom: 40,
    },
    errorText: {
        fontSize: 18,
        marginTop: 16,
        marginBottom: 24,
    },
    button: {
        padding: 16,
    },
    primaryButton: {
        width: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    gradientButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 8,
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    secondaryButton: {
        padding: 16,
    },
    secondaryButtonText: {
        fontSize: 16,
    },
});
