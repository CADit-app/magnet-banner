import { defineParams } from '@cadit-app/script-params';
import { Manifold } from 'manifold-3d/manifoldCAD';
import { makeCrossSection } from '@cadit-app/image-extrude';

export default defineParams({
  params: {
    // ---------- Image ----------
    image: {
      type: 'image',
      default: null,
      label: 'Upload SVG / PNG / JPG',
    },
    mode: {
      type: 'choice',
      default: 'sample',
      options: [
        { value: 'sample', label: 'Sample (best for SVG)' },
        { value: 'trace', label: 'Trace (for PNG/JPG)' },
      ],
      label: 'Processing mode',
    },
    maxWidth: {
      type: 'slider',
      default: 60,
      min: 20,
      max: 150,
      step: 1,
      label: 'Max width (mm)',
    },

    // ---------- Overall part ----------
    thickness: {
      type: 'slider',
      default: 3.5,
      min: 2.5,
      max: 8,
      step: 0.1,
      label: 'Total thickness (mm)',
    },

    // ---------- Magnet settings ----------
    magnetCount: {
      type: 'choice',
      default: '1',
      options: [
        { value: '1', label: '1 magnet (center)' },
        { value: '2h', label: '2 magnets (horizontal)' },
        { value: '2v', label: '2 magnets (vertical)' },
        { value: '4', label: '4 magnets (corners)' },
      ],
      label: 'Number of magnets',
    },
    magnetDiameter: {
      type: 'slider',
      default: 10,
      min: 6,
      max: 15,
      step: 0.5,
      label: 'Magnet diameter (mm)',
    },
    magnetDepth: {
      type: 'slider',
      default: 2.2,
      min: 1.5,
      max: 4,
      step: 0.1,
      label: 'Magnet depth (mm)',
    },
    magnetClearance: {
      type: 'number',
      default: 0.25,
      min: 0.1,
      max: 0.5,
      step: 0.05,
      label: 'Clearance (mm)',
    },
    spacing: {
      type: 'slider',
      default: 25,
      min: 12,
      max: 60,
      step: 1,
      label: 'Spacing between magnets (mm)',
    },
    offsetX: {
      type: 'number',
      default: 0,
      min: -40,
      max: 40,
      step: 0.5,
      label: 'Overall X offset',
    },
    offsetY: {
      type: 'number',
      default: 0,
      min: -40,
      max: 40,
      step: 0.5,
      label: 'Overall Y offset',
    },
  },

  main: async (params) => {
    // Fallback shape if no image uploaded
    if (!params.image?.dataUrl) {
      return Manifold.cube([40, 30, params.thickness], true);
    }

    // 1. Create the main shape from the image
    const crossSection = await makeCrossSection({
      imageFile: {
        dataUrl: params.image.dataUrl,
        fileType: params.image.fileType,
        fileName: params.image.fileName || 'shape.svg',
      },
      mode: params.mode as 'sample' | 'trace',
      maxWidth: params.maxWidth,
    });

    let body = crossSection.extrude(params.thickness);

    // 2. Calculate magnet positions based on layout
    const positions: [number, number][] = [];
    const half = params.spacing / 2;

    switch (params.magnetCount) {
      case '1':
        positions.push([0, 0]);
        break;
      case '2h': // horizontal pair
        positions.push([-half, 0], [half, 0]);
        break;
      case '2v': // vertical pair
        positions.push([0, -half], [0, half]);
        break;
      case '4': // four corners
        positions.push(
          [-half, -half],
          [ half, -half],
          [-half,  half],
          [ half,  half]
        );
        break;
    }

    // 3. Create and cut each magnet pocket
    const radius = (params.magnetDiameter + params.magnetClearance * 2) / 2;
    const pocketHeight = params.magnetDepth + 0.4;

    for (const [x, y] of positions) {
      const pocket = Manifold.cylinder(pocketHeight, radius, radius, 64)
        .translate([
          x + params.offsetX,
          y + params.offsetY,
          -params.thickness / 2 + pocketHeight / 2 - 0.05,
        ]);

      body = body.subtract(pocket);
    }

    return body;
  },
});