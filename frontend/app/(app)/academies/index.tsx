import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, Pillar } from "@/src/api/client";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function AcademiesScreen() {
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setPillars(await api.pillars());
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="academies-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Académies</Text>
        <Text style={styles.subtitle}>Les cinq piliers de l&apos;excellence</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160, gap: spacing.md }}>
          {pillars.map((p) => (
            <Pressable
              key={p.id}
              testID={`pillar-${p.slug}`}
              onPress={() => router.push({ pathname: "/academies/[slug]", params: { slug: p.slug } })}
              style={({ pressed }) => [styles.card, pressed && { borderColor: colors.brandSecondary }]}
            >
              <View style={styles.cardHead}>
                <View style={styles.iconWrap}>
                  <Ionicons name={(p.icon as any) || "ellipse-outline"} size={20} color={colors.brandPrimary} />
                </View>
                <Text style={styles.cardOrder}>0{p.order}</Text>
              </View>
              <Text style={styles.cardTitle}>{p.title}</Text>
              <Text style={styles.cardDesc}>{p.description}</Text>
              <Text style={styles.cardMeta}>{p.subsections.length} sous-sections</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md },
  backBtn: { width: 40, height: 40, marginLeft: -spacing.sm, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h1, fontSize: 30, color: colors.onSurface, marginTop: spacing.sm },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cardOrder: { ...typography.h2, color: colors.brandTertiary, fontSize: 28 },
  cardTitle: { ...typography.h2, color: colors.onSurface, fontSize: 22, marginTop: spacing.md },
  cardDesc: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, marginTop: spacing.xs },
  cardMeta: { ...typography.overline, color: colors.onSurfaceTertiary, marginTop: spacing.md },
});
