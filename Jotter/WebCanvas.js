// Current testing file for web canvas (meant for PC platforms)

import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
const GRID_SIZE = 40;
const THRESHOLD = 10; // pixels

// Helper functions for shape detection
const distance = (point1, point2) => {
  return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
};

const calculateTotalDistance = (stroke) => {
  let total = 0;
  for (let i = 1; i < stroke.length; i++) {
    total += distance(stroke[i-1], stroke[i]);
  }
  return total;
};

const getBoundingBox = (stroke) => {
  const xs = stroke.map(p => p.x);
  const ys = stroke.map(p => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
};

const calculateCenter = (stroke) => {
  const sumX = stroke.reduce((sum, p) => sum + p.x, 0);
  const sumY = stroke.reduce((sum, p) => sum + p.y, 0);
  return { x: sumX / stroke.length, y: sumY / stroke.length };
};

const calculateVariance = (values) => {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
};

const average = (values) => {
  return values.reduce((sum, val) => sum + val, 0) / values.length;
};

const findCorners = (stroke) => {
  // Simple corner detection - find points with significant direction change
  const corners = [];
  console.log('🔍 Finding corners in stroke of length:', stroke.length);
  
  for (let i = 1; i < stroke.length - 1; i++) {
    const prev = stroke[i-1];
    const curr = stroke[i];
    const next = stroke[i+1];
    
    const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);
    const angleDiff = Math.abs(angle1 - angle2);
    
    // More lenient corner detection - 30 degrees instead of 45
    if (angleDiff > Math.PI / 6) { // 30 degrees
      corners.push(curr);
    }
  }
  
  console.log('🔲 Found corners:', corners.length);
  return corners;
};

const isTriangle = (stroke) => {
  const corners = findCorners(stroke);
  return corners.length >= 3;
};

// Shape detection functions
const isLine = (stroke) => {
  if (stroke.length < 2) return false;
  
  const straightDistance = distance(stroke[0], stroke[stroke.length-1]);
  const totalDistance = calculateTotalDistance(stroke);
  
  if (totalDistance === 0) return false;
  
  const ratio = straightDistance / totalDistance;
  return ratio > 0.9; // 90% straight
};

const isRectangle = (stroke) => {
  console.log('🔍 Rectangle detection starting...');
  
  if (stroke.length < 4) {
    console.log('❌ Too few points:', stroke.length);
    return false;
  }
  
  // Check if stroke is closed (starts and ends near each other)
  const startEndDistance = distance(stroke[0], stroke[stroke.length-1]);
  const isClosed = startEndDistance < THRESHOLD;
  console.log('📏 Start-end distance:', startEndDistance, 'Is closed:', isClosed);
  
  if (!isClosed) {
    console.log('❌ Shape is not closed');
    return false;
  }
  
  const bounds = getBoundingBox(stroke);
  const aspectRatio = bounds.width / bounds.height;
  console.log('📐 Bounds:', bounds, 'Aspect ratio:', aspectRatio);
  
  // Count significant corners (direction changes)
  const corners = findCorners(stroke);
  console.log('🔲 Corners found:', corners.length);
  
  // Very lenient rectangle detection
  const hasCorners = corners.length >= 2; // Just need some corners
  const reasonableAspectRatio = aspectRatio > 0.2 && aspectRatio < 5.0; // Very lenient
  
  console.log('✅ Rectangle checks:', { hasCorners, reasonableAspectRatio });
  
  const result = isClosed && hasCorners && reasonableAspectRatio;
  console.log('🎯 Rectangle result:', result);
  return result;
};

const isCircle = (stroke) => {
  console.log('🔍 Circle detection starting...');
  
  if (stroke.length < 6) {
    console.log('❌ Too few points:', stroke.length);
    return false;
  }
  
  // Check if stroke is closed
  const startEndDistance = distance(stroke[0], stroke[stroke.length-1]);
  const isClosed = startEndDistance < THRESHOLD;
  console.log('📏 Start-end distance:', startEndDistance, 'Is closed:', isClosed);
  
  if (!isClosed) {
    console.log('❌ Shape is not closed');
    return false;
  }
  
  const center = calculateCenter(stroke);
  const distances = stroke.map(point => distance(center, point));
  const averageRadius = average(distances);
  
  if (averageRadius === 0) {
    console.log('❌ Zero radius');
    return false;
  }
  
  // Calculate variance in radius
  const variance = calculateVariance(distances);
  const circularity = variance / averageRadius;
  
  // Check aspect ratio - circles should be roughly square in their bounding box
  const bounds = getBoundingBox(stroke);
  const aspectRatio = bounds.width / bounds.height;
  const isRoughlySquare = aspectRatio > 0.5 && aspectRatio < 2.0; // More lenient
  
  // Very lenient circularity check
  const isCircular = circularity < 0.5; // 50% tolerance - very lenient
  
  console.log('📊 Circle metrics:', { 
    circularity, 
    aspectRatio, 
    isCircular, 
    isRoughlySquare,
    averageRadius,
    variance
  });
  
  const result = isClosed && isCircular && isRoughlySquare;
  console.log('🎯 Circle result:', result);
  return result;
};

