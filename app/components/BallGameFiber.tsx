"use client";

import { Physics, useBox } from "@react-three/cannon";
import { Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import { easing } from "maath";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { Model as AzeronLogo } from "./AzeronLogo";

// Extend window type for platform meshes
declare global {
  interface Window {
    platformMeshes?: Map<string, any>;
    collectibleMeshes?: Map<string, any>;
    getPlatformData?: (segmentIndex: number) => any[];
  }
}

// Game constants
const TUNNEL_RADIUS = 4;
const SIDES = 8;
const SEGMENT_LENGTH = 3;
const GAP_LENGTH = 6;
const SEGMENTS_AHEAD = 10;
const SEGMENTS_BEHIND = 3;
const BALL_RADIUS = 0.5;

// Physics constants
const GRAVITY = -0.006;
const BOUNCE_SPEED = 0.24;
const BALL_SPEED = 0.1125;

// Game state enum
enum GameState {
  MENU,
  PLAYING,
  LOST,
  RESTARTING,
}

// Type definitions
interface GameStateInterface {
  state: GameState;
  ballPosition: number;
  tunnelRotation: number;
  targetRotation: number;
  message: string;
  score: number;
  jumps: number; // Track number of jumps for speed progression
}

// Score feedback interface
interface ScoreFeedback {
  id: string;
  position: [number, number, number];
  score: number;
  type: "bounce" | "collectible"; // Add type to distinguish between different score types
  timestamp: number;
}

// Particle system for ball trail - now with ray streaks
const BallTrail = ({
  ballPosition,
  ballY,
  velocity,
}: {
  ballPosition: number;
  ballY: number;
  velocity: number;
}) => {
  const trailRef = useRef<THREE.Points | null>(null);
  const trailPositions = useRef<Float32Array>(new Float32Array(600)); // 200 particles * 3 coordinates for longer rays
  const trailOpacities = useRef<Float32Array>(new Float32Array(200));
  const trailIndex = useRef(0);
  const lastBallPos = useRef({ x: 0, y: ballY, z: ballPosition });

  const trailMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: "#ff6b35",
        size: 0.3,
        transparent: true,
        blending: THREE.AdditiveBlending,
        vertexColors: false,
        sizeAttenuation: false, // Keep consistent size for ray effect
      }),
    []
  );

  const trailGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(trailPositions.current, 3)
    );
    geometry.setAttribute(
      "opacity",
      new THREE.BufferAttribute(trailOpacities.current, 1)
    );
    return geometry;
  }, []);

  useFrame(() => {
    if (trailRef.current) {
      const currentPos = { x: 0, y: ballY, z: ballPosition };
      const speed =
        Math.abs(velocity) + Math.abs(ballPosition - lastBallPos.current.z);

      // Create ray-like streaks behind the ball
      if (speed > 0.01) {
        const index = trailIndex.current % 200;
        const offset = index * 3;

        // Create rays that stretch behind the ball's movement
        const rayLength = Math.min(speed * 50, 8); // Longer rays for faster movement
        const direction = ballPosition - lastBallPos.current.z;

        trailPositions.current[offset] =
          currentPos.x + (Math.random() - 0.5) * 1.5;
        trailPositions.current[offset + 1] =
          currentPos.y + (Math.random() - 0.5) * 1.5;
        trailPositions.current[offset + 2] =
          currentPos.z - rayLength * (Math.random() * 0.5 + 0.5);
        trailOpacities.current[index] = Math.min(speed * 30, 1.0);

        trailIndex.current++;
      }

      // Fade out existing particles faster for more dynamic rays
      for (let i = 0; i < 200; i++) {
        trailOpacities.current[i] *= 0.92;
      }

      // Update material opacity
      const maxOpacity = Math.max(...trailOpacities.current);
      trailMaterial.opacity = maxOpacity * 0.9;

      trailGeometry.attributes.position.needsUpdate = true;
      trailGeometry.attributes.opacity.needsUpdate = true;

      lastBallPos.current = currentPos;
    }
  });

  return (
    <points ref={trailRef}>
      <primitive object={trailGeometry} />
      <primitive object={trailMaterial} />
    </points>
  );
};

// Impact particles - now ray bursts
const ImpactParticles = () => {
  const particlesRef = useRef<THREE.Points | null>(null);
  const particles = useRef({
    positions: new Float32Array(450), // 150 particles * 3 for more rays
    velocities: new Float32Array(450),
    lifetimes: new Float32Array(150),
    active: false,
    center: new THREE.Vector3(0, 0, 0),
  });

  const impactMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: "#00ffff",
        size: 0.4,
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.9,
        sizeAttenuation: false,
      }),
    []
  );

  const impactGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particles.current.positions, 3)
    );
    return geometry;
  }, []);

  useFrame((state, delta) => {
    if (particles.current.active && particlesRef.current) {
      const positions = particles.current.positions;
      const velocities = particles.current.velocities;
      const lifetimes = particles.current.lifetimes;

      let anyAlive = false;

      for (let i = 0; i < 150; i++) {
        if (lifetimes[i] > 0) {
          anyAlive = true;
          const i3 = i * 3;

          // Update positions to create ray streaks
          positions[i3] += velocities[i3] * delta * 80; // Faster for ray effect
          positions[i3 + 1] += velocities[i3 + 1] * delta * 80;
          positions[i3 + 2] += velocities[i3 + 2] * delta * 80;

          // Less gravity for more dramatic ray effect
          velocities[i3 + 1] -= 0.1 * delta * 60;

          // Reduce lifetime
          lifetimes[i] -= delta;
        }
      }

      if (!anyAlive) {
        particles.current.active = false;
        impactMaterial.opacity = 0;
      } else {
        impactMaterial.opacity = 0.9;
      }

      impactGeometry.attributes.position.needsUpdate = true;
    }
  });

  useEffect(() => {
    const handleBounce = (event: CustomEvent) => {
      const { x, y, z } = event.detail.position || {
        x: 0,
        y: -3,
        z: particles.current.center.z,
      };

      // Initialize impact ray particles
      for (let i = 0; i < 150; i++) {
        const i3 = i * 3;
        const angle = (i / 150) * Math.PI * 2;
        const elevation = (Math.random() - 0.5) * Math.PI * 0.5;
        const speed = 3 + Math.random() * 6; // Faster rays

        particles.current.positions[i3] = x;
        particles.current.positions[i3 + 1] = y;
        particles.current.positions[i3 + 2] = z;

        // Create 3D ray burst
        particles.current.velocities[i3] =
          Math.cos(angle) * Math.cos(elevation) * speed;
        particles.current.velocities[i3 + 1] = Math.sin(elevation) * speed;
        particles.current.velocities[i3 + 2] =
          Math.sin(angle) * Math.cos(elevation) * speed;

        particles.current.lifetimes[i] = 0.8 + Math.random() * 0.4; // Longer lasting rays
      }

      particles.current.active = true;
    };

    window.addEventListener("ballBounce", handleBounce as EventListener);
    return () =>
      window.removeEventListener("ballBounce", handleBounce as EventListener);
  }, []);

  return (
    <points ref={particlesRef}>
      <primitive object={impactGeometry} />
      <primitive object={impactMaterial} />
    </points>
  );
};

// Optimized Star Wars Hyperspace Effect - High performance with instanced rendering
const TunnelParticles = ({
  ballPosition,
  gameState,
}: {
  ballPosition: number;
  gameState: GameStateInterface;
}) => {
  const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const rayCount = 150; // Reduced from 400 for better performance
  const rayDataRef = useRef<
    Array<{
      speed: number;
      distanceFromCenter: number;
      angle: number;
      length: number;
      z: number;
    }>
  >([]);
  const [initialized, setInitialized] = useState(false);

  // Temporary objects for matrix calculations
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);

  // Initialize ray data once
  useEffect(() => {
    rayDataRef.current = [];

    for (let i = 0; i < rayCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distanceFromCenter =
        TUNNEL_RADIUS * 1.5 + Math.random() * TUNNEL_RADIUS * 2;
      const speed =
        0.8 +
        (3 - distanceFromCenter / TUNNEL_RADIUS) * 0.3 +
        Math.random() * 0.4;
      const length = 2 + Math.random() * 4; // Shorter rays for better performance

      rayDataRef.current.push({
        speed,
        distanceFromCenter,
        angle,
        length,
        z: ballPosition + (Math.random() - 0.5) * 120,
      });
    }
    setInitialized(true);
  }, [ballPosition, rayCount]);

  useFrame((state) => {
    if (
      !instancedMeshRef.current ||
      !initialized ||
      rayDataRef.current.length !== rayCount
    )
      return;

    const time = state.clock.elapsedTime;

    // Calculate game speed multiplier based on jumps (same as ball physics)
    const speedMultiplier = 1 + Math.floor(gameState.jumps / 10) * 0.15; // 15% faster every 10 jumps
    const gameSpeed = 1 + speedMultiplier * 0.3; // Apply to hyperspace effect

    // Update all instances in a single pass
    for (let i = 0; i < rayCount; i++) {
      const ray = rayDataRef.current[i];

      // Safety check to prevent undefined errors
      if (!ray) {
        console.warn(`Ray ${i} is undefined, skipping`);
        continue;
      }

      // Move ray forward
      const hyperSpeed = ray.speed * gameSpeed;
      ray.z += hyperSpeed;

      // Reset if too far behind
      if (ray.z < ballPosition - 60) {
        ray.z = ballPosition + 60 + Math.random() * 20;
        ray.angle += (Math.random() - 0.5) * 0.1; // Slight variation
      }

      // Calculate position
      const x = Math.cos(ray.angle) * ray.distanceFromCenter;
      const y = Math.sin(ray.angle) * ray.distanceFromCenter;

      // Distance-based effects
      const distanceFromBall = Math.abs(ray.z - ballPosition);
      let opacity = 1;
      if (distanceFromBall > 25) {
        opacity = Math.max(0, 1 - (distanceFromBall - 25) / 35);
      } else if (distanceFromBall < 3) {
        opacity = Math.max(0.1, distanceFromBall / 3);
      }

      // Ray stretching based on speed - more dramatic at higher speeds
      const stretchFactor = 1 + hyperSpeed * 0.5 + (speedMultiplier - 1) * 0.3;
      const finalLength = ray.length * stretchFactor;

      // Set position, rotation, and scale
      tempPosition.set(x, y, ray.z);
      tempQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      tempScale.set(1, 1, finalLength);

      // Apply subtle drift toward center (stronger at higher speeds)
      const driftAmount = 0.001 * gameSpeed;
      tempPosition.x *= 1 - driftAmount;
      tempPosition.y *= 1 - driftAmount;

      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      instancedMeshRef.current.setMatrixAt(i, tempMatrix);

      // Set per-instance color with increased intensity at higher speeds
      const hue = 0.55 + (distanceFromBall / 80) * 0.1;
      const saturation = 0.8 + (speedMultiplier - 1) * 0.1; // More saturated at high speed
      const lightness =
        0.7 +
        Math.min(0.3, 3 - distanceFromBall / 8) * 0.3 +
        (speedMultiplier - 1) * 0.1;
      const color = new THREE.Color().setHSL(
        hue,
        Math.min(1, saturation),
        Math.min(1, lightness)
      );

      instancedMeshRef.current.setColorAt(i, color);
    }

    instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    if (instancedMeshRef.current.instanceColor) {
      instancedMeshRef.current.instanceColor.needsUpdate = true;
    }
  });

  // Simple geometry for better performance
  const rayGeometry = useMemo(() => {
    return new THREE.CylinderGeometry(0.004, 0.002, 1, 4, 1); // Very simple cylinder
  }, []);

  const rayMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  return (
    <group>
      {/* Instanced mesh for all rays */}
      <instancedMesh
        ref={instancedMeshRef}
        args={[rayGeometry, rayMaterial, rayCount]}
        frustumCulled={false}
      />

      {/* Simplified background effects - intensity increases with speed */}
      <mesh position={[0, 0, ballPosition + 15]}>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.05 + (gameState.jumps / 100) * 0.03}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh position={[0, 0, ballPosition + 20]}>
        <torusGeometry args={[TUNNEL_RADIUS * 1.8, 0.3, 6, 16]} />
        <meshBasicMaterial
          color="#004080"
          transparent
          opacity={0.03 + (gameState.jumps / 100) * 0.02}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
};

