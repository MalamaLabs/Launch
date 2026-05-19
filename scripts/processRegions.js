const fs = require('fs');
const h3 = require('h3-js');
const path = require('path');
const genesisHexConfig = require('../apps/web/src/config/genesis-hex.json');

const GENESIS_H3_RESOLUTION = genesisHexConfig.h3Resolution;

const regions = [
  { name: 'idaho', file: 'idaho_raw.json' },
  { name: 'nyc', file: 'nyc_raw.json' },
  { name: 'london', file: 'london_raw.json' },
  { name: 'tokyo', file: 'tokyo_raw.json' }
];

const basePath = path.join(__dirname, '..', 'apps', 'web', 'src', 'data', 'regions');
const outputPath = path.join(__dirname, '..', 'apps', 'web', 'src', 'data', 'regions.json');

const existingData = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  : {};
const outputData = {};

let totalHexes = 0;

function assertUniformResolution(regionName, cells) {
  const mismatched = cells.filter((cell) => h3.getResolution(cell) !== GENESIS_H3_RESOLUTION);
  if (mismatched.length > 0) {
    throw new Error(
      `${regionName} contains ${mismatched.length} cells outside H3 resolution ${GENESIS_H3_RESOLUTION}: ${mismatched
        .slice(0, 5)
        .join(', ')}`
    );
  }
}

for (const region of regions) {
  const filePath = path.join(basePath, region.file);
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(rawData);
    
    if (!json || json.length === 0) {
      console.warn(`No data found for ${region.name}`);
      continue;
    }

    const feature = json[0];
    const geojson = feature.geojson;
    
    if (!geojson || !geojson.coordinates) {
      console.warn(`No GeoJSON found in ${region.file}`);
      continue;
    }

    console.log(`Processing ${region.name} (${geojson.type})...`);

    let allHexes = new Set();
    
    // h3.polygonToCells respects standard GeoJSON format [lng, lat] when isGeoJson flag is true.
    if (geojson.type === 'Polygon') {
        const hexes = h3.polygonToCells(geojson.coordinates, GENESIS_H3_RESOLUTION, true);
        hexes.forEach(h => allHexes.add(h));
    } else if (geojson.type === 'MultiPolygon') {
        for (const polygonCoords of geojson.coordinates) {
            const hexes = h3.polygonToCells(polygonCoords, GENESIS_H3_RESOLUTION, true);
            hexes.forEach(h => allHexes.add(h));
        }
    }
    
    const hexArray = Array.from(allHexes);
    assertUniformResolution(region.name, hexArray);
    outputData[region.name] = hexArray;
    console.log(` -> Generated ${hexArray.length} hexes for ${region.name} at Res ${GENESIS_H3_RESOLUTION}`);
    totalHexes += hexArray.length;

  } catch (err) {
    console.error(`Error processing ${region.name}:`, err.message);
  }
}

for (const [regionName, cells] of Object.entries(existingData)) {
  if (outputData[regionName] || !Array.isArray(cells)) continue;
  assertUniformResolution(regionName, cells);
  outputData[regionName] = cells;
  totalHexes += cells.length;
  console.log(` -> Preserved ${cells.length} existing hexes for ${regionName} at Res ${GENESIS_H3_RESOLUTION}`);
}

fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
console.log(`Successfully generated regions.json! Total hexes: ${totalHexes}`);
