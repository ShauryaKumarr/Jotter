// This file is for grid canvas for mobile platforms, right now it is not completely functional

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

function isLine(stroke) {
  // 1. Calculate straight-line distance from start to end
  const straightDistance = distance(stroke[0], stroke[stroke.length-1]);
  
  // 2. Calculate total distance traveled along the stroke
  const totalDistance = calculateTotalDistance(stroke);
  
  // 3. If the ratio is close to 1, it's a straight line
  const ratio = straightDistance / totalDistance;
  return ratio > 0.9; // 90% straight
}

function isRectangle(stroke) {
  // 1. Check if stroke starts and ends near the same point (closed shape)
  const isClosed = distance(stroke[0], stroke[stroke.length-1]) < threshold;
  
  // 2. Calculate aspect ratio of bounding box
  const bounds = getBoundingBox(stroke);
  const aspectRatio = bounds.width / bounds.height;
  
  // 3. Check if it has roughly 4 corners (using corner detection)
  const corners = findCorners(stroke);
  
  return isClosed && corners.length >= 4 && aspectRatio > 0.5 && aspectRatio < 2;
}

function isCircle(stroke) {
  // 1. Find the center (average of all points)
  const center = calculateCenter(stroke);
  
  // 2. Calculate distance from center to each point
  const distances = stroke.map(point => distance(center, point));
  
  // 3. Check if all distances are similar (low variance)
  const variance = calculateVariance(distances);
  const averageRadius = average(distances);
  
  // 4. If variance is low relative to radius, it's a circle
  return variance / averageRadius < 0.1; // 10% tolerance
}

function isArrow(stroke) {
  // 1. Split stroke into shaft and head
  const shaft = stroke.slice(0, stroke.length * 0.7); // first 70%
  const head = stroke.slice(stroke.length * 0.7);     // last 30%
  
  // 2. Check if shaft is straight
  const shaftIsLine = isLine(shaft);
  
  // 3. Check if head forms a triangle or V shape
  const headIsTriangle = isTriangle(head);
  
  return shaftIsLine && headIsTriangle;
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
