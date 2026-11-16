import { defineParams } from '@cadit-app/script-params';
import { Manifold, CrossSection } from 'manifold-3d/manifoldCAD';
import { makeCrossSection } from '@cadit-app/image-extrude';

export default defineParams({
  params: {
    // ---------- Image ----------
    image: {
      type: 'image',
      default: null,
      label: 'Upload black & white sheet',
    },
    mode: {
      type: 'choice',
      default: 'trace',
      options: [
        { value: 'trace', label: 'Trace (best for screenshots)' },
        { value: 'sample', label: 'Sample (only for clean SVG)' },
      ],
      label: 'Processing mode',
    },
    targetWidth: {
      type: 'slider',
      default: 45,
      min: 20,
      max: 80,
      step: 1,
      label: 'Target width per character (mm)',
    },
    despeckle: {
      type: 'slider',
      default: 3,
      min: 1,
      max: 8,
      step: 1,
      label: 'Despeckle (higher = cleaner)',
    },

    // ---------- Part settings ----------
    thickness: {
      type: 'slider',
      default: 3.5,
      min: 2.5,
      max: 6,
      step: 0.1,
      label: 'Thickness (mm)',
    },

    // ---------- Magnets ----------
    magnetCount: {
      type: 'choice',
      default: '1',
      options: [
        { value: '1', label: '1 magnet (center)' },
        { value: '2h', label: '2 magnets (horizontal)' },
        { value: '2v', label: '2 magnets (vertical)' },
      ],
      label: 'Magnets per character',
    },
    magnetDiameter: {
      type: 'slider',
      default: 10,
      min: 6,
      max: 14,
      step: 0.5,
      label: 'Magnet diameter (mm)',
    },
    magnetScale: {
      type: 'slider',
      default: 1.3,
      min: 0.9,
      max: 2.0,
      step: 0.1,
      label: 'Magnet size multiplier',
    },
    magnetDepth: {
      type: 'slider',
      default: 2.2,
      min: 1.5,
      max: 3.5,
      step: 0.1,
      label: 'Magnet depth (mm)',
    },
    magnetClearance: {
      type: 'number',
      default: 0.25,
      min: 0.15,
      max: 0.4,
      step: 0.05,
      label: 'Clearance (mm)',
    },
    spacing: {
      type: 'slider',
      default: 18,
      min: 10,
      max: 35,
      step: 1,
      label: 'Magnet spacing (mm)',
    },
  },

  main: async (params) => {
    if (!params.image?.dataUrl) {
      return Manifold.cube([30, 20, params.thickness], true);
    }

    // 1. Trace / sample the whole sheet
    let full = await makeCrossSection({
      imageFile: {
        dataUrl: params.image.dataUrl,
        fileType: params.image.fileType,
        fileName: params.image.fileName || 'sheet.png',
      },
      mode: params.mode as 'sample' | 'trace',
      maxWidth: 200, // temporary large size
      // @ts-ignore - despeckle is supported in trace
      despeckleSize: params.despeckle,
    });

    // 2. Break the sheet into individual characters
    const pieces = full.decompose();   // returns array of CrossSections

    if (pieces.length === 0) {
      return Manifold.cube([20, 20, params.thickness], true);
    }

    // 3. Process each character
    const results: Manifold[] = [];

    for (const piece of pieces) {
      // Skip tiny noise pieces
      const b = piece.bounds();
      const w = b.max[0] - b.min[0];
      const h = b.max[1] - b.min[1];
      if (w < 3 || h < 3) continue;

      // Scale this character to target width
      const scale = params.targetWidth / w;
      let cs = piece.scale([scale, scale]);

      // Center it
      const nb = cs.bounds();
      const cx = (nb.min[0] + nb.max[0]) / 2;
      const cy = (nb.min[1] + nb.max[1]) / 2;
      cs = cs.translate([-cx, -cy]);

      // Extrude
      let body = cs.extrude(params.thickness);

      // Add magnets
      const positions: [number, number][] = [];
      const half = params.spacing / 2;

      switch (params.magnetCount) {
        case '1':
          positions.push([0, 0]);
          break;
        case '2h':
          positions.push([-half, 0], [half, 0]);
          break;
        case '2v':
          positions.push([0, -half], [0, half]);
          break;
      }

      const effectiveDia = params.magnetDiameter * params.magnetScale;
      const radius = (effectiveDia + params.magnetClearance * 2) / 2;
      const pocketH = params.magnetDepth + 0.4;

      for (const [x, y] of positions) {
        const pocket = Manifold.cylinder(pocketH, radius, radius, 48)
          .translate([
            x,
            y,
            -params.thickness / 2 + pocketH / 2 - 0.05,
          ]);
        body = body.subtract(pocket);
      }

      results.push(body);
    }

    // 4. Combine all characters into one model
    // (they will be stacked at the origin – you can separate them later in the slicer or move them)
    if (results.length === 0) {
      return Manifold.cube([20, 20, params.thickness], true);
    }

    let combined = results[0];
    for (let i = 1; i < results.length; i++) {
      combined = combined.add(results[i]);
    }

    return combined;
  },
});