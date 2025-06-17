import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Platform } from 'react-native';
import GridCanvas from './GridCanvas';
import WebCanvas from './WebCanvas';

export default function App() {
  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? <WebCanvas /> : <GridCanvas />}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
