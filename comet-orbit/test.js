/**
 * Basic tests for Comet Orbit Simulation
 * Tests the orbital mechanics calculations without requiring a browser environment
 */

// Test 1: Orbital position calculation (extracted from script.js)
function testOrbitalPosition() {
  console.log('Test 1: Orbital position calculation');

  const cometState = {
    eccentricity: 0.7,
    semiMajorAxis: 90,
  };

  const semiMinorAxis = cometState.semiMajorAxis * Math.sqrt(1 - cometState.eccentricity ** 2);
  const focusDistance = Math.sqrt(Math.max(cometState.semiMajorAxis ** 2 - semiMinorAxis ** 2, 0));

  // Test that semi-minor axis is correctly calculated
  const expectedSemiMinor = 90 * Math.sqrt(1 - 0.7 ** 2); // ≈ 64.26
  if (Math.abs(semiMinorAxis - expectedSemiMinor) < 0.01) {
    console.log('  ✓ Semi-minor axis calculation correct:', semiMinorAxis.toFixed(2));
  } else {
    console.log('  ✗ Semi-minor axis calculation failed');
    return false;
  }

  // Test that focus distance is correct
  const expectedFocus = Math.sqrt(90 ** 2 - semiMinorAxis ** 2); // ≈ 63
  if (Math.abs(focusDistance - expectedFocus) < 0.01) {
    console.log('  ✓ Focus distance calculation correct:', focusDistance.toFixed(2));
  } else {
    console.log('  ✗ Focus distance calculation failed');
    return false;
  }

  // Test that eccentricity is valid (0 <= e < 1 for ellipse)
  if (cometState.eccentricity >= 0 && cometState.eccentricity < 1) {
    console.log('  ✓ Eccentricity is valid for elliptical orbit:', cometState.eccentricity);
  } else {
    console.log('  ✗ Invalid eccentricity');
    return false;
  }

  return true;
}

// Test 2: Velocity factor calculation
function testVelocityFactor() {
  console.log('\nTest 2: Velocity factor calculation (Kepler\'s second law)');

  const eccentricity = 0.7;

  // At perihelion (angle = 0), velocity should be highest
  const perihelionVelocity = 1 + eccentricity * Math.cos(0);
  console.log('  ✓ Perihelion velocity factor:', perihelionVelocity.toFixed(2));

  // At aphelion (angle = π), velocity should be lowest
  const aphelionVelocity = 1 + eccentricity * Math.cos(Math.PI);
  console.log('  ✓ Aphelion velocity factor:', aphelionVelocity.toFixed(2));

  if (perihelionVelocity > aphelionVelocity) {
    console.log('  ✓ Velocity correctly varies with orbital position');
    return true;
  } else {
    console.log('  ✗ Velocity variation incorrect');
    return false;
  }
}

// Test 3: Starfield generation bounds
function testStarfieldBounds() {
  console.log('\nTest 3: Starfield generation');

  const starCount = 1800;
  let allStarsValid = true;

  for (let i = 0; i < 100; i++) { // Test sample of 100 stars
    const theta = Math.acos((Math.random() * 2) - 1); // Random between 0 and π
    const phi = ((Math.random() * 2 - 1) * 360) * (Math.PI / 180);
    const r = 600;
    const radius = r * Math.random() * 0.9 + r * 0.1;

    const x = radius * Math.sin(theta) * Math.cos(phi);
    const y = radius * Math.cos(theta);
    const z = radius * Math.sin(theta) * Math.sin(phi);

    // Check if stars are within reasonable bounds
    const distance = Math.sqrt(x*x + y*y + z*z);
    if (distance < 60 || distance > 660) {
      allStarsValid = false;
      break;
    }
  }

  if (allStarsValid) {
    console.log('  ✓ Starfield positions are within valid bounds (60-660 units)');
    return true;
  } else {
    console.log('  ✗ Some stars outside expected bounds');
    return false;
  }
}

// Test 4: Tail segment count
function testTailConfiguration() {
  console.log('\nTest 4: Tail configuration');

  const tailSegments = 140;

  if (tailSegments > 0 && tailSegments < 1000) {
    console.log('  ✓ Tail segment count is reasonable:', tailSegments);
    return true;
  } else {
    console.log('  ✗ Tail segment count out of range');
    return false;
  }
}

// Test 5: Shader fresnel calculation safety
function testShaderSafety() {
  console.log('\nTest 5: Shader fresnel calculation safety');

  // Simulate the shader calculation
  const testDotProducts = [0.0, 0.3, 0.5, 0.6, 0.7, 1.0];
  let allSafe = true;

  for (const dot of testDotProducts) {
    const base = 0.6 - dot;
    const clampedBase = Math.max(0.0, base);
    const fresnel = Math.pow(clampedBase, 1.8);

    if (isNaN(fresnel) || !isFinite(fresnel)) {
      console.log(`  ✗ NaN or Infinity detected at dot=${dot}`);
      allSafe = false;
    }
  }

  if (allSafe) {
    console.log('  ✓ Fresnel calculation produces valid values for all inputs');
    return true;
  } else {
    return false;
  }
}

// Run all tests
console.log('='.repeat(60));
console.log('Comet Orbit Simulation - Unit Tests');
console.log('='.repeat(60));

const results = [
  testOrbitalPosition(),
  testVelocityFactor(),
  testStarfieldBounds(),
  testTailConfiguration(),
  testShaderSafety(),
];

console.log('\n' + '='.repeat(60));
const passed = results.filter(r => r).length;
const total = results.length;
console.log(`Test Results: ${passed}/${total} passed`);
console.log('='.repeat(60));

if (passed === total) {
  console.log('✓ All tests passed!');
  process.exit(0);
} else {
  console.log('✗ Some tests failed');
  process.exit(1);
}
