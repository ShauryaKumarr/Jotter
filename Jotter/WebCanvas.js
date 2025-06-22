// Current testing file for web canvas (meant for PC platforms)

import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
const GRID_SIZE = 40;
const THRESHOLD = 10; // pixels

/**
 * Extracts vertex coordinates from an OpenCV Mat object.
 * This is a crucial helper to translate OpenCV's C++ data structure into a usable JS array.
 * @param {cv.Mat} approx - The OpenCV Mat object containing the approximated polygon vertices.
 * @returns {Array<Object>} An array of vertex objects, e.g., [{x: 10, y: 20}, ...].
 */
const getVertices = (approx) => {
  const vertices = [];
  for (let i = 0; i < approx.rows; ++i) {
    vertices.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
  }
  return vertices;
};

// --- OpenCV Shape Detection Pipeline ---

/**
 * Converts a standard HTML5 canvas element into an OpenCV Mat object.
 * This is the first step in the image processing pipeline, bridging the browser's canvas with OpenCV.
 * @param {HTMLCanvasElement} canvas - The canvas element to convert.
 * @returns {cv.Mat} The resulting OpenCV Mat object.
 */
const canvasToMat = (canvas) => {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // converts flat image data into OpenCV Mat (multi-dimensional array)
  const mat = cv.matFromImageData(imageData);
  return mat;
};

/**
 * Analyzes a single contour to determine its geometric shape.
 * It uses vertex count for polygons and circularity for circles.
 * @param {cv.Mat} contour - The contour to classify.
 * @returns {Object} A shape object containing its type and geometric data (e.g., vertices, center, radius).
 */
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
    // Check for circle by calculating its circularity
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

/**
 * The core OpenCV pipeline to detect all shapes in a canvas image.
 * The process is: Canvas -> Grayscale -> Binary Image -> Find Contours -> Classify Shapes.
 * @param {HTMLCanvasElement} canvas - The canvas containing the drawing to analyze.
 * @returns {Array<Object>} An array of detected shape objects.
 */
