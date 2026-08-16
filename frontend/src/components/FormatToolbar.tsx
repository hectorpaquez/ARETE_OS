import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";

export type FormatAction =
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "ul"
  | "ol"
  | "code"
  | "bold"
  | "italic"
  | "link";

const BUTTONS: { action: FormatAction; icon?: keyof typeof Ionicons.glyphMap; label?: string }[] = [
  { action: "h1", label: "H1" },
  { action: "h2", label: "H2" },
  { action: "h3", label: "H3" },
  { action: "bold", icon: "text" },
  { action: "italic", label: "I" },
  { action: "quote", icon: "chatbox-ellipses-outline" },
  { action: "ul", icon: "list-outline" },
  { action: "ol", icon: "reorder-four-outline" },
  { action: "code", icon: "code-slash-outline" },
  { action: "link", icon: "link-outline" },
];

export function FormatToolbar({ onAction }: { onAction: (a: FormatAction) => void }) {
  return (
    <View style={styles.wrap} testID="format-toolbar">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="always"
      >
        {BUTTONS.map((b) => (
          <Pressable
            key={b.action}
            testID={`format-${b.action}`}
            onPress={() => onAction(b.action)}
            style={({ pressed }) => [styles.btn, pressed && { backgroundColor: colors.surfaceTertiary }]}
          >
            {b.icon ? (
              <Ionicons name={b.icon} size={18} color={colors.onSurface} />
            ) : (
              <Text
                style={[
                  styles.btnLabel,
                  b.action === "italic" && { fontStyle: "italic" },
                ]}
              >
                {b.label}
              </Text>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    alignItems: "center",
  },
  btn: {
    minWidth: 44,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
});

export default FormatToolbar;
