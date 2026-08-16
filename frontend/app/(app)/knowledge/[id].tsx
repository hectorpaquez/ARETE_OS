import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, LinkRow, Page } from "@/src/api/client";
import { RichText } from "@/src/components/RichText";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function KnowledgePageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [backlinks, setBacklinks] = useState<LinkRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<any>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, bl] = await Promise.all([api.getPage(id), api.backlinks(id)]);
      setPage(p);
      setTitle(p.title);
      setContent(p.content);
      setTagsInput(p.tags.join(", "));
      setBacklinks(bl);
      if (p.status === "stub" || !p.content) setEditMode(true);
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced auto-save when editing
  useEffect(() => {
    if (!page || !editMode) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (title.trim() === page.title && content === page.content && tagsInput === page.tags.join(", ")) return;
      setSaving(true);
      try {
        const tags = tagsInput
          .split(",")
          .map((t) => t.trim().replace(/^#/, ""))
          .filter(Boolean);
        const updated = await api.updatePage(page.id, {
          title: title.trim() || page.title,
          content,
          tags,
        });
        setPage(updated);
        const bl = await api.backlinks(updated.id);
        setBacklinks(bl);
      } catch {}
      setSaving(false);
    }, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, tagsInput, editMode]);

  async function onLinkPress(t: string) {
    try {
      const existing = await api.getPageByTitle(t);
      router.push({ pathname: "/knowledge/[id]", params: { id: existing.id } });
    } catch {
      try {
        const created = await api.createPage({ title: t });
        router.push({ pathname: "/knowledge/[id]", params: { id: created.id } });
      } catch {}
    }
  }

  async function onDelete() {
    if (!page) return;
    try {
      await api.deletePage(page.id);
      router.back();
    } catch {}
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
  if (!page) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={{ color: colors.onSurfaceTertiary }}>Page introuvable.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Sticky header */}
      <View style={styles.topBar}>
        <Pressable
          testID="page-back"
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          {saving ? (
            <Text style={styles.savingText}>Enregistrement…</Text>
          ) : (
            <Text style={styles.savingText}>{page.status === "stub" ? "Ébauche" : "Enregistré"}</Text>
          )}
        </View>
        <Pressable
          testID="page-toggle-edit"
          onPress={() => setEditMode((v) => !v)}
          style={styles.iconBtn}
        >
          <Ionicons
            name={editMode ? "eye-outline" : "create-outline"}
            size={20}
            color={colors.onSurface}
          />
        </Pressable>
        <Pressable testID="page-delete" onPress={onDelete} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={20} color={colors.onSurfaceSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 200 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.body}>
            {editMode ? (
              <>
                <TextInput
                  testID="page-title-input"
                  value={title}
                  onChangeText={setTitle}
                  style={styles.titleInput}
                  placeholder="Titre de la page"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  multiline
                />
                <TextInput
                  testID="page-tags-input"
                  value={tagsInput}
                  onChangeText={setTagsInput}
                  placeholder="tags séparés par des virgules"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.tagsInput}
                  autoCapitalize="none"
                />
                <TextInput
                  testID="page-content-input"
                  value={content}
                  onChangeText={setContent}
                  style={styles.contentInput}
                  placeholder="Écrivez ici. Utilisez [[Titre]] pour créer un lien vers une autre page."
                  placeholderTextColor={colors.onSurfaceTertiary}
                  multiline
                  textAlignVertical="top"
                />
              </>
            ) : (
              <>
                <Text style={styles.titleView} testID="page-title-view">
                  {page.title}
                </Text>
                {page.tags.length > 0 && (
                  <View style={styles.tagsRow}>
                    {page.tags.map((t) => (
                      <Text key={t} style={styles.tagPill}>
                        #{t}
                      </Text>
                    ))}
                  </View>
                )}
                {page.content ? (
                  <RichText
                    text={page.content}
                    onLinkPress={onLinkPress}
                    style={styles.contentView}
                  />
                ) : (
                  <Text style={styles.placeholderText}>
                    Cette page est vide. Touchez le crayon pour l'éditer.
                  </Text>
                )}
              </>
            )}

            {/* Backlinks */}
            <View style={styles.backlinksSection} testID="backlinks-section">
              <Text style={styles.backlinksLabel}>
                BACKLINKS · {backlinks.length}
              </Text>
              {backlinks.length === 0 ? (
                <Text style={styles.backlinksEmpty}>
                  Aucune page ne référence encore celle-ci.
                </Text>
              ) : (
                backlinks.map((b) => (
                  <Pressable
                    key={b.id}
                    testID={`backlink-${b.source_id}`}
                    onPress={() =>
                      router.push({ pathname: "/knowledge/[id]", params: { id: b.source_id } })
                    }
                    style={({ pressed }) => [
                      styles.backlinkRow,
                      pressed && { backgroundColor: colors.surfaceTertiary },
                    ]}
                  >
                    <Ionicons name="return-up-back-outline" size={16} color={colors.brandPrimary} />
                    <Text style={styles.backlinkTitle}>{b.source_title}</Text>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  savingText: { color: colors.onSurfaceTertiary, fontSize: 12, letterSpacing: 1 },
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  titleInput: {
    ...typography.h1,
    fontSize: 32,
    color: colors.onSurface,
    padding: 0,
  },
  titleView: {
    ...typography.h1,
    fontSize: 32,
    color: colors.onSurface,
  },
  tagsInput: {
    marginTop: spacing.md,
    color: colors.brandSecondary,
    fontSize: 13,
    padding: 0,
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  tagPill: { color: colors.brandSecondary, fontSize: 12 },
  contentInput: {
    marginTop: spacing.xl,
    color: colors.onSurface,
    fontSize: 16,
    lineHeight: 26,
    minHeight: 240,
    padding: 0,
  },
  contentView: {
    marginTop: spacing.xl,
    fontSize: 16,
    lineHeight: 26,
  },
  placeholderText: { marginTop: spacing.xl, color: colors.onSurfaceTertiary, fontSize: 14 },
  backlinksSection: {
    marginTop: spacing.xxxl,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  backlinksLabel: {
    ...typography.overline,
    color: colors.brandPrimary,
    marginBottom: spacing.md,
  },
  backlinksEmpty: { color: colors.onSurfaceTertiary, fontSize: 13 },
  backlinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  backlinkTitle: { color: colors.onSurface, fontSize: 15, flex: 1 },
});
