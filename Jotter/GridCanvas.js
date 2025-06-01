import React, { useRef, useState } from 'react';
import { Dimensions, StyleSheet, View, PanResponder } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';

const { width, height } = Dimensions.get('window');
const GRID_SIZE = 40;

function drawGridLines() {
  const lines = [];
  for (let x = 0; x < width; x += GRID_SIZE) {
    lines.push(
      <Path
        key={`v-${x}`}
        path={Skia.Path.Make().moveTo(x, 0).lineTo(x, height)}
        color="#e0e0e0"
        style="stroke"
        strokeWidth={1}
      />
    );
  }
  for (let y = 0; y < height; y += GRID_SIZE) {
    lines.push(
      <Path
        key={`h-${y}`}
        path={Skia.Path.Make().moveTo(0, y).lineTo(width, y)}
        color="#e0e0e0"
        style="stroke"
        strokeWidth={1}
      />
    );
  }
  return lines;
}

export default function GridCanvas() {
  const [paths, setPaths] = useState([]);
  const currentPath = useRef(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPath.current = Skia.Path.Make();
        currentPath.current.moveTo(locationX, locationY);
      },
      onPanResponderMove: (evt, gestureState) => {
        const { locationX, locationY } = evt.nativeEvent;
        if (currentPath.current) {
          currentPath.current.lineTo(locationX, locationY);
          setPaths((prev) => [...prev.slice(0, -1), currentPath.current.copy()]);
        }
      },
      onPanResponderRelease: () => {
        if (currentPath.current) {
          setPaths((prev) => [...prev, currentPath.current.copy()]);
          currentPath.current = null;
        }
      },
    })
  ).current;

  return (
    <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
      <Canvas style={StyleSheet.absoluteFill}>
        {drawGridLines()}
        {paths.map((p, i) => (
          <Path key={i} path={p} color="#222" style="stroke" strokeWidth={3} />
        ))}
      </Canvas>
    </View>
  );
}
