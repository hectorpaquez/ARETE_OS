import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

const METRICS: { key: string; label: string; unit: string; color: string }[] = [
  { key: "sleep_hours", label: "Sommeil", unit: "h", color: "#3B6EA5" },
  { key: "deep_work_minutes", label: "Travail profond", unit: "min", color: "#8C7355" },
  { key: "sport_minutes", label: "Sport", unit: "min", color: "#2D6A4F" },
  { key: "reading_minutes", label: "Lecture", unit: "min", color: "#5B4E7E" },
  { key: "meditation_minutes", label: "Méditation", unit: "min", color: "#8A9BA8" },
  { key: "energy", label: "Énergie", unit: "/10", color: "#C8A97E" },
];

const WEEKLY = ["Séances sportives", "Heures d'étude", "Heures de travail profond", "Temps d'écran moyen", "Jours de routine réussie", "Progression des projets", "Tâches prioritaires accomplies"];
const MONTHLY = ["Performance physique", "Progression académique", "Livres terminés", "Projets terminés", "Objectifs atteints", "Décisions importantes", "Erreurs répétées", "Score moyen de discipline"];

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 260;
  const h = 60;
  const nums = values.filter((v) => typeof v === "number");
  if (nums.length < 2) {
    return <Text style={styles.noData}>Données insuffisantes</Text>;
  }
  const max = Math.max(...nums, 1);
  const min = Math.min(...nums, 0);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => {
      const y = h - 6 - ((typeof v === "number" ? v : min) - min) / range * (h - 12);
      return `${(i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

export default function TrackingScreen() {
  const [data, setData] = useState<{ journals: any[]; workouts: any[]; studies: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [formType, setFormType] = useState<null | "workout" | "study">(null);

  const load = useCallback(async () => {
    try {
      setData(await api.tracking());
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const avg = useMemo(() => {
    const m: Record<string, string> = {};
    if (!data) return m;
    for (const met of METRICS) {
      const vals = data.journals.slice(-7).map((j) => j[met.key]).filter((v) => typeof v === "number");
      m[met.key] = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
    }
    return m;
  }, [data]);

  const hasJournals = data && data.journals.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="tracking-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Suivi</Text>
        <Text style={styles.subtitle}>Chaque métrique doit aider à décider. Pas de vanity metrics.</Text>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 160 }}>
          {/* Apple Health (native build required) */}
          <View style={styles.healthCard} testID="apple-health-card">
            <Ionicons name="heart-outline" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.healthTitle}>Apple Santé</Text>
              <Text style={styles.healthHint}>
                La synchronisation HealthKit nécessite un build iOS natif (indisponible dans Expo Go). L&apos;architecture est prête côté serveur.
              </Text>
            </View>
          </View>

          {!hasJournals ? (
            <View style={styles.empty}>
              <Ionicons name="stats-chart-outline" size={38} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyTitle}>Aucune donnée</Text>
              <Text style={styles.emptyHint}>Remplis ton journal quotidien pour voir tes indicateurs.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>14 DERNIERS JOURS</Text>
              {METRICS.map((met) => (
                <View key={met.key} style={styles.metricCard} testID={`metric-${met.key}`}>
                  <View style={styles.metricHead}>
                    <Text style={styles.metricName}>{met.label}</Text>
                    <Text style={styles.metricAvg}>
                      moy. 7j : {avg[met.key]} {met.unit}
                    </Text>
                  </View>
                  <Sparkline values={data!.journals.map((j) => j[met.key])} color={met.color} />
                </View>
              ))}
            </>
          )}

          {/* Sessions */}
          <View style={styles.sessionsGrid}>
            <SessionColumn
              title="Sport"
              icon="barbell-outline"
              items={data?.workouts || []}
              onAdd={() => setFormType("workout")}
              testIDPrefix="workout"
            />
            <SessionColumn
              title="Étude"
              icon="flask-outline"
              items={data?.studies || []}
              onAdd={() => setFormType("study")}
              testIDPrefix="study"
            />
          </View>

          {/* Weekly / Monthly placeholders */}
          <View style={styles.sessionsGrid}>
            <PlaceholderCard title="Hebdomadaires" items={WEEKLY} />
            <PlaceholderCard title="Mensuels" items={MONTHLY} />
          </View>
        </ScrollView>
      )}

      <SessionForm
        type={formType}
        onClose={() => setFormType(null)}
        onSaved={async () => {
          setFormType(null);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

function SessionColumn({ title, icon, items, onAdd, testIDPrefix }: any) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name={icon} size={16} color={colors.brandPrimary} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <Pressable testID={`add-${testIDPrefix}`} onPress={onAdd} style={styles.addBtn}>
          <Ionicons name="add" size={16} color={colors.brandPrimary} />
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Text style={styles.cardEmpty}>Aucune séance enregistrée.</Text>
      ) : (
        items.map((s: any) => (
          <View key={s.id} style={styles.sessRow}>
            <Text style={styles.sessTitle} numberOfLines={1}>{s.title}</Text>
            <Text style={styles.sessMeta}>{s.duration_minutes || 0} min</Text>
          </View>
        ))
      )}
    </View>
  );
}

function PlaceholderCard({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {items.map((it) => (
        <View key={it} style={styles.phRow}>
          <Ionicons name="ellipse" size={5} color={colors.onSurfaceTertiary} />
          <Text style={styles.phText}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

function SessionForm({ type, onClose, onSaved }: { type: null | "workout" | "study"; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (type) {
      setTitle(type === "workout" ? "Course" : "");
      setDuration("60");
      setNotes("");
    }
  }, [type]);

  async function save() {
    if (busy || !type) return;
    setBusy(true);
    try {
      await api.createEntity(type, {
        title: title.trim() || (type === "workout" ? "Séance" : "Étude"),
        duration_minutes: parseInt(duration, 10) || 0,
        notes,
        date: new Date().toISOString(),
      });
      onSaved();
    } catch {} finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!type} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.mScrim} onPress={onClose} testID="session-scrim">
        <Pressable style={styles.mSheet} onPress={() => {}}>
          <View style={styles.mHandle} />
          <Text style={styles.mTitle}>{type === "workout" ? "Nouvelle séance sportive" : "Nouvelle séance d'étude"}</Text>
          <Text style={styles.mLabel}>{type === "workout" ? "Type" : "Sujet"}</Text>
          <TextInput
            testID="session-title"
            value={title}
            onChangeText={setTitle}
            placeholder={type === "workout" ? "Course, Force, Natation…" : "Mathématiques, Physique…"}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.mInput}
            autoFocus
          />
          <Text style={styles.mLabel}>Durée (minutes)</Text>
          <TextInput
            testID="session-duration"
            value={duration}
            onChangeText={setDuration}
            keyboardType="numeric"
            style={styles.mInput}
          />
          <Text style={styles.mLabel}>Notes</Text>
          <TextInput
            testID="session-notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Optionnel"
            placeholderTextColor={colors.onSurfaceTertiary}
            style={[styles.mInput, { minHeight: 56 }]}
            multiline
          />
          <Pressable
            testID="session-save"
            onPress={save}
            disabled={busy}
            style={({ pressed }) => [styles.mSave, pressed && { opacity: 0.85 }, busy && { opacity: 0.6 }]}
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.mSaveText}>Enregistrer</Text>}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md },
  backBtn: { width: 40, height: 40, marginLeft: -spacing.sm, alignItems: "center", justifyContent: "center" },
  title: { ...typography.h1, fontSize: 30, color: colors.onSurface, marginTop: spacing.sm },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 2 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  healthCard: {
    flexDirection: "row", gap: spacing.md, alignItems: "flex-start",
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary, padding: spacing.lg,
  },
  healthTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  healthHint: { color: colors.onSurfaceTertiary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionLabel: { ...typography.overline, color: colors.brandPrimary, marginTop: spacing.xl, marginBottom: spacing.md },
  metricCard: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg,
    backgroundColor: colors.surfaceSecondary, padding: spacing.lg, marginBottom: spacing.md,
  },
  metricHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  metricName: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  metricAvg: { color: colors.onSurfaceTertiary, fontSize: 12 },
  noData: { color: colors.onSurfaceTertiary, fontSize: 12, height: 60, textAlignVertical: "center" },
  sessionsGrid: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  card: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surfaceSecondary, padding: spacing.md },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  cardTitle: { ...typography.h3, color: colors.onSurface, fontSize: 16 },
  addBtn: { width: 28, height: 28, borderRadius: radii.md, borderWidth: 1, borderColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  cardEmpty: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: spacing.xs },
  sessRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider },
  sessTitle: { color: colors.onSurface, fontSize: 14 },
  sessMeta: { color: colors.onSurfaceTertiary, fontSize: 11, marginTop: 2 },
  phRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 5 },
  phText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: spacing.xxxl, gap: spacing.sm },
  emptyTitle: { ...typography.h3, color: colors.onSurface },
  emptyHint: { color: colors.onSurfaceTertiary, fontSize: 13, textAlign: "center" },
  // modal
  mScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  mSheet: {
    backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.sm,
  },
  mHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.sm },
  mTitle: { ...typography.h3, color: colors.onSurface, marginBottom: spacing.sm },
  mLabel: { ...typography.overline, color: colors.onSurfaceTertiary, marginTop: spacing.sm },
  mInput: {
    color: colors.onSurface, fontSize: 15, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface,
  },
  mSave: {
    marginTop: spacing.lg, backgroundColor: colors.brandPrimary, borderRadius: radii.md,
    paddingVertical: spacing.lg, alignItems: "center", justifyContent: "center", minHeight: 48,
  },
  mSaveText: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 15 },
});
