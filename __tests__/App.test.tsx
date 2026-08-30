import { act, create } from "react-test-renderer";

import App from "../App";

// The real provider renders nothing until the native view reports its insets,
// which never happens off device.
jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => (
      <View testID="safe-area">{children}</View>
    ),
  };
});
jest.mock("../src/ui/ShareTargetScreen", () => {
  const { Text } = require("react-native");
  return { ShareTargetScreen: () => <Text>pantalla</Text> };
});

describe("App", () => {
  it("renders the share screen inside the safe area", async () => {
    let tree!: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<App />);
    });

    const root = tree.toJSON() as { props: { testID?: string } };
    expect(root.props.testID).toBe("safe-area");
    expect(JSON.stringify(root)).toContain("pantalla");

    act(() => tree.unmount());
  });
});
