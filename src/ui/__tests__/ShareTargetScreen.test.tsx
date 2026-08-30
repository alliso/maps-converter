import * as Clipboard from "expo-clipboard";
import { Switch, Text, TextInput } from "react-native";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { resolveSharedContent } from "../../maps/resolve";
import type { ParseResult } from "../../maps/types";
import { canOpen, openPlaceIn } from "../../openInApp";
import { ShareTargetScreen } from "../ShareTargetScreen";

/** The callback the screen handed to `useSharedLink`, so a test can share into it. */
let mockShareHandler: (text: string) => void;

jest.mock("../../useSharedLink", () => ({
  useSharedLink: (onShare: (text: string) => void) => {
    mockShareHandler = onShare;
  },
}));
jest.mock("../../maps/resolve", () => ({ resolveSharedContent: jest.fn() }));
jest.mock("../../openInApp", () => ({ canOpen: jest.fn(), openPlaceIn: jest.fn() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
/** The screen only reads the system theme through this hook. */
const mockColorScheme = jest.fn<"light" | "dark", []>(() => "light");
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockColorScheme(),
}));

const resolveMock = resolveSharedContent as jest.MockedFunction<typeof resolveSharedContent>;
const canOpenMock = canOpen as jest.MockedFunction<typeof canOpen>;
const openPlaceInMock = openPlaceIn as jest.MockedFunction<typeof openPlaceIn>;
const setStringAsync = Clipboard.setStringAsync as jest.MockedFunction<
  typeof Clipboard.setStringAsync
>;

const SOL: ParseResult = {
  ok: true,
  place: {
    coordinates: { latitude: 40.416944, longitude: -3.703333 },
    label: "Puerta del Sol",
    address: "Plaza Puerta del Sol, Madrid",
    source: "google",
  },
};

/** Every string the screen is currently showing, flattened for easy matching. */
function texts(node: ReactTestInstance): string[] {
  return node
    .findAllByType(Text)
    .flatMap((text) => [text.props.children].flat())
    .filter((child): child is string => typeof child === "string");
}

/**
 * The button carrying `label`. Found by walking up from the label itself:
 * `Pressable` is a memo, so its exported identity is not the one in the tree.
 */
function button(node: ReactTestInstance, label: string): ReactTestInstance {
  const text = node
    .findAllByType(Text)
    .find((candidate) => texts(candidate).some((value) => value.includes(label)));
  if (!text) throw new Error(`no "${label}" in: ${texts(node).join(" | ")}`);

  let current: ReactTestInstance | null = text.parent;
  while (current && typeof current.props.onPress !== "function") current = current.parent;
  if (!current) throw new Error(`"${label}" is not inside anything pressable`);
  return current;
}

async function press(node: ReactTestInstance, label: string): Promise<void> {
  const target = button(node, label);
  await act(async () => target.props.onPress());
}

/** Kept so `afterEach` can unmount it: a live screen leaves timers running. */
let mounted: ReactTestRenderer | undefined;

async function render(): Promise<ReactTestRenderer> {
  await act(async () => {
    mounted = create(<ShareTargetScreen />);
  });
  return mounted!;
}

/** Renders, then feeds `content` in as if it had come from the share sheet. */
async function renderShared(content = "https://maps.app.goo.gl/abc123"): Promise<ReactTestRenderer> {
  const tree = await render();
  await act(async () => mockShareHandler(content));
  return tree;
}

beforeEach(() => {
  resolveMock.mockReset().mockResolvedValue(SOL);
  canOpenMock.mockReset().mockResolvedValue(true);
  openPlaceInMock.mockReset().mockResolvedValue("app");
  setStringAsync.mockClear();
  mockColorScheme.mockReturnValue("light");
});

afterEach(() => {
  if (mounted) act(() => mounted!.unmount());
  mounted = undefined;
});

