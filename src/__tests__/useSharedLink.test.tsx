import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Linking } from "react-native";

import { useSharedLink } from "../useSharedLink";

jest.mock("react-native", () => ({
  Linking: { getInitialURL: jest.fn(), addEventListener: jest.fn() },
}));

const getInitialURL = Linking.getInitialURL as jest.MockedFunction<typeof Linking.getInitialURL>;
const addEventListener = Linking.addEventListener as jest.MockedFunction<
  typeof Linking.addEventListener
>;

const remove = jest.fn();
/** The `url` handler the hook registered, so a test can fire an event at it. */
let handler: (event: { url: string }) => void;

function Probe({ onShare }: { onShare: (text: string) => void }) {
  useSharedLink(onShare);
  return null;
}

async function render(onShare: (text: string) => void): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Probe onShare={onShare} />);
  });
  return tree;
}

beforeEach(() => {
  remove.mockClear();
  getInitialURL.mockReset().mockResolvedValue(null);
  addEventListener.mockReset().mockImplementation(((_event: string, listener: typeof handler) => {
    handler = listener;
    return { remove };
  }) as never);
});

describe("useSharedLink", () => {
  it("reports the payload of the link that opened the app", async () => {
    const onShare = jest.fn();
    getInitialURL.mockResolvedValue("mapsconverter://share?text=geo%3A40.4%2C-3.7");

    await render(onShare);

    expect(onShare).toHaveBeenCalledWith("geo:40.4,-3.7");
  });

  it("reports links that arrive while the app is already running", async () => {
    const onShare = jest.fn();
    await render(onShare);

    act(() => handler({ url: "mapsconverter://share?text=geo%3A40.4%2C-3.7" }));

    expect(onShare).toHaveBeenCalledWith("geo:40.4,-3.7");
  });

  it("ignores deep links that are not a share", async () => {
    const onShare = jest.fn();
    getInitialURL.mockResolvedValue("mapsconverter://settings");

    await render(onShare);
    act(() => handler({ url: "https://example.com/otra-cosa" }));

    expect(onShare).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", async () => {
    const tree = await render(jest.fn());

    act(() => tree.unmount());

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("drops an initial URL that arrives after unmount", async () => {
    const onShare = jest.fn();
    let resolveInitial: (url: string) => void = () => {};
    getInitialURL.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveInitial = resolve;
      }),
    );

    const tree = await render(onShare);
    act(() => tree.unmount());
    await act(async () => resolveInitial("mapsconverter://share?text=geo%3A40.4%2C-3.7"));

    expect(onShare).not.toHaveBeenCalled();
  });
});
