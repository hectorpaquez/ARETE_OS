import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityRow, api, Page, Stats } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function DashboardScreen() {
  const { user } = useAuth();
  const [capture, setCapture] = useState("");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [recentPages, setRecentPages] = useState<Page[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, a, pages] = await Promise.all([api.stats(), api.activity(), api.listPages()]);
      setStats(s);
      setActivity(a);
      setRecentPages(pages.slice(0, 5));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onCapture() {
    const title = capture.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const page = await api.createPage({ title, content: "" });
      setCapture("");
      await load();
      router.push({ pathname: "/knowledge/[id]", params: { id: page.id } });
    } catch (e: any) {
      // fallback: try to open existing
      try {
        const existing = await api.getPageByTitle(title);
        setCapture("");
        router.push({ pathname: "/knowledge/[id]", params: { id: existing.id } });
      } catch {}
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        testID="dashboard-scroll"
        data={activity}
        keyExtractor={(a) => a.id}
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
        contentContainerStyle={{ paddingBottom: 160 }}
        ListHeaderComponent={
          <View>
            {/* Wordmark header */}
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.wordmark}>ARETÉ</Text>
                <Text style={styles.greeting}>Bonjour {user?.name || ""}</Text>
              </View>
              <Pressable
                testID="header-search"
                onPress={() => router.push("/knowledge")}
                style={styles.headerBtn}
              >
                <Ionicons name="search-outline" size={20} color={colors.onSurfaceSecondary} />
              </Pressable>
            </View>

            {/* Quick capture */}
            <View style={styles.captureBlock}>
              <Text style={styles.overline}>CAPTURE RAPIDE</Text>
              <View style={styles.captureRow}>
                <TextInput
                  testID="quick-capture-input"
                  value={capture}
                  onChangeText={setCapture}
                  placeholder="Une pensée, un titre, [[une connexion]]…"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.captureInput}
                  onSubmitEditing={onCapture}
                  returnKeyType="done"
                />
                <Pressable
                  testID="quick-capture-submit"
                  onPress={onCapture}
                  disabled={!capture.trim() || saving}
                  style={({ pressed }) => [
                    styles.captureBtn,
                    (!capture.trim() || saving) && { opacity: 0.4 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.onBrandPrimary} size="small" />
                  ) : (
                    <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
                  )}
                </Pressable>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow} testID="dashboard-stats">
              <StatCell label="Pages" value={stats?.pages ?? 0} />
              <View style={styles.statSep} />
              <StatCell label="Liens" value={stats?.links ?? 0} />
              <View style={styles.statSep} />
              <StatCell label="Tags" value={stats?.tags ?? 0} />
              <View style={styles.statSep} />
              <StatCell label="Ébauches" value={stats?.stubs ?? 0} />
            </View>

            {/* Recent pages */}
            {recentPages.length > 0 && (
              <View style={{ marginTop: spacing.xxl }}>
                <Text style={styles.sectionTitle}>Récentes</Text>
                {recentPages.map((p) => (
                  <Pressable
                    key={p.id}
                    testID={`recent-page-${p.id}`}
                    onPress={() => router.push({ pathname: "/knowledge/[id]", params: { id: p.id } })}
                    style={({ pressed }) => [styles.pageRow, pressed && { backgroundColor: colors.surfaceTertiary }]}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={16}
                      color={p.status === "stub" ? colors.onSurfaceTertiary : colors.brandPrimary}
                    />
                    <Text style={styles.pageRowTitle} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.onSurfaceTertiary} />
                  </Pressable>
                ))}
              </View>
            )}

            {/* Activity title */}
            <Text style={[styles.sectionTitle, { marginTop: spacing.xxl }]}>Activité</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        renderItem={({ item }) => (
          <View style={styles.activityRow}>
            <Text style={styles.activityAction}>{humanAction(item.action)}</Text>
            <Text style={styles.activityMeta} numberOfLines={1}>
              {item.meta?.title || item.entity_type}
            </Text>
            <Text style={styles.activityTime}>{timeAgo(item.created_at)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyActivity}>
            <Text style={styles.emptyText}>Aucune activité pour l'instant.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function humanAction(a: string) {
  switch (a) {
    case "create":
      return "Créé";
    case "update":
      return "Modifié";
    case "delete":
      return "Supprimé";
    case "auto_create":
      return "Ébauche";
    default:
      return a;
  }
}

function timeAgo(iso: string) {
  try {
    const then = new Date(iso).getTime();
    const s = Math.max(1, Math.round((Date.now() - then) / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    if (s < 86400) return `${Math.round(s / 3600)}h`;
    return `${Math.round(s / 86400)}j`;
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  wordmark: {
    ...typography.h1,
    fontSize: 32,
    color: colors.brandPrimary,
    letterSpacing: 5,
  },
  greeting: {
    color: colors.onSurfaceSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  captureBlock: {
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  overline: {
    ...typography.overline,
    color: colors.onSurfaceTertiary,
    marginBottom: spacing.sm,
  },
  captureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    paddingBottom: spacing.md,
  },
  captureInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 16,
    paddingVertical: spacing.md,
  },
  captureBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
  },
  statSep: { width: 1, height: 32, backgroundColor: colors.divider },
  statValue: {
    ...typography.h2,
    fontSize: 22,
    color: colors.onSurface,
  },
  statLabel: {
    ...typography.overline,
    color: colors.onSurfaceTertiary,
    marginTop: 2,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.onSurface,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  pageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  pageRowTitle: { flex: 1, color: colors.onSurface, fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.xl },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  activityAction: {
    ...typography.overline,
    color: colors.brandPrimary,
    width: 72,
  },
  activityMeta: { flex: 1, color: colors.onSurface, fontSize: 14 },
  activityTime: { color: colors.onSurfaceTertiary, fontSize: 12 },
  emptyActivity: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  emptyText: { color: colors.onSurfaceTertiary, fontSize: 13 },
});
