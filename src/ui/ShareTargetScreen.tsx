import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MAP_APPS, type MapApp } from "../maps/apps";
import { formatCoordinates } from "../maps/coordinates";
import { resolveSharedContent } from "../maps/resolve";
import type { MapAppId, ParseResult, Place } from "../maps/types";
import { canOpen, openPlaceIn } from "../openInApp";
import { useSharedLink } from "../useSharedLink";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; place: Place }
  | { kind: "error"; result: Extract<ParseResult, { ok: false }> };

export function ShareTargetScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [navigate, setNavigate] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  // Kept verbatim so a failed parse still has something to hand back to the
  // user: we may not have found a URL in it, but they can paste it themselves.
  const [shared, setShared] = useState("");

  const analyse = useCallback(async (content: string | null | undefined) => {
    setStatus({ kind: "loading" });
    setShared(content?.trim() ?? "");
    const result = await resolveSharedContent(content);
    setStatus(result.ok ? { kind: "ready", place: result.place } : { kind: "error", result });
  }, []);

  // Arrives both on a cold start and while the app sits in the background.
  useSharedLink(analyse);

  // Apps that are not installed still work through their website, but saying so
  // up front beats a surprise browser tab.
  useEffect(() => {
    let cancelled = false;
    Promise.all(MAP_APPS.map((app) => canOpen(app.scheme))).then((results) => {
      if (cancelled) return;
      setInstalled(Object.fromEntries(MAP_APPS.map((app, i) => [app.id, results[i]])));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const place = status.kind === "ready" ? status.place : undefined;
  const targets = useMemo(
    () => MAP_APPS.filter((app) => app.id !== place?.source),
    [place?.source],
  );

  const open = (app: MapAppId) => {
    if (!place) return;
    openPlaceIn(app, place, { navigate });
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: theme.text }]}>Abrir en otra app</Text>

      {status.kind === "loading" ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={[styles.hint, { color: theme.muted }]}>Resolviendo el enlace…</Text>
        </View>
      ) : null}

      {place ? (
        <PlaceCard place={place} theme={theme} />
      ) : status.kind === "error" ? (
        <View style={styles.manual}>
          <Text style={[styles.hint, { color: theme.muted }]}>
            {status.result.reason === "empty"
              ? "No hemos recibido nada que abrir."
              : "No hemos reconocido ninguna ubicación en lo que has compartido."}
          </Text>
          {/* Seeing the offending link is the difference between "no funciona" y
              un informe de error accionable. */}
          {status.result.url ? (
            <Text
              selectable
              style={[styles.code, { color: theme.muted, borderColor: theme.border }]}
            >
              {status.result.url}
            </Text>
          ) : null}
          {/* The way out of a failure: copy it and paste it into the maps app by
              hand, rather than going back to the share sheet empty handed. */}
          <CopyButton value={status.result.url || shared} theme={theme} />
          <Pressable
            onPress={() => {
              setStatus({ kind: "idle" });
              setManualInput("");
            }}
          >
            <Text style={[styles.link, { color: theme.accent }]}>Probar otro enlace</Text>
          </Pressable>
        </View>
      ) : status.kind === "idle" ? (
        <ManualInput
          value={manualInput}
          onChange={setManualInput}
          onSubmit={() => analyse(manualInput)}
          theme={theme}
        />
      ) : null}

      {place ? (
        <>
          <View style={[styles.row, { borderColor: theme.border }]}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Iniciar navegación</Text>
            <Switch value={navigate} onValueChange={setNavigate} />
          </View>

          <View style={styles.apps}>
            {targets.map((app) => (
              <AppButton
                key={app.id}
                app={app}
                installed={installed[app.id] !== false}
                onPress={() => open(app.id)}
                theme={theme}
              />
            ))}
          </View>

          <Pressable
            onPress={() => {
              setStatus({ kind: "idle" });
              setManualInput("");
            }}
          >
            <Text style={[styles.link, { color: theme.accent }]}>Usar otro enlace</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

function PlaceCard({ place, theme }: { place: Place; theme: Theme }) {
  const coordinates = place.coordinates ? formatCoordinates(place.coordinates) : undefined;
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
        {place.label ?? place.query ?? coordinates}
      </Text>
      {/* The geocoded address is what makes a wrong match obvious: coordinates
          alone mean nothing to a reader. */}
      {place.address ? (
        <Text style={[styles.cardSubtitle, { color: theme.muted }]} numberOfLines={2}>
          {place.address}
        </Text>
      ) : null}
      {coordinates ? (
        <Text style={[styles.cardCoords, { color: theme.muted }]}>{coordinates}</Text>
      ) : (
        <Text style={[styles.cardSubtitle, { color: theme.muted }]}>
          Sin coordenadas: se abrirá como búsqueda
        </Text>
      )}
    </View>
  );
}

/**
 * Copying gives no visible feedback of its own, so the label doubles as the
 * confirmation and reverts on its own.
 */
function CopyButton({ value, theme }: { value: string; theme: Theme }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  if (!value) return null;

  return (
    <Pressable
      onPress={copy}
      style={({ pressed }) => [
        styles.secondaryButton,
        { borderColor: theme.border, backgroundColor: theme.card, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.secondaryButtonText, { color: theme.accent }]}>
        {copied ? "Copiado ✓" : "Copiar enlace"}
      </Text>
    </Pressable>
  );
}

function AppButton({
  app,
  installed,
  onPress,
  theme,
}: {
  app: MapApp;
  installed: boolean;
  onPress: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.appButton,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={styles.appSymbol}>{app.symbol}</Text>
      <View style={styles.appText}>
        <Text style={[styles.appName, { color: theme.text }]}>{app.name}</Text>
        {installed ? null : (
          <Text style={[styles.appHint, { color: theme.muted }]}>Se abrirá en el navegador</Text>
        )}
      </View>
    </Pressable>
  );
}

function ManualInput({
  value,
  onChange,
  onSubmit,
  theme,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  theme: Theme;
}) {
  return (
    <View style={styles.manual}>
      <Text style={[styles.hint, { color: theme.muted }]}>
        Comparte una ubicación desde tu app de mapas, o pega el enlace aquí.
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
        placeholder="https://maps.app.goo.gl/…"
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        style={[
          styles.input,
          { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
        ]}
      />
      <Pressable
        onPress={onSubmit}
        disabled={!value.trim()}
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: theme.accent, opacity: !value.trim() ? 0.4 : pressed ? 0.8 : 1 },
        ]}
      >
        <Text style={styles.primaryButtonText}>Analizar enlace</Text>
      </Pressable>
    </View>
  );
}

type Theme = ReturnType<typeof useTheme>;

function useTheme() {
  const dark = useColorScheme() === "dark";
  return {
    background: dark ? "#0b0d10" : "#f6f7f9",
    card: dark ? "#161a20" : "#ffffff",
    border: dark ? "#262c35" : "#e3e6ea",
    text: dark ? "#f2f4f7" : "#12151a",
    muted: dark ? "#8d97a5" : "#697384",
    accent: "#2f6fed",
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 20 },
  title: { fontSize: 30, fontWeight: "700" },
  centered: { alignItems: "center", gap: 12, paddingVertical: 24 },
  hint: { fontSize: 15, lineHeight: 21 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 4 },
  cardTitle: { fontSize: 18, fontWeight: "600" },
  cardSubtitle: { fontSize: 14, lineHeight: 19 },
  cardCoords: { fontSize: 13, fontFamily: "Menlo" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 16 },
  apps: { gap: 10 },
  appButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  appSymbol: { fontSize: 26 },
  appText: { flex: 1, gap: 2 },
  appName: { fontSize: 17, fontWeight: "600" },
  appHint: { fontSize: 13 },
  manual: { gap: 12 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  primaryButton: { borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: { fontSize: 16, fontWeight: "600" },
  link: { fontSize: 15, textAlign: "center" },
  code: {
    fontSize: 13,
    fontFamily: "Menlo",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
});
