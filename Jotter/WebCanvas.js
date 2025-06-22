// Current testing file for web canvas (meant for PC platforms)

import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
const GRID_SIZE = 40;
const THRESHOLD = 10; // pixels

// Helper to extract vertices from an OpenCV Mat
const getVertices = (approx) => {
  const vertices = [];
  for (let i = 0; i < approx.rows; ++i) {
    vertices.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
  }
  return vertices;
};

// OpenCV.js shape detection functions
const canvasToMat = (canvas) => {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Create OpenCV Mat from image data
  const mat = cv.matFromImageData(imageData);
  return mat;
};

const classifyShape = (contour) => {
  const perimeter = cv.arcLength(contour, true);
  const approx = new cv.Mat();
  cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

  const verticesCount = approx.rows;
  const area = cv.contourArea(contour);
  const boundingRect = cv.boundingRect(contour);

  let shape = { type: 'unknown' };

  if (verticesCount === 3) {
    shape.type = 'triangle';
    shape.vertices = getVertices(approx);
  } else if (verticesCount === 4) {
    shape.type = 'rectangle';
    shape.vertices = getVertices(approx);
    shape.boundingRect = boundingRect;
  } else {
    // Check for circle
    const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
    if (circularity > 0.85) { // Stricter circularity check
      shape.type = 'circle';
      const circle = cv.minEnclosingCircle(contour);
      shape.center = circle.center;
      shape.radius = circle.radius;
    }
  }

  approx.delete();
  return shape;
};

const detectShapes = (canvas) => {
  try {
    // 1. Convert canvas to OpenCV Mat
    const src = canvasToMat(canvas);
    
    // 2. Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // 3. Apply threshold to get binary image
    const binary = new cv.Mat();
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    
    // 4. Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    console.log('OpenCV contours found:', contours.size());
    // 5. Analyze each contour
    const shapes = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const shape = classifyShape(contour);
      if (shape.type !== 'unknown') {
        shapes.push(shape);
      }
      contour.delete(); // Clean up individual contours
    }
    
    // 6. Clean up memory
    src.delete();
    gray.delete();
    binary.delete();
    contours.delete();
    hierarchy.delete();
    
    return shapes;
  } catch (error) {
    console.error('OpenCV shape detection error:', error);
    return [];
  }
};

// Legacy helper functions (keeping for fallback)
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

const average = (values) => {
  return values.reduce((sum, val) => sum + val, 0) / values.length;
};

// Fallback heuristic detection (if OpenCV fails)
const isLine = (stroke) => {
  if (stroke.length < 2) return false;
  
  const straightDistance = distance(stroke[0], stroke[stroke.length-1]);
  const totalDistance = calculateTotalDistance(stroke);
  
  if (totalDistance === 0) return false;
  
  const ratio = straightDistance / totalDistance;
  return ratio > 0.9; // 90% straight
};

const isRectangle = (stroke) => {
  if (stroke.length < 4) return false;
  
  const startEndDistance = distance(stroke[0], stroke[stroke.length-1]);
  const isClosed = startEndDistance < THRESHOLD;
  
  if (!isClosed) return false;
  
  const bounds = getBoundingBox(stroke);
  const aspectRatio = bounds.width / bounds.height;
  
  return isClosed && aspectRatio > 0.2 && aspectRatio < 5.0;
};

const isCircle = (stroke) => {
  if (stroke.length < 6) return false;
  
  const startEndDistance = distance(stroke[0], stroke[stroke.length-1]);
  const isClosed = startEndDistance < THRESHOLD;
  
  if (!isClosed) return false;
  
  const center = calculateCenter(stroke);
  const distances = stroke.map(point => distance(center, point));
  const averageRadius = average(distances);
  
  if (averageRadius === 0) return false;
  
  const bounds = getBoundingBox(stroke);
  const aspectRatio = bounds.width / bounds.height;
  const isRoughlySquare = aspectRatio > 0.5 && aspectRatio < 2.0;
  
  return isClosed && isRoughlySquare;
};

