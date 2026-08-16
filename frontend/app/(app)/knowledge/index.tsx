import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, Page } from "@/src/api/client";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function KnowledgeIndex() {
  const [pages, setPages] = useState<Page[]>([]);
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [q, setQ] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t] = await Promise.all([api.listPages(), api.tags()]);
      setPages(p);
      setTags(t);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    let list = pages;
    if (selectedTag) list = list.filter((p) => p.tags.includes(selectedTag));
    if (q.trim()) {
      const ql = q.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(ql) ||
          p.content.toLowerCase().includes(ql) ||
          p.tags.some((t) => t.toLowerCase().includes(ql)),
      );
    }
    return list;
  }, [pages, q, selectedTag]);

  async function onCreate() {
    if (creating) return;
    const title = q.trim() || "Nouvelle page";
    setCreating(true);
    try {
      const page = await api.createPage({ title, content: "" });
      setQ("");
      router.push({ pathname: "/knowledge/[id]", params: { id: page.id } });
    } catch {
      try {
        const existing = await api.getPageByTitle(title);
        router.push({ pathname: "/knowledge/[id]", params: { id: existing.id } });
      } catch {}
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Sticky header */}
      <View style={styles.header}>
        <Text style={styles.title}>Connaissances</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={colors.onSurfaceTertiary} />
          <TextInput
            testID="knowledge-search-input"
            value={q}
            onChangeText={setQ}
            placeholder="Rechercher ou créer…"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            testID="knowledge-create-btn"
            onPress={onCreate}
            disabled={creating}
            style={({ pressed }) => [
              styles.createBtn,
              pressed && { opacity: 0.7 },
              creating && { opacity: 0.5 },
            ]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.onBrandPrimary} />
            ) : (
              <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
            )}
          </Pressable>
        </View>

        {/* Tag chips (horizontal scroll, single row) */}
        {tags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipRow}
            contentContainerStyle={styles.chipRowContent}
          >
            <Chip
              label="Toutes"
              active={!selectedTag}
              onPress={() => setSelectedTag(null)}
              testID="chip-all"
            />
            {tags.map((t) => (
              <Chip
                key={t.tag}
                label={`#${t.tag} · ${t.count}`}
                active={selectedTag === t.tag}
                onPress={() => setSelectedTag(selectedTag === t.tag ? null : t.tag)}
                testID={`chip-${t.tag}`}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 160 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              tintColor={colors.brandPrimary}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => (
            <Pressable
              testID={`page-row-${item.id}`}
              onPress={() => router.push({ pathname: "/knowledge/[id]", params: { id: item.id } })}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surfaceTertiary },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.status === "stub" && <Text style={styles.stubBadge}>ÉBAUCHE</Text>}
                </View>
                {item.content ? (
                  <Text style={styles.rowSnippet} numberOfLines={1}>
                    {item.content.replace(/\[\[([^\]]+)\]\]/g, "$1").slice(0, 120)}
                  </Text>
                ) : null}
                {item.tags.length > 0 && (
                  <View style={styles.rowTags}>
                    {item.tags.slice(0, 4).map((t) => (
                      <Text key={t} style={styles.tagLabel}>
                        #{t}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="library-outline" size={40} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>Votre bibliothèque est vide.</Text>
              <Text style={styles.emptyHint}>
                Tapez un titre ci-dessus puis « + » pour créer votre première page.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.h1,
    fontSize: 28,
    color: colors.onSurface,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  createBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  chipRow: { marginTop: spacing.md, height: 40 },
  chipRowContent: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: "center" },
  chip: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  chipTextActive: { color: colors.brandPrimary, fontWeight: "600" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.xl },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: 64,
  },
  rowTitle: { color: colors.onSurface, fontSize: 16, flexShrink: 1 },
  rowSnippet: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 4 },
  rowTags: { flexDirection: "row", gap: spacing.sm, marginTop: 6, flexWrap: "wrap" },
  tagLabel: { color: colors.brandSecondary, fontSize: 11 },
  stubBadge: {
    color: colors.onSurfaceTertiary,
    fontSize: 10,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl * 2,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.h3, color: colors.onSurface, textAlign: "center" },
  emptyHint: {
    color: colors.onSurfaceTertiary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },
});
