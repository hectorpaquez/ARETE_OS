import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, Entity, ENTITY_LABELS } from "@/src/api/client";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  icon: keyof typeof Ionicons.glyphMap;
  run: (query: string) => void;
};

export default function CommandPalette({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (visible) {
      setQ("");
      setResults([]);
      // small delay to allow modal to mount before focusing
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (!q.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.universalSearch(q.trim());
        if (!cancelled) setResults(res.results);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, visible]);

  const commands: Cmd[] = useMemo(
    () => [
      {
        id: "new-page",
        label: q.trim() ? `Créer la page « ${q.trim()} »` : "Créer une nouvelle page",
        hint: "Nouvelle connaissance",
        icon: "add-circle-outline",
        run: async (query) => {
          const title = query.trim() || "Sans titre";
          try {
            const page = await api.createPage({ title, content: "" });
            onClose();
            router.push({ pathname: "/knowledge/[id]", params: { id: page.id } });
          } catch (e: any) {
            void e;
            // If it already exists, navigate to it
            try {
              const existing = await api.getPageByTitle(title);
              onClose();
              router.push({ pathname: "/knowledge/[id]", params: { id: existing.id } });
            } catch {}
          }
        },
      },
      {
        id: "new-goal",
        label: q.trim() ? `Nouvel objectif « ${q.trim()} »` : "Créer un objectif",
        icon: "flag-outline",
        run: async (query) => {
          const ent = await api.createEntity("goal", { title: query.trim() || "Nouvel objectif" });
          onClose();
          router.push({ pathname: "/entity/[type]/[id]", params: { type: "goal", id: ent.id } });
        },
      },
      {
        id: "new-project",
        label: q.trim() ? `Nouveau projet « ${q.trim()} »` : "Créer un projet",
        icon: "cube-outline",
        run: async (query) => {
          const ent = await api.createEntity("project", { title: query.trim() || "Nouveau projet" });
          onClose();
          router.push({ pathname: "/entity/[type]/[id]", params: { type: "project", id: ent.id } });
        },
      },
      {
        id: "new-task",
        label: q.trim() ? `Nouvelle tâche « ${q.trim()} »` : "Créer une tâche",
        icon: "checkmark-circle-outline",
        run: async (query) => {
          const ent = await api.createEntity("task", { title: query.trim() || "Nouvelle tâche" });
          onClose();
          router.push({ pathname: "/entity/[type]/[id]", params: { type: "task", id: ent.id } });
        },
      },
      {
        id: "go-dashboard",
        label: "Aller au Tableau de bord",
        icon: "home-outline",
        run: () => {
          onClose();
          router.push("/dashboard");
        },
      },
      {
        id: "go-organisation",
        label: "Ouvrir l'Organisation",
        icon: "git-merge-outline",
        run: () => {
          onClose();
          router.push("/organisation");
        },
      },
      {
        id: "go-graph",
        label: "Ouvrir le Graphe",
        icon: "git-network-outline",
        run: () => {
          onClose();
          router.push("/graph");
        },
      },
    ],
    [q, onClose],
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.scrim} onPress={onClose} testID="palette-scrim">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.centerBox}
          pointerEvents="box-none"
        >
          <Pressable style={styles.sheet} onPress={() => {}} testID="command-palette">
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color={colors.onSurfaceSecondary} />
              <TextInput
                ref={inputRef}
                value={q}
                onChangeText={setQ}
                placeholder="Rechercher, créer, naviguer…"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
                testID="palette-input"
                returnKeyType="search"
              />
              {loading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
            </View>

            <FlatList
              keyboardShouldPersistTaps="handled"
              data={results}
              keyExtractor={(p) => p.id}
              ItemSeparatorComponent={() => <View style={styles.divider} />}
              ListHeaderComponent={
                results.length === 0 ? (
                  <View>
                    <Text style={styles.sectionLabel}>ACTIONS</Text>
                    {commands.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => c.run(q)}
                        style={({ pressed }) => [
                          styles.row,
                          pressed && { backgroundColor: colors.surfaceTertiary },
                        ]}
                        testID={`palette-cmd-${c.id}`}
                      >
                        <Ionicons name={c.icon} size={18} color={colors.brandPrimary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowLabel} numberOfLines={1}>
                            {c.label}
                          </Text>
                          {c.hint ? <Text style={styles.rowHint}>{c.hint}</Text> : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.sectionLabel}>RÉSULTATS · {results.length}</Text>
                )
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onClose();
                    if (item.entity_type === "knowledge") {
                      router.push({ pathname: "/knowledge/[id]", params: { id: item.id } });
                    } else {
                      router.push({ pathname: "/entity/[type]/[id]", params: { type: item.entity_type, id: item.id } });
                    }
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: colors.surfaceTertiary },
                  ]}
                  testID={`palette-result-${item.id}`}
                >
                  <Ionicons
                    name="document-text-outline"
                    size={18}
                    color={item.status === "stub" ? colors.onSurfaceTertiary : colors.brandPrimary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowHint} numberOfLines={1}>
                      {(ENTITY_LABELS[item.entity_type] || item.entity_type) +
                        (item.status === "stub" ? " · Ébauche" : item.summary ? " · " + item.summary : "")}
                    </Text>
                  </View>
                </Pressable>
              )}
              style={{ maxHeight: 380 }}
            />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  centerBox: {
    flex: 1,
    paddingTop: 80,
    paddingHorizontal: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 16,
    padding: 0,
  },
  sectionLabel: {
    ...typography.overline,
    color: colors.onSurfaceTertiary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  divider: { height: 1, backgroundColor: colors.divider, marginLeft: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  rowLabel: { color: colors.onSurface, fontSize: 15 },
  rowHint: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
});