// Materials - Created once and reused
const neonPlatformMaterial = new THREE.MeshStandardMaterial({
  color: "#00ffff",
  emissive: "#00ffff",
  emissiveIntensity: 0.8,
  metalness: 0.1,
  roughness: 0.2,
  transparent: true,
  opacity: 0.9,
});

const ballMaterial = new THREE.MeshStandardMaterial({
  color: "#ff6b35",
  emissive: "#ff6b35",
  emissiveIntensity: 0.5,
  metalness: 0.3,
  roughness: 0.1,
});

const ringMaterial = new THREE.MeshStandardMaterial({
  color: "#ff00ff",
  emissive: "#ff00ff",
  emissiveIntensity: 0.5,
  transparent: true,
  opacity: 0.4,
});

// Optimized Platform component
const Platform = forwardRef<
  THREE.Mesh,
  {
    position: [number, number, number];
    rotation: [number, number, number];
    segmentIndex: number;
    faceIndex: number;
  }
>(({ position, rotation, segmentIndex, faceIndex }, ref) => {
  const bounceScale = useRef(1);
  const glowIntensity = useRef(1);
  const greenFlash = useRef(0); // Green flash intensity
  const faceWidth = 2 * TUNNEL_RADIUS * Math.sin(Math.PI / SIDES);

  const calculatedRotation = useMemo(() => {
    const [x, y, z] = position;
    const centerPoint = new THREE.Vector3(0, 0, z);
    const platformPos = new THREE.Vector3(x, y, z);
    const direction = centerPoint.clone().sub(platformPos).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    return [euler.x, euler.y, euler.z] as [number, number, number];
  }, [position]);

  const [physicsRef] = useBox(() => ({
    position,
    rotation: calculatedRotation,
    args: [faceWidth, 0.2, SEGMENT_LENGTH],
    type: "Static",
    userData: { segmentIndex, faceIndex, position },
  }));

  useFrame((state, delta) => {
    if (physicsRef.current) {
      const time = state.clock.elapsedTime;
      const pulse = Math.sin(time * 2 + segmentIndex) * 0.1 + 0.9;

      easing.damp(bounceScale, "current", 1, 0.3, delta);
      easing.damp(glowIntensity, "current", 1, 0.5, delta);
      easing.damp(greenFlash, "current", 0, 0.8, delta); // Green flash fades quickly

      physicsRef.current.scale.setScalar(bounceScale.current * pulse);

      // Mix cyan and green based on flash intensity
      const baseIntensity =
        0.8 +
        glowIntensity.current * 0.5 +
        Math.sin(time * 3 + faceIndex) * 0.2;
      neonPlatformMaterial.emissiveIntensity =
        baseIntensity + greenFlash.current * 2;

      // Blend color between cyan and green
      const greenAmount = greenFlash.current;
      neonPlatformMaterial.color.setRGB(
        greenAmount * 0 + (1 - greenAmount) * 0, // Red component
        1, // Green component (always full)
        greenAmount * 1 + (1 - greenAmount) * 1 // Blue component
      );
      neonPlatformMaterial.emissive.setRGB(
        greenAmount * 0 + (1 - greenAmount) * 0,
        1,
        greenAmount * 1 + (1 - greenAmount) * 1
      );
    }
  });

  useEffect(() => {
    const handleBounce = (event: CustomEvent) => {
      if (
        event.detail.platformSegment === segmentIndex &&
        event.detail.platformFace === faceIndex
      ) {
        bounceScale.current = 1.3;
        glowIntensity.current = 3;
        greenFlash.current = 1; // Trigger green flash
      }
    };
    window.addEventListener("platformBounce", handleBounce as EventListener);
    return () =>
      window.removeEventListener(
        "platformBounce",
        handleBounce as EventListener
      );
  }, [segmentIndex, faceIndex]);

  // Register for collision detection
  useEffect(() => {
    if (physicsRef.current) {
      const key = `${segmentIndex}-${faceIndex}`;
      window.platformMeshes = window.platformMeshes || new Map();
      window.platformMeshes.set(key, {
        mesh: physicsRef.current,
        zPosition: position[2],
        segmentIndex,
        faceIndex,
        position,
      });
      return () => {
        window.platformMeshes?.delete(key);
      };
    }
  }, [segmentIndex, faceIndex, position]);

  return (
    <group>
      <mesh ref={physicsRef} receiveShadow castShadow>
        <boxGeometry args={[faceWidth, 0.2, SEGMENT_LENGTH]} />
        <primitive object={neonPlatformMaterial} />
      </mesh>
      <mesh
        position={position}
        rotation={calculatedRotation}
        scale={[1.05, 1.5, 1.05]}
      >
        <boxGeometry args={[faceWidth, 0.2, SEGMENT_LENGTH]} />
        <meshBasicMaterial
          color="#00ffff"
          transparent
          opacity={0.3}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
});

// Optimized Ring component
const TunnelRing = ({
  segmentIndex,
  ballPosition,
}: {
  segmentIndex: number;
  ballPosition: number;
}) => {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (ringRef.current) {
      const time = state.clock.elapsedTime;
      ringRef.current.rotation.z = time * 0.5 + segmentIndex;

      const segmentZ = segmentIndex * (SEGMENT_LENGTH + GAP_LENGTH);
      const distanceFromBall = Math.abs(segmentZ - ballPosition);
      const fadeStart = 15;
      const maxDistance = 25;

      let opacity = 1;
      if (distanceFromBall > fadeStart) {
        opacity = Math.max(
          0,
          1 - (distanceFromBall - fadeStart) / (maxDistance - fadeStart)
        );
      }

      const pulse = 0.3 + Math.sin(time * 2 + segmentIndex) * 0.1;
      ringMaterial.opacity = pulse * opacity;
    }
  });

  return (
    <mesh
      ref={ringRef}
      position={[0, 0, segmentIndex * (SEGMENT_LENGTH + GAP_LENGTH)]}
    >
      <torusGeometry args={[TUNNEL_RADIUS * 0.95, 0.02, 6, 32]} />
      <primitive object={ringMaterial} />
    </mesh>
  );
};

// Collectible component using AzeronLogo
const Collectible = forwardRef<
  THREE.Group,
  {
    position: [number, number, number];
    segmentIndex: number;
    faceIndex: number;
    onCollected: (segmentIndex: number, faceIndex: number) => void;
  }
