import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ENTITY_LABELS, Entity, EntityContext } from "@/src/api/client";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const REL_TYPES = [
  "related_to",
  "has_goal",
  "has_project",
  "has_task",
  "concerns",
  "part_of",
  "depends_on",
  "references",
  "records",
  "supports",
];

function openEntity(type: string, id: string) {
  if (type === "knowledge") router.push({ pathname: "/knowledge/[id]", params: { id } });
  else router.push({ pathname: "/entity/[type]/[id]", params: { type, id } });
}

export default function EntityDetailScreen() {
  const { type, id } = useLocalSearchParams<{ type: string; id: string }>();
  const [entity, setEntity] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ctx, setCtx] = useState<EntityContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const saveTimer = useRef<any>(null);

  const load = useCallback(async () => {
    if (!type || !id) return;
    try {
      const [e, c] = await Promise.all([api.getEntity(type, id), api.entityContext(type, id)]);
      setEntity(e);
      setTitle(e.title || "");
      setDescription(e.description || e.content || "");
      setCtx(c);
    } catch {}
    setLoading(false);
  }, [type, id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!entity) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (title === entity.title && description === (entity.description || entity.content || "")) return;
      setSaving(true);
      try {
        const patch: any = { title: title.trim() || entity.title };
        patch.description = description;
        const updated = await api.updateEntity(type, id, patch);
        setEntity(updated);
      } catch {}
      setSaving(false);
    }, 800);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description]);

  async function onDelete() {
    try {
      await api.deleteEntity(type, id);
      router.back();
    } catch {}
  }

  const groups: { key: keyof EntityContext; label: string }[] = [
    { key: "telos", label: "Telos" },
    { key: "goals", label: "Objectifs" },
    { key: "projects", label: "Projets" },
    { key: "tasks", label: "Tâches" },
    { key: "knowledge", label: "Connaissances" },
    { key: "books", label: "Livres" },
    { key: "sources", label: "Sources" },
    { key: "journal_entries", label: "Journal" },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      </SafeAreaView>
    );
  }
  if (!entity) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={{ color: colors.onSurfaceTertiary }}>Entité introuvable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasContext = ctx && groups.some((g) => (ctx[g.key] as Entity[])?.length > 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable testID="entity-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.typeTag}>{ENTITY_LABELS[type] || type}</Text>
          <Text style={styles.savingText}>{saving ? "Enregistrement…" : "Enregistré"}</Text>
        </View>
        <Pressable testID="entity-delete" onPress={onDelete} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
          <TextInput
            testID="entity-title-input"
            value={title}
            onChangeText={setTitle}
            style={styles.titleInput}
            placeholder="Titre"
            placeholderTextColor={colors.onSurfaceTertiary}
            multiline
          />
          {entity.status ? <Text style={styles.status}>{entity.status}</Text> : null}
          <TextInput
            testID="entity-description-input"
            value={description}
            onChangeText={setDescription}
            style={styles.descInput}
            placeholder="Description, notes, détails…"
            placeholderTextColor={colors.onSurfaceTertiary}
            multiline
            textAlignVertical="top"
          />

          {/* Relations / Contexte */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>CONTEXTE</Text>
              <Pressable testID="entity-link-btn" onPress={() => setLinkOpen(true)} style={styles.linkBtn}>
                <Ionicons name="add" size={14} color={colors.brandPrimary} />
                <Text style={styles.linkBtnText}>Relier</Text>
              </Pressable>
            </View>

            {!hasContext ? (
              <Text style={styles.emptyCtx}>
                Aucune relation. Touchez « Relier » pour connecter cette entité à une autre.
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
                        testID={`ctx-${e.id}`}
                        onPress={() => openEntity(e.entity_type, e.id)}
                        style={({ pressed }) => [styles.ctxRow, pressed && { backgroundColor: colors.surfaceTertiary }]}
                      >
                        <Ionicons name="ellipse" size={7} color={colors.brandPrimary} />
                        <Text style={styles.ctxTitle} numberOfLines={1}>
                          {e.title}
                        </Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceTertiary} />
                      </Pressable>
                    ))}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LinkModal
        visible={linkOpen}
        onClose={() => setLinkOpen(false)}
        sourceType={type}
        sourceId={id}
        onLinked={async () => {
          setLinkOpen(false);
          setCtx(await api.entityContext(type, id));
        }}
      />
    </SafeAreaView>
  );
}

