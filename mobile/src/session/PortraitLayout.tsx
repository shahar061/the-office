// mobile/src/session/PortraitLayout.tsx
// Portrait-mode UI split into two components so SessionScreen can stack
// them properly in flex:
//   - PortraitOverlays: transparent absolute-fill overlay with the status
//     banner at the top and the expand-to-landscape button floating in the
//     top-right. Sits over the canvas.
//   - PortraitComposer: the chat input + send button. Rendered in flow
//     BELOW the canvas (not overlapping it) so the canvas occupies the
//     space above the composer instead of being hidden behind it.
import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConnectionBanner } from '../webview-host/ConnectionBanner';
import { colors, spacing, radius, hitTarget, typography } from '../theme';
import type { UseSessionReturn } from './useSession';

// ──────────────────────────────────────────────────────────────────────
// Overlays — banner + expand button, non-blocking
// ──────────────────────────────────────────────────────────────────────

interface OverlaysProps {
  status: UseSessionReturn['status'];
  onExpand: () => void;
  /** Tab currently active inside the WebView. Only the Office tab gets the
   *  expand-to-landscape button; the Chat tab has no use for fullscreen.
   *  Optional for transitional compilation — Task 4 passes the real value. */
  activeTab?: 'chat' | 'office';
}

export function PortraitOverlays({ status, onExpand, activeTab = 'office' }: OverlaysProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={overlayStyles.root} pointerEvents="box-none">
      <View style={[overlayStyles.bannerSlot, { paddingTop: insets.top }]} pointerEvents="box-none">
        <ConnectionBanner status={status} />
      </View>
      {activeTab === 'office' && (
        <Pressable
          onPress={onExpand}
          style={[
            overlayStyles.expandBtn,
            { top: insets.top + spacing.xxl, right: spacing.md },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Expand canvas to landscape"
        >
          <Text style={overlayStyles.expandGlyph}>⤢</Text>
        </Pressable>
      )}
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  bannerSlot: { position: 'absolute', top: 0, left: 0, right: 0 },
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

// ──────────────────────────────────────────────────────────────────────
// Composer — text input + send, rendered in flow below the canvas
// ──────────────────────────────────────────────────────────────────────

interface ComposerProps {
  session: UseSessionReturn;
}

export interface PortraitComposerHandle {
  focusInput: () => void;
}

export const PortraitComposer = forwardRef<PortraitComposerHandle, ComposerProps>(
  function PortraitComposer({ session }, ref) {
    const insets = useSafeAreaInsets();
    const inputRef = useRef<TextInput>(null);
    const { status, draft, setDraft, sending, canSend, submit } = session;

    useImperativeHandle(ref, () => ({
      focusInput: () => { inputRef.current?.focus(); },
    }), []);

    const handleSend = async () => {
      const ack = await submit();
      if (!ack.ok && ack.error && ack.error !== 'empty' && ack.error !== 'no transport') {
        Alert.alert('Send failed', ack.error);
      }
    };

    const composer = (
      <View style={[composerStyles.composer, { paddingBottom: insets.bottom + spacing.md }]}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          placeholder="Reply to active agent…"
          placeholderTextColor={colors.textDim}
          style={composerStyles.input}
          editable={!sending && status.state === 'connected'}
          multiline
          maxLength={1000}
        />
        <Pressable
          onPress={handleSend}
          disabled={!canSend}
          style={[composerStyles.sendBtn, canSend ? composerStyles.sendBtnActive : composerStyles.sendBtnInactive]}
        >
          <Text style={canSend ? composerStyles.sendBtnTextActive : composerStyles.sendBtnTextInactive}>
            {sending ? '…' : 'Send'}
          </Text>
        </Pressable>
      </View>
    );

    // Wrap both platforms. iOS uses `padding` (the classic recipe).
    // Android 15+ enforces edge-to-edge display, which breaks the old
    // `windowSoftInputMode="adjustResize"` assumption — the flex layout
    // no longer shrinks on keyboard show. `behavior="height"` asks RN
    // to resize the wrapper itself so the composer stays visible.
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {composer}
      </KeyboardAvoidingView>
    );
  },
);

const composerStyles = StyleSheet.create({
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
});
