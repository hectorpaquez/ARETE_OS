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
import { MarkdownBlocks } from "@/src/components/MarkdownBlocks";
import { FormatToolbar, FormatAction } from "@/src/components/FormatToolbar";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

function aiErrText(e: any): string {
  const m = e?.message || "";
  if (m.includes("503") || m.toLowerCase().includes("clé")) return "IA indisponible (clé non configurée).";
  if (m.includes("vide")) return "La page est vide, rien à traiter.";
  return "L'IA a rencontré une erreur. Réessayez.";
}

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
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [forcedSelection, setForcedSelection] = useState<{ start: number; end: number } | null>(null);
  const contentRef = useRef<TextInput | null>(null);
  const [aiBusy, setAiBusy] = useState<null | "summary" | "links" | "expand">(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
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

  // ---- Block formatting -----------------------------------------------------
  function applyEdit(newText: string, cursor: number) {
    setContent(newText);
    setForcedSelection({ start: cursor, end: cursor });
    requestAnimationFrame(() => contentRef.current?.focus());
  }

  function lineBoundsAt(text: string, pos: number) {
    const start = text.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
    let end = text.indexOf("\n", pos);
    if (end === -1) end = text.length;
    return { start, end };
  }

  function toggleLinePrefix(prefixes: string[]) {
    const pos = selection.start;
    const { start } = lineBoundsAt(content, pos);
    const lineStartText = content.slice(start);
    // Strip any existing list/heading/quote prefix first
    const existing = /^(#{1,3}\s|>\s|-\s|\d+\.\s)/.exec(lineStartText);
    let stripLen = existing ? existing[0].length : 0;
    const primary = prefixes[0];
    const alreadyHas = lineStartText.startsWith(primary);
    const before = content.slice(0, start);
    const rest = content.slice(start + stripLen);
    let newText: string;
    let cursor: number;
    if (alreadyHas && stripLen === primary.length) {
      // toggle off
      newText = before + rest;
      cursor = Math.max(start, pos - primary.length);
    } else {
      newText = before + primary + rest;
      cursor = pos - stripLen + primary.length;
    }
    applyEdit(newText, cursor);
  }

  function wrapSelection(wrap: string, placeholder: string) {
    const { start, end } = selection;
    const sel = content.slice(start, end) || placeholder;
    const newText = content.slice(0, start) + wrap + sel + wrap + content.slice(end);
    const cursor = start + wrap.length + sel.length + wrap.length;
    applyEdit(newText, cursor);
  }

  function insertLink() {
    const { start, end } = selection;
    const sel = content.slice(start, end) || "Titre";
    const newText = content.slice(0, start) + "[[" + sel + "]]" + content.slice(end);
    // place cursor inside brackets if placeholder, else after
    const cursor = start + 2 + sel.length;
    applyEdit(newText, cursor);
  }

  function insertCodeBlock() {
    const pos = selection.start;
    const prefix = pos > 0 && content[pos - 1] !== "\n" ? "\n" : "";
    const snippet = prefix + "```\ncode\n```\n";
    const newText = content.slice(0, pos) + snippet + content.slice(pos);
    const cursor = pos + prefix.length + 4; // right after opening fence + newline
    applyEdit(newText, cursor);
  }

  function onFormat(action: FormatAction) {
    switch (action) {
      case "h1":
        return toggleLinePrefix(["# "]);
      case "h2":
        return toggleLinePrefix(["## "]);
      case "h3":
        return toggleLinePrefix(["### "]);
      case "quote":
        return toggleLinePrefix(["> "]);
      case "ul":
        return toggleLinePrefix(["- "]);
      case "ol":
        return toggleLinePrefix(["1. "]);
      case "bold":
        return wrapSelection("**", "texte");
      case "italic":
        return wrapSelection("*", "texte");
      case "code":
        return insertCodeBlock();
      case "link":
        return insertLink();
    }
  }

  // ---- Daimōn (AI) actions ---------------------------------------------------
  async function aiSummarize() {
    if (!page || aiBusy) return;
    setAiBusy("summary");
    setAiError(null);
    try {
      const res = await api.aiSummarize(page.id);
      setAiSummary(res.summary);
    } catch (e: any) {
      setAiError(aiErrText(e));
    } finally {
      setAiBusy(null);
    }
  }

  async function aiSuggest() {
    if (!page || aiBusy) return;
    setAiBusy("links");
    setAiError(null);
    try {
      const res = await api.aiSuggestLinks(page.id);
      setAiSuggestions(res.suggestions);
    } catch (e: any) {
      setAiError(aiErrText(e));
    } finally {
      setAiBusy(null);
    }
  }

  async function aiExpand() {
    if (!page || aiBusy) return;
    setAiBusy("expand");
    setAiError(null);
    try {
      const res = await api.aiExpand(page.title, page.id);
      const newContent = (content ? content.trimEnd() + "\n\n" : "") + res.text;
      setContent(newContent);
      const updated = await api.updatePage(page.id, { content: newContent });
      setPage(updated);
      setBacklinks(await api.backlinks(updated.id));
    } catch (e: any) {
      setAiError(aiErrText(e));
    } finally {
      setAiBusy(null);
    }
  }

  async function insertSuggestion(t: string) {
    if (!page) return;
    const marker = `[[${t}]]`;
    if (content.includes(marker)) return;
    const newContent =
      (content ? content.trimEnd() + "\n\n" : "") +
      (content.includes("## Voir aussi") ? `- ${marker}` : `## Voir aussi\n- ${marker}`);
    setContent(newContent);
    setAiSuggestions((s) => (s ? s.filter((x) => x !== t) : s));
    try {
      const updated = await api.updatePage(page.id, { content: newContent });
      setPage(updated);
      setBacklinks(await api.backlinks(updated.id));
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
                  ref={contentRef}
                  testID="page-content-input"
                  value={content}
                  onChangeText={setContent}
                  onSelectionChange={(e) => {
                    setSelection(e.nativeEvent.selection);
                    if (forcedSelection) setForcedSelection(null);
                  }}
                  selection={forcedSelection ?? undefined}
                  style={styles.contentInput}
                  placeholder="Écrivez ici. Utilisez [[Titre]] pour lier une page, ## pour un titre, > pour une citation, - pour une liste."
                  placeholderTextColor={colors.onSurfaceTertiary}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.formatHint}>
                  Astuce : Markdown supporté — ## Titre · &gt; Citation · - Liste · ``` code ``` · **gras** · [[lien]]
                </Text>
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
                  <View style={styles.contentView}>
                    <MarkdownBlocks content={content} onLinkPress={onLinkPress} />
                  </View>
                ) : (
                  <Text style={styles.placeholderText}>
                    Cette page est vide. Touchez le crayon pour l'éditer.
                  </Text>
                )}

                {/* Daimōn AI actions */}
                <View style={styles.aiSection} testID="ai-section">
                  <Text style={styles.aiLabel}>DAIMŌN</Text>
                  <View style={styles.aiActions}>
                    <Pressable
                      testID="ai-summarize"
                      onPress={aiSummarize}
                      disabled={!!aiBusy}
                      style={({ pressed }) => [styles.aiBtn, pressed && { opacity: 0.7 }, !!aiBusy && { opacity: 0.5 }]}
                    >
                      {aiBusy === "summary" ? (
                        <ActivityIndicator size="small" color={colors.brandPrimary} />
                      ) : (
                        <Ionicons name="document-text-outline" size={15} color={colors.brandPrimary} />
                      )}
                      <Text style={styles.aiBtnText}>Résumer</Text>
                    </Pressable>
                    <Pressable
                      testID="ai-suggest-links"
                      onPress={aiSuggest}
                      disabled={!!aiBusy}
                      style={({ pressed }) => [styles.aiBtn, pressed && { opacity: 0.7 }, !!aiBusy && { opacity: 0.5 }]}
                    >
                      {aiBusy === "links" ? (
                        <ActivityIndicator size="small" color={colors.brandPrimary} />
                      ) : (
                        <Ionicons name="git-branch-outline" size={15} color={colors.brandPrimary} />
                      )}
                      <Text style={styles.aiBtnText}>Suggérer des liens</Text>
                    </Pressable>
                    <Pressable
                      testID="ai-expand"
                      onPress={aiExpand}
                      disabled={!!aiBusy}
                      style={({ pressed }) => [styles.aiBtn, pressed && { opacity: 0.7 }, !!aiBusy && { opacity: 0.5 }]}
                    >
                      {aiBusy === "expand" ? (
                        <ActivityIndicator size="small" color={colors.brandPrimary} />
                      ) : (
                        <Ionicons name="expand-outline" size={15} color={colors.brandPrimary} />
                      )}
                      <Text style={styles.aiBtnText}>Développer</Text>
                    </Pressable>
                  </View>

                  {aiError ? <Text style={styles.aiError} testID="ai-error">{aiError}</Text> : null}

                  {aiSummary ? (
                    <View style={styles.aiResult} testID="ai-summary-result">
                      <Text style={styles.aiResultLabel}>Résumé</Text>
                      <Text style={styles.aiResultText}>{aiSummary}</Text>
                    </View>
                  ) : null}

                  {aiSuggestions ? (
                    <View style={styles.aiResult} testID="ai-suggestions-result">
                      <Text style={styles.aiResultLabel}>Connexions suggérées</Text>
                      {aiSuggestions.length === 0 ? (
                        <Text style={styles.aiResultText}>Aucune connexion pertinente trouvée.</Text>
                      ) : (
                        <View style={styles.suggWrap}>
                          {aiSuggestions.map((s) => (
                            <Pressable
                              key={s}
                              testID={`ai-suggestion-${s}`}
                              onPress={() => insertSuggestion(s)}
                              style={({ pressed }) => [styles.suggChip, pressed && { opacity: 0.7 }]}
                            >
                              <Ionicons name="add" size={13} color={colors.brandPrimary} />
                              <Text style={styles.suggChipText}>{s}</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
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
        {editMode && <FormatToolbar onAction={onFormat} />}
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
  aiSection: {
    marginTop: spacing.xxxl,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  aiLabel: { ...typography.overline, color: colors.brandPrimary, marginBottom: spacing.md },
  aiActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  aiBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    minHeight: 40,
  },
  aiBtnText: { color: colors.onSurface, fontSize: 13 },
  aiError: { color: colors.onError, fontSize: 13, marginTop: spacing.md },
  aiResult: {
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
  },
  aiResultLabel: { ...typography.overline, color: colors.onSurfaceTertiary, marginBottom: spacing.sm },
  aiResultText: { color: colors.onSurface, fontSize: 15, lineHeight: 23 },
  suggWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  suggChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  suggChipText: { color: colors.brandPrimary, fontSize: 13 },
  formatHint: {
    marginTop: spacing.md,
    color: colors.onSurfaceTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
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
