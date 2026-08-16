import { Link, router } from "expo-router";
import { useState } from "react";
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
import { useAuth } from "@/src/context/AuthContext";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export default function RegisterScreen() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (!email || !password) {
      setError("Email et mot de passe requis.");
      return;
    }
    if (password.length < 6) {
      setError("Mot de passe : 6 caractères minimum.");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, name.trim() || undefined);
      router.replace("/dashboard");
    } catch (e: any) {
      setError(e?.message || "Inscription impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.wordmark}>ARETÉ</Text>
            <Text style={styles.tagline}>Commencer.</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>NOM (optionnel)</Text>
            <TextInput
              testID="register-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Marc Aurèle"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: spacing.lg }]}>EMAIL</Text>
            <TextInput
              testID="register-email-input"
              value={email}
              onChangeText={setEmail}
              placeholder="vous@exemple.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              style={styles.input}
            />
            <Text style={[styles.label, { marginTop: spacing.lg }]}>MOT DE PASSE</Text>
            <TextInput
              testID="register-password-input"
              value={password}
              onChangeText={setPassword}
              placeholder="Au moins 6 caractères"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              style={styles.input}
            />

            {error ? (
              <Text style={styles.error} testID="register-error">
                {error}
              </Text>
            ) : null}

            <Pressable
              testID="register-submit-button"
              onPress={onSubmit}
              disabled={loading}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.85 },
                loading && { opacity: 0.6 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.onBrandPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Créer mon compte</Text>
              )}
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Déjà inscrit ?</Text>
              <Link href="/login" asChild>
                <Pressable testID="go-to-login">
                  <Text style={styles.footerLink}>Se connecter</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
  },
  header: { marginBottom: spacing.xxxl },
  wordmark: {
    ...typography.h1,
    fontSize: 44,
    color: colors.brandPrimary,
    letterSpacing: 6,
  },
  tagline: {
    ...typography.body,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.md,
  },
  form: { flex: 1 },
  label: { ...typography.overline, color: colors.onSurfaceTertiary },
  input: {
    marginTop: spacing.sm,
    color: colors.onSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  error: {
    marginTop: spacing.lg,
    color: colors.onError,
    backgroundColor: colors.error,
    padding: spacing.md,
    borderRadius: radii.md,
    fontSize: 13,
  },
  primaryBtn: {
    marginTop: spacing.xxl,
    backgroundColor: colors.brandPrimary,
    paddingVertical: spacing.lg,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryBtnText: {
    color: colors.onBrandPrimary,
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xxl,
    gap: spacing.sm,
  },
  footerText: { color: colors.onSurfaceTertiary, fontSize: 13 },
  footerLink: { color: colors.brandPrimary, fontSize: 13, fontWeight: "600" },
});