>(({ position, segmentIndex, faceIndex, onCollected }, ref) => {
  const collectibleRef = useRef<THREE.Group>(null);
  const logoRef = useRef<THREE.Group>(null);
  const floatOffset = useRef(Math.random() * Math.PI * 2);
  const [collected, setCollected] = useState(false);
  const [collecting, setCollecting] = useState(false); // New state for collection animation
  const [exploding, setExploding] = useState(false); // New state for explosion
  const scaleRef = useRef(1);
  const collectScale = useRef(1); // Separate scale for collection animation

  // Calculate proper position on the inner face of the platform
  const collectiblePosition = useMemo(() => {
    const [x, y, z] = position;
    // Calculate direction from platform to center (inward normal)
    const direction = new THREE.Vector3(-x, -y, 0).normalize();
    // Move the collectible inward from the platform surface toward the tunnel center
    const inwardDistance = 0.9; // Closer to platform but still reachable
    const collectibleX = x + direction.x * inwardDistance;
    const collectibleY = y + direction.y * inwardDistance;
    return [collectibleX, collectibleY, z] as [number, number, number];
  }, [position]);

  // Calculate the platform's perpendicular axis (normal vector pointing outward)
  const platformNormal = useMemo(() => {
    const [x, y, z] = position;
    return new THREE.Vector3(x, y, 0).normalize();
  }, [position]);

  // Override material for high visibility
  const shinyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffdd00",
        emissive: "#ff6600",
        emissiveIntensity: 2.0,
        metalness: 1.0,
        roughness: 0.0,
        transparent: false,
        opacity: 1.0,
      }),
    []
  );

  useFrame((state, delta) => {
    if (collectibleRef.current && !collected) {
      const time = state.clock.elapsedTime;

      // Rotate around the platform's perpendicular axis (normal vector)
      if (logoRef.current && !collecting) {
        // Create rotation quaternion around the platform normal
        const rotationSpeed = 1.5 * delta; // Smooth rotation speed
        logoRef.current.rotateOnWorldAxis(platformNormal, rotationSpeed);
      }

      // Collection animation with dramatic effects
      if (collecting) {
        collectScale.current = Math.max(0.1, collectScale.current - delta * 6); // Faster scale down, don't go to 0

        // Spin faster during collection
        if (logoRef.current) {
          logoRef.current.rotateOnWorldAxis(platformNormal, delta * 25); // Much faster spin
        }

        // Color pulsing during collection
        if (shinyMaterial) {
          const pulse = Math.sin(time * 20) * 0.5 + 0.5;
          shinyMaterial.emissiveIntensity = 6.0 + pulse * 6.0; // Bright pulsing
        }

        // Don't set collected here - let explosion handle it
      } else {
        // Normal floating animation - small vertical movement
        const floatY = Math.sin(time * 3 + floatOffset.current) * 0.06;
        const currentY = collectiblePosition[1] + floatY;
        collectibleRef.current.position.set(
          collectiblePosition[0],
          currentY,
          collectiblePosition[2]
        );

        // Update collision detection position in real-time
        if (window.collectibleMeshes) {
          const key = `collectible-${segmentIndex}-${faceIndex}`;
          const meshData = window.collectibleMeshes.get(key);
          if (meshData && !meshData.collected) {
            meshData.position = [
              collectiblePosition[0],
              currentY,
              collectiblePosition[2],
            ];
          }
        }

        // Subtle glow pulsing during normal state
        if (shinyMaterial) {
          const pulse = Math.sin(time * 2) * 0.3 + 0.7;
          shinyMaterial.emissiveIntensity = 2.0 + pulse * 0.5;
        }
      }

      // Apply scales with more dramatic collection effect
      easing.damp(scaleRef, "current", 1, 0.3, delta);
      let finalScale = scaleRef.current * collectScale.current * 0.03;

      // Add bounce effect during collection
      if (collecting && collectScale.current > 0.5) {
        const bounceEffect = 1 + Math.sin(time * 30) * 0.8; // Quick bounce
        finalScale *= bounceEffect;
      }

      collectibleRef.current.scale.setScalar(finalScale);
    }
  });

  // Override all materials in the AzeronLogo with shiny material
  useEffect(() => {
    if (logoRef.current) {
      logoRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = shinyMaterial;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }
  }, [shinyMaterial]);

  // Handle collection with animation
  useEffect(() => {
    const handleCollection = (event: CustomEvent) => {
      if (
        event.detail.segmentIndex === segmentIndex &&
        event.detail.faceIndex === faceIndex &&
        !collected &&
        !collecting
      ) {
        console.log(
          "Starting collection animation for collectible:",
          segmentIndex,
          faceIndex
        );
        setCollecting(true);
        setExploding(true); // Start explosion effect
        onCollected(segmentIndex, faceIndex);

        // Screen flash effect
        const flash = document.createElement("div");
        flash.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: radial-gradient(circle, rgba(255,215,0,1) 0%, rgba(255,255,0,0.9) 20%, rgba(255,165,0,0.8) 40%, rgba(255,100,0,0.6) 60%, transparent 100%);
          pointer-events: none;
          z-index: 9999;
          animation: megaFlashFade 0.6s ease-out forwards;
        `;

        // Add enhanced flash animation keyframes if not already present
        if (!document.querySelector("#mega-flash-style")) {
          const style = document.createElement("style");
          style.id = "mega-flash-style";
          style.textContent = `
            @keyframes megaFlashFade {
              0% { 
                opacity: 1; 
                transform: scale(0.3) rotate(0deg); 
                filter: brightness(8) saturate(4) hue-rotate(0deg); 
              }
              15% { 
                opacity: 1; 
                transform: scale(1.8) rotate(5deg); 
                filter: brightness(12) saturate(5) hue-rotate(10deg); 
              }
              30% { 
                opacity: 0.9; 
                transform: scale(2.5) rotate(-3deg); 
                filter: brightness(6) saturate(3) hue-rotate(-5deg); 
              }
              60% { 
                opacity: 0.4; 
                transform: scale(3.2) rotate(2deg); 
                filter: brightness(3) saturate(2) hue-rotate(15deg); 
              }
              100% { 
                opacity: 0; 
                transform: scale(4.0) rotate(0deg); 
                filter: brightness(1) saturate(1) hue-rotate(0deg); 
              }
            }
          `;
          document.head.appendChild(style);
        }

        document.body.appendChild(flash);
        setTimeout(() => document.body.removeChild(flash), 600); // Longer for more dramatic effect

        // Collection effect with sound
        window.dispatchEvent(
          new CustomEvent("collectibleGathered", {
            detail: {
              position: {
                x: collectiblePosition[0],
                y: collectiblePosition[1],
                z: collectiblePosition[2],
              },
              playSound: true,
            },
          })
        );
      }
    };

    window.addEventListener(
      "collectibleCollected",
      handleCollection as EventListener
    );
    return () =>
      window.removeEventListener(
        "collectibleCollected",
        handleCollection as EventListener
      );
  }, [
    segmentIndex,
    faceIndex,
    collected,
    collecting,
    onCollected,
    collectiblePosition,
  ]);

  // Register for collision detection with better setup
  useEffect(() => {
    if (!collected) {
      const key = `collectible-${segmentIndex}-${faceIndex}`;
      window.collectibleMeshes = window.collectibleMeshes || new Map();
      window.collectibleMeshes.set(key, {
        position: collectiblePosition,
        segmentIndex,
        faceIndex,
        collected: false,
      });

      return () => {
        window.collectibleMeshes?.delete(key);
      };
    }
  }, [segmentIndex, faceIndex, collectiblePosition, collected]);

  if (collected) return null;

  return (
    <>
      <group ref={collectibleRef} position={collectiblePosition}>
        {/* Logo with material override */}
        <group ref={logoRef} scale={[1, 1, 1]}>
          <AzeronLogo />
        </group>

        {/* Enhanced glow ring with collection effects */}
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.02, 8, 16]} />
          <meshBasicMaterial
            color={collecting ? "#ff4400" : "#ffaa00"}
            transparent
            opacity={collecting ? 1.0 : 0.8}
          />
        </mesh>

        {/* Outer pulsing ring */}
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.4, 0.01, 6, 12]} />
          <meshBasicMaterial
            color={collecting ? "#ff0000" : "#ffdd00"}
            transparent
            opacity={collecting ? 0.9 : 0.4}
          />
        </mesh>

        {/* Collection burst effect */}
        {collecting && (
          <>
            <mesh position={[0, 0, 0]}>
              <sphereGeometry args={[0.6, 8, 8]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={collectScale.current * 0.3}
                side={THREE.BackSide}
              />
            </mesh>

            {/* Expanding rings during collection */}
            <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry
                args={[0.8 * (1 - collectScale.current), 0.03, 6, 12]}
              />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={collectScale.current * 0.8}
              />
            </mesh>
          </>
        )}

        {/* Subtle sparkle effect for normal state */}
        {!collecting && (
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.4, 6, 6]} />
            <meshBasicMaterial
              color="#ffdd00"
              transparent
              opacity={0.1}
              side={THREE.BackSide}
            />
          </mesh>
        )}
      </group>

      {/* Explosion Effect */}
      <CollectibleExplosion
        position={collectiblePosition}
        active={exploding}
        onComplete={() => {
          setExploding(false);
          setCollected(true);
        }}
      />
    </>
  );
});

// Enhanced Collection particles effect with more dramatic burst
const CollectionParticles = () => {
  const particlesRef = useRef<THREE.Points | null>(null);
  const particles = useRef({
    positions: new Float32Array(450), // 150 particles * 3 for more dramatic effect
    velocities: new Float32Array(450),
    lifetimes: new Float32Array(150),
    colors: new Float32Array(450), // Add colors for variety
    active: false,
    center: new THREE.Vector3(0, 0, 0),
  });

  const collectionMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: "#ffff00",
        size: 0.6,
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 1.0,
        sizeAttenuation: false,
        vertexColors: true, // Enable vertex colors
      }),
    []
  );

  const collectionGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particles.current.positions, 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(particles.current.colors, 3)
    );
    return geometry;
  }, []);

  useFrame((state, delta) => {
    if (particles.current.active && particlesRef.current) {
      const positions = particles.current.positions;
      const velocities = particles.current.velocities;
      const lifetimes = particles.current.lifetimes;
      const colors = particles.current.colors;

      let anyAlive = false;

      for (let i = 0; i < 150; i++) {
        if (lifetimes[i] > 0) {
          anyAlive = true;
          const i3 = i * 3;

          // Update positions with more dynamic movement
          positions[i3] += velocities[i3] * delta * 80;
          positions[i3 + 1] += velocities[i3 + 1] * delta * 80;
          positions[i3 + 2] += velocities[i3 + 2] * delta * 80;

          // Apply slight gravity and air resistance
          velocities[i3 + 1] -= 0.3 * delta * 60;
          velocities[i3] *= 0.98;
          velocities[i3 + 2] *= 0.98;

          // Fade colors from yellow to white to transparent
          const lifeRatio = lifetimes[i] / 1.5;
          colors[i3] = 1; // Red component
          colors[i3 + 1] = 1; // Green component
          colors[i3 + 2] = Math.max(0.2, lifeRatio); // Blue component (less blue = more yellow)

          // Reduce lifetime
          lifetimes[i] -= delta;
        }
      }

      if (!anyAlive) {
        particles.current.active = false;
        collectionMaterial.opacity = 0;
      } else {
        collectionMaterial.opacity = 1.0;
      }

      collectionGeometry.attributes.position.needsUpdate = true;
      collectionGeometry.attributes.color.needsUpdate = true;
    }
  });

  useEffect(() => {
    const handleCollection = (event: CustomEvent) => {
      const { x, y, z } = event.detail.position || { x: 0, y: 0, z: 0 };

      // Initialize collection particles with even more drama for explosion
      for (let i = 0; i < 150; i++) {
        const i3 = i * 3;
        const angle = (i / 150) * Math.PI * 2 + Math.random() * 0.5;
        const elevation = (Math.random() - 0.5) * Math.PI * 0.8;
        const speed = 4 + Math.random() * 8; // Faster particles for more drama

        particles.current.positions[i3] = x + (Math.random() - 0.5) * 0.3;
        particles.current.positions[i3 + 1] = y + (Math.random() - 0.5) * 0.3;
        particles.current.positions[i3 + 2] = z + (Math.random() - 0.5) * 0.3;

        particles.current.velocities[i3] =
          Math.cos(angle) * Math.cos(elevation) * speed;
        particles.current.velocities[i3 + 1] = Math.sin(elevation) * speed + 4; // Stronger upward burst
        particles.current.velocities[i3 + 2] =
          Math.sin(angle) * Math.cos(elevation) * speed;

        // Initialize colors with more variety (white to yellow to orange)
        const colorVariation = Math.random();
        particles.current.colors[i3] = 1; // Red component
        particles.current.colors[i3 + 1] = 1; // Green component
        particles.current.colors[i3 + 2] = colorVariation > 0.5 ? 1 : 0; // Blue component for white/yellow mix

        particles.current.lifetimes[i] = 1.5 + Math.random() * 0.8; // Longer lasting
      }

      particles.current.active = true;
    };

    window.addEventListener(
      "collectibleGathered",
      handleCollection as EventListener
    );
    return () =>
      window.removeEventListener(
        "collectibleGathered",
        handleCollection as EventListener
      );
  }, []);

  return (
    <points ref={particlesRef}>
      <primitive object={collectionGeometry} />
      <primitive object={collectionMaterial} />
    </points>
  );
};

// Collectible Explosion Effect
const CollectibleExplosion = ({
  position,
  active,
  onComplete,
}: {
  position: [number, number, number];
  active: boolean;
  onComplete: () => void;
}) => {
  const explosionRef = useRef<THREE.Group>(null);
  const startTime = useRef(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (active && !isActive) {
      setIsActive(true);
      startTime.current = Date.now();

      // Auto-complete after explosion duration
      setTimeout(() => {
        setIsActive(false);
        onComplete();
      }, 1000);
    }
  }, [active, isActive, onComplete]);

  useFrame((state) => {
    if (explosionRef.current && isActive) {
      const elapsed = (Date.now() - startTime.current) / 1000;
      const progress = Math.min(elapsed / 1.0, 1);

      // Scale explosion outward
      const explosionScale = progress * 15; // Large explosion
      explosionRef.current.scale.setScalar(explosionScale);

      // Fade out as it expands
      const fadeOut = Math.max(0, 1 - progress);
      explosionRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          if ("opacity" in child.material) {
            (child.material as any).opacity = fadeOut;
          }
        }
      });
    }
  });

  if (!isActive) return null;

  return (
    <group ref={explosionRef} position={position}>
      {/* Central burst */}
      <mesh>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent />
      </mesh>

      {/* Expanding shockwave rings */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <torusGeometry args={[0.2 + i * 0.1, 0.02, 8, 32]} />
          <meshBasicMaterial
            color={i < 4 ? "#ffffff" : i < 8 ? "#ffff00" : "#ff8800"}
            transparent
          />
        </mesh>
      ))}

      {/* Burst rays */}
      {Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        return (
          <mesh
            key={`ray-${i}`}
            position={[Math.cos(angle) * 0.3, Math.sin(angle) * 0.3, 0]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[0.4, 0.06, 0.06]} />
            <meshBasicMaterial color="#ffff00" transparent />
          </mesh>
        );
      })}

      {/* Particle-like sparkles around the text */}
      {Array.from({ length: 40 }, (_, i) => {
        const angle = (i / 40) * Math.PI * 2;
        const radius = 0.8; // Slightly bigger sparkle radius
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius,
              0.5 + Math.sin(angle) * radius * 0.3, // Adjusted for new text position
              Math.sin(angle) * 0.2,
            ]}
          >
            <sphereGeometry args={[0.018, 6, 6]} />{" "}
            {/* Slightly bigger spheres */}
            <meshBasicMaterial color="#ffff00" transparent opacity={0.6} />
          </mesh>
        );
      })}

      {/* Mega-burst rays */}
      {Array.from({ length: 4 }, (_, i) => {
        const angle = (i / 4) * Math.PI * 2;
        return (
          <mesh
            key={`mega-ray-${i}`}
            position={[Math.cos(angle) * 0.5, Math.sin(angle) * 0.5, 0]}
            rotation={[0, 0, angle]}
          >
            <boxGeometry args={[0.8, 0.06, 0.06]} />
            <meshBasicMaterial color="#ffff00" transparent />
          </mesh>
        );
      })}
    </group>
  );
};

// Simplified Segment component - now with collectibles
const TunnelSegment = ({
  segmentIndex,
  isFirst,
  ballPosition,
  onPlatformUpdate,
}: {
  segmentIndex: number;
  isFirst: boolean;
  ballPosition: number;
  onPlatformUpdate: (segmentIndex: number, platforms: any[]) => void;
}) => {
  const [collectedItems, setCollectedItems] = useState<Set<string>>(new Set());

  const platforms = useMemo(() => {
    const data = [];
    const segmentZ = segmentIndex * (SEGMENT_LENGTH + GAP_LENGTH);
    const offset = 0.1;

    if (isFirst) {
      const angle = Math.PI * 1.5;
      data.push({
        position: [
          Math.cos(angle) * (TUNNEL_RADIUS - offset),
          Math.sin(angle) * (TUNNEL_RADIUS - offset),
          segmentZ + SEGMENT_LENGTH / 2,
        ] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        segmentIndex,
        faceIndex: 6,
        hasCollectible: false, // First platform never has collectible
      });
    } else {
      const count = Math.floor(Math.random() * 3) + 1;
      const faces = Array.from({ length: SIDES }, (_, i) => i);

      for (let i = faces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [faces[i], faces[j]] = [faces[j], faces[i]];
      }

      for (let i = 0; i < count; i++) {
        const face = faces[i];
        const angle = (face / SIDES) * Math.PI * 2;
        const hasCollectible = Math.random() < 0.3 && i === 0; // 30% chance, only on first platform of segment

        data.push({
          position: [
            Math.cos(angle) * (TUNNEL_RADIUS - offset),
            Math.sin(angle) * (TUNNEL_RADIUS - offset),
            segmentZ + SEGMENT_LENGTH / 2,
          ] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          segmentIndex,
          faceIndex: face,
          hasCollectible,
        });
      }
    }

    onPlatformUpdate(segmentIndex, data);
    return data;
  }, [segmentIndex, isFirst, onPlatformUpdate]);

  const handleCollectibleCollected = useCallback(
    (segmentIndex: number, faceIndex: number) => {
      const key = `${segmentIndex}-${faceIndex}`;
      setCollectedItems((prev) => new Set([...prev, key]));
    },
    []
  );

  return (
    <group>
      {platforms.map((platform, i) => (
        <Platform key={`${segmentIndex}-${i}`} {...platform} />
      ))}
      {platforms.map(
        (platform, i) =>
          platform.hasCollectible &&
          !collectedItems.has(
            `${platform.segmentIndex}-${platform.faceIndex}`
          ) && (
            <Collectible
              key={`collectible-${segmentIndex}-${i}`}
              position={platform.position}
              segmentIndex={platform.segmentIndex}
              faceIndex={platform.faceIndex}
              onCollected={handleCollectibleCollected}
            />
          )
      )}
      <TunnelRing segmentIndex={segmentIndex} ballPosition={ballPosition} />
    </group>
  );
};

// Optimized Tunnel
const Tunnel = ({
  ballPosition,
  gameState,
}: {
  ballPosition: number;
  gameState: GameStateInterface;
}) => {
  const [segments, setSegments] = useState(() =>
    Array.from({ length: SEGMENTS_AHEAD + SEGMENTS_BEHIND }, (_, i) => i)
  );
  const platformDataRef = useRef(new Map());

  const updatePlatformData = useCallback(
    (segmentIndex: number, platforms: any[]) => {
      platformDataRef.current.set(segmentIndex, platforms);
    },
    []
  );

  useFrame(() => {
    const currentSegment = Math.floor(
      ballPosition / (SEGMENT_LENGTH + GAP_LENGTH)
    );
    const min = Math.max(0, currentSegment - SEGMENTS_BEHIND);
    const max = currentSegment + SEGMENTS_AHEAD;

    setSegments((prev) => {
      // Cleanup
      if (window.platformMeshes) {
        for (const [key, data] of window.platformMeshes) {
          if (data.segmentIndex < min - 2) {
            window.platformMeshes.delete(key);
          }
        }
      }

      return Array.from({ length: max - min + 1 }, (_, i) => min + i);
    });
  });

  useEffect(() => {
    window.getPlatformData = (segmentIndex) =>
      platformDataRef.current.get(segmentIndex) || [];
  }, []);

  return (
    <group>
      <fog attach="fog" args={["#000011", 8, 35]} />
      {segments.map((index) => (
        <TunnelSegment
          key={index}
          segmentIndex={index}
          isFirst={index === 0}
          ballPosition={ballPosition}
          onPlatformUpdate={updatePlatformData}
        />
      ))}
      <TunnelParticles ballPosition={ballPosition} gameState={gameState} />
    </group>
  );
};

// Visual Score Feedback Component
const ScoreFeedbackSystem = ({ currentScore }: { currentScore: number }) => {
  const [feedbacks, setFeedbacks] = useState<ScoreFeedback[]>([]);

  // Handle bounce scoring - shows +10 points
  useEffect(() => {
    const handleBounce = (event: CustomEvent) => {
      const { x, y, z } = event.detail.position || { x: 0, y: 0, z: 0 };

      const newFeedback: ScoreFeedback = {
        id: `bounce-${Date.now()}-${Math.random()}`,
        position: [x, y + 0.5, z],
        score: 10, // Show points gained from bounce
        type: "bounce",
        timestamp: Date.now(),
      };

      setFeedbacks((prev) => [...prev, newFeedback]);

      // Remove feedback after animation completes
      setTimeout(() => {
        setFeedbacks((prev) => prev.filter((f) => f.id !== newFeedback.id));
      }, 2000);
    };

    window.addEventListener("ballBounce", handleBounce as EventListener);
    return () =>
      window.removeEventListener("ballBounce", handleBounce as EventListener);
  }, [currentScore]);

  // Handle collectible scoring - shows +50 points
  useEffect(() => {
    const handleCollection = (event: CustomEvent) => {
      const { x, y, z } = event.detail.position || { x: 0, y: 0, z: 0 };

      const newFeedback: ScoreFeedback = {
        id: `collectible-${Date.now()}-${Math.random()}`,
        position: [x, y + 0.5, z],
        score: 50, // Show points gained from collectible
        type: "collectible",
        timestamp: Date.now(),
      };

      setFeedbacks((prev) => [...prev, newFeedback]);

      // Remove feedback after animation completes
      setTimeout(() => {
        setFeedbacks((prev) => prev.filter((f) => f.id !== newFeedback.id));
      }, 2500); // Slightly longer duration for collectibles
    };

    window.addEventListener(
      "collectibleGathered",
      handleCollection as EventListener
    );
    return () =>
      window.removeEventListener(
        "collectibleGathered",
        handleCollection as EventListener
      );
  }, [currentScore]);

  return (
    <group>
      {feedbacks.map((feedback) => (
        <ScoreFeedbackText key={feedback.id} feedback={feedback} />
      ))}
    </group>
  );
};

// Individual Score Feedback Text Component
const ScoreFeedbackText = ({ feedback }: { feedback: ScoreFeedback }) => {
  const groupRef = useRef<THREE.Group>(null);
  const startTime = useRef(Date.now());
  const [opacity, setOpacity] = useState(1);

  // Different colors and effects based on score type
  const isCollectible = feedback.type === "collectible";
  const baseColor = isCollectible ? "rgb(255, 215, 0)" : "rgb(156, 255, 156)"; // Gold for collectibles, green for bounces
  const glowColor = isCollectible ? "#ffaa00" : "#44ff44";
  const brightGlowColor = isCollectible ? "#ffdd00" : "#88ff88";
  const sparkleColor = isCollectible ? "#ffff00" : "#00ff00";
  const duration = isCollectible ? 2.5 : 2.0; // Longer animation for collectibles
  const fontSize = isCollectible ? 1.2 : 1.0; // Bigger text for collectibles
  const scoreText = `+${feedback.score}`; // Always show with + prefix

  useFrame((state) => {
    if (groupRef.current) {
      const elapsed = (Date.now() - startTime.current) / 1000;
      const progress = Math.min(elapsed / duration, 1);

      // More dynamic upward movement with slight curve
      const upwardMovement =
        progress * (isCollectible ? 2.5 : 2) +
        Math.sin(progress * Math.PI) * 0.5;
      const sideMovement = Math.sin(progress * Math.PI * 2) * 0.2; // Gentle sway
      const fadeOut = Math.max(0, 1 - progress);

      // Position animation with offset for collectibles (place them side by side)
      const xOffset = isCollectible ? 1.2 : -1.2; // Collectibles to the right, bounces to the left
      groupRef.current.position.set(
        feedback.position[0] + sideMovement + xOffset,
        feedback.position[1] + upwardMovement,
        feedback.position[2]
      );

      // Dynamic scale with pop effect - bigger for collectibles
      const popPhase = Math.min(progress * 8, 1); // Quick pop at start
      const shrinkPhase = Math.max(0, 1 - (progress - 0.7) * 3); // Shrink at end
      const pulse =
        1 + Math.sin(elapsed * (isCollectible ? 8 : 10)) * 0.15 * fadeOut; // More pulse for collectibles
      const baseScale = isCollectible ? 0.8 : 0.6; // Bigger base scale for collectibles
      const scale = popPhase * shrinkPhase * pulse * baseScale;
      groupRef.current.scale.setScalar(scale);

      // Gentle rotation for more life - more dramatic for collectibles
      const rotationIntensity = isCollectible ? 0.15 : 0.1;
      groupRef.current.rotation.z =
        Math.sin(elapsed * 4) * rotationIntensity * fadeOut;

      // Update opacity with more dramatic fade
      const dynamicFade =
        fadeOut * (1 + Math.sin(elapsed * (isCollectible ? 12 : 15)) * 0.2);
      setOpacity(Math.max(0, dynamicFade));
    }
  });

  return (
    <group ref={groupRef} position={feedback.position}>
      {/* Main text - different colors for different types */}
      <Text
        position={[0, 0.5, 0]}
        fontSize={fontSize}
        color={baseColor}
        font="/Micro5-Regular.ttf"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.06}
        outlineColor={isCollectible ? "#aa5500" : "#002200"}
        fillOpacity={opacity}
        outlineOpacity={opacity * 0.8}
        rotation={[0, Math.PI, 0]}
      >
        {scoreText}
      </Text>

      {/* Glow effect behind */}
      <Text
        position={[0, 0.5, -0.2]}
        fontSize={fontSize * 1.2}
        color={glowColor}
        font="/Micro5-Regular.ttf"
        anchorX="center"
        anchorY="middle"
        fillOpacity={opacity * 0.2}
        rotation={[0, Math.PI, 0]}
      >
        {scoreText}
      </Text>

      {/* Extra bright glow for pop effect */}
      <Text
        position={[0, 0.5, -0.4]}
        fontSize={fontSize * 1.4}
        color={brightGlowColor}
        font="/Micro5-Regular.ttf"
        anchorX="center"
        anchorY="middle"
        fillOpacity={opacity * 0.1}
        rotation={[0, Math.PI, 0]}
      >
        {scoreText}
      </Text>

      {/* Particle-like sparkles around the text - more for collectibles */}
      {Array.from({ length: isCollectible ? 10 : 6 }, (_, i) => {
        const angle = (i / (isCollectible ? 10 : 6)) * Math.PI * 2;
        const radius = isCollectible ? 1.0 : 0.8; // Bigger sparkle radius for collectibles
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius,
              0.5 + Math.sin(angle) * radius * 0.3,
              Math.sin(angle) * 0.2,
            ]}
          >
            <sphereGeometry args={[isCollectible ? 0.025 : 0.018, 6, 6]} />
            <meshBasicMaterial
              color={sparkleColor}
              transparent
              opacity={opacity * 0.6}
            />
          </mesh>
        );
      })}
    </group>
  );
};

// Optimized Ball - with PRECISE physics restored and particle effects + collectible collection
const Ball = forwardRef<
  THREE.Mesh,
  {
    gameState: GameStateInterface;
    onCollision: (position: [number, number, number]) => void;
    onLose: () => void;
    ballPosition: number;
    setBallPosition: (pos: number) => void;
  }
>(
  (
    { gameState, onCollision, onLose, ballPosition, setBallPosition },
    ballRef
  ) => {
    const ballVelocityY = useRef(0);
    const manualPosition = useRef(1.5);
    const ballY = useRef(-TUNNEL_RADIUS + 0.6);
    const bounceEffect = useRef(1);
    const raycaster = useMemo(() => new THREE.Raycaster(), []);

    const [ref, api] = useBox(() => ({
      mass: 1,
      position: [0, -TUNNEL_RADIUS + 0.6, 1.5],
      material: { friction: 0.1, restitution: 0 },
      args: [BALL_RADIUS * 2, BALL_RADIUS * 2, BALL_RADIUS * 2],
      type: "Kinematic",
    }));

    // Check for collectible collection with proper coordinate transformation
    const checkCollectibleCollision = useCallback(
      (
        ballX: number,
        ballY: number,
        ballZ: number,
        tunnelRotation: number = 0
      ) => {
        if (!window.collectibleMeshes) {
          return;
        }

        // Transform ball position to account for tunnel rotation
        // Since ball is always at center (0,0) in tunnel space, we need to check against rotated collectible positions
        const cos = Math.cos(-tunnelRotation); // Negative because we're inverse transforming
        const sin = Math.sin(-tunnelRotation);

        // Ball in world coordinates (accounting for tunnel rotation)
        const ballWorldX = ballX * cos - ballY * sin;
        const ballWorldY = ballX * sin + ballY * cos;

        console.log(
          `🔍 Ball at: (${ballX.toFixed(2)}, ${ballY.toFixed(
            2
          )}, ${ballZ.toFixed(2)}) | World: (${ballWorldX.toFixed(
            2
          )}, ${ballWorldY.toFixed(2)}) | Rotation: ${(
            (tunnelRotation * 180) /
            Math.PI
          ).toFixed(1)}° | Collectibles: ${window.collectibleMeshes.size}`
        );

        for (const [key, data] of window.collectibleMeshes) {
          if (data.collected) continue;

          const [collectibleX, collectibleY, collectibleZ] = data.position;

          // Check distance in both original coordinates and world coordinates
          const dx1 = ballX - collectibleX;
          const dy1 = ballY - collectibleY;
          const dz1 = ballZ - collectibleZ;
          const distance1 = Math.sqrt(dx1 * dx1 + dy1 * dy1 + dz1 * dz1);

          const dx2 = ballWorldX - collectibleX;
          const dy2 = ballWorldY - collectibleY;
          const dz2 = ballZ - collectibleZ;
          const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2 + dz2 * dz2);

          const minDistance = Math.min(distance1, distance2);

          console.log(
            `  📍 Collectible ${key}: (${collectibleX.toFixed(
              2
            )}, ${collectibleY.toFixed(2)}, ${collectibleZ.toFixed(
              2
            )}) | Dist1: ${distance1.toFixed(2)} | Dist2: ${distance2.toFixed(
              2
            )} | Min: ${minDistance.toFixed(2)}`
          );

          // Use the smaller distance and be more restrictive for direct hits
          if (minDistance < 1.5) {
            // Reduced from 3.0 to be more precise
            console.log(
              `🎯 COLLECTING! Min Distance: ${minDistance.toFixed(
                2
              )} - Ball: (${ballX.toFixed(2)}, ${ballY.toFixed(
                2
              )}, ${ballZ.toFixed(2)}) - Collectible: (${collectibleX.toFixed(
                2
              )}, ${collectibleY.toFixed(2)}, ${collectibleZ.toFixed(2)})`
            );
            data.collected = true;
            window.dispatchEvent(
              new CustomEvent("collectibleCollected", {
                detail: {
                  segmentIndex: data.segmentIndex,
                  faceIndex: data.faceIndex,
                },
              })
            );
            return; // Exit after collecting one
          }
        }
      },
      []
    );

    // RESTORED PRECISE collision detection - increased range back to 4 units for reliability
    const checkPreciseCollision = useCallback(
      (
        ballX: number,
        ballY: number,
        ballZ: number
      ):
        | { collision: false }
        | {
            collision: true;
            platformY: number;
            segmentIndex?: number;
            faceIndex?: number;
          } => {
        if (!window.platformMeshes || !ref.current) return { collision: false };

        // Restore original 4-unit search range for precision
        const nearby = [];
        for (const [key, data] of window.platformMeshes) {
          if (Math.abs(data.zPosition - ballZ) <= 4) {
            // Restored from 2 to 4
            nearby.push(data);
          }
        }

        if (nearby.length === 0) return { collision: false };

        // Multiple collision detection methods for maximum reliability
        const ballPosition = new THREE.Vector3(ballX, ballY, ballZ);

        // Method 1: Raycaster detection
        const rayOrigin = new THREE.Vector3(ballX, ballY, ballZ);
        const rayDirection = new THREE.Vector3(0, -1, 0);
        raycaster.set(rayOrigin, rayDirection);
        raycaster.far = BALL_RADIUS + 2.0; // Restored original range

        // Method 2: Bounding box detection for backup
        const ballBoundingBox = new THREE.Box3().setFromCenterAndSize(
          ballPosition,
          new THREE.Vector3(
            BALL_RADIUS * 2.5,
            BALL_RADIUS * 2.5,
            BALL_RADIUS * 2.5
          )
        );

        for (const data of nearby) {
          const platformMesh = data.mesh;
          if (!platformMesh.geometry) continue;

          try {
            // Method 1: Raycaster collision
            const intersections = raycaster.intersectObject(
              platformMesh,
              false
            );
            if (intersections.length > 0 && ballVelocityY.current < 0) {
              const intersection = intersections[0];
              const distance = intersection.distance;
              if (distance <= BALL_RADIUS + 0.5) {
                return {
                  collision: true,
                  platformY: intersection.point.y,
                  segmentIndex: data.segmentIndex,
                  faceIndex: data.faceIndex,
                };
              }
            }

            // Method 2: Bounding box collision (backup)
            const platformBoundingBox = new THREE.Box3().setFromObject(
              platformMesh
            );
            if (
              ballBoundingBox.intersectsBox(platformBoundingBox) &&
              ballVelocityY.current < 0
            ) {
              // Make sure ball is hitting platform from above
              const ballBottom = ballY - BALL_RADIUS;
              const platformTop = platformBoundingBox.max.y;

              if (ballBottom <= platformTop + 0.3) {
                return {
                  collision: true,
                  platformY: platformTop,
                  segmentIndex: data.segmentIndex,
                  faceIndex: data.faceIndex,
                };
              }
            }
          } catch (error) {
            // Ignore errors for individual platforms
          }
        }
        return { collision: false };
      },
      [raycaster]
    );

    useFrame((state, delta) => {
      if (ref.current) {
        const time = state.clock.elapsedTime;
        // Update material emissive intensity
        const mesh = ref.current as THREE.Mesh;
        if (mesh.material && "emissiveIntensity" in mesh.material) {
          (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
            0.5 + Math.sin(time * 5) * 0.2 + bounceEffect.current * 0.5;
        }

        easing.damp(bounceEffect, "current", 1, 0.3, delta);
        ref.current.scale.setScalar(bounceEffect.current);
      }

      if (gameState.state === GameState.PLAYING) {
        // Calculate dynamic speed based on jumps (increase horizontal speed and gravity every 10 jumps)
        const speedMultiplier = 1 + Math.floor(gameState.jumps / 10) * 0.15; // 15% faster every 10 jumps (more gradual)
        const currentGravity = GRAVITY * speedMultiplier; // Faster falling
        const currentBallSpeed = BALL_SPEED * speedMultiplier; // Faster forward movement
        // Keep bounce speed constant to maintain jump height

        // EXACT original physics - but with dynamic gravity and horizontal speed
        ballVelocityY.current += currentGravity;
        const newY = ballY.current + ballVelocityY.current;
        const newZ = manualPosition.current + currentBallSpeed; // Use dynamic horizontal speed

        // Calculate which segment we should be near
        const currentSegment = Math.floor(newZ / (SEGMENT_LENGTH + GAP_LENGTH));

        if (newY < -TUNNEL_RADIUS - 3) {
          onLose();
          return;
        }

        // Check for collectible collection CONTINUOUSLY - before and after everything
        checkCollectibleCollision(
          0,
          ballY.current,
          manualPosition.current,
          gameState.tunnelRotation
        ); // Current position
        checkCollectibleCollision(0, newY, newZ, gameState.tunnelRotation); // Predicted position

        // CHECK COLLISION BEFORE UPDATING POSITION to prevent missing collisions
        const collision = checkPreciseCollision(0, newY, newZ);

        if (collision.collision && collision.platformY !== undefined) {
          // PERFECT platform bounce with exact positioning like original
          // Calculate the exact platform center the ball should be at
          const distanceTraveled = manualPosition.current - 1.5; // Distance from first platform
          const platformSpacing = SEGMENT_LENGTH + GAP_LENGTH; // 9 units
          const platformIndex = Math.round(distanceTraveled / platformSpacing);
          const exactPlatformCenter = 1.5 + platformIndex * platformSpacing;

          // Snap ball to exact platform center for perfect trajectory
          manualPosition.current = exactPlatformCenter;
          ballY.current = collision.platformY + BALL_RADIUS + 0.02;
          ballVelocityY.current = BOUNCE_SPEED; // Keep bounce speed constant for consistent jump height

          bounceEffect.current = 1.5;

          // Check collectibles again AFTER bounce with final position
          checkCollectibleCollision(
            0,
            ballY.current,
            manualPosition.current,
            gameState.tunnelRotation
          );

          // Emit impact particles
          window.dispatchEvent(
            new CustomEvent("ballBounce", {
              detail: {
                position: { x: 0, y: ballY.current, z: manualPosition.current },
                velocity: ballVelocityY.current,
              },
            })
          );

          if (
            collision.segmentIndex !== undefined &&
            collision.faceIndex !== undefined
          ) {
            window.dispatchEvent(
              new CustomEvent("platformBounce", {
                detail: {
                  platformSegment: collision.segmentIndex,
                  platformFace: collision.faceIndex,
                },
              })
            );
          }

          onCollision([0, ballY.current, manualPosition.current]);
        } else {
          // No collision, continue falling with precise movement
          ballY.current = newY;
          manualPosition.current = newZ;

          // Check collectibles again with final position
          checkCollectibleCollision(
            0,
            ballY.current,
            manualPosition.current,
            gameState.tunnelRotation
          );
        }

        // Update physics body position
        api.position.set(0, ballY.current, manualPosition.current);
        setBallPosition(manualPosition.current);
      }
    });

    const resetBall = useCallback(() => {
      manualPosition.current = 1.5;
      ballY.current = -TUNNEL_RADIUS + 0.6;
      ballVelocityY.current = 0;
      api.position.set(0, ballY.current, manualPosition.current);
    }, [api]);

    useEffect(() => {
      if (ref.current && ballRef && typeof ballRef !== "function") {
        ref.current.userData = { reset: resetBall };
        (ballRef as any).current = ref.current;
      }
    }, [resetBall, ballRef]);

    return (
      <group>
        <mesh ref={ref} castShadow>
          <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
          <meshStandardMaterial
            color="#ff6b35"
            emissive="#ff6b35"
            emissiveIntensity={0.5}
            metalness={0.3}
            roughness={0.1}
          />
        </mesh>
        <BallTrail
          ballPosition={manualPosition.current}
          ballY={ballY.current}
          velocity={ballVelocityY.current}
        />
      </group>
    );
  }
);

// Camera Rig
const CameraRig = ({ ballPosition }: { ballPosition: number }) => {
  useFrame((state, delta) => {
    easing.damp3(state.camera.position, [0, 0, ballPosition - 4], 0.4, delta);
    state.camera.lookAt(0, 0, ballPosition + 6);
  });
  return null;
};

// Controls
const Controls = ({
  gameState,
  setGameState,
  ballRef,
}: {
  gameState: GameStateInterface;
  setGameState: React.Dispatch<React.SetStateAction<GameStateInterface>>;
  ballRef: React.RefObject<THREE.Mesh | null>;
}) => {
  const keys = useRef({ q: false, e: false });
  const rotationSpeed = 0.02;
  const rotationStep = Math.PI / 6;

  useFrame((state, delta) => {
    if (gameState.state === GameState.PLAYING) {
      let change = 0;
      if (keys.current.q) change -= rotationStep * 0.1;
      if (keys.current.e) change += rotationStep * 0.1;

      if (change !== 0) {
        setGameState((prev) => ({
          ...prev,
          targetRotation: prev.targetRotation + change,
        }));
      }

      easing.damp(
        gameState,
        "tunnelRotation",
        gameState.targetRotation,
        rotationSpeed,
        delta
      );

      setGameState((prev) => ({
        ...prev,
        tunnelRotation: gameState.tunnelRotation,
      }));
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case "q":
          keys.current.q = true;
          break;
        case "e":
          keys.current.e = true;
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case "q":
          keys.current.q = false;
          break;
        case "e":
          keys.current.e = false;
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [gameState.state, setGameState, ballRef]);

  return null;
};

// Main Game Scene
const GameScene = ({
  gameState,
  setGameState,
  personalBest,
  ballResetRef,
}: {
  gameState: GameStateInterface;
  setGameState: React.Dispatch<React.SetStateAction<GameStateInterface>>;
  personalBest: number;
  ballResetRef: React.MutableRefObject<(() => void) | null>;
}) => {
  const ballRef = useRef<THREE.Mesh>(null);
  const [postProcessing, setPostProcessing] = useState(true);

  const handleCollision = useCallback((point: [number, number, number]) => {
    console.log("Ball bounced at:", point);
  }, []);

  const handleLose = useCallback(() => {
    setGameState((prev) => ({
      ...prev,
      state: GameState.LOST,
      message: "Game Over! Press SPACE to restart",
    }));
  }, [setGameState]);

  const setBallPosition = useCallback(
    (position: number) => {
      setGameState((prev) => ({ ...prev, ballPosition: position }));
    },
    [setGameState]
  );

  // Expose ball reset function
  useEffect(() => {
    if (
      ballRef.current &&
      ballRef.current.userData &&
      ballRef.current.userData.reset
    ) {
      ballResetRef.current = ballRef.current.userData.reset;
    }
  }, [ballResetRef]);

  return (
    <>
      <color attach="background" args={["#000000"]} />

      <ambientLight intensity={0.1} color="#0088ff" />
      <directionalLight
        position={[10, 10, 5]}
        intensity={0.8}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight
        position={[-5, -5, -10]}
        intensity={0.3}
        color="#ff00ff"
      />

      <Physics gravity={[0, 0, 0]} allowSleep={false}>
        <group rotation={[0, 0, gameState.tunnelRotation]}>
          <Tunnel ballPosition={gameState.ballPosition} gameState={gameState} />
        </group>

        <Ball
          ref={ballRef}
          gameState={gameState}
          onCollision={handleCollision}
          onLose={handleLose}
          ballPosition={gameState.ballPosition}
          setBallPosition={setBallPosition}
        />
      </Physics>

      <ImpactParticles />
      <CollectionParticles />
      <RetroGameUI gameState={gameState} personalBest={personalBest} />
      <CameraRig ballPosition={gameState.ballPosition} />
      <Controls
        gameState={gameState}
        setGameState={setGameState}
        ballRef={ballRef}
      />

      {postProcessing && (
        <EffectComposer multisampling={8}>
          <Bloom intensity={1.5} luminanceThreshold={0.1} mipmapBlur />
          <ChromaticAberration offset={[0.002, 0.001]} />
          <Vignette offset={0.3} darkness={0.8} />
        </EffectComposer>
      )}
    </>
  );
};

// Personal Best management
const useLeaderboard = () => {
  const [personalBest, setPersonalBest] = useState<number>(0);

  const loadPersonalBest = useCallback(() => {
    try {
      const stored = localStorage.getItem("ballgame-personal-best");
      if (stored) {
        const score = parseInt(stored, 10);
        setPersonalBest(score || 0);
      } else {
        setPersonalBest(0);
      }
    } catch (error) {
      console.error("Failed to load personal best:", error);
      setPersonalBest(0);
    }
  }, []);

  const saveScore = useCallback(
    (score: number) => {
      try {
        // Update personal best if this score is higher
        if (score > personalBest) {
          localStorage.setItem("ballgame-personal-best", score.toString());
          setPersonalBest(score);
        }
      } catch (error) {
        console.error("Failed to save score:", error);
      }
    },
    [personalBest]
  );

  const updatePersonalBest = useCallback(
    (score: number) => {
      if (score > personalBest) {
        try {
          localStorage.setItem("ballgame-personal-best", score.toString());
          setPersonalBest(score);
        } catch (error) {
          console.error("Failed to update personal best:", error);
        }
      }
    },
    [personalBest]
  );

  useEffect(() => {
    loadPersonalBest();
  }, [loadPersonalBest]);

  return { personalBest, saveScore, updatePersonalBest };
};

// Main Menu Component
const MainMenu = ({
  gameState,
  onPlay,
  onRestart,
  personalBest,
}: {
  gameState: GameStateInterface;
  onPlay: () => void;
  onRestart: () => void;
  personalBest: number;
}) => {
  const isGameOver = gameState.state === GameState.LOST;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-30">
      {/* Retro starfield background */}
      <div className="absolute inset-0 bg-black">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(1px 1px at 20px 30px, #00ffff, transparent),
                           radial-gradient(1px 1px at 40px 70px, #ffffff, transparent),
                           radial-gradient(1px 1px at 90px 40px, #00ffff, transparent),
                           radial-gradient(1px 1px at 130px 80px, #ffffff, transparent),
                           radial-gradient(1px 1px at 160px 30px, #00ffff, transparent)`,
            backgroundRepeat: "repeat",
            backgroundSize: "200px 100px",
            animation: "starfield 15s linear infinite",
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full mx-auto px-6">
        {/* Title Section */}
        <h1
          className="text-7xl font-bold text-purple-500 mb-16 font-mono tracking-wider"
          style={{ textShadow: "0 0 30px #8800ff" }}
        >
          TUNNEL RUNNER
        </h1>

        {/* Game Over or Start Section */}
        <div className="mb-16 w-full">
          {isGameOver ? (
            <div className="text-center space-y-8">
              <h2
                className="text-6xl font-bold text-red-500 font-mono"
                style={{ textShadow: "0 0 20px #ff0000" }}
              >
                GAME OVER
              </h2>
              <div
                className="text-4xl text-cyan-400 font-mono"
                style={{ textShadow: "0 0 15px #00ffff" }}
              >
                FINAL SCORE: {gameState.score.toLocaleString()}
              </div>
              <button
                onClick={onRestart}
                className="px-12 py-6 text-2xl font-bold text-white bg-purple-600 rounded-lg hover:bg-purple-500 transition-all hover:scale-105 font-mono"
                style={{
                  boxShadow: "0 0 30px rgba(147, 51, 234, 0.5)",
                  textShadow: "0 0 10px rgba(255, 255, 255, 0.5)",
                }}
              >
                RESTART MISSION
              </button>
            </div>
          ) : (
            <div className="text-center space-y-8">
              <button
                onClick={onPlay}
                className="px-12 py-6 text-2xl font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-500 transition-all hover:scale-105 font-mono"
                style={{
                  boxShadow: "0 0 30px rgba(6, 182, 212, 0.5)",
                  textShadow: "0 0 10px rgba(255, 255, 255, 0.5)",
                }}
              >
                START MISSION
              </button>
              <div className="text-cyan-300 text-xl font-mono opacity-70">
                PRESS SPACE TO BEGIN
              </div>
            </div>
          )}
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-8 w-full mb-16">
          {/* Controls */}
          <div className="text-center p-6 border border-cyan-400/30 bg-cyan-900/10 rounded-lg backdrop-blur-sm">
            <div
              className="text-cyan-400 text-2xl font-bold mb-3 font-mono"
              style={{ textShadow: "0 0 10px #00ffff" }}
            >
              CONTROLS
            </div>
            <div className="text-cyan-300 opacity-90 font-mono">
              Q/E TO ROTATE
            </div>
          </div>

          {/* Objective */}
          <div className="text-center p-6 border border-purple-400/30 bg-purple-900/10 rounded-lg backdrop-blur-sm">
            <div
              className="text-purple-400 text-2xl font-bold mb-3 font-mono"
              style={{ textShadow: "0 0 10px #8844ff" }}
            >
              SURVIVE
            </div>
            <div className="text-purple-300 opacity-90 font-mono">
              AVOID VOID
            </div>
          </div>
        </div>

        {/* Personal Best Section */}
        {personalBest > 0 && (
          <div className="w-full">
            <div
              className="bg-transparent border-2 border-purple-400/50 p-8 rounded-lg backdrop-blur-sm"
              style={{
                boxShadow: "0 0 30px rgba(128, 0, 255, 0.2)",
                background:
                  "linear-gradient(135deg, rgba(128, 0, 255, 0.05), rgba(128, 0, 255, 0.02))",
              }}
            >
              <div className="text-center">
                <h3
                  className="text-purple-400 font-bold text-2xl mb-4 font-mono"
                  style={{ textShadow: "0 0 15px #8800ff" }}
                >
                  PERSONAL BEST
                </h3>
                <div
                  className="text-5xl font-bold text-purple-300 font-mono"
                  style={{ textShadow: "0 0 20px #aa88ff" }}
                >
                  {personalBest.toLocaleString()}
                </div>
                {isGameOver && gameState.score > personalBest && (
                  <div className="text-yellow-400 text-xl font-mono mt-4 animate-pulse">
                    ★ NEW RECORD! ★
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add styles for starfield animation */}
      <style jsx>{`
        @keyframes starfield {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(-100px);
          }
        }
      `}</style>
    </div>
  );
};

// Retro Game UI - Much more minimal and spaced out
const RetroGameUI = ({
  gameState,
  personalBest,
}: {
  gameState: GameStateInterface;
  personalBest: number;
}) => {
  const topTextRef = useRef<THREE.Group>(null);
  const bottomTextRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    // Gentle floating animation for top text
    if (topTextRef.current) {
      topTextRef.current.position.y = 12 + Math.sin(time * 1.2) * 0.2;
      topTextRef.current.rotation.y = Math.sin(time * 0.5) * 0.01;
    }

    // Gentle floating animation for bottom text
    if (bottomTextRef.current) {
      bottomTextRef.current.position.y =
        -12 + Math.sin(time * 1.4 + Math.PI) * 0.15;
      bottomTextRef.current.rotation.y = Math.sin(time * 0.4 + Math.PI) * 0.01;
    }
  });

  const isBeatingRecord = personalBest > 0 && gameState.score > personalBest;

  return (
    <group>
      {/* Top UI - Score Display with more space */}
      <group ref={topTextRef} position={[0, 12, gameState.ballPosition + 18]}>
        {/* Current Score - Larger and more prominent */}
        <Text
          position={[0, 0, 0]}
          fontSize={4.5}
          color={isBeatingRecord ? "#ffff00" : "#00ff88"}
          font="/Micro5-Regular.ttf"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.2}
          outlineColor="#000000"
          strokeWidth={0.08}
          strokeColor={isBeatingRecord ? "#ff6600" : "#004422"}
          rotation={[0, Math.PI, 0]}
        >
          {gameState.score.toLocaleString()}
        </Text>

        {/* New Record Indicator - More prominent */}
        {isBeatingRecord && (
          <Text
            position={[0, 3.5, 0]}
            fontSize={1.8}
            color="#ffff00"
            font="/Micro5-Regular.ttf"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.1}
            outlineColor="#ff4400"
            rotation={[0, Math.PI, 0]}
          >
            🔥 NEW RECORD! 🔥
          </Text>
        )}

        {/* Subtle glow effect - bigger */}
        <Text
          position={[0, 0, -0.5]}
          fontSize={5.0}
          color={isBeatingRecord ? "#ffff00" : "#00ff88"}
          font="/Micro5-Regular.ttf"
          anchorX="center"
          anchorY="middle"
          fillOpacity={0.1}
          rotation={[0, Math.PI, 0]}
        >
          {gameState.score.toLocaleString()}
        </Text>
      </group>

      {/* Bottom UI - Minimal and widely spaced */}
      <group
        ref={bottomTextRef}
        position={[0, -12, gameState.ballPosition + 15]}
      >
        <group position={[0, 0, 0]}>
          {/* Personal Best - Only show if exists and not currently beating it */}
          {personalBest > 0 && !isBeatingRecord && (
            <group position={[-8, 0, 0]}>
              <Text
                position={[0, 1.2, 0]}
                fontSize={0.8}
                color="#ddaaff"
                font="/Micro5-Regular.ttf"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.05}
                outlineColor="#000000"
                rotation={[0, Math.PI, 0]}
              >
                PERSONAL BEST
              </Text>
              <Text
                position={[0, -0.8, 0]}
                fontSize={1.5}
                color="#ffbbff"
                font="/Micro5-Regular.ttf"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.08}
                outlineColor="#000000"
                rotation={[0, Math.PI, 0]}
              >
                {personalBest.toLocaleString()}
              </Text>
            </group>
          )}

          {/* Speed Level - Center, more prominent */}
          <group position={[0, 0, 0]}>
            <Text
              position={[0, 1.2, 0]}
              fontSize={0.9}
              color="#ffdd88"
              font="/Micro5-Regular.ttf"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.06}
              outlineColor="#000000"
              rotation={[0, Math.PI, 0]}
            >
              SPEED LEVEL
            </Text>
            <Text
              position={[0, -0.8, 0]}
              fontSize={2.0}
              color="#ffcc00"
              font="/Micro5-Regular.ttf"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.12}
              outlineColor="#000000"
              rotation={[0, Math.PI, 0]}
            >
              {Math.floor(gameState.jumps / 10) + 1}
            </Text>
          </group>

          {/* Jump Counter - Further right */}
          <group position={[8, 0, 0]}>
            <Text
              position={[0, 1.2, 0]}
              fontSize={0.8}
              color="#88eeff"
              font="/Micro5-Regular.ttf"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.05}
              outlineColor="#000000"
              rotation={[0, Math.PI, 0]}
            >
              JUMPS
            </Text>
            <Text
              position={[0, -0.8, 0]}
              fontSize={1.5}
              color="#00eeff"
              font="/Micro5-Regular.ttf"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.08}
              outlineColor="#000000"
              rotation={[0, Math.PI, 0]}
            >
              {gameState.jumps}
            </Text>
          </group>
        </group>
      </group>
    </group>
  );
};

