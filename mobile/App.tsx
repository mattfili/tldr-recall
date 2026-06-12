// Recall mobile — native entry. One screen: the DOM-component shell hosting the
// existing responsive web app. Article taps open the NATIVE in-app browser
// (SFSafariViewController / Custom Tabs) — parity with the desktop differentiator.

import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView, StyleSheet } from "react-native";
import RecallApp from "./src/RecallApp";

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="auto" />
      <RecallApp
        openExternal={async (url: string) => {
          await WebBrowser.openBrowserAsync(url);
        }}
        dom={{ style: styles.web }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fbfaf7" }, // recall.css --paper (light)
  web: { flex: 1 },
});
