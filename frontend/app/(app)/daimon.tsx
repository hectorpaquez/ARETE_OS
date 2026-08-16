import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { MarkdownBlocks } from "@/src/components/MarkdownBlocks";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type Msg = { role: "user" | "assistant"; content: string };

export default function DaimonScreen() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [messages.length]);

  async function onLinkPress(title: string) {
    try {
      const existing = await api.getPageByTitle(title);
      router.push({ pathname: "/knowledge/[id]", params: { id: existing.id } });
    } catch {}
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await api.aiChat(text, sessionId);
      if (!sessionId) setSessionId(res.session_id);
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            e?.message?.includes("503") || e?.message?.toLowerCase?.().includes("clé")
              ? "L'IA n'est pas disponible pour l'instant. Vérifiez la configuration de la clé."
              : "Une erreur est survenue. Réessayez.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const suggestions = [
    "Résume mes connaissances récentes",
    "Que sais-je sur la stratégie ?",
    "Propose-moi des connexions à explorer",
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Daimōn</Text>
          <Text style={styles.subtitle}>Ancré sur vos connaissances · GPT-5.4</Text>
        </View>
        <View style={styles.dot} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.lg, gap: spacing.lg }}
          renderItem={({ item }) =>
            item.role === "user" ? (
              <View style={styles.userBubble} testID="daimon-user-msg">
                <Text style={styles.userText}>{item.content}</Text>
              </View>
            ) : (
              <View style={styles.assistantWrap} testID="daimon-assistant-msg">
                <View style={styles.daimonMark}>
                  <Ionicons name="sparkles-outline" size={13} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <MarkdownBlocks content={item.content} onLinkPress={onLinkPress} />
                </View>
              </View>
            )
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="sparkles-outline" size={36} color={colors.brandPrimary} />
              <Text style={styles.emptyTitle}>Interrogez votre savoir.</Text>
              <Text style={styles.emptyHint}>
                Daimōn répond en s&apos;appuyant sur vos pages de connaissance et cite ses sources en [[liens]].
              </Text>
              <View style={styles.suggestions}>
                {suggestions.map((s) => (
                  <Pressable
                    key={s}
                    testID={`daimon-suggestion-${s.slice(0, 8)}`}
                    onPress={() => setInput(s)}
                    style={({ pressed }) => [styles.suggChip, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.suggText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            sending ? (
              <View style={styles.thinking} testID="daimon-thinking">
                <ActivityIndicator size="small" color={colors.brandPrimary} />
                <Text style={styles.thinkingText}>Daimōn réfléchit…</Text>
              </View>
            ) : null
          }
        />

        <View style={styles.inputBar}>
          <TextInput
            testID="daimon-input"
            value={input}
            onChangeText={setInput}
            placeholder="Posez une question à Daimōn…"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            multiline
            onSubmitEditing={send}
          />
          <Pressable
            testID="daimon-send"
            onPress={send}
            disabled={!input.trim() || sending}
            style={({ pressed }) => [
              styles.sendBtn,
              (!input.trim() || sending) && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { ...typography.h1, fontSize: 28, color: colors.onSurface },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    borderRadius: radii.lg,
    borderBottomRightRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  userText: { color: colors.onSurface, fontSize: 15, lineHeight: 22 },
  assistantWrap: { flexDirection: "row", gap: spacing.md, maxWidth: "100%" },
  daimonMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  empty: { alignItems: "center", paddingTop: spacing.xxxl, gap: spacing.md },
  emptyTitle: { ...typography.h3, color: colors.onSurface },
  emptyHint: {
    color: colors.onSurfaceTertiary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
  suggestions: { marginTop: spacing.lg, gap: spacing.sm, width: "100%" },
  suggChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  suggText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  thinking: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.md },
  thinkingText: { color: colors.onSurfaceTertiary, fontSize: 13 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  input: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 15,
    maxHeight: 120,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
});