const isArrow = (stroke) => {
  if (stroke.length < 6) return false;
  
  const shaftEnd = Math.floor(stroke.length * 0.7);
  const shaft = stroke.slice(0, shaftEnd);
  const head = stroke.slice(shaftEnd);
  
  const shaftIsLine = isLine(shaft);
  const headIsTriangle = isTriangle(head);
  
  return shaftIsLine && headIsTriangle;
};

export default function WebCanvas() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState(null);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [recognizedShapes, setRecognizedShapes] = useState([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setContext(ctx);
      
      // Draw grid
      drawGrid(ctx);
    }
  }, []);

  const drawGrid = (ctx) => {
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 0.5;
    
    // Vertical lines
    for (let x = 0; x <= width; x += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = 0; y <= height; y += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Reset stroke style for drawing
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
  };

  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const detectShape = (stroke) => {
    console.log('=== Shape Detection Debug ===');
    console.log('Stroke length:', stroke.length);
    console.log('Stroke points:', stroke.slice(0, 3), '...', stroke.slice(-3));
    
    if (isLine(stroke)) {
      console.log('✅ Detected: LINE');
      return 'line';
    }
    if (isCircle(stroke)) {
      console.log('✅ Detected: CIRCLE');
      return 'circle';
    }
    if (isRectangle(stroke)) {
      console.log('✅ Detected: RECTANGLE');
      return 'rectangle';
    }
    if (isArrow(stroke)) {
      console.log('✅ Detected: ARROW');
      return 'arrow';
    }
    
    console.log('❌ Detected: FREEHAND');
    return 'freehand';
  };

  const drawRecognizedShape = (shape, stroke) => {
    const ctx = context;
    ctx.strokeStyle = '#ff0000'; // Red for recognized shapes
    ctx.lineWidth = 3;
    
    switch (shape) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        ctx.lineTo(stroke[stroke.length-1].x, stroke[stroke.length-1].y);
        ctx.stroke();
        break;
      case 'rectangle':
        const bounds = getBoundingBox(stroke);
        ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
        break;
      case 'circle':
        const center = calculateCenter(stroke);
        const radius = average(stroke.map(point => distance(center, point)));
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
        ctx.stroke();
        break;
      case 'arrow':
        // Draw the shaft
        const shaftEnd = Math.floor(stroke.length * 0.7);
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        ctx.lineTo(stroke[shaftEnd].x, stroke[shaftEnd].y);
        ctx.stroke();
        // Draw the head (simplified triangle)
        ctx.beginPath();
        ctx.moveTo(stroke[shaftEnd].x, stroke[shaftEnd].y);
        ctx.lineTo(stroke[stroke.length-1].x, stroke[stroke.length-1].y);
        ctx.lineTo(stroke[shaftEnd].x - 10, stroke[shaftEnd].y);
        ctx.closePath();
        ctx.stroke();
        break;
    }
    
    // Reset stroke style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
  };

  const handleMouseDown = (e) => {
    setIsDrawing(true);
    const pos = getMousePos(e);
    setCurrentStroke([pos]);
    context.beginPath();
    context.moveTo(pos.x, pos.y);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);
    setCurrentStroke(prev => [...prev, pos]);
    context.lineTo(pos.x, pos.y);
    context.stroke();
  };

  const handleMouseUp = () => {
    if (isDrawing && currentStroke.length > 1) {
      const detectedShape = detectShape(currentStroke);
      console.log('Detected shape:', detectedShape); // Debug log
      
      if (detectedShape !== 'freehand') {
        drawRecognizedShape(detectedShape, currentStroke);
        setRecognizedShapes(prev => [...prev, { type: detectedShape, stroke: currentStroke }]);
      }
    }
    setIsDrawing(false);
    setCurrentStroke([]);
  };

  const handleMouseLeave = () => {
    setIsDrawing(false);
    setCurrentStroke([]);
  };

  return (
    <View style={styles.container}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={styles.canvas}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  canvas: {
    display: 'block',
    cursor: 'crosshair',
  },
}); 