describe("the idle state", () => {
  it("invites the user to paste a link", async () => {
    const tree = await render();

    expect(texts(tree.root).join(" ")).toContain("pega el enlace aquí");
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  });

  it("keeps the analyse button disabled until something is typed", async () => {
    const tree = await render();
    const analyse = button(tree.root, "Analizar enlace");

    expect(analyse.props.disabled).toBe(true);

    act(() => tree.root.findByType(TextInput).props.onChangeText("geo:40.4,-3.7"));
    expect(analyse.props.disabled).toBe(false);
  });

  it("analyses what was typed into the box", async () => {
    const tree = await render();

    act(() => tree.root.findByType(TextInput).props.onChangeText("geo:40.4,-3.7"));
    await press(tree.root, "Analizar enlace");

    expect(resolveMock).toHaveBeenCalledWith("geo:40.4,-3.7");
    expect(texts(tree.root)).toContain("Puerta del Sol");
  });

  it("shows a spinner while the link is being resolved", async () => {
    let finish: (result: ParseResult) => void = () => {};
    resolveMock.mockReturnValue(new Promise<ParseResult>((resolve) => (finish = resolve)));

    const tree = await render();
    await act(async () => {
      mockShareHandler("https://maps.app.goo.gl/abc123");
    });
    expect(texts(tree.root)).toContain("Resolviendo el enlace…");

    await act(async () => finish(SOL));
    expect(texts(tree.root)).not.toContain("Resolviendo el enlace…");
  });
});

describe("a resolved place", () => {
  it("shows the name, the geocoded address and the coordinates", async () => {
    const tree = await renderShared();

    expect(texts(tree.root)).toEqual(
      expect.arrayContaining([
        "Puerta del Sol",
        "Plaza Puerta del Sol, Madrid",
        "40.416944,-3.703333",
      ]),
    );
  });

  it("warns when there are no coordinates to open", async () => {
    resolveMock.mockResolvedValue({ ok: true, place: { query: "Calle Mayor 1", label: "Calle Mayor 1" } });

    const tree = await renderShared("Calle Mayor 1");

    expect(texts(tree.root)).toContain("Sin coordenadas: se abrirá como búsqueda");
  });

  it("leaves out the app the link came from", async () => {
    const tree = await renderShared();
    const shown = texts(tree.root);

    expect(shown).not.toContain("Google Maps");
    expect(shown).toEqual(expect.arrayContaining(["Apple Maps", "Waze"]));
  });

  it("opens the place in the app that was tapped", async () => {
    const tree = await renderShared();

    await press(tree.root, "Apple Maps");

    expect(openPlaceInMock).toHaveBeenCalledWith("apple", SOL.place, { navigate: false });
  });

  it("asks for turn-by-turn directions once the switch is on", async () => {
    const tree = await renderShared();

    act(() => tree.root.findByType(Switch).props.onValueChange(true));
    await press(tree.root, "Waze");

    expect(openPlaceInMock).toHaveBeenCalledWith("waze", SOL.place, { navigate: true });
  });

  it("says up front which apps will open in the browser", async () => {
    canOpenMock.mockImplementation(async (scheme: string) => scheme !== "waze://");

    const tree = await renderShared();

    expect(texts(button(tree.root, "Waze"))).toContain("Se abrirá en el navegador");
    expect(texts(button(tree.root, "Apple Maps"))).not.toContain("Se abrirá en el navegador");
  });

  it("goes back to the input when the user wants another link", async () => {
    const tree = await renderShared();

    await press(tree.root, "Usar otro enlace");

    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(texts(tree.root)).not.toContain("Puerta del Sol");
  });
});

