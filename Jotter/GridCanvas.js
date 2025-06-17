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
        color="#f0f0f0"
        style="stroke"
        strokeWidth={0.5}
      />
    );
  }
  for (let y = 0; y < height; y += GRID_SIZE) {
    lines.push(
      <Path
        key={`h-${y}`}
        path={Skia.Path.Make().moveTo(0, y).lineTo(width, y)}
        color="#f0f0f0"
        style="stroke"
        strokeWidth={0.5}
      />
    );
  }
  return lines;
}

export default function GridCanvas() {
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        const { locationX, locationY } = evt.nativeEvent;
        const newPath = Skia.Path.Make();
        newPath.moveTo(locationX, locationY);
        setCurrentPath(newPath);
      },
      onPanResponderMove: (evt, gestureState) => {
        const { locationX, locationY } = evt.nativeEvent;
        if (currentPath) {
          const updatedPath = currentPath.copy();
          updatedPath.lineTo(locationX, locationY);
          setCurrentPath(updatedPath);
        }
      },
      onPanResponderRelease: () => {
        if (currentPath) {
          setPaths((prev) => [...prev, currentPath]);
          setCurrentPath(null);
        }
      },
    })
  ).current;

  return (
    <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
      <Canvas style={StyleSheet.absoluteFill}>
        {drawGridLines()}
        {paths.map((path, i) => (
          <Path key={i} path={path} color="#000000" style="stroke" strokeWidth={2} />
        ))}
        {currentPath && (
          <Path path={currentPath} color="#000000" style="stroke" strokeWidth={2} />
        )}
      </Canvas>
    </View>
  );
}