// Main App
export default function BallGameFiber() {
  const [gameState, setGameState] = useState({
    state: GameState.MENU,
    ballPosition: 1.5,
    tunnelRotation: 0,
    targetRotation: 0,
    message: "",
    score: 0,
    jumps: 0,
  });

  const [audioState, setAudioState] = useState({
    volume: 0.5,
    isMuted: false,
    isPlaying: false,
    sfxVolume: 0.7,
    audioEnabled: false,
  });

  const { personalBest, saveScore, updatePersonalBest } = useLeaderboard();
  const audioRef = useRef<HTMLAudioElement>(null);
  const bounceAudioRef = useRef<HTMLAudioElement>(null);
  const collectAudioRef = useRef<HTMLAudioElement>(null);
  const ballResetRef = useRef<(() => void) | null>(null);

  // Initialize audio
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioState.volume;
      audioRef.current.loop = true;
    }

    // Initialize bounce sound
    if (bounceAudioRef.current) {
      bounceAudioRef.current.volume = audioState.sfxVolume;
    }

    // Initialize collection sound
    if (collectAudioRef.current) {
      collectAudioRef.current.volume = audioState.sfxVolume;
    }
  }, []);

  // Handle volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = audioState.isMuted ? 0 : audioState.volume;
    }
    if (bounceAudioRef.current) {
      bounceAudioRef.current.volume = audioState.isMuted
        ? 0
        : audioState.sfxVolume;
    }
    if (collectAudioRef.current) {
      collectAudioRef.current.volume = audioState.isMuted
        ? 0
        : audioState.sfxVolume;
    }
  }, [audioState.volume, audioState.isMuted, audioState.sfxVolume]);

  // Save score when game ends
  useEffect(() => {
    if (gameState.state === GameState.LOST && gameState.score > 0) {
      saveScore(gameState.score);
    }
  }, [gameState.state, gameState.score, saveScore]);

  // Handle bounce sound effect
  useEffect(() => {
    const handleBounce = () => {
      if (
        bounceAudioRef.current &&
        !audioState.isMuted &&
        audioState.audioEnabled
      ) {
        // Reset audio to beginning to allow rapid bounces
        bounceAudioRef.current.currentTime = 0;
        bounceAudioRef.current.play().catch(console.error);
      }

      // Increment score and jumps
      setGameState((prev) => {
        const newScore = prev.score + 10;
        // Update personal best in real-time if new score exceeds it
        updatePersonalBest(newScore);
        return {
          ...prev,
          score: newScore,
          jumps: prev.jumps + 1,
        };
      });
    };

    window.addEventListener("ballBounce", handleBounce);
    return () => window.removeEventListener("ballBounce", handleBounce);
  }, [audioState.isMuted, audioState.audioEnabled, updatePersonalBest]);

  // Handle collectible collection sound effect
  useEffect(() => {
    const handleCollection = (event: CustomEvent) => {
      if (
        event.detail.playSound &&
        collectAudioRef.current &&
        !audioState.isMuted &&
        audioState.audioEnabled
      ) {
        // Reset audio to beginning for immediate play
        collectAudioRef.current.currentTime = 0;
        collectAudioRef.current.play().catch(console.error);
      }

      // Increment score for collection
      setGameState((prev) => {
        const newScore = prev.score + 50;
        // Update personal best in real-time if new score exceeds it
        updatePersonalBest(newScore);
        return {
          ...prev,
          score: newScore, // More points for collectibles
        };
      });
    };

    window.addEventListener(
      "collectibleGathered",
      handleCollection as EventListener
    );
    return () =>
      window.removeEventListener(
        "collectibleGathered",
        handleCollection as EventListener
      );
  }, [audioState.isMuted, audioState.audioEnabled, updatePersonalBest]);

  // Enable audio and start game
  const handlePlay = useCallback(async () => {
    try {
      if (audioRef.current && !audioState.audioEnabled) {
        await audioRef.current.play();
        setAudioState((prev) => ({
          ...prev,
          isPlaying: true,
          audioEnabled: true,
        }));
      } else if (
        audioRef.current &&
        audioState.audioEnabled &&
        !audioState.isPlaying
      ) {
        await audioRef.current.play();
        setAudioState((prev) => ({ ...prev, isPlaying: true }));
      }
    } catch (error) {
      console.error("Failed to enable audio:", error);
    }

    // Reset ball before starting
    if (ballResetRef.current) {
      ballResetRef.current();
    }

    setGameState({
      state: GameState.PLAYING,
      ballPosition: 1.5,
      tunnelRotation: 0,
      targetRotation: 0,
      message: "",
      score: 0,
      jumps: 0,
    });
  }, [audioState.audioEnabled, audioState.isPlaying]);

  // Restart game with proper ball reset
  const handleRestart = useCallback(async () => {
    try {
      if (
        audioRef.current &&
        audioState.audioEnabled &&
        !audioState.isPlaying
      ) {
        await audioRef.current.play();
        setAudioState((prev) => ({ ...prev, isPlaying: true }));
      }
    } catch (error) {
      console.error("Failed to restart audio:", error);
    }

    // IMPORTANT: Reset ball first, then set game state
    if (ballResetRef.current) {
      ballResetRef.current();
    }

    // Small delay to ensure ball reset completes
    setTimeout(() => {
      setGameState({
        state: GameState.PLAYING,
        ballPosition: 1.5,
        tunnelRotation: 0,
        targetRotation: 0,
        message: "",
        score: 0,
        jumps: 0,
      });
    }, 50);
  }, [audioState.audioEnabled, audioState.isPlaying]);

  // Handle audio play/pause
  const toggleAudio = useCallback(async () => {
    if (audioRef.current) {
      if (audioState.isPlaying) {
        audioRef.current.pause();
        setAudioState((prev) => ({ ...prev, isPlaying: false }));
      } else {
        try {
          await audioRef.current.play();
          setAudioState((prev) => ({ ...prev, isPlaying: true }));
        } catch (error) {
          console.error("Failed to play audio:", error);
        }
      }
    }
  }, [audioState.isPlaying]);

  const toggleMute = useCallback(() => {
    setAudioState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    setAudioState((prev) => ({ ...prev, volume: newVolume }));
  }, []);

  const handleSfxVolumeChange = useCallback((newVolume: number) => {
    setAudioState((prev) => ({ ...prev, sfxVolume: newVolume }));
  }, []);

  // Modified controls to handle space bar for restarting
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        if (gameState.state === GameState.LOST) {
          handleRestart();
        } else if (gameState.state === GameState.MENU) {
          handlePlay();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState.state, handleRestart, handlePlay]);

  return (
    <>
      {/* Background Music */}
      <audio ref={audioRef} src="/milkyways.mp3" preload="auto" />

      {/* Bounce Sound Effect */}
      <audio ref={bounceAudioRef} src="/boing.mp3" preload="auto" />

      {/* Collection Sound Effect */}
      <audio ref={collectAudioRef} src="/boing.mp3" preload="auto" />

      <div className="w-full h-screen bg-black">
        <Canvas
          shadows
          camera={{ position: [0, 0, 0], fov: 75, near: 0.1, far: 100 }}
          style={{
            cursor: "none",
            filter:
              gameState.state === GameState.LOST
                ? "grayscale(1) brightness(0.4)"
                : "none",
          }}
          gl={{ antialias: false }}
        >
          <GameScene
            gameState={gameState}
            setGameState={setGameState}
            personalBest={personalBest}
            ballResetRef={ballResetRef}
          />
          <ScoreFeedbackSystem currentScore={gameState.score} />
        </Canvas>
      </div>

      {/* Main Menu Overlay */}
      {(gameState.state === GameState.MENU ||
        gameState.state === GameState.LOST) && (
        <MainMenu
          gameState={gameState}
          onPlay={handlePlay}
          onRestart={handleRestart}
          personalBest={personalBest}
        />
      )}

      {/* Audio Controls */}
      <div className="fixed bottom-4 right-4 flex items-center space-x-4 z-50">
        <button
          onClick={toggleMute}
          className="p-2 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          {audioState.isMuted ? "🔇" : "🔊"}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={audioState.volume}
          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          className="w-24"
        />
      </div>
    </>
  );
}
