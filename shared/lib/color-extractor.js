/**
 * Color Extractor - Extract dominant colors from album art
 * Uses canvas and color quantization for vibrant color extraction
 */

/**
 * Extract dominant colors from an image URL
 * @param {string} imageUrl - URL of the image to analyze
 * @param {number} colorCount - Number of colors to extract (default: 5)
 * @returns {Promise<Object>} Dominant color and palette
 */
export async function extractColors(imageUrl, colorCount = 5) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Resize image for faster processing
        const maxSize = 150;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // Collect vibrant pixels (skip very dark/light)
        const colors = [];

        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];

          // Skip transparent pixels
          if (a < 128) continue;

          // Calculate brightness
          const brightness = (r + g + b) / 3;

          // Calculate saturation
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max === 0 ? 0 : (max - min) / max;

          // Only include vibrant colors (not too dark, not too light, decent saturation)
          if (brightness > 30 && brightness < 225 && saturation > 0.2) {
            colors.push({ r, g, b });
          }
        }

        if (colors.length === 0) {
          // Fallback to default purple
          resolve({
            dominant: { r: 139, g: 92, b: 246 },
            palette: [
              { r: 139, g: 92, b: 246 },
              { r: 236, g: 72, b: 153 },
              { r: 6, g: 182, b: 212 },
            ],
          });
          return;
        }

        // Simple k-means clustering to find dominant colors
        const palette = kMeansClustering(colors, Math.min(colorCount, colors.length));

        // Sort by vibrancy (saturation * brightness)
        palette.sort((a, b) => {
          const vibrancyA = calculateVibrancy(a);
          const vibrancyB = calculateVibrancy(b);
          return vibrancyB - vibrancyA;
        });

        resolve({
          dominant: palette[0],
          palette: palette,
        });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      // Fallback to default purple
      resolve({
        dominant: { r: 139, g: 92, b: 246 },
        palette: [
          { r: 139, g: 92, b: 246 },
          { r: 236, g: 72, b: 153 },
          { r: 6, g: 182, b: 212 },
        ],
      });
    };

    img.src = imageUrl;
  });
}

/**
 * Simple k-means clustering for color quantization
 */
function kMeansClustering(colors, k, maxIterations = 10) {
  if (colors.length <= k) {
    return colors;
  }

  // Initialize centroids randomly
  let centroids = [];
  const step = Math.floor(colors.length / k);
  for (let i = 0; i < k; i++) {
    centroids.push({ ...colors[i * step] });
  }

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Assign colors to nearest centroid
    const clusters = Array.from({ length: k }, () => []);

    colors.forEach(color => {
      let minDist = Infinity;
      let closestCentroid = 0;

      centroids.forEach((centroid, index) => {
        const dist = colorDistance(color, centroid);
        if (dist < minDist) {
          minDist = dist;
          closestCentroid = index;
        }
      });

      clusters[closestCentroid].push(color);
    });

    // Update centroids
    const newCentroids = clusters.map(cluster => {
      if (cluster.length === 0) {
        return centroids[0]; // Fallback
      }

      const r = Math.round(cluster.reduce((sum, c) => sum + c.r, 0) / cluster.length);
      const g = Math.round(cluster.reduce((sum, c) => sum + c.g, 0) / cluster.length);
      const b = Math.round(cluster.reduce((sum, c) => sum + c.b, 0) / cluster.length);

      return { r, g, b };
    });

    // Check for convergence
    const converged = newCentroids.every((centroid, i) =>
      colorDistance(centroid, centroids[i]) < 5
    );

    centroids = newCentroids;

    if (converged) break;
  }

  return centroids;
}

/**
 * Calculate Euclidean distance between two colors
 */
function colorDistance(c1, c2) {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Calculate color vibrancy (saturation * brightness)
 */
function calculateVibrancy(color) {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const brightness = (color.r + color.g + color.b) / (3 * 255);

  return saturation * brightness;
}

/**
 * Convert RGB object to CSS rgb() string
 */
export function rgbToString(color) {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Get complementary color (opposite hue)
 */
export function getComplementary(color) {
  const hsl = rgbToHsl(color.r, color.g, color.b);
  hsl.h = (hsl.h + 180) % 360;

  // Convert back to RGB
  return hslToRgb(hsl.h, hsl.s, hsl.l);
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export default { extractColors, rgbToString, rgbToHsl, getComplementary };
