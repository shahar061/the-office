// mobile/src/session/PortraitLayout.tsx
import { useRef } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionBanner } from '../webview-host/ConnectionBanner';
import { colors, spacing, radius, hitTarget, typography } from '../theme';
import type { UseSessionReturn } from './useSession';

interface Props {
  session: UseSessionReturn;
  onExpand: () => void;
}

export function PortraitLayout({ session, onExpand }: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const { status, draft, setDraft, sending, canSend, submit } = session;

  const handleSend = async () => {
    const ack = await submit();
    if (!ack.ok && ack.error && ack.error !== 'empty' && ack.error !== 'no transport') {
      Alert.alert('Send failed', ack.error);
    }
  };

  const composer = (
    <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.md }]}>
      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={setDraft}
        placeholder="Reply to active agent…"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        editable={!sending && status.state === 'connected'}
        multiline
        maxLength={1000}
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        style={[styles.sendBtn, canSend ? styles.sendBtnActive : styles.sendBtnInactive]}
      >
        <Text style={canSend ? styles.sendBtnTextActive : styles.sendBtnTextInactive}>
          {sending ? '…' : 'Send'}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={[styles.bannerSlot, { paddingTop: insets.top }]} pointerEvents="box-none">
        <ConnectionBanner status={status} />
      </View>

      <Pressable
        onPress={onExpand}
        style={[
          styles.expandBtn,
          { top: insets.top + spacing.xxl, right: spacing.md },
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Expand canvas to landscape"
      >
        <Text style={styles.expandGlyph}>⤢</Text>
      </Pressable>

      {Platform.OS === 'ios'
        ? <KeyboardAvoidingView style={styles.keyboardAvoid} behavior="padding">{composer}</KeyboardAvoidingView>
        : <View style={styles.keyboardAvoid}>{composer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  bannerSlot: { position: 'absolute', top: 0, left: 0, right: 0 },
  keyboardAvoid: { flex: 1, justifyContent: 'flex-end' },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgOverlay,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: hitTarget.min,
    maxHeight: 120,
    color: colors.text,
    ...typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  sendBtn: {
    minHeight: hitTarget.min,
    minWidth: 70,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive:   { backgroundColor: colors.accent },
  sendBtnInactive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  sendBtnTextActive:   { color: '#fff',         ...typography.bodyStrong },
  sendBtnTextInactive: { color: colors.textDim, ...typography.body },
  expandBtn: {
    position: 'absolute',
    width: 32, height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.bgOverlay,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  expandGlyph: { color: colors.text, fontSize: 18, lineHeight: 20 },
});
