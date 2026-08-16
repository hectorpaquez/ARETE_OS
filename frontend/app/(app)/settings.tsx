import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function SettingsScreen() {
  const { user, logout } = useAuth();

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.header}>
          <Text style={styles.title}>Réglages</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.overline}>COMPTE</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Nom</Text>
              <Text style={styles.value}>{user?.name || "—"}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value} numberOfLines={1}>
                {user?.email}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.overline}>À PROPOS</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Application</Text>
              <Text style={styles.value}>ARETÉ</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Version</Text>
              <Text style={styles.value}>0.1.0 — Core + Connaissances</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Pressable
            testID="logout-button"
            onPress={onLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.onError} />
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>
          « Ce qui te fait avancer, c'est ce que tu construis chaque jour. »
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  title: { ...typography.h1, fontSize: 28, color: colors.onSurface },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.xl },
  overline: { ...typography.overline, color: colors.onSurfaceTertiary, marginBottom: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    gap: spacing.md,
  },
  label: { color: colors.onSurfaceSecondary, fontSize: 14 },
  value: { color: colors.onSurface, fontSize: 14, flexShrink: 1, textAlign: "right" },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.error,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  logoutText: { color: colors.onError, fontWeight: "600", fontSize: 14 },
  footer: {
    ...typography.body,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
});