const detectShapes = (canvas) => {
  try {
    // 1. Convert canvas to OpenCV Mat
    const src = canvasToMat(canvas);
    
    // 2. Convert to grayscale to reduce complexity
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // 3. Apply a binary threshold to get a black and white image.
    // THRESH_OTSU automatically determines the optimal threshold value.
    const binary = new cv.Mat();
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
    
    // 4. Find all contours (outlines) of the shapes in the binary image.
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    console.log('OpenCV contours found:', contours.size());
    // 5. Analyze each contour to classify it as a shape
    const shapes = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const shape = classifyShape(contour);
      if (shape.type !== 'unknown') {
        shapes.push(shape);
      }
      contour.delete(); // Clean up individual contours to prevent memory leaks
    }
    
    // 6. Clean up all created Mat objects from memory
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

// --- Legacy & Fallback Helper Functions ---

/**
 * Calculates the Euclidean distance between two points.
 * @param {Object} point1 - The first point with x, y coordinates.
 * @param {Object} point2 - The second point with x, y coordinates.
 * @returns {number} The distance between the two points.
 */
const distance = (point1, point2) => {
  return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
};

/**
 * Calculates the total length of a stroke by summing the distances between its points.
 * @param {Array<Object>} stroke - An array of points representing the drawing stroke.
 * @returns {number} The total length of the stroke.
 */
const calculateTotalDistance = (stroke) => {
  let total = 0;
  for (let i = 1; i < stroke.length; i++) {
    total += distance(stroke[i-1], stroke[i]);
  }
  return total;
};

/**
 * Calculates the bounding box of a stroke.
 * @param {Array<Object>} stroke - An array of points.
 * @returns {Object} An object with minX, maxX, minY, maxY, width, and height.
 */
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

/**
 * Calculates the geometric center (centroid) of a stroke.
 * @param {Array<Object>} stroke - An array of points.
 * @returns {Object} The center point with x, y coordinates.
 */
const calculateCenter = (stroke) => {
  const sumX = stroke.reduce((sum, p) => sum + p.x, 0);
  const sumY = stroke.reduce((sum, p) => sum + p.y, 0);
  return { x: sumX / stroke.length, y: sumY / stroke.length };
};

/**
 * Calculates the average of an array of numbers.
 * @param {Array<number>} values - The array of numbers.
 * @returns {number} The average value.
 */
const average = (values) => {
  return values.reduce((sum, val) => sum + val, 0) / values.length;
};

// --- Heuristic-Based Shape Detection (Used for Lines & Fallback) ---

/**
 * Heuristically detects if a stroke is a straight line.
 * It compares the direct distance between the start and end points to the total path length.
 * @param {Array<Object>} stroke - The user's drawing stroke.
 * @returns {boolean} True if the stroke is likely a line.
 */
const isLine = (stroke) => {
  if (stroke.length < 2) return false;
  
  const straightDistance = distance(stroke[0], stroke[stroke.length-1]);
  const totalDistance = calculateTotalDistance(stroke);
  
  if (totalDistance === 0) return false;
  
  const ratio = straightDistance / totalDistance;
  return ratio > 0.9; // If path is >90% of the straight line distance, it's a line.
};

/**
 * Heuristically detects if a stroke is a rectangle (used as a fallback).
 * @param {Array<Object>} stroke - The user's drawing stroke.
 * @returns {boolean} True if the stroke is likely a rectangle.
 */
const isRectangle = (stroke) => {
  if (stroke.length < 4) return false;
  
  const startEndDistance = distance(stroke[0], stroke[stroke.length-1]);
  const isClosed = startEndDistance < THRESHOLD;
  
  if (!isClosed) return false;
  
  const bounds = getBoundingBox(stroke);
  const aspectRatio = bounds.width / bounds.height;
  
  return isClosed && aspectRatio > 0.2 && aspectRatio < 5.0;
};

/**
 * Heuristically detects if a stroke is a circle (used as a fallback).
 * @param {Array<Object>} stroke - The user's drawing stroke.
 * @returns {boolean} True if the stroke is likely a circle.
 */
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

/**
 * Main canvas component for drawing and shape recognition.
 * Manages canvas state, user input, and orchestrates the shape detection and redrawing process.
 */
export default function WebCanvas() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState(null);
  const [currentStroke, setCurrentStroke] = useState([]);
  const [recognizedShapes, setRecognizedShapes] = useState([]);
  const [opencvLoaded, setOpencvLoaded] = useState(false);

  // This effect runs once on component mount.
  useEffect(() => {
    // Load OpenCV.js dynamically from a CDN.
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

    // Initialize the canvas context for drawing.
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setContext(ctx);
      
      // Draw the background grid.
      drawGrid(ctx);
    }
  }, []);

  /**
   * Draws a light gray grid on the canvas as a background.
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
   */
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
    
    // Reset stroke style for user drawing.
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
  };

  /**
   * Gets the mouse position relative to the canvas element.
   * @param {MouseEvent} e - The mouse event.
   * @returns {Object} The position with x, y coordinates.
   */
  const getMousePos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  /**
   * Top-level shape detection function that routes between heuristic and OpenCV detection.
   * @param {Array<Object>} stroke - The user's drawing stroke.
   * @returns {Object} The detected shape object.
   */
  const detectShape = (stroke) => {
    console.log('=== Shape Detection Started ===');

    // First, check for a line using the reliable heuristic, as findContours works best on closed shapes.
    if (isLine(stroke)) {
      console.log('✅ Heuristic detected: LINE');
      return { type: 'line', stroke: stroke };
    }

    if (!opencvLoaded) {
      console.log('OpenCV not loaded, using fallback heuristics');
    }
    
    try {
      // Create a temporary, in-memory canvas to analyze the stroke.
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      
      // Fill background with white for clean analysis.
      tempCtx.fillStyle = '#ffffff';
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      
      // Draw just the completed stroke on the temporary canvas.
      tempCtx.strokeStyle = '#000000';
      tempCtx.lineWidth = 2;
      tempCtx.beginPath();
      tempCtx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        tempCtx.lineTo(stroke[i].x, stroke[i].y);
      }
      tempCtx.stroke();
      
      // Run the full OpenCV detection pipeline on the temporary canvas.
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
      return { type: 'freehand' };
    }
  };


  /**
   * Orchestrates the redrawing of the canvas after a shape has been recognized.
   * It clears the canvas, redraws the grid, redraws all previously recognized shapes,
   * and finally draws the new, clean shape.
   * @param {Object} newShape - The newly recognized shape object.
   */
  const drawRecognizedShape = (newShape) => {
    const ctx = context;
    
    // Clear the entire canvas.
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx);

    // Redraw all previously recognized shapes from the state array.
    recognizedShapes.forEach(s => {
      drawCleanShape(s);
    });

    // Draw the newly recognized shape.
    drawCleanShape(newShape);
  };

  /**
   * Draws a single, clean geometric shape onto the canvas using its precise geometric data.
   * @param {Object} shape - The shape object containing its type and geometric data.
   */
  const drawCleanShape = (shape) => {
    const ctx = context;
    ctx.strokeStyle = '#ff0000'; // Red color for recognized shapes.
    ctx.lineWidth = 3;
    ctx.beginPath();

    switch (shape.type) {
      case 'line':
        // Lines are detected by heuristics and use the raw stroke data.
        ctx.moveTo(shape.stroke[0].x, shape.stroke[0].y);
        ctx.lineTo(shape.stroke[shape.stroke.length - 1].x, shape.stroke[shape.stroke.length - 1].y);
        break;
      case 'rectangle':
      case 'square':
         // Use the precise vertices from OpenCV for perfect (even rotated) rectangles.
        ctx.moveTo(shape.vertices[0].x, shape.vertices[0].y);
        for (let i = 1; i < shape.vertices.length; i++) {
          ctx.lineTo(shape.vertices[i].x, shape.vertices[i].y);
        }
        ctx.closePath();
        break;
      case 'circle':
        // Use the precise center and radius from OpenCV for a perfect circle.
        ctx.arc(shape.center.x, shape.center.y, shape.radius, 0, 2 * Math.PI);
        break;
      case 'triangle':
        // Use the precise vertices from OpenCV for a perfect triangle.
        ctx.moveTo(shape.vertices[0].x, shape.vertices[0].y);
        for (let i = 1; i < shape.vertices.length; i++) {
          ctx.lineTo(shape.vertices[i].x, shape.vertices[i].y);
        }
        ctx.closePath();
        break;
    }
    
    ctx.stroke();

    // Reset stroke style for the next user drawing.
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
  }

  /**
   * Handles the mouse down event to begin a drawing stroke.
   * @param {MouseEvent} e - The mouse event.
   */
  const handleMouseDown = (e) => {
    setIsDrawing(true);
    const pos = getMousePos(e);
    setCurrentStroke([pos]); // Start a new stroke
    context.beginPath();
    context.moveTo(pos.x, pos.y);
  };

  /**
   * Handles the mouse move event to continue a drawing stroke.
   * @param {MouseEvent} e - The mouse event.
   */
  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);
    setCurrentStroke(prev => [...prev, pos]);
    context.lineTo(pos.x, pos.y);
    context.stroke();
  };

  /**
   * Handles the mouse up event to end a drawing stroke and trigger shape detection.
   */
  const handleMouseUp = () => {
    if (isDrawing && currentStroke.length > 1) {
      const detectedShape = detectShape(currentStroke);
      console.log('Detected shape object:', detectedShape);
      
      if (detectedShape.type !== 'freehand') {
        // A shape was recognized, so redraw the canvas with the clean version.
        drawRecognizedShape(detectedShape);
        setRecognizedShapes(prev => [...prev, detectedShape]);
      }
    }
    setIsDrawing(false);
    setCurrentStroke([]);
  };

  /**
   * Handles the mouse leave event to cancel a drawing stroke.
   */
  const handleMouseLeave = () => {
    // If the mouse leaves the canvas, cancel the current drawing.
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
      {/* Show a loading indicator until OpenCV is ready */}
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