function LinkModal({
  visible,
  onClose,
  sourceType,
  sourceId,
  onLinked,
}: {
  visible: boolean;
  onClose: () => void;
  sourceType: string;
  sourceId: string;
  onLinked: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Entity[]>([]);
  const [target, setTarget] = useState<Entity | null>(null);
  const [relType, setRelType] = useState("related_to");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQ("");
      setResults([]);
      setTarget(null);
      setRelType("related_to");
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !q.trim()) {
      setResults([]);
      return;
    }
    let cancel = false;
    const t = setTimeout(async () => {
      try {
        const r = await api.universalSearch(q.trim());
        if (!cancel) setResults(r.results.filter((e) => !(e.entity_type === sourceType && e.id === sourceId)));
      } catch {}
    }, 180);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [q, visible, sourceType, sourceId]);

  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    try {
      await api.createRelation({
        source_type: sourceType,
        source_id: sourceId,
        target_type: target.entity_type,
        target_id: target.id,
        relation_type: relType,
      });
      onLinked();
    } catch {} finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.mScrim} onPress={onClose} testID="link-scrim">
        <Pressable style={styles.mSheet} onPress={() => {}}>
          <View style={styles.mHandle} />
          <Text style={styles.mTitle}>Relier à une entité</Text>

          {!target ? (
            <>
              <View style={styles.mSearch}>
                <Ionicons name="search-outline" size={16} color={colors.onSurfaceTertiary} />
                <TextInput
                  testID="link-search-input"
                  value={q}
                  onChangeText={setQ}
                  placeholder="Rechercher une entité…"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.mSearchInput}
                  autoFocus
                  autoCapitalize="none"
                />
              </View>
              <FlatList
                data={results}
                keyExtractor={(e) => `${e.entity_type}-${e.id}`}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 260 }}
                renderItem={({ item }) => (
                  <Pressable
                    testID={`link-result-${item.id}`}
                    onPress={() => setTarget(item)}
                    style={({ pressed }) => [styles.mRow, pressed && { backgroundColor: colors.surfaceTertiary }]}
                  >
                    <Text style={styles.mRowType}>{ENTITY_LABELS[item.entity_type] || item.entity_type}</Text>
                    <Text style={styles.mRowTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                  </Pressable>
                )}
                ListEmptyComponent={
                  q.trim() ? <Text style={styles.mEmpty}>Aucun résultat.</Text> : null
                }
              />
            </>
          ) : (
            <>
              <View style={styles.mTargetRow}>
                <Text style={styles.mRowType}>{ENTITY_LABELS[target.entity_type] || target.entity_type}</Text>
                <Text style={styles.mTargetTitle} numberOfLines={1}>
                  {target.title}
                </Text>
                <Pressable testID="link-change-target" onPress={() => setTarget(null)}>
                  <Ionicons name="close-circle" size={20} color={colors.onSurfaceTertiary} />
                </Pressable>
              </View>
              <Text style={styles.mSub}>Type de relation</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                {REL_TYPES.map((rt) => (
                  <Pressable
                    key={rt}
                    testID={`rel-${rt}`}
                    onPress={() => setRelType(rt)}
                    style={[styles.relChip, relType === rt && styles.relChipActive]}
                  >
                    <Text style={[styles.relChipText, relType === rt && styles.relChipTextActive]}>{rt}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                testID="link-confirm"
                onPress={confirm}
                disabled={busy}
                style={({ pressed }) => [styles.mConfirm, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Text style={styles.mConfirmText}>Créer la relation</Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radii.md },
  typeTag: { ...typography.overline, color: colors.brandPrimary },
  savingText: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  titleInput: { ...typography.h1, fontSize: 30, color: colors.onSurface, padding: 0 },
  status: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: spacing.sm, textTransform: "capitalize" },
  descInput: {
    marginTop: spacing.xl,
    color: colors.onSurface,
    fontSize: 16,
    lineHeight: 25,
    minHeight: 140,
    padding: 0,
  },
  section: { marginTop: spacing.xxxl, paddingTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.divider },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { ...typography.overline, color: colors.brandPrimary },
  linkBtn: {
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
  linkBtnText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  emptyCtx: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: spacing.md, lineHeight: 20 },
  groupLabel: { ...typography.overline, color: colors.onSurfaceTertiary, marginBottom: spacing.xs },
  ctxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  ctxTitle: { flex: 1, color: colors.onSurface, fontSize: 15 },
  // Modal
  mScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  mSheet: {
    backgroundColor: colors.surfaceSecondary,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  mHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  mTitle: { ...typography.h3, color: colors.onSurface },
  mSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  mSearchInput: { flex: 1, color: colors.onSurface, fontSize: 15, paddingVertical: spacing.md },
  mRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  mRowType: { ...typography.overline, color: colors.brandSecondary, width: 90 },
  mRowTitle: { flex: 1, color: colors.onSurface, fontSize: 15 },
  mEmpty: { color: colors.onSurfaceTertiary, fontSize: 13, paddingVertical: spacing.lg },
  mTargetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  mTargetTitle: { flex: 1, color: colors.onSurface, fontSize: 15 },
  mSub: { ...typography.overline, color: colors.onSurfaceTertiary, marginTop: spacing.sm },
  relChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  relChipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  relChipText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  relChipTextActive: { color: colors.brandPrimary, fontWeight: "600" },
  mConfirm: {
    marginTop: spacing.md,
    backgroundColor: colors.brandPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  mConfirmText: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 15 },
});
