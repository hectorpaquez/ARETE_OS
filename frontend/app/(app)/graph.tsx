import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Line, Text as SvgText } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/src/api/client";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

type Node = { id: string; label: string; status: string; x: number; y: number };
type Edge = { source: string; target: string; relation: string };

export default function GraphScreen() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Node | null>(null);
  const { width, height } = Dimensions.get("window");
  const canvasH = height - 260;

  const load = useCallback(async () => {
    try {
      const g = await api.graph();
      const cx = width / 2;
      const cy = canvasH / 2;
      const R = Math.min(width, canvasH) / 2 - 40;
      const positioned: Node[] = g.nodes.map((n, i) => {
        // Circular layout — deterministic
        const angle = (i / Math.max(1, g.nodes.length)) * Math.PI * 2;
        const radius = R * (0.55 + 0.35 * ((i * 37) % 100) / 100);
        return {
          ...n,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        };
      });
      setNodes(positioned);
      setEdges(g.edges);
    } catch {}
    setLoading(false);
  }, [width, canvasH]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const nodeMap = useMemo(() => {
    const m: Record<string, Node> = {};
    nodes.forEach((n) => (m[n.id] = n));
    return m;
  }, [nodes]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Graphe</Text>
        <Text style={styles.subtitle}>
          {nodes.length} nœud{nodes.length > 1 ? "s" : ""} · {edges.length} lien
          {edges.length > 1 ? "s" : ""}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : nodes.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="git-network-outline" size={40} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyText}>Créez des pages avec [[liens]] pour voir votre graphe.</Text>
        </View>
      ) : (
        <View style={{ width, height: canvasH }} testID="graph-canvas">
          <Svg width={width} height={canvasH}>
            {edges.map((e, i) => {
              const s = nodeMap[e.source];
              const t = nodeMap[e.target];
              if (!s || !t) return null;
              return (
                <Line
                  key={`e-${i}`}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              );
            })}
            {nodes.map((n) => {
              const isSel = selected?.id === n.id;
              const isStub = n.status === "stub";
              return (
                <React.Fragment key={n.id}>
                  <Circle
                    cx={n.x}
                    cy={n.y}
                    r={isSel ? 8 : 5}
                    fill={isStub ? colors.surfaceTertiary : colors.brandPrimary}
                    stroke={isSel ? colors.brandPrimary : colors.border}
                    strokeWidth={isSel ? 2 : 1}
                    onPress={() => setSelected(n)}
                  />
                  <SvgText
                    x={n.x + 10}
                    y={n.y + 4}
                    fill={isSel ? colors.brandPrimary : colors.onSurfaceSecondary}
                    fontSize={10}
                    onPress={() => setSelected(n)}
                  >
                    {n.label.length > 20 ? n.label.slice(0, 20) + "…" : n.label}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        </View>
      )}

      {selected && (
        <View style={styles.selectedBar} testID="graph-selected">
          <View style={{ flex: 1 }}>
            <Text style={styles.overline}>SÉLECTION</Text>
            <Text style={styles.selTitle} numberOfLines={1}>
              {selected.label}
            </Text>
          </View>
          <Pressable
            testID="graph-open-page"
            onPress={() =>
              router.push({ pathname: "/knowledge/[id]", params: { id: selected.id } })
            }
            style={styles.openBtn}
          >
            <Text style={styles.openBtnText}>Ouvrir</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
  title: { ...typography.h1, fontSize: 28, color: colors.onSurface },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 4 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  emptyText: { color: colors.onSurfaceTertiary, textAlign: "center", fontSize: 13 },
  selectedBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 100,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  overline: { ...typography.overline, color: colors.onSurfaceTertiary },
  selTitle: { color: colors.onSurface, fontSize: 15, marginTop: 2 },
  openBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  openBtnText: { color: colors.onBrandPrimary, fontWeight: "600", fontSize: 13 },
});
