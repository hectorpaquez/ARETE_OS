import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, Entity, EntityContext, Pillar } from "@/src/api/client";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function PillarDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [pillar, setPillar] = useState<Pillar | null>(null);
  const [ctx, setCtx] = useState<EntityContext | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const all = await api.pillars();
      const p = all.find((x) => x.slug === slug) || null;
      setPillar(p);
      if (p) setCtx(await api.entityContext("pillar", p.id, 2));
    } catch {}
    setLoading(false);
  }, [slug]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function openEntity(e: Entity) {
    if (e.entity_type === "knowledge") router.push({ pathname: "/knowledge/[id]", params: { id: e.id } });
    else router.push({ pathname: "/entity/[type]/[id]", params: { type: e.entity_type, id: e.id } });
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }
  if (!pillar) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={{ color: colors.onSurfaceTertiary }}>Pilier introuvable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const groups: { key: keyof EntityContext; label: string }[] = [
    { key: "goals", label: "Objectifs" },
    { key: "projects", label: "Projets" },
    { key: "tasks", label: "Tâches" },
    { key: "knowledge", label: "Connaissances" },
  ];
  const hasLinked = ctx && groups.some((g) => (ctx[g.key] as Entity[])?.length > 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable testID="pillar-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 }}>
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name={(pillar.icon as any) || "ellipse-outline"} size={26} color={colors.brandPrimary} />
          </View>
          <Text style={styles.title}>{pillar.title}</Text>
          <Text style={styles.mission}>{pillar.description}</Text>
        </View>

        <Text style={styles.sectionLabel}>SOUS-SECTIONS</Text>
        <View style={styles.subsections}>
          {pillar.subsections.map((s) => (
            <View key={s} style={styles.subChip}>
              <Text style={styles.subChipText}>{s}</Text>
            </View>
          ))}
        </View>

        <View style={styles.linkedHead}>
          <Text style={styles.sectionLabel}>RATTACHÉ À CE PILIER</Text>
          <Pressable
            testID="pillar-link"
            onPress={() =>
              router.push({ pathname: "/entity/[type]/[id]", params: { type: "pillar", id: pillar.id } })
            }
            style={styles.manageBtn}
          >
            <Ionicons name="git-merge-outline" size={13} color={colors.brandPrimary} />
            <Text style={styles.manageBtnText}>Relier</Text>
          </Pressable>
        </View>

        {!hasLinked ? (
          <Text style={styles.emptyLinked}>
            Aucun objectif, projet ou connaissance rattaché. Touchez « Relier » pour connecter ce pilier au reste de votre système.
          </Text>
        ) : (
          groups.map((g) => {
            const list = (ctx?.[g.key] as Entity[]) || [];
            if (list.length === 0) return null;
            return (
              <View key={g.key} style={{ marginTop: spacing.lg }}>
                <Text style={styles.groupLabel}>{g.label}</Text>
                {list.map((e) => (
                  <Pressable
                    key={e.id}
                    testID={`pillar-linked-${e.id}`}
                    onPress={() => openEntity(e)}
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceTertiary }]}
                  >
                    <Ionicons name="ellipse" size={7} color={colors.brandPrimary} />
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {e.title}
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceTertiary} />
                  </Pressable>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  hero: { marginBottom: spacing.xl },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: { ...typography.h1, fontSize: 34, color: colors.onSurface },
  mission: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 23, marginTop: spacing.sm },
  sectionLabel: { ...typography.overline, color: colors.brandPrimary, marginBottom: spacing.md, marginTop: spacing.lg },
  subsections: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  subChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  subChipText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  linkedHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  manageBtnText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  emptyLinked: { color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 20, marginTop: spacing.md },
  groupLabel: { ...typography.overline, color: colors.onSurfaceTertiary, marginBottom: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowTitle: { flex: 1, color: colors.onSurface, fontSize: 15 },
});
