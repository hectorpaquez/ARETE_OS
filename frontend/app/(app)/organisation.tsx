import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, Entity } from "@/src/api/client";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const TYPES: { type: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "telos", label: "Telos", icon: "compass-outline" },
  { type: "goal", label: "Objectifs", icon: "flag-outline" },
  { type: "project", label: "Projets", icon: "cube-outline" },
  { type: "task", label: "Tâches", icon: "checkmark-circle-outline" },
  { type: "journal", label: "Journal", icon: "book-outline" },
];

export default function OrganisationScreen() {
  const [type, setType] = useState("goal");
  const [items, setItems] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listEntities(type);
      setItems(list);
    } catch {}
    setLoading(false);
  }, [type]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function create() {
    const title = input.trim();
    if (!title || creating) return;
    setCreating(true);
    try {
      const ent = await api.createEntity(type, { title });
      setInput("");
      router.push({ pathname: "/entity/[type]/[id]", params: { type, id: ent.id } });
    } catch {} finally {
      setCreating(false);
    }
  }

  const current = TYPES.find((t) => t.type === type)!;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Organisation</Text>
        <Text style={styles.subtitle}>Telos → Objectif → Projet → Tâche</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipRowContent}
        >
          {TYPES.map((t) => {
            const active = t.type === type;
            return (
              <Pressable
                key={t.type}
                testID={`org-chip-${t.type}`}
                onPress={() => setType(t.type)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Ionicons
                  name={t.icon}
                  size={14}
                  color={active ? colors.brandPrimary : colors.onSurfaceSecondary}
                />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.createRow}>
          <TextInput
            testID="org-create-input"
            value={input}
            onChangeText={setInput}
            placeholder={`Nouveau : ${current.label.toLowerCase()}…`}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.createInput}
            onSubmitEditing={create}
            returnKeyType="done"
          />
          <Pressable
            testID="org-create-btn"
            onPress={create}
            disabled={!input.trim() || creating}
            style={({ pressed }) => [
              styles.createBtn,
              (!input.trim() || creating) && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.onBrandPrimary} />
            ) : (
              <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
            )}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingBottom: 160, paddingTop: spacing.sm }}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`org-row-${item.id}`}
              onPress={() => router.push({ pathname: "/entity/[type]/[id]", params: { type, id: item.id } })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceTertiary }]}
            >
              <Ionicons name={current.icon} size={16} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.status ? <Text style={styles.rowStatus}>{item.status}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={current.icon} size={38} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>Aucun élément.</Text>
              <Text style={styles.emptyHint}>
                Créez votre premier « {current.label.toLowerCase()} » ci-dessus, puis reliez-le au reste de votre système.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  title: { ...typography.h1, fontSize: 28, color: colors.onSurface, paddingHorizontal: spacing.xl },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 12, paddingHorizontal: spacing.xl, marginTop: 2 },
  chipRow: { marginTop: spacing.md, height: 40 },
  chipRowContent: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flexShrink: 0,
  },
  chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  chipTextActive: { color: colors.brandPrimary, fontWeight: "600" },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  createInput: { flex: 1, color: colors.onSurface, fontSize: 15, paddingVertical: spacing.sm },
  createBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.xl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: 60,
  },
  rowTitle: { color: colors.onSurface, fontSize: 16 },
  rowStatus: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", paddingHorizontal: spacing.xl, paddingVertical: spacing.xxxl * 1.5, gap: spacing.md },
  emptyTitle: { ...typography.h3, color: colors.onSurface },
  emptyHint: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center", lineHeight: 20 },
});
