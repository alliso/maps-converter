import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ShareTargetScreen } from "./src/ui/ShareTargetScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <ShareTargetScreen />
    </SafeAreaProvider>
  );
}