describe("when nothing could be parsed", () => {
  const UNSUPPORTED: ParseResult = {
    ok: false,
    reason: "unsupported",
    url: "https://example.com/article",
  };

  it("shows the link it did not understand", async () => {
    resolveMock.mockResolvedValue(UNSUPPORTED);

    const tree = await renderShared("https://example.com/article");

    expect(texts(tree.root)).toEqual(
      expect.arrayContaining([
        "No hemos reconocido ninguna ubicación en lo que has compartido.",
        "https://example.com/article",
      ]),
    );
  });

  it("distinguishes an empty share from an unsupported one", async () => {
    resolveMock.mockResolvedValue({ ok: false, reason: "empty" });

    const tree = await renderShared("   ");

    expect(texts(tree.root)).toContain("No hemos recibido nada que abrir.");
  });

  it("copies the offending link so it can be pasted by hand", async () => {
    resolveMock.mockResolvedValue(UNSUPPORTED);
    const tree = await renderShared("https://example.com/article");

    await press(tree.root, "Copiar enlace");

    expect(setStringAsync).toHaveBeenCalledWith("https://example.com/article");
    expect(texts(tree.root)).toContain("Copiado ✓");
  });

  it("falls back to copying the raw shared text when there was no link in it", async () => {
    resolveMock.mockResolvedValue({ ok: false, reason: "unsupported" });
    const tree = await renderShared("  un texto sin enlace  ");

    await press(tree.root, "Copiar enlace");

    expect(setStringAsync).toHaveBeenCalledWith("un texto sin enlace");
  });

  it("offers a way back to the input", async () => {
    resolveMock.mockResolvedValue(UNSUPPORTED);
    const tree = await renderShared("https://example.com/article");

    await press(tree.root, "Probar otro enlace");

    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
  });
});

describe("presentation details", () => {
  it("falls back to the coordinates as the title when the place has no name", async () => {
    resolveMock.mockResolvedValue({
      ok: true,
      place: { coordinates: { latitude: 40.416944, longitude: -3.703333 } },
    });

    const tree = await renderShared("geo:40.416944,-3.703333");

    expect(texts(tree.root).filter((text) => text === "40.416944,-3.703333")).toHaveLength(2);
  });

  it("uses the search term as the title when that is all there is", async () => {
    resolveMock.mockResolvedValue({ ok: true, place: { query: "Calle Mayor 1" } });

    const tree = await renderShared("Calle Mayor 1");

    expect(texts(tree.root)).toContain("Calle Mayor 1");
  });

  it("dims a button while it is held down", async () => {
    const tree = await renderShared();
    const { style } = button(tree.root, "Apple Maps").props;

    expect(style({ pressed: true })).toContainEqual(expect.objectContaining({ opacity: 0.6 }));
    expect(style({ pressed: false })).toContainEqual(expect.objectContaining({ opacity: 1 }));
  });

  it("keeps the analyse button dimmed while the box is empty", async () => {
    const tree = await render();
    const { style } = button(tree.root, "Analizar enlace").props;

    expect(style({ pressed: false })).toContainEqual(expect.objectContaining({ opacity: 0.4 }));

    act(() => tree.root.findByType(TextInput).props.onChangeText("geo:40.4,-3.7"));
    const enabled = button(tree.root, "Analizar enlace").props.style;
    expect(enabled({ pressed: true })).toContainEqual(expect.objectContaining({ opacity: 0.8 }));
  });

  it("dims the copy button while it is held down", async () => {
    resolveMock.mockResolvedValue({ ok: false, reason: "unsupported", url: "https://example.com/x" });
    const tree = await renderShared("https://example.com/x");
    const { style } = button(tree.root, "Copiar enlace").props;

    expect(style({ pressed: true })).toContainEqual(expect.objectContaining({ opacity: 0.6 }));
  });

  it("paints itself dark when the system is dark", async () => {
    mockColorScheme.mockReturnValue("dark");

    const tree = await render();
    const title = tree.root.findAllByType(Text)[0];

    expect(title.props.style).toContainEqual({ color: "#f2f4f7" });
  });
});

describe("odd conditions", () => {
  it("copes with a share that carries nothing at all", async () => {
    resolveMock.mockResolvedValue({ ok: false, reason: "empty" });
    const tree = await render();

    await act(async () => mockShareHandler(null as unknown as string));

    expect(resolveMock).toHaveBeenCalledWith(null);
    expect(texts(tree.root)).toContain("No hemos recibido nada que abrir.");
    // Nothing to copy, so the button stays away.
    expect(texts(tree.root)).not.toContain("Copiar enlace");
  });

  it("does not touch state when the install check lands after unmount", async () => {
    let finishCheck: (installed: boolean) => void = () => {};
    canOpenMock.mockReturnValue(new Promise<boolean>((resolve) => (finishCheck = resolve)));

    const tree = await render();
    await act(async () => tree.unmount());
    mounted = undefined;

    // A setState here would make React warn; the effect has to have bailed out.
    await act(async () => finishCheck(true));
  });
});
