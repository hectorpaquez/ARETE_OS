import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs, useSegments } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useAuth } from "@/src/context/AuthContext";
import CommandPalette from "@/src/components/CommandPalette";
import { colors, spacing } from "@/src/theme/tokens";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const segments = useSegments();
  // Hide the floating palette FAB on the Daimōn chat screen (conflicts with send button)
  const hideFab = ["daimon", "journal"].includes(segments[segments.length - 1] as string);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.surface },
          tabBarStyle: {
            backgroundColor: colors.surfaceSecondary,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 76,
            paddingTop: 8,
            paddingBottom: 20,
          },
          tabBarActiveTintColor: colors.brandPrimary,
          tabBarInactiveTintColor: colors.onSurfaceTertiary,
          tabBarLabelStyle: { fontSize: 11, letterSpacing: 0.5, marginTop: 2 },
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: "Accueil",
            tabBarIcon: ({ color, size }) => <Ionicons name="compass-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="knowledge/index"
          options={{
            title: "Connaissances",
            tabBarIcon: ({ color, size }) => <Ionicons name="library-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="organisation"
          options={{
            title: "Organisation",
            tabBarIcon: ({ color, size }) => <Ionicons name="git-merge-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="graph"
          options={{
            title: "Graphe",
            tabBarIcon: ({ color, size }) => <Ionicons name="git-network-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="daimon"
          options={{
            title: "Daimōn",
            tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="knowledge/[id]" options={{ href: null }} />
        <Tabs.Screen name="entity/[type]/[id]" options={{ href: null }} />
        <Tabs.Screen name="academies/index" options={{ href: null }} />
        <Tabs.Screen name="academies/[slug]" options={{ href: null }} />
        <Tabs.Screen name="journal" options={{ href: null }} />
      </Tabs>

      {/* Floating command palette FAB */}
      {!hideFab && (
        <Pressable
          testID="open-command-palette"
          onPress={() => setPaletteOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            pressed && { transform: [{ scale: 0.96 }] },
          ]}
        >
          <Ionicons name="flash-outline" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      )}

      <CommandPalette visible={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: 96,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
