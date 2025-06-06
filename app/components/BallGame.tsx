'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const BallGame = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [gameMessage, setGameMessage] = useState("");
  const gameRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    ball: THREE.Mesh;
    tunnel: THREE.Group;
    animationId: number;
    ballPosition: number;
  } | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Tunnel parameters
    const tunnelRadius = 4;
    const sides = 8;
    const segmentLength = 3; // Length of each platform segment
    const gapLength = 6; // Increased gap length to match ball trajectory
    
    // Dynamic tunnel generation parameters
    const segmentsAhead = 20; // Number of segments to keep ahead of the ball
    const segmentsBehind = 5; // Number of segments to keep behind the ball
    const totalActiveSegments = segmentsAhead + segmentsBehind;

    // Game state
    enum GameState {
      PLAYING,
      LOST,
      RESTARTING
    }
    
    let gameState = GameState.PLAYING;

    // Create ball
    const ballGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const ballMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xff6b35,
      shininess: 100 
    });
    const ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.castShadow = true;
    ball.position.set(0, -tunnelRadius + 0.6, 1.5); // Start at center of first platform (segmentLength/2)
    scene.add(ball);

    // Create octagonal tunnel with dynamic generation
    const tunnel = new THREE.Group();
    
    // Helper function to create a single segment
    const createSegment = (segmentIndex: number, isFirstSegment: boolean = false): THREE.Group => {
      const segmentGroup = new THREE.Group();
      const segmentZ = segmentIndex * (segmentLength + gapLength);
      segmentGroup.position.z = segmentZ;
      
      // For the first segment, always ensure there's a platform at the bottom
      if (isFirstSegment) {
        // Always place the first platform at the bottom of the tunnel
        const bottomAngle = Math.PI * 1.5; // Bottom of the octagonal tunnel (270 degrees)
        
        // Calculate position for the bottom platform
        const faceWidth = 2 * tunnelRadius * Math.sin(Math.PI / sides);
        
        // Create bottom platform
        const platformGeometry = new THREE.BoxGeometry(faceWidth, 0.2, segmentLength);
        const platformMaterial = new THREE.MeshPhongMaterial({ 
          color: 0x16213e,
          transparent: false,
          opacity: 1
        });
        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        
        // Position the platform at the bottom, slightly inward
        const inwardOffset = 0.1;
        const platformX = Math.cos(bottomAngle) * (tunnelRadius - inwardOffset);
        const platformY = Math.sin(bottomAngle) * (tunnelRadius - inwardOffset);
        platform.position.set(platformX, platformY, segmentLength / 2);
        
        // Rotate the platform to face inward toward the center
        platform.lookAt(0, 0, segmentLength / 2);
        platform.rotateX(Math.PI / 2);
        
        platform.receiveShadow = true;
        platform.castShadow = true;
        segmentGroup.add(platform);
        
        // Optionally add 1-2 more random platforms to the first segment
        const additionalPlatforms = Math.floor(Math.random() * 2); // 0-1 additional platforms
        
        if (additionalPlatforms > 0) {
          // Create an array of available face indices (excluding the bottom face)
          const availableFaces = Array.from({length: sides}, (_, i) => i).filter(face => {
            const angle = (face / sides) * Math.PI * 2;
            return Math.abs(angle - bottomAngle) > Math.PI / sides; // Don't overlap with bottom platform
          });
          
          // Shuffle available faces
          for (let j = availableFaces.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [availableFaces[j], availableFaces[k]] = [availableFaces[k], availableFaces[j]];
          }
          
          // Create additional platforms
          for (let p = 0; p < additionalPlatforms && p < availableFaces.length; p++) {
            const activeFace = availableFaces[p];
            const angle = (activeFace / sides) * Math.PI * 2;
            
            const additionalPlatformGeometry = new THREE.BoxGeometry(faceWidth, 0.2, segmentLength);
            const additionalPlatformMaterial = new THREE.MeshPhongMaterial({ 
              color: 0x16213e,
              transparent: false,
              opacity: 1
            });
            const additionalPlatform = new THREE.Mesh(additionalPlatformGeometry, additionalPlatformMaterial);
            
            const additionalPlatformX = Math.cos(angle) * (tunnelRadius - inwardOffset);
            const additionalPlatformY = Math.sin(angle) * (tunnelRadius - inwardOffset);
            additionalPlatform.position.set(additionalPlatformX, additionalPlatformY, segmentLength / 2);
            
            additionalPlatform.lookAt(0, 0, segmentLength / 2);
            additionalPlatform.rotateX(Math.PI / 2);
            
            additionalPlatform.receiveShadow = true;
            additionalPlatform.castShadow = true;
            segmentGroup.add(additionalPlatform);
          }
        }
      } else {
        // For all other segments, use random generation
        // Randomly choose how many platforms for this segment (1-3)
        const numPlatforms = Math.floor(Math.random() * 3) + 1;
        
        // Create an array of available face indices and shuffle them
        const availableFaces = Array.from({length: sides}, (_, i) => i);
        for (let j = availableFaces.length - 1; j > 0; j--) {
          const k = Math.floor(Math.random() * (j + 1));
          [availableFaces[j], availableFaces[k]] = [availableFaces[k], availableFaces[j]];
        }
        
        // Create the selected number of platforms
        for (let p = 0; p < numPlatforms; p++) {
          const activeFace = availableFaces[p];
          const angle = (activeFace / sides) * Math.PI * 2;
          
          // Calculate the width of each octagonal face
          const faceWidth = 2 * tunnelRadius * Math.sin(Math.PI / sides);
          
          // Create platform segment
          const platformGeometry = new THREE.BoxGeometry(faceWidth, 0.2, segmentLength);
          const platformMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x16213e,
            transparent: false,
            opacity: 1
          });
          const platform = new THREE.Mesh(platformGeometry, platformMaterial);
          
          // Position the platform relative to the segment
          const inwardOffset = 0.1;
          const platformX = Math.cos(angle) * (tunnelRadius - inwardOffset);
          const platformY = Math.sin(angle) * (tunnelRadius - inwardOffset);
          platform.position.set(platformX, platformY, segmentLength / 2);
          
          // Rotate the platform to face inward toward the center
          platform.lookAt(0, 0, segmentLength / 2);
          platform.rotateX(Math.PI / 2);
          
          platform.receiveShadow = true;
          platform.castShadow = true;
          segmentGroup.add(platform);
        }
      }
      
      // Add visual indicator rings at platform locations
      const ringGeometry = new THREE.TorusGeometry(tunnelRadius * 0.95, 0.05, 8, 16);
      const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff88,
        transparent: true,
        opacity: 0.3
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.z = 0; // Relative to segment
      segmentGroup.add(ring);
      
      return segmentGroup;
    };
    
    // Initialize with starting segments
    for (let i = 0; i < totalActiveSegments; i++) {
      const segment = createSegment(i, i === 0); // First segment gets special treatment
      tunnel.add(segment);
    }
    
    scene.add(tunnel);

    // Game state - Initialize ballPosition to match ball's starting position
    const firstPlatformCenter = 1.5; // segmentLength / 2 = 3 / 2 = 1.5
    let ballPosition = firstPlatformCenter;
    
    // Carefully calculated physics for perfect platform landing
    const gravity = -0.006; // Adjusted gravity
    const bounceSpeed = 0.24; // Adjusted bounce speed
    
    // Calculate bounce timing: time to reach peak and fall back
    // At peak: 0 = bounceSpeed + gravity * t_peak
    // t_peak = bounceSpeed / (-gravity) = 0.24 / 0.006 = 40 frames
    // Total bounce time = 2 * t_peak = 80 frames
    
    // Platform centers are at: 1.5, 10.5, 19.5, etc.
    // Distance between platform centers = segmentLength + gapLength = 3 + 6 = 9 units
    // Required ball speed = 9 units / 80 frames = 0.1125 units per frame
    const ballSpeed = 0.1125; // Synchronized with bounce timing
    
    let ballVelocityX = 0;
    let ballVelocityY = 0;
    const jumpForce = 0.08; // Keep for reference but not used anymore
    const dampening = 0.9; // Higher energy retention for smoother movement
    const ballRadius = 0.5;

    // Tunnel rotation state
    let tunnelRotationZ = 0;
    let targetRotationZ = 0;
    const rotationSpeed = 0.02; // Smooth rotation speed
    const rotationStep = Math.PI / 6; // 30 degrees per key press

    // Keyboard state
    const keys = {
      q: false,
      e: false,
      space: false
    };

    // Keyboard event handlers
    const handleKeyDown = (event: KeyboardEvent) => {
      switch(event.key.toLowerCase()) {
        case 'q':
          keys.q = true;
          break;
        case 'e':
          keys.e = true;
          break;
        case ' ':
          keys.space = true;
          if (gameState === GameState.LOST) {
            // Restart game
            gameState = GameState.PLAYING;
            ballPosition = firstPlatformCenter;
            ballVelocityX = 0;
            ballVelocityY = 0;
            ball.position.set(0, -tunnelRadius + 0.6, 1.5); // Restart on first platform
            tunnelRotationZ = 0;
            targetRotationZ = 0;
            setGameMessage("");
          }
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch(event.key.toLowerCase()) {
        case 'q':
          keys.q = false;
          break;
        case 'e':
          keys.e = false;
          break;
        case ' ':
          keys.space = false;
          break;
      }
    };

    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Helper function to check if ball is on a platform
    const checkPlatformCollision = (ballX: number, ballY: number, ballZ: number, tunnelRotation: number): { collision: false } | { collision: true, platformY: number } => {
      // Check all segments and find the one that contains the ball's current Z position
      for (let segmentIndex = 0; segmentIndex < tunnel.children.length; segmentIndex++) {
        const segmentGroup = tunnel.children[segmentIndex] as THREE.Group;
        if (!segmentGroup) continue;
        
        // Get the actual segment position (accounting for repositioning)
        const segmentZ = segmentGroup.position.z;
        const segmentStart = segmentZ;
        const segmentEnd = segmentZ + segmentLength;
        
        // Check if ball is within this platform segment
        if (ballZ >= segmentStart && ballZ <= segmentEnd) {
          // Check all platforms in this segment (excluding the ring which is the last child)
          for (let i = 0; i < segmentGroup.children.length - 1; i++) {
            const platform = segmentGroup.children[i] as THREE.Mesh;
            
            // Get platform's world position (accounting for segment repositioning)
            const platformWorldPos = new THREE.Vector3();
            platform.getWorldPosition(platformWorldPos);
            
            // Since ball is always at x=0, check if any platform is at the bottom
            // The bottom platform should be at approximately y = -tunnelRadius
            const isBottomPlatform = platformWorldPos.y < -tunnelRadius + 1; // Bottom of tunnel
            
            if (isBottomPlatform) {
              // Ball is colliding with the bottom platform
              if (ballY <= platformWorldPos.y + 0.7 && ballVelocityY < 0) {
                return {
                  collision: true,
                  platformY: platformWorldPos.y + 0.7 // Ball sits on top of platform
                };
              }
            }
          }
        }
      }
      
      return { collision: false };
    };

    // Helper function to check if ball has fallen too far (lose condition)
    const checkLoseCondition = (ballY: number) => {
      return ballY < -tunnelRadius - 3; // Ball fell too far below tunnel
    };

    // Animation loop
    const animate = () => {
      const animationId = requestAnimationFrame(animate);
      
      // Handle tunnel rotation input (only when playing)
      if (gameState === GameState.PLAYING) {
        if (keys.q) {
          targetRotationZ -= rotationStep * 0.1; // Continuous rotation while held
        }
        if (keys.e) {
          targetRotationZ += rotationStep * 0.1; // Continuous rotation while held
        }
        
        // Apply gravity
        ballVelocityY += gravity;
        
        // Update ball position with velocity (keep ball centered horizontally)
        const newX = 0; // Ball always stays centered horizontally
        const newY = ball.position.y + ballVelocityY;
        
        // Check for lose condition
        if (checkLoseCondition(newY)) {
          gameState = GameState.LOST;
          setGameMessage("Game Over! Press SPACE to restart");
        } else {
          // Check for collision
          const collision = checkPlatformCollision(newX, newY, ball.position.z, tunnelRotationZ);
          
          if (collision.collision) {
            // Calculate the exact platform center the ball should be at
            const distanceTraveled = ballPosition - firstPlatformCenter;
            const platformSpacing = segmentLength + gapLength; // 9 units
            const platformIndex = Math.round(distanceTraveled / platformSpacing);
            const exactPlatformCenter = firstPlatformCenter + (platformIndex * platformSpacing);
            
            // Snap ball to exact platform center
            ballPosition = exactPlatformCenter;
            ball.position.z = ballPosition;
            ball.position.y = collision.platformY;
            
            // Set constant bounce velocity for perfect trajectory
            ballVelocityX = 0; // No horizontal movement
            ballVelocityY = bounceSpeed; // Use calculated bounce speed for perfect arc
          } else {
            // No collision, update position normally (keep X centered)
            ball.position.x = 0; // Always stay centered
            ball.position.y = newY;
            
            // Move ball forward
            ballPosition += ballSpeed;
            ball.position.z = ballPosition;
          }
        }
      }
      
      // Smooth tunnel rotation interpolation (always active)
      const rotationDiff = targetRotationZ - tunnelRotationZ;
      tunnelRotationZ += rotationDiff * rotationSpeed;
      tunnel.rotation.z = tunnelRotationZ;
      
      // Camera follows ball along Z-axis but looks straight down the tunnel (centered)
      camera.position.set(0, 0, ballPosition - 8); // Camera centered at tunnel axis
      camera.lookAt(0, 0, ballPosition + 10); // Look straight ahead down the tunnel
      
      // Add some ball rotation for visual effect
      ball.rotation.x += 0.02;
      ball.rotation.y += 0.02;
      
      // Dynamic tunnel segment management
      const currentSegmentIndex = Math.floor(ballPosition / (segmentLength + gapLength));
      const minSegmentIndex = currentSegmentIndex - segmentsBehind;
      const maxSegmentIndex = currentSegmentIndex + segmentsAhead;
      
      // Remove segments that are too far behind
      tunnel.children = tunnel.children.filter((segment) => {
        const segmentGroup = segment as THREE.Group;
        const segmentIndex = Math.round(segmentGroup.position.z / (segmentLength + gapLength));
        
        if (segmentIndex < minSegmentIndex) {
          // Dispose of geometries and materials to free memory
          segmentGroup.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              if (object.material instanceof THREE.Material) {
                object.material.dispose();
              }
            }
          });
          return false; // Remove this segment
        }
        return true; // Keep this segment
      });
      
      // Add new segments that are needed ahead
      const existingSegmentIndices = new Set(
        tunnel.children.map(segment => {
          const segmentGroup = segment as THREE.Group;
          return Math.round(segmentGroup.position.z / (segmentLength + gapLength));
        })
      );
      
      for (let segmentIndex = minSegmentIndex; segmentIndex <= maxSegmentIndex; segmentIndex++) {
        if (!existingSegmentIndices.has(segmentIndex) && segmentIndex >= 0) {
          const newSegment = createSegment(segmentIndex, false); // Never first segment for new ones
          tunnel.add(newSegment);
        }
      }
      
      renderer.render(scene, camera);
      
      if (gameRef.current) {
        gameRef.current.animationId = animationId;
      }
    };

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Store references for cleanup
    gameRef.current = {
      scene,
      camera,
      renderer,
      ball,
      tunnel,
      animationId: 0,
      ballPosition
    };

    // Start animation
    animate();

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      
      if (gameRef.current) {
        cancelAnimationFrame(gameRef.current.animationId);
        
        if (mountRef.current && gameRef.current.renderer.domElement) {
          mountRef.current.removeChild(gameRef.current.renderer.domElement);
        }
        
        gameRef.current.renderer.dispose();
        
        // Dispose of geometries and materials
        gameRef.current.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            if (object.material instanceof THREE.Material) {
              object.material.dispose();
            } else if (Array.isArray(object.material)) {
              object.material.forEach((material) => material.dispose());
            }
          }
        });
      }
    };
  }, []);

  return (
    <>
      <div 
        ref={mountRef} 
        className="w-full h-screen overflow-hidden"
        style={{ cursor: 'none' }}
      />
      
      {/* Game UI Overlay */}
      <div className="absolute top-4 left-4 text-white font-mono text-lg z-10 pointer-events-none">
        <div className="bg-black bg-opacity-50 p-4 rounded">
          <p>Q/E: Rotate Tunnel</p>
          <p>Goal: Land on platforms!</p>
          {gameMessage && (
            <p className="mt-2 text-red-400 font-bold">{gameMessage}</p>
          )}
        </div>
      </div>
    </>
  );
};

export default BallGame; 