export default function WebCanvas() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState(null);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [recognizedShapes, setRecognizedShapes] = useState([]);
  const [opencvLoaded, setOpencvLoaded] = useState(false);

  useEffect(() => {
    // Load OpenCV.js dynamically
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.async = true;
    script.onload = () => {
      console.log('OpenCV.js loaded successfully');
      setOpencvLoaded(true);
    };
    script.onerror = () => {
      console.error('Failed to load OpenCV.js');
    };
    document.head.appendChild(script);

    // Initialize canvas context
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
    console.log('=== Shape Detection Started ===');

    // First, check for a line using the reliable heuristic, as findContours works on closed shapes
    if (isLine(stroke)) {
      console.log('✅ Heuristic detected: LINE');
      return { type: 'line', stroke: stroke };
    }

    if (!opencvLoaded) {
      console.log('OpenCV not loaded, using fallback heuristics');
      return detectShapeFallback(stroke);
    }
    
    try {
      // Create temporary canvas for OpenCV analysis
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      
      // Fill background with white for clean analysis
      tempCtx.fillStyle = '#ffffff';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      // Draw the stroke on temp canvas
      tempCtx.strokeStyle = '#000000';
      tempCtx.lineWidth = 2;
      tempCtx.beginPath();
      tempCtx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        tempCtx.lineTo(stroke[i].x, stroke[i].y);
      }
      tempCtx.stroke();
      
      // Use OpenCV to detect shapes
      const shapes = detectShapes(tempCanvas);
      console.log('OpenCV detected shapes:', shapes);
      
      if (shapes.length > 0) {
        const detectedShape = shapes[0];
        console.log('✅ OpenCV detected:', detectedShape.type.toUpperCase(), detectedShape);
        return detectedShape;
      } else {
        console.log('❌ OpenCV detected: FREEHAND');
        return { type: 'freehand' };
      }
    } catch (error) {
      console.error('OpenCV detection failed, falling back to heuristics:', error);
      return detectShapeFallback(stroke);
    }
  };

  const detectShapeFallback = (stroke) => {
    // Fallback to original heuristic detection
    if (isRectangle(stroke)) {
      console.log('✅ Fallback detected: RECTANGLE');
      return { type: 'rectangle', boundingRect: getBoundingBox(stroke) };
    }
    if (isCircle(stroke)) {
      console.log('✅ Fallback detected: CIRCLE');
      const center = calculateCenter(stroke);
      const radius = average(stroke.map(point => distance(center, point)));
      return { type: 'circle', center, radius };
    }
    
    console.log('❌ Fallback detected: FREEHAND');
    return { type: 'freehand' };
  };

  const drawRecognizedShape = (newShape) => {
    const ctx = context;
    
    // Clear the rough drawing before drawing the clean shape
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx);

    // Redraw all previously recognized shapes
    recognizedShapes.forEach(s => {
      drawCleanShape(s);
    });

    // Draw the newly recognized shape
    drawCleanShape(newShape);
  };

  const drawCleanShape = (shape) => {
    const ctx = context;
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.beginPath();

    switch (shape.type) {
      case 'line':
        // Lines are detected by heuristics and use the raw stroke
        ctx.moveTo(shape.stroke[0].x, shape.stroke[0].y);
        ctx.lineTo(shape.stroke[shape.stroke.length - 1].x, shape.stroke[shape.stroke.length - 1].y);
        break;
      case 'rectangle':
      case 'square':
         // Use the precise vertices from OpenCV for perfect (even rotated) rectangles
        ctx.moveTo(shape.vertices[0].x, shape.vertices[0].y);
        for (let i = 1; i < shape.vertices.length; i++) {
          ctx.lineTo(shape.vertices[i].x, shape.vertices[i].y);
        }
        ctx.closePath();
        break;
      case 'circle':
        // Use the precise center and radius from OpenCV
        ctx.arc(shape.center.x, shape.center.y, shape.radius, 0, 2 * Math.PI);
        break;
      case 'triangle':
        // Use the precise vertices from OpenCV
        ctx.moveTo(shape.vertices[0].x, shape.vertices[0].y);
        for (let i = 1; i < shape.vertices.length; i++) {
          ctx.lineTo(shape.vertices[i].x, shape.vertices[i].y);
        }
        ctx.closePath();
        break;
    }
    
    ctx.stroke();

    // Reset stroke style for next drawing
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
  }

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
      console.log('Detected shape object:', detectedShape);
      
      if (detectedShape.type !== 'freehand') {
        // The drawRecognizedShape function will now handle clearing and redrawing
        drawRecognizedShape(detectedShape);
        setRecognizedShapes(prev => [...prev, detectedShape]);
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
      {!opencvLoaded && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: '#ffeb3b',
          padding: '5px 10px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          Loading OpenCV.js...
        </div>
      )}
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