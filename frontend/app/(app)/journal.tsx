import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
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
import { api, Entity } from "@/src/api/client";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

function todayLabel() {
  return new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export default function JournalScreen() {
  const [content, setContent] = useState("");
  const [sleep, setSleep] = useState("");
  const [energy, setEnergy] = useState<number | null>(null);
  const [deepWork, setDeepWork] = useState("");
  const [reading, setReading] = useState("");
  const [meditation, setMeditation] = useState("");
  const [sport, setSport] = useState(false);
  const [wins, setWins] = useState(["", "", ""]);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<Entity[]>([]);

  const load = useCallback(async () => {
    try {
      setRecent(await api.listEntities("journal"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function num(v: string): number | undefined {
    const n = parseFloat(v.replace(",", "."));
    return isNaN(n) ? undefined : n;
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await api.createEntity("journal", {
        title: todayLabel(),
        date: new Date().toISOString(),
        content,
        sleep_hours: num(sleep),
        energy: energy ?? undefined,
        deep_work_minutes: num(deepWork),
        reading_minutes: num(reading),
        meditation_minutes: num(meditation),
        sport,
        wins: wins.map((w) => w.trim()).filter(Boolean),
      });
      // reset
      setContent(""); setSleep(""); setEnergy(null); setDeepWork(""); setReading("");
      setMeditation(""); setSport(false); setWins(["", "", ""]);
      await load();
    } catch {} finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="journal-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Journal</Text>
        <Text style={styles.subtitle}>{todayLabel()}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
          <TextInput
            testID="journal-content"
            value={content}
            onChangeText={setContent}
            placeholder="Que s'est-il passé aujourd'hui ? Pensées, observations, décisions…"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.contentInput}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.sectionLabel}>ÉNERGIE</Text>
          <View style={styles.energyRow}>
            {[2, 4, 6, 8, 10].map((v) => (
              <Pressable
                key={v}
                testID={`journal-energy-${v}`}
                onPress={() => setEnergy(v)}
                style={[styles.energyDot, energy === v && styles.energyDotActive]}
              >
                <Text style={[styles.energyText, energy === v && styles.energyTextActive]}>{v}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>MÉTRIQUES</Text>
          <View style={styles.metricsGrid}>
            <Metric label="Sommeil (h)" value={sleep} onChange={setSleep} testID="journal-sleep" />
            <Metric label="Deep work (min)" value={deepWork} onChange={setDeepWork} testID="journal-deepwork" />
            <Metric label="Lecture (min)" value={reading} onChange={setReading} testID="journal-reading" />
            <Metric label="Méditation (min)" value={meditation} onChange={setMeditation} testID="journal-meditation" />
          </View>

          <Pressable
            testID="journal-sport"
            onPress={() => setSport((s) => !s)}
            style={[styles.sportRow, sport && styles.sportRowActive]}
          >
            <Ionicons name={sport ? "checkmark-circle" : "ellipse-outline"} size={20} color={sport ? colors.brandPrimary : colors.onSurfaceTertiary} />
            <Text style={styles.sportText}>Sport aujourd&apos;hui</Text>
          </Pressable>

          <Text style={styles.sectionLabel}>3 VICTOIRES DU JOUR</Text>
          {wins.map((w, i) => (
            <View key={i} style={styles.winRow}>
              <Text style={styles.winNum}>{i + 1}</Text>
              <TextInput
                testID={`journal-win-${i}`}
                value={w}
                onChangeText={(t) => setWins((arr) => arr.map((x, j) => (j === i ? t : x)))}
                placeholder={`Victoire ${i + 1}`}
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.winInput}
              />
            </View>
          ))}

          <Pressable
            testID="journal-save"
            onPress={save}
            disabled={saving}
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
          >
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveBtnText}>Enregistrer l&apos;entrée</Text>}
          </Pressable>

          {recent.length > 0 && (
            <View style={{ marginTop: spacing.xxl }}>
              <Text style={styles.sectionLabel}>ENTRÉES RÉCENTES</Text>
              {recent.map((e) => (
                <Pressable
                  key={e.id}
                  testID={`journal-recent-${e.id}`}
                  onPress={() => router.push({ pathname: "/entity/[type]/[id]", params: { type: "journal", id: e.id } })}
                  style={({ pressed }) => [styles.recentRow, pressed && { backgroundColor: colors.surfaceTertiary }]}
                >
                  <Ionicons name="book-outline" size={16} color={colors.brandPrimary} />
                  <Text style={styles.recentTitle} numberOfLines={1}>{e.title}</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.onSurfaceTertiary} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Metric({ label, value, onChange, testID }: { label: string; value: string; onChange: (v: string) => void; testID: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder="0"
        placeholderTextColor={colors.onSurfaceTertiary}
        keyboardType="numeric"
        style={styles.metricInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md },
  backBtn: { width: 40, height: 40, marginLeft: -spacing.sm, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h1, fontSize: 30, color: colors.onSurface, marginTop: spacing.sm },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 13, marginTop: 2, textTransform: "capitalize" },
  contentInput: {
    color: colors.onSurface,
    fontSize: 16,
    lineHeight: 25,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  sectionLabel: { ...typography.overline, color: colors.brandPrimary, marginTop: spacing.xl, marginBottom: spacing.md },
  energyRow: { flexDirection: "row", gap: spacing.sm },
  energyDot: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
  },
  energyDotActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  energyText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  energyTextActive: { color: colors.brandPrimary, fontWeight: "700" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metric: {
    width: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  metricLabel: { color: colors.onSurfaceTertiary, fontSize: 12 },
  metricInput: { color: colors.onSurface, fontSize: 20, marginTop: 4, padding: 0 },
  sportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  sportRowActive: { borderColor: colors.brandPrimary },
  sportText: { color: colors.onSurface, fontSize: 15 },
  winRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  winNum: {
    width: 26, height: 26, borderRadius: 13, textAlign: "center", lineHeight: 26,
    backgroundColor: colors.brandTertiary, color: colors.brandPrimary, fontSize: 13,
  },
  winInput: {
    flex: 1, color: colors.onSurface, fontSize: 15,
    borderBottomWidth: 1, borderBottomColor: colors.borderStrong, paddingVertical: spacing.sm,
  },
  saveBtn: {
    marginTop: spacing.xxl, backgroundColor: colors.brandPrimary, borderRadius: radii.md,
    paddingVertical: spacing.lg, alignItems: "center", justifyContent: "center", minHeight: 48,
  },
  saveBtnText: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 15, letterSpacing: 0.5 },
  recentRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  recentTitle: { flex: 1, color: colors.onSurface, fontSize: 15, textTransform: "capitalize" },